package com.braja.fichaje.campaign;

import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * Whole-database invariants checked after every simulated day and every concurrency test (S72).
 * The schema already enforces some of them (composite FKs, uq_jornada_employee_site_active_date,
 * uq_deviation_jornada_active_type, chk_deviation_motive_storage); these queries cover what it does not.
 * I3, I5 and I6 (state and deviations against an independent oracle) belong to the simulation driver.
 */
public final class InvariantChecker {
    private static final Duration RETENTION = Duration.ofDays(90);

    private final JdbcTemplate jdbc;

    public InvariantChecker(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Invariants that hold at any moment, whatever ran before. */
    public List<String> always() {
        List<String> violations = new ArrayList<>();
        // I1: one jornada per employee, site and date among the non-cancelled ones.
        collect(violations, "I1 duplicate active jornada", """
                SELECT CONCAT(employee_id, ' ', site_id, ' ', local_date) FROM jornadas WHERE state <> 'CANCELADA'
                GROUP BY company_id, employee_id, site_id, local_date HAVING COUNT(*) > 1""");
        // I2: mark sequences are 1..n without gaps and next_sequence points right after the last one.
        collect(violations, "I2 broken mark sequence", """
                SELECT j.id FROM jornadas j LEFT JOIN mark_events m ON m.jornada_id = j.id
                GROUP BY j.id, j.next_sequence
                HAVING COUNT(m.id) <> COALESCE(MAX(m.sequence_number), 0)
                    OR j.next_sequence <> COALESCE(MAX(m.sequence_number), 0) + 1""");
        // I4: at most one active deviation per family and jornada (arrival, exit, each break, geofence).
        collect(violations, "I4 two active deviations of one family", """
                SELECT jornada_id FROM deviations WHERE active GROUP BY jornada_id
                HAVING SUM(type IN ('SIN_INGRESO', 'LLEGADA_TARDE')) > 1
                    OR SUM(type IN ('EGRESO_TEMPRANO', 'EGRESO_TARDIO', 'MARCA_FALTANTE')) > 1
                    OR SUM(type = 'EXCESO_DESAYUNO') > 1 OR SUM(type = 'EXCESO_ALMUERZO') > 1
                    OR SUM(type = 'FUERA_DE_SEDE') > 1""");
        // I7: copied ownership columns match their parent row (the FKs check each column alone).
        collect(violations, "I7 deviation owned by another employee or site", """
                SELECT d.id FROM deviations d JOIN jornadas j ON j.id = d.jornada_id
                WHERE d.employee_id <> j.employee_id OR d.site_id <> j.site_id OR d.company_id <> j.company_id""");
        collect(violations, "I7 deviation source mark from another jornada", """
                SELECT d.id FROM deviations d JOIN mark_events m ON m.id = d.source_mark_id WHERE m.jornada_id <> d.jornada_id""");
        collect(violations, "I7 push event counted for another site", """
                SELECT e.id FROM notification_outbox_events e JOIN deviations d ON d.id = e.deviation_id
                WHERE e.site_id <> d.site_id OR e.company_id <> d.company_id""");
        // I12: an idempotency record always points to a mark of the same account.
        collect(violations, "I12 idempotency record of another account", """
                SELECT i.mark_id FROM mark_idempotency i JOIN mark_events m ON m.id = i.mark_id
                JOIN jornadas j ON j.id = m.jornada_id JOIN employees e ON e.id = j.employee_id
                WHERE e.account_id <> i.account_id""");
        // I13: an employee mark is never accepted earlier than the previous employee mark (rule 1).
        collect(violations, "I13 employee mark accepted before the previous one", """
                SELECT id FROM (
                    SELECT id, accepted_at, LAG(accepted_at) OVER (PARTITION BY jornada_id ORDER BY sequence_number) AS previous
                    FROM mark_events WHERE origin = 'EMPLEADO') ordered
                WHERE previous IS NOT NULL AND accepted_at < previous""");
        return violations;
    }

    /** I8 and I15: after PrivacyRetentionScheduler ran at {@code now}, nothing older than 90 days keeps personal data. */
    public List<String> afterRetention(Instant now) {
        List<String> violations = new ArrayList<>();
        Timestamp cutoff = Timestamp.from(now.minus(RETENTION));
        collect(violations, "I8 coordinates kept past 90 days",
                "SELECT id FROM mark_events WHERE latitude IS NOT NULL AND location_received_at < ?", cutoff);
        collect(violations, "I15 SALUD motive kept past 90 days",
                "SELECT id FROM deviations WHERE motive_category = 'SALUD' AND motive_ciphertext IS NOT NULL AND motive_created_at < ?", cutoff);
        return violations;
    }

    /** I8: after the location expiry job ran at {@code now}, no mark waits for a location past its window. */
    public List<String> afterLocationExpiry(Instant now) {
        List<String> violations = new ArrayList<>();
        collect(violations, "I8 location still pending after its window",
                "SELECT id FROM mark_events WHERE location_status = 'PENDIENTE' AND location_expires_at < ?", Timestamp.from(now));
        return violations;
    }

    /** I9: after the dispatcher drained at {@code now}, no push window is due (the same predicate it claims with). */
    public List<String> afterDispatch(Instant now) {
        List<String> violations = new ArrayList<>();
        Timestamp at = Timestamp.from(now);
        collect(violations, "I9 push window still due after dispatch", """
                SELECT id FROM notification_windows WHERE window_ends_at <= ?
                  AND ((status IN ('PENDING', 'RETRY') AND next_attempt_at <= ?) OR (status = 'LEASED' AND lease_until <= ?))""",
                at, at, at);
        return violations;
    }

    private void collect(List<String> violations, String invariant, String sql, Object... args) {
        for (String row : jdbc.queryForList(sql, String.class, args)) violations.add(invariant + ": " + row);
    }
}
