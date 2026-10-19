CREATE TABLE schedule_templates (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    site_id CHAR(36) NOT NULL,
    name VARCHAR(120) NOT NULL,
    breakfast_limit_minutes SMALLINT UNSIGNED NOT NULL,
    lunch_limit_minutes SMALLINT UNSIGNED NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_template_company_id (id, company_id),
    UNIQUE KEY uq_template_company_site_id (id, company_id, site_id),
    UNIQUE KEY uq_template_name_per_site (company_id, site_id, name),
    CONSTRAINT chk_template_breakfast_limit CHECK (breakfast_limit_minutes <= 240),
    CONSTRAINT chk_template_lunch_limit CHECK (lunch_limit_minutes <= 240),
    CONSTRAINT fk_template_site FOREIGN KEY (site_id, company_id)
        REFERENCES sites (id, company_id)
) ENGINE=InnoDB;

CREATE TABLE template_blocks (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    template_id CHAR(36) NOT NULL,
    sequence_number TINYINT UNSIGNED NOT NULL,
    start_day_offset TINYINT UNSIGNED NOT NULL,
    starts_at TIME NOT NULL,
    ends_at TIME NOT NULL,
    end_day_offset TINYINT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_template_block_sequence (template_id, sequence_number),
    CONSTRAINT chk_template_block_sequence CHECK (sequence_number BETWEEN 1 AND 4),
    CONSTRAINT chk_template_block_start_day_offset CHECK (start_day_offset IN (0, 1)),
    CONSTRAINT chk_template_block_day_offset CHECK (end_day_offset IN (0, 1)),
    CONSTRAINT fk_template_block_template FOREIGN KEY (template_id, company_id)
        REFERENCES schedule_templates (id, company_id)
) ENGINE=InnoDB;

CREATE TABLE jornadas (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    site_id CHAR(36) NOT NULL,
    template_id CHAR(36) NOT NULL,
    local_date DATE NOT NULL,
    time_zone VARCHAR(64) NOT NULL,
    schedule_snapshot JSON NOT NULL,
    tolerance_minutes SMALLINT UNSIGNED NOT NULL,
    scheduled_start_at DATETIME(6) NOT NULL,
    scheduled_end_at DATETIME(6) NOT NULL,
    state VARCHAR(24) NOT NULL DEFAULT 'NO_INGRESO',
    next_sequence BIGINT UNSIGNED NOT NULL DEFAULT 1,
    created_by CHAR(36) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_jornada_employee_site_date (employee_id, site_id, local_date),
    UNIQUE KEY uq_jornada_id_company (id, company_id),
    KEY ix_jornada_due_absence (scheduled_start_at, state),
    KEY ix_jornada_company_date (company_id, local_date),
    CONSTRAINT chk_jornada_tolerance CHECK (tolerance_minutes <= 240),
    CONSTRAINT chk_jornada_state CHECK (state IN ('NO_INGRESO', 'EN_CURSO', 'PAUSA_ABIERTA', 'EGRESADA')),
    CONSTRAINT fk_jornada_employee FOREIGN KEY (employee_id, company_id)
        REFERENCES employees (id, company_id),
    CONSTRAINT fk_jornada_site FOREIGN KEY (site_id, company_id)
        REFERENCES sites (id, company_id),
    CONSTRAINT fk_jornada_template FOREIGN KEY (template_id, company_id, site_id)
        REFERENCES schedule_templates (id, company_id, site_id),
    CONSTRAINT fk_jornada_creator FOREIGN KEY (created_by) REFERENCES accounts (id)
) ENGINE=InnoDB;
