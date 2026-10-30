-- Issue #67 proposal: freeze the site's geofence at jornada declaration. Existing jornadas keep NULL and are not evaluated retroactively.
-- Revert: ALTER TABLE jornadas DROP CHECK chk_jornada_site_geofence_snapshot, DROP CHECK chk_jornada_site_geofence_radius,
--   DROP CHECK chk_jornada_site_geofence_longitude_range, DROP CHECK chk_jornada_site_geofence_latitude_range,
--   DROP COLUMN site_geofence_latitude_snapshot, DROP COLUMN site_geofence_longitude_snapshot, DROP COLUMN site_geofence_radius_snapshot;
ALTER TABLE jornadas
    ADD COLUMN site_geofence_latitude_snapshot DECIMAL(10,7) NULL AFTER schedule_snapshot,
    ADD COLUMN site_geofence_longitude_snapshot DECIMAL(10,7) NULL AFTER site_geofence_latitude_snapshot,
    ADD COLUMN site_geofence_radius_snapshot SMALLINT NULL AFTER site_geofence_longitude_snapshot,
    ADD CONSTRAINT chk_jornada_site_geofence_latitude_range CHECK (site_geofence_latitude_snapshot IS NULL OR site_geofence_latitude_snapshot BETWEEN -90 AND 90),
    ADD CONSTRAINT chk_jornada_site_geofence_longitude_range CHECK (site_geofence_longitude_snapshot IS NULL OR site_geofence_longitude_snapshot BETWEEN -180 AND 180),
    ADD CONSTRAINT chk_jornada_site_geofence_radius CHECK (site_geofence_radius_snapshot IS NULL OR site_geofence_radius_snapshot BETWEEN 50 AND 500),
    ADD CONSTRAINT chk_jornada_site_geofence_snapshot CHECK (
        (site_geofence_latitude_snapshot IS NULL AND site_geofence_longitude_snapshot IS NULL AND site_geofence_radius_snapshot IS NULL)
        OR (site_geofence_latitude_snapshot IS NOT NULL AND site_geofence_longitude_snapshot IS NOT NULL AND site_geofence_radius_snapshot IS NOT NULL)
    );
