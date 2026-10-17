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

        ExistingEvent existing = findEvent(deviationId);
        if (existing != null) {
            if (!existing.companyId().equals(companyId) || !existing.siteId().equals(siteId)) {
                throw new IllegalStateException("El desvío ya está asociado a otra empresa o sede.");
            }
            jdbcTemplate.update("""
                    UPDATE notification_outbox_events
                    SET deviation_type = ?
                    WHERE deviation_id = ? AND company_id = ?
                    """, deviationType, deviationId.toString(), companyId.toString());
            return;
        }

        WindowInfo activeWindow = findWindow(companyId, activeWindowId);
        // Window placement follows server detection/enqueue time. Keep occurredAt on the event for audit.
        Instant windowStart = windowPolicy.startForEvent(
                activeWindow == null ? null : activeWindow.startedAt(), now);
        String windowId;
        if (activeWindow != null && windowStart.equals(activeWindow.startedAt())) {
            windowId = activeWindow.id().toString();
        } else {
            windowId = UUID.randomUUID().toString();
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
        }

        jdbcTemplate.update("""
                INSERT INTO notification_outbox_events (
                    id, company_id, site_id, deviation_id, deviation_type,
                    occurred_at, window_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, UUID.randomUUID().toString(), companyId.toString(), siteId.toString(),
                deviationId.toString(), deviationType, sqlTime(occurredAt), windowId, sqlTime(now));
    }

    private ExistingEvent findEvent(UUID deviationId) {
        return jdbcTemplate.query("""
                SELECT company_id, site_id, window_id
                FROM notification_outbox_events WHERE deviation_id = ?
                """, rs -> rs.next() ? new ExistingEvent(
                UUID.fromString(rs.getString("company_id")), UUID.fromString(rs.getString("site_id")),
                UUID.fromString(rs.getString("window_id"))) : null, deviationId.toString());
    }

    private WindowInfo findWindow(UUID companyId, String activeWindowId) {
        if (activeWindowId == null) {
            return null;
        }
        return jdbcTemplate.query("""
                SELECT id, window_started_at, window_ends_at
                FROM notification_windows
                WHERE id = ? AND company_id = ?
                """, rs -> rs.next() ? new WindowInfo(
                UUID.fromString(rs.getString("id")),
                rs.getObject("window_started_at", LocalDateTime.class).toInstant(ZoneOffset.UTC),
                rs.getObject("window_ends_at", LocalDateTime.class).toInstant(ZoneOffset.UTC)) : null,
                activeWindowId, companyId.toString());
    }

    private Timestamp sqlTime(Instant instant) {
        return Timestamp.from(instant);
    }

    private record ExistingEvent(UUID companyId, UUID siteId, UUID windowId) {
    }

    private record WindowInfo(UUID id, Instant startedAt, Instant endsAt) {
    }
}
