package com.braja.fichaje.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;

import java.time.Clock;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The first-ADMIN bootstrap refuses its configuration before touching the database (no JdbcTemplate is given here):
 * a password above BCrypt's 72 UTF-8 bytes (D-20261102-04) or a site zone that is not an IANA region (D-20261102-05).
 */
class BootstrapAdminValidationTest {
    private static final String VALID_PASSWORD = "bootstrap-password-123";

    @Test
    void aPasswordAbove72Utf8BytesStopsTheStartup() {
        IllegalStateException failure = assertThrows(IllegalStateException.class, () -> run("ñ".repeat(37), "America/Argentina/Buenos_Aires"));
        assertEquals("Bootstrap password must contain 16 characters to 72 UTF-8 bytes", failure.getMessage());
        assertEquals(failure.getMessage(), assertThrows(IllegalStateException.class, () -> run("p".repeat(73), "UTC")).getMessage());
        assertEquals(failure.getMessage(), assertThrows(IllegalStateException.class, () -> run("p".repeat(15), "UTC")).getMessage());
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"-03:00", "Z", "UTC+3", "GMT-3", "America/Nowhere"})
    void aSiteZoneThatIsNotAnIanaRegionStopsTheStartup(String zone) {
        IllegalStateException failure = assertThrows(IllegalStateException.class, () -> run(VALID_PASSWORD, zone));
        assertEquals("Bootstrap time zone must be an IANA region such as America/Argentina/Buenos_Aires", failure.getMessage());
    }

    @Test
    void a72BytePasswordAndARegionZonePassValidationAndReachTheDatabase() {
        // Validation passed when the runner reaches the (absent) JdbcTemplate.
        assertThrows(NullPointerException.class, () -> run("ñ".repeat(36), "America/Argentina/Buenos_Aires"));
        assertThrows(NullPointerException.class, () -> run("p".repeat(16), "UTC"));
    }

    private static void run(String password, String zone) {
        MockEnvironment env = new MockEnvironment()
                .withProperty("braja.bootstrap-dni", "20123456")
                .withProperty("braja.bootstrap-password", password)
                .withProperty("braja.bootstrap-admin-name", "Admin")
                .withProperty("braja.bootstrap-company-name", "Braja")
                .withProperty("braja.bootstrap-site-name", "Centro")
                .withProperty("braja.bootstrap-time-zone", zone);
        new BootstrapAdminRunner(null, null, env, Clock.systemUTC()).run(null);
    }
}
