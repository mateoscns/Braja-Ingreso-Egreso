CREATE TABLE notification_windows (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    window_started_at DATETIME(6) NOT NULL,
    window_ends_at DATETIME(6) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    attempt_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    next_attempt_at DATETIME(6) NOT NULL,
    lease_token CHAR(36) NULL,
    lease_until DATETIME(6) NULL,
    delivered_at DATETIME(6) NULL,
    last_error_code VARCHAR(64) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_notification_window_company_start (company_id, window_started_at),
    UNIQUE KEY uq_notification_window_id_company (id, company_id),
    KEY ix_notification_window_due (status, window_ends_at, next_attempt_at, lease_until),
    CONSTRAINT chk_notification_window_interval CHECK (window_ends_at > window_started_at),
    CONSTRAINT chk_notification_window_status CHECK (status IN ('PENDING', 'LEASED', 'RETRY', 'SENT', 'DEAD')),
    CONSTRAINT chk_notification_window_lease CHECK (
        (status = 'LEASED' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
        OR (status <> 'LEASED' AND lease_token IS NULL AND lease_until IS NULL)
    ),
    CONSTRAINT fk_notification_window_company FOREIGN KEY (company_id) REFERENCES companies (id)
) ENGINE=InnoDB;

CREATE TABLE notification_company_state (
    company_id CHAR(36) NOT NULL,
    active_window_id CHAR(36) NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (company_id),
    CONSTRAINT fk_notification_state_company FOREIGN KEY (company_id) REFERENCES companies (id),
    CONSTRAINT fk_notification_state_window FOREIGN KEY (active_window_id, company_id)
        REFERENCES notification_windows (id, company_id)
) ENGINE=InnoDB;

CREATE TABLE notification_outbox_events (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    site_id CHAR(36) NOT NULL,
    deviation_id CHAR(36) NOT NULL,
    deviation_type VARCHAR(32) NOT NULL,
    occurred_at DATETIME(6) NOT NULL,
    window_id CHAR(36) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_notification_event_deviation (deviation_id),
    KEY ix_notification_event_window_site (company_id, window_id, site_id),
    CONSTRAINT chk_notification_event_type CHECK (deviation_type IN ('SIN_INGRESO', 'LLEGADA_TARDE')),
    CONSTRAINT fk_notification_event_deviation FOREIGN KEY (deviation_id, company_id)
        REFERENCES deviations (id, company_id),
    CONSTRAINT fk_notification_event_site FOREIGN KEY (site_id, company_id)
        REFERENCES sites (id, company_id),
    CONSTRAINT fk_notification_event_window FOREIGN KEY (window_id, company_id)
        REFERENCES notification_windows (id, company_id)
) ENGINE=InnoDB;

CREATE TABLE push_subscriptions (
    id CHAR(36) NOT NULL,
    company_id CHAR(36) NOT NULL,
    account_id CHAR(36) NOT NULL,
    endpoint_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    secret_ciphertext VARBINARY(4096) NOT NULL,
    secret_iv BINARY(12) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_push_subscription_owner_endpoint (company_id, account_id, endpoint_hash),
    UNIQUE KEY uq_push_subscription_id_company (id, company_id),
    KEY ix_push_subscription_company_active (company_id, active, account_id),
    CONSTRAINT fk_push_subscription_membership FOREIGN KEY (company_id, account_id)
        REFERENCES company_memberships (company_id, account_id)
) ENGINE=InnoDB;
