package com.braja.fichaje.notifications;

import java.time.Duration;

final class NotificationRetryPolicy {
    static final int MAX_ATTEMPTS = 12;
    private static final Duration INITIAL_DELAY = Duration.ofSeconds(5);
    private static final Duration MAX_DELAY = Duration.ofHours(1);

    Duration delayForAttempt(int attemptCount) {
        if (attemptCount < 1) {
            throw new IllegalArgumentException("El intento debe ser positivo.");
        }
        long multiplier = 1L << Math.min(attemptCount - 1, 20);
        Duration delay = INITIAL_DELAY.multipliedBy(multiplier);
        return delay.compareTo(MAX_DELAY) > 0 ? MAX_DELAY : delay;
    }
}
