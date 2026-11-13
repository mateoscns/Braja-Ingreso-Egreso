package com.braja.fichaje.campaign;

import com.braja.fichaje.security.PrivacyRetentionScheduler;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 2026-11-13: the ADMIN's day detail draws each mark on a map against the local's area, so the ADMIN can show an employee
 * where the phone said they were. The ADMIN reads the accuracy the phone reported for each mark and the geofence the day was
 * judged with (the jornada's snapshot, D-20261030-02); the employee reads neither, a purged mark has no accuracy, and another
 * company still sees nothing (CLAUDE.md rules 3 and 9). Site in Buenos Aires with a 100 m area; Ana marks about 400 m north.
 */
class MarkLocationMapSpecTest extends CampaignTestBase {
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    private static final double CENTER_LATITUDE = -34.6037;
    private static final double CENTER_LONGITUDE = -58.3816;
    private static final double MARK_LATITUDE = -34.6001;
    private static final double MARK_LONGITUDE = -58.3816;

    @Autowired private PrivacyRetentionScheduler retention;

    private Fixture.Company company;
    private UUID site;
    private Fixture.Employee ana;
    private UUID template;
    private UUID jornada;

    @BeforeEach
    void jornada() {
        company = fixture.company("Mapa");
        site = fixture.site(company, "Centro", "America/Argentina/Buenos_Aires");
        fixture.siteCenter(company, site, CENTER_LATITUDE, CENTER_LONGITUDE, 100);
        ana = fixture.employee(company, "Ana", List.of(site), 10);
        template = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        jornada = fixture.declare(company, ana.id(), site, DAY, template);
    }

    @AfterEach
    void noServerErrorAndInvariantsHold() {
        assertEquals(List.of(), httpLog.serverErrors());
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
    }

    @Test
    void theAdminReadsTheAccuracyOfEachMarkAndTheGeofenceTheDayWasJudgedWith() {
        UUID ingreso = markWithLocation("12:00:00", "INGRESO", 23.454);
        UUID salida = mark("15:00:00", "SALIDA_DESAYUNO");

        JsonNode day = company.admin().get("/api/v1/jornadas/" + jornada).expect(200).body();
        assertEquals(CENTER_LATITUDE, day.get("geofenceLatitude").asDouble());
        assertEquals(CENTER_LONGITUDE, day.get("geofenceLongitude").asDouble());
        assertEquals(100, day.get("geofenceRadiusMeters").asInt());
        JsonNode located = day.get("marks").get(0);
        assertEquals(ingreso.toString(), located.get("id").asText());
        assertEquals(MARK_LATITUDE, located.get("latitude").asDouble());
        // Stored rounded up to the centimeter (GeofencePolicy.storedAccuracy), the value the geofence judged.
        assertEquals(23.46, located.get("accuracyMeters").asDouble());
        JsonNode pending = day.get("marks").get(1);
        assertEquals(salida.toString(), pending.get("id").asText());
        assertTrue(isNull(pending, "accuracyMeters"), "a mark without location has no accuracy");

        assertEquals(23.46, company.admin().get("/api/v1/marks/" + ingreso).expect(200).body().get("accuracyMeters").asDouble());
        JsonNode history = company.admin().get("/api/v1/jornadas?from=" + DAY + "&to=" + DAY + "&includeDetail=true").expect(200).body();
        assertEquals(23.46, history.get(0).get("marks").get(0).get("accuracyMeters").asDouble());

        // The mark the map draws was judged outside by the same rule: a FUERA_DE_SEDE case exists for it.
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id = ? AND type = 'FUERA_DE_SEDE' AND active",
                Integer.class, jornada.toString()));
    }

    @Test
    void theEmployeeNeverReadsTheAccuracyNorTheGeofence() {
        UUID ingreso = markWithLocation("12:00:00", "INGRESO", 23.454);
        for (String path : List.of("/api/v1/marks/" + ingreso, "/api/v1/jornadas/" + jornada, "/api/v1/jornadas/mine?localDate=" + DAY,
                "/api/v1/jornadas?from=" + DAY + "&to=" + DAY + "&includeDetail=true")) {
            String raw = ana.client().get(path).expect(200).raw();
            assertFalse(raw.contains("accuracyMeters") || raw.contains("23.46"), path + " exposes the accuracy");
            assertFalse(raw.contains("geofence") || raw.contains("34.6037"), path + " exposes the local's area");
        }
    }

    @Test
    void aPurgedMarkHasNoAccuracyAndTheDayKeepsItsGeofence() {
        UUID ingreso = markWithLocation("12:00:00", "INGRESO", 8.0);
        Instant received = jdbc.queryForObject("SELECT location_received_at FROM mark_events WHERE id = ?", java.sql.Timestamp.class,
                ingreso.toString()).toInstant();
        clock.set(received.plus(Duration.ofDays(90)).plusSeconds(1));
        retention.purgeSensitiveData();

        JsonNode day = company.admin().get("/api/v1/jornadas/" + jornada).expect(200).body();
        JsonNode purged = day.get("marks").get(0);
        assertEquals("PURGADA", purged.get("locationStatus").asText());
        assertTrue(isNull(purged, "latitude"));
        assertTrue(isNull(purged, "accuracyMeters"), "the purge erases the accuracy with the point");
        assertTrue(isNull(company.admin().get("/api/v1/marks/" + ingreso).expect(200).body(), "accuracyMeters"));
        // The local's area is company data, not a person's: it stays.
        assertEquals(100, day.get("geofenceRadiusMeters").asInt());
    }

    @Test
    void aDayWithoutACenterHasNoGeofence() {
        UUID bare = fixture.site(company, "Sin ubicación", "America/Argentina/Buenos_Aires");
        Fixture.Employee beto = fixture.employee(company, "Beto", List.of(bare), 10);
        UUID bareTemplate = fixture.template(company, bare, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        UUID bareDay = fixture.declare(company, beto.id(), bare, DAY, bareTemplate);

        JsonNode day = company.admin().get("/api/v1/jornadas/" + bareDay).expect(200).body();
        for (String field : List.of("geofenceLatitude", "geofenceLongitude", "geofenceRadiusMeters")) {
            assertTrue(isNull(day, field), field);
        }
    }

    @Test
    void anotherCompanysAdminStillGets404() {
        UUID ingreso = markWithLocation("12:00:00", "INGRESO", 23.454);
        ApiClient stranger = fixture.company("Ajena").admin();
        assertEquals(404, stranger.get("/api/v1/jornadas/" + jornada).status());
        assertEquals("NOT_FOUND", stranger.get("/api/v1/jornadas/" + jornada).code());
        assertEquals(404, stranger.get("/api/v1/marks/" + ingreso).status());
        String history = stranger.get("/api/v1/jornadas?from=" + DAY + "&to=" + DAY + "&includeDetail=true").expect(200).raw();
        assertFalse(history.contains("23.46") || history.contains("geofence"), "another company reads nothing of this day");
    }

    // helpers --------------------------------------------------------------------------------------------------------

    private static Instant utc(String time) {
        return Instant.parse(DAY + "T" + time + "Z");
    }

    private UUID mark(String time, String action) {
        clock.set(utc(time));
        return ana.client().mark(jornada, action, UUID.randomUUID()).expect(201).id();
    }

    private UUID markWithLocation(String time, String action, double accuracyMeters) {
        UUID mark = mark(time, action);
        clock.advance(Duration.ofSeconds(5));
        ana.client().post("/api/v1/marks/" + mark + "/location",
                Map.of("latitude", MARK_LATITUDE, "longitude", MARK_LONGITUDE, "accuracyMeters", accuracyMeters)).expect(202);
        return mark;
    }

    private static boolean isNull(JsonNode node, String field) {
        return node.get(field) == null || node.get(field).isNull();
    }
}
