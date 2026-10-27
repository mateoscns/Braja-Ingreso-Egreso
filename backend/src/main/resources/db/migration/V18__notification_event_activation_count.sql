-- Issue #47: a retracted deviation that is re-activated is a new fact and must notify again. The outbox keeps
-- one event per deviation (uq_notification_event_deviation) and records how many CREATED audits it has seen;
-- a higher count moves the event to an open window. Nullable (expand step): NULL rows are treated as current.
-- Revert: ALTER TABLE notification_outbox_events DROP COLUMN deviation_activation_count;
ALTER TABLE notification_outbox_events ADD COLUMN deviation_activation_count INT UNSIGNED NULL;
