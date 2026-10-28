-- Issue #53 (D-20261027-08, rule 6): the void of a mark is audited in mark_correction_audits with change_kind VOID (actor,
-- time and reason; before and after values equal). Existing rows and corrections keep CORRECTION. One ALTER TABLE statement.
-- Revert: first delete the mark_correction_audits rows whose change_kind is VOID (only after reverting V20, or restore from the
-- pre-migration backup), then run:
--   ALTER TABLE mark_correction_audits DROP CHECK chk_mark_correction_kind, DROP COLUMN change_kind;
-- and delete the V21 row from flyway_schema_history.
-- ROLLBACK WARNING: the previous backend image never writes or reads change_kind, so it keeps working with the column present.
ALTER TABLE mark_correction_audits
    ADD COLUMN change_kind VARCHAR(16) NOT NULL DEFAULT 'CORRECTION',
    ADD CONSTRAINT chk_mark_correction_kind CHECK (change_kind IN ('CORRECTION', 'VOID'));
