package com.braja.fichaje.timekeeping;

import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DeviationWorkerRetryPolicyTest {
    private final DeviationWorkerRetryPolicy policy = new DeviationWorkerRetryPolicy();

    @Test
    void retryDelayIncreasesThenCapsAtOneHour() {
        assertEquals(Duration.ofSeconds(30), policy.delayForFailure(1));
        assertEquals(Duration.ofSeconds(60), policy.delayForFailure(2));
        assertEquals(Duration.ofSeconds(120), policy.delayForFailure(3));
        assertEquals(Duration.ofHours(1), policy.delayForFailure(8));
        assertEquals(Duration.ofHours(1), policy.delayForFailure(100));
    }

    @Test
    void failureCountIsBounded() {
        assertEquals(1, policy.nextFailureCount(0));
        assertEquals(16, policy.nextFailureCount(15));
        assertEquals(16, policy.nextFailureCount(16));
    }

    @Test
    void warnsOnFirstFailureAndAtRetryCeiling() {
        assertTrue(policy.shouldWarnOnFailure(0, 1));
        assertTrue(policy.shouldWarnOnFailure(15, 16));
        assertTrue(policy.shouldWarnOnFailure(16, 16));
        assertFalse(policy.shouldWarnOnFailure(1, 2));
    }

    @Test
    void rejectsInvalidFailureCounts() {
        assertThrows(IllegalArgumentException.class, () -> policy.nextFailureCount(-1));
        assertThrows(IllegalArgumentException.class, () -> policy.delayForFailure(0));
    }
}
