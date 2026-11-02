package com.braja.fichaje.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

@Component
public class PrivacyRetentionScheduler {
    private final JdbcTemplate jdbc;

    private final Clock clock;

    public PrivacyRetentionScheduler(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "PT15M")
    @Transactional
    public void purgeSensitiveData() {
        Instant now = clock.instant();
        Timestamp cutoff = Timestamp.from(now.minus(java.time.Duration.ofDays(90)));
        jdbc.update("UPDATE mark_events SET latitude=NULL,longitude=NULL,accuracy_meters=NULL,location_status='PURGADA',location_purged_at=? " +
                "WHERE location_status='RECIBIDA' AND location_received_at < ?", Timestamp.from(now), cutoff);
        // D-20261016-04: only the free text of SALUD motives is purged; the category, the author and other categories stay.
        jdbc.update("UPDATE deviations SET motive_text=NULL,motive_ciphertext=NULL,motive_iv=NULL,motive_cipher_key_id=NULL,motive_purged_at=?,updated_at=? " +
                "WHERE motive_category='SALUD' AND motive_created_at IS NOT NULL AND motive_purged_at IS NULL AND motive_created_at < ?", Timestamp.from(now), Timestamp.from(now), cutoff);
        // Login counters keep an HMAC of the address or the DNI; a row idle for a day outlived every window and lock, unless a
        // lock configured longer is still running. D-20261102-08: login_throttles too (2026-11-02, campaign #72: only a
        // successful login ever removed a DNI row).
        for (String table : new String[] {"login_ip_throttles", "login_throttles"}) {
            jdbc.update("DELETE FROM " + table + " WHERE updated_at < ? AND (locked_until IS NULL OR locked_until <= ?)",
                    Timestamp.from(now.minus(Duration.ofDays(1))), Timestamp.from(now));
        }
    }
}
