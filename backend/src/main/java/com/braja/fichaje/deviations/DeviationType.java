package com.braja.fichaje.deviations;

public enum DeviationType {
    SIN_INGRESO(true),
    LLEGADA_TARDE(true),
    EGRESO_TEMPRANO(false),
    EGRESO_TARDIO(false),
    EXCESO_DESAYUNO(false),
    EXCESO_ALMUERZO(false),
    MARCA_FALTANTE(false);

    private final boolean pushEligible;

    DeviationType(boolean pushEligible) {
        this.pushEligible = pushEligible;
    }

    public boolean isPushEligible() {
        return pushEligible;
    }
}
