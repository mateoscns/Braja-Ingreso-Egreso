-- Revert: DROP TABLE login_ip_throttles;
CREATE TABLE login_ip_throttles (
    ip_hash CHAR(64) NOT NULL,
    window_started_at DATETIME(6) NOT NULL,
    failed_attempts INT UNSIGNED NOT NULL,
    locked_until DATETIME(6) NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (ip_hash),
    KEY ix_login_ip_throttle_lock (locked_until)
) ENGINE=InnoDB;
