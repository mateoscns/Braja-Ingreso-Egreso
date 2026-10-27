package com.braja.fichaje.notifications;

import com.braja.fichaje.config.BrajaProperties;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes push-eligible deviations into the outbox inside the caller's transaction.
 *
 * <p>No event can be lost at a window boundary: an event only joins a window that is still {@code PENDING}
 * (never claimed), checked under a row lock on that window ({@code FOR UPDATE}) that is held until the caller
 * commits. The dispatcher claims with {@code FOR UPDATE SKIP LOCKED} on the same row, so it skips a window while
 * an enqueue into it is uncommitted, and once it has marked the window {@code LEASED} no later enqueue joins it
 * (a new window opens instead). The events of a window are therefore fixed and committed when it is claimed.
 *
 * <p>Lock order: company notification state, then the event's current window, then the window it joins.
 */
@Service
class JdbcDeviationNotificationOutbox implements DeviationNotificationPort {
    private static final Set<String> PUSH_TYPES = Set.of("SIN_INGRESO", "LLEGADA_TARDE");

    private final JdbcTemplate jdbcTemplate;
    private final BrajaProperties properties;
    private final NotificationWindowPolicy windowPolicy;

    JdbcDeviationNotificationOutbox(JdbcTemplate jdbcTemplate, BrajaProperties properties,
                                     NotificationWindowPolicy windowPolicy) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
        this.windowPolicy = windowPolicy;
    }

    @Override
    @Transactional
    public void enqueue(UUID companyId, UUID siteId, UUID deviationId, String deviationType, Instant occurredAt) {
        if (!properties.isPushEnabled() || deviationType == null || !PUSH_TYPES.contains(deviationType)) {
            return;
        }
        if (companyId == null || siteId == null || deviationId == null || occurredAt == null) {
            throw new IllegalArgumentException("Faltan datos requeridos para emitir el aviso.");
        }

        Instant now = Instant.now();
        jdbcTemplate.update("""
                INSERT INTO notification_company_state (company_id, active_window_id, updated_at)
                VALUES (?, NULL, ?)
                ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)
                """, companyId.toString(), sqlTime(now));
        String activeWindowId = jdbcTemplate.queryForObject("""
                SELECT active_window_id FROM notification_company_state
                WHERE company_id = ? FOR UPDATE
                """, String.class, companyId.toString());

        // Every activation (first detection or re-activation after a retraction) writes one CREATED audit;
        // a type replacement does not. A changed count means the deviation is a new fact.
        int activation = activationCount(companyId, deviationId);
        ExistingEvent existing = findEvent(deviationId);
        if (existing != null) {
            if (!existing.companyId().equals(companyId) || !existing.siteId().equals(siteId)) {
                throw new IllegalStateException("El desvío ya está asociado a otra empresa o sede.");
            }
            boolean reactivated = existing.activation() != null && existing.activation() != activation;
            WindowInfo current = reactivated ? lockWindow(companyId, existing.windowId().toString()) : null;
            if (!reactivated || (current != null && current.isPending())) {
                // A replacement keeps its single event; a re-activation still inside an unclaimed window is
                // counted there because the window stays locked until this transaction commits.
                jdbcTemplate.update("""
                        UPDATE notification_outbox_events
                        SET deviation_type = ?, deviation_activation_count = ?
                        WHERE deviation_id = ? AND company_id = ?
                        """, deviationType, activation, deviationId.toString(), companyId.toString());
                return;
            }
            String windowId = openWindow(companyId, activeWindowId, now);
            jdbcTemplate.update("""
                    UPDATE notification_outbox_events
                    SET deviation_type = ?, occurred_at = ?, window_id = ?, deviation_activation_count = ?,
                        created_at = ?
                    WHERE deviation_id = ? AND company_id = ?
                    """, deviationType, sqlTime(occurredAt), windowId, activation, sqlTime(now),
                    deviationId.toString(), companyId.toString());
            return;
        }

        String windowId = openWindow(companyId, activeWindowId, now);
        jdbcTemplate.update("""
                INSERT INTO notification_outbox_events (
                    id, company_id, site_id, deviation_id, deviation_type,
                    occurred_at, window_id, created_at, deviation_activation_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID().toString(), companyId.toString(), siteId.toString(),
                deviationId.toString(), deviationType, sqlTime(occurredAt), windowId, sqlTime(now), activation);
    }

    /** Returns the company's open window, locked, or opens a new one when it was claimed or has ended. */
    private String openWindow(UUID companyId, String activeWindowId, Instant now) {
        WindowInfo activeWindow = lockWindow(companyId, activeWindowId);
        Instant joinableStart = activeWindow != null && activeWindow.isPending() ? activeWindow.startedAt() : null;
        // Window placement follows server detection/enqueue time. Keep occurredAt on the event for audit.
        Instant windowStart = windowPolicy.startForEvent(joinableStart, now);
        if (joinableStart != null && windowStart.equals(joinableStart)) {
            return activeWindow.id().toString();
        }
        String windowId = UUID.randomUUID().toString();
        Instant windowEnd = windowPolicy.endAt(windowStart);
        jdbcTemplate.update("""
                INSERT INTO notification_windows (
                    id, company_id, window_started_at, window_ends_at, status,
                    attempt_count, next_attempt_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 'PENDING', 0, ?, ?, ?)
                """, windowId, companyId.toString(), sqlTime(windowStart), sqlTime(windowEnd),
                sqlTime(windowEnd), sqlTime(now), sqlTime(now));
        jdbcTemplate.update("""
                UPDATE notification_company_state
                SET active_window_id = ?, updated_at = ?
                WHERE company_id = ?
                """, windowId, sqlTime(now), companyId.toString());
        return windowId;
    }

    private int activationCount(UUID companyId, UUID deviationId) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM deviation_audits
                WHERE deviation_id = ? AND company_id = ? AND change_type = 'CREATED'
                """, Integer.class, deviationId.toString(), companyId.toString());
        return count == null ? 0 : count;
    }

    private ExistingEvent findEvent(UUID deviationId) {
        return jdbcTemplate.query("""
                SELECT company_id, site_id, window_id, deviation_activation_count
                FROM notification_outbox_events WHERE deviation_id = ?
                """, rs -> rs.next() ? new ExistingEvent(
                UUID.fromString(rs.getString("company_id")), UUID.fromString(rs.getString("site_id")),
                UUID.fromString(rs.getString("window_id")),
                rs.getObject("deviation_activation_count", Integer.class)) : null, deviationId.toString());
    }

    /**
     * Locks the window only while it can still be joined. A window never returns to {@code PENDING}, so a plain
     * (possibly older) read that already shows it claimed is final and leaves the dispatcher's row unlocked.
     */
    private WindowInfo lockWindow(UUID companyId, String windowId) {
        if (windowId == null) {
            return null;
        }
        WindowInfo seen = readWindow(companyId, windowId, "");
        return seen != null && !seen.isPending() ? seen : readWindow(companyId, windowId, "FOR UPDATE");
    }

    private WindowInfo readWindow(UUID companyId, String windowId, String lockClause) {
        return jdbcTemplate.query("""
                SELECT id, window_started_at, status
                FROM notification_windows
                WHERE id = ? AND company_id = ?
                """ + lockClause, rs -> rs.next() ? new WindowInfo(
                UUID.fromString(rs.getString("id")),
                rs.getObject("window_started_at", LocalDateTime.class).toInstant(ZoneOffset.UTC),
                rs.getString("status")) : null,
                windowId, companyId.toString());
    }

    private Timestamp sqlTime(Instant instant) {
        return Timestamp.from(instant);
    }

    private record ExistingEvent(UUID companyId, UUID siteId, UUID windowId, Integer activation) {
    }

    private record WindowInfo(UUID id, Instant startedAt, String status) {
        boolean isPending() {
            return "PENDING".equals(status);
        }
    }
}
