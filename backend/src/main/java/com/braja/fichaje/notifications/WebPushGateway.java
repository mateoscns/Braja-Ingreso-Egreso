package com.braja.fichaje.notifications;

public interface WebPushGateway {
    int send(PushSubscriptionMaterial subscription, String payload, String topic);
}
