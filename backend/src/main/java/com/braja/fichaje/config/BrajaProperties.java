package com.braja.fichaje.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "braja")
public class BrajaProperties {
    private boolean sessionCookieSecure;
    private String healthEncryptionKeyBase64;
    private String pushSubscriptionEncryptionKeyBase64;
    private String vapidPublicKey;
    private String vapidPrivateKey;
    private String vapidSubject;

    public boolean isSessionCookieSecure() { return sessionCookieSecure; }
    public void setSessionCookieSecure(boolean sessionCookieSecure) { this.sessionCookieSecure = sessionCookieSecure; }
    public String getHealthEncryptionKeyBase64() { return healthEncryptionKeyBase64; }
    public void setHealthEncryptionKeyBase64(String healthEncryptionKeyBase64) { this.healthEncryptionKeyBase64 = healthEncryptionKeyBase64; }
    public String getPushSubscriptionEncryptionKeyBase64() { return pushSubscriptionEncryptionKeyBase64; }
    public void setPushSubscriptionEncryptionKeyBase64(String pushSubscriptionEncryptionKeyBase64) { this.pushSubscriptionEncryptionKeyBase64 = pushSubscriptionEncryptionKeyBase64; }
    public String getVapidPublicKey() { return vapidPublicKey; }
    public void setVapidPublicKey(String vapidPublicKey) { this.vapidPublicKey = vapidPublicKey; }
    public String getVapidPrivateKey() { return vapidPrivateKey; }
    public void setVapidPrivateKey(String vapidPrivateKey) { this.vapidPrivateKey = vapidPrivateKey; }
    public String getVapidSubject() { return vapidSubject; }
    public void setVapidSubject(String vapidSubject) { this.vapidSubject = vapidSubject; }

    public boolean isPushEnabled() {
        return nonBlank(vapidPublicKey) && nonBlank(vapidPrivateKey) && nonBlank(vapidSubject);
    }

    public void validate() {
        if (healthEncryptionKeyBase64 == null || healthEncryptionKeyBase64.isBlank()) {
            throw new IllegalStateException("BRAJA_HEALTH_ENCRYPTION_KEY_BASE64 must contain a 32-byte Base64 key");
        }
        try {
            if (java.util.Base64.getDecoder().decode(healthEncryptionKeyBase64).length != 32) {
                throw new IllegalStateException("BRAJA_HEALTH_ENCRYPTION_KEY_BASE64 must decode to exactly 32 bytes");
            }
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("BRAJA_HEALTH_ENCRYPTION_KEY_BASE64 is not valid Base64", ex);
        }
        int presentPushValues = (nonBlank(vapidPublicKey) ? 1 : 0) + (nonBlank(vapidPrivateKey) ? 1 : 0) + (nonBlank(vapidSubject) ? 1 : 0);
        if (presentPushValues != 0 && presentPushValues != 3) {
            throw new IllegalStateException("VAPID public key, private key, and subject must be configured together");
        }
        if (isPushEnabled()) {
            if (!nonBlank(pushSubscriptionEncryptionKeyBase64)
                    || java.util.Base64.getDecoder().decode(pushSubscriptionEncryptionKeyBase64).length != 32) {
                throw new IllegalStateException("BRAJA_PUSH_SUBSCRIPTION_ENCRYPTION_KEY_BASE64 must decode to 32 bytes when push is enabled");
            }
        }
    }

    private static boolean nonBlank(String value) { return value != null && !value.isBlank(); }
}
