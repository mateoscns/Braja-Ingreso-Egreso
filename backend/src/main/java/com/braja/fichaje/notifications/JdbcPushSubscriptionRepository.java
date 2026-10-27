package com.braja.fichaje.notifications;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
class JdbcPushSubscriptionRepository {
    private final JdbcTemplate jdbcTemplate;

    JdbcPushSubscriptionRepository(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    boolean isActiveAdmin(UUID companyId, UUID accountId) {
        Integer count = jdbcTemplate.queryForObject("""
                SELECT COUNT(*)
                FROM company_memberships membership
                JOIN accounts account ON account.id = membership.account_id
                WHERE membership.company_id = ?
                  AND membership.account_id = ?
                  AND membership.role = 'ADMIN'
                  AND membership.active = TRUE
                  AND account.active = TRUE
                """, Integer.class, companyId.toString(), accountId.toString());
        return count != null && count > 0;
    }

    UUID upsert(UUID companyId, UUID accountId, PushSubscriptionMaterial material,
                PushSubscriptionCipher cipher, Instant now) {
        String endpointHash = endpointHash(material.endpoint());
        EncryptedPushSecret secret = cipher.encrypt(companyId, accountId, endpointHash, material);
        UUID newId = UUID.randomUUID();
        jdbcTemplate.update("""
                INSERT INTO push_subscriptions (
                    id, company_id, account_id, endpoint_hash,
                    secret_ciphertext, secret_iv, active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?)
                ON DUPLICATE KEY UPDATE
                    secret_ciphertext = VALUES(secret_ciphertext),
                    secret_iv = VALUES(secret_iv),
                    active = TRUE,
                    updated_at = VALUES(updated_at)
                """, newId.toString(), companyId.toString(), accountId.toString(), endpointHash,
                secret.ciphertext(), secret.iv(), sqlTime(now), sqlTime(now));
        String id = jdbcTemplate.queryForObject("""
                SELECT id FROM push_subscriptions
                WHERE company_id = ? AND account_id = ? AND endpoint_hash = ?
                """, String.class, companyId.toString(), accountId.toString(), endpointHash);
        return UUID.fromString(id);
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

    void removeOwned(UUID companyId, UUID accountId, UUID subscriptionId) {
        jdbcTemplate.update("""
                DELETE FROM push_subscriptions
                WHERE id = ? AND company_id = ? AND account_id = ?
                """, subscriptionId.toString(), companyId.toString(), accountId.toString());
    }

    Optional<UUID> findOwnedActive(UUID companyId, UUID accountId, String endpoint) {
        return jdbcTemplate.query("""
                SELECT id FROM push_subscriptions
                WHERE company_id = ? AND account_id = ? AND endpoint_hash = ? AND active = TRUE
                """, (rs, rowNum) -> UUID.fromString(rs.getString("id")),
                companyId.toString(), accountId.toString(), endpointHash(endpoint)).stream().findFirst();
    }

    void removeExpired(UUID companyId, UUID subscriptionId) {
        jdbcTemplate.update("DELETE FROM push_subscriptions WHERE id = ? AND company_id = ?",
                subscriptionId.toString(), companyId.toString());
    }

    private String endpointHash(String endpoint) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(endpoint.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 no está disponible.", ex);
        }
    }

    private java.sql.Timestamp sqlTime(Instant instant) {
        return java.sql.Timestamp.from(instant);
    }
}
