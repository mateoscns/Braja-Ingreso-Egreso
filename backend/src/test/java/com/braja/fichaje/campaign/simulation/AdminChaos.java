package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.FakeWebPushGateway;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.SplittableRandom;

/**
 * The ADMINs' day (S6 "cambios inoportunos"): yesterday's forgotten marks and corrections, edits of templates and
 * tolerances while jornadas run, one-off template replacements (cancel and declare again), the Mendoza center on day
 * 30 and Santiago's move on day 60, a deactivation on day 45 and reactivation on day 52 (S77), password resets,
 * invalid voids and cancellations, push provider failures, and the 18:00 inbox review. Everything is keyed by day.
 */
final class AdminChaos {
    static final int MENDOZA_CENTER_DAY = 30, SANTIAGO_MOVE_DAY = 60, DEACTIVATION_DAY = 45, REACTIVATION_DAY = 52;
    static final int BLOCK_TWO_DAY = 24, BLOCK_THREE_DAY = 52, PAST_DECLARATION_DAY = 10;
    static final LocalDate BLOCK_TWO = LocalDate.parse("2027-04-01"), BLOCK_THREE = LocalDate.parse("2027-04-29");
    private static final List<Integer> BRAJA_RESETS = List.of(1, 2, 3, 5, 6, 7, 8, 10, 11, 12, 14);
    private static final List<Integer> ANDES_RESETS = List.of(15, 16, 18);
    private static final List<String> EDITABLE = List.of("BA-M", "MZA-I", "SCL-T", "BA-T", "MZA-M", "SCL-N");

    private final SimContext ctx;
    private final WorldSetup setup;
    private Instant deactivatedAt, reactivatedAt;
    private SimWorld.Jornada pastDeclared;

    AdminChaos(SimContext ctx, WorldSetup setup) {
        this.ctx = ctx;
        this.setup = setup;
    }

    Instant deactivatedAt() { return deactivatedAt; }

    Instant reactivatedAt() { return reactivatedAt; }

    SimWorld.Jornada pastDeclared() { return pastDeclared; }

    void planDay(int day, LocalDate date, LocalDate lastDay) {
        SimWorld world = ctx.world;
        SimWorld.Company braja = world.companies.get(0), andes = world.companies.get(1);
        SimWorld.Employee rocio = world.employees.get(WorldSetup.DEACTIVATED);
        for (SimWorld.Company company : world.companies) {
            at(company, date, "08:00", "forgotten marks of yesterday", () -> fixForgotten(company, date.minusDays(1)));
            at(company, date, "08:30", "push subscription check", () -> { if (!ctx.admin.stillSubscribed(company)) ctx.admin.subscribe(company); });
            at(company, date, "09:00", "camera corrections of yesterday", () -> correctLateArrivals(company, date.minusDays(1)));
            at(company, date, "18:00", "inbox review", () -> ctx.admin.review(company));
        }
        at(braja, date, "12:30", "jornada list", () -> listCheck(world.site("BA"), date));
        at(braja, date, "18:30", "absent day off", () -> dayOff(world.employees.get(2), world.site("BA"), date));

        if (day == MENDOZA_CENTER_DAY) {
            SimWorld.Site mendoza = world.site("MZA");
            at(braja, date, "09:00", "Mendoza center", () -> ctx.admin.siteCenter(mendoza, new SimWorld.Center(mendoza.shopLatitude, mendoza.shopLongitude, 150)));
        }
        if (day == SANTIAGO_MOVE_DAY) {
            SimWorld.Site santiago = world.site("SCL");
            at(andes, date, "06:00", "Santiago shop moves 2 km", () -> {
                santiago.shopLatitude = -33.4372;
                santiago.shopLongitude = -70.6506;
                ctx.admin.siteCenter(santiago, new SimWorld.Center(santiago.shopLatitude, santiago.shopLongitude, 120));
            });
        }
        if (day == BLOCK_TWO_DAY && !BLOCK_TWO.isAfter(lastDay)) {
            at(braja, date, "10:00", "declare block two", () -> setup.declareBlock(BLOCK_TWO, min(BLOCK_THREE.minusDays(1), lastDay), true));
        }
        if (day == BLOCK_THREE_DAY && !BLOCK_THREE.isAfter(lastDay)) {
            LocalDate to = min(SimSettings.FIRST_DAY.plusDays(SimSettings.MAX_DAYS - 1), lastDay);
            // Rocío is still inactive at 10:00: the Santiago lot that includes her is rejected whole, then retried without her.
            at(braja, date, "10:00", "declare block three", () -> {
                setup.declareBlock(BLOCK_THREE, to, false);
                setup.bulkSite(world.site("SCL"), BLOCK_THREE, to, employee -> employee != rocio);
            });
            at(andes, date, "12:05", "declare block three for the reactivated", () -> setup.bulkSite(world.site("SCL"), BLOCK_THREE, to, employee -> employee == rocio));
        }
        if (day == DEACTIVATION_DAY) at(andes, date, "12:00", "deactivate " + rocio.tag(), () -> {
            ctx.admin.active(rocio, andes, false);
            deactivatedAt = ctx.now();
        });
        if (day == REACTIVATION_DAY) {
            at(andes, date, "12:00", "reactivate " + rocio.tag(), () -> {
                ctx.admin.active(rocio, andes, true);
                reactivatedAt = ctx.now();
                ctx.jobs.absences();
            });
        }
        if (day == REACTIVATION_DAY + 1) at(andes, date, "09:00", "cancel the backlog of the inactive days", () -> cancelBacklog(rocio, date));
        if (day == PAST_DECLARATION_DAY) {
            at(braja, date, "11:00", "declare a past date by mistake (S54)", () -> {
                pastDeclared = ctx.admin.declare(world.employees.get(13), world.site("BA"), date.minusDays(3), world.template("BA-C"));
                ctx.ledger.count("S54 past-date declarations");
            });
            at(braja, date.plusDays(1), "11:00", "cancel the past-date jornada", () -> { if (pastDeclared != null) ctx.admin.cancel(pastDeclared, "Declared by mistake"); });
        }
        if (day == 20) at(braja, date, "11:00", "move a template in use", () -> ctx.admin.moveTemplate(world.template("BA-M"), world.site("MZA")));
        if (day == 33) at(braja, date, "11:00", "reset a shared account", () -> ctx.admin.resetPassword(world.employees.get(WorldSetup.SHARED), braja));
        if (day % 10 == 5) {
            int index = BRAJA_RESETS.get((day / 10) % BRAJA_RESETS.size());
            at(braja, date, "11:00", "password reset", () -> ctx.admin.resetPassword(world.employees.get(index), braja));
        }
        if (day % 20 == 15) {
            int index = ANDES_RESETS.get((day / 20) % ANDES_RESETS.size());
            at(andes, date, "11:00", "password reset", () -> ctx.admin.resetPassword(world.employees.get(index), andes));
        }
        if (day % 14 == 3) at(braja, date, "11:10", "edit a template with jornadas running", () -> editTemplate(day));
        if (day % 14 == 10) at(braja, date, "11:10", "edit a tolerance with jornadas running", () -> editTolerance(day));
        if (day % 7 == 4) at(braja, date, "11:20", "one-off template replacement", () -> replace(world.site("BA"), date.plusDays(2), day));
        if (day % 7 == 5) {
            at(andes, date, "11:20", "one-off template replacement", () -> replace(world.site("SCL"), date.plusDays(2), day));
            at(braja, date, "11:30", "invalid voids", () -> invalidVoids(date));
        }
        if (day % 7 == 6) at(braja, date, "11:30", "cancel a jornada with marks", () -> cancelWithMarks(date));
        if (day % 9 == 4 && day % 7 != 2) at(braja, date, "07:00", "push provider answers 500 once", () -> ctx.push.program(FakeWebPushGateway.Outcome.status(500)));
        if (day == 22) at(braja, date, "07:00", "push provider times out once", () -> ctx.push.program(FakeWebPushGateway.Outcome.transportFailure()));
        if (day == 40) at(braja, date, "07:00", "push provider answers 410 (subscription gone)", () -> ctx.push.program(FakeWebPushGateway.Outcome.status(410)));
    }

    /** Yesterday's jornadas with INGRESO and no EGRESO: the forgetful one always, anyone else 30%; closes an open pause first. */
    private void fixForgotten(SimWorld.Company company, LocalDate day) {
        for (SimWorld.Jornada jornada : ctx.world.liveOn(day)) {
            if (jornada.site.company != company || !jornada.employee.membership(jornada.site).active) continue;
            SimContext.DbJornada stored = ctx.jornada(jornada.id);
            List<String> actions = stored.validActions();
            if (!actions.contains("INGRESO") || actions.contains("EGRESO")) continue;
            boolean forgetful = jornada.employee.persona == Persona.FORGETFUL;
            if (!forgetful && !Seeds.chance(ctx.seed(), 0.3, "forgotten", jornada.employee.index, day)) continue;
            SplittableRandom random = Seeds.random(ctx.seed(), "forgotten-at", jornada.employee.index, day);
            Instant last = stored.valid().getLast().occurredAt();
            String open = MarkRules.openPause(actions);
            if (open != null) {
                last = last.plus(Duration.ofMinutes(15));
                ctx.admin.forgotten(jornada, "VUELTA_" + open, last);
            }
            Instant egress = jornada.end.plus(Duration.ofMinutes(Seeds.between(random, -10, 25)));
            ctx.admin.forgotten(jornada, "EGRESO", egress.isAfter(last) ? egress : last.plus(Duration.ofMinutes(1)));
        }
    }

    /** The late persona's INGRESO checked against the camera: moved back to within the tolerance 30% of the time. */
    private void correctLateArrivals(SimWorld.Company company, LocalDate day) {
        for (SimWorld.Jornada jornada : ctx.world.liveOn(day)) {
            if (jornada.site.company != company || jornada.employee.persona != Persona.LATE) continue;
            if (!Seeds.chance(ctx.seed(), 0.3, "correct", jornada.employee.index, day)) continue;
            List<SimContext.DbMark> valid = ctx.jornada(jornada.id).valid();
            if (valid.isEmpty() || !"INGRESO".equals(valid.getFirst().action())) continue;
            if (!valid.getFirst().occurredAt().isAfter(jornada.start.plus(Duration.ofMinutes(jornada.tolerance)))) continue;
            Instant corrected = jornada.start.plus(Duration.ofMinutes(jornada.tolerance)).minus(Duration.ofMinutes(Seeds.between(Seeds.random(ctx.seed(), "correct-at", jornada.employee.index, day), 0, 5)));
            ctx.admin.correct(jornada, valid.getFirst().id(), corrected);
        }
    }

    private void dayOff(SimWorld.Employee employee, SimWorld.Site site, LocalDate date) {
        SimWorld.Jornada jornada = ctx.world.live(employee, site, date);
        if (jornada == null || !ctx.jornada(jornada.id).valid().isEmpty() || !Seeds.chance(ctx.seed(), 0.4, "day-off", date)) return;
        ctx.admin.cancel(jornada, "Day off agreed by phone");
    }

    private void listCheck(SimWorld.Site site, LocalDate date) {
        var response = site.company.admin().get("/api/v1/jornadas?from=" + date + "&to=" + date + "&siteId=" + site.id);
        if (!"200".equals(ctx.ledger.expect("admin:" + site.company.name, "admin.jornada-list", response, "200"))) return;
        long live = 0;
        for (var item : response.body()) if (!"CANCELADA".equals(item.get("state").asText())) live++;
        long expected = ctx.world.liveOn(date).stream().filter(jornada -> jornada.site == site).count();
        if (live != expected) ctx.ledger.violation("admin:" + site.company.name, "GET /jornadas lists " + live + " live jornadas at " + site.code + " but the model has " + expected);
    }

    private void editTemplate(int day) {
        SimWorld.Template template = ctx.world.template(EDITABLE.get((day / 14) % EDITABLE.size()));
        SimWorld.Version old = template.version;
        boolean shift = (day / 14) % 2 == 1 && !template.code.endsWith("-N");
        List<com.braja.fichaje.campaign.Fixture.Block> blocks = old.blocks().stream().map(block -> shift
                ? new com.braja.fichaje.campaign.Fixture.Block(block.startDayOffset(), block.start().plusMinutes(30), block.end().plusMinutes(30), block.endDayOffset())
                : block).toList();
        int breakfast = shift ? old.breakfastLimit() : Math.min(30, old.breakfastLimit() + 5);
        ctx.admin.editTemplate(template, new SimWorld.Version(old.name(), blocks, breakfast, old.lunchLimit()));
    }

    private void editTolerance(int day) {
        SimWorld.Employee employee = ctx.world.employees.get(BRAJA_RESETS.get((day / 14) % BRAJA_RESETS.size()));
        SimWorld.Company braja = ctx.world.companies.get(0);
        int current = employee.memberships.get(braja).tolerance;
        ctx.admin.tolerance(employee, braja, current >= 15 ? 5 : current + 5);
    }

    /** A future jornada without marks gets another template for that one date: cancel it and declare again. */
    private void replace(SimWorld.Site site, LocalDate date, int day) {
        List<SimWorld.Jornada> candidates = ctx.world.liveOn(date).stream().filter(jornada -> jornada.site == site
                && !jornada.template.code.endsWith("-N") && jornada.employee.membership(site).active).toList();
        if (candidates.isEmpty()) return;
        SimWorld.Jornada jornada = candidates.get(Seeds.random(ctx.seed(), "replace", site.code, day).nextInt(candidates.size()));
        List<String> rotation = site.code.equals("BA") ? WorldSetup.BA_ROTATION : WorldSetup.SCL_ROTATION;
        SimWorld.Template other = ctx.world.template(rotation.get((rotation.indexOf(jornada.template.code) + 1) % rotation.size()));
        if (ctx.admin.cancel(jornada, "Holiday eve schedule")) ctx.admin.declare(jornada.employee, site, date, other);
    }

    private void invalidVoids(LocalDate date) {
        for (SimWorld.Jornada jornada : ctx.world.liveOn(date)) {
            List<SimContext.DbMark> valid = ctx.jornada(jornada.id).valid();
            if (jornada.site.company == ctx.world.companies.get(0) && valid.size() >= 2 && "INGRESO".equals(valid.getFirst().action())) {
                ctx.admin.voidMark(jornada, valid.getFirst().id(), "Trying to void the INGRESO of a busy jornada");
                break;
            }
        }
        Integer voided = ctx.jdbc.query("SELECT COUNT(*) FROM mark_events WHERE voided_at IS NOT NULL", rs -> rs.next() ? rs.getInt(1) : 0);
        if (voided != null && voided > 0) {
            String id = ctx.jdbc.queryForObject("SELECT m.id FROM mark_events m JOIN jornadas j ON j.id = m.jornada_id WHERE m.voided_at IS NOT NULL"
                    + " AND j.company_id = ? ORDER BY m.voided_at, m.sequence_number LIMIT 1", String.class, ctx.world.companies.get(0).id().toString());
            String jornadaId = ctx.jdbc.queryForObject("SELECT jornada_id FROM mark_events WHERE id = ?", String.class, id);
            ctx.admin.voidMark(ctx.world.jornadas.get(java.util.UUID.fromString(jornadaId)), java.util.UUID.fromString(id), "Void it again");
        }
    }

    private void cancelWithMarks(LocalDate date) {
        for (SimWorld.Jornada jornada : ctx.world.liveOn(date)) {
            if (jornada.site.company == ctx.world.companies.get(0) && !ctx.jornada(jornada.id).valid().isEmpty()) {
                ctx.admin.cancel(jornada, "Wrong day");
                return;
            }
        }
    }

    /** Day 53: the jornadas of the inactive days that only hold the reactivation backlog are cancelled (retracts it). */
    private void cancelBacklog(SimWorld.Employee employee, LocalDate today) {
        SimWorld.Site site = ctx.world.site("SCL");
        for (LocalDate day = SimSettings.FIRST_DAY.plusDays(DEACTIVATION_DAY); day.isBefore(today.minusDays(1)); day = day.plusDays(1)) {
            SimWorld.Jornada jornada = ctx.world.live(employee, site, day);
            if (jornada != null && ctx.jornada(jornada.id).valid().isEmpty()) ctx.admin.cancel(jornada, "Employee was inactive that day");
        }
    }

    private void at(SimWorld.Company company, LocalDate date, String localTime, String label, Runnable action) {
        Instant at = date.atTime(LocalTime.parse(localTime)).atZone(company.zone).toInstant();
        ctx.at(at, "admin:" + company.name, label, action);
    }

    private static LocalDate min(LocalDate a, LocalDate b) {
        return a.isBefore(b) ? a : b;
    }
}
