package com.braja.fichaje.timekeeping;

import java.time.Duration;

final class DeviationWorkerRetryPolicy {
    private static final int MAX_FAILURE_COUNT = 16;
    private static final Duration INITIAL_DELAY = Duration.ofSeconds(30);
    private static final Duration MAX_DELAY = Duration.ofHours(1);

    int nextFailureCount(int currentFailureCount) {
        if (currentFailureCount < 0) throw new IllegalArgumentException("Failure count cannot be negative");
        return currentFailureCount >= MAX_FAILURE_COUNT ? MAX_FAILURE_COUNT : currentFailureCount + 1;
    }

    Duration delayForFailure(int failureCount) {
        if (failureCount < 1) throw new IllegalArgumentException("Failure count must be positive");
        Duration delay = INITIAL_DELAY;
        for (int i = 1; i < failureCount && delay.compareTo(MAX_DELAY) < 0; i++) {
            delay = delay.multipliedBy(2);
            if (delay.compareTo(MAX_DELAY) > 0) delay = MAX_DELAY;
        }
        return delay;
    }
}
