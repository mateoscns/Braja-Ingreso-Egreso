package com.braja.fichaje.notifications;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.braja.fichaje.config.BrajaProperties;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PushSubscriptionCipherTest {

    private final UUID companyId = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private final UUID accountId = UUID.fromString("20000000-0000-0000-0000-000000000002");
    private final String endpointHash = "a".repeat(64);
    private final PushSubscriptionCipher cipher;

    PushSubscriptionCipherTest() {
        BrajaProperties properties = new BrajaProperties();
        properties.setPushSubscriptionEncryptionKeyBase64(Base64.getEncoder().encodeToString(new byte[32]));
        cipher = new PushSubscriptionCipher(properties);
    }

    @Test
    void encryptsAndDecryptsUsingTenantAndOwnerBoundAssociatedData() {
        PushSubscriptionMaterial original = new PushSubscriptionMaterial(
                "https://fcm.googleapis.com/fcm/send/private-token", "public-key", "auth-secret");

        EncryptedPushSecret encrypted = cipher.encrypt(companyId, accountId, endpointHash, original);

        assertEquals(original, cipher.decrypt(companyId, accountId, endpointHash, encrypted));
        assertThrows(PushSubscriptionEncryptionException.class,
                () -> cipher.decrypt(companyId, accountId, "b".repeat(64), encrypted));
        assertThrows(PushSubscriptionEncryptionException.class,
                () -> cipher.decrypt(UUID.randomUUID(), accountId, endpointHash, encrypted));
    }

    @Test
    void refusesEncryptionWhenTheDedicatedKeyIsNotConfigured() {
        PushSubscriptionCipher unconfigured = new PushSubscriptionCipher(new BrajaProperties());

        assertThrows(PushSubscriptionEncryptionException.class,
                () -> unconfigured.encrypt(companyId, accountId, endpointHash,
                        new PushSubscriptionMaterial("https://fcm.googleapis.com/x", "key", "auth")));
    }
}
