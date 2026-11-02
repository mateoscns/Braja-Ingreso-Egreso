package com.braja.fichaje.campaign;

import com.braja.fichaje.timekeeping.MarkScheduler;
import com.braja.fichaje.timekeeping.MarkService;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * S39-S44: the site geofence (D-20261027-12, D-20261029-01, D-20261030-01, D-20261030-02) through real HTTP with the server
 * clock under test control, including badly timed sequences. The jornada is 09:00-17:00 in Buenos Aires on 2027-03-01
 * (12:00Z-20:00Z). Coordinates: CENTER, NEAR (same meridian, about 88.956 m north) and FAR (about 1.1 km north).
 */
class GeofenceSpecTest extends CampaignTestBase {
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    private static final double CENTER_LAT = -34.6037;
    private static final double LON = -58.3816;
    private static final double NEAR_LAT = -34.6029;
    private static final double FAR_LAT = -34.5937;

    @Autowired private MarkScheduler scheduler;
    @Autowired private MarkService marks;

    private Fixture.Company company;
    private UUID site;
    private UUID template;
    private Fixture.Employee employee;

    @BeforeEach
    void siteWithoutCenter() {
        company = fixture.company("Geocerca");
        site = fixture.site(company, "Centro", "America/Argentina/Buenos_Aires");
        employee = fixture.employee(company, "Ana", List.of(site), 10);
        template = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
    }

    @AfterEach
    void noInvariantBrokenAndNoServerError() {
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
        assertEquals(List.of(), httpLog.serverErrors());
    }

    // S39: inside iff distance + accuracy <= radius, against the jornada's frozen center. Each case is checked against the rule
    // first (haversine below, the formula GeofencePolicy documents) so the chosen coordinates really sit on the intended side.

    static Stream<Arguments> s39Edges() {
        return Stream.of(
                Arguments.of("on the center, accuracy = radius 100", 100, CENTER_LAT, 100.0, true),
                Arguments.of("on the center, accuracy = radius 100 + 1 cm", 100, CENTER_LAT, 100.01, false),
                Arguments.of("on the center, accuracy = minimum radius 50", 50, CENTER_LAT, 50.0, true),
                Arguments.of("on the center, accuracy = minimum radius 50 + 1 cm", 50, CENTER_LAT, 50.01, false),
                Arguments.of("on the center, accuracy = maximum radius 500", 500, CENTER_LAT, 500.0, true),
                Arguments.of("on the center, accuracy = maximum radius 500 + 1 cm", 500, CENTER_LAT, 500.01, false),
                Arguments.of("88.956 m away + 11.04 m = 99.996 m", 100, NEAR_LAT, 11.04, true),
                Arguments.of("88.956 m away + 11.05 m = 100.006 m", 100, NEAR_LAT, 11.05, false));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("s39Edges")
    void s39InsideIffDistancePlusAccuracyFitsTheRadius(String edge, int radius, double latitude, double accuracy, boolean inside) {
        assertEquals(inside, haversine(CENTER_LAT, LON, latitude, LON) + accuracy <= radius, "the case itself is on the wrong side");
        fixture.siteCenter(company, site, CENTER_LAT, LON, radius);
        UUID jornada = declare(DAY);

        UUID ingreso = mark(jornada, at(DAY, "12:00:00"), "INGRESO");
        clock.set(at(DAY, "12:00:01"));
        assertEquals("RECIBIDA", location(ingreso, latitude, LON, accuracy).expect(202).body().get("locationStatus").asText());

        assertEquals(inside ? null : ingreso.toString(), activeAnchor(jornada));
        assertEquals(inside ? 0 : 1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE'", jornada));
    }

    // S40: one FUERA_DE_SEDE per jornada, from the first triggering mark; later marks are never blocked and nothing is pushed.

    @Test
    void s40OneDeviationPerJornadaWhateverTheNumberOfOutsideMarksAndItIsNeverPushed() {
        fixture.siteCenter(company, site, CENTER_LAT, LON, 100);
        UUID jornada = declare(DAY);
        UUID ingreso = mark(jornada, at(DAY, "12:00:00"), "INGRESO");
        location(ingreso, FAR_LAT, LON, 5).expect(202);
        location(mark(jornada, at(DAY, "14:00:00"), "SALIDA_DESAYUNO"), FAR_LAT, LON, 5).expect(202);
        mark(jornada, at(DAY, "14:10:00"), "VUELTA_DESAYUNO");
        clock.set(at(DAY, "14:10:31"));
        scheduler.resolveLocationTimeouts();
        location(mark(jornada, at(DAY, "20:00:00"), "EGRESO"), FAR_LAT, LON, 5).expect(202);

        assertEquals("EGRESADA", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornada.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE'", jornada));
        assertEquals(ingreso.toString(), activeAnchor(jornada));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits a JOIN deviations d ON d.id=a.deviation_id "
                + "WHERE d.jornada_id=? AND a.change_type='CREATED'", jornada));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox_events", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM notification_windows", Integer.class));
        JsonNode listed = only(company.admin().get("/api/v1/deviations").expect(200).body(), "FUERA_DE_SEDE");
        assertEquals(false, listed.get("pushEligible").asBoolean());
        assertEquals(ingreso.toString(), listed.get("sourceMarkId").asText());
        assertEquals("MOTIVO_PENDIENTE", listed.get("status").asText());
    }

    // S41: the center is frozen at declaration (D-20261030-02). The change happens between the declaration and the marks.

    @ParameterizedTest(name = "center {0} after the first declaration")
    @CsvSource({"MOVED, true", "REMOVED, false", "RADIUS_SHRUNK_TO_50, true"})
    void s41SiteChangesReachOnlyJornadasDeclaredAfterThem(String change, boolean laterJornadaOutside) {
        fixture.siteCenter(company, site, CENTER_LAT, LON, 500);
        UUID earlier = declare(DAY);
        Map<String, Object> body = new HashMap<>();
        switch (change) {
            case "MOVED" -> { body.put("latitude", FAR_LAT); body.put("longitude", LON); body.put("geofenceRadiusMeters", 500); body.put("locationSource", "MANUAL"); }
            case "REMOVED" -> { body.put("latitude", null); body.put("longitude", null); body.put("geofenceRadiusMeters", 500); }
            default -> { body.put("latitude", CENTER_LAT); body.put("longitude", LON); body.put("geofenceRadiusMeters", 50); }
        }
        company.admin().put("/api/v1/sites/" + site + "/location", body).expect(200);
        UUID later = declare(DAY.plusDays(1));

        Map<String, Object> frozen = jdbc.queryForMap("SELECT site_geofence_latitude_snapshot lat,site_geofence_radius_snapshot radius FROM jornadas WHERE id=?",
                earlier.toString());
        assertEquals(0, new BigDecimal("-34.6037").compareTo((BigDecimal) frozen.get("lat")));
        assertEquals(500, ((Number) frozen.get("radius")).intValue());

        // 88.956 + 11.04 m: inside the frozen 500 m, outside a 50 m radius and far from the moved center.
        location(mark(earlier, at(DAY, "12:00:00"), "INGRESO"), NEAR_LAT, LON, 11.04).expect(202);
        UUID laterIngreso = mark(later, at(DAY.plusDays(1), "12:00:00"), "INGRESO");
        location(laterIngreso, NEAR_LAT, LON, 11.04).expect(202);

        assertEquals(0, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE'", earlier));
        assertEquals(laterJornadaOutside ? laterIngreso.toString() : null, activeAnchor(later));
    }

    // S41 and an employee without GPS: no location becomes SIN_UBICACION; it is FUERA_DE_SEDE only where the jornada has a
    // center, because D-20261027-12 and ESPECIFICACION.md say a missing location generates FUERA_DE_SEDE.
    @Test
    void s41JornadaDeclaredWithoutCenterIsNeverEvaluatedAndANoGpsEmployeeIsOutsideOnlyWhereThereIsACenter() {
        UUID withoutCenter = declare(DAY);
        fixture.siteCenter(company, site, CENTER_LAT, LON, 100);
        UUID withCenter = declare(DAY.plusDays(1));
        assertNull(jdbc.queryForObject("SELECT site_geofence_radius_snapshot FROM jornadas WHERE id=?", Integer.class, withoutCenter.toString()));

        UUID first = mark(withoutCenter, at(DAY, "12:00:00"), "INGRESO");
        clock.set(at(DAY, "12:00:31"));
        scheduler.resolveLocationTimeouts();
        location(mark(withoutCenter, at(DAY, "14:00:00"), "SALIDA_DESAYUNO"), FAR_LAT, LON, 5).expect(202);
        assertEquals("SIN_UBICACION", locationStatus(first));
        assertEquals(0, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE'", withoutCenter));

        UUID noGps = mark(withCenter, at(DAY.plusDays(1), "12:00:00"), "INGRESO");
        clock.set(at(DAY.plusDays(1), "12:00:30"));
        scheduler.resolveLocationTimeouts(); // the job edge is strict: exactly 30 s still waits
        assertEquals("PENDIENTE", locationStatus(noGps));
        clock.set(at(DAY.plusDays(1), "12:00:30").plusNanos(1_000));
        scheduler.resolveLocationTimeouts();
        assertEquals("SIN_UBICACION", locationStatus(noGps));
        assertEquals(noGps.toString(), activeAnchor(withCenter));
    }

    // Location window: a location received at exactly accepted + 30 s counts; 1 µs later it is rejected and writes nothing.

    @ParameterizedTest(name = "location received {0} µs after the 30 s edge")
    @ValueSource(longs = {0, 1})
    void locationAtExactlyThirtySecondsIsOnTimeAndOneMicrosecondLaterIsRejected(long microsLate) {
        fixture.siteCenter(company, site, CENTER_LAT, LON, 100);
        UUID jornada = declare(DAY);
        UUID ingreso = mark(jornada, at(DAY, "12:00:00"), "INGRESO");
        clock.set(at(DAY, "12:00:30").plusNanos(microsLate * 1_000));

        ApiClient.Response response = location(ingreso, FAR_LAT, LON, 5);

        if (microsLate == 0) {
            response.expect(202);
            assertEquals("RECIBIDA", locationStatus(ingreso));
        } else {
            assertProblem(response, 409, "LOCATION_WINDOW_EXPIRED");
            assertEquals("PENDIENTE", locationStatus(ingreso));
            assertEquals(0, count("SELECT COUNT(*) FROM mark_events WHERE id=? AND latitude IS NOT NULL", ingreso));
            assertNull(activeAnchor(jornada));
            scheduler.resolveLocationTimeouts();
            assertEquals("SIN_UBICACION", locationStatus(ingreso));
        }
        assertEquals(ingreso.toString(), activeAnchor(jornada));
    }

    // S42 by an on-time location: the timeout worker ticked at +31 s while the location request, received at exactly +30 s,
    // waited for the jornada lock (the worker is called with its own tick; the request reads the clock).
    @ParameterizedTest(name = "on-time location after the timeout, inside={0}")
    @ValueSource(booleans = {true, false})
    void s42OnTimeLocationAfterTheTimeoutKeepsOrRetractsTheProvisionalDeviation(boolean inside) {
        fixture.siteCenter(company, site, CENTER_LAT, LON, 100);
        UUID jornada = declare(DAY);
        UUID ingreso = mark(jornada, at(DAY, "12:00:00"), "INGRESO");
        marks.resolveLocationTimeouts(at(DAY, "12:00:31"));
        UUID deviation = UUID.fromString(activeAnchorDeviation(jornada));
        clock.set(at(DAY, "12:00:30"));

        location(ingreso, inside ? CENTER_LAT : FAR_LAT, LON, 5).expect(202);

        assertEquals("RECIBIDA", locationStatus(ingreso));
        assertEquals(inside ? null : ingreso.toString(), activeAnchor(jornada));
        assertEquals(1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE'", jornada));
        assertEquals(inside ? 1 : 0, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='RETRACTED'", deviation));
    }

    // S42 by a void. The anchor is a later mark whose location arrived first, so voiding it leaves a valid history.

    @ParameterizedTest(name = "the INGRESO left behind is {0}")
    @ValueSource(strings = {"OUTSIDE", "WITHOUT_LOCATION"})
    void s42VoidedAnchorMovesToTheOtherOutsideMarkKeepsTheMotiveAndGoesBackToReview(String remaining) {
        fixture.siteCenter(company, site, CENTER_LAT, LON, 100);
        UUID jornada = declare(DAY);
        UUID ingreso = mark(jornada, at(DAY, "12:00:00"), "INGRESO");
        UUID anchor = mark(jornada, at(DAY, "12:00:05"), "SALIDA_DESAYUNO");
        location(anchor, FAR_LAT, LON, 5).expect(202);
        if ("OUTSIDE".equals(remaining)) {
            clock.set(at(DAY, "12:00:10"));
            location(ingreso, FAR_LAT, LON, 5).expect(202);
        } else {
            clock.set(at(DAY, "12:00:31"));
            scheduler.resolveLocationTimeouts();
        }
        UUID deviation = UUID.fromString(activeAnchorDeviation(jornada));
        assertEquals(anchor.toString(), activeAnchor(jornada));
        employee.client().put("/api/v1/deviations/" + deviation + "/motive", Map.of("category", "TRANSPORTE", "text", "The bus left me two blocks away")).expect(200);
        classify(deviation).expect(200);

        clock.set(at(DAY, "12:01:00"));
        voidMark(anchor).expect(200);

        assertEquals(ingreso.toString(), activeAnchor(jornada));
        assertEquals(deviation.toString(), activeAnchorDeviation(jornada));
        Map<String, Object> row = jdbc.queryForMap("SELECT classification,motive_category FROM deviations WHERE id=?", deviation.toString());
        assertNull(row.get("classification"));
        assertEquals("TRANSPORTE", row.get("motive_category"));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='CLASSIFICATION_RESET' "
                + "AND before_classification='JUSTIFICADO' AND after_classification IS NULL AND audit_reason='Source mark changed'", deviation));
        assertEquals("PENDIENTE_REVISION", only(company.admin().get("/api/v1/deviations").expect(200).body(), "FUERA_DE_SEDE").get("status").asText());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox_events", Integer.class));
    }

    // S42 + S43: with no other employee mark outside or without location, the deviation is retracted; an ADMIN forgotten mark
    // never takes the anchor.
    @ParameterizedTest(name = "the INGRESO left behind is {0}")
    @ValueSource(strings = {"INSIDE", "FORGOTTEN_BY_ADMIN"})
    void s42VoidedAnchorIsRetractedWhenNoOtherEmployeeMarkIsOutside(String remaining) {
        fixture.siteCenter(company, site, CENTER_LAT, LON, 100);
        UUID jornada = declare(DAY);
        UUID ingreso;
        if ("INSIDE".equals(remaining)) {
            ingreso = mark(jornada, at(DAY, "12:00:00"), "INGRESO");
        } else {
            clock.set(at(DAY, "12:00:00"));
            ingreso = forgotten(jornada, "INGRESO", at(DAY, "11:59:00")).expect(201).id();
        }
        UUID anchor = mark(jornada, at(DAY, "12:00:05"), "SALIDA_DESAYUNO");
        location(anchor, FAR_LAT, LON, 5).expect(202);
        if ("INSIDE".equals(remaining)) {
            clock.set(at(DAY, "12:00:10"));
            location(ingreso, CENTER_LAT, LON, 5).expect(202);
        }
        UUID deviation = UUID.fromString(activeAnchorDeviation(jornada));

        clock.set(at(DAY, "12:01:00"));
        voidMark(anchor).expect(200);

        assertNull(activeAnchor(jornada));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='RETRACTED' AND before_type='FUERA_DE_SEDE'", deviation));
        assertEquals("EN_CURSO", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornada.toString()));
        assertEquals(ingreso.toString(), jdbc.queryForObject("SELECT id FROM mark_events WHERE jornada_id=? AND voided_at IS NULL", String.class, jornada.toString()));
    }

    // CHAR: re-anchoring ignores a mark whose location is still PENDIENTE, so the deviation is retracted; when that location
    // then arrives outside, the same row reopens as a new fact without the motive the employee had written — confirm with Mateo.
    @Test
    void s42VoidedAnchorWithTheOtherLocationStillPendingIsRetractedAndReopensWithoutTheMotive() {
        fixture.siteCenter(company, site, CENTER_LAT, LON, 100);
        UUID jornada = declare(DAY);
        UUID ingreso = mark(jornada, at(DAY, "12:00:00"), "INGRESO");
        UUID anchor = mark(jornada, at(DAY, "12:00:05"), "SALIDA_DESAYUNO");
        location(anchor, FAR_LAT, LON, 5).expect(202);
        UUID deviation = UUID.fromString(activeAnchorDeviation(jornada));
        employee.client().put("/api/v1/deviations/" + deviation + "/motive", Map.of("category", "OTRA", "text", "Picked up keys next door")).expect(200);

        clock.set(at(DAY, "12:00:10"));
        voidMark(anchor).expect(200);
        assertNull(activeAnchor(jornada));

        clock.set(at(DAY, "12:00:20"));
        location(ingreso, FAR_LAT, LON, 5).expect(202);
        assertEquals(ingreso.toString(), activeAnchor(jornada));
        assertEquals(deviation.toString(), activeAnchorDeviation(jornada));
        assertNull(jdbc.queryForMap("SELECT motive_category FROM deviations WHERE id=?", deviation.toString()).get("motive_category"));
    }

    // S39 x S42: the second evaluation reads the stored accuracy (DECIMAL(9,2)) while the first used the reported value.
    @Test
    @KnownDefect(issue = "#77", reason = "Re-anchoring evaluates the stored accuracy rounded to 2 decimals, so a mark reported 100.004 m off a 100 m radius counts as outside at receipt and inside after the anchor is voided.")
    void s42ReAnchoringJudgesTheOtherMarkWithTheAccuracyItReported() {
        fixture.siteCenter(company, site, CENTER_LAT, LON, 100);
        UUID jornada = declare(DAY);
        UUID ingreso = mark(jornada, at(DAY, "12:00:00"), "INGRESO");
        UUID anchor = mark(jornada, at(DAY, "12:00:05"), "SALIDA_DESAYUNO");
        location(anchor, FAR_LAT, LON, 5).expect(202);
        clock.set(at(DAY, "12:00:10"));
        location(ingreso, CENTER_LAT, LON, 100.004).expect(202); // 0 + 100.004 > 100: outside by the rule
        clock.set(at(DAY, "12:01:00"));
        voidMark(anchor).expect(200);

        assertEquals(ingreso.toString(), activeAnchor(jornada));
    }

    // S43: ADMIN forgotten marks are not evaluated, and the employee cannot attach a location to them afterwards.

    @Test
    void s43ForgottenMarksAreNeverEvaluated() {
        fixture.siteCenter(company, site, CENTER_LAT, LON, 100);
        UUID jornada = declare(DAY);
        clock.set(at(DAY, "12:30:00"));
        UUID ingreso = forgotten(jornada, "INGRESO", at(DAY, "12:00:00")).expect(201).id();
        UUID salida = forgotten(jornada, "SALIDA_DESAYUNO", at(DAY, "12:20:00")).expect(201).id();
        clock.set(at(DAY, "12:31:00"));
        scheduler.resolveLocationTimeouts();

        assertProblem(location(ingreso, FAR_LAT, LON, 5), 409, "LOCATION_ALREADY_FINAL");
        assertEquals(List.of("NO_APLICA", "NO_APLICA"), List.of(locationStatus(ingreso), locationStatus(salida)));
        assertEquals(0, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=? AND latitude IS NOT NULL", jornada));
        assertEquals(0, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE'", jornada));
    }

    // S44: PUT /sites/{id}/location.

    @ParameterizedTest(name = "radius {0}")
    @CsvSource({"49, 422", "50, 200", "500, 200", "501, 422"})
    void s44RadiusIsAcceptedFrom50To500(int radius, int status) {
        ApiClient.Response response = company.admin().put("/api/v1/sites/" + site + "/location",
                Map.of("latitude", CENTER_LAT, "longitude", LON, "geofenceRadiusMeters", radius, "locationSource", "MANUAL"));

        assertEquals(status, response.status(), response.raw());
        Map<String, Object> stored = jdbc.queryForMap("SELECT latitude,geofence_radius_meters radius FROM sites WHERE id=?", site.toString());
        if (status == 200) {
            assertEquals(radius, ((Number) stored.get("radius")).intValue());
            assertEquals(1, count("SELECT COUNT(*) FROM site_location_audits WHERE site_id=? AND after_radius_meters=" + radius
                    + " AND location_source='MANUAL'", site));
        } else {
            assertEquals("VALIDATION_ERROR", response.code());
            assertNull(stored.get("latitude"));
            assertEquals(100, ((Number) stored.get("radius")).intValue());
            assertEquals(0, count("SELECT COUNT(*) FROM site_location_audits WHERE site_id=?", site));
        }
    }

    @Test
    void s44SourceIsRequiredWhenTheCenterIsSetOrMovedAndEveryChangeIsAuditedWithItsActor() {
        assertProblem(putLocation(CENTER_LAT, 100, null), 422, "VALIDATION_ERROR");          // new center without source
        putLocation(CENTER_LAT, 100, "CAPTURED").expect(200);
        assertProblem(putLocation(FAR_LAT, 100, null), 422, "VALIDATION_ERROR");             // moved center without source
        putLocation(FAR_LAT, 100, "MANUAL").expect(200);
        putLocation(FAR_LAT, 250, null).expect(200);                                         // radius only: no source needed
        putLocation(FAR_LAT, 250, null).expect(200);                                         // unchanged: no audit
        putLocation(null, 250, null).expect(200);                                            // cleared: no source needed
        putLocation(null, 250, null).expect(200);

        JsonNode entries = company.admin().get("/api/v1/sites/" + site + "/location-audit").expect(200).body().get("entries");
        List<String> described = new ArrayList<>();
        for (JsonNode entry : entries) {
            assertEquals("Admin Geocerca", entry.get("actorDisplayName").asText());
            described.add(text(entry, "beforeLatitude") + "/" + text(entry, "beforeRadiusMeters") + " -> "
                    + text(entry, "afterLatitude") + "/" + text(entry, "afterRadiusMeters") + " " + text(entry, "locationSource"));
        }
        assertEquals(List.of("-34.5937/250 -> null/250 null", "-34.5937/100 -> -34.5937/250 null",
                "-34.6037/100 -> -34.5937/100 MANUAL", "null/100 -> -34.6037/100 CAPTURED"), described);
        assertEquals(4, count("SELECT COUNT(*) FROM site_location_audits WHERE site_id=? AND actor_account_id='" + company.adminAccountId() + "'", site));
        assertNull(jdbc.queryForMap("SELECT latitude FROM sites WHERE id=?", site.toString()).get("latitude"));
    }

    // Helpers

    /** Haversine with the mean Earth radius, as GeofencePolicy documents it; meters. */
    private static double haversine(double latA, double lonA, double latB, double lonB) {
        double a = Math.toRadians(latA);
        double b = Math.toRadians(latB);
        double sinLat = Math.sin((b - a) / 2.0);
        double sinLon = Math.sin(Math.toRadians(lonB - lonA) / 2.0);
        double h = sinLat * sinLat + Math.cos(a) * Math.cos(b) * sinLon * sinLon;
        return 2.0 * 6_371_008.8 * Math.asin(Math.min(1.0, Math.sqrt(h)));
    }

    private UUID declare(LocalDate date) {
        return fixture.declare(company, employee.id(), site, date, template);
    }

    private UUID mark(UUID jornada, Instant at, String action) {
        clock.set(at);
        return employee.client().mark(jornada, action, UUID.randomUUID()).expect(201).id();
    }

    /** Received at the current clock, i.e. right after the mark unless the test moved it. */
    private ApiClient.Response location(UUID markId, double latitude, double longitude, double accuracy) {
        return employee.client().post("/api/v1/marks/" + markId + "/location",
                Map.of("latitude", latitude, "longitude", longitude, "accuracyMeters", accuracy));
    }

    private ApiClient.Response forgotten(UUID jornada, String action, Instant occurredAt) {
        return company.admin().post("/api/v1/admin/jornadas/" + jornada + "/forgotten-marks",
                Map.of("action", action, "occurredAt", occurredAt.toString(), "auditReason", "Employee forgot to mark"));
    }

    private ApiClient.Response voidMark(UUID markId) {
        return company.admin().post("/api/v1/admin/marks/" + markId + "/void", Map.of("reason", "Marked by mistake"));
    }

    private ApiClient.Response classify(UUID deviation) {
        Map<String, Object> body = new HashMap<>();
        body.put("classification", "JUSTIFICADO");
        body.put("correctionReason", null);
        return company.admin().put("/api/v1/admin/deviations/" + deviation + "/classification", body);
    }

    private ApiClient.Response putLocation(Double latitude, int radius, String source) {
        clock.advance(java.time.Duration.ofMinutes(1)); // distinct changed_at, so the audit order is the request order
        Map<String, Object> body = new HashMap<>();
        body.put("latitude", latitude);
        body.put("longitude", latitude == null ? null : LON);
        body.put("geofenceRadiusMeters", radius);
        if (source != null) body.put("locationSource", source);
        return company.admin().put("/api/v1/sites/" + site + "/location", body);
    }

    private String activeAnchor(UUID jornada) {
        List<String> anchors = jdbc.queryForList("SELECT source_mark_id FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE' AND active",
                String.class, jornada.toString());
        return anchors.isEmpty() ? null : anchors.getFirst();
    }

    private String activeAnchorDeviation(UUID jornada) {
        return jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE' AND active", String.class, jornada.toString());
    }

    private String locationStatus(UUID markId) {
        return jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, markId.toString());
    }

    private int count(String sql, UUID id) {
        return jdbc.queryForObject(sql, Integer.class, id.toString());
    }

    private static JsonNode only(JsonNode list, String type) {
        List<JsonNode> matches = new ArrayList<>();
        list.forEach(item -> { if (type.equals(item.get("type").asText())) matches.add(item); });
        assertEquals(1, matches.size(), list.toString());
        return matches.getFirst();
    }

    private static String text(JsonNode entry, String field) {
        JsonNode value = entry.get(field);
        if (value == null || value.isNull()) return "null";
        return value.isNumber() ? new BigDecimal(value.asText()).stripTrailingZeros().toPlainString() : value.asText();
    }

    private static Instant at(LocalDate date, String hhmmss) {
        return Instant.parse(date + "T" + hhmmss + "Z");
    }

    private static void assertProblem(ApiClient.Response response, int status, String code) {
        assertEquals(status, response.status(), response.raw());
        assertEquals(code, response.code(), response.raw());
    }
}
