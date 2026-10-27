-- Issue #53 (D-20261027-08): an ADMIN may void a wrong mark with a required reason. The row is never deleted and keeps its
-- sequence number; a voided mark stops counting for the jornada state, transitions and deviations. One ALTER TABLE
-- statement (rule 19).
-- Revert: the previous schema cannot tell a voided mark from a valid one, and voided rows cannot simply be deleted
-- (mark_idempotency, forgotten_mark_audits, mark_correction_audits and deviations.source_mark_id reference them).
-- Restore from the pre-migration backup. Only on a database without voided marks may the columns be dropped:
--   ALTER TABLE mark_events DROP FOREIGN KEY fk_mark_voider, DROP CHECK chk_mark_void,
--     DROP COLUMN void_reason, DROP COLUMN voided_by, DROP COLUMN voided_at;
-- and delete the V20 row from flyway_schema_history.
-- ROLLBACK WARNING: the previous backend image ignores voided_at and would count voided marks again, which can leave a stored
-- history that its transition policy rejects. Rolling back the image requires the revert procedure above first.
ALTER TABLE mark_events
    ADD COLUMN voided_at DATETIME(6) NULL,
    ADD COLUMN voided_by CHAR(36) NULL,
    ADD COLUMN void_reason VARCHAR(2000) NULL,
    ADD CONSTRAINT chk_mark_void CHECK (
        (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
        OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)),
    ADD CONSTRAINT fk_mark_voider FOREIGN KEY (voided_by) REFERENCES accounts (id);
