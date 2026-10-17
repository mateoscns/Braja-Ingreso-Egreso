package com.braja.fichaje.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;

@Component
public class PrivacyRetentionScheduler {
    private final JdbcTemplate jdbc;

    public PrivacyRetentionScheduler(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Scheduled(fixedDelayString = "PT15M")
    @Transactional
    public void purgeSensitiveData() {
        Instant now = Instant.now();
        Timestamp cutoff = Timestamp.from(now.minus(java.time.Duration.ofDays(90)));
        jdbc.update("UPDATE mark_events SET latitude=NULL,longitude=NULL,accuracy_meters=NULL,location_status='PURGADA',location_purged_at=? " +
                "WHERE location_status='RECIBIDA' AND location_received_at < ?", Timestamp.from(now), cutoff);
        jdbc.update("UPDATE deviations SET motive_category=NULL,motive_text=NULL,motive_ciphertext=NULL,motive_iv=NULL,motive_cipher_key_id=NULL,motive_author_account_id=NULL,motive_purged_at=?,updated_at=? " +
                "WHERE motive_created_at IS NOT NULL AND motive_purged_at IS NULL AND motive_created_at < ?", Timestamp.from(now), Timestamp.from(now), cutoff);
    }
}
