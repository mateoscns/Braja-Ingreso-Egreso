package com.braja.fichaje.security;

public final class DniNormalizer {
    private DniNormalizer() { }
    public static String normalize(String dni) {
        if (dni == null) throw new IllegalArgumentException("DNI is required");
        String normalized = dni.replaceAll("[^0-9]", "");
        if (normalized.length() < 7 || normalized.length() > 12) throw new IllegalArgumentException("DNI must contain 7 to 12 digits");
        return normalized;
    }
}
