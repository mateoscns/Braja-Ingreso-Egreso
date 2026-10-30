-- Local proposal: persist optional coordinates selected by the ADMIN during site creation.
-- Revert: ALTER TABLE sites DROP CHECK chk_sites_location_pair, DROP CHECK chk_sites_longitude_range, DROP CHECK chk_sites_latitude_range, DROP COLUMN longitude, DROP COLUMN latitude;
ALTER TABLE sites
    ADD COLUMN latitude DECIMAL(10,7) NULL,
    ADD COLUMN longitude DECIMAL(10,7) NULL,
    ADD CONSTRAINT chk_sites_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD CONSTRAINT chk_sites_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    ADD CONSTRAINT chk_sites_location_pair CHECK ((latitude IS NULL) = (longitude IS NULL));
