package com.braja.fichaje.deviations;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Objects;
import java.util.Optional;

public final class DeviationPolicy {
    /**
     * D-20261102-02: the absence and MARCA_FALTANTE jobs only consider jornadas whose local date falls in the last 7 local days,
     * today included; older jornadas are never flagged automatically (a first deploy or a reactivation does not flag months).
     */
    public static final int JOB_LOOKBACK_DAYS = 7;
    /**
     * D-20261102-03: a push-eligible deviation queues a push only when it is detected at most 2 h after its fact (SIN_INGRESO:
     * first block start + tolerance; LLEGADA_TARDE: the ingress mark's time). Older facts are still recorded, without a push.
     */
    public static final Duration PUSH_FRESHNESS = Duration.ofHours(2);

    /** The oldest local date the deviation jobs still consider when the jornada's local date today is {@code today}. */
    public LocalDate oldestJobDate(LocalDate today) {
        return Objects.requireNonNull(today, "today").minusDays(JOB_LOOKBACK_DAYS - 1L);
    }

    /** Whether a deviation whose fact happened at {@code occurredAt} and is detected at {@code detectedAt} still notifies. */
    public boolean freshForPush(Instant occurredAt, Instant detectedAt) {
        Objects.requireNonNull(occurredAt, "occurredAt");
        Objects.requireNonNull(detectedAt, "detectedAt");
        return !detectedAt.isAfter(occurredAt.plus(PUSH_FRESHNESS));
    }

    public Optional<DeviationType> arrival(Instant scheduledStart, int toleranceMinutes, Instant occurredAt) {
        validateTolerance(toleranceMinutes);
        Objects.requireNonNull(scheduledStart, "scheduledStart");
        Objects.requireNonNull(occurredAt, "occurredAt");
        Instant deadline = scheduledStart.plus(Duration.ofMinutes(toleranceMinutes));
        return occurredAt.isAfter(deadline) ? Optional.of(DeviationType.LLEGADA_TARDE) : Optional.empty();
    }

    public Optional<DeviationType> absence(Instant scheduledStart, int toleranceMinutes, Instant now,
                                           boolean hasIngress) {
        validateTolerance(toleranceMinutes);
        Objects.requireNonNull(scheduledStart, "scheduledStart");
        Objects.requireNonNull(now, "now");
        Instant deadline = scheduledStart.plus(Duration.ofMinutes(toleranceMinutes));
        return !hasIngress && now.isAfter(deadline) ? Optional.of(DeviationType.SIN_INGRESO) : Optional.empty();
    }

    public Optional<DeviationType> missingEgress(Instant scheduledEnd, int toleranceMinutes, Instant now,
                                                 boolean hasIngress, boolean hasEgress) {
        validateTolerance(toleranceMinutes);
        Objects.requireNonNull(scheduledEnd, "scheduledEnd");
        Objects.requireNonNull(now, "now");
        Instant deadline = scheduledEnd.plus(Duration.ofMinutes(toleranceMinutes));
        return hasIngress && !hasEgress && now.isAfter(deadline)
                ? Optional.of(DeviationType.MARCA_FALTANTE) : Optional.empty();
    }

    public Optional<DeviationType> egress(Instant scheduledEnd, int toleranceMinutes, Instant occurredAt) {
        validateTolerance(toleranceMinutes);
        Objects.requireNonNull(scheduledEnd, "scheduledEnd");
        Objects.requireNonNull(occurredAt, "occurredAt");
        Duration tolerance = Duration.ofMinutes(toleranceMinutes);
        if (occurredAt.isBefore(scheduledEnd.minus(tolerance))) {
            return Optional.of(DeviationType.EGRESO_TEMPRANO);
        }
        if (occurredAt.isAfter(scheduledEnd.plus(tolerance))) {
            return Optional.of(DeviationType.EGRESO_TARDIO);
        }
        return Optional.empty();
    }

    public Optional<DeviationType> pause(Duration actual, int limitMinutes, DeviationType type) {
        Objects.requireNonNull(actual, "actual");
        if (limitMinutes < 0 || limitMinutes > 240) {
            throw new IllegalArgumentException("El límite de pausa debe estar entre 0 y 240 minutos.");
        }
        if (type != DeviationType.EXCESO_DESAYUNO && type != DeviationType.EXCESO_ALMUERZO) {
            throw new IllegalArgumentException("El tipo debe corresponder a una pausa.");
        }
        return actual.compareTo(Duration.ofMinutes(limitMinutes)) > 0 ? Optional.of(type) : Optional.empty();
    }

    private void validateTolerance(int toleranceMinutes) {
        if (toleranceMinutes < 0 || toleranceMinutes > 240) {
            throw new IllegalArgumentException("La tolerancia debe estar entre 0 y 240 minutos.");
        }
    }
}
