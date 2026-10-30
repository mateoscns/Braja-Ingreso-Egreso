-- Issue #67 proposal: allow one active FUERA_DE_SEDE deviation per employee mark; other types remain unique per jornada.
-- Revert: first back up all FUERA_DE_SEDE deviations and their audit/motive data. Delete any notification_outbox_events for those
--   deviations, then their deviation_audits, then the deviations themselves. After verifying that active non-FUERA_DE_SEDE rows
--   have no duplicate (jornada_id,type), run:
--   ALTER TABLE deviations DROP INDEX uq_deviation_active_source_mark_type, DROP INDEX uq_deviation_jornada_active_type,
--     DROP CHECK chk_deviation_fuera_source_mark, DROP CHECK chk_deviation_type,
--     DROP COLUMN active_source_mark_type, DROP COLUMN active_type,
--     ADD COLUMN active_type VARCHAR(32) GENERATED ALWAYS AS (CASE WHEN active THEN type ELSE NULL END) STORED AFTER active,
--     ADD CONSTRAINT chk_deviation_type CHECK (type IN ('SIN_INGRESO', 'LLEGADA_TARDE', 'EGRESO_TEMPRANO', 'EGRESO_TARDIO', 'EXCESO_DESAYUNO', 'EXCESO_ALMUERZO', 'MARCA_FALTANTE')),
--     ADD UNIQUE INDEX uq_deviation_jornada_active_type ON deviations (jornada_id, active_type);
ALTER TABLE deviations
    DROP INDEX uq_deviation_jornada_active_type,
    DROP COLUMN active_type,
    ADD COLUMN active_type VARCHAR(32) GENERATED ALWAYS AS (CASE WHEN active AND type <> 'FUERA_DE_SEDE' THEN type ELSE NULL END) STORED AFTER active,
    ADD COLUMN active_source_mark_type VARCHAR(32) GENERATED ALWAYS AS (CASE WHEN active AND type = 'FUERA_DE_SEDE' THEN type ELSE NULL END) STORED AFTER active_type,
    DROP CHECK chk_deviation_type,
    ADD CONSTRAINT chk_deviation_type CHECK (type IN ('SIN_INGRESO', 'LLEGADA_TARDE', 'EGRESO_TEMPRANO', 'EGRESO_TARDIO', 'EXCESO_DESAYUNO', 'EXCESO_ALMUERZO', 'MARCA_FALTANTE', 'FUERA_DE_SEDE')),
    ADD CONSTRAINT chk_deviation_fuera_source_mark CHECK (type <> 'FUERA_DE_SEDE' OR source_mark_id IS NOT NULL),
    ADD UNIQUE INDEX uq_deviation_jornada_active_type (jornada_id, active_type),
    ADD UNIQUE INDEX uq_deviation_active_source_mark_type (company_id, source_mark_id, active_source_mark_type);
