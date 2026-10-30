-- Issue #67, owner decision 2026-10-30: identify whether the site's center came from browser capture or manual entry.
-- Revert: ALTER TABLE site_location_audits DROP CHECK chk_site_location_audit_source, DROP COLUMN location_source;
ALTER TABLE site_location_audits
    ADD COLUMN location_source VARCHAR(12) NULL AFTER after_radius_meters,
    ADD CONSTRAINT chk_site_location_audit_source CHECK (location_source IS NULL OR location_source IN ('CAPTURED', 'MANUAL'));
