package com.braja.fichaje.security;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.config.BrajaProperties;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;

@Service
public class LoginThrottleService {
    private static final int MAX_FAILURES = 5;
    private static final Duration LOCK_DURATION = Duration.ofMinutes(15);
    private static final Duration WINDOW = Duration.ofMinutes(15);
    private final JdbcTemplate jdbc;
    private final byte[] key;
    private final BrajaProperties properties;

    public LoginThrottleService(JdbcTemplate jdbc, BrajaProperties properties) {
        this.jdbc = jdbc;
        this.key = java.util.Base64.getDecoder().decode(properties.getHealthEncryptionKeyBase64());
        this.properties = properties;
    }

    public void assertNotLocked(String dni, String clientAddress) {
        assertNotLocked("login_ip_throttles", "ip_hash", hash("braja-login-ip-throttle:", clientAddress));
        assertNotLocked("login_throttles", "dni_hash", hash("braja-login-throttle:", dni));
    }

    private void assertNotLocked(String table, String keyColumn, String keyValue) {
        Instant lockedUntil = jdbc.query("SELECT locked_until FROM " + table + " WHERE " + keyColumn + "=?", rs ->
                rs.next() && rs.getTimestamp(1) != null ? rs.getTimestamp(1).toInstant() : null, keyValue);
        Instant now = Instant.now();
        if (lockedUntil != null && lockedUntil.isAfter(now)) {
            long seconds = Math.max(1, Duration.between(now, lockedUntil).toSeconds());
            throw ApiException.tooManyRequests(seconds);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failed(String dni, String clientAddress) {
        recordFailure("login_throttles", "dni_hash", hash("braja-login-throttle:", dni), MAX_FAILURES, WINDOW, LOCK_DURATION);
        recordFailure("login_ip_throttles", "ip_hash", hash("braja-login-ip-throttle:", clientAddress),
                properties.getLoginIpThrottleMaxFailures(), properties.getLoginIpThrottleWindow(), properties.getLoginIpThrottleLockDuration());
    }

    private void recordFailure(String table, String keyColumn, String keyValue, int maxFailures, Duration window, Duration lockDuration) {
        Instant now = Instant.now();
        jdbc.update("INSERT IGNORE INTO " + table + "(" + keyColumn + ",window_started_at,failed_attempts,locked_until,updated_at) VALUES(?,?,0,NULL,?)",
                keyValue, timestamp(now), timestamp(now));
        ThrottleRow row = jdbc.queryForObject("SELECT window_started_at,failed_attempts FROM " + table + " WHERE " + keyColumn + "=? FOR UPDATE",
                (rs, index) -> new ThrottleRow(rs.getTimestamp(1).toInstant(), rs.getInt(2)), keyValue);
        boolean expiredWindow = row.windowStartedAt().isBefore(now.minus(window));
        int attempts = (expiredWindow ? 0 : row.failedAttempts()) + 1;
        Instant windowStarted = expiredWindow ? now : row.windowStartedAt();
        Instant lockedUntil = attempts >= maxFailures ? now.plus(lockDuration) : null;
        jdbc.update("UPDATE " + table + " SET window_started_at=?,failed_attempts=?,locked_until=?,updated_at=? WHERE " + keyColumn + "=?",
                timestamp(windowStarted), attempts, lockedUntil == null ? null : timestamp(lockedUntil), timestamp(now), keyValue);
    }

    @Transactional
    public void succeeded(String dni) { jdbc.update("DELETE FROM login_throttles WHERE dni_hash=?", hash("braja-login-throttle:", dni)); }

    private String hash(String namespace, String value) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            mac.update(namespace.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(mac.doFinal(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException ex) {
            throw new IllegalStateException("Unable to protect login throttle identifier", ex);
        }
    }

    private static java.sql.Timestamp timestamp(Instant instant) { return java.sql.Timestamp.from(instant); }
    private record ThrottleRow(Instant windowStartedAt, int failedAttempts) { }
}
