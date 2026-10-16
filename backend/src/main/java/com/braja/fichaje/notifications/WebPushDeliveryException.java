package com.braja.fichaje.notifications;

public final class WebPushDeliveryException extends RuntimeException {
    private final String errorCode;

    public WebPushDeliveryException(String errorCode, Throwable cause) {
        super("No se pudo entregar la notificación push.", cause);
        this.errorCode = errorCode;
    }

    public String errorCode() {
        return errorCode;
    }
}
