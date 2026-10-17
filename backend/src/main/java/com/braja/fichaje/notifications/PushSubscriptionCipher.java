package com.braja.fichaje.notifications;

import com.braja.fichaje.config.BrajaProperties;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Component;

@Component
public final class PushSubscriptionCipher {

    private static final int IV_LENGTH = 12;
    private static final int TAG_LENGTH_BITS = 128;
    private final SecretKeySpec key;
    private final SecureRandom secureRandom = new SecureRandom();

    public PushSubscriptionCipher(BrajaProperties properties) {
        String encodedKey = properties.getPushSubscriptionEncryptionKeyBase64();
        if (encodedKey == null || encodedKey.isBlank()) {
            key = null;
            return;
        }
        try {
            byte[] rawKey = Base64.getDecoder().decode(encodedKey);
            if (rawKey.length != 32) {
                throw new IllegalStateException(
                        "BRAJA_PUSH_SUBSCRIPTION_ENCRYPTION_KEY_BASE64 debe decodificar a 32 bytes.");
            }
            key = new SecretKeySpec(rawKey, "AES");
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException(
                    "BRAJA_PUSH_SUBSCRIPTION_ENCRYPTION_KEY_BASE64 no es Base64 válido.", ex);
        }
    }

    public EncryptedPushSecret encrypt(UUID companyId, UUID accountId, String endpointHash,
                                      PushSubscriptionMaterial material) {
        requireKey();
        try {
            byte[] iv = new byte[IV_LENGTH];
            secureRandom.nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            cipher.updateAAD(additionalData(companyId, accountId, endpointHash));
            return new EncryptedPushSecret(iv, cipher.doFinal(serialize(material)));
        } catch (GeneralSecurityException | java.io.IOException ex) {
            throw new PushSubscriptionEncryptionException(ex);
        }
    }

    public PushSubscriptionMaterial decrypt(UUID companyId, UUID accountId, String endpointHash,
                                             EncryptedPushSecret encrypted) {
        requireKey();
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH_BITS, encrypted.iv()));
            cipher.updateAAD(additionalData(companyId, accountId, endpointHash));
            return deserialize(cipher.doFinal(encrypted.ciphertext()));
        } catch (GeneralSecurityException | java.io.IOException ex) {
            throw new PushSubscriptionEncryptionException(ex);
        }
    }

    private void requireKey() {
        if (key == null) {
            throw new PushSubscriptionEncryptionException();
        }
    }

    private byte[] additionalData(UUID companyId, UUID accountId, String endpointHash) {
        return (companyId + ":" + accountId + ":" + endpointHash + ":v1").getBytes(StandardCharsets.UTF_8);
    }

    private byte[] serialize(PushSubscriptionMaterial material) throws java.io.IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (DataOutputStream output = new DataOutputStream(bytes)) {
            writeField(output, material.endpoint());
            writeField(output, material.p256dh());
            writeField(output, material.auth());
        }
        return bytes.toByteArray();
    }

    private PushSubscriptionMaterial deserialize(byte[] bytes) throws java.io.IOException {
        try (DataInputStream input = new DataInputStream(new ByteArrayInputStream(bytes))) {
            PushSubscriptionMaterial material = new PushSubscriptionMaterial(
                    readField(input, 2048), readField(input, 256), readField(input, 128));
            if (input.available() != 0) {
                throw new java.io.IOException("Unexpected trailing subscription data.");
            }
            return material;
        }
    }

    private void writeField(DataOutputStream output, String value) throws java.io.IOException {
        byte[] field = value.getBytes(StandardCharsets.UTF_8);
        output.writeInt(field.length);
        output.write(field);
    }

    private String readField(DataInputStream input, int maxLength) throws java.io.IOException {
        int length = input.readInt();
        if (length < 0 || length > maxLength) {
            throw new java.io.IOException("Invalid subscription field length.");
        }
        byte[] field = input.readNBytes(length);
        if (field.length != length) {
            throw new java.io.IOException("Incomplete subscription field.");
        }
        return new String(field, StandardCharsets.UTF_8);
    }
}
