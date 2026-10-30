-- Issue #67, owner decision 2026-10-30: the existing unique index allows one active deviation of each type per jornada.
-- Revert: ALTER TABLE deviations DROP CHECK chk_deviation_type, DROP CHECK chk_deviation_fuera_source_mark, ADD CONSTRAINT chk_deviation_type CHECK (type IN ('SIN_INGRESO', 'LLEGADA_TARDE', 'EGRESO_TEMPRANO', 'EGRESO_TARDIO', 'EXCESO_DESAYUNO', 'EXCESO_ALMUERZO', 'MARCA_FALTANTE'));
-- Precondition: preserve/remove FUERA_DE_SEDE rows and dependent audits/outbox events before applying the revert.
ALTER TABLE deviations
    DROP CHECK chk_deviation_type,
    ADD CONSTRAINT chk_deviation_type CHECK (type IN ('SIN_INGRESO', 'LLEGADA_TARDE', 'EGRESO_TEMPRANO', 'EGRESO_TARDIO', 'EXCESO_DESAYUNO', 'EXCESO_ALMUERZO', 'MARCA_FALTANTE', 'FUERA_DE_SEDE')),
    ADD CONSTRAINT chk_deviation_fuera_source_mark CHECK (type <> 'FUERA_DE_SEDE' OR source_mark_id IS NOT NULL);
