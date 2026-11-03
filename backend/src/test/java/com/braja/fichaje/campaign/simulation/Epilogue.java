package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.InvariantChecker;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * After the last day (S59 edge): the clock jumps to the oldest stored location + 90 days, where the purge must keep it,
 * then 1 µs later, where it must erase it; the same for the oldest SALUD motive; then one more purge a day later and
 * afterRetention. The jump may go back in time relative to the tail of the run: that is the one deliberate move back.
 */
final class Epilogue {
    private static final Duration RETENTION = Duration.ofDays(90);
    private static final Duration MICRO = Duration.of(1, ChronoUnit.MICROS);

    private final SimContext ctx;

    Epilogue(SimContext ctx) {
        this.ctx = ctx;
    }

    String run() {
        List<String> report = new ArrayList<>();
        Instant end = ctx.now();
        Object[] oldest = ctx.jdbc.query("SELECT id, location_received_at FROM mark_events WHERE latitude IS NOT NULL ORDER BY location_received_at, id LIMIT 1",
                rs -> rs.next() ? new Object[] {rs.getString(1), rs.getTimestamp(2).toInstant()} : null);
        if (oldest != null) {
            Instant edge = ((Instant) oldest[1]).plus(RETENTION);
            purgeAt(edge);
            boolean keptAtEdge = ctx.count("SELECT COUNT(*) FROM mark_events WHERE id=? AND latitude IS NOT NULL", oldest[0]) == 1;
            purgeAt(edge.plus(MICRO));
            boolean purgedAfter = ctx.count("SELECT COUNT(*) FROM mark_events WHERE id=? AND latitude IS NULL AND location_status='PURGADA'", oldest[0]) == 1;
            report.add("oldest location kept at +90d " + keptAtEdge + ", purged at +90d+1µs " + purgedAfter);
            if (!keptAtEdge || !purgedAfter) ctx.ledger.violation("epilogue", "S59 location edge: kept at the edge " + keptAtEdge + ", purged 1 µs later " + purgedAfter);
        } else {
            ctx.ledger.violation("epilogue", "S59 location edge not checked: no stored location left, yet most marks of every day send one");
        }
        Object[] health = ctx.jdbc.query("SELECT id, motive_created_at FROM deviations WHERE motive_category='SALUD' AND motive_ciphertext IS NOT NULL"
                + " ORDER BY motive_created_at, id LIMIT 1", rs -> rs.next() ? new Object[] {rs.getString(1), rs.getTimestamp(2).toInstant()} : null);
        if (health != null) {
            Instant edge = ((Instant) health[1]).plus(RETENTION);
            purgeAt(edge);
            boolean keptAtEdge = ctx.count("SELECT COUNT(*) FROM deviations WHERE id=? AND motive_ciphertext IS NOT NULL", health[0]) == 1;
            purgeAt(edge.plus(MICRO));
            boolean purgedAfter = ctx.count("SELECT COUNT(*) FROM deviations WHERE id=? AND motive_ciphertext IS NULL AND motive_category='SALUD'", health[0]) == 1;
            report.add("oldest SALUD motive kept at +90d " + keptAtEdge + ", purged at +90d+1µs " + purgedAfter);
            if (!keptAtEdge || !purgedAfter) ctx.ledger.violation("epilogue", "S59 SALUD edge: kept at the edge " + keptAtEdge + ", purged 1 µs later " + purgedAfter);
        } else {
            ctx.ledger.violation("epilogue", "S59 SALUD edge not checked: no stored SALUD motive, yet 15% of the motives sent are SALUD and every day has deviations");
        }
        Instant later = ctx.now().plus(Duration.ofDays(1));
        purgeAt(later.isAfter(end) ? later : end);
        InvariantChecker invariants = new InvariantChecker(ctx.jdbc);
        invariants.afterRetention(ctx.now()).forEach(v -> ctx.ledger.violation("epilogue", v));
        invariants.always().forEach(v -> ctx.ledger.violation("epilogue", v));
        int purged = ctx.count("SELECT COUNT(*) FROM mark_events WHERE location_status='PURGADA'");
        int kept = ctx.count("SELECT COUNT(*) FROM mark_events WHERE latitude IS NOT NULL AND location_received_at >= ?", Timestamp.from(ctx.now().minus(RETENTION)));
        report.add(purged + " locations purged, " + kept + " younger than 90 days kept at " + ctx.now());
        ctx.ledger.writeExtra("epilogue.txt", report);
        if (!ctx.ledger.violations().isEmpty()) throw new AssertionError("epilogue: " + ctx.ledger.violations());
        return String.join("; ", report);
    }

    private void purgeAt(Instant instant) {
        ctx.clock.set(instant);
        ctx.jobs.purge();
    }
}
