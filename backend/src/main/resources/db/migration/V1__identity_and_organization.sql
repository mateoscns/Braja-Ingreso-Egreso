CREATE TABLE companies (
    id CHAR(36) NOT NULL,
    name VARCHAR(120) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE sites (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    name VARCHAR(120) NOT NULL,
    time_zone VARCHAR(64) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_site_company_id (id, company_id),
    UNIQUE KEY uq_site_name_per_company (company_id, name),
    CONSTRAINT fk_site_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB;

CREATE TABLE accounts (
    id CHAR(36) NOT NULL,
    dni_normalized VARCHAR(12) NOT NULL,
    dni_display VARCHAR(16) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_account_dni (dni_normalized)
) ENGINE=InnoDB;

CREATE TABLE company_memberships (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    account_id CHAR(36) NOT NULL,
    role VARCHAR(16) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_membership_company_account (company_id, account_id),
    UNIQUE KEY uq_membership_company_account_role (company_id, account_id, role),
    CONSTRAINT chk_membership_role CHECK (role IN ('ADMIN', 'EMPLOYEE')),
    CONSTRAINT fk_membership_company FOREIGN KEY (company_id) REFERENCES companies (id),
    CONSTRAINT fk_membership_account FOREIGN KEY (account_id) REFERENCES accounts (id)
) ENGINE=InnoDB;

CREATE TABLE employees (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    account_id CHAR(36) NOT NULL,
    display_name VARCHAR(160) NOT NULL,
    tolerance_minutes SMALLINT UNSIGNED NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_employee_company_id (id, company_id),
    UNIQUE KEY uq_employee_company_account (company_id, account_id),
    CONSTRAINT chk_employee_tolerance CHECK (tolerance_minutes <= 240),
    CONSTRAINT fk_employee_membership FOREIGN KEY (company_id, account_id)
        REFERENCES company_memberships (company_id, account_id),
    CONSTRAINT fk_employee_account FOREIGN KEY (account_id) REFERENCES accounts (id)
) ENGINE=InnoDB;

CREATE TABLE employee_sites (
    company_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    site_id CHAR(36) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (employee_id, site_id),
    CONSTRAINT fk_employee_site_employee FOREIGN KEY (employee_id, company_id)
        REFERENCES employees (id, company_id),
    CONSTRAINT fk_employee_site_site FOREIGN KEY (site_id, company_id)
        REFERENCES sites (id, company_id)
) ENGINE=InnoDB;

CREATE TABLE bootstrap_guard (
    id TINYINT NOT NULL,
    consumed_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_bootstrap_guard_singleton CHECK (id = 1)
) ENGINE=InnoDB;

INSERT INTO bootstrap_guard (id, consumed_at) VALUES (1, NULL);
