package com.braja.fichaje.notifications;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Duration;
import org.junit.jupiter.api.Test;

class NotificationRetryPolicyTest {
    private final NotificationRetryPolicy policy = new NotificationRetryPolicy();

    @Test
    void usesBoundedExponentialBackoff() {
        assertEquals(Duration.ofSeconds(5), policy.delayForAttempt(1));
        assertEquals(Duration.ofSeconds(10), policy.delayForAttempt(2));
        assertEquals(Duration.ofHours(1), policy.delayForAttempt(12));
    }
}
