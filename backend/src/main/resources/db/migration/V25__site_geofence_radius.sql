-- Issue #67: persist the ADMIN-configured geofence radius for each site.
-- Revert: ALTER TABLE sites DROP CHECK chk_site_geofence_radius_range, DROP COLUMN geofence_radius_meters;
ALTER TABLE sites
    ADD COLUMN geofence_radius_meters SMALLINT NOT NULL DEFAULT 100,
    ADD CONSTRAINT chk_site_geofence_radius_range CHECK (geofence_radius_meters BETWEEN 50 AND 500);
