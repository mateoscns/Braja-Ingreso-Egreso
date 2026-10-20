-- Revert: first remove or retype ALL MARCA_FALTANTE rows (active and inactive). Delete their
-- deviation_audits rows BEFORE the deviations rows (FK fk_deviation_audit_deviation). Then run:
--   ALTER TABLE deviations DROP CHECK chk_deviation_type, ADD CONSTRAINT chk_deviation_type CHECK (type IN ('SIN_INGRESO', 'LLEGADA_TARDE', 'EGRESO_TEMPRANO', 'EGRESO_TARDIO', 'EXCESO_DESAYUNO', 'EXCESO_ALMUERZO'));
-- Or restore from the pre-migration backup.
-- Note: ADD CHECK uses ALGORITHM=COPY and briefly blocks writes on deviations; accepted because the table is small.
-- ROLLBACK WARNING: once any MARCA_FALTANTE row exists, the previous backend image (whose DeviationType lacks
-- the constant) fails with IllegalArgumentException in deviation reads/reconcile. Rolling back the image
-- requires the revert procedure above first.
ALTER TABLE deviations
    DROP CHECK chk_deviation_type,
    ADD CONSTRAINT chk_deviation_type CHECK (type IN ('SIN_INGRESO', 'LLEGADA_TARDE', 'EGRESO_TEMPRANO', 'EGRESO_TARDIO', 'EXCESO_DESAYUNO', 'EXCESO_ALMUERZO', 'MARCA_FALTANTE'));
