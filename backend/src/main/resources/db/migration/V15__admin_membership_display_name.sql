-- Issue #35: name of the ADMIN created by the first-admin bootstrap (employees hold the names of everyone else).
-- Nullable so the previous image and existing rows stay valid (expand step); no backfill: no stored name exists.
-- Revert: ALTER TABLE company_memberships DROP COLUMN display_name;
ALTER TABLE company_memberships ADD COLUMN display_name VARCHAR(160) NULL;
