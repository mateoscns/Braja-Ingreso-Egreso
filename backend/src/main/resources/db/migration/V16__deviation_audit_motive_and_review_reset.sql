-- Issue #43 (D-20261027-01, D-20261027-02): audit motive submissions and corrections, and the reset of a classification
-- when the deviation goes back to review (type change, reactivation, or a first motive after classification).
-- Revert: first delete the deviation_audits rows whose change_type is MOTIVE_SUBMITTED, MOTIVE_CORRECTED or CLASSIFICATION_RESET
-- (or restore from the pre-migration backup), then run:
--   ALTER TABLE deviation_audits DROP CHECK chk_deviation_audit_change, ADD CONSTRAINT chk_deviation_audit_change CHECK (change_type IN ('CREATED', 'TYPE_REPLACED', 'CLASSIFICATION_CHANGED', 'RETRACTED'));
-- ROLLBACK WARNING: the previous backend image never writes these values but reads nothing from change_type, so it keeps working.
ALTER TABLE deviation_audits
    DROP CHECK chk_deviation_audit_change,
    ADD CONSTRAINT chk_deviation_audit_change CHECK (change_type IN ('CREATED', 'TYPE_REPLACED', 'CLASSIFICATION_CHANGED', 'RETRACTED',
        'MOTIVE_SUBMITTED', 'MOTIVE_CORRECTED', 'CLASSIFICATION_RESET'));
