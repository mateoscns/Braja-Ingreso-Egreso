package com.braja.fichaje.timekeeping;

import java.util.List;
import java.util.Objects;

public final class MarkTransitionPolicy {

    public void validate(List<MarkAction> accepted, MarkAction next) {
        Objects.requireNonNull(accepted, "accepted");
        Objects.requireNonNull(next, "next");

        if (accepted.isEmpty()) {
            require(next == MarkAction.INGRESO, "La jornada debe comenzar con INGRESO.");
            return;
        }

        if (accepted.contains(MarkAction.EGRESO)) {
            throw invalid("La jornada ya tiene EGRESO.");
        }

        MarkAction last = accepted.getLast();
        if (last == MarkAction.SALIDA_DESAYUNO) {
            require(next == MarkAction.VUELTA_DESAYUNO, "Debe cerrarse la pausa de desayuno.");
            return;
        }
        if (last == MarkAction.SALIDA_ALMUERZO) {
            require(next == MarkAction.VUELTA_ALMUERZO, "Debe cerrarse la pausa de almuerzo.");
            return;
        }

        require(accepted.contains(MarkAction.INGRESO), "La jornada todavía no tiene INGRESO.");
        switch (next) {
            case INGRESO -> throw invalid("La jornada ya tiene INGRESO.");
            case SALIDA_DESAYUNO -> require(!accepted.contains(MarkAction.SALIDA_DESAYUNO),
                    "La pausa de desayuno ya fue utilizada.");
            case VUELTA_DESAYUNO -> throw invalid("No hay una pausa de desayuno abierta.");
            case SALIDA_ALMUERZO -> require(!accepted.contains(MarkAction.SALIDA_ALMUERZO),
                    "La pausa de almuerzo ya fue utilizada.");
            case VUELTA_ALMUERZO -> throw invalid("No hay una pausa de almuerzo abierta.");
            case EGRESO -> require(!hasOpenPause(accepted), "No se puede egresar con una pausa abierta.");
        }
    }

    private boolean hasOpenPause(List<MarkAction> accepted) {
        return accepted.getLast() == MarkAction.SALIDA_DESAYUNO
                || accepted.getLast() == MarkAction.SALIDA_ALMUERZO;
    }

    private void require(boolean condition, String message) {
        if (!condition) {
            throw invalid(message);
        }
    }

    private InvalidStateTransitionException invalid(String message) {
        return new InvalidStateTransitionException(message);
    }
}
