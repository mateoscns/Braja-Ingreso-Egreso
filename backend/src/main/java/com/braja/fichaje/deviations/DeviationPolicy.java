package com.braja.fichaje.deviations;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import java.util.Optional;

public final class DeviationPolicy {

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
