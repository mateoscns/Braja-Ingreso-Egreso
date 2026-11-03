package com.braja.fichaje.campaign;

import com.braja.fichaje.timekeeping.InvalidStateTransitionException;
import com.braja.fichaje.timekeeping.MarkAction;
import com.braja.fichaje.timekeeping.MarkScheduler;
import com.braja.fichaje.timekeeping.MarkTransitionPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S24-S30: the mark state machine over real HTTP. The server sets the time, the early-ingress window and the 30 s
 * location window are pinned to the microsecond (DATETIME(6)), idempotency is per account, and a cancelled jornada is closed.
 */
class MarkStateMachineSpecTest extends CampaignTestBase {
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    /** 09:00 in Buenos Aires: the scheduled start of the template on DAY. */
    private static final Instant START = Instant.parse("2027-03-01T12:00:00Z");
    private static final Duration MICRO = Duration.ofNanos(1_000);
    private static final List<String> ACTIONS = List.of(
            "INGRESO", "SALIDA_DESAYUNO", "VUELTA_DESAYUNO", "SALIDA_ALMUERZO", "VUELTA_ALMUERZO", "EGRESO");
    private static final Map<String, String> SHORT = Map.of("I", "INGRESO", "SD", "SALIDA_DESAYUNO", "VD", "VUELTA_DESAYUNO",
            "SA", "SALIDA_ALMUERZO", "VA", "VUELTA_ALMUERZO", "E", "EGRESO");

    /**
     * Every prefix of a valid sequence, the jornada state after it and the actions that may follow, written from
     * docs/ESPECIFICACION.md ("Marcas"): start with INGRESO; at most one cycle of each pause, in any order; a open pause
     * must be closed next; no EGRESO with an open pause; nothing after EGRESO.
     */
    private static final String[][] TABLE = {
            {"", "NO_INGRESO", "I"},
            {"I", "EN_CURSO", "SD SA E"},
            {"I SD", "PAUSA_ABIERTA", "VD"},
            {"I SD VD", "EN_CURSO", "SA E"},
            {"I SD VD SA", "PAUSA_ABIERTA", "VA"},
            {"I SD VD SA VA", "EN_CURSO", "E"},
            {"I SA", "PAUSA_ABIERTA", "VA"},
            {"I SA VA", "EN_CURSO", "SD E"},
            {"I SA VA SD", "PAUSA_ABIERTA", "VD"},
            {"I SA VA SD VD", "EN_CURSO", "E"},
            {"I E", "EGRESADA", ""},
            {"I SD VD E", "EGRESADA", ""},
            {"I SA VA E", "EGRESADA", ""},
            {"I SD VD SA VA E", "EGRESADA", ""},
            {"I SA VA SD VD E", "EGRESADA", ""},
    };

    @Autowired private MarkScheduler scheduler;

    private Fixture.Company company;
    private UUID site;
    private Fixture.Employee employee;
    private UUID template;

    @BeforeEach
    void company() {
        company = fixture.company("Marcas");
        site = fixture.site(company, "Centro", "America/Argentina/Buenos_Aires");
        employee = fixture.employee(company, "Ana", List.of(site), 10);
        template = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
    }

    @AfterEach
    void noServerErrorAndInvariantsHold() {
        assertEquals(List.of(), httpLog.serverErrors());
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
    }

    static Stream<Arguments> prefixTable() {
        return Arrays.stream(TABLE).map(row -> Arguments.of(row[0], row[1], row[2]));
    }

    /** Guards the table itself: it lists exactly the prefixes the policy can reach, with the same next actions. */
    @Test
    void s24TheTableListsEveryReachablePrefixOfThePolicy() {
        MarkTransitionPolicy policy = new MarkTransitionPolicy();
        Map<String, Set<String>> reachable = new LinkedHashMap<>();
        Deque<List<MarkAction>> pending = new ArrayDeque<>(List.of(List.of()));
        while (!pending.isEmpty()) {
            List<MarkAction> prefix = pending.pop();
            Set<String> next = new LinkedHashSet<>();
            for (MarkAction action : MarkAction.values()) {
                try {
                    policy.validate(prefix, action);
                } catch (InvalidStateTransitionException rejected) {
                    continue;
                }
                next.add(action.name());
                List<MarkAction> longer = new ArrayList<>(prefix);
                longer.add(action);
                pending.push(longer);
            }
            reachable.put(prefix.stream().map(MarkAction::name).collect(Collectors.joining(" ")), next);
        }
        Map<String, Set<String>> table = new LinkedHashMap<>();
        for (String[] row : TABLE) table.put(String.join(" ", expand(row[0])), Set.copyOf(expand(row[2])));
        assertEquals(table, Map.copyOf(reachable));
    }

    @ParameterizedTest(name = "after [{0}]")
    @MethodSource("prefixTable")
    void s24EachActionIsAcceptedOverHttpIfAndOnlyIfTheSpecAllowsIt(String prefix, String stateAfterPrefix, String allowedNext) {
        Set<String> allowed = Set.copyOf(expand(allowedNext));
        // One jornada per action, on consecutive days, all already started when the marks arrive.
        List<UUID> jornadas = new ArrayList<>();
        for (int i = 0; i < ACTIONS.size(); i++) jornadas.add(declare(DAY.plusDays(i)));
        clock.set(START.plus(Duration.ofDays(ACTIONS.size())));

        List<String> mismatches = new ArrayList<>();
        for (int i = 0; i < ACTIONS.size(); i++) {
            UUID jornada = jornadas.get(i);
            String action = ACTIONS.get(i);
            for (String done : expand(prefix)) mark(jornada, done).expect(201);
            if (!stateAfterPrefix.equals(state(jornada))) mismatches.add("[" + prefix + "] state " + state(jornada));
            ApiClient.Response response = mark(jornada, action);
            if (allowed.contains(action)) {
                String expectedState = stateOf((prefix + " " + shortName(action)).trim());
                if (response.status() != 201 || !expectedState.equals(state(jornada))) {
                    mismatches.add("[" + prefix + "] + " + action + ": " + response.status() + " " + response.code() + ", state " + state(jornada));
                }
            } else if (response.status() != 409 || !"INVALID_MARK_TRANSITION".equals(response.code())
                    || markCount(jornada) != expand(prefix).size() || !stateAfterPrefix.equals(state(jornada))) {
                mismatches.add("[" + prefix + "] + " + action + " should be rejected: " + response.status() + " " + response.code());
            }
        }
        assertEquals(List.of(), mismatches);
    }

    @Test
    void s25IngresoOpensThirtyMinutesBeforeTheScheduledStartInclusive() {
        UUID jornada = declare(DAY);
        Instant opens = START.minus(Duration.ofMinutes(30));

        clock.set(opens.minus(MICRO));
        assertRejected(employee.client().mark(jornada, "INGRESO", UUID.randomUUID()), 409, "MARK_TOO_EARLY");
        assertEquals(0, markCount(jornada));

        clock.set(opens);
        ApiClient.Response accepted = employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);
        assertEquals(opens, Instant.parse(accepted.body().get("acceptedAt").asText()));
        assertEquals("EN_CURSO", state(jornada));
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"SALIDA_DESAYUNO", "VUELTA_DESAYUNO", "SALIDA_ALMUERZO", "VUELTA_ALMUERZO", "EGRESO"})
    void s25EveryOtherActionOpensAtTheScheduledStartInclusive(String action) {
        UUID jornada = declare(DAY);
        clock.set(START.minus(Duration.ofMinutes(30)));
        employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);
        clock.set(START);
        if (action.equals("VUELTA_DESAYUNO")) employee.client().mark(jornada, "SALIDA_DESAYUNO", UUID.randomUUID()).expect(201);
        if (action.equals("VUELTA_ALMUERZO")) employee.client().mark(jornada, "SALIDA_ALMUERZO", UUID.randomUUID()).expect(201);
        int before = markCount(jornada);

        // The time window is checked before the transition and the order (MarkService.validateMarkTime).
        clock.set(START.minus(MICRO));
        assertRejected(employee.client().mark(jornada, action, UUID.randomUUID()), 409, "MARK_TOO_EARLY");
        assertEquals(before, markCount(jornada));

        clock.set(START);
        ApiClient.Response accepted = employee.client().mark(jornada, action, UUID.randomUUID()).expect(201);
        assertEquals(START, Instant.parse(accepted.body().get("acceptedAt").asText()));
    }

    @Test
    void s26ClientSentTimeEmployeeAndRoleFieldsAreIgnored() {
        UUID jornada = declare(DAY);
        clock.set(START.plus(Duration.ofMinutes(3)));
        Map<String, Object> forged = new LinkedHashMap<>();
        forged.put("action", "INGRESO");
        forged.put("occurredAt", "2027-03-01T11:00:00Z");
        forged.put("acceptedAt", "2027-03-01T11:00:00Z");
        forged.put("recordedAt", "2027-03-01T11:00:00Z");
        forged.put("employeeId", UUID.randomUUID().toString());
        forged.put("accountId", company.adminAccountId().toString());
        forged.put("companyId", UUID.randomUUID().toString());
        forged.put("role", "ADMIN");
        forged.put("origin", "ADMIN");
        forged.put("sequence", 99);

        // Unknown properties are ignored by Jackson (Spring Boot default); none of them reaches the stored mark.
        ApiClient.Response response = employee.client().send("POST", "/api/v1/jornadas/" + jornada + "/marks", forged,
                Map.of("Idempotency-Key", UUID.randomUUID().toString())).expect(201);

        assertEquals(clock.instant(), Instant.parse(response.body().get("acceptedAt").asText()));
        assertEquals(1, response.body().get("sequence").asLong());
        String byJornada = " FROM mark_events WHERE jornada_id=?";
        assertEquals(Timestamp.from(clock.instant()), jdbc.queryForObject("SELECT occurred_at" + byJornada, Timestamp.class, jornada.toString()));
        assertEquals(Timestamp.from(clock.instant()), jdbc.queryForObject("SELECT accepted_at" + byJornada, Timestamp.class, jornada.toString()));
        assertEquals("EMPLEADO|" + employee.accountId() + "|1|" + company.id(), jdbc.queryForObject(
                "SELECT CONCAT_WS('|', origin, created_by, sequence_number, company_id)" + byJornada, String.class, jornada.toString()));

        // The role comes from the membership: an ADMIN cannot record an employee mark.
        assertRejected(company.admin().mark(jornada, "SALIDA_DESAYUNO", UUID.randomUUID()), 403, "FORBIDDEN");
        assertEquals(1, markCount(jornada));
    }

    @Test
    void s27SameKeyAndBodyReplayTheSameMarkEvenAfterAnAdminCorrectsOrVoidsIt() {
        UUID jornada = declare(DAY);
        UUID other = declare(DAY.plusDays(1));
        clock.set(START);
        UUID ingresoKey = UUID.randomUUID();
        ApiClient.Response first = employee.client().mark(jornada, "INGRESO", ingresoKey).expect(201);
        clock.advance(Duration.ofMinutes(1));
        ApiClient.Response replay = employee.client().mark(jornada, "INGRESO", ingresoKey).expect(200);
        assertEquals(first.id(), replay.id());
        assertEquals(first.body().get("acceptedAt"), replay.body().get("acceptedAt"));

        clock.advance(Duration.ofMinutes(5));
        UUID pauseKey = UUID.randomUUID();
        ApiClient.Response pause = employee.client().mark(jornada, "SALIDA_DESAYUNO", pauseKey).expect(201);
        clock.advance(Duration.ofMinutes(1));
        company.admin().post("/api/v1/admin/marks/" + pause.id() + "/correction", Map.of("correctedAction", "SALIDA_ALMUERZO",
                "correctedOccurredAt", pause.body().get("occurredAt").asText(), "auditReason", "Was lunch")).expect(200);
        // A replay answers the current state of the original mark (openapi.yaml), not the stored first response.
        ApiClient.Response corrected = employee.client().mark(jornada, "SALIDA_DESAYUNO", pauseKey).expect(200);
        assertEquals(pause.id(), corrected.id());
        assertEquals("SALIDA_ALMUERZO", corrected.body().get("action").asText());

        company.admin().post("/api/v1/admin/marks/" + pause.id() + "/void", Map.of("reason", "Wrong button")).expect(200);
        ApiClient.Response voided = employee.client().mark(jornada, "SALIDA_DESAYUNO", pauseKey).expect(200);
        assertEquals(pause.id(), voided.id());
        assertTrue(voided.body().get("voided").asBoolean());
        assertEquals(2, markCount(jornada));
        assertEquals("EN_CURSO", state(jornada));

        // Same key, other content: another action, or the same action on another jornada.
        assertRejected(employee.client().mark(jornada, "SALIDA_DESAYUNO", ingresoKey), 409, "IDEMPOTENCY_CONFLICT");
        assertRejected(employee.client().mark(other, "INGRESO", ingresoKey), 409, "IDEMPOTENCY_CONFLICT");
        assertEquals(0, markCount(other));
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM mark_idempotency WHERE account_id=?", Integer.class,
                employee.accountId().toString()));

        // CHAR: a key whose request was rejected is not stored, so it can be reused for another action — confirm with Mateo.
        UUID rejectedKey = UUID.randomUUID();
        assertRejected(employee.client().mark(jornada, "VUELTA_DESAYUNO", rejectedKey), 409, "INVALID_MARK_TRANSITION");
        employee.client().mark(jornada, "EGRESO", rejectedKey).expect(201);
    }

    @Test
    void s27KeysArePerAccountSoTwoEmployeesCanUseTheSameUuid() {
        Fixture.Employee other = fixture.employee(company, "Bea", List.of(site), 10);
        UUID anaJornada = declare(DAY);
        UUID beaJornada = fixture.declare(company, other.id(), site, DAY, template);
        clock.set(START);
        UUID shared = UUID.randomUUID();

        ApiClient.Response ana = employee.client().mark(anaJornada, "INGRESO", shared).expect(201);
        ApiClient.Response bea = other.client().mark(beaJornada, "INGRESO", shared).expect(201);

        assertNotEquals(ana.id(), bea.id());
        assertEquals(bea.id(), other.client().mark(beaJornada, "INGRESO", shared).expect(200).id());
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM mark_idempotency WHERE idempotency_key=?", Integer.class, shared.toString()));
    }

    @Test
    void s28AMarkWithoutIdempotencyKeyIsA400AndStoresNothing() {
        UUID jornada = declare(DAY);
        clock.set(START);
        ApiClient.Response response = markWithoutKey(jornada);
        assertEquals(400, response.status(), response.raw());
        assertEquals(0, markCount(jornada));
    }

    /** The status and the empty history are pinned by the test above; #73 gave the 400 its problem code. */
    @Test
    void s28AMarkWithoutIdempotencyKeyCarriesAProblemCode() {
        UUID jornada = declare(DAY);
        clock.set(START);
        ApiClient.Response response = markWithoutKey(jornada);
        assertNotNull(response.code(), "no problem+json code: " + response.raw());
        assertEquals("IDEMPOTENCY_KEY_REQUIRED", response.code());
        assertTrue(response.header("Content-Type").startsWith("application/problem+json"), response.header("Content-Type"));
    }

    private ApiClient.Response markWithoutKey(UUID jornada) {
        return employee.client().send("POST", "/api/v1/jornadas/" + jornada + "/marks", Map.of("action", "INGRESO"), Map.of());
    }

    @Test
    void s28AMalformedIdempotencyKeyIsRejectedWithACode() {
        UUID jornada = declare(DAY);
        clock.set(START);
        ApiClient.Response response = employee.client().send("POST", "/api/v1/jornadas/" + jornada + "/marks",
                Map.of("action", "INGRESO"), Map.of("Idempotency-Key", "not-a-uuid"));
        // CHAR: 422 VALIDATION_ERROR (the API's convention for type mismatches), the plan says 400 — confirm with Mateo.
        assertRejected(response, 422, "VALIDATION_ERROR");
        assertEquals(0, markCount(jornada));
    }

    @Test
    void s29ALocationExactlyThirtySecondsAfterTheMarkIsReceivedAndASecondOneIsFinal() {
        UUID jornada = declare(DAY);
        clock.set(START);
        UUID mark = employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201).id();

        // The window is inclusive: received at acceptedAt + 30 s exactly is still on time.
        clock.set(START.plusSeconds(30));
        ApiClient.Response received = location(mark).expect(202);
        assertEquals("RECIBIDA", received.body().get("locationStatus").asText());
        assertEquals("RECIBIDA", locationStatus(mark));
        assertEquals(Timestamp.from(START.plusSeconds(30)),
                jdbc.queryForObject("SELECT location_received_at FROM mark_events WHERE id=?", Timestamp.class, mark.toString()));

        assertRejected(location(mark), 409, "LOCATION_ALREADY_FINAL");
        clock.set(START.plusSeconds(31));
        scheduler.resolveLocationTimeouts();
        assertEquals("RECIBIDA", locationStatus(mark));
    }

    @Test
    void s29ALateLocationIsRejectedAndTheExpiryJobClosesTheMarkOneMicrosecondAfterThirtySeconds() {
        UUID jornada = declare(DAY);
        clock.set(START);
        UUID mark = employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201).id();
        Instant deadline = START.plusSeconds(30);

        clock.set(deadline.plus(MICRO));
        assertRejected(location(mark), 409, "LOCATION_WINDOW_EXPIRED");
        assertEquals("PENDIENTE", locationStatus(mark));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE id=? AND latitude IS NOT NULL", Integer.class, mark.toString()));

        // The job is exclusive at the edge: at exactly 30 s the mark is still pending.
        clock.set(deadline);
        scheduler.resolveLocationTimeouts();
        assertEquals("PENDIENTE", locationStatus(mark));

        clock.set(deadline.plus(MICRO));
        scheduler.resolveLocationTimeouts();
        assertEquals("SIN_UBICACION", locationStatus(mark));
        assertEquals(List.of(), new InvariantChecker(jdbc).afterLocationExpiry(clock.instant()));
        assertRejected(location(mark), 409, "LOCATION_ALREADY_FINAL");
    }

    @Test
    void s30ACancelledJornadaRejectsMarksLocationsAndForgottenMarks() {
        UUID jornada = declare(DAY);
        clock.set(START);
        UUID ingresoKey = UUID.randomUUID();
        UUID mark = employee.client().mark(jornada, "INGRESO", ingresoKey).expect(201).id();
        String cancellation = "/api/v1/admin/jornadas/" + jornada + "/cancellation";
        assertRejected(company.admin().post(cancellation, Map.of("reason", "Day off")), 409, "JORNADA_HAS_MARKS");

        // A voided mark does not count (D-20261027-08), so the jornada can be cancelled and the mark stays as voided.
        company.admin().post("/api/v1/admin/marks/" + mark + "/void", Map.of("reason", "Wrong day")).expect(200);
        clock.advance(Duration.ofSeconds(5));
        ApiClient.Response cancelled = company.admin().post(cancellation, Map.of("reason", "Day off")).expect(200);
        assertEquals("CANCELADA", cancelled.body().get("state").asText());

        clock.advance(Duration.ofSeconds(5));
        assertRejected(employee.client().mark(jornada, "INGRESO", UUID.randomUUID()), 409, "JORNADA_CANCELLED");
        assertRejected(location(mark), 409, "JORNADA_CANCELLED");
        assertRejected(company.admin().post("/api/v1/admin/jornadas/" + jornada + "/forgotten-marks", Map.of("action", "INGRESO",
                "occurredAt", START.toString(), "auditReason", "Forgot to clock in")), 409, "JORNADA_CANCELLED");
        assertEquals(1, markCount(jornada));
        assertEquals("CANCELADA", state(jornada));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM forgotten_mark_audits WHERE jornada_id=?", Integer.class, jornada.toString()));

        // CHAR: the replay is looked up before the cancellation check, so the original key still answers the voided mark — confirm with Mateo.
        ApiClient.Response replay = employee.client().mark(jornada, "INGRESO", ingresoKey).expect(200);
        assertEquals(mark, replay.id());
        assertTrue(replay.body().get("voided").asBoolean());
    }

    private UUID declare(LocalDate day) {
        return fixture.declare(company, employee.id(), site, day, template);
    }

    /** An employee mark one minute after the previous request, with a fresh key. */
    private ApiClient.Response mark(UUID jornada, String action) {
        clock.advance(Duration.ofMinutes(1));
        return employee.client().mark(jornada, action, UUID.randomUUID());
    }

    private ApiClient.Response location(UUID mark) {
        return employee.client().post("/api/v1/marks/" + mark + "/location",
                Map.of("latitude", -34.6037, "longitude", -58.3816, "accuracyMeters", 10.0));
    }

    private static void assertRejected(ApiClient.Response response, int status, String code) {
        assertEquals(status, response.status(), response.raw());
        assertEquals(code, response.code(), response.raw());
    }

    private String state(UUID jornada) {
        return jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornada.toString());
    }

    private int markCount(UUID jornada) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", Integer.class, jornada.toString());
    }

    private String locationStatus(UUID mark) {
        return jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, mark.toString());
    }

    private static List<String> expand(String shortActions) {
        return shortActions.isBlank() ? List.of() : Arrays.stream(shortActions.split(" ")).map(SHORT::get).toList();
    }

    private static String shortName(String action) {
        return SHORT.entrySet().stream().filter(e -> e.getValue().equals(action)).findFirst().orElseThrow().getKey();
    }

    private static String stateOf(String prefix) {
        return Arrays.stream(TABLE).filter(row -> row[0].equals(prefix)).findFirst().orElseThrow(() -> new AssertionError("no row " + prefix))[1];
    }
}
