package com.braja.fichaje.security;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

/**
 * Temporary passwords an ADMIN hands over in person: four groups of four characters (19 with dashes, inside the
 * 12-256 policy), about 90 bits from {@link SecureRandom}, without look-alike characters (0/O, 1/l/I).
 */
@Component
public class TemporaryPasswordGenerator {
    private static final char[] ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789".toCharArray();
    private final SecureRandom random = new SecureRandom();

    public String generate() {
        StringBuilder password = new StringBuilder(19);
        for (int i = 0; i < 16; i++) {
            if (i > 0 && i % 4 == 0) password.append('-');
            password.append(ALPHABET[random.nextInt(ALPHABET.length)]);
        }
        return password.toString();
    }
}
