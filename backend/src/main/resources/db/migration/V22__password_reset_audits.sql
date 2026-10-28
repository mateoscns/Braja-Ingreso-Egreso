-- Issue #54 (D-20261027-09): an ADMIN resets the password of an employee that belongs only to the active company.
-- One row per reset, written in the same transaction; it never stores the temporary password nor its hash.
-- The composite foreign keys keep the employee, the target account and the acting ADMIN inside the same company.
-- Revert: DROP TABLE password_reset_audits; (the previous backend image never reads this table)
CREATE TABLE password_reset_audits (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    account_id CHAR(36) NOT NULL,
    actor_account_id CHAR(36) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_password_reset_employee (company_id, employee_id, created_at),
    CONSTRAINT fk_password_reset_employee FOREIGN KEY (employee_id, company_id)
        REFERENCES employees (id, company_id),
    CONSTRAINT fk_password_reset_account FOREIGN KEY (company_id, account_id)
        REFERENCES company_memberships (company_id, account_id),
    CONSTRAINT fk_password_reset_actor FOREIGN KEY (company_id, actor_account_id)
        REFERENCES company_memberships (company_id, account_id)
) ENGINE=InnoDB;
