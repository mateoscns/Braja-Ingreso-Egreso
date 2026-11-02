package com.braja.fichaje.campaign;

import com.braja.fichaje.security.PrivacyRetentionScheduler;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S59-S61: personal data through the real HTTP API and the real retention job, with the server clock under test control.
 * One site in Buenos Aires with a center, one employee (Ana) and her jornada 09:00-17:00 (12:00Z-20:00Z, tolerance 10 min).
 */
class PrivacySpecTest extends CampaignTestBase {
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    private static final Duration RETENTION = Duration.ofDays(90);
    private static final Duration MICRO = Duration.of(1, ChronoUnit.MICROS);
    private static final double LATITUDE = -34.6037111;
    private static final double LONGITUDE = -58.3816222;
    private static final String HEALTH_TEXT = "migraine with aura since dawn";
    private static final String OTHER_TEXT = "bus strike downtown";

    @Autowired private PrivacyRetentionScheduler retention;

    private Fixture.Company company;
    private UUID site;
    private Fixture.Employee ana;
    private UUID jornada;

    @BeforeEach
    void jornada() {
        company = fixture.company("Privacidad");
        site = fixture.site(company, "Centro", "America/Argentina/Buenos_Aires");
        fixture.siteCenter(company, site, -34.6037, -58.3816, 100);
        ana = fixture.employee(company, "Ana", List.of(site), 10);
        UUID template = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        jornada = fixture.declare(company, ana.id(), site, DAY, template);
    }

    @AfterEach
    void noServerErrorAndInvariantsHold() {
        assertEquals(List.of(), httpLog.serverErrors());
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
    }

    // S59 ------------------------------------------------------------------------------------------------------------

    @Test
    void s59MarkCoordinatesArePurgedOneMicrosecondPastNinetyDaysWhileTheSiteCenterStays() {
        UUID ingreso = mark("12:00:00", "INGRESO");
        Instant firstReceived = locate(ingreso, "12:00:05");
        UUID salida = mark("15:00:00", "SALIDA_DESAYUNO");
        Instant secondReceived = locate(salida, "15:00:05");

        purgeAt(firstReceived.plus(RETENTION));
        assertEquals(List.of("RECIBIDA", "RECIBIDA"), locationStatuses());
        Instant firstPurge = firstReceived.plus(RETENTION).plus(MICRO);
        purgeAt(firstPurge);
        assertEquals(List.of("PURGADA", "RECIBIDA"), locationStatuses());
        purgeAt(secondReceived.plus(RETENTION));
        assertEquals(List.of("PURGADA", "RECIBIDA"), locationStatuses());
        Instant secondPurge = secondReceived.plus(RETENTION).plus(MICRO);
        purgeAt(secondPurge);
        assertEquals(List.of("PURGADA", "PURGADA"), locationStatuses());

        Map<String, Object> purged = jdbc.queryForMap("SELECT latitude, longitude, accuracy_meters FROM mark_events WHERE id = ?", ingreso.toString());
        purged.forEach((column, value) -> assertNull(value, column));
        assertEquals(firstPurge, instant("SELECT location_purged_at FROM mark_events WHERE id = ?", ingreso));
        assertEquals(secondPurge, instant("SELECT location_purged_at FROM mark_events WHERE id = ?", salida));
        // CHAR: the purge keeps when the location arrived (location_received_at), only the point is erased — confirm with Mateo.
        assertEquals(firstReceived, instant("SELECT location_received_at FROM mark_events WHERE id = ?", ingreso));
        JsonNode view = company.admin().get("/api/v1/marks/" + ingreso).expect(200).body();
        assertEquals("PURGADA", view.get("locationStatus").asText());
        assertTrue(isNull(view, "latitude"));

        // The site center is company data, not a person's: neither the site nor the jornada's snapshot of it is purged.
        JsonNode siteView = company.admin().get("/api/v1/sites").expect(200).body().get(0);
        assertEquals(-34.6037, siteView.get("latitude").asDouble());
        assertEquals(-58.3816, siteView.get("longitude").asDouble());
        assertEquals(1, count("SELECT COUNT(*) FROM jornadas WHERE id = ? AND site_geofence_latitude_snapshot IS NOT NULL"
                + " AND site_geofence_longitude_snapshot IS NOT NULL", jornada));
    }

    // CHAR: each motive correction restarts the 90 days (motive_created_at is the last submission) — confirm with Mateo.
    @Test
    void s59HealthMotiveTextIsPurgedOneMicrosecondPastNinetyDaysAndItsCategoryAndOtherMotivesStay() {
        mark("12:30:00", "INGRESO");
        mark("13:00:00", "EGRESO");
        UUID health = deviation("LLEGADA_TARDE");
        UUID other = deviation("EGRESO_TEMPRANO");
        clock.set(utc("13:05:00"));
        motive(ana.client(), health, "SALUD", "first wording").expect(200);
        motive(ana.client(), other, "OTRA", OTHER_TEXT).expect(200);
        Instant written = utc("13:06:00");
        clock.set(written);
        motive(ana.client(), health, "SALUD", HEALTH_TEXT).expect(200);

        purgeAt(utc("13:05:00").plus(RETENTION).plus(MICRO));
        purgeAt(written.plus(RETENTION));
        assertNotNull(jdbc.queryForObject("SELECT motive_ciphertext FROM deviations WHERE id = ?", byte[].class, health.toString()));
        assertEquals(HEALTH_TEXT, motiveText(company.admin(), health));
        Instant purgedAt = written.plus(RETENTION).plus(MICRO);
        purgeAt(purgedAt);
        purgeAt(purgedAt.plus(Duration.ofDays(1)));

        Map<String, Object> row = jdbc.queryForMap("SELECT motive_category, motive_text, motive_ciphertext, motive_iv, motive_cipher_key_id,"
                + " motive_author_account_id FROM deviations WHERE id = ?", health.toString());
        assertEquals("SALUD", row.get("motive_category"));
        assertNull(row.get("motive_text"));
        assertNull(row.get("motive_ciphertext"));
        assertNull(row.get("motive_iv"));
        assertNull(row.get("motive_cipher_key_id"));
        assertEquals(ana.accountId().toString(), row.get("motive_author_account_id"));
        assertEquals(purgedAt, instant("SELECT motive_purged_at FROM deviations WHERE id = ?", health), "a later run does not touch it again");
        assertEquals(written, instant("SELECT motive_created_at FROM deviations WHERE id = ?", health));
        assertEquals(OTHER_TEXT, jdbc.queryForObject("SELECT motive_text FROM deviations WHERE id = ?", String.class, other.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM deviations WHERE id = ? AND motive_purged_at IS NOT NULL", other));
        for (ApiClient reader : List.of(company.admin(), ana.client())) {
            JsonNode view = view(reader, health);
            assertEquals("SALUD", view.get("category").asText());
            assertTrue(isNull(view, "motiveText"), reader.actor());
            assertEquals("PENDIENTE_REVISION", view.get("status").asText());
            assertEquals(OTHER_TEXT, motiveText(reader, other));
        }
    }

    // S60 ------------------------------------------------------------------------------------------------------------

    @Test
    void s60ExactMarkCoordinatesAreReadOnlyByTheAdminOfTheCompany() {
        UUID ingreso = mark("12:00:00", "INGRESO");
        locate(ingreso, "12:00:05");
        Fixture.Employee beto = fixture.employee(company, "Beto", List.of(site), 10);
        Fixture.Company stranger = fixture.company("Ajena");
        String detail = "/api/v1/jornadas?from=" + DAY + "&to=" + DAY + "&includeDetail=true";

        ApiClient admin = company.admin();
        assertEquals(LATITUDE, admin.get("/api/v1/marks/" + ingreso).expect(200).body().get("latitude").asDouble());
        assertEquals(LONGITUDE, admin.get("/api/v1/jornadas/" + jornada).expect(200).body().get("marks").get(0).get("longitude").asDouble());
        assertEquals(LATITUDE, admin.get(detail).expect(200).body().get(0).get("marks").get(0).get("latitude").asDouble());

        // The employee herself sees that her location arrived, never the point; nor the site center.
        for (String path : List.of("/api/v1/marks/" + ingreso, "/api/v1/jornadas/" + jornada, "/api/v1/jornadas/mine?localDate=" + DAY,
                detail, "/api/v1/sites")) {
            ApiClient.Response response = ana.client().get(path).expect(200);
            assertFalse(response.raw().contains("34.6037") || response.raw().contains("58.3816"), path + " exposes coordinates");
        }
        assertEquals("RECIBIDA", ana.client().get("/api/v1/marks/" + ingreso).expect(200).body().get("locationStatus").asText());

        // A colleague and another company's ADMIN do not even see the mark.
        for (ApiClient outsider : List.of(beto.client(), stranger.admin())) {
            assertEquals(404, outsider.get("/api/v1/marks/" + ingreso).status(), outsider.actor());
            assertEquals(404, outsider.get("/api/v1/jornadas/" + jornada).status(), outsider.actor());
            assertFalse(outsider.get(detail).expect(200).raw().contains("34.6037"), outsider.actor());
        }
        ApiClient.Response byEmployeeFilter = beto.client().get(detail + "&employeeId=" + ana.id());
        assertEquals(403, byEmployeeFilter.status());
        assertEquals("FORBIDDEN", byEmployeeFilter.code());
    }

    @Test
    void s60NobodyButTheAuthorAndTheCompanyAdminReadsAMotive() {
        mark("12:30:00", "INGRESO");
        mark("13:00:00", "EGRESO");
        UUID health = deviation("LLEGADA_TARDE");
        UUID other = deviation("EGRESO_TEMPRANO");
        clock.set(utc("13:05:00"));
        motive(ana.client(), health, "SALUD", HEALTH_TEXT).expect(200);
        motive(ana.client(), other, "OTRA", OTHER_TEXT).expect(200);
        Fixture.Employee beto = fixture.employee(company, "Beto", List.of(site), 10);
        Fixture.Company stranger = fixture.company("Ajena");

        for (ApiClient outsider : List.of(beto.client(), stranger.admin())) {
            for (String path : List.of("/api/v1/deviations", "/api/v1/inbox",
                    "/api/v1/jornadas?from=" + DAY + "&to=" + DAY + "&includeDetail=true")) {
                ApiClient.Response response = outsider.get(path).expect(200);
                assertFalse(response.raw().contains("migraine") || response.raw().contains("bus strike")
                        || response.raw().contains(health.toString()), outsider.actor() + " " + path);
            }
        }
        ApiClient.Response inboxOfAna = beto.client().get("/api/v1/inbox?employeeId=" + ana.id());
        assertEquals(403, inboxOfAna.status());
        assertEquals("FORBIDDEN", inboxOfAna.code());
        ApiClient.Response overwrite = motive(beto.client(), health, "OTRA", "not my deviation");
        assertEquals(404, overwrite.status());
        assertEquals("NOT_FOUND", overwrite.code());
        assertEquals(ana.accountId().toString(), jdbc.queryForObject("SELECT motive_author_account_id FROM deviations WHERE id = ?",
                String.class, health.toString()));

        for (ApiClient reader : List.of(ana.client(), company.admin())) {
            assertEquals(HEALTH_TEXT, motiveText(reader, health), reader.actor());
            assertEquals(OTHER_TEXT, motiveText(reader, other), reader.actor());
        }
    }

    // S61 ------------------------------------------------------------------------------------------------------------

    // CHAR: the retention job never deletes login_throttles (the per-DNI HMAC rows); only a successful login does — confirm with Mateo.
    @Test
    void s61LoginIpThrottleRowsAreDeletedOneMicrosecondPastADayUnlessStillLocked() {
        assertEquals(0, count("SELECT COUNT(*) FROM login_ip_throttles"));
        Instant first = utc("09:00:00");
        failLoginAt(first);
        Instant second = utc("10:00:00");
        failLoginAt(second);
        assertEquals(List.of(first, second), throttleUpdates());

        purgeAt(first.plus(Duration.ofDays(1)));
        assertEquals(List.of(first, second), throttleUpdates());
        purgeAt(first.plus(Duration.ofDays(1)).plus(MICRO));
        assertEquals(List.of(second), throttleUpdates());

        // The default 15-minute lock always ends before the day is over; a lock configured longer than a day keeps the row.
        Instant lockedUntil = second.plus(Duration.ofDays(1)).plus(MICRO).plus(MICRO);
        jdbc.update("UPDATE login_ip_throttles SET locked_until = ?", Timestamp.from(lockedUntil));
        purgeAt(second.plus(Duration.ofDays(1)).plus(MICRO));
        assertEquals(List.of(second), throttleUpdates());
        purgeAt(lockedUntil);
        assertEquals(List.of(), throttleUpdates());

        assertEquals(1, count("SELECT COUNT(*) FROM login_throttles"), "the DNI counter outlives the retention job");
    }

    // helpers --------------------------------------------------------------------------------------------------------

    private static Instant utc(String time) {
        return Instant.parse(DAY + "T" + time + "Z");
    }

    private UUID mark(String time, String action) {
        clock.set(utc(time));
        return ana.client().mark(jornada, action, UUID.randomUUID()).expect(201).id();
    }

    /** Attaches the exact point at {@code time} and returns when the server received it. */
    private Instant locate(UUID mark, String time) {
        clock.set(utc(time));
        ana.client().post("/api/v1/marks/" + mark + "/location",
                Map.of("latitude", LATITUDE, "longitude", LONGITUDE, "accuracyMeters", 8.0)).expect(202);
        return instant("SELECT location_received_at FROM mark_events WHERE id = ?", mark);
    }

    /** A wrong password from a fresh client address, so each call writes its own IP throttle row. */
    private void failLoginAt(Instant at) {
        clock.set(at);
        assertEquals(401, fixture.client("attacker").login(company.adminDni(), "wrong-password-0000").status());
    }

    private ApiClient.Response motive(ApiClient client, UUID deviation, String category, String text) {
        return client.put("/api/v1/deviations/" + deviation + "/motive", Map.of("category", category, "text", text));
    }

    /** Runs the real retention job at {@code at}; afterwards nothing older than 90 days keeps personal data (I8, I15). */
    private void purgeAt(Instant at) {
        clock.set(at);
        retention.purgeSensitiveData();
        assertEquals(List.of(), new InvariantChecker(jdbc).afterRetention(at));
    }

    private JsonNode view(ApiClient reader, UUID deviation) {
        for (JsonNode item : reader.get("/api/v1/deviations").expect(200).body()) {
            if (item.get("id").asText().equals(deviation.toString())) return item;
        }
        throw new AssertionError(reader.actor() + " does not see deviation " + deviation);
    }

    private String motiveText(ApiClient reader, UUID deviation) {
        JsonNode view = view(reader, deviation);
        return isNull(view, "motiveText") ? null : view.get("motiveText").asText();
    }

    private static boolean isNull(JsonNode node, String field) {
        return node.get(field) == null || node.get(field).isNull();
    }

    private UUID deviation(String type) {
        return UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id = ? AND type = ? AND active", String.class,
                jornada.toString(), type));
    }

    private List<String> locationStatuses() {
        return jdbc.queryForList("SELECT location_status FROM mark_events WHERE jornada_id = ? ORDER BY sequence_number", String.class,
                jornada.toString());
    }

    private List<Instant> throttleUpdates() {
        return jdbc.queryForList("SELECT updated_at FROM login_ip_throttles ORDER BY updated_at", Timestamp.class).stream()
                .map(Timestamp::toInstant).toList();
    }

    private Instant instant(String sql, UUID id) {
        return jdbc.queryForObject(sql, Timestamp.class, id.toString()).toInstant();
    }

    private int count(String sql, Object... args) {
        Object[] values = new Object[args.length];
        for (int i = 0; i < args.length; i++) values[i] = args[i] instanceof UUID uuid ? uuid.toString() : args[i];
        return jdbc.queryForObject(sql, Integer.class, values);
    }
}
