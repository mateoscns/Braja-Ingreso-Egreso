package com.braja.fichaje.notifications;

public final class PushFeatureDisabledException extends RuntimeException {
    public PushFeatureDisabledException() {
        super("Las notificaciones push no están habilitadas.");
    }
}
