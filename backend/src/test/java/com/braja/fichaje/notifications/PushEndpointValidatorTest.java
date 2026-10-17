package com.braja.fichaje.notifications;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Base64;
import org.junit.jupiter.api.Test;

class PushEndpointValidatorTest {

    private final PushEndpointValidator validator = new PushEndpointValidator();
    private final String publicKey = Base64.getUrlEncoder().withoutPadding().encodeToString(
            new byte[]{4, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                    20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
                    40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
                    60, 61, 62, 63, 64});
    private final String auth = Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]);

    @Test
    void acceptsSupportedBrowserPushServicesAndValidSubscriptionKeys() {
        assertDoesNotThrow(() -> validator.validate(new PushSubscriptionRequest(
                "https://fcm.googleapis.com/fcm/send/token", new PushSubscriptionRequest.Keys(publicKey, auth))));
        assertDoesNotThrow(() -> validator.validate(new PushSubscriptionRequest(
                "https://web.push.apple.com/token", new PushSubscriptionRequest.Keys(publicKey, auth))));
        assertDoesNotThrow(() -> validator.validate(new PushSubscriptionRequest(
                "https://updates.push.services.mozilla.com/wpush/v2/token",
                new PushSubscriptionRequest.Keys(publicKey, auth))));
    }

    @Test
    void rejectsHttpPrivateAndUnrecognizedEndpoints() {
        assertThrows(InvalidPushSubscriptionException.class, () -> validator.validate(new PushSubscriptionRequest(
                "http://fcm.googleapis.com/fcm/send/token", new PushSubscriptionRequest.Keys(publicKey, auth))));
        assertThrows(InvalidPushSubscriptionException.class, () -> validator.validate(new PushSubscriptionRequest(
                "https://127.0.0.1/private", new PushSubscriptionRequest.Keys(publicKey, auth))));
        assertThrows(InvalidPushSubscriptionException.class, () -> validator.validate(new PushSubscriptionRequest(
                "https://attacker.example/push", new PushSubscriptionRequest.Keys(publicKey, auth))));
        assertThrows(InvalidPushSubscriptionException.class, () -> validator.validate(new PushSubscriptionRequest(
                "https://user@fcm.googleapis.com/fcm/send/token",
                new PushSubscriptionRequest.Keys(publicKey, auth))));
    }

    @Test
    void rejectsMalformedBrowserKeys() {
        assertThrows(InvalidPushSubscriptionException.class, () -> validator.validate(new PushSubscriptionRequest(
                "https://fcm.googleapis.com/fcm/send/token", new PushSubscriptionRequest.Keys("not-a-key", auth))));
        assertThrows(InvalidPushSubscriptionException.class, () -> validator.validate(new PushSubscriptionRequest(
                "https://fcm.googleapis.com/fcm/send/token", new PushSubscriptionRequest.Keys(publicKey, "short"))));
    }
}
