package com.braja.fichaje.timekeeping;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MarkStateTest {
    @Test
    void derivesNoIngressForAnEmptyHistory() {
        assertEquals("NO_INGRESO", MarkState.from(List.of()));
    }

    @Test
    void derivesOpenPauseAndClosedJornadaFromLastSequencedAction() {
        assertEquals("PAUSA_ABIERTA", MarkState.from(List.of(MarkAction.INGRESO, MarkAction.SALIDA_ALMUERZO)));
        assertEquals("EN_CURSO", MarkState.from(List.of(MarkAction.INGRESO, MarkAction.SALIDA_ALMUERZO, MarkAction.VUELTA_ALMUERZO)));
        assertEquals("EGRESADA", MarkState.from(List.of(MarkAction.INGRESO, MarkAction.EGRESO)));
    }
}
