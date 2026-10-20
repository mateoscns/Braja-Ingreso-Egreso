ALTER TABLE jornadas
    ADD COLUMN deviation_worker_failure_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    ADD COLUMN deviation_worker_retry_at DATETIME(6) NULL,
    ADD CONSTRAINT chk_jornada_deviation_worker_failure_count CHECK (deviation_worker_failure_count <= 16);
