package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.DeadlockCounter;
import com.braja.fichaje.campaign.FakeWebPushGateway;
import com.braja.fichaje.campaign.HttpLog;
import com.braja.fichaje.campaign.InvariantChecker;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * The end of a simulated day (S6): the jobs catch up at that instant, then every InvariantChecker check that applies,
 * the oracle (I3, I5, I6, CA3), no 5xx and no 4xx without code except the two known defects (I11), the day's log and
 * its summary line. Throws with seed, day and persona on the first day that has a violation.
 * I14: the InnoDB lock_deadlocks counter is read when the day begins and again here; a deadlock is tolerated only while
 * the day's retried 409 RETRYABLE_TRANSACTION_CONFLICT answers (the known S64 defect, a @KnownDefect of
 * LockOrderSpecTest) cover it, and is then reported in the timing part of the summary; any other deadlock is a violation.
 */
final class Checkpoint {
    private final SimContext ctx;
    private final String insiderTag;
    private long deadlocksAtDayStart;

    /** @param deadlocksAtSetupStart the counter read when the setup day began, before the world was built */
    Checkpoint(SimContext ctx, String insiderTag, long deadlocksAtSetupStart) {
        this.ctx = ctx;
        this.insiderTag = insiderTag;
        this.deadlocksAtDayStart = deadlocksAtSetupStart;
    }

    /** Reads the deadlock counter at the start of a simulated day; called right after the ledger begins the day. */
    void dayBegins() {
        deadlocksAtDayStart = DeadlockCounter.read();
    }

    String close(String label) {
        Instant now = ctx.now();
        long began = System.nanoTime();
        ctx.jobs.locationExpiry();
        ctx.jobs.absences();
        ctx.jobs.dispatch();
        InvariantChecker invariants = new InvariantChecker(ctx.jdbc);
        invariants.always().forEach(v -> ctx.ledger.violation("invariants", v));
        invariants.afterLocationExpiry(now).forEach(v -> ctx.ledger.violation("invariants", v));
        invariants.afterDispatch(now).forEach(v -> ctx.ledger.violation("invariants", v));
        Map<String, Long> active = new TreeMap<>();
        new OracleCheck(ctx.jdbc, ctx.json, ctx.world).check(now, active).forEach(v -> ctx.ledger.violation(actorOf(v), v));
        httpChecks(ctx.http);
        countPushes(ctx.push);
        deadlocks();

        Map<String, Object> database = new LinkedHashMap<>();
        database.put("jornadas", ctx.count("SELECT COUNT(*) FROM jornadas"));
        database.put("cancelled", ctx.count("SELECT COUNT(*) FROM jornadas WHERE state='CANCELADA'"));
        database.put("marks", ctx.count("SELECT COUNT(*) FROM mark_events"));
        database.put("voided", ctx.count("SELECT COUNT(*) FROM mark_events WHERE voided_at IS NOT NULL"));
        database.put("deviationRows", ctx.count("SELECT COUNT(*) FROM deviations"));
        database.put("active", active);
        database.put("outboxEvents", ctx.count("SELECT COUNT(*) FROM notification_outbox_events"));
        database.put("windowsSent", ctx.count("SELECT COUNT(*) FROM notification_windows WHERE status='SENT'"));
        database.put("salud", ctx.count("SELECT COUNT(*) FROM deviations WHERE motive_category='SALUD'"));
        ctx.ledger.profile("checkpoint", System.nanoTime() - began);
        String line = ctx.ledger.closeDay(ctx.http, database);
        ctx.http.clear();
        List<String> violations = ctx.ledger.violations();
        if (!violations.isEmpty()) {
            throw new AssertionError(violations.size() + " violation(s) on " + label + "; first: " + violations.getFirst()
                    + System.lineSeparator() + "log: " + ctx.ledger.dir().resolve(String.format("day-%02d.log", ctx.ledger.dayIndex() + 1)).toAbsolutePath()
                    + System.lineSeparator() + String.join(System.lineSeparator(), violations.subList(0, Math.min(20, violations.size()))));
        }
        return line;
    }

    private void httpChecks(HttpLog http) {
        for (HttpLog.Exchange exchange : http.serverErrors()) ctx.ledger.violation(exchange.actor(), "I11 server error " + exchange + " " + exchange.body());
        for (HttpLog.Exchange exchange : http.problemsWithoutCode()) {
            if (MaliciousActor.knownUncoded(exchange, insiderTag)) ctx.ledger.count("I11 known uncoded 400 (S23/S28)");
            else ctx.ledger.violation(exchange.actor(), "I11 4xx without code " + exchange + " " + exchange.body());
        }
    }

    /** I14 at the end of the day, after the catch-up jobs ran. */
    private void deadlocks() {
        long delta = DeadlockCounter.read() - deadlocksAtDayStart;
        if (delta == 0) return;
        long retried = ctx.ledger.retriedConflicts();
        if (retried >= delta) ctx.ledger.timing("I14 deadlocks covered by retried 409 RETRYABLE (S64)", delta);
        else ctx.ledger.violation("deadlock", "I14 InnoDB lock_deadlocks moved by " + delta + " but only " + retried
                + " 409 RETRYABLE_TRANSACTION_CONFLICT answers were retried today: a deadlock was absorbed without reaching a client");
    }

    /** Deliveries by provider answer; the fake is reset so a programmed failure never leaks into the next day. */
    private void countPushes(FakeWebPushGateway push) {
        for (FakeWebPushGateway.Delivery delivery : push.deliveries()) ctx.ledger.count("push delivery " + delivery.status());
        push.reset();
    }

    private static String actorOf(String violation) {
        int space = violation.indexOf(' '), colon = violation.indexOf(':');
        return space > 0 && colon > space ? violation.substring(space + 1, colon) : "oracle";
    }
}
