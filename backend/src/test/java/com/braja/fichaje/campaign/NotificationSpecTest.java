package com.braja.fichaje.campaign;

import com.braja.fichaje.campaign.FakeWebPushGateway.Delivery;
import com.braja.fichaje.campaign.FakeWebPushGateway.Outcome;
import com.braja.fichaje.notifications.NotificationOutboxDispatcher;
import com.braja.fichaje.timekeeping.MarkScheduler;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S55-S58 and D-20261027-04: push notices through the real HTTP API, the real absence job and the real dispatcher, with the
 * server clock under test control and the fake provider recording every delivery. Jornadas are 09:00-17:00 in Buenos Aires
 * (12:00Z-20:00Z, tolerance 10 min) unless a test says otherwise; jobs are called by hand at the instant the test sets.
 */
class NotificationSpecTest extends CampaignTestBase {
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    private static final String ZONE = "America/Argentina/Buenos_Aires";
    private static final Duration MICRO = Duration.of(1, ChronoUnit.MICROS);
    private static final Set<String> PAYLOAD_FIELDS = Set.of("tag", "title", "body", "navigation", "totalCount", "siteCounts");
    private static final Set<String> SITE_COUNT_FIELDS = Set.of("siteId", "siteName", "count");

    @Autowired private MarkScheduler markScheduler;
    @Autowired private NotificationOutboxDispatcher dispatcher;

    /** A one-site company with one employee and one jornada on DAY. */
    private record Shop(Fixture.Company company, UUID site, Fixture.Employee employee, UUID jornada) { }

    @AfterEach
    void noServerErrorAndInvariantsHold() {
        assertEquals(List.of(), httpLog.serverErrors());
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
    }

    // S55 ------------------------------------------------------------------------------------------------------------

    @Test
    void s55OnlyAbsenceAndLateArrivalNotifyInFiveMinuteWindowsPerCompanyCountedPerSite() {
        Fixture.Company company = fixture.company("Avisos");
        UUID centro = fixture.site(company, "Centro", ZONE);
        UUID norte = fixture.site(company, "Norte", ZONE);
        UUID sur = fixture.site(company, "Sur", ZONE);
        UUID centroTemplate = template(company, centro, "09:00");
        UUID norteTemplate = template(company, norte, "09:00");
        UUID surTemplate = template(company, sur, "09:03");
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(centro, sur), 10);
        Fixture.Employee beto = fixture.employee(company, "Beto", List.of(norte, sur), 10);
        Fixture.Employee caro = fixture.employee(company, "Caro", List.of(centro, norte), 10);
        UUID anaCentro = fixture.declare(company, ana.id(), centro, DAY, centroTemplate);
        UUID anaSur = fixture.declare(company, ana.id(), sur, DAY, surTemplate);
        UUID betoNorte = fixture.declare(company, beto.id(), norte, DAY, norteTemplate);
        UUID betoSur = fixture.declare(company, beto.id(), sur, DAY, surTemplate);
        UUID caroCentro = fixture.declare(company, caro.id(), centro, DAY, centroTemplate);
        UUID caroNorte = fixture.declare(company, caro.id(), norte, DAY, norteTemplate);
        Shop other = shop("Otra", "Dora");
        String endpoint = subscribe(company.admin());
        String otherEndpoint = subscribe(other.company().admin());

        mark(caro, caroCentro, "INGRESO", utc("12:00:00"));
        mark(ana, anaCentro, "INGRESO", utc("12:11:00"));      // LLEGADA_TARDE at Centro opens window 1 at 12:11
        runAbsenceJob(utc("12:11:00"));                        // SIN_INGRESO for Beto and Caro at Norte, and Dora in the other company
        mark(caro, caroCentro, "EGRESO", utc("12:12:00"));     // EGRESO_TEMPRANO: a deviation that never notifies
        mark(ana, anaSur, "INGRESO", utc("12:15:59.999999"));  // LLEGADA_TARDE at Sur in the window's last microsecond
        dispatch(utc("12:15:59.999999"));
        assertEquals(List.of(), push.deliveries(), "nothing is sent before a window ends");

        runAbsenceJob(utc("12:16:00"));                        // SIN_INGRESO for Beto at Sur, exactly at the end: window 2
        dispatch(utc("12:16:00"));
        dispatch(utc("12:20:59.999999"));
        assertEquals(2, push.deliveries().size());
        dispatch(utc("12:21:00"));

        assertEquals(List.of("EGRESO_TEMPRANO"), jdbc.queryForList("SELECT d.type FROM deviations d LEFT JOIN notification_outbox_events e"
                + " ON e.deviation_id = d.id WHERE d.company_id = ? AND e.id IS NULL", String.class, company.id().toString()));
        assertEquals(List.of("LLEGADA_TARDE", "LLEGADA_TARDE", "SIN_INGRESO", "SIN_INGRESO", "SIN_INGRESO"), jdbc.queryForList(
                "SELECT deviation_type FROM notification_outbox_events WHERE company_id = ? ORDER BY deviation_type", String.class,
                company.id().toString()));
        assertEquals(List.of("2027-03-01T12:11:00Z 2027-03-01T12:16:00Z SENT 1", "2027-03-01T12:16:00Z 2027-03-01T12:21:00Z SENT 1"),
                windows(company.id()));

        List<JsonNode> sent = payloadsTo(endpoint);
        assertEquals(2, sent.size());
        assertPayload(sent.get(0), 4, "Hay 4 desvíos nuevos para revisar.", Map.of("Centro", 1L, "Norte", 2L, "Sur", 1L));
        assertPayload(sent.get(1), 1, "Hay 1 desvío nuevo para revisar.", Map.of("Sur", 1L));
        assertEquals(Map.of("Centro", centro.toString(), "Norte", norte.toString(), "Sur", sur.toString()), siteIds(sent.get(0)));
        assertNotEquals(sent.get(0).get("tag").asText(), sent.get(1).get("tag").asText());
        for (Delivery delivery : push.deliveries()) {
            assertEquals(json(delivery.payload()).get("tag").asText().substring(0, 32), delivery.topic());
        }
        // The other company's window shares the same minutes but is its own, sent only to its own ADMIN.
        List<JsonNode> otherSent = payloadsTo(otherEndpoint);
        assertEquals(1, otherSent.size());
        assertPayload(otherSent.get(0), 1, "Hay 1 desvío nuevo para revisar.", Map.of("Local Otra", 1L));
        assertEquals(List.of("2027-03-01T12:11:00Z 2027-03-01T12:16:00Z SENT 1"), windows(other.company().id()));
        assertEquals(3, push.deliveries().size());
    }

    /**
     * R2 (D-20261102-03) end to end: the same tick records today's absence (1 min after 09:10) and the absence of a date the ADMIN
     * declared for three days ago; the ADMIN's only push counts today's, and the old one waits in the inbox without a notice.
     */
    @Test
    void s55AnAbsenceDetectedMoreThanTwoHoursAfterItWasDueIsRecordedButCountedInNoPush() {
        Shop shop = shop("Frescos", "Ana");
        Fixture.Employee beto = fixture.employee(shop.company(), "Beto", List.of(shop.site()), 10);
        UUID template = UUID.fromString(jdbc.queryForObject("SELECT template_id FROM jornadas WHERE id = ?", String.class, shop.jornada().toString()));
        UUID old = fixture.declare(shop.company(), beto.id(), shop.site(), DAY.minusDays(3), template);
        String endpoint = subscribe(shop.company().admin());

        runAbsenceJob(utc("12:11:00"));
        dispatch(utc("12:16:00"));

        assertEquals("SIN_INGRESO", jdbc.queryForObject("SELECT type FROM deviations WHERE jornada_id = ? AND active", String.class, old.toString()));
        assertEquals(List.of(shop.jornada().toString()), jdbc.queryForList("SELECT d.jornada_id FROM notification_outbox_events e"
                + " JOIN deviations d ON d.id = e.deviation_id", String.class));
        List<JsonNode> sent = payloadsTo(endpoint);
        assertEquals(1, sent.size());
        assertPayload(sent.get(0), 1, "Hay 1 desvío nuevo para revisar.", Map.of("Local Frescos", 1L));
    }

    // S56 ------------------------------------------------------------------------------------------------------------

    @ParameterizedTest(name = "provider answers {0}")
    @CsvSource({"429, HTTP_429", "500, HTTP_500", "0, WEB_PUSH_FAILURE"})
    void s56AFailedDeliveryRetriesFromFiveSecondsDoublingUpToAnHourAndIsDeadAfterTwelveAttemptsKeepingTheSubscription(
            int status, String errorCode) {
        Shop shop = shop("Reintentos", "Ana");
        String endpoint = subscribe(shop.company().admin());
        runAbsenceJob(utc("12:11:00"));
        push.answerAlways(status == 0 ? Outcome.transportFailure() : Outcome.status(status));
        long[] delaySeconds = {5, 10, 20, 40, 80, 160, 320, 640, 1280, 2560, 3600};

        Instant due = utc("12:16:00");
        for (int attempt = 1; attempt <= 12; attempt++) {
            dispatch(due.minus(MICRO));
            assertEquals(attempt - 1, push.deliveries().size(), "attempt " + attempt + " is not due one microsecond early");
            dispatch(due);
            assertEquals(attempt, push.deliveries().size(), "attempt " + attempt);
            Map<String, Object> window = onlyWindow(shop.company().id());
            assertEquals(attempt, ((Number) window.get("attempt_count")).intValue());
            assertEquals(errorCode, window.get("last_error_code"));
            if (attempt < 12) {
                assertEquals("RETRY", window.get("status"), "attempt " + attempt);
                Instant next = due.plusSeconds(delaySeconds[attempt - 1]);
                assertEquals(next, nextAttemptAt(shop.company().id()), "next attempt after attempt " + attempt);
                due = next;
            } else {
                assertEquals("DEAD", window.get("status"));
            }
        }
        dispatch(due.plus(Duration.ofDays(1)));

        assertEquals(12, push.deliveries().size(), "a DEAD window is never claimed again");
        assertEquals(1, push.deliveries().stream().map(Delivery::topic).distinct().count());
        assertTrue(push.deliveries().stream().allMatch(delivery -> delivery.endpoint().equals(endpoint) && delivery.status() == status));
        assertEquals(1, count("SELECT COUNT(*) FROM push_subscriptions WHERE company_id = ? AND active", shop.company().id()));
        assertTrue(isSubscribed(shop.company().admin(), endpoint));
    }

    // CHAR: a window whose only subscription answered 404/410 is marked SENT although nobody received it — confirm with Mateo.
    @ParameterizedTest(name = "provider answers {0}")
    @ValueSource(ints = {404, 410})
    void s56AGoneSubscriptionIsDeletedAtOnceAndTheWindowIsClosed(int status) {
        Shop shop = shop("Vencida", "Ana");
        String endpoint = subscribe(shop.company().admin());
        runAbsenceJob(utc("12:11:00"));
        push.answerAlways(Outcome.status(status));

        dispatch(utc("12:16:00"));
        dispatch(utc("13:16:00"));

        assertEquals(1, push.deliveries().size());
        assertEquals(0, count("SELECT COUNT(*) FROM push_subscriptions WHERE company_id = ?", shop.company().id()));
        assertFalse(isSubscribed(shop.company().admin(), endpoint));
        Map<String, Object> window = onlyWindow(shop.company().id());
        assertEquals("SENT", window.get("status"));
        assertEquals(1, ((Number) window.get("attempt_count")).intValue());
    }

    @Test
    void s56AWindowThatFailsTwiceIsDeliveredOnTheThirdAttemptWithTheSamePayload() {
        Shop shop = shop("Recupera", "Ana");
        subscribe(shop.company().admin());
        runAbsenceJob(utc("12:11:00"));
        push.program(Outcome.status(500), Outcome.transportFailure());

        dispatch(utc("12:16:00"));
        dispatch(utc("12:16:05"));
        dispatch(utc("12:16:15"));

        assertEquals(List.of(500, 0, 201), push.deliveries().stream().map(Delivery::status).toList());
        assertEquals(1, push.deliveries().stream().map(Delivery::payload).distinct().count());
        assertEquals(List.of("2027-03-01T12:11:00Z 2027-03-01T12:16:00Z SENT 3"), windows(shop.company().id()));
        assertEquals(utc("12:16:15"), jdbc.queryForObject("SELECT delivered_at FROM notification_windows WHERE company_id = ?",
                Timestamp.class, shop.company().id().toString()).toInstant());
        assertNull(onlyWindow(shop.company().id()).get("last_error_code"));
    }

    // S57 ------------------------------------------------------------------------------------------------------------

    // CHAR: site names travel in the payload (the per-site count needs a label); "no names" is read as no people's names — confirm with Mateo.
    @Test
    void s57NoDeliveredPayloadCarriesAMotiveHealthDataCoordinatesOrAnyoneSNameOrIdentifier() {
        Fixture.Company company = fixture.company("Reservada");
        UUID centro = fixture.site(company, "Centro", ZONE);
        UUID norte = fixture.site(company, "Norte", ZONE);
        fixture.siteCenter(company, centro, -34.6037, -58.3816, 100);
        UUID centroTemplate = template(company, centro, "09:00");
        UUID norteTemplate = template(company, norte, "09:00");
        Fixture.Employee zoraida = fixture.employee(company, "Zoraida Quintanilla", List.of(centro, norte), 10);
        UUID late = fixture.declare(company, zoraida.id(), centro, DAY, centroTemplate);
        UUID absent = fixture.declare(company, zoraida.id(), norte, DAY, norteTemplate);
        String endpoint = subscribe(company.admin());

        UUID ingreso = mark(zoraida, late, "INGRESO", utc("12:11:00"));
        clock.set(utc("12:11:05"));
        zoraida.client().post("/api/v1/marks/" + ingreso + "/location",
                Map.of("latitude", -34.6037111, "longitude", -58.3816222, "accuracyMeters", 7.5)).expect(202);
        runAbsenceJob(utc("12:11:10"));
        clock.set(utc("12:12:00"));
        UUID lateDeviation = activeDeviation(late);
        UUID absentDeviation = activeDeviation(absent);
        motive(zoraida, lateDeviation, "SALUD", "migraine with aura since dawn");
        motive(zoraida, absentDeviation, "OTRA", "bus strike downtown");
        push.program(Outcome.status(500));

        dispatch(utc("12:16:00"));
        dispatch(utc("12:16:05"));

        List<Delivery> deliveries = push.deliveries();
        assertEquals(2, deliveries.size(), "the failed attempt and its retry");
        List<String> forbidden = List.of("Zoraida", "Quintanilla", zoraida.dni(), "Admin Reservada", company.adminDni(), "migraine",
                "bus strike", "SALUD", "OTRA", "34.6037", "58.3816", "7.5", zoraida.id().toString(), zoraida.accountId().toString(),
                company.adminAccountId().toString(), late.toString(), absent.toString(), ingreso.toString(),
                lateDeviation.toString(), absentDeviation.toString(), company.id().toString());
        for (Delivery delivery : deliveries) {
            JsonNode payload = json(delivery.payload());
            assertEquals(endpoint, delivery.endpoint());
            assertEquals(PAYLOAD_FIELDS, fieldNames(payload));
            assertEquals("Desvíos de fichaje", payload.get("title").asText());
            assertEquals("/admin/desvios", payload.get("navigation").asText());
            assertPayload(payload, 2, "Hay 2 desvíos nuevos para revisar.", Map.of("Centro", 1L, "Norte", 1L));
            for (JsonNode site : payload.get("siteCounts")) assertEquals(SITE_COUNT_FIELDS, fieldNames(site));
            for (String fragment : forbidden) {
                assertFalse(delivery.payload().contains(fragment), "payload carries " + fragment);
                assertFalse(delivery.topic().contains(fragment), "topic carries " + fragment);
            }
        }
    }

    // S58 ------------------------------------------------------------------------------------------------------------

    @Test
    void s58DeviationsRetractedOrCancelledWhileTheirWindowIsPendingAreNotCounted() {
        Fixture.Company company = fixture.company("Retiro");
        UUID centro = fixture.site(company, "Centro", ZONE);
        UUID norte = fixture.site(company, "Norte", ZONE);
        UUID centroTemplate = template(company, centro, "09:00");
        UUID norteTemplate = template(company, norte, "09:00");
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(centro, norte), 10);
        Fixture.Employee beto = fixture.employee(company, "Beto", List.of(centro), 10);
        UUID anaCentro = fixture.declare(company, ana.id(), centro, DAY, centroTemplate);
        UUID anaNorte = fixture.declare(company, ana.id(), norte, DAY, norteTemplate);
        UUID betoCentro = fixture.declare(company, beto.id(), centro, DAY, centroTemplate);
        String endpoint = subscribe(company.admin());

        UUID betoIngreso = mark(beto, betoCentro, "INGRESO", utc("12:10:30"));  // LLEGADA_TARDE opens the window at 12:10:30
        runAbsenceJob(utc("12:11:00"));                                          // SIN_INGRESO for Ana at Centro and at Norte
        clock.set(utc("12:12:00"));
        company.admin().post("/api/v1/admin/jornadas/" + anaNorte + "/cancellation", Map.of("reason", "Day off agreed")).expect(200);
        clock.set(utc("12:13:00"));
        company.admin().post("/api/v1/admin/marks/" + betoIngreso + "/correction", Map.of("correctedAction", "INGRESO",
                "correctedOccurredAt", utc("12:05:00").toString(), "auditReason", "Badge reader was late")).expect(200);

        assertEquals(List.of("SIN_INGRESO"), jdbc.queryForList("SELECT type FROM deviations WHERE company_id = ? AND active",
                String.class, company.id().toString()));
        assertEquals(1, count("SELECT COUNT(DISTINCT window_id) FROM notification_outbox_events WHERE company_id = ?", company.id()));
        assertEquals(3, count("SELECT COUNT(*) FROM notification_outbox_events WHERE company_id = ?", company.id()));
        dispatch(utc("12:15:30"));

        List<JsonNode> sent = payloadsTo(endpoint);
        assertEquals(1, sent.size());
        assertPayload(sent.get(0), 1, "Hay 1 desvío nuevo para revisar.", Map.of("Centro", 1L));
        assertEquals(anaCentro, jornadaOfOnlyActiveDeviation(company.id()));
    }

    @Test
    void s58AWindowWhoseOnlyDeviationWasCancelledIsClosedWithoutAnyPush() {
        Shop shop = shop("Cancelada", "Ana");
        subscribe(shop.company().admin());
        runAbsenceJob(utc("12:11:00"));
        clock.set(utc("12:12:00"));
        shop.company().admin().post("/api/v1/admin/jornadas/" + shop.jornada() + "/cancellation", Map.of("reason", "Store closed")).expect(200);

        dispatch(utc("12:16:00"));

        assertEquals(List.of(), push.deliveries());
        assertEquals(List.of("2027-03-01T12:11:00Z 2027-03-01T12:16:00Z SENT 1"), windows(shop.company().id()));
    }

    // D-20261027-04 --------------------------------------------------------------------------------------------------

    @Test
    void alertsArePerCompanyAndOpeningAnotherCompanyDoesNotSubscribeTheDevice() {
        Shop alfa = shop("Alfa", "Ana");
        Shop beta = shop("Beta", "Bruno");
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at,display_name) VALUES(?,?,?,'ADMIN',TRUE,?,?)",
                UUID.randomUUID().toString(), beta.company().id().toString(), alfa.company().adminAccountId().toString(),
                Timestamp.from(clock.instant()), "Admin Alfa en Beta");
        ApiClient device = alfa.company().admin();
        String endpoint = subscribe(device);

        device.put("/api/v1/companies/active", Map.of("companyId", beta.company().id())).expect(200);
        assertFalse(isSubscribed(device, endpoint), "opening Beta does not subscribe the device there");
        runAbsenceJob(utc("12:11:00"));
        dispatch(utc("12:16:00"));

        List<Delivery> deliveries = push.deliveries();
        assertEquals(1, deliveries.size(), "only Alfa's window reaches the device");
        assertPayload(json(deliveries.get(0).payload()), 1, "Hay 1 desvío nuevo para revisar.", Map.of("Local Alfa", 1L));
        assertEquals(List.of("2027-03-01T12:11:00Z 2027-03-01T12:16:00Z SENT 1"), windows(beta.company().id()));

        // Turning alerts on in Beta is a separate subscription of the same device; Alfa's stays as it was.
        subscribe(device, endpoint);
        assertTrue(isSubscribed(device, endpoint));
        device.put("/api/v1/companies/active", Map.of("companyId", alfa.company().id())).expect(200);
        assertTrue(isSubscribed(device, endpoint));
        assertEquals(2, count("SELECT COUNT(DISTINCT company_id) FROM push_subscriptions WHERE account_id = ?", alfa.company().adminAccountId()));
    }

    // helpers --------------------------------------------------------------------------------------------------------

    private Shop shop(String name, String employeeName) {
        Fixture.Company company = fixture.company(name);
        UUID site = fixture.site(company, "Local " + name, ZONE);
        Fixture.Employee employee = fixture.employee(company, employeeName, List.of(site), 10);
        UUID jornada = fixture.declare(company, employee.id(), site, DAY, template(company, site, "09:00"));
        return new Shop(company, site, employee, jornada);
    }

    private UUID template(Fixture.Company company, UUID site, String start) {
        return fixture.template(company, site, "Desde " + start, List.of(Fixture.Block.sameDay(start, "17:00")), 20, 30);
    }

    private static Instant utc(String time) {
        return Instant.parse(DAY + "T" + time + "Z");
    }

    private UUID mark(Fixture.Employee employee, UUID jornada, String action, Instant at) {
        clock.set(at);
        return employee.client().mark(jornada, action, UUID.randomUUID()).expect(201).id();
    }

    private void motive(Fixture.Employee employee, UUID deviation, String category, String text) {
        employee.client().put("/api/v1/deviations/" + deviation + "/motive", Map.of("category", category, "text", text)).expect(200);
    }

    private void runAbsenceJob(Instant at) {
        clock.set(at);
        markScheduler.createDueAbsences();
    }

    /** Runs the real dispatcher at {@code at}; afterwards nothing may still be due (I9). */
    private void dispatch(Instant at) {
        clock.set(at);
        dispatcher.dispatchDueWindows();
        assertEquals(List.of(), new InvariantChecker(jdbc).afterDispatch(at));
    }

    private String subscribe(ApiClient admin) {
        return subscribe(admin, "https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID());
    }

    private String subscribe(ApiClient admin, String endpoint) {
        admin.put("/api/v1/push/subscriptions", Map.of("endpoint", endpoint,
                "keys", Map.of("p256dh", TestKeys.subscriptionP256dh(), "auth", TestKeys.subscriptionAuth()))).expect(200);
        return endpoint;
    }

    private boolean isSubscribed(ApiClient admin, String endpoint) {
        return admin.post("/api/v1/push/subscriptions/current", Map.of("endpoint", endpoint)).expect(200).body().get("subscribed").asBoolean();
    }

    private List<JsonNode> payloadsTo(String endpoint) {
        return push.deliveries().stream().filter(delivery -> delivery.endpoint().equals(endpoint)).map(delivery -> json(delivery.payload())).toList();
    }

    private void assertPayload(JsonNode payload, long total, String body, Map<String, Long> countsBySite) {
        assertEquals(total, payload.get("totalCount").asLong());
        assertEquals(body, payload.get("body").asText());
        Map<String, Long> counts = new LinkedHashMap<>();
        for (JsonNode site : payload.get("siteCounts")) counts.put(site.get("siteName").asText(), site.get("count").asLong());
        assertEquals(countsBySite, counts);
        assertEquals(countsBySite.keySet().stream().sorted().toList(), List.copyOf(counts.keySet()), "sites are listed by name");
    }

    private static Map<String, String> siteIds(JsonNode payload) {
        Map<String, String> ids = new LinkedHashMap<>();
        for (JsonNode site : payload.get("siteCounts")) ids.put(site.get("siteName").asText(), site.get("siteId").asText());
        return ids;
    }

    private static Set<String> fieldNames(JsonNode node) {
        Set<String> names = new HashSet<>();
        node.fieldNames().forEachRemaining(names::add);
        return names;
    }

    private JsonNode json(String raw) {
        try {
            return json.readTree(raw);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    /** Each window of the company as "start end status attempts", by start. */
    private List<String> windows(UUID company) {
        return jdbc.query("SELECT window_started_at, window_ends_at, status, attempt_count FROM notification_windows WHERE company_id = ?"
                        + " ORDER BY window_started_at", (rs, row) -> rs.getTimestamp(1).toInstant() + " " + rs.getTimestamp(2).toInstant()
                        + " " + rs.getString(3) + " " + rs.getInt(4), company.toString());
    }

    private Map<String, Object> onlyWindow(UUID company) {
        return jdbc.queryForMap("SELECT status, attempt_count, last_error_code FROM notification_windows WHERE company_id = ?", company.toString());
    }

    private Instant nextAttemptAt(UUID company) {
        return jdbc.queryForObject("SELECT next_attempt_at FROM notification_windows WHERE company_id = ?", Timestamp.class,
                company.toString()).toInstant();
    }

    private UUID activeDeviation(UUID jornada) {
        return UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id = ? AND active", String.class, jornada.toString()));
    }

    private UUID jornadaOfOnlyActiveDeviation(UUID company) {
        return UUID.fromString(jdbc.queryForObject("SELECT jornada_id FROM deviations WHERE company_id = ? AND active", String.class,
                company.toString()));
    }

    private int count(String sql, Object... args) {
        Object[] values = new Object[args.length];
        for (int i = 0; i < args.length; i++) values[i] = args[i] instanceof UUID uuid ? uuid.toString() : args[i];
        return jdbc.queryForObject(sql, Integer.class, values);
    }
}
