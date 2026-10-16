package com.braja.fichaje.notifications;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.Test;

class NotificationWindowPolicyTest {

    private final NotificationWindowPolicy policy = new NotificationWindowPolicy();

    @Test
    void groupsEventsForFiveMinutesFromTheFirstEventWithoutExtendingTheWindow() {
        Instant first = Instant.parse("2026-10-16T12:02:17.123456Z");

        assertEquals(first.plus(Duration.ofMinutes(5)), policy.endAt(first));
        assertEquals(first, policy.startForEvent(first, first.plus(Duration.ofMinutes(5)).minusNanos(1)));
        assertEquals(first.plus(Duration.ofMinutes(5)),
                policy.startForEvent(first, first.plus(Duration.ofMinutes(5))));
    }
}
