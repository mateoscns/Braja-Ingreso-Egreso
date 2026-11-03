package com.braja.fichaje.campaign.simulation;

import java.math.BigInteger;
import java.security.GeneralSecurityException;
import java.security.KeyPairGenerator;
import java.security.SecureRandom;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;
import java.util.Map;

/** A browser-like push subscription body (P-256 key and 16-byte auth, base64url), generated per run, never committed. */
final class PushKeys {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Base64.Encoder URL = Base64.getUrlEncoder().withoutPadding();

    private PushKeys() { }

    static Map<String, Object> subscription(String endpoint) {
        byte[] auth = new byte[16];
        RANDOM.nextBytes(auth);
        return Map.of("endpoint", endpoint, "keys", Map.of("p256dh", URL.encodeToString(publicPoint()), "auth", URL.encodeToString(auth)));
    }

    private static byte[] publicPoint() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
            ECPublicKey key = (ECPublicKey) generator.generateKeyPair().getPublic();
            byte[] point = new byte[65];
            point[0] = 0x04;
            System.arraycopy(fixed32(key.getW().getAffineX()), 0, point, 1, 32);
            System.arraycopy(fixed32(key.getW().getAffineY()), 0, point, 33, 32);
            return point;
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static byte[] fixed32(BigInteger value) {
        byte[] raw = value.toByteArray(), out = new byte[32];
        int copy = Math.min(raw.length, 32);
        System.arraycopy(raw, raw.length - copy, out, 32 - copy, copy);
        return out;
    }
}
