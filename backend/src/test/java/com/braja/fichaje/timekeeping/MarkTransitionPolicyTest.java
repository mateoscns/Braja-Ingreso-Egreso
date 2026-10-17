package com.braja.fichaje.timekeeping;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import org.junit.jupiter.api.Test;

class MarkTransitionPolicyTest {

    private final MarkTransitionPolicy policy = new MarkTransitionPolicy();

    @Test
    void jornadaMustStartWithIngress() {
        assertDoesNotThrow(() -> policy.validate(List.of(), MarkAction.INGRESO));
        assertThrows(InvalidStateTransitionException.class,
                () -> policy.validate(List.of(), MarkAction.SALIDA_DESAYUNO));
        assertThrows(InvalidStateTransitionException.class,
                () -> policy.validate(List.of(), MarkAction.EGRESO));
    }

    @Test
    void breakfastAndLunchMayBeTakenInEitherOrderOnceEach() {
        assertDoesNotThrow(() -> policy.validate(
                List.of(MarkAction.INGRESO, MarkAction.SALIDA_ALMUERZO, MarkAction.VUELTA_ALMUERZO),
                MarkAction.SALIDA_DESAYUNO));
        assertDoesNotThrow(() -> policy.validate(
                List.of(MarkAction.INGRESO, MarkAction.SALIDA_DESAYUNO, MarkAction.VUELTA_DESAYUNO),
                MarkAction.SALIDA_ALMUERZO));

        assertThrows(InvalidStateTransitionException.class,
                () -> policy.validate(List.of(MarkAction.INGRESO,
                        MarkAction.SALIDA_DESAYUNO, MarkAction.VUELTA_DESAYUNO),
                        MarkAction.SALIDA_DESAYUNO));
    }

    @Test
    void aPauseMustBeClosedBeforeAnotherActionAndBeforeEgress() {
        var pauseOpen = List.of(MarkAction.INGRESO, MarkAction.SALIDA_DESAYUNO);
        assertDoesNotThrow(() -> policy.validate(pauseOpen, MarkAction.VUELTA_DESAYUNO));
        assertThrows(InvalidStateTransitionException.class,
                () -> policy.validate(pauseOpen, MarkAction.EGRESO));
        assertThrows(InvalidStateTransitionException.class,
                () -> policy.validate(pauseOpen, MarkAction.SALIDA_ALMUERZO));
    }

    @Test
    void ingressAndEgressCannotBeRepeatedOrFollowedByAnotherMark() {
        assertThrows(InvalidStateTransitionException.class,
                () -> policy.validate(List.of(MarkAction.INGRESO), MarkAction.INGRESO));
        assertThrows(InvalidStateTransitionException.class,
                () -> policy.validate(List.of(MarkAction.INGRESO, MarkAction.EGRESO), MarkAction.INGRESO));
        assertThrows(InvalidStateTransitionException.class,
                () -> policy.validate(List.of(MarkAction.INGRESO, MarkAction.EGRESO), MarkAction.SALIDA_ALMUERZO));
    }
}
