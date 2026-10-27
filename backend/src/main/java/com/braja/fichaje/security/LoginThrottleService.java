package com.braja.fichaje.security;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.config.BrajaProperties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;

/**
 * Login throttles persisted in MySQL. Each public method runs in its own short transaction and is called outside
 * any other transaction, so a login never holds two pooled connections at once (2026-10-27: nested connections
 * starved the pool). The DNI counter is reserved before the password is verified; the IP counter after a failure.
 */
@Service
public class LoginThrottleService {
    private static final int MAX_FAILURES = 5;
    private static final Duration LOCK_DURATION = Duration.ofMinutes(15);
    private static final Duration WINDOW = Duration.ofMinutes(15);
    private static final String DNI_TABLE = "login_throttles";
    private static final String DNI_COLUMN = "dni_hash";
    private final JdbcTemplate jdbc;
    private final byte[] key;
    private final BrajaProperties properties;

    public LoginThrottleService(JdbcTemplate jdbc, BrajaProperties properties) {
        this.jdbc = jdbc;
        this.key = java.util.Base64.getDecoder().decode(properties.getLoginIpThrottleKeyBase64());
        this.properties = properties;
    }

    public void assertNotLocked(String dni, String clientAddress) {
        assertNotLocked("login_ip_throttles", "ip_hash", ipHash(clientAddress));
        assertNotLocked(DNI_TABLE, DNI_COLUMN, dniHash(dni));
    }

    private void assertNotLocked(String table, String keyColumn, String keyValue) {
        Instant lockedUntil = jdbc.query("SELECT locked_until FROM " + table + " WHERE " + keyColumn + "=?", rs ->
                rs.next() && rs.getTimestamp(1) != null ? rs.getTimestamp(1).toInstant() : null, keyValue);
        rejectIfLocked(lockedUntil, Instant.now());
    }

    /**
     * Counts one credential check against the DNI before it happens, under the row lock, so concurrent attempts can
     * never verify more than {@value #MAX_FAILURES} passwords per window (2026-10-27: concurrent wrong logins all
     * passed the check before any failure was stored). A locked DNI is rejected with 429 and is not counted.
     * {@link #succeeded} clears the reservation; {@link #releaseAttempt} returns it when the check could not run.
     */
    @Transactional
    public void reserveAttempt(String dni) {
        String keyValue = dniHash(dni);
        Instant now = Instant.now();
        ThrottleRow row = lockRow(DNI_TABLE, DNI_COLUMN, keyValue, now);
        rejectIfLocked(row.lockedUntil(), now);
        boolean expiredWindow = row.windowStartedAt().isBefore(now.minus(WINDOW));
        int attempts = (expiredWindow ? 0 : row.failedAttempts()) + 1;
        Instant windowStarted = expiredWindow ? now : row.windowStartedAt();
        update(DNI_TABLE, DNI_COLUMN, keyValue, windowStarted, attempts, attempts >= MAX_FAILURES ? now.plus(LOCK_DURATION) : null, now);
    }

    /** Returns a reservation whose credential check failed for infrastructure reasons, not a wrong password. */
    @Transactional
    public void releaseAttempt(String dni) {
        String keyValue = dniHash(dni);
        Instant now = Instant.now();
        ThrottleRow row = jdbc.query("SELECT window_started_at,failed_attempts,locked_until FROM " + DNI_TABLE + " WHERE " + DNI_COLUMN + "=? FOR UPDATE",
                LoginThrottleService::row, keyValue).stream().findFirst().orElse(null);
        if (row == null) return;
        int attempts = Math.max(0, row.failedAttempts() - 1);
        Instant lockedUntil = attempts >= MAX_FAILURES ? row.lockedUntil() : null;
        update(DNI_TABLE, DNI_COLUMN, keyValue, row.windowStartedAt(), attempts, lockedUntil, now);
    }

    /** Records a rejected credential for the client address; the DNI was already counted by {@link #reserveAttempt}. */
    @Transactional
    public void failedFromAddress(String clientAddress) {
        String keyValue = ipHash(clientAddress);
        Instant now = Instant.now();
        ThrottleRow row = lockRow("login_ip_throttles", "ip_hash", keyValue, now);
        boolean expiredWindow = row.windowStartedAt().isBefore(now.minus(properties.getLoginIpThrottleWindow()));
        int attempts = (expiredWindow ? 0 : row.failedAttempts()) + 1;
        Instant windowStarted = expiredWindow ? now : row.windowStartedAt();
        Instant lockedUntil = attempts >= properties.getLoginIpThrottleMaxFailures() ? now.plus(properties.getLoginIpThrottleLockDuration()) : null;
        update("login_ip_throttles", "ip_hash", keyValue, windowStarted, attempts, lockedUntil, now);
    }

    @Transactional
    public void succeeded(String dni) { jdbc.update("DELETE FROM " + DNI_TABLE + " WHERE " + DNI_COLUMN + "=?", dniHash(dni)); }

    private ThrottleRow lockRow(String table, String keyColumn, String keyValue, Instant now) {
        jdbc.update("INSERT IGNORE INTO " + table + "(" + keyColumn + ",window_started_at,failed_attempts,locked_until,updated_at) VALUES(?,?,0,NULL,?)",
                keyValue, timestamp(now), timestamp(now));
        return jdbc.queryForObject("SELECT window_started_at,failed_attempts,locked_until FROM " + table + " WHERE " + keyColumn + "=? FOR UPDATE",
                LoginThrottleService::row, keyValue);
    }

    private static ThrottleRow row(java.sql.ResultSet rs, int index) throws java.sql.SQLException {
        return new ThrottleRow(rs.getTimestamp(1).toInstant(), rs.getInt(2), rs.getTimestamp(3) == null ? null : rs.getTimestamp(3).toInstant());
    }

    private void update(String table, String keyColumn, String keyValue, Instant windowStarted, int attempts, Instant lockedUntil, Instant now) {
        jdbc.update("UPDATE " + table + " SET window_started_at=?,failed_attempts=?,locked_until=?,updated_at=? WHERE " + keyColumn + "=?",
                timestamp(windowStarted), attempts, lockedUntil == null ? null : timestamp(lockedUntil), timestamp(now), keyValue);
    }

    private static void rejectIfLocked(Instant lockedUntil, Instant now) {
        if (lockedUntil != null && lockedUntil.isAfter(now)) {
            throw ApiException.tooManyRequests(Math.max(1, Duration.between(now, lockedUntil).toSeconds()));
        }
    }

    private String dniHash(String dni) { return hash("braja-login-throttle:", dni); }
    private String ipHash(String clientAddress) { return hash("braja-login-ip-throttle:", clientAddress); }

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
    private record ThrottleRow(Instant windowStartedAt, int failedAttempts, Instant lockedUntil) { }
}
