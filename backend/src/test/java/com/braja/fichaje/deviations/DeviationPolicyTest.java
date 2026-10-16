package com.braja.fichaje.deviations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class DeviationPolicyTest {

    private final DeviationPolicy policy = new DeviationPolicy();
    private final Instant scheduledStart = Instant.parse("2026-10-16T12:00:00Z");
    private final Instant scheduledEnd = Instant.parse("2026-10-16T20:00:00Z");

    @Test
    void lateArrivalRequiresStrictlyExceedingTheCapturedTolerance() {
        assertEquals(Optional.empty(), policy.arrival(scheduledStart, 10,
                scheduledStart.plus(Duration.ofMinutes(10))));
        assertEquals(Optional.of(DeviationType.LLEGADA_TARDE), policy.arrival(scheduledStart, 10,
                scheduledStart.plus(Duration.ofMinutes(10)).plusSeconds(1)));
    }

    @Test
    void earlyAndLateEgressOnlyDeviateOutsideTheInclusiveToleranceWindow() {
        assertEquals(Optional.empty(), policy.egress(scheduledEnd, 10,
                scheduledEnd.minus(Duration.ofMinutes(10))));
        assertEquals(Optional.empty(), policy.egress(scheduledEnd, 10,
                scheduledEnd.plus(Duration.ofMinutes(10))));
        assertEquals(Optional.of(DeviationType.EGRESO_TEMPRANO), policy.egress(scheduledEnd, 10,
                scheduledEnd.minus(Duration.ofMinutes(10)).minusSeconds(1)));
        assertEquals(Optional.of(DeviationType.EGRESO_TARDIO), policy.egress(scheduledEnd, 10,
                scheduledEnd.plus(Duration.ofMinutes(10)).plusSeconds(1)));
    }

    @Test
    void pauseOnlyDeviatesWhenItsDurationExceedsTheTemplateLimit() {
        assertTrue(policy.pause(Duration.ofMinutes(15), 15, DeviationType.EXCESO_DESAYUNO).isEmpty());
        assertEquals(Optional.of(DeviationType.EXCESO_ALMUERZO),
                policy.pause(Duration.ofMinutes(15).plusSeconds(1), 15, DeviationType.EXCESO_ALMUERZO));
    }
}
