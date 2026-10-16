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

    public LoginThrottleService(JdbcTemplate jdbc, BrajaProperties properties) {
        this.jdbc = jdbc;
        this.key = java.util.Base64.getDecoder().decode(properties.getHealthEncryptionKeyBase64());
    }

    public void assertNotLocked(String dni) {
        Instant lockedUntil = jdbc.query("SELECT locked_until FROM login_throttles WHERE dni_hash=?", rs ->
                rs.next() && rs.getTimestamp(1) != null ? rs.getTimestamp(1).toInstant() : null, hash(dni));
        if (lockedUntil != null && lockedUntil.isAfter(Instant.now())) {
            long seconds = Math.max(1, Duration.between(Instant.now(), lockedUntil).toSeconds());
            throw ApiException.tooManyRequests(seconds);
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void failed(String dni) {
        String dniHash = hash(dni);
        Instant now = Instant.now();
        jdbc.update("INSERT IGNORE INTO login_throttles(dni_hash,window_started_at,failed_attempts,locked_until,updated_at) VALUES(?,?,0,NULL,?)",
                dniHash, timestamp(now), timestamp(now));
        ThrottleRow row = jdbc.queryForObject("SELECT window_started_at,failed_attempts FROM login_throttles WHERE dni_hash=? FOR UPDATE",
                (rs, index) -> new ThrottleRow(rs.getTimestamp(1).toInstant(), rs.getInt(2)), dniHash);
        boolean expiredWindow = row.windowStartedAt().isBefore(now.minus(WINDOW));
        int attempts = (expiredWindow ? 0 : row.failedAttempts()) + 1;
        Instant windowStarted = expiredWindow ? now : row.windowStartedAt();
        Instant lockedUntil = attempts >= MAX_FAILURES ? now.plus(LOCK_DURATION) : null;
        jdbc.update("UPDATE login_throttles SET window_started_at=?,failed_attempts=?,locked_until=?,updated_at=? WHERE dni_hash=?",
                timestamp(windowStarted), attempts, lockedUntil == null ? null : timestamp(lockedUntil), timestamp(now), dniHash);
    }

    @Transactional
    public void succeeded(String dni) { jdbc.update("DELETE FROM login_throttles WHERE dni_hash=?", hash(dni)); }

    private String hash(String dni) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            mac.update("braja-login-throttle:".getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(mac.doFinal(dni.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException ex) {
            throw new IllegalStateException("Unable to protect login throttle identifier", ex);
        }
    }

    private static java.sql.Timestamp timestamp(Instant instant) { return java.sql.Timestamp.from(instant); }
    private record ThrottleRow(Instant windowStartedAt, int failedAttempts) { }
}
