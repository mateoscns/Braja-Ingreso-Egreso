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
    void missingEgressRequiresIngressNoEgressAndStrictlyExceedingTheTolerance() {
        Instant deadline = scheduledEnd.plus(Duration.ofMinutes(10));
        assertEquals(Optional.empty(), policy.missingEgress(scheduledEnd, 10, deadline, true, false));
        assertEquals(Optional.of(DeviationType.MARCA_FALTANTE),
                policy.missingEgress(scheduledEnd, 10, deadline.plusSeconds(1), true, false));
        assertEquals(Optional.empty(), policy.missingEgress(scheduledEnd, 10, deadline.plusSeconds(1), false, false));
        assertEquals(Optional.empty(), policy.missingEgress(scheduledEnd, 10, deadline.plusSeconds(1), true, true));
    }

    @Test
    void missingEgressIsInternalOnlyAndNeverPushEligible() {
        assertTrue(!DeviationType.MARCA_FALTANTE.isPushEligible());
    }

    @Test
    void pauseOnlyDeviatesWhenItsDurationExceedsTheTemplateLimit() {
        assertTrue(policy.pause(Duration.ofMinutes(15), 15, DeviationType.EXCESO_DESAYUNO).isEmpty());
        assertEquals(Optional.of(DeviationType.EXCESO_ALMUERZO),
                policy.pause(Duration.ofMinutes(15).plusSeconds(1), 15, DeviationType.EXCESO_ALMUERZO));
    }

    // D-20261102-02: the jobs look at the last 7 local days, today included.
    @Test
    void theJobsOldestDateIsSixDaysBeforeTodaySoTheWindowHoldsSevenLocalDays() {
        assertEquals(java.time.LocalDate.parse("2027-02-23"), policy.oldestJobDate(java.time.LocalDate.parse("2027-03-01")));
        assertEquals(7, DeviationPolicy.JOB_LOOKBACK_DAYS);
    }

    // D-20261102-03: a push only for a fact detected at most 2 h after it happened.
    @Test
    void aDeviationIsFreshForAPushUpToExactlyTwoHoursAfterItsFact() {
        Instant due = scheduledStart.plus(Duration.ofMinutes(10));
        assertTrue(policy.freshForPush(due, due));
        assertTrue(policy.freshForPush(due, due.plus(Duration.ofHours(2))));
        assertEquals(false, policy.freshForPush(due, due.plus(Duration.ofHours(2)).plusNanos(1000)));
        assertTrue(policy.freshForPush(due, due.minusSeconds(1)), "a fact after its detection (clock skew) still notifies");
    }
}
