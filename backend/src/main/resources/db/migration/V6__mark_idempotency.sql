CREATE TABLE mark_idempotency (
    account_id CHAR(36) NOT NULL,
    idempotency_key CHAR(36) NOT NULL,
    request_hash CHAR(64) NOT NULL,
    response_body JSON NOT NULL,
    mark_id CHAR(36) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (account_id, idempotency_key),
    UNIQUE KEY uq_idempotency_mark (mark_id),
    KEY ix_idempotency_created_at (created_at),
    CONSTRAINT fk_idempotency_account FOREIGN KEY (account_id) REFERENCES accounts (id),
    CONSTRAINT fk_idempotency_mark FOREIGN KEY (mark_id) REFERENCES mark_events (id)
) ENGINE=InnoDB;
