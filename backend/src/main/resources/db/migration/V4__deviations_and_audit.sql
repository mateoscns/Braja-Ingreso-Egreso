CREATE TABLE deviations (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    jornada_id CHAR(36) NOT NULL,
    source_mark_id CHAR(36) NULL,
    site_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    type VARCHAR(32) NOT NULL,
    motive_category VARCHAR(16) NULL,
    motive_text VARCHAR(4000) NULL,
    motive_ciphertext VARBINARY(8192) NULL,
    motive_iv VARBINARY(12) NULL,
    motive_author_account_id CHAR(36) NULL,
    motive_created_at DATETIME(6) NULL,
    motive_purged_at DATETIME(6) NULL,
    classification VARCHAR(20) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_deviation_id_company (id, company_id),
    KEY ix_deviation_company_created (company_id, created_at),
    KEY ix_deviation_inbox (company_id, updated_at, id),
    KEY ix_deviation_site_date (company_id, site_id, created_at),
    CONSTRAINT chk_deviation_type CHECK (type IN ('SIN_INGRESO', 'LLEGADA_TARDE', 'EGRESO_TEMPRANO', 'EGRESO_TARDIO', 'EXCESO_DESAYUNO', 'EXCESO_ALMUERZO')),
    CONSTRAINT chk_deviation_motive_category CHECK (motive_category IS NULL OR motive_category IN ('SALUD', 'TRANSPORTE', 'EMERGENCIA', 'OTRA')),
    CONSTRAINT chk_deviation_classification CHECK (classification IS NULL OR classification IN ('JUSTIFICADO', 'NO_JUSTIFICADO')),
    CONSTRAINT chk_deviation_motive_storage CHECK (
        (motive_category = 'SALUD' AND motive_text IS NULL AND (motive_ciphertext IS NULL OR motive_iv IS NOT NULL))
        OR (motive_category IS NULL AND motive_text IS NULL AND motive_ciphertext IS NULL AND motive_iv IS NULL)
        OR (motive_category IS NOT NULL AND motive_category <> 'SALUD' AND motive_text IS NOT NULL AND motive_ciphertext IS NULL AND motive_iv IS NULL)
    ),
    CONSTRAINT fk_deviation_jornada FOREIGN KEY (jornada_id, company_id)
        REFERENCES jornadas (id, company_id),
    CONSTRAINT fk_deviation_source_mark FOREIGN KEY (source_mark_id, company_id)
        REFERENCES mark_events (id, company_id),
    CONSTRAINT fk_deviation_site FOREIGN KEY (site_id, company_id)
        REFERENCES sites (id, company_id),
    CONSTRAINT fk_deviation_employee FOREIGN KEY (employee_id, company_id)
        REFERENCES employees (id, company_id),
    CONSTRAINT fk_deviation_motive_author FOREIGN KEY (motive_author_account_id)
        REFERENCES accounts (id)
) ENGINE=InnoDB;

CREATE TABLE deviation_audits (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    deviation_id CHAR(36) NOT NULL,
    change_type VARCHAR(32) NOT NULL,
    before_type VARCHAR(32) NULL,
    after_type VARCHAR(32) NULL,
    before_classification VARCHAR(20) NULL,
    after_classification VARCHAR(20) NULL,
    actor_account_id CHAR(36) NULL,
    audit_reason VARCHAR(2000) NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_deviation_audit_history (deviation_id, created_at),
    CONSTRAINT chk_deviation_audit_change CHECK (change_type IN ('CREATED', 'TYPE_REPLACED', 'CLASSIFICATION_CHANGED')),
    CONSTRAINT fk_deviation_audit_deviation FOREIGN KEY (deviation_id, company_id)
        REFERENCES deviations (id, company_id),
    CONSTRAINT fk_deviation_audit_actor FOREIGN KEY (actor_account_id) REFERENCES accounts (id)
) ENGINE=InnoDB;
