package com.braja.fichaje.campaign;

import com.braja.fichaje.timekeeping.MarkScheduler;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S45-S49: ADMIN forgotten marks, corrections, voids and cancellations (CLAUDE.md rules 6 and 15, D-20261015-03, -05,
 * D-20261027-07, -08), all through real HTTP with the server clock under test control, including badly timed sequences.
 * The jornada is 09:00-17:00 in Buenos Aires on 2027-03-01, i.e. 12:00Z-20:00Z, with a 10 minute tolerance.
 */
class AdminCorrectionSpecTest extends CampaignTestBase {
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    private static final Instant START = utc("12:00");
    private static final Instant END = utc("20:00");
    private static final String MOTIVE_TEXT = "Private motive text 7Q3 the ADMIN history must never show";

    @Autowired private MarkScheduler scheduler;

    private Fixture.Company company;
    private UUID site;
    private UUID template;
    private Fixture.Employee employee;
    private UUID jornada;

    @BeforeEach
    void declaredJornada() {
        company = fixture.company("Correcciones");
        site = fixture.site(company, "Centro", "America/Argentina/Buenos_Aires");
        employee = fixture.employee(company, "Ana", List.of(site), 10);
        template = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        jornada = fixture.declare(company, employee.id(), site, DAY, template);
        assertEquals(Timestamp.from(START), jdbc.queryForObject("SELECT scheduled_start_at FROM jornadas WHERE id=?", Timestamp.class, jornada.toString()));
        assertEquals(Timestamp.from(END), jdbc.queryForObject("SELECT scheduled_end_at FROM jornadas WHERE id=?", Timestamp.class, jornada.toString()));
    }

    @AfterEach
    void noInvariantBrokenAndNoServerError() {
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
        assertEquals(List.of(), httpLog.serverErrors());
    }

    // S45: the reference points are the server time and the jornada's scheduled start and end (MarkService.validateAdminEventTime).

    static Stream<Arguments> s45Edges() {
        return Stream.of(
                Arguments.of("now", "2027-03-01T15:00:00Z", "2027-03-01T15:00:00Z", true),
                Arguments.of("now + 1 µs", "2027-03-01T15:00:00Z", "2027-03-01T15:00:00.000001Z", false),
                Arguments.of("scheduled start - 24 h", "2027-03-01T15:00:00Z", "2027-02-28T12:00:00Z", true),
                Arguments.of("scheduled start - 24 h - 1 µs", "2027-03-01T15:00:00Z", "2027-02-28T11:59:59.999999Z", false),
                Arguments.of("scheduled end + 24 h", "2027-03-03T00:00:00Z", "2027-03-02T20:00:00Z", true),
                Arguments.of("scheduled end + 24 h + 1 µs", "2027-03-03T00:00:00Z", "2027-03-02T20:00:00.000001Z", false));
    }

    @ParameterizedTest(name = "forgotten mark at {0}")
    @MethodSource("s45Edges")
    void s45ForgottenMarkTimeEdges(String edge, String now, String occurredAt, boolean accepted) {
        clock.set(Instant.parse(now));
        String before = snapshot();

        ApiClient.Response response = forgotten(jornada, "INGRESO", Instant.parse(occurredAt));

        if (accepted) {
            response.expect(201);
            assertEquals(Instant.parse(occurredAt), Instant.parse(response.body().get("occurredAt").asText()));
            assertEquals(Timestamp.from(Instant.parse(occurredAt)), jdbc.queryForObject(
                    "SELECT occurred_at FROM mark_events WHERE id=? AND origin='ADMIN'", Timestamp.class, response.id().toString()));
            assertEquals(1, count("SELECT COUNT(*) FROM forgotten_mark_audits WHERE mark_id=?", response.id()));
            assertEquals("EN_CURSO", state(jornada));
        } else {
            assertProblem(response, 422, "VALIDATION_ERROR");
            assertEquals(before, snapshot());
        }
    }

    @ParameterizedTest(name = "correction to {0}")
    @MethodSource("s45Edges")
    void s45CorrectionTimeEdges(String edge, String now, String occurredAt, boolean accepted) {
        UUID ingreso = employeeMark("12:00", "INGRESO");
        clock.set(Instant.parse(now));
        String before = snapshot();

        ApiClient.Response response = correct(ingreso, "INGRESO", Instant.parse(occurredAt));

        if (accepted) {
            response.expect(200);
            assertEquals(Instant.parse(occurredAt), Instant.parse(response.body().get("occurredAt").asText()));
            assertEquals(1, count("SELECT COUNT(*) FROM mark_correction_audits WHERE mark_id=? AND change_kind='CORRECTION'", ingreso));
        } else {
            assertProblem(response, 422, "VALIDATION_ERROR");
            assertEquals(before, snapshot());
        }
    }

    // S46: every ADMIN change recomputes state and deviations at once; a rejected change writes nothing.

    @Test
    void s46ForgottenMarkCorrectionAndVoidRecomputeStateAndDeviationsInTheSameRequest() {
        clock.set(utc("12:11"));
        scheduler.createDueAbsences();
        assertEquals(List.of("SIN_INGRESO"), activeDeviations(jornada));

        clock.set(utc("12:20"));
        UUID ingreso = forgotten(jornada, "INGRESO", utc("12:05")).expect(201).id();
        assertEquals("EN_CURSO", state(jornada));
        assertEquals(List.of(), activeDeviations(jornada));

        clock.set(utc("12:21"));
        correct(ingreso, "INGRESO", utc("12:19")).expect(200);
        assertEquals(List.of("LLEGADA_TARDE"), activeDeviations(jornada));

        clock.set(utc("12:22"));
        voidMark(ingreso).expect(200);
        assertEquals("NO_INGRESO", state(jornada));
        assertEquals(List.of("SIN_INGRESO"), activeDeviations(jornada));
        assertEquals(1, count("SELECT COUNT(*) FROM forgotten_mark_audits WHERE jornada_id=?", jornada));
        assertEquals(List.of("CORRECTION", "VOID"), jdbc.queryForList(
                "SELECT change_kind FROM mark_correction_audits WHERE mark_id=? ORDER BY corrected_at", String.class, ingreso.toString()));
    }

    /** A valid day with a late arrival and an early exit, so a rejected change has deviations and audits it could disturb. */
    private List<UUID> lateArrivalAndEarlyExitDay() {
        List<UUID> marks = List.of(employeeMark("12:15", "INGRESO"), employeeMark("14:00", "SALIDA_DESAYUNO"),
                employeeMark("14:10", "VUELTA_DESAYUNO"), employeeMark("19:00", "EGRESO"));
        assertEquals(List.of("EGRESO_TEMPRANO", "LLEGADA_TARDE"), activeDeviations(jornada));
        return marks;
    }

    /** Marks by index: 0 INGRESO 12:15, 1 SALIDA_DESAYUNO 14:00, 2 VUELTA_DESAYUNO 14:10, 3 EGRESO 19:00. */
    static Stream<Arguments> s46RejectedChanges() {
        return Stream.of(
                Arguments.of("forgotten second INGRESO", "FORGOTTEN", -1, "INGRESO", "2027-03-01T15:00:00Z", 409, "INVALID_MARK_TRANSITION"),
                Arguments.of("forgotten second breakfast", "FORGOTTEN", -1, "SALIDA_DESAYUNO", "2027-03-01T15:00:00Z", 409, "INVALID_MARK_TRANSITION"),
                Arguments.of("forgotten EGRESO before the breakfast", "FORGOTTEN", -1, "EGRESO", "2027-03-01T13:00:00Z", 409, "INVALID_MARK_TRANSITION"),
                Arguments.of("forgotten mark in the future", "FORGOTTEN", -1, "SALIDA_ALMUERZO", "2027-03-01T21:02:00Z", 422, "VALIDATION_ERROR"),
                Arguments.of("EGRESO corrected into a second INGRESO", "CORRECTION", 3, "INGRESO", "2027-03-01T19:00:00Z", 409, "INVALID_MARK_TRANSITION"),
                Arguments.of("breakfast return moved before its start", "CORRECTION", 2, "VUELTA_DESAYUNO", "2027-03-01T13:59:00Z", 409, "INVALID_MARK_ORDER"),
                Arguments.of("breakfast start turned into lunch", "CORRECTION", 1, "SALIDA_ALMUERZO", "2027-03-01T14:00:00Z", 409, "INVALID_MARK_TRANSITION"),
                Arguments.of("void the INGRESO that has later marks", "VOID", 0, null, null, 409, "INVALID_MARK_HISTORY"),
                Arguments.of("void the breakfast start", "VOID", 1, null, null, 409, "INVALID_MARK_HISTORY"),
                Arguments.of("void the breakfast return", "VOID", 2, null, null, 409, "INVALID_MARK_HISTORY"));
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("s46RejectedChanges")
    void s46AndS47ARejectedChangeWritesNoMarkAuditOrDeviation(String label, String kind, int markIndex, String action, String occurredAt,
                                                              int status, String code) {
        List<UUID> marks = lateArrivalAndEarlyExitDay();
        clock.set(utc("21:00"));
        String before = snapshot();
        clock.set(utc("21:01")); // any write would carry this new time

        ApiClient.Response response = switch (kind) {
            case "FORGOTTEN" -> forgotten(jornada, action, Instant.parse(occurredAt));
            case "CORRECTION" -> correct(marks.get(markIndex), action, Instant.parse(occurredAt));
            default -> voidMark(marks.get(markIndex));
        };

        assertProblem(response, status, code);
        assertEquals(before, snapshot());
        assertEquals("EGRESADA", state(jornada));
    }

    // S47: a voided mark stops counting, and it cannot be voided or corrected again.

    @Test
    void s47AVoidedEgresoStopsCountingAndCannotBeVoidedOrCorrectedAgain() {
        employeeMark("12:00", "INGRESO");
        UUID egreso = employeeMark("18:00", "EGRESO");
        assertEquals(List.of("EGRESO_TEMPRANO"), activeDeviations(jornada));

        clock.set(utc("18:30"));
        voidMark(egreso).expect(200);
        assertEquals("EN_CURSO", state(jornada));
        assertEquals(List.of(), activeDeviations(jornada));

        clock.set(utc("18:31"));
        String before = snapshot();
        assertProblem(voidMark(egreso), 409, "MARK_VOIDED");
        assertProblem(correct(egreso, "EGRESO", utc("18:10")), 409, "MARK_VOIDED");
        assertEquals(before, snapshot());

        employeeMark("20:00", "EGRESO");
        assertEquals("EGRESADA", state(jornada));
        assertEquals(List.of(), activeDeviations(jornada));
    }

    @Test
    void voidingTheOnlyIngresoAfterTheAbsenceJobRanBringsTheAbsenceBackOnce() {
        clock.set(utc("12:11"));
        scheduler.createDueAbsences();
        UUID ingreso = employeeMark("12:30", "INGRESO");
        assertEquals(List.of("LLEGADA_TARDE"), activeDeviations(jornada));

        clock.set(utc("12:35"));
        voidMark(ingreso).expect(200);
        assertEquals("NO_INGRESO", state(jornada));
        assertEquals(List.of("SIN_INGRESO"), activeDeviations(jornada));
        clock.set(utc("12:36"));
        scheduler.createDueAbsences();
        assertEquals(List.of("SIN_INGRESO"), activeDeviations(jornada));
        // One persistent arrival deviation the whole time: created, replaced by the late arrival, replaced back.
        assertEquals(1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=?", jornada));

        employeeMark("12:40", "INGRESO");
        assertEquals("EN_CURSO", state(jornada));
        assertEquals(List.of("LLEGADA_TARDE"), activeDeviations(jornada));
    }

    // S48: cancellation.

    static Stream<Arguments> s48JornadasWithValidMarks() {
        return Stream.of(Arguments.of(List.of("INGRESO"), "EN_CURSO"),
                Arguments.of(List.of("INGRESO", "SALIDA_DESAYUNO"), "PAUSA_ABIERTA"),
                Arguments.of(List.of("INGRESO", "SALIDA_DESAYUNO", "VUELTA_DESAYUNO", "EGRESO"), "EGRESADA"));
    }

    @ParameterizedTest(name = "{1}")
    @MethodSource("s48JornadasWithValidMarks")
    void s48AJornadaWithValidMarksCannotBeCancelled(List<String> actions, String expectedState) {
        List<String> times = List.of("12:00", "13:00", "13:10", "20:00");
        for (int i = 0; i < actions.size(); i++) employeeMark(times.get(i), actions.get(i));
        clock.set(utc("21:00"));
        String before = snapshot();

        assertProblem(cancel(jornada), 409, "JORNADA_HAS_MARKS");

        assertEquals(before, snapshot());
        assertEquals(expectedState, state(jornada));
    }

    @Test
    void s48CancellingRightAfterTheAbsenceJobRetractsItAndTheSameDayCanBeDeclaredAgain() {
        clock.set(utc("12:11"));
        scheduler.createDueAbsences();
        assertEquals(List.of("SIN_INGRESO"), activeDeviations(jornada));

        clock.set(utc("12:12"));
        ApiClient.Response cancelled = cancel(jornada).expect(200);
        assertEquals("CANCELADA", cancelled.body().get("state").asText());
        assertEquals("CANCELADA", state(jornada));
        assertEquals(List.of(), activeDeviations(jornada));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits a JOIN deviations d ON d.id=a.deviation_id WHERE d.jornada_id=? AND a.change_type='RETRACTED'", jornada));

        clock.set(utc("12:30"));
        scheduler.createDueAbsences();
        assertEquals(List.of(), activeDeviations(jornada));
        assertProblem(employee.client().mark(jornada, "INGRESO", UUID.randomUUID()), 409, "JORNADA_CANCELLED");
        assertProblem(forgotten(jornada, "INGRESO", utc("12:05")), 409, "JORNADA_CANCELLED");
        assertProblem(cancel(jornada), 409, "JORNADA_CANCELLED");

        UUID again = fixture.declare(company, employee.id(), site, DAY, template);
        assertNotEquals(jornada, again);
        clock.set(utc("12:31"));
        scheduler.createDueAbsences();
        assertEquals(List.of("SIN_INGRESO"), activeDeviations(again));
        assertEquals(List.of(), activeDeviations(jornada));
        clock.set(utc("12:32"));
        employee.client().mark(again, "INGRESO", UUID.randomUUID()).expect(201);
        assertEquals(List.of("LLEGADA_TARDE"), activeDeviations(again));
    }

    // S49: the jornada history.

    @Test
    void s49HistoryListsEveryChangeInOrderWithoutMotiveTextOrCoordinates() {
        UUID ingreso = employeeMark("12:30", "INGRESO");
        employee.client().post("/api/v1/marks/" + ingreso + "/location",
                Map.of("latitude", -34.6037123, "longitude", -58.3816456, "accuracyMeters", 12.5)).expect(202);
        clock.set(utc("12:31"));
        String late = jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND active", String.class, jornada.toString());
        employee.client().put("/api/v1/deviations/" + late + "/motive", Map.of("category", "OTRA", "text", MOTIVE_TEXT)).expect(200);
        clock.set(utc("13:00"));
        correct(ingreso, "INGRESO", utc("12:05")).expect(200);
        clock.set(utc("21:00"));
        UUID egreso = forgotten(jornada, "EGRESO", END).expect(201).id();
        clock.set(utc("21:05"));
        voidMark(egreso).expect(200);

        ApiClient.Response history = company.admin().get("/api/v1/admin/jornadas/" + jornada + "/audit").expect(200);

        List<String> kinds = new ArrayList<>();
        List<Instant> times = new ArrayList<>();
        for (JsonNode entry : history.body().get("entries")) {
            kinds.add(entry.get("kind").asText() + (entry.has("changeType") ? "/" + entry.get("changeType").asText() : ""));
            times.add(Instant.parse(entry.get("changedAt").asText()));
        }
        assertEquals(List.of("DEVIATION/CREATED", "DEVIATION/MOTIVE_SUBMITTED", "MARK_CORRECTION", "DEVIATION/RETRACTED",
                "FORGOTTEN_MARK", "MARK_VOID", "DEVIATION/CREATED"), kinds);
        assertEquals(List.of(utc("12:30"), utc("12:31"), utc("13:00"), utc("13:00"), utc("21:00"), utc("21:05"), utc("21:05")), times);
        assertEquals("OTRA", history.body().get("entries").get(1).get("afterMotiveCategory").asText());
        assertEquals("MARCA_FALTANTE", history.body().get("entries").get(6).get("deviationType").asText());
        assertFalse(history.body().get("truncated").asBoolean());
        assertFalse(history.raw().contains("Private motive"), history.raw());
        for (String coordinate : List.of("latitude", "longitude", "34.6037", "58.3816", "accuracy")) {
            assertFalse(history.raw().contains(coordinate), coordinate + " leaked: " + history.raw());
        }
    }

    // CHAR: past 500 entries the history keeps the OLDEST 500 and drops the newest changes (truncated=true) — confirm with Mateo.
    @Test
    void s49HistoryStopsAtFiveHundredEntriesAndFlagsTheTruncation() {
        UUID ingreso = employeeMark("12:00", "INGRESO");
        Instant first = utc("13:00");
        // Cheapest real change: alternate the INGRESO between 12:01 and 12:02 (within tolerance, so no deviation audit is added).
        for (int i = 0; i < 500; i++) correctAt(ingreso, first.plusSeconds(i), i);
        ApiClient.Response full = company.admin().get("/api/v1/admin/jornadas/" + jornada + "/audit").expect(200);
        assertEquals(500, full.body().get("entries").size());
        assertFalse(full.body().get("truncated").asBoolean());

        correctAt(ingreso, first.plusSeconds(500), 500);
        ApiClient.Response capped = company.admin().get("/api/v1/admin/jornadas/" + jornada + "/audit").expect(200);

        JsonNode entries = capped.body().get("entries");
        assertEquals(500, entries.size());
        assertTrue(capped.body().get("truncated").asBoolean());
        for (int i = 0; i < entries.size(); i++) {
            assertEquals("MARK_CORRECTION", entries.get(i).get("kind").asText());
            assertEquals(first.plusSeconds(i), Instant.parse(entries.get(i).get("changedAt").asText()));
        }
        assertEquals(501, count("SELECT COUNT(*) FROM mark_correction_audits WHERE mark_id=?", ingreso));
    }

    // Badly timed ADMIN changes around an employee who keeps marking.

    @Test
    void correctingTheIngresoWhileTheEmployeeIsOnLunchKeepsTheDayMarkable() {
        UUID ingreso = employeeMark("12:00", "INGRESO");
        employeeMark("15:00", "SALIDA_ALMUERZO");

        clock.set(utc("15:05"));
        correct(ingreso, "INGRESO", utc("12:20")).expect(200);
        assertEquals("PAUSA_ABIERTA", state(jornada));
        assertEquals(List.of("LLEGADA_TARDE"), activeDeviations(jornada));

        clock.set(utc("15:06"));
        String before = snapshot();
        assertProblem(correct(ingreso, "INGRESO", utc("15:01")), 409, "INVALID_MARK_ORDER");
        assertEquals(before, snapshot());

        employeeMark("15:20", "VUELTA_ALMUERZO");
        employeeMark("20:00", "EGRESO");
        assertEquals("EGRESADA", state(jornada));
        assertEquals(List.of("LLEGADA_TARDE"), activeDeviations(jornada));
    }

    // CHAR: once the ADMIN closed the day, the employee's own later mark is a coded 409 and the ADMIN has to fix it — confirm with Mateo.
    @Test
    void anEmployeeMarkAfterTheAdminTurnedTheOpenLunchIntoAnEgresoIsACodedConflict() {
        employeeMark("12:00", "INGRESO");
        UUID lunch = employeeMark("15:00", "SALIDA_ALMUERZO");

        clock.set(utc("15:10"));
        correct(lunch, "EGRESO", utc("15:00")).expect(200);
        assertEquals("EGRESADA", state(jornada));
        assertEquals(List.of("EGRESO_TEMPRANO"), activeDeviations(jornada));

        clock.set(utc("15:30"));
        String before = snapshot();
        assertProblem(employee.client().mark(jornada, "VUELTA_ALMUERZO", UUID.randomUUID()), 409, "INVALID_MARK_TRANSITION");
        assertEquals(before, snapshot());
    }

    // CHAR: a forgotten EGRESO entered before the employee's real EGRESO wins; the real one is a coded 409 — confirm with Mateo.
    @Test
    void aForgottenEgresoEnteredBeforeTheEmployeeEgresoArrivesWinsUntilTheAdminCorrectsIt() {
        employeeMark("12:00", "INGRESO");
        clock.set(utc("19:30"));
        assertProblem(forgotten(jornada, "EGRESO", utc("19:31")), 422, "VALIDATION_ERROR");
        UUID adminEgreso = forgotten(jornada, "EGRESO", utc("19:25")).expect(201).id();
        assertEquals("EGRESADA", state(jornada));
        assertEquals(List.of("EGRESO_TEMPRANO"), activeDeviations(jornada));

        clock.set(utc("20:00"));
        String before = snapshot();
        assertProblem(employee.client().mark(jornada, "EGRESO", UUID.randomUUID()), 409, "INVALID_MARK_TRANSITION");
        assertEquals(before, snapshot());

        clock.set(utc("20:05"));
        correct(adminEgreso, "EGRESO", utc("20:00")).expect(200);
        assertEquals(List.of(), activeDeviations(jornada));
        assertEquals("EGRESADA", state(jornada));
    }

    // Helpers.

    private static Instant utc(String hhmm) {
        return Instant.parse("2027-03-01T" + hhmm + ":00Z");
    }

    private UUID employeeMark(String hhmm, String action) {
        clock.set(utc(hhmm));
        return employee.client().mark(jornada, action, UUID.randomUUID()).expect(201).id();
    }

    private void correctAt(UUID mark, Instant now, int i) {
        clock.set(now);
        correct(mark, "INGRESO", i % 2 == 0 ? utc("12:01") : utc("12:02")).expect(200);
    }

    private ApiClient.Response forgotten(UUID jornadaId, String action, Instant occurredAt) {
        return company.admin().post("/api/v1/admin/jornadas/" + jornadaId + "/forgotten-marks",
                Map.of("action", action, "occurredAt", occurredAt.toString(), "auditReason", "Employee forgot to mark"));
    }

    private ApiClient.Response correct(UUID markId, String action, Instant occurredAt) {
        return company.admin().post("/api/v1/admin/marks/" + markId + "/correction",
                Map.of("correctedAction", action, "correctedOccurredAt", occurredAt.toString(), "auditReason", "Badge reader failed"));
    }

    private ApiClient.Response voidMark(UUID markId) {
        return company.admin().post("/api/v1/admin/marks/" + markId + "/void", Map.of("reason", "Marked on the wrong jornada"));
    }

    private ApiClient.Response cancel(UUID jornadaId) {
        return company.admin().post("/api/v1/admin/jornadas/" + jornadaId + "/cancellation", Map.of("reason", "Store closed"));
    }

    private String state(UUID jornadaId) {
        return jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString());
    }

    private List<String> activeDeviations(UUID jornadaId) {
        return jdbc.queryForList("SELECT type FROM deviations WHERE jornada_id=? AND active ORDER BY type", String.class, jornadaId.toString());
    }

    private int count(String sql, UUID id) {
        return jdbc.queryForObject(sql, Integer.class, id.toString());
    }

    /** Every row an ADMIN change could write: marks, jornada state, deviations, every audit table and the push outbox. */
    private String snapshot() {
        return String.join("\n",
                jdbc.queryForList("SELECT id,state,next_sequence,cancelled_at FROM jornadas ORDER BY id").toString(),
                jdbc.queryForList("SELECT id,action,occurred_at,timeline_order,recorded_at,voided_at,location_status FROM mark_events ORDER BY id").toString(),
                jdbc.queryForList("SELECT id,type,active,classification,source_mark_id,updated_at FROM deviations ORDER BY id").toString(),
                jdbc.queryForList("SELECT (SELECT COUNT(*) FROM forgotten_mark_audits) f,(SELECT COUNT(*) FROM mark_correction_audits) c,"
                        + "(SELECT COUNT(*) FROM deviation_audits) d,(SELECT COUNT(*) FROM notification_outbox_events) o").toString());
    }

    private static void assertProblem(ApiClient.Response response, int status, String code) {
        assertEquals(status, response.status(), response.raw());
        assertEquals(code, response.code(), response.raw());
    }
}
