package com.braja.fichaje.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.core.env.Environment;

import java.time.Duration;
import java.util.List;

@ConfigurationProperties(prefix = "braja")
public class BrajaProperties {
    private boolean sessionCookieSecure;
    private String healthEncryptionKeyBase64;
    private String loginIpThrottleKeyBase64;
    private String pushSubscriptionEncryptionKeyBase64;
    private String vapidPublicKey;
    private String vapidPrivateKey;
    private String vapidSubject;
    private int loginIpThrottleMaxFailures = 30;
    private Duration loginIpThrottleWindow = Duration.ofMinutes(15);
    private Duration loginIpThrottleLockDuration = Duration.ofMinutes(15);
    private List<String> trustedProxyCidrs = List.of();

    public boolean isSessionCookieSecure() { return sessionCookieSecure; }
    public void setSessionCookieSecure(boolean sessionCookieSecure) { this.sessionCookieSecure = sessionCookieSecure; }
    public String getHealthEncryptionKeyBase64() { return healthEncryptionKeyBase64; }
    public void setHealthEncryptionKeyBase64(String healthEncryptionKeyBase64) { this.healthEncryptionKeyBase64 = healthEncryptionKeyBase64; }
    public String getLoginIpThrottleKeyBase64() { return loginIpThrottleKeyBase64; }
    public void setLoginIpThrottleKeyBase64(String loginIpThrottleKeyBase64) { this.loginIpThrottleKeyBase64 = loginIpThrottleKeyBase64; }
    public String getPushSubscriptionEncryptionKeyBase64() { return pushSubscriptionEncryptionKeyBase64; }
    public void setPushSubscriptionEncryptionKeyBase64(String pushSubscriptionEncryptionKeyBase64) { this.pushSubscriptionEncryptionKeyBase64 = pushSubscriptionEncryptionKeyBase64; }
    public String getVapidPublicKey() { return vapidPublicKey; }
    public void setVapidPublicKey(String vapidPublicKey) { this.vapidPublicKey = vapidPublicKey; }
    public String getVapidPrivateKey() { return vapidPrivateKey; }
    public void setVapidPrivateKey(String vapidPrivateKey) { this.vapidPrivateKey = vapidPrivateKey; }
    public String getVapidSubject() { return vapidSubject; }
    public void setVapidSubject(String vapidSubject) { this.vapidSubject = vapidSubject; }
    public int getLoginIpThrottleMaxFailures() { return loginIpThrottleMaxFailures; }
    public void setLoginIpThrottleMaxFailures(int loginIpThrottleMaxFailures) { this.loginIpThrottleMaxFailures = loginIpThrottleMaxFailures; }
    public Duration getLoginIpThrottleWindow() { return loginIpThrottleWindow; }
    public void setLoginIpThrottleWindow(Duration loginIpThrottleWindow) { this.loginIpThrottleWindow = loginIpThrottleWindow; }
    public Duration getLoginIpThrottleLockDuration() { return loginIpThrottleLockDuration; }
    public void setLoginIpThrottleLockDuration(Duration loginIpThrottleLockDuration) { this.loginIpThrottleLockDuration = loginIpThrottleLockDuration; }
    public List<String> getTrustedProxyCidrs() { return trustedProxyCidrs; }
    public void setTrustedProxyCidrs(List<String> trustedProxyCidrs) { this.trustedProxyCidrs = trustedProxyCidrs; }

    public boolean isPushEnabled() {
        return nonBlank(vapidPublicKey) && nonBlank(vapidPrivateKey) && nonBlank(vapidSubject);
    }

    public void validate() {
        if (loginIpThrottleMaxFailures < 1 || loginIpThrottleMaxFailures > 10000) {
            throw new IllegalStateException("BRAJA_LOGIN_IP_THROTTLE_MAX_FAILURES must be between 1 and 10000");
        }
        if (loginIpThrottleWindow == null || loginIpThrottleWindow.isZero() || loginIpThrottleWindow.isNegative()
                || loginIpThrottleWindow.compareTo(Duration.ofDays(1)) > 0) {
            throw new IllegalStateException("BRAJA_LOGIN_IP_THROTTLE_WINDOW must be positive and no longer than 24 hours");
        }
        if (loginIpThrottleLockDuration == null || loginIpThrottleLockDuration.isZero() || loginIpThrottleLockDuration.isNegative()
                || loginIpThrottleLockDuration.compareTo(Duration.ofDays(1)) > 0) {
            throw new IllegalStateException("BRAJA_LOGIN_IP_THROTTLE_LOCK_DURATION must be positive and no longer than 24 hours");
        }
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
        if (loginIpThrottleKeyBase64 == null || loginIpThrottleKeyBase64.isBlank()) {
            throw new IllegalStateException("BRAJA_LOGIN_IP_THROTTLE_KEY_BASE64 must contain a dedicated 32-byte Base64 key");
        }
        try {
            byte[] loginIpKey = java.util.Base64.getDecoder().decode(loginIpThrottleKeyBase64);
            byte[] healthKey = java.util.Base64.getDecoder().decode(healthEncryptionKeyBase64);
            if (loginIpKey.length != 32) {
                throw new IllegalStateException("BRAJA_LOGIN_IP_THROTTLE_KEY_BASE64 must decode to exactly 32 bytes");
            }
            if (java.util.Arrays.equals(loginIpKey, healthKey)) {
                throw new IllegalStateException("BRAJA_LOGIN_IP_THROTTLE_KEY_BASE64 must be different from the health encryption key");
            }
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("BRAJA_LOGIN_IP_THROTTLE_KEY_BASE64 is not valid Base64", ex);
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
        // 2026-10-27: 0.0.0.0/0 was accepted; trusting every peer lets any client choose its throttled address.
        if (trustedProxyCidrs != null && trustedProxyCidrs.stream().filter(BrajaProperties::nonBlank).anyMatch(BrajaProperties::hasZeroPrefix)) {
            throw new IllegalStateException("BRAJA_TRUSTED_PROXY_CIDRS must not trust every address (prefix length 0)");
        }
    }

    private static boolean hasZeroPrefix(String cidr) {
        int slash = cidr.indexOf('/');
        if (slash < 0) return false;
        String prefix = cidr.substring(slash + 1).trim();
        try {
            return Integer.parseInt(prefix) <= 0;
        } catch (NumberFormatException ex) {
            return false;
        }
    }

    public void validate(Environment environment) {
        validate();
        boolean localOnly = environment.getActiveProfiles().length == 1
                && "local".equals(environment.getActiveProfiles()[0]);
        boolean hasTrustedProxy = trustedProxyCidrs != null && trustedProxyCidrs.stream().anyMatch(BrajaProperties::nonBlank);
        if (!localOnly && !hasTrustedProxy) {
            throw new IllegalStateException("BRAJA_TRUSTED_PROXY_CIDRS must list the trusted reverse proxy CIDR outside the local-only profile");
        }
    }

    private static boolean nonBlank(String value) { return value != null && !value.isBlank(); }
}
