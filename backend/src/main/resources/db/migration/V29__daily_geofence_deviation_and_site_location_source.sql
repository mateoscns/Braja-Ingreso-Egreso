-- Issue #67, owner decision 2026-10-30: one FUERA_DE_SEDE reason per jornada, with all marks retained in mark history.
-- Keep the earliest active deviation for each jornada. Older per-mark deviations and their motives/audits remain stored;
-- duplicate active rows are retracted and audited before replacing the per-mark unique index.
-- Revert requires restoring backed-up deviation active states and dropping any per-jornada duplicates created after this
-- migration before restoring the V28 per-mark index and removing the site location_source column/check.
INSERT INTO deviation_audits(id,company_id,deviation_id,change_type,before_type,created_at)
SELECT UUID(), duplicate_row.company_id, duplicate_row.id, 'RETRACTED', duplicate_row.type, CURRENT_TIMESTAMP(6)
FROM deviations duplicate_row
WHERE duplicate_row.active=TRUE AND duplicate_row.type='FUERA_DE_SEDE'
  AND EXISTS (
      SELECT 1 FROM deviations keeper
      WHERE keeper.company_id=duplicate_row.company_id
        AND keeper.jornada_id=duplicate_row.jornada_id
        AND keeper.type='FUERA_DE_SEDE' AND keeper.active=TRUE
        AND (keeper.created_at < duplicate_row.created_at
             OR (keeper.created_at = duplicate_row.created_at AND keeper.id < duplicate_row.id))
  );

UPDATE deviations duplicate_row
JOIN deviations keeper
  ON keeper.company_id=duplicate_row.company_id
 AND keeper.jornada_id=duplicate_row.jornada_id
 AND keeper.type='FUERA_DE_SEDE' AND keeper.active=TRUE
 AND (keeper.created_at < duplicate_row.created_at
      OR (keeper.created_at = duplicate_row.created_at AND keeper.id < duplicate_row.id))
SET duplicate_row.active=FALSE, duplicate_row.updated_at=CURRENT_TIMESTAMP(6)
WHERE duplicate_row.type='FUERA_DE_SEDE' AND duplicate_row.active=TRUE;

ALTER TABLE deviations
    DROP INDEX uq_deviation_active_source_mark_type,
    DROP COLUMN active_source_mark_type,
    ADD COLUMN active_jornada_geofence_type VARCHAR(32)
        GENERATED ALWAYS AS (CASE WHEN active AND type='FUERA_DE_SEDE' THEN type ELSE NULL END) STORED AFTER active_type,
    ADD UNIQUE INDEX uq_deviation_jornada_active_geofence_type (jornada_id, active_jornada_geofence_type);

ALTER TABLE site_location_audits
    ADD COLUMN location_source VARCHAR(12) NULL AFTER after_radius_meters,
    ADD CONSTRAINT chk_site_location_audit_source CHECK (location_source IS NULL OR location_source IN ('CAPTURED', 'MANUAL'));
