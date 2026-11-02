package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.DeadlockCounter;
import com.braja.fichaje.campaign.InvariantChecker;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.time.zone.ZoneOffsetTransition;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Event-driven simulation (S6-S8): for each simulated day it plans every persona's taps, the ADMINs' chaos and every
 * job instant on one timeline, moves the MutableClock to each instant (never backwards, except the epilogue on
 * purpose) and calls the real HTTP API and the real job beans. A day runs from 05:30Z to 05:30Z (02:30 in Buenos
 * Aires), so Santiago's night shift crosses the checkpoint while it is running. Once a week a 20-thread burst.
 */
final class SimulationDriver {
    record Result(List<String> summaries, Map<String, Long> totals, String s77, String s54, String epilogue, Duration elapsed) { }

    static final LocalTime DAY_BOUNDARY_UTC = LocalTime.of(5, 30);
    static final LocalTime BURST_LOCAL = LocalTime.of(10, 30);

    private final SimContext ctx;
    private final Map<Integer, EmployeeActor> actors = new LinkedHashMap<>();
    private final Set<Instant> dispatches = new HashSet<>();
    private WorldSetup setup;
    private AdminChaos chaos;
    private MaliciousActor malicious;
    private Checkpoint checkpoint;
    private String s77 = "not reached", s54 = "not reached";

    SimulationDriver(SimContext ctx) {
        this.ctx = ctx;
        ctx.admin = new AdminActor(ctx);
    }

    Result run() {
        long began = System.nanoTime();
        int days = ctx.settings.days();
        LocalDate lastDay = ctx.settings.date(days - 1);
        ctx.clock.set(Instant.parse("2027-02-26T13:00:00Z"));
        ctx.ledger.beginDay(-1, LocalDate.parse("2027-02-26"));
        long deadlocksAtSetupStart = DeadlockCounter.read();
        guardDaylightSavingChange();
        setup = new WorldSetup(ctx, actors);
        setup.build();
        setup.declareBlock(SimSettings.FIRST_DAY, min(AdminChaos.BLOCK_TWO.minusDays(1), lastDay), false);
        chaos = new AdminChaos(ctx, setup);
        EmployeeActor insider = actors.get(WorldSetup.MALICIOUS);
        malicious = new MaliciousActor(ctx, insider);
        checkpoint = new Checkpoint(ctx, insider.employee.browser().actor(), deadlocksAtSetupStart);
        checkpoint.close("setup");

        for (int day = 0; day < days; day++) {
            LocalDate date = ctx.settings.date(day);
            moveTo(date.atTime(DAY_BOUNDARY_UTC).toInstant(ZoneOffset.UTC));
            ctx.ledger.beginDay(day, date);
            checkpoint.dayBegins();
            plan(day, date, lastDay);
            runUntil(date.plusDays(1).atTime(DAY_BOUNDARY_UTC).toInstant(ZoneOffset.UTC));
            if (day == AdminChaos.REACTIVATION_DAY) s77 = pinReactivationBacklog();
            if (day == AdminChaos.PAST_DECLARATION_DAY) s54 = pinPastDeclaration();
            checkpoint.close("day " + (day + 1));
        }
        ctx.ledger.beginDay(days, lastDay.plusDays(1));
        checkpoint.dayBegins();
        Instant tail = ctx.timeline.last();
        runUntil(tail == null ? ctx.now() : tail);
        moveTo(ctx.now().plus(Duration.ofMinutes(1)));
        checkpoint.close("the tail after the last day");
        String epilogue = new Epilogue(ctx).run();
        return new Result(ctx.ledger.summaries(), ctx.ledger.totals(), s77, s54, epilogue, Duration.ofNanos(System.nanoTime() - began));
    }

    private void plan(int day, LocalDate date, LocalDate lastDay) {
        Instant dayStart = date.atTime(DAY_BOUNDARY_UTC).toInstant(ZoneOffset.UTC);
        Instant burstAt = day % 7 == 2 ? date.atTime(BURST_LOCAL).atZone(SimWorld.BUENOS_AIRES).toInstant() : null;
        List<Burst.Entry> burst = new ArrayList<>();
        for (SimWorld.Jornada jornada : ctx.world.liveOn(date)) {
            EmployeeActor actor = actors.get(jornada.employee.index);
            for (DayPlanner.Tap tap : DayPlanner.plan(ctx.seed(), jornada, burstAt)) {
                if (tap.at().equals(burstAt)) burst.add(new Burst.Entry(actor, jornada, tap));
                else ctx.at(tap.at(), actor.tag(), "tap " + tap.action() + " " + tap.style(), () -> actor.tap(jornada, tap));
            }
            Instant startDue = jornada.start.plus(Duration.ofMinutes(jornada.tolerance)).plus(1, ChronoUnit.MICROS);
            Instant endDue = jornada.end.plus(Duration.ofMinutes(jornada.tolerance)).plus(1, ChronoUnit.MICROS);
            ctx.at(startDue, "job", "absence due " + jornada.tag(), ctx.jobs::absences);
            ctx.at(endDue, "job", "missing egress due " + jornada.tag(), ctx.jobs::absences);
        }
        if (burstAt != null) ctx.at(burstAt, "burst", burst.size() + " taps at once", () -> new Burst(ctx).run(burst));
        for (Instant tick = dayStart.plus(Duration.ofMinutes(15)); tick.isBefore(dayStart.plus(Duration.ofDays(1))); tick = tick.plus(Duration.ofMinutes(30))) {
            ctx.at(tick, "job", "absence tick", ctx.jobs::absences);
        }
        ctx.at(date.atTime(3, 0).atZone(SimWorld.BUENOS_AIRES).toInstant(), "job", "privacy purge", () -> {
            ctx.jobs.purge();
            new InvariantChecker(ctx.jdbc).afterRetention(ctx.now()).forEach(v -> ctx.ledger.violation("job", v));
        });
        if (day % 3 == 0) {
            Instant night = date.atTime(3, 0).atZone(SimWorld.BUENOS_AIRES).toInstant();
            ctx.at(night, "attacker", "brute force on the victim's DNI", malicious::bruteForce);
            if (day % 6 == 0) {
                ctx.at(night.plus(Duration.ofMinutes(5)), "victim", "login while locked", () -> malicious.victimLogsIn(true));
                ctx.at(night.plus(Duration.ofMinutes(20)), "victim", "login after the lock", () -> malicious.victimLogsIn(false));
            }
        }
        ctx.at(date.atTime(13, 0).atZone(SimWorld.BUENOS_AIRES).toInstant(), "insider", "probe", () -> malicious.probe(day, date));
        for (EmployeeActor actor : actors.values()) {
            for (SimWorld.Company company : actor.employee.memberships.keySet()) {
                ctx.at(date.atTime(23, 0).atZone(company.zone).toInstant(), actor.tag(), "motives in " + company.name, () -> actor.motives(company));
            }
        }
        chaos.planDay(day, date, lastDay);
    }

    private void runUntil(Instant limit) {
        Timeline.Event event;
        while ((event = ctx.timeline.pollUntil(limit)) != null) {
            if (event.at().isAfter(ctx.now())) ctx.clock.set(event.at());
            else if (event.at().isBefore(ctx.now())) ctx.ledger.count("event ran after its instant");
            long began = System.nanoTime();
            try {
                event.action().run();
            } catch (RuntimeException | AssertionError ex) {
                ctx.ledger.violation(event.actor(), "event '" + event.label() + "' threw " + ex);
            }
            ctx.ledger.profile(event.label().split(" ")[0], System.nanoTime() - began);
            long dueBegan = System.nanoTime();
            Instant due = ctx.jobs.nextDispatchDue();
            ctx.ledger.profile("(dispatch query)", System.nanoTime() - dueBegan);
            if (due != null) {
                Instant at = due.isAfter(ctx.now()) ? due : ctx.now();
                if (dispatches.add(at)) ctx.at(at, "job", "dispatch", ctx.jobs::dispatch);
            }
        }
        moveTo(limit);
    }

    private void moveTo(Instant instant) {
        if (instant.isAfter(ctx.now())) ctx.clock.set(instant);
    }

    /** S77 (CHAR): the reactivation tick creates the backlog of the inactive days at once; the model predicts how many. */
    private String pinReactivationBacklog() {
        SimWorld.Employee rocio = ctx.world.employees.get(WorldSetup.DEACTIVATED);
        Instant from = chaos.deactivatedAt(), to = chaos.reactivatedAt();
        if (from == null || to == null) return "not reached";
        int sinIngreso = 0, missing = 0;
        for (SimWorld.Jornada jornada : ctx.world.jornadas.values()) {
            if (jornada.employee != rocio || jornada.cancelled) continue;
            List<String> actions = ctx.jornada(jornada.id).validActions();
            Instant absenceDue = jornada.start.plus(Duration.ofMinutes(jornada.tolerance)), egressDue = jornada.end.plus(Duration.ofMinutes(jornada.tolerance));
            if (!actions.contains("INGRESO") && absenceDue.isAfter(from) && absenceDue.isBefore(to)) sinIngreso++;
            if (actions.contains("INGRESO") && !actions.contains("EGRESO") && egressDue.isAfter(from) && egressDue.isBefore(to)) missing++;
        }
        UUID employeeId = rocio.memberships.values().iterator().next().employeeId;
        int created = ctx.count("SELECT COUNT(*) FROM deviations WHERE employee_id=? AND created_at=? AND type IN ('SIN_INGRESO','MARCA_FALTANTE')",
                employeeId.toString(), Timestamp.from(to));
        int pushes = ctx.count("SELECT COUNT(*) FROM notification_outbox_events e JOIN deviations d ON d.id=e.deviation_id WHERE d.employee_id=? AND d.created_at=?",
                employeeId.toString(), Timestamp.from(to));
        String pin = "S77 CHAR: reactivation at " + to + " created " + created + " deviations at once (model: " + sinIngreso + " SIN_INGRESO + "
                + missing + " MARCA_FALTANTE of the inactive days), " + pushes + " of them queued for push";
        ctx.ledger.note("S77", pin);
        ctx.ledger.count("S77 reactivation backlog", created);
        if (created != sinIngreso + missing) ctx.ledger.violation(rocio.tag(), pin);
        return pin;
    }

    /** S54 (CHAR): a jornada declared for a past date gets SIN_INGRESO on the next tick and queues a push. */
    private String pinPastDeclaration() {
        SimWorld.Jornada past = chaos.pastDeclared();
        if (past == null) return "not reached";
        int absences = ctx.count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO'", past.id.toString());
        int pushes = ctx.count("SELECT COUNT(*) FROM notification_outbox_events e JOIN deviations d ON d.id=e.deviation_id WHERE d.jornada_id=?", past.id.toString());
        String pin = "S54 CHAR: the jornada declared on " + ctx.ledger.date() + " for " + past.date + " got " + absences + " SIN_INGRESO and " + pushes + " push event(s)";
        ctx.ledger.note("S54", pin);
        if (absences != 1 || pushes != 1) ctx.ledger.violation("admin:Braja", pin);
        return pin;
    }

    /** The window must contain Chile's fall-back, or the night shift across it would test nothing (tzdata guard). */
    private void guardDaylightSavingChange() {
        ZoneOffsetTransition transition = SimWorld.SANTIAGO.getRules().nextTransition(Instant.parse("2027-03-01T00:00:00Z"));
        if (transition == null || !transition.getInstant().equals(Instant.parse("2027-04-04T03:00:00Z")) || !transition.isOverlap()) {
            throw new IllegalStateException("tzdata changed: America/Santiago no longer falls back on 2027-04-04 (" + transition + ")");
        }
    }

    private static LocalDate min(LocalDate a, LocalDate b) {
        return a.isBefore(b) ? a : b;
    }
}
