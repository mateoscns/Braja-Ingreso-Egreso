package com.braja.fichaje.notifications;

import java.time.Instant;
import java.util.UUID;

public interface DeviationNotificationPort {
    void enqueue(UUID companyId, UUID siteId, UUID deviationId, String deviationType, Instant occurredAt);
}
