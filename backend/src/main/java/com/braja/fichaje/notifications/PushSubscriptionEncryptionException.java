package com.braja.fichaje.notifications;

public final class PushSubscriptionEncryptionException extends RuntimeException {

    public PushSubscriptionEncryptionException() {
        super("No se pudo proteger la suscripción push.");
    }

    public PushSubscriptionEncryptionException(Throwable cause) {
        super("No se pudo proteger la suscripción push.", cause);
    }
}
