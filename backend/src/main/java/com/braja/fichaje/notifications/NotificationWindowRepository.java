package com.braja.fichaje.notifications;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
class NotificationWindowRepository {
    private static final int CLAIM_LEASE_SECONDS = 600;

    private final JdbcTemplate jdbcTemplate;

    NotificationWindowRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    List<NotificationWindowLease> claimDueWindows(Instant now, int limit) {
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException("El límite de reclamo debe estar entre 1 y 100.");
        }
        Timestamp timestamp = sqlTime(now);
        List<NotificationWindowLease> candidates = jdbcTemplate.query("""
                SELECT id, company_id, window_started_at, attempt_count
                FROM notification_windows
                WHERE window_ends_at <= ?
                  AND ((status IN ('PENDING', 'RETRY') AND next_attempt_at <= ?)
                       OR (status = 'LEASED' AND lease_until <= ?))
                ORDER BY window_ends_at, id
                LIMIT ? FOR UPDATE SKIP LOCKED
                """, (rs, rowNum) -> new NotificationWindowLease(
                UUID.fromString(rs.getString("id")),
                UUID.fromString(rs.getString("company_id")),
                rs.getObject("window_started_at", LocalDateTime.class).toInstant(ZoneOffset.UTC),
                UUID.randomUUID(), rs.getInt("attempt_count") + 1),
                timestamp, timestamp, timestamp, limit);

        for (NotificationWindowLease lease : candidates) {
            jdbcTemplate.update("""
                    UPDATE notification_windows
                    SET status = 'LEASED', attempt_count = attempt_count + 1,
                        lease_token = ?, lease_until = ?, updated_at = ?, last_error_code = NULL
                    WHERE id = ?
                    """, lease.leaseToken().toString(), sqlTime(now.plusSeconds(CLAIM_LEASE_SECONDS)),
                    timestamp, lease.id().toString());
        }
        return candidates;
    }

    List<SiteCount> loadSiteCounts(NotificationWindowLease lease) {
        return jdbcTemplate.query("""
                SELECT oe.site_id, s.name AS site_name, COUNT(*) AS deviation_count
                FROM notification_outbox_events oe
                JOIN sites s ON s.id = oe.site_id AND s.company_id = oe.company_id
                JOIN deviations d ON d.id = oe.deviation_id
                    AND d.company_id = oe.company_id AND d.active = TRUE
                    AND d.type IN ('SIN_INGRESO', 'LLEGADA_TARDE')
                WHERE oe.company_id = ? AND oe.window_id = ?
                GROUP BY oe.site_id, s.name
                ORDER BY s.name, oe.site_id
                """, (rs, rowNum) -> new SiteCount(UUID.fromString(rs.getString("site_id")),
                rs.getString("site_name"), rs.getLong("deviation_count")), lease.companyId().toString(), lease.id().toString());
    }

    List<StoredPushSubscription> findActiveAdminSubscriptions(UUID companyId) {
        return jdbcTemplate.query("""
                SELECT subscription.id, subscription.company_id, subscription.account_id,
                       subscription.endpoint_hash, subscription.secret_ciphertext, subscription.secret_iv
                FROM push_subscriptions subscription
                JOIN company_memberships membership
                  ON membership.company_id = subscription.company_id
                 AND membership.account_id = subscription.account_id
                JOIN accounts account ON account.id = membership.account_id
                WHERE subscription.company_id = ?
                  AND subscription.active = TRUE
                  AND membership.role = 'ADMIN'
                  AND membership.active = TRUE
                  AND account.active = TRUE
                ORDER BY subscription.id
                """, (rs, rowNum) -> new StoredPushSubscription(
                UUID.fromString(rs.getString("id")),
                UUID.fromString(rs.getString("company_id")),
                UUID.fromString(rs.getString("account_id")),
                rs.getString("endpoint_hash"),
                new EncryptedPushSecret(rs.getBytes("secret_iv"), rs.getBytes("secret_ciphertext"))),
                companyId.toString());
    }

    void markDelivered(NotificationWindowLease lease, Instant now) {
        jdbcTemplate.update("""
                UPDATE notification_windows
                SET status = 'SENT', delivered_at = ?, lease_token = NULL, lease_until = NULL,
                    updated_at = ?, last_error_code = NULL
                WHERE id = ? AND company_id = ? AND status = 'LEASED' AND lease_token = ?
                """, sqlTime(now), sqlTime(now), lease.id().toString(), lease.companyId().toString(),
                lease.leaseToken().toString());
    }

    void scheduleRetry(NotificationWindowLease lease, Instant now, Instant nextAttemptAt, String errorCode) {
        jdbcTemplate.update("""
                UPDATE notification_windows
                SET status = CASE WHEN attempt_count >= ? THEN 'DEAD' ELSE 'RETRY' END,
                    next_attempt_at = ?, lease_token = NULL, lease_until = NULL,
                    updated_at = ?, last_error_code = ?
                WHERE id = ? AND company_id = ? AND status = 'LEASED' AND lease_token = ?
                """, NotificationRetryPolicy.MAX_ATTEMPTS, sqlTime(nextAttemptAt), sqlTime(now),
                safeErrorCode(errorCode), lease.id().toString(), lease.companyId().toString(),
                lease.leaseToken().toString());
    }

    void removeExpiredSubscription(UUID companyId, UUID subscriptionId) {
        jdbcTemplate.update("DELETE FROM push_subscriptions WHERE company_id = ? AND id = ?",
                companyId.toString(), subscriptionId.toString());
    }

    private String safeErrorCode(String errorCode) {
        if (errorCode == null || errorCode.isBlank()) {
            return "DELIVERY_FAILED";
        }
        String normalized = errorCode.replaceAll("[^A-Z0-9_\\-]", "_");
        return normalized.substring(0, Math.min(normalized.length(), 64));
    }

    private Timestamp sqlTime(Instant instant) {
        return Timestamp.from(instant);
    }
}
