package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.notifications.NotificationOutboxDispatcher;
import com.braja.fichaje.security.PrivacyRetentionScheduler;
import com.braja.fichaje.timekeeping.MarkScheduler;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;

/**
 * The real job beans, run at the instants the schedule would run them (scheduling is off in the campaign). The
 * absence job takes at most 200 candidates per run (S76), so {@link #absences} repeats it at the same instant until a
 * run changes nothing, and counts how many runs that took. A job that throws is a violation: jobs swallow their
 * per-candidate failures, so anything escaping is the job itself breaking.
 */
final class SimJobs {
    private final MarkScheduler marks;
    private final NotificationOutboxDispatcher dispatcher;
    private final PrivacyRetentionScheduler privacy;
    private final JdbcTemplate jdbc;
    private final DayLedger ledger;

    SimJobs(MarkScheduler marks, NotificationOutboxDispatcher dispatcher, PrivacyRetentionScheduler privacy, JdbcTemplate jdbc, DayLedger ledger) {
        this.marks = marks;
        this.dispatcher = dispatcher;
        this.privacy = privacy;
        this.jdbc = jdbc;
        this.ledger = ledger;
    }

    void absences() {
        for (int run = 1; run <= 20; run++) {
            long before = deviationChanges();
            if (!run("absence", marks::createDueAbsences)) return;
            if (deviationChanges() == before) {
                if (run > 2) ledger.count("job.absence runs to drain " + run);
                return;
            }
        }
        ledger.violation("job", "the absence job still changed deviations after 20 runs at the same instant");
    }

    /** One run, as a racing tick inside a burst. */
    void absencesOnce() {
        run("absence", marks::createDueAbsences);
    }

    void locationExpiry() {
        run("location-expiry", marks::resolveLocationTimeouts);
    }

    void dispatch() {
        run("dispatch", dispatcher::dispatchDueWindows);
    }

    void purge() {
        run("purge", privacy::purgeSensitiveData);
    }

    /** When the dispatcher next has work (the predicate it claims with), or null. */
    Instant nextDispatchDue() {
        Timestamp due = jdbc.queryForObject("""
                SELECT MIN(CASE WHEN status = 'LEASED' THEN lease_until ELSE GREATEST(window_ends_at, next_attempt_at) END)
                FROM notification_windows WHERE status IN ('PENDING', 'RETRY', 'LEASED')""", Timestamp.class);
        return due == null ? null : due.toInstant();
    }

    private long deviationChanges() {
        Long changes = jdbc.queryForObject("SELECT COUNT(*) FROM deviation_audits", Long.class);
        return changes == null ? 0 : changes;
    }

    private boolean run(String name, Runnable job) {
        try {
            job.run();
            ledger.count("job." + name);
            return true;
        } catch (RuntimeException ex) {
            ledger.violation("job", name + " threw " + ex);
            return false;
        }
    }
}
