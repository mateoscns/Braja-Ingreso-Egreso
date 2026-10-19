package com.braja.fichaje.timekeeping;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.UUID;

public final class MarkRequestFingerprint {
    private MarkRequestFingerprint() { }

    public static String sha256(UUID jornadaId, MarkAction action) {
        String canonical = "POST:/api/v1/jornadas/" + jornadaId + "/marks\n{\"action\":\"" + action.name() + "\"}";
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable", ex);
        }
    }
}
