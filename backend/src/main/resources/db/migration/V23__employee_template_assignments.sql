-- Issue #59 (D-20261015-02): the ADMIN assigns each employee a template with a start date, per site, and keeps the history.
-- Rows are never updated or deleted: a later valid_from supersedes. The template in force for (employee, site, date) is the
-- row with the latest valid_from on or before that date. The template FK includes site_id, so an assignment always points to a
-- template of its own site. One CREATE TABLE statement (rule 19).
-- Revert: no other table references this one, and declared jornadas keep their own template snapshot. Run:
--   DROP TABLE employee_template_assignments;
-- and delete the V23 row from flyway_schema_history (the assignment history is lost; take a backup first if it matters).
-- ROLLBACK WARNING: the previous backend image never reads the table and keeps working with it present, but it lets a template
-- with assignments move to another site, which fk_assignment_template rejects (500). Revert first if the image is rolled back.
CREATE TABLE employee_template_assignments (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    site_id CHAR(36) NOT NULL,
    template_id CHAR(36) NOT NULL,
    valid_from DATE NOT NULL,
    created_by CHAR(36) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_assignment_employee_site_from (employee_id, company_id, site_id, valid_from),
    CONSTRAINT fk_assignment_employee FOREIGN KEY (employee_id, company_id)
        REFERENCES employees (id, company_id),
    CONSTRAINT fk_assignment_site FOREIGN KEY (site_id, company_id)
        REFERENCES sites (id, company_id),
    CONSTRAINT fk_assignment_template FOREIGN KEY (template_id, company_id, site_id)
        REFERENCES schedule_templates (id, company_id, site_id),
    CONSTRAINT fk_assignment_creator FOREIGN KEY (created_by) REFERENCES accounts (id)
) ENGINE=InnoDB;
