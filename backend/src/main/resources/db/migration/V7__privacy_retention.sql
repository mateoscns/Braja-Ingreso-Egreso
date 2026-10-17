ALTER TABLE deviations
    ADD COLUMN motive_cipher_key_id VARCHAR(64) NULL AFTER motive_iv;

CREATE INDEX ix_location_pending_timeout
    ON mark_events (location_status, accepted_at);

CREATE INDEX ix_health_motive_retention
    ON deviations (motive_category, motive_created_at, motive_purged_at);
