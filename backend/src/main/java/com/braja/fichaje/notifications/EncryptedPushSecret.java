package com.braja.fichaje.notifications;

public record EncryptedPushSecret(byte[] iv, byte[] ciphertext) {

    public EncryptedPushSecret {
        iv = iv.clone();
        ciphertext = ciphertext.clone();
    }

    @Override
    public byte[] iv() {
        return iv.clone();
    }

    @Override
    public byte[] ciphertext() {
        return ciphertext.clone();
    }
}
