package com.braja.fichaje.timekeeping;

import java.util.List;
import java.util.Objects;

public final class MarkState {
    private MarkState() { }

    public static String from(List<MarkAction> sequencedActions) {
        Objects.requireNonNull(sequencedActions, "sequencedActions");
        if (sequencedActions.isEmpty()) return "NO_INGRESO";
        MarkAction last = sequencedActions.getLast();
        if (last == MarkAction.EGRESO) return "EGRESADA";
        if (last == MarkAction.SALIDA_DESAYUNO || last == MarkAction.SALIDA_ALMUERZO) return "PAUSA_ABIERTA";
        return "EN_CURSO";
    }
}
