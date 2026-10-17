package com.braja.fichaje.timekeeping;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

class MarkRequestFingerprintTest {
    @Test
    void fingerprintsTheJourneyAndActionButNeverTheIdempotencyKey() {
        UUID jornada = UUID.fromString("2b5f67b6-8ce3-4ea8-950c-e235ec7755c8");
        assertEquals(MarkRequestFingerprint.sha256(jornada, MarkAction.INGRESO),
                MarkRequestFingerprint.sha256(jornada, MarkAction.INGRESO));
        assertNotEquals(MarkRequestFingerprint.sha256(jornada, MarkAction.INGRESO),
                MarkRequestFingerprint.sha256(jornada, MarkAction.EGRESO));
        assertNotEquals(MarkRequestFingerprint.sha256(jornada, MarkAction.INGRESO),
                MarkRequestFingerprint.sha256(UUID.randomUUID(), MarkAction.INGRESO));
    }
}
