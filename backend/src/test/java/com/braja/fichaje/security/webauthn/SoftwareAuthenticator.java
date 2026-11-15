package com.braja.fichaje.security.webauthn;

import java.io.ByteArrayOutputStream;
import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Base64;

/**
 * A software WebAuthn authenticator for tests (issue #190): an ES256 (EC P-256) key from the JDK, real "none"
 * attestation objects and real assertions, encoded by hand (CBOR included) so the bytes the verifier sees do not come
 * from the library under test. Every field the server checks can be bent per call through {@link Ceremony}.
 */
final class SoftwareAuthenticator {
    static final int FLAG_UP = 0x01;
    static final int FLAG_UV = 0x04;
    static final int FLAG_BE = 0x08;
    static final int FLAG_BS = 0x10;
    private static final int FLAG_AT = 0x40;
    private static final byte[] AAGUID_NONE = new byte[16];
    private static final SecureRandom RANDOM = new SecureRandom();

    private SoftwareAuthenticator() {
    }

    /** One passkey: its credential id and its key pair. */
    record Credential(byte[] id, KeyPair keyPair) {
    }

    /** What the browser hands the server after navigator.credentials.create(). */
    record Attestation(byte[] credentialId, byte[] attestationObject, byte[] clientDataJson) {
    }

    /** What the browser hands the server after navigator.credentials.get(). */
    record Assertion(byte[] credentialId, byte[] authenticatorData, byte[] clientDataJson, byte[] signature) {
    }

    /** The inputs of one ceremony as the authenticator and the browser see them. */
    record Ceremony(String rpId, String origin, byte[] challenge, int flags, long signCount) {
        static Ceremony of(String rpId, String origin, byte[] challenge) {
            return new Ceremony(rpId, origin, challenge, FLAG_UP | FLAG_UV, 0);
        }

        Ceremony withRpId(String value) {
            return new Ceremony(value, origin, challenge, flags, signCount);
        }

        Ceremony withOrigin(String value) {
            return new Ceremony(rpId, value, challenge, flags, signCount);
        }

        Ceremony withFlags(int value) {
            return new Ceremony(rpId, origin, challenge, value, signCount);
        }

        Ceremony withSignCount(long value) {
            return new Ceremony(rpId, origin, challenge, flags, value);
        }
    }

    static Credential newCredential() {
        try {
            KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
            generator.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
            return new Credential(randomBytes(32), generator.generateKeyPair());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    static byte[] randomBytes(int length) {
        byte[] bytes = new byte[length];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    static Attestation register(Credential credential, Ceremony ceremony) {
        ByteArrayOutputStream attested = new ByteArrayOutputStream();
        attested.writeBytes(AAGUID_NONE);
        attested.writeBytes(ByteBuffer.allocate(2).putShort((short) credential.id().length).array());
        attested.writeBytes(credential.id());
        attested.writeBytes(coseEs256Key((ECPublicKey) credential.keyPair().getPublic()));
        byte[] authenticatorData = authenticatorData(ceremony, ceremony.flags() | FLAG_AT, attested.toByteArray());

        Cbor attestationObject = new Cbor().mapHeader(3)
                .text("fmt").text("none")
                .text("attStmt").mapHeader(0)
                .text("authData").bytes(authenticatorData);
        return new Attestation(credential.id(), attestationObject.toByteArray(),
                clientDataJson("webauthn.create", ceremony));
    }

    static Assertion authenticate(Credential credential, Ceremony ceremony) {
        return authenticateSignedBy(credential, credential.keyPair(), ceremony);
    }

    /** An assertion that claims {@code claimed}'s credential id but is signed with {@code signer}. */
    static Assertion authenticateSignedBy(Credential claimed, KeyPair signer, Ceremony ceremony) {
        byte[] authenticatorData = authenticatorData(ceremony, ceremony.flags(), new byte[0]);
        byte[] clientDataJson = clientDataJson("webauthn.get", ceremony);
        try {
            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initSign(signer.getPrivate(), RANDOM);
            signature.update(authenticatorData);
            signature.update(sha256(clientDataJson));
            return new Assertion(claimed.id(), authenticatorData, clientDataJson, signature.sign());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    static String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private static byte[] authenticatorData(Ceremony ceremony, int flags, byte[] attestedCredentialData) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(sha256(ceremony.rpId().getBytes(StandardCharsets.UTF_8)));
        out.write(flags);
        out.writeBytes(ByteBuffer.allocate(4).putInt((int) ceremony.signCount()).array());
        out.writeBytes(attestedCredentialData);
        return out.toByteArray();
    }

    private static byte[] clientDataJson(String type, Ceremony ceremony) {
        String json = "{\"type\":\"" + type + "\",\"challenge\":\"" + base64Url(ceremony.challenge())
                + "\",\"origin\":\"" + ceremony.origin() + "\",\"crossOrigin\":false}";
        return json.getBytes(StandardCharsets.UTF_8);
    }

    /** COSE_Key for ES256 (RFC 9053): kty EC2 (2), alg -7, crv P-256 (1), x and y as 32-byte strings. */
    private static byte[] coseEs256Key(ECPublicKey key) {
        return new Cbor().mapHeader(5)
                .integer(1).integer(2)
                .integer(3).integer(-7)
                .integer(-1).integer(1)
                .integer(-2).bytes(unsigned32(key.getW().getAffineX()))
                .integer(-3).bytes(unsigned32(key.getW().getAffineY()))
                .toByteArray();
    }

    private static byte[] unsigned32(BigInteger value) {
        byte[] raw = value.toByteArray();
        byte[] fixed = new byte[32];
        int copy = Math.min(raw.length, 32);
        System.arraycopy(raw, raw.length - copy, fixed, 32 - copy, copy);
        return fixed;
    }

    private static byte[] sha256(byte[] bytes) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(bytes);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    /** The few CBOR (RFC 8949) items a "none" attestation and a COSE key need, in definite-length form. */
    private static final class Cbor {
        private final ByteArrayOutputStream out = new ByteArrayOutputStream();

        Cbor mapHeader(int entries) {
            return header(5, entries);
        }

        Cbor text(String value) {
            byte[] utf8 = value.getBytes(StandardCharsets.UTF_8);
            header(3, utf8.length);
            out.writeBytes(utf8);
            return this;
        }

        Cbor bytes(byte[] value) {
            header(2, value.length);
            out.writeBytes(value);
            return this;
        }

        Cbor integer(int value) {
            return value >= 0 ? header(0, value) : header(1, -1 - value);
        }

        byte[] toByteArray() {
            return out.toByteArray();
        }

        private Cbor header(int major, int argument) {
            int type = major << 5;
            if (argument < 24) {
                out.write(type | argument);
            } else if (argument < 0x100) {
                out.write(type | 24);
                out.write(argument);
            } else {
                out.write(type | 25);
                out.write(argument >> 8);
                out.write(argument & 0xFF);
            }
            return this;
        }
    }
}
