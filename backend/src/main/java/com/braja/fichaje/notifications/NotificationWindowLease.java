package com.braja.fichaje.notifications;

import java.time.Instant;
import java.util.UUID;

record NotificationWindowLease(UUID id, UUID companyId, Instant windowStartedAt,
                               UUID leaseToken, int attemptCount) {
}
