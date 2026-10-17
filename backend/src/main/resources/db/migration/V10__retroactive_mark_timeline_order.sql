ALTER TABLE mark_events
    ADD COLUMN timeline_order BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER sequence_number;

UPDATE mark_events
SET timeline_order = sequence_number * 1000;

CREATE INDEX ix_mark_jornada_timeline
    ON mark_events (company_id, jornada_id, timeline_order, sequence_number);
