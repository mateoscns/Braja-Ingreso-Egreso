package com.braja.fichaje.security;

import com.braja.fichaje.config.BrajaProperties;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.SecureRandom;
import java.util.Base64;

@Component
public class EncryptionService {
    private static final String KEY_ID = "primary-v1";
    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public EncryptionService(BrajaProperties properties, Environment environment) {
        properties.validate(environment);
        this.key = new SecretKeySpec(Base64.getDecoder().decode(properties.getHealthEncryptionKeyBase64()), "AES");
    }

    public EncryptedValue encryptHealth(String plaintext) {
        byte[] iv = new byte[12];
        random.nextBytes(iv);
        return new EncryptedValue(encrypt(plaintext, iv, "health-motive-v1"), iv, KEY_ID);
    }

    public String decryptHealth(byte[] ciphertext, byte[] iv, String keyId) {
        if (!KEY_ID.equals(keyId)) throw new IllegalStateException("Unsupported health-motive encryption key id");
        return decrypt(ciphertext, iv, "health-motive-v1");
    }

    private byte[] encrypt(String plaintext, byte[] iv, String context) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(128, iv));
            cipher.updateAAD(context.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (java.security.GeneralSecurityException ex) {
            throw new IllegalStateException("Unable to encrypt private text", ex);
        }
    }

    private String decrypt(byte[] ciphertext, byte[] iv, String context) {
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
            cipher.updateAAD(context.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return new String(cipher.doFinal(ciphertext), java.nio.charset.StandardCharsets.UTF_8);
        } catch (java.security.GeneralSecurityException ex) {
            throw new IllegalStateException("Unable to decrypt private text", ex);
        }
    }

    public record EncryptedValue(byte[] ciphertext, byte[] iv, String keyId) { }
}
