package com.braja.fichaje.api;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.*;

class DateRangesTest {
    @Test
    void acceptsAtMost366DaysInclusive() {
        LocalDate from = LocalDate.of(2028, 1, 1);
        assertDoesNotThrow(() -> DateRanges.validate(from, from));
        assertDoesNotThrow(() -> DateRanges.validate(from, from.plusDays(365)));

        ApiException tooLong = assertThrows(ApiException.class, () -> DateRanges.validate(from, from.plusDays(366)));
        assertEquals(422, tooLong.status().value());
        assertEquals("VALIDATION_ERROR", tooLong.code());
    }

    @Test
    void keepsRejectingInvertedRangesAndYearsOutside2000To2100() {
        assertEquals("VALIDATION_ERROR", assertThrows(ApiException.class,
                () -> DateRanges.validate(LocalDate.of(2026, 1, 2), LocalDate.of(2026, 1, 1))).code());
        assertEquals("VALIDATION_ERROR", assertThrows(ApiException.class,
                () -> DateRanges.validate(LocalDate.of(1999, 12, 31), null)).code());
        assertEquals("VALIDATION_ERROR", assertThrows(ApiException.class,
                () -> DateRanges.validate(null, LocalDate.of(2101, 1, 1))).code());
        assertDoesNotThrow(() -> DateRanges.validate(null, null));
        assertDoesNotThrow(() -> DateRanges.validate(LocalDate.of(2000, 1, 1), null));
    }
}
