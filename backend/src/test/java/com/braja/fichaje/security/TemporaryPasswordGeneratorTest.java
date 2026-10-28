package com.braja.fichaje.security;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TemporaryPasswordGeneratorTest {
    private final TemporaryPasswordGenerator generator = new TemporaryPasswordGenerator();

    @Test
    void generatesReadableGroupsWithinThePasswordPolicyAndWithoutRepeats() {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 500; i++) {
            String password = generator.generate();
            assertTrue(password.matches("[A-HJ-NP-Za-km-z2-9]{4}(-[A-HJ-NP-Za-km-z2-9]{4}){3}"), password);
            assertTrue(password.length() >= 12 && password.length() <= 256);
            seen.add(password);
        }
        assertEquals(500, seen.size());
    }
}
