-- Issue #53 (D-20261027-07): an ADMIN may cancel a declared jornada that has no marks, with author, time and a required
-- reason. A cancelled jornada no longer blocks a new declaration of the same employee, site and date: the uniqueness that
-- replaces uq_jornada_employee_site_date (V2) ignores CANCELADA rows through active_local_date (NULL when cancelled), and keeps
-- the last-defence property of CLAUDE.md rule 10 for every other jornada. One ALTER TABLE statement (rule 19).
-- Revert: the previous schema cannot hold cancelled jornadas. First delete (or restore from the pre-migration backup) every
-- CANCELADA jornada together with its deviation_audits, notification_outbox_events and deviations rows (in that order, FKs),
-- and make sure no two remaining jornadas share employee, site and date. Then run:
--   ALTER TABLE jornadas DROP FOREIGN KEY fk_jornada_canceller, DROP CHECK chk_jornada_cancellation, DROP CHECK chk_jornada_state,
--     ADD CONSTRAINT chk_jornada_state CHECK (state IN ('NO_INGRESO', 'EN_CURSO', 'PAUSA_ABIERTA', 'EGRESADA')),
--     DROP INDEX uq_jornada_employee_site_active_date, ADD UNIQUE KEY uq_jornada_employee_site_date (employee_id, site_id, local_date),
--     DROP COLUMN active_local_date, DROP COLUMN cancel_reason, DROP COLUMN cancelled_by, DROP COLUMN cancelled_at;
-- and delete the V19 row from flyway_schema_history.
-- ROLLBACK WARNING: the previous backend image accepts marks on a CANCELADA jornada and its state update then fails
-- chk_jornada_cancellation (500). Rolling back the image requires the revert procedure above first.
-- Note: the STORED generated column and the new FK rebuild the table (ALGORITHM=COPY); accepted because the table is small.
ALTER TABLE jornadas
    ADD COLUMN cancelled_at DATETIME(6) NULL,
    ADD COLUMN cancelled_by CHAR(36) NULL,
    ADD COLUMN cancel_reason VARCHAR(2000) NULL,
    ADD COLUMN active_local_date DATE GENERATED ALWAYS AS (CASE WHEN state = 'CANCELADA' THEN NULL ELSE local_date END) STORED,
    DROP INDEX uq_jornada_employee_site_date,
    ADD UNIQUE KEY uq_jornada_employee_site_active_date (company_id, employee_id, site_id, active_local_date),
    DROP CHECK chk_jornada_state,
    ADD CONSTRAINT chk_jornada_state CHECK (state IN ('NO_INGRESO', 'EN_CURSO', 'PAUSA_ABIERTA', 'EGRESADA', 'CANCELADA')),
    ADD CONSTRAINT chk_jornada_cancellation CHECK (
        (state = 'CANCELADA' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancel_reason IS NOT NULL)
        OR (state <> 'CANCELADA' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)),
    ADD CONSTRAINT fk_jornada_canceller FOREIGN KEY (cancelled_by) REFERENCES accounts (id);
