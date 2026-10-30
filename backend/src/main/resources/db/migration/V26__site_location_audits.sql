-- Issue #67: retain each ADMIN change to a site's center and geofence radius.
-- Revert: DROP TABLE site_location_audits;
CREATE TABLE site_location_audits (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    site_id CHAR(36) NOT NULL,
    actor_account_id CHAR(36) NOT NULL,
    before_latitude DECIMAL(10,7) NULL,
    before_longitude DECIMAL(10,7) NULL,
    before_radius_meters SMALLINT NULL,
    after_latitude DECIMAL(10,7) NULL,
    after_longitude DECIMAL(10,7) NULL,
    after_radius_meters SMALLINT NOT NULL,
    changed_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    KEY ix_site_location_audit_tenant_site_changed (company_id, site_id, changed_at, id),
    CONSTRAINT chk_site_location_audit_before_center CHECK ((before_latitude IS NULL) = (before_longitude IS NULL)),
    CONSTRAINT chk_site_location_audit_after_center CHECK ((after_latitude IS NULL) = (after_longitude IS NULL)),
    CONSTRAINT chk_site_location_audit_before_latitude_range CHECK (before_latitude IS NULL OR before_latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_site_location_audit_before_longitude_range CHECK (before_longitude IS NULL OR before_longitude BETWEEN -180 AND 180),
    CONSTRAINT chk_site_location_audit_after_latitude_range CHECK (after_latitude IS NULL OR after_latitude BETWEEN -90 AND 90),
    CONSTRAINT chk_site_location_audit_after_longitude_range CHECK (after_longitude IS NULL OR after_longitude BETWEEN -180 AND 180),
    CONSTRAINT chk_site_location_audit_before_radius CHECK (before_radius_meters IS NULL OR before_radius_meters BETWEEN 50 AND 500),
    CONSTRAINT chk_site_location_audit_after_radius CHECK (after_radius_meters BETWEEN 50 AND 500),
    CONSTRAINT fk_site_location_audit_site FOREIGN KEY (site_id, company_id)
        REFERENCES sites (id, company_id),
    CONSTRAINT fk_site_location_audit_actor FOREIGN KEY (company_id, actor_account_id)
        REFERENCES company_memberships (company_id, account_id)
) ENGINE=InnoDB;
