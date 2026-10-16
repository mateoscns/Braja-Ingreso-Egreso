package com.braja.fichaje.notifications;

public record PushSubscriptionMaterial(String endpoint, String p256dh, String auth) {
}
