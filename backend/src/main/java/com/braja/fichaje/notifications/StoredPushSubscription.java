package com.braja.fichaje.notifications;

import java.util.UUID;

record StoredPushSubscription(UUID id, UUID companyId, UUID accountId,
                              String endpointHash, EncryptedPushSecret secret) {
}
