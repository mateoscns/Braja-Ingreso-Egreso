package com.braja.fichaje.campaign;

import java.math.BigInteger;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPrivateKey;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;

/**
 * Keys generated per JVM, so no key material is committed (not even a test one).
 * VAPID and push subscription keys use the P-256 base64url encodings the browser and web-push use.
 */
final class TestKeys {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder URL = Base64.getUrlEncoder().withoutPadding();

    static final String HEALTH_KEY = randomBase64(32);
    static final String LOGIN_IP_THROTTLE_KEY = randomBase64(32);
    static final String PUSH_SUBSCRIPTION_KEY = randomBase64(32);
    static final KeyPair VAPID = p256();
    static final String VAPID_PUBLIC = URL.encodeToString(uncompressed((ECPublicKey) VAPID.getPublic()));
    static final String VAPID_PRIVATE = URL.encodeToString(fixed32(((ECPrivateKey) VAPID.getPrivate()).getS()));

    private TestKeys() { }

    /** A browser-like subscription key: uncompressed P-256 point, base64url. */
    static String subscriptionP256dh() {
        return URL.encodeToString(uncompressed((ECPublicKey) p256().getPublic()));
    }

    /** A browser-like 16-byte auth secret, base64url. */
    static String subscriptionAuth() {
        byte[] secret = new byte[16];
        RANDOM.nextBytes(secret);
        return URL.encodeToString(secret);
    }

    private static String randomBase64(int bytes) {
        byte[] key = new byte[bytes];
        RANDOM.nextBytes(key);
        return Base64.getEncoder().encodeToString(key);
    }

    private static KeyPair p256() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
            return generator.generateKeyPair();
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static byte[] uncompressed(ECPublicKey key) {
        byte[] x = fixed32(key.getW().getAffineX());
        byte[] y = fixed32(key.getW().getAffineY());
        byte[] point = new byte[65];
        point[0] = 0x04;
        System.arraycopy(x, 0, point, 1, 32);
        System.arraycopy(y, 0, point, 33, 32);
        return point;
    }

    private static byte[] fixed32(BigInteger value) {
        byte[] raw = value.toByteArray();
        byte[] out = new byte[32];
        int copy = Math.min(raw.length, 32);
        System.arraycopy(raw, raw.length - copy, out, 32 - copy, copy);
        return out;
    }
}
