ALTER TABLE deviations
    ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE AFTER classification;

ALTER TABLE deviations
    ADD COLUMN active_type VARCHAR(32) GENERATED ALWAYS AS (CASE WHEN active THEN type ELSE NULL END) STORED AFTER active;

ALTER TABLE deviation_audits
    DROP CHECK chk_deviation_audit_change,
    ADD CONSTRAINT chk_deviation_audit_change CHECK (change_type IN ('CREATED', 'TYPE_REPLACED', 'CLASSIFICATION_CHANGED', 'RETRACTED'));

CREATE TABLE forgotten_mark_audits (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    jornada_id CHAR(36) NOT NULL,
    mark_id CHAR(36) NOT NULL,
    actor_account_id CHAR(36) NOT NULL,
    audit_reason VARCHAR(2000) NOT NULL,
    recorded_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_forgotten_mark_history (jornada_id, recorded_at),
    CONSTRAINT fk_forgotten_mark_jornada FOREIGN KEY (jornada_id, company_id)
        REFERENCES jornadas (id, company_id),
    CONSTRAINT fk_forgotten_mark_event FOREIGN KEY (mark_id, company_id)
        REFERENCES mark_events (id, company_id),
    CONSTRAINT fk_forgotten_mark_actor FOREIGN KEY (actor_account_id)
        REFERENCES accounts (id)
) ENGINE=InnoDB;

CREATE INDEX ix_deviation_active_inbox
    ON deviations (company_id, active, updated_at, id);

CREATE UNIQUE INDEX uq_deviation_jornada_active_type
    ON deviations (jornada_id, active_type);
