package com.braja.fichaje.notifications;

public final class InvalidPushSubscriptionException extends RuntimeException {

    public InvalidPushSubscriptionException() {
        super("La suscripción push no es válida.");
    }
}
