package com.braja.fichaje.campaign;

import com.braja.fichaje.notifications.NotificationOutboxDispatcher;
import com.braja.fichaje.timekeeping.MarkScheduler;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S31-S38: deviation lifecycle through the real HTTP API and the real job beans, with the server clock under test control.
 * One jornada 09:00-17:00 in Buenos Aires (12:00Z-20:00Z), tolerance 10 min, breakfast limit 20 min, lunch limit 30 min.
 */
class DeviationLifecycleSpecTest extends CampaignTestBase {
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    private static final Instant START = Instant.parse("2027-03-01T12:00:00Z");
    private static final Instant END = Instant.parse("2027-03-01T20:00:00Z");
    private static final Duration TOLERANCE = Duration.ofMinutes(10);
    private static final Duration MICRO = Duration.of(1, ChronoUnit.MICROS);

    @Autowired private MarkScheduler markScheduler;
    @Autowired private NotificationOutboxDispatcher dispatcher;

    private Fixture.Company company;
    private Fixture.Employee employee;
    private UUID jornada;

    @BeforeEach
    void jornada() {
        company = fixture.company("Desvios");
        UUID site = fixture.site(company, "Centro", "America/Argentina/Buenos_Aires");
        employee = fixture.employee(company, "Ana", List.of(site), 10);
        UUID template = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        jornada = fixture.declare(company, employee.id(), site, DAY, template);
    }

    @AfterEach
    void noServerErrorAndInvariantsHold() {
        assertEquals(List.of(), httpLog.serverErrors());
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
    }

    // S31 ------------------------------------------------------------------------------------------------------------

    @Test
    void s31AbsenceAppearsOneMicrosecondAfterStartPlusToleranceAndNotAtTheEdge() {
        runAbsenceJob(START.plus(TOLERANCE));
        assertEquals(List.of(), activeTypes());

        runAbsenceJob(START.plus(TOLERANCE).plus(MICRO));
        assertEquals(List.of("SIN_INGRESO"), activeTypes());
        runAbsenceJob(START.plus(TOLERANCE).plusSeconds(15));
        assertEquals(1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id = ?", jornada));
        assertEquals(1, count("SELECT COUNT(*) FROM notification_outbox_events WHERE deviation_id = ?", onlyActiveDeviation()));
    }

    // S32 ------------------------------------------------------------------------------------------------------------

    @Test
    void s32LateIngresoTurnsTheAbsenceIntoLateArrivalKeepingTheMotiveResettingTheClassificationWithoutASecondPush() {
        runAbsenceJob(START.plus(TOLERANCE).plusSeconds(1));
        UUID deviation = onlyActiveDeviation();
        motive(deviation, "TRANSPORTE", "The bus never came").expect(200);
        classify(company.admin(), deviation, "JUSTIFICADO", null).expect(200);
        String sentWindow = dispatchWindowOf(deviation);

        clock.set(START.plus(Duration.ofMinutes(40)));
        employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);

        Map<String, Object> row = deviationRow(deviation);
        assertEquals("LLEGADA_TARDE", row.get("type"));
        assertEquals(Boolean.TRUE, row.get("active"));
        assertNull(row.get("classification"));
        assertEquals("TRANSPORTE", row.get("motive_category"));
        assertEquals("The bus never came", row.get("motive_text"));
        assertEquals("PENDIENTE_REVISION", employeeStatus(deviation));
        // No second push: one outbox event, still in the window that was already sent, and no new window.
        assertEquals(1, count("SELECT COUNT(*) FROM notification_outbox_events WHERE deviation_id = ?", deviation));
        assertEquals(sentWindow, windowOf(deviation));
        assertEquals(1, count("SELECT COUNT(*) FROM notification_windows WHERE company_id = ?", company.id()));
        assertEquals(List.of("CREATED", "MOTIVE_SUBMITTED", "CLASSIFICATION_CHANGED", "TYPE_REPLACED", "CLASSIFICATION_RESET"),
                auditTypes(deviation));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id = ? AND change_type = 'TYPE_REPLACED'"
                + " AND before_type = 'SIN_INGRESO' AND after_type = 'LLEGADA_TARDE'", deviation));
    }

    // S33 ------------------------------------------------------------------------------------------------------------

    /** Offsets from the scheduled end in microseconds; the tolerance is 600 000 000 µs and its edges are inside. */
    @ParameterizedTest(name = "egreso at end {0} µs -> {1}")
    @CsvSource({
            "-600000001, EGRESO_TEMPRANO",
            "-600000000, ''",
            "0, ''",
            "600000000, ''",
            "600000001, EGRESO_TARDIO"})
    void s33EgresoInsideTheInclusiveToleranceCreatesNothingAndOutsideCreatesAnEgressDeviation(long offsetMicros, String expected) {
        clock.set(START);
        employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);
        clock.set(END.plus(offsetMicros, ChronoUnit.MICROS));
        employee.client().mark(jornada, "EGRESO", UUID.randomUUID()).expect(201);

        assertEquals(expected.isEmpty() ? List.of() : List.of(expected), activeTypes());
    }

    // S34 ------------------------------------------------------------------------------------------------------------

    @Test
    void s34MissingEgressIsCreatedOnceAndALateEgresoReplacesItWithEgresoTardioKeepingTheMotive() {
        ingresoOnTimeAndMissingEgressFlagged();
        UUID deviation = onlyActiveDeviation();
        motive(deviation, "OTRA", "Forgot to clock out").expect(200);
        classify(company.admin(), deviation, "NO_JUSTIFICADO", null).expect(200);

        clock.set(END.plus(Duration.ofMinutes(40)));
        employee.client().mark(jornada, "EGRESO", UUID.randomUUID()).expect(201);

        assertEquals(List.of("EGRESO_TARDIO"), activeTypes());
        assertEquals(deviation, onlyActiveDeviation());
        Map<String, Object> row = deviationRow(deviation);
        assertNull(row.get("classification"));
        assertEquals("Forgot to clock out", row.get("motive_text"));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id = ? AND change_type = 'TYPE_REPLACED'"
                + " AND before_type = 'MARCA_FALTANTE' AND after_type = 'EGRESO_TARDIO'", deviation));
        assertEquals(0, count("SELECT COUNT(*) FROM notification_outbox_events WHERE company_id = ?", company.id()));
    }

    @Test
    void s34AForgottenEgresoWithinToleranceClosesTheMissingEgressAndLeavesNoDeviation() {
        ingresoOnTimeAndMissingEgressFlagged();
        UUID deviation = onlyActiveDeviation();

        clock.set(END.plus(Duration.ofMinutes(40)));
        company.admin().post("/api/v1/admin/jornadas/" + jornada + "/forgotten-marks", Map.of("action", "EGRESO",
                "occurredAt", END.plus(TOLERANCE).toString(), "auditReason", "Left on time, forgot to mark")).expect(201);

        assertEquals(List.of(), activeTypes());
        assertEquals(List.of("CREATED", "RETRACTED"), auditTypes(deviation));
    }

    /** INGRESO on time; the job at the exact edge creates nothing, 1 µs later one MARCA_FALTANTE that later ticks never duplicate. */
    private void ingresoOnTimeAndMissingEgressFlagged() {
        clock.set(START);
        employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);
        runAbsenceJob(END.plus(TOLERANCE));
        assertEquals(List.of(), activeTypes());
        runAbsenceJob(END.plus(TOLERANCE).plus(MICRO));
        runAbsenceJob(END.plus(TOLERANCE).plusSeconds(15));
        runAbsenceJob(END.plus(Duration.ofMinutes(30)));
        assertEquals(List.of("MARCA_FALTANTE"), activeTypes());
        assertEquals(1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id = ?", jornada));
        assertEquals(List.of("CREATED"), auditTypes(onlyActiveDeviation()));
    }

    // S35 ------------------------------------------------------------------------------------------------------------

    @ParameterizedTest(name = "{0} of {1} min + {2} µs -> {3}")
    @CsvSource({
            "DESAYUNO, 20, 0, ''",
            "DESAYUNO, 20, 1, EXCESO_DESAYUNO",
            "ALMUERZO, 30, 0, ''",
            "ALMUERZO, 30, 1, EXCESO_ALMUERZO"})
    void s35ABreakLongerThanItsLimitCreatesAnExcessAndExactlyAtTheLimitNothing(String pause, int limitMinutes, long overMicros,
                                                                               String expected) {
        clock.set(START);
        employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);
        Instant leftAt = START.plus(Duration.ofHours(2));
        clock.set(leftAt);
        employee.client().mark(jornada, "SALIDA_" + pause, UUID.randomUUID()).expect(201);
        clock.set(leftAt.plus(Duration.ofMinutes(limitMinutes)).plus(overMicros, ChronoUnit.MICROS));
        employee.client().mark(jornada, "VUELTA_" + pause, UUID.randomUUID()).expect(201);

        assertEquals(expected.isEmpty() ? List.of() : List.of(expected), activeTypes());
    }

    // S36 ------------------------------------------------------------------------------------------------------------

    @Test
    void s36TheEmployeeCorrectsTheMotiveUntilItIsClassifiedThenItIsLockedAndAuditsNeverKeepTheText() {
        UUID deviation = lateArrival();
        assertEquals("PENDIENTE_REVISION", motive(deviation, "OTRA", "first secret wording").expect(200).body().get("status").asText());
        motive(deviation, "TRANSPORTE", "second secret wording").expect(200);
        classify(company.admin(), deviation, "JUSTIFICADO", null).expect(200);

        ApiClient.Response locked = motive(deviation, "EMERGENCIA", "third secret wording");

        assertEquals(409, locked.status());
        assertEquals("MOTIVE_LOCKED", locked.code());
        Map<String, Object> row = deviationRow(deviation);
        assertEquals("TRANSPORTE", row.get("motive_category"));
        assertEquals("second secret wording", row.get("motive_text"));
        assertEquals("JUSTIFICADO", row.get("classification"));
        assertEquals(List.of("CREATED", "MOTIVE_SUBMITTED", "MOTIVE_CORRECTED", "CLASSIFICATION_CHANGED"), auditTypes(deviation));
        assertNoAuditContains("secret");
    }

    @Test
    void s36AFirstMotiveOnADeviationClassifiedWithoutMotiveSendsItBackToReview() {
        UUID deviation = lateArrival();
        classify(company.admin(), deviation, "NO_JUSTIFICADO", null).expect(200);

        ApiClient.Response first = motive(deviation, "EMERGENCIA", "family emergency").expect(200);

        assertEquals("PENDIENTE_REVISION", first.body().get("status").asText());
        assertNull(deviationRow(deviation).get("classification"));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id = ? AND change_type = 'CLASSIFICATION_RESET'"
                + " AND before_classification = 'NO_JUSTIFICADO' AND after_classification IS NULL", deviation));
        assertNoAuditContains("family emergency");
    }

    @Test
    void s36AHealthMotiveIsStoredOnlyEncryptedAndTheAdminStillReadsIt() {
        UUID deviation = lateArrival();
        String text = "doctor appointment, flu";

        motive(deviation, "SALUD", text).expect(200);

        Map<String, Object> row = deviationRow(deviation);
        assertEquals("SALUD", row.get("motive_category"));
        assertNull(row.get("motive_text"));
        byte[] ciphertext = jdbc.queryForObject("SELECT motive_ciphertext FROM deviations WHERE id = ?", byte[].class, deviation.toString());
        assertNotNull(ciphertext);
        assertFalse(new String(ciphertext, StandardCharsets.ISO_8859_1).contains("doctor"));
        assertNoAuditContains("doctor");
        ApiClient.Response adminList = company.admin().get("/api/v1/deviations").expect(200);
        assertEquals(text, adminList.body().get(0).get("motiveText").asText());
    }

    // S37 ------------------------------------------------------------------------------------------------------------

    @Test
    void s37ARetractedThenReactivatedDeviationStartsWithoutMotiveOrClassificationAndNotifiesAgain() {
        UUID deviation = lateArrival();
        UUID ingreso = UUID.fromString(jdbc.queryForObject("SELECT id FROM mark_events WHERE jornada_id = ?", String.class, jornada.toString()));
        motive(deviation, "TRANSPORTE", "Train delayed").expect(200);
        classify(company.admin(), deviation, "JUSTIFICADO", null).expect(200);
        String sentWindow = dispatchWindowOf(deviation);

        clock.set(START.plus(Duration.ofMinutes(50)));
        correctIngreso(ingreso, START).expect(200);
        assertEquals(List.of(), activeTypes());
        clock.set(START.plus(Duration.ofMinutes(55)));
        correctIngreso(ingreso, START.plus(Duration.ofMinutes(30))).expect(200);

        assertEquals(deviation, onlyActiveDeviation());
        Map<String, Object> row = deviationRow(deviation);
        assertEquals("LLEGADA_TARDE", row.get("type"));
        assertNull(row.get("motive_category"));
        assertNull(row.get("motive_text"));
        assertNull(row.get("classification"));
        assertEquals("MOTIVO_PENDIENTE", employeeStatus(deviation));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id = ? AND change_type = 'CLASSIFICATION_RESET'"
                + " AND before_classification = 'JUSTIFICADO' AND audit_reason = 'Deviation reactivated'", deviation));
        // Notifies again: the event left the sent window for a new pending one (the replacement in S32 stays put).
        String reactivatedWindow = windowOf(deviation);
        assertNotEquals(sentWindow, reactivatedWindow);
        assertEquals("PENDING", jdbc.queryForObject("SELECT status FROM notification_windows WHERE id = ?", String.class, reactivatedWindow));
        assertEquals(2, count("SELECT COUNT(*) FROM notification_windows WHERE company_id = ?", company.id()));
    }

    /** R2 (D-20261102-03): a reactivation more than 2 h after its fact is recorded again but does not notify again. */
    @Test
    void s37ADeviationReactivatedMoreThanTwoHoursAfterItsIngressComesBackWithoutANewPush() {
        UUID deviation = lateArrival();
        UUID ingreso = UUID.fromString(jdbc.queryForObject("SELECT id FROM mark_events WHERE jornada_id = ?", String.class, jornada.toString()));
        String sentWindow = dispatchWindowOf(deviation);

        clock.set(START.plus(Duration.ofHours(3)));
        correctIngreso(ingreso, START).expect(200);
        assertEquals(List.of(), activeTypes());
        clock.set(START.plus(Duration.ofHours(3)).plusSeconds(60));
        correctIngreso(ingreso, START.plus(Duration.ofMinutes(30))).expect(200);  // the fact is 2 h 31 min old

        assertEquals(deviation, onlyActiveDeviation());
        assertEquals("LLEGADA_TARDE", deviationRow(deviation).get("type"));
        assertEquals("MOTIVO_PENDIENTE", employeeStatus(deviation));
        assertEquals(sentWindow, windowOf(deviation), "the event stays in the window that was already sent");
        assertEquals(1, count("SELECT COUNT(*) FROM notification_windows WHERE company_id = ?", company.id()));
    }

    // R2 -------------------------------------------------------------------------------------------------------------

    /** R2 (D-20261102-03): an absence detected at most 2 h after it was due (09:10) queues a push; one microsecond later it does not. */
    @ParameterizedTest(name = "detected {0} µs after due + 2 h -> {1} push event(s)")
    @CsvSource({"-1, 1", "0, 1", "1, 0"})
    void r2AnAbsenceIsAlwaysRecordedButPushedOnlyWhenDetectedAtMostTwoHoursAfterItWasDue(long offsetMicros, int events) {
        runAbsenceJob(START.plus(TOLERANCE).plus(Duration.ofHours(2)).plus(offsetMicros, ChronoUnit.MICROS));

        assertEquals(List.of("SIN_INGRESO"), activeTypes());
        assertEquals(events, count("SELECT COUNT(*) FROM notification_outbox_events WHERE deviation_id = ?", onlyActiveDeviation()));
    }

    /**
     * R2: a late INGRESO the ADMIN loads afterwards (09:30, no absence job ran) notifies only while it is at most 2 h old; loaded
     * three days later it is a LLEGADA_TARDE without a push (and, with no EGRESO, also a MARCA_FALTANTE, which never notifies).
     */
    @ParameterizedTest(name = "loaded {0} µs after the ingress -> {1} push event(s)")
    @CsvSource({"7200000000, 1", "7200000001, 0", "259200000000, 0"})
    void r2ALateArrivalLoadedByTheAdminIsPushedOnlyWhileItsIngressIsAtMostTwoHoursOld(long loadedAfterMicros, int events) {
        Instant ingress = START.plus(Duration.ofMinutes(30));
        clock.set(ingress.plus(loadedAfterMicros, ChronoUnit.MICROS));
        company.admin().post("/api/v1/admin/jornadas/" + jornada + "/forgotten-marks",
                Map.of("action", "INGRESO", "occurredAt", ingress.toString(), "auditReason", "Employee forgot to mark")).expect(201);

        assertTrue(activeTypes().contains("LLEGADA_TARDE"), activeTypes().toString());
        assertEquals(events, count("SELECT COUNT(*) FROM notification_outbox_events"));
        assertEquals(events, count("SELECT COUNT(*) FROM notification_outbox_events e JOIN deviations d ON d.id = e.deviation_id"
                + " WHERE d.jornada_id = ? AND d.type = 'LLEGADA_TARDE'", jornada));
    }

    /**
     * R2 with rule 8: an absence first detected at 11:30, 2 h 20 min after 09:10, is recorded without a push; when a fresh INGRESO
     * at 11:35 turns it into LLEGADA_TARDE, the ADMIN is told once, about the late arrival (the absence never notified).
     */
    @Test
    void r2AnUnpushedAbsenceReplacedByAFreshLateArrivalNotifiesOnceForTheArrival() {
        runAbsenceJob(START.plus(Duration.ofMinutes(150)));
        UUID deviation = onlyActiveDeviation();
        assertEquals(0, count("SELECT COUNT(*) FROM notification_outbox_events"));

        clock.set(START.plus(Duration.ofMinutes(155)));
        employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);

        assertEquals(deviation, onlyActiveDeviation());
        assertEquals("LLEGADA_TARDE", deviationRow(deviation).get("type"));
        assertEquals(List.of("LLEGADA_TARDE"), jdbc.queryForList("SELECT deviation_type FROM notification_outbox_events WHERE deviation_id = ?",
                String.class, deviation.toString()));
    }

    // S38 ------------------------------------------------------------------------------------------------------------

    @Test
    void s38OnlyTheAdminClassifiesAndChangingAClassificationNeedsAReason() {
        UUID deviation = lateArrival();

        ApiClient.Response byEmployee = classify(employee.client(), deviation, "JUSTIFICADO", "I say so");
        assertEquals(403, byEmployee.status());
        assertEquals("FORBIDDEN", byEmployee.code());
        assertNull(deviationRow(deviation).get("classification"));

        classify(company.admin(), deviation, "JUSTIFICADO", null).expect(200);
        for (String missing : new String[] {null, "", "   "}) {
            ApiClient.Response change = classify(company.admin(), deviation, "NO_JUSTIFICADO", missing);
            assertEquals(422, change.status(), "reason " + missing);
            assertEquals("VALIDATION_ERROR", change.code());
        }
        assertEquals("JUSTIFICADO", deviationRow(deviation).get("classification"));

        classify(company.admin(), deviation, "NO_JUSTIFICADO", "Ticket was from another day").expect(200);
        assertEquals("NO_JUSTIFICADO", deviationRow(deviation).get("classification"));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id = ? AND change_type = 'CLASSIFICATION_CHANGED'"
                + " AND before_classification = 'JUSTIFICADO' AND after_classification = 'NO_JUSTIFICADO'"
                + " AND audit_reason = 'Ticket was from another day' AND actor_account_id = ?", deviation, company.adminAccountId()));
    }

    // helpers --------------------------------------------------------------------------------------------------------

    /** INGRESO 30 min late: one LLEGADA_TARDE straight from the mark (no absence job ran). */
    private UUID lateArrival() {
        clock.set(START.plus(Duration.ofMinutes(30)));
        employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);
        assertEquals(List.of("LLEGADA_TARDE"), activeTypes());
        return onlyActiveDeviation();
    }

    private void runAbsenceJob(Instant at) {
        clock.set(at);
        markScheduler.createDueAbsences();
    }

    /** Runs the dispatcher when the deviation's window ends and returns that window, now SENT (no ADMIN subscribed). */
    private String dispatchWindowOf(UUID deviation) {
        String window = windowOf(deviation);
        clock.set(jdbc.queryForObject("SELECT window_ends_at FROM notification_windows WHERE id = ?", Timestamp.class, window).toInstant());
        dispatcher.dispatchDueWindows();
        assertEquals("SENT", jdbc.queryForObject("SELECT status FROM notification_windows WHERE id = ?", String.class, window));
        return window;
    }

    private String windowOf(UUID deviation) {
        return jdbc.queryForObject("SELECT window_id FROM notification_outbox_events WHERE deviation_id = ?", String.class, deviation.toString());
    }

    private ApiClient.Response motive(UUID deviation, String category, String text) {
        return employee.client().put("/api/v1/deviations/" + deviation + "/motive", Map.of("category", category, "text", text));
    }

    private ApiClient.Response classify(ApiClient client, UUID deviation, String classification, String reason) {
        Map<String, Object> body = new HashMap<>();
        body.put("classification", classification);
        body.put("correctionReason", reason);
        return client.put("/api/v1/admin/deviations/" + deviation + "/classification", body);
    }

    private ApiClient.Response correctIngreso(UUID mark, Instant occurredAt) {
        return company.admin().post("/api/v1/admin/marks/" + mark + "/correction", Map.of("correctedAction", "INGRESO",
                "correctedOccurredAt", occurredAt.toString(), "auditReason", "Checked against the camera"));
    }

    private String employeeStatus(UUID deviation) {
        for (var item : employee.client().get("/api/v1/deviations").expect(200).body()) {
            if (item.get("id").asText().equals(deviation.toString())) return item.get("status").asText();
        }
        throw new AssertionError("deviation " + deviation + " is not visible to its employee");
    }

    private List<String> activeTypes() {
        return jdbc.queryForList("SELECT type FROM deviations WHERE jornada_id = ? AND active ORDER BY type", String.class, jornada.toString());
    }

    private UUID onlyActiveDeviation() {
        return UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id = ? AND active", String.class, jornada.toString()));
    }

    private Map<String, Object> deviationRow(UUID deviation) {
        return jdbc.queryForMap("SELECT type, active, classification, motive_category, motive_text FROM deviations WHERE id = ?",
                deviation.toString());
    }

    private List<String> auditTypes(UUID deviation) {
        return jdbc.queryForList("SELECT change_type FROM deviation_audits WHERE deviation_id = ? ORDER BY created_at, "
                + "FIELD(change_type, 'CREATED', 'MOTIVE_SUBMITTED', 'MOTIVE_CORRECTED', 'CLASSIFICATION_CHANGED', 'TYPE_REPLACED', "
                + "'RETRACTED', 'CLASSIFICATION_RESET')", String.class, deviation.toString());
    }

    private void assertNoAuditContains(String fragment) {
        assertEquals(0, count("SELECT COUNT(*) FROM deviation_audits WHERE CONCAT_WS('|', change_type, before_type, after_type,"
                + " before_classification, after_classification, audit_reason) LIKE ?", "%" + fragment + "%"));
        assertTrue(count("SELECT COUNT(*) FROM deviation_audits WHERE company_id = ?", company.id()) > 0);
    }

    private int count(String sql, Object... args) {
        Object[] values = new Object[args.length];
        for (int i = 0; i < args.length; i++) values[i] = args[i] instanceof UUID uuid ? uuid.toString() : args[i];
        return jdbc.queryForObject(sql, Integer.class, values);
    }
}
