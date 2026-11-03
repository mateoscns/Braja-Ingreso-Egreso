package com.braja.fichaje.campaign;

import com.braja.fichaje.notifications.NotificationOutboxDispatcher;
import com.braja.fichaje.timekeeping.MarkAction;
import com.braja.fichaje.timekeeping.MarkScheduler;
import com.braja.fichaje.timekeeping.MarkState;
import com.braja.fichaje.timekeeping.MarkTransitionPolicy;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S62-S65: concurrent bursts through real HTTP and the real job beans (CLAUDE.md rules 10-13 and 21, §6). Only results are
 * asserted (counts, codes, rows, invariants), never the order in which threads interleave. Deadlocks are read from the
 * InnoDB lock_deadlocks counter (root connection: the application user lacks PROCESS) before and after every test, so a
 * deadlock whose victim was a job that swallowed and retried it still fails the test.
 * Jornadas are 09:00-17:00 in Buenos Aires (12:00Z-20:00Z) with a 10 minute tolerance; the clock stands still in a burst.
 */
class LockOrderSpecTest extends CampaignTestBase {
    private static final String ZONE = "America/Argentina/Buenos_Aires";
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    private static final double LAT = -34.6037, LON = -58.3816;
    private static final int PAIR_ROUNDS = 3, JOB_PAIR_ROUNDS = 6, SNAPSHOT_ROUNDS = 8;
    private static final Set<Op> JORNADA_OPS = EnumSet.of(Op.MARK, Op.LOCATION, Op.LOCATION_EXPIRY, Op.ABSENCE_JOB, Op.FORGOTTEN,
            Op.CORRECTION, Op.VOID, Op.CANCELLATION, Op.CLASSIFICATION, Op.MOTIVE);
    private static final Set<Op> SITE_FK_WRITERS = EnumSet.of(Op.MARK, Op.LOCATION, Op.LOCATION_EXPIRY, Op.ABSENCE_JOB, Op.FORGOTTEN,
            Op.CORRECTION, Op.VOID);
    private static final Set<Op> ABSENT_OPS = EnumSet.of(Op.MARK, Op.ABSENCE_JOB, Op.FORGOTTEN, Op.CANCELLATION, Op.CLASSIFICATION,
            Op.MOTIVE, Op.BULK_DECLARATION);
    private static volatile String cachedHash;

    @Autowired private MarkScheduler scheduler;
    @Autowired private NotificationOutboxDispatcher dispatcher;
    @Autowired private PasswordEncoder passwords;

    private long deadlocksBefore;
    /** Set by the S64 retry test, which deliberately retries a retryable conflict; every other test fails on one. */
    private boolean conflictsAssertedByTheTest;

    enum Op { MARK, LOCATION, LOCATION_EXPIRY, ABSENCE_JOB, FORGOTTEN, CORRECTION, VOID, CANCELLATION, CLASSIFICATION, MOTIVE,
        TEMPLATE_SAVE, BULK_DECLARATION, SITE_LOCATION }

    /** ABSENT: no marks, the absence is due. OVERTIME: INGRESO, a long lunch, a breakfast just started after the end: MARCA_FALTANTE is due. */
    enum Scenario { ABSENT, OVERTIME }

    private record Person(UUID employeeId, UUID accountId, String dni) { }

    private record Outcome(Op op, String token, String raw) { }

    private record Round(int index, Scenario scenario, LocalDate date, UUID jornada, UUID ingreso, UUID breakfastStart, UUID deviation, Instant at) { }

    @BeforeEach
    void readDeadlockCounter() {
        deadlocksBefore = deadlocks();
    }

    @AfterEach
    void noDeadlockNoServerErrorAndInvariantsHold() {
        long deadlocksAfter = deadlocks();
        if (deadlocksAfter != deadlocksBefore) System.out.println("LATEST DETECTED DEADLOCK\n" + latestDeadlock());
        assertAll(() -> assertEquals(List.of(), httpLog.serverErrors()),
                () -> assertEquals(List.of(), new InvariantChecker(jdbc).always()));
        if (conflictsAssertedByTheTest) return;
        assertAll(() -> assertEquals(List.of(), httpLog.all().stream().filter(e -> "RETRYABLE_TRANSACTION_CONFLICT".equals(e.code())
                        || (e.body() != null && e.body().toLowerCase().contains("deadlock"))).toList()),
                () -> assertEquals(deadlocksBefore, deadlocksAfter, "InnoDB lock_deadlocks moved during the test"));
    }

    // S62 ------------------------------------------------------------------------------------------------------------

    @Test
    void s62TwentyIdenticalRetriesMakeOneMarkAndTwentyDistinctActionsAcceptOneAndConflictNineteen() throws Exception {
        Fixture.Company company = seedCompany("Rafaga");
        UUID site = fixture.site(company, "Centro", ZONE);
        UUID template = fixture.template(company, site, "Fijo", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        Person ana = seedEmployee(company, "Ana", List.of(site));
        List<ApiClient> browsers = logIn(ana.dni(), 20);
        List<String> actions = List.of("SALIDA_DESAYUNO", "SALIDA_ALMUERZO", "EGRESO", "INGRESO");

        for (int round = 0; round < 3; round++) {
            LocalDate date = DAY.plusDays(round);
            clock.set(at(date, "11:00:00"));
            UUID jornada = fixture.declare(company, ana.employeeId(), site, date, template);

            clock.set(at(date, "12:00:00"));
            UUID key = UUID.randomUUID();
            List<ApiClient.Response> same = together(browsers.stream().<Callable<ApiClient.Response>>map(b -> () -> b.mark(jornada, "INGRESO", key)).toList());
            assertEquals(Map.of("200", 19L, "201", 1L), tally(same), "round " + round);
            assertEquals(1, same.stream().map(ApiClient.Response::id).distinct().count(), "every replay returns the original mark");
            assertEquals(1, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", jornada));
            assertEquals(1, count("SELECT COUNT(*) FROM mark_idempotency WHERE account_id=? AND idempotency_key=?", ana.accountId(), key));

            clock.set(at(date, "13:00:00"));
            List<Callable<ApiClient.Response>> distinct = new ArrayList<>();
            for (int i = 0; i < browsers.size(); i++) {
                ApiClient browser = browsers.get(i);
                String action = actions.get(i % actions.size());
                distinct.add(() -> browser.mark(jornada, action, UUID.randomUUID()));
            }
            List<ApiClient.Response> raced = together(distinct);
            assertEquals(Map.of("201", 1L, "409 INVALID_MARK_TRANSITION", 19L), tally(raced), "round " + round);
            assertEquals(2, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", jornada));
            assertEquals(List.of(), historyViolations(jornada));
        }
    }

    // S63 ------------------------------------------------------------------------------------------------------------

    /** Every pair of writes that share a locked row (rule 11); the skipped pairs are listed in {@link #sharesALock}. */
    static Stream<Arguments> s63Pairs() {
        List<Arguments> pairs = new ArrayList<>();
        Op[] ops = Op.values();
        for (int i = 0; i < ops.length; i++) {
            for (int j = i; j < ops.length; j++) {
                if (sharesALock(ops[i], ops[j])) pairs.add(Arguments.of(ops[i], ops[j], scenario(ops[i], ops[j])));
            }
        }
        return pairs.stream();
    }

    /**
     * The jornada row (and its marks and deviations, all taken under it) is shared by the ten jornada ops; classification and
     * motive lock the deviation row reconcile also locks. Outside that: templates (template save FOR UPDATE vs bulk FOR SHARE),
     * the site row (site edit FOR UPDATE vs bulk FOR SHARE and the FK share lock of every deviation insert), the employee row
     * (absence job FOR UPDATE vs the FK share lock of bulk inserts) and the jornada unique key (bulk vs cancellation).
     * Skipped, no common row: template save with anything but bulk and itself (jornadas use a frozen snapshot), bulk with the
     * mark, location, ADMIN mark and deviation ops (share locks only), and site edit with cancellation, classification, motive
     * and template save (none of them touches the site row).
     */
    static boolean sharesALock(Op a, Op b) {
        if (JORNADA_OPS.contains(a) && JORNADA_OPS.contains(b)) return true;
        Set<Op> pair = EnumSet.of(a, b);
        if (pair.contains(Op.TEMPLATE_SAVE)) return pair.equals(EnumSet.of(Op.TEMPLATE_SAVE)) || pair.contains(Op.BULK_DECLARATION);
        if (pair.contains(Op.BULK_DECLARATION)) {
            Op other = a == Op.BULK_DECLARATION ? b : a;
            return EnumSet.of(Op.BULK_DECLARATION, Op.ABSENCE_JOB, Op.CANCELLATION, Op.SITE_LOCATION).contains(other);
        }
        if (pair.contains(Op.SITE_LOCATION)) {
            Op other = a == Op.SITE_LOCATION ? b : a;
            return other == Op.SITE_LOCATION || SITE_FK_WRITERS.contains(other);
        }
        return false;
    }

    static Scenario scenario(Op a, Op b) {
        Set<Op> pair = EnumSet.of(a, b);
        if (pair.contains(Op.CANCELLATION) && ABSENT_OPS.containsAll(pair)) return Scenario.ABSENT;
        if (pair.equals(EnumSet.of(Op.ABSENCE_JOB)) || pair.equals(EnumSet.of(Op.ABSENCE_JOB, Op.MARK))
                || pair.equals(EnumSet.of(Op.ABSENCE_JOB, Op.FORGOTTEN))) return Scenario.ABSENT;
        return Scenario.OVERTIME;
    }

    private Fixture.Company company;
    private UUID site, mainTemplate, patchTemplate;
    private Person ana;
    private List<ApiClient> admins, employees;

    /**
     * Pairs with a job get more rounds: a job swallows its own failure, so only its result (and the deadlock counter) shows it.
     * Total kept near four minutes; the pairs are listed in {@link #sharesALock}.
     */
    private static int rounds(Op a, Op b) {
        Set<Op> jobs = EnumSet.of(Op.ABSENCE_JOB, Op.LOCATION_EXPIRY);
        return jobs.contains(a) || jobs.contains(b) ? JOB_PAIR_ROUNDS : PAIR_ROUNDS;
    }

    @ParameterizedTest(name = "{0} x {1} ({2})")
    @MethodSource("s63Pairs")
    void s63EveryPairOfWritesOnOneJornadaEndsWithoutDeadlockOrServerErrorAndKeepsTheInvariants(Op a, Op b, Scenario scenario) throws Exception {
        pairSetUp();
        List<String> violations = new ArrayList<>();
        Map<String, Long> seen = new TreeMap<>();
        for (int r = 0; r < rounds(a, b); r++) {
            LocalDate date = DAY.plusDays(2L * r);
            Round round = scenario == Scenario.ABSENT ? absentRound(r, date, EnumSet.of(a, b)) : overtimeRound(r, date);
            clock.set(round.at());
            List<Outcome> outcomes = together(List.of(() -> run(a, round, 0), () -> run(b, round, 1)));
            for (Outcome outcome : outcomes) {
                seen.merge(outcome.op() + " " + outcome.token(), 1L, Long::sum);
                if (!allowed(outcome.op(), scenario).contains(outcome.token())) violations.add("round " + r + ": " + outcome);
            }
            violations.addAll(prefixed(r, roundViolations(round, EnumSet.of(a, b))));
            clock.set(at(date.plusDays(1), "23:30:00"));
            scheduler.createDueAbsences();
            scheduler.resolveLocationTimeouts();
        }
        System.out.println("S63 " + a + " x " + b + " (" + scenario + "): " + seen);
        assertEquals(List.of(), violations, "outcomes " + seen);
    }

    /** The TEMPLATE_SAVE x BULK_DECLARATION pair of S63, checked for what each declared jornada froze. */
    @Test
    void s63ABulkDeclarationRacingATemplateSaveFreezesOneWholeTemplateVersion() throws Exception {
        pairSetUp();
        for (int r = 0; r < SNAPSHOT_ROUNDS; r++) {
            Round round = new Round(r, Scenario.OVERTIME, DAY.plusDays(2L * r), null, null, null, null, at(DAY.plusDays(2L * r), "08:00:00"));
            clock.set(round.at());
            List<Outcome> outcomes = together(List.of(() -> run(Op.TEMPLATE_SAVE, round, 0), () -> run(Op.BULK_DECLARATION, round, 1)));
            assertEquals(List.of("200", "200"), outcomes.stream().map(Outcome::token).toList(), "round " + r);
        }
        assertEquals(2 * SNAPSHOT_ROUNDS, count("SELECT COUNT(*) FROM jornadas WHERE template_id=?", patchTemplate));
        assertEquals(List.of(), snapshotViolations());
    }

    private void pairSetUp() throws Exception {
        company = seedCompany("Pares");
        site = fixture.site(company, "Centro", ZONE);
        fixture.siteCenter(company, site, LAT, LON, 100);
        mainTemplate = fixture.template(company, site, "Fijo", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        patchTemplate = fixture.template(company, site, "Turno A", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        ana = seedEmployee(company, "Ana", List.of(site));
        List<ApiClient> logged = together(List.of(() -> loggedIn("admin-2", company.adminDni()), () -> loggedIn("ana-1", ana.dni()),
                () -> loggedIn("ana-2", ana.dni())));
        admins = List.of(company.admin(), logged.get(0));
        employees = List.of(logged.get(1), logged.get(2));
    }

    private Round absentRound(int index, LocalDate date, Set<Op> pair) {
        clock.set(at(date, "11:00:00"));
        UUID jornada = fixture.declare(company, ana.employeeId(), site, date, mainTemplate);
        UUID deviation = null;
        if (pair.contains(Op.CLASSIFICATION) || pair.contains(Op.MOTIVE)) {
            clock.set(at(date, "12:10:30"));
            scheduler.createDueAbsences();
            deviation = activeDeviation(jornada, "SIN_INGRESO");
        }
        return new Round(index, Scenario.ABSENT, date, jornada, null, null, deviation, at(date, "12:11:00"));
    }

    private Round overtimeRound(int index, LocalDate date) {
        clock.set(at(date, "11:00:00"));
        UUID jornada = fixture.declare(company, ana.employeeId(), site, date, mainTemplate);
        UUID ingreso = setupMark(jornada, date, "12:00:00", "INGRESO");
        setupMark(jornada, date, "15:00:00", "SALIDA_ALMUERZO");
        setupMark(jornada, date, "16:00:00", "VUELTA_ALMUERZO");
        UUID breakfast = setupMark(jornada, date, "20:10:05", "SALIDA_DESAYUNO");
        return new Round(index, Scenario.OVERTIME, date, jornada, ingreso, breakfast, activeDeviation(jornada, "EXCESO_ALMUERZO"),
                at(date, "20:10:20"));
    }

    private UUID setupMark(UUID jornada, LocalDate date, String time, String action) {
        clock.set(at(date, time));
        return employees.getFirst().mark(jornada, action, UUID.randomUUID()).expect(201).id();
    }

    /** Runs one op of the pair; slot 0 and 1 use their own browser (ADMIN or employee) so no two threads share a session. */
    private Outcome run(Op op, Round round, int slot) {
        ApiClient admin = admins.get(slot), employee = employees.get(slot);
        boolean absent = round.scenario() == Scenario.ABSENT;
        int version = (round.index() + slot) % 2;
        return switch (op) {
            case MARK -> http(op, employee.mark(round.jornada(), absent ? "INGRESO" : "VUELTA_DESAYUNO", UUID.randomUUID()));
            case LOCATION -> http(op, employee.post("/api/v1/marks/" + round.breakfastStart() + "/location",
                    Map.of("latitude", 0.0, "longitude", 0.0, "accuracyMeters", 5.0)));
            case LOCATION_EXPIRY -> job(op, scheduler::resolveLocationTimeouts);
            case ABSENCE_JOB -> job(op, scheduler::createDueAbsences);
            case FORGOTTEN -> http(op, admin.post("/api/v1/admin/jornadas/" + round.jornada() + "/forgotten-marks",
                    Map.of("action", absent ? "INGRESO" : "VUELTA_DESAYUNO", "occurredAt",
                            at(round.date(), absent ? "12:10:50" : "20:10:10").toString(), "auditReason", "Employee forgot to mark")));
            case CORRECTION -> http(op, admin.post("/api/v1/admin/marks/" + round.ingreso() + "/correction", Map.of("correctedAction", "INGRESO",
                    "correctedOccurredAt", at(round.date(), "12:20:00").toString(), "auditReason", "Checked against the camera")));
            case VOID -> http(op, admin.post("/api/v1/admin/marks/" + round.breakfastStart() + "/void", Map.of("reason", "Wrong button")));
            case CANCELLATION -> http(op, admin.post("/api/v1/admin/jornadas/" + round.jornada() + "/cancellation", Map.of("reason", "Store closed")));
            case CLASSIFICATION -> http(op, admin.put("/api/v1/admin/deviations/" + round.deviation() + "/classification",
                    Map.of("classification", version == 0 ? "JUSTIFICADO" : "NO_JUSTIFICADO", "correctionReason", "Reviewed")));
            case MOTIVE -> http(op, employee.put("/api/v1/deviations/" + round.deviation() + "/motive", Map.of("category", "OTRA", "text", "Bus strike")));
            case TEMPLATE_SAVE -> http(op, admin.patch("/api/v1/templates/" + patchTemplate, templateVersion(version)));
            case BULK_DECLARATION -> http(op, admin.post("/api/v1/jornadas/bulk", Map.of("employeeIds", List.of(ana.employeeId()), "siteId", site,
                    "from", round.date().toString(), "to", round.date().plusDays(1).toString(), "weekdays", List.of(1, 2, 3, 4, 5, 6, 7),
                    "templateId", patchTemplate)));
            case SITE_LOCATION -> http(op, admin.put("/api/v1/sites/" + site + "/location", Map.of("latitude", LAT, "longitude", LON,
                    "geofenceRadiusMeters", 100 + 50 * version, "locationSource", "MANUAL")));
        };
    }

    /** A coded 409 or 404 is a correct answer only when the other op of the pair can explain it; never a retryable conflict. */
    private static Set<String> allowed(Op op, Scenario scenario) {
        boolean absent = scenario == Scenario.ABSENT;
        return switch (op) {
            case MARK -> Set.of("201", "409 INVALID_MARK_TRANSITION", "409 JORNADA_CANCELLED");
            case LOCATION -> Set.of("202", "409 MARK_VOIDED", "409 LOCATION_ALREADY_FINAL");
            case LOCATION_EXPIRY, ABSENCE_JOB -> Set.of("ran");
            case FORGOTTEN -> Set.of("201", "409 INVALID_MARK_TRANSITION", "409 INVALID_MARK_ORDER", "409 JORNADA_CANCELLED");
            case CORRECTION -> Set.of("200", "409 INVALID_MARK_TRANSITION", "409 INVALID_MARK_ORDER");
            case VOID -> Set.of("200", "409 INVALID_MARK_HISTORY", "409 MARK_VOIDED");
            case CANCELLATION -> Set.of("200", "409 JORNADA_HAS_MARKS", "409 JORNADA_CANCELLED");
            // A cancellation that commits first retracts the deviation: it is gone for both of them.
            case CLASSIFICATION -> absent ? Set.of("200", "404 NOT_FOUND") : Set.of("200");
            case MOTIVE -> absent ? Set.of("200", "409 MOTIVE_LOCKED", "404 NOT_FOUND") : Set.of("200", "409 MOTIVE_LOCKED");
            case TEMPLATE_SAVE, BULK_DECLARATION, SITE_LOCATION -> Set.of("200");
        };
    }

    /** What must hold after the round whatever won: the history, the job's own result and the bulk's snapshot. */
    private List<String> roundViolations(Round round, Set<Op> pair) {
        List<String> violations = new ArrayList<>(new InvariantChecker(jdbc).always());
        violations.addAll(historyViolations(round.jornada()));
        String state = jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, round.jornada().toString());
        if (pair.contains(Op.LOCATION_EXPIRY)) violations.addAll(new InvariantChecker(jdbc).afterLocationExpiry(round.at()));
        if (pair.contains(Op.ABSENCE_JOB)) {
            if (count("SELECT COUNT(*) FROM jornadas WHERE id=? AND deviation_worker_failure_count=0 AND deviation_worker_retry_at IS NULL", round.jornada()) != 1) {
                violations.add("the absence job failed on the jornada and scheduled a retry");
            }
            String family = round.scenario() == Scenario.OVERTIME ? "'MARCA_FALTANTE'" : "'SIN_INGRESO','LLEGADA_TARDE'";
            int expected = "CANCELADA".equals(state) ? 0 : 1;
            int active = count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active AND type IN (" + family + ")", round.jornada());
            if (active != expected) violations.add("expected " + expected + " active " + family + " after the absence job, got " + active);
        }
        if (pair.contains(Op.BULK_DECLARATION)) {
            int created = count("SELECT COUNT(*) FROM jornadas WHERE employee_id=? AND local_date=? AND state<>'CANCELADA'", ana.employeeId(),
                    round.date().plusDays(1));
            if (created != 1) violations.add("expected one jornada on the bulk's new date, got " + created);
        }
        return violations;
    }

    /** Valid marks in timeline order form a valid history, never go back in time, and give the stored state. */
    private List<String> historyViolations(UUID jornada) {
        List<String> violations = new ArrayList<>();
        String state = jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornada.toString());
        List<Map<String, Object>> marks = jdbc.queryForList("SELECT action, occurred_at FROM mark_events WHERE jornada_id=? AND voided_at IS NULL"
                + " ORDER BY timeline_order, sequence_number", jornada.toString());
        List<MarkAction> actions = new ArrayList<>();
        Timestamp previous = null;
        for (Map<String, Object> mark : marks) {
            MarkAction action = MarkAction.valueOf((String) mark.get("action"));
            Timestamp occurred = Timestamp.from(toInstant(mark.get("occurred_at")));
            try {
                new MarkTransitionPolicy().validate(actions, action);
            } catch (RuntimeException ex) {
                violations.add("invalid history " + actions + " then " + action);
            }
            if (previous != null && occurred.before(previous)) violations.add("mark time goes back at " + action);
            actions.add(action);
            previous = occurred;
        }
        if ("CANCELADA".equals(state)) {
            if (!actions.isEmpty()) violations.add("cancelled jornada with valid marks " + actions);
            if (count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active", jornada) != 0) violations.add("cancelled jornada with active deviations");
        } else if (!MarkState.from(actions).equals(state)) {
            violations.add("stored state " + state + " but history " + actions);
        }
        return violations;
    }

    /** A jornada declared from the patched template froze one whole version: never one version's name with another's blocks. */
    private List<String> snapshotViolations() {
        List<String> violations = new ArrayList<>();
        for (String raw : jdbc.queryForList("SELECT schedule_snapshot FROM jornadas WHERE template_id=?", String.class, patchTemplate.toString())) {
            JsonNode snapshot = readJson(raw);
            boolean a = snapshot.get("name").asText().equals("Turno A");
            String start = snapshot.get("blocks").get(0).get("start").asText();
            if (!start.startsWith(a ? "09:00" : "09:30") || snapshot.get("breakfastLimitMinutes").asInt() != (a ? 20 : 25)) {
                violations.add("mixed template snapshot " + raw);
            }
        }
        return violations;
    }

    private Map<String, Object> templateVersion(int version) {
        String start = version == 0 ? "09:00" : "09:30", end = version == 0 ? "17:00" : "17:30";
        return Map.of("siteId", site, "name", version == 0 ? "Turno A" : "Turno B",
                "blocks", List.of(Map.of("startDayOffset", 0, "start", start, "end", end, "endDayOffset", 0)),
                "breakfastLimitMinutes", version == 0 ? 20 : 25, "lunchLimitMinutes", version == 0 ? 30 : 35);
    }

    // S64 ------------------------------------------------------------------------------------------------------------

    @Test
    void s64TwentyLateIngresosWithTheAbsenceJobAndTheDispatcherOpenOnePushWindowCountedPerSite() throws Exception {
        s64Rounds(false);
        assertEquals(deadlocksBefore, deadlocks(), "InnoDB lock_deadlocks moved during the burst");
    }

    /** The same burst with clients that retry the documented 409 (a lock wait timeout can still answer it): still one window. */
    @Test
    void s64WithClientsRetryingTheRetryableConflictTheBurstStillOpensOnePushWindowCountedPerSite() throws Exception {
        conflictsAssertedByTheTest = true;
        s64Rounds(true);
    }

    private void s64Rounds(boolean retryConflicts) throws Exception {
        Fixture.Company shop = seedCompany("Aviso");
        UUID centro = fixture.site(shop, "Centro", ZONE);
        UUID norte = fixture.site(shop, "Norte", ZONE);
        Map<UUID, UUID> templates = Map.of(centro, fixture.template(shop, centro, "Centro", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30),
                norte, fixture.template(shop, norte, "Norte", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30));
        List<Person> people = new ArrayList<>();
        List<Callable<ApiClient>> logins = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            Person person = seedEmployee(shop, "Persona " + i, List.of(i % 2 == 0 ? centro : norte));
            people.add(person);
            logins.add(() -> loggedIn("employee-" + person.dni(), person.dni()));
        }
        for (UUID home : List.of(centro, norte)) {
            List<UUID> ids = new ArrayList<>();
            for (int i = 0; i < 20; i++) if ((i % 2 == 0) == home.equals(centro)) ids.add(people.get(i).employeeId());
            shop.admin().post("/api/v1/jornadas/bulk", Map.of("employeeIds", ids, "siteId", home, "from", DAY.toString(),
                    "to", DAY.plusDays(2).toString(), "weekdays", List.of(1, 2, 3, 4, 5, 6, 7), "templateId", templates.get(home))).expect(200);
        }
        List<ApiClient> browsers = together(logins);
        shop.admin().put("/api/v1/push/subscriptions", Map.of("endpoint", "https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID(),
                "keys", Map.of("p256dh", TestKeys.subscriptionP256dh(), "auth", TestKeys.subscriptionAuth()))).expect(200);

        for (int round = 0; round < 3; round++) {
            LocalDate date = DAY.plusDays(round);
            Instant burst = at(date, "12:11:00");
            clock.set(burst);
            List<UUID> jornadas = new ArrayList<>(), keys = new ArrayList<>();
            List<Callable<String>> tasks = new ArrayList<>();
            for (int i = 0; i < 20; i++) {
                ApiClient browser = browsers.get(i);
                UUID jornada = UUID.fromString(jdbc.queryForObject("SELECT id FROM jornadas WHERE employee_id=? AND local_date=?", String.class,
                        people.get(i).employeeId().toString(), date));
                UUID key = UUID.randomUUID();
                jornadas.add(jornada);
                keys.add(key);
                tasks.add(() -> token(browser.mark(jornada, "INGRESO", key)));
            }
            tasks.add(() -> job(Op.ABSENCE_JOB, scheduler::createDueAbsences).token());
            tasks.add(() -> job(Op.ABSENCE_JOB, dispatcher::dispatchDueWindows).token());
            List<String> answers = together(tasks);
            Map<String, Long> tally = answers.stream().collect(Collectors.groupingBy(Function.identity(), TreeMap::new, Collectors.counting()));
            System.out.println("S64 round " + round + " first try: " + tally);
            if (retryConflicts) {
                for (int i = 0; i < 20; i++) {
                    for (int attempt = 0; answers.get(i).equals("409 RETRYABLE_TRANSACTION_CONFLICT") && attempt < 5; attempt++) {
                        answers.set(i, token(browsers.get(i).mark(jornadas.get(i), "INGRESO", keys.get(i))));
                    }
                }
                tally = answers.stream().collect(Collectors.groupingBy(Function.identity(), TreeMap::new, Collectors.counting()));
            }
            assertEquals(Map.of("201", 20L, "ran", 2L), tally, "round " + round);

            assertEquals(List.of("LLEGADA_TARDE 20"), jdbc.queryForList("SELECT CONCAT(d.type, ' ', COUNT(*)) FROM deviations d JOIN jornadas j"
                    + " ON j.id=d.jornada_id WHERE j.local_date=? AND d.active GROUP BY d.type", String.class, date));
            assertEquals(List.of("20 20"), jdbc.queryForList("SELECT CONCAT(COUNT(*), ' ', COUNT(DISTINCT e.deviation_id)) FROM notification_outbox_events e"
                    + " JOIN deviations d ON d.id=e.deviation_id JOIN jornadas j ON j.id=d.jornada_id WHERE j.local_date=?", String.class, date));
            assertEquals(List.of(), jdbc.queryForList("SELECT deviation_id FROM notification_outbox_events GROUP BY deviation_id HAVING COUNT(*) > 1", String.class));
            assertEquals(1, count("SELECT COUNT(*) FROM notification_windows WHERE company_id=? AND window_started_at=?", shop.id(), Timestamp.from(burst)));
            assertEquals(round + 1, count("SELECT COUNT(*) FROM notification_windows WHERE company_id=?", shop.id()));
            if (round > 0) assertEquals(20, count("SELECT COUNT(*) FROM deviations d JOIN jornadas j ON j.id=d.jornada_id"
                    + " WHERE j.local_date=? AND d.active AND d.type='MARCA_FALTANTE'", date.minusDays(1)));

            clock.set(at(date, "12:16:00"));
            dispatcher.dispatchDueWindows();
            assertEquals(round + 1, push.deliveries().size());
            JsonNode payload = readJson(push.deliveries().getLast().payload());
            assertEquals(20, payload.get("totalCount").asInt());
            Map<String, Integer> perSite = new TreeMap<>();
            payload.get("siteCounts").forEach(s -> perSite.put(s.get("siteName").asText(), s.get("count").asInt()));
            assertEquals(Map.of("Centro", 10, "Norte", 10), perSite);
            assertEquals(round + 1, count("SELECT COUNT(*) FROM notification_windows WHERE company_id=? AND status='SENT'", shop.id()));
            for (UUID jornada : jornadas) assertEquals(List.of(), historyViolations(jornada));
        }
    }

    // S65 ------------------------------------------------------------------------------------------------------------

    @Test
    void s65ThirtyNineSimultaneousLoginsOnATwelveConnectionPoolAnswerOnly200Or401Or429WithConsistentCounters() throws Exception {
        Fixture.Company shop = seedCompany("Logins");
        UUID site = fixture.site(shop, "Centro", ZONE);
        for (int wave = 1; wave <= 2; wave++) {
            List<String> right = new ArrayList<>(), victims = new ArrayList<>();
            for (int i = 0; i < 12; i++) right.add(seedEmployee(shop, "Bien " + wave + "-" + i, List.of(site)).dni());
            for (int i = 0; i < 3; i++) victims.add(seedEmployee(shop, "Victima " + wave + "-" + i, List.of(site)).dni());
            String unknown = Fixture.nextDni();
            List<String[]> attempts = new ArrayList<>();
            for (int i = 0; i < right.size(); i++) attempts.add(new String[] {right.get(i), Fixture.PASSWORD});
            attempts.add(new String[] {right.get(0), Fixture.PASSWORD});
            attempts.add(new String[] {right.get(1), Fixture.PASSWORD});
            for (String victim : victims) for (int i = 0; i < 7; i++) attempts.add(new String[] {victim, "wrong-password-" + i});
            for (int i = 0; i < 4; i++) attempts.add(new String[] {unknown, "wrong-password-" + i});
            List<ApiClient> browsers = attempts.stream().map(attempt -> fixture.client("login:" + attempt[0])).toList();
            List<Callable<ApiClient.Response>> tasks = new ArrayList<>();
            for (int i = 0; i < attempts.size(); i++) {
                ApiClient browser = browsers.get(i);
                String[] attempt = attempts.get(i);
                tasks.add(() -> browser.login(attempt[0], attempt[1]));
            }

            List<ApiClient.Response> answers = together(tasks);

            assertEquals(39, answers.size());
            assertEquals(Map.of("200", 14L, "401 UNAUTHORIZED", 19L, "429 TOO_MANY_REQUESTS", 6L), tally(answers), "wave " + wave);
            for (String victim : victims) {
                Map<String, Long> forVictim = new TreeMap<>();
                for (int i = 0; i < attempts.size(); i++) if (attempts.get(i)[0].equals(victim)) forVictim.merge(token(answers.get(i)), 1L, Long::sum);
                assertEquals(Map.of("401 UNAUTHORIZED", 5L, "429 TOO_MANY_REQUESTS", 2L), forVictim, "victim " + victim);
            }
            answers.stream().filter(answer -> answer.status() == 429).forEach(answer -> assertNotNull(answer.header("Retry-After")));
            for (int i = 0; i < attempts.size(); i++) if (answers.get(i).status() == 200) browsers.get(i).get("/api/v1/session").expect(200);
            // Correct logins clear their DNI row; each locked DNI kept exactly five failures; the unknown DNI four, unlocked.
            assertEquals(List.of("4 unlocked x" + wave, "5 locked x" + 3 * wave), jdbc.queryForList("SELECT CONCAT(failed_attempts, ' ', lock_state, ' x', COUNT(*))"
                    + " FROM (SELECT failed_attempts, IF(locked_until IS NULL, 'unlocked', 'locked') AS lock_state FROM login_throttles) t"
                    + " GROUP BY failed_attempts, lock_state ORDER BY failed_attempts", String.class));
            // One row per client address that sent a verified wrong password; a 429 never reached the password check.
            assertEquals(List.of("1 x" + 19 * wave), jdbc.queryForList("SELECT CONCAT(failed_attempts, ' x', COUNT(*)) FROM login_ip_throttles"
                    + " GROUP BY failed_attempts", String.class));
        }
    }

    // helpers --------------------------------------------------------------------------------------------------------

    /** Releases every task at once; each future has a timeout and the pool is always shut down. */
    private static <T> List<T> together(List<Callable<T>> tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        CountDownLatch ready = new CountDownLatch(tasks.size());
        CountDownLatch go = new CountDownLatch(1);
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (Callable<T> task : tasks) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return task.call();
                }));
            }
            assertTrue(ready.await(30, TimeUnit.SECONDS), "threads not ready");
            go.countDown();
            List<T> results = new ArrayList<>();
            for (Future<T> future : futures) results.add(future.get(60, TimeUnit.SECONDS));
            return results;
        } finally {
            go.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(30, TimeUnit.SECONDS), "burst threads did not stop");
        }
    }

    private static Outcome http(Op op, ApiClient.Response response) {
        return new Outcome(op, token(response), response.raw());
    }

    /** A job swallows its own per-candidate failures; anything that escapes it is a failure of the job itself. */
    private static Outcome job(Op op, Runnable job) {
        try {
            job.run();
            return new Outcome(op, "ran", "");
        } catch (RuntimeException ex) {
            return new Outcome(op, "threw " + ex.getClass().getSimpleName(), String.valueOf(ex.getMessage()));
        }
    }

    private static String token(ApiClient.Response response) {
        return response.code() == null || response.status() < 300 ? Integer.toString(response.status()) : response.status() + " " + response.code();
    }

    private static Map<String, Long> tally(List<ApiClient.Response> responses) {
        return responses.stream().map(LockOrderSpecTest::token).collect(Collectors.groupingBy(Function.identity(), TreeMap::new, Collectors.counting()));
    }

    private static List<String> prefixed(int round, List<String> violations) {
        return violations.stream().map(v -> "round " + round + ": " + v).toList();
    }

    /** The InnoDB deadlock counter; the application user lacks PROCESS, so it is read as root (read only, nothing is changed). */
    private static long deadlocks() {
        try (Connection connection = DriverManager.getConnection(SharedMySql.jdbcUrl(), "root", SharedMySql.MYSQL.getPassword());
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SELECT COUNT, STATUS FROM information_schema.INNODB_METRICS WHERE NAME='lock_deadlocks'")) {
            assertTrue(rs.next(), "lock_deadlocks metric missing");
            assertEquals("enabled", rs.getString("STATUS"), "lock_deadlocks is disabled: deadlocks would go unseen");
            return rs.getLong("COUNT");
        } catch (SQLException ex) {
            throw new IllegalStateException("cannot read INNODB_METRICS", ex);
        }
    }

    /** The deadlock section of SHOW ENGINE INNODB STATUS (root, read only), printed as evidence when the counter moved. */
    private static String latestDeadlock() {
        try (Connection connection = DriverManager.getConnection(SharedMySql.jdbcUrl(), "root", SharedMySql.MYSQL.getPassword());
             Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SHOW ENGINE INNODB STATUS")) {
            String status = rs.next() ? rs.getString("Status") : "";
            int start = status.indexOf("LATEST DETECTED DEADLOCK"), end = status.indexOf("TRANSACTIONS\n------------", Math.max(start, 0));
            return start < 0 ? "(none recorded)" : status.substring(start, end < 0 ? status.length() : end);
        } catch (SQLException ex) {
            return "cannot read InnoDB status: " + ex.getMessage();
        }
    }

    /** One BCrypt hash for every seeded account: the campaign pays the cost of verifying it, not of encoding it again. */
    private String passwordHash() {
        String hash = cachedHash;
        if (hash == null) cachedHash = hash = passwords.encode(Fixture.PASSWORD);
        return hash;
    }

    /** Like {@link Fixture#company} but with the shared hash. */
    private Fixture.Company seedCompany(String name) {
        UUID companyId = UUID.randomUUID(), adminAccount = UUID.randomUUID();
        String dni = Fixture.nextDni();
        Timestamp now = Timestamp.from(clock.instant());
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), name, now);
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                adminAccount.toString(), dni, dni, passwordHash(), now, now);
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at,display_name) VALUES(?,?,?,'ADMIN',TRUE,?,?)",
                UUID.randomUUID().toString(), companyId.toString(), adminAccount.toString(), now, "Admin " + name);
        return new Fixture.Company(companyId, name, adminAccount, dni, loggedIn("admin:" + name, dni));
    }

    /** An active employee at the given sites, straight in SQL (the API path is covered by OrganizationSpecTest). */
    private Person seedEmployee(Fixture.Company company, String name, List<UUID> sites) {
        UUID account = UUID.randomUUID(), employee = UUID.randomUUID();
        String dni = Fixture.nextDni();
        Timestamp now = Timestamp.from(clock.instant());
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                account.toString(), dni, dni, passwordHash(), now, now);
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                UUID.randomUUID().toString(), company.id().toString(), account.toString(), now);
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,10,TRUE,?,?)",
                employee.toString(), company.id().toString(), account.toString(), name, now, now);
        for (UUID site : sites) {
            jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)",
                    company.id().toString(), employee.toString(), site.toString(), now);
        }
        return new Person(employee, account, dni);
    }

    private ApiClient loggedIn(String actor, String dni) {
        ApiClient client = fixture.client(actor);
        client.login(dni, Fixture.PASSWORD).expect(200);
        return client;
    }

    /**
     * Several browsers of one account, logged in four at a time: every in-flight login reserves one of the DNI's five
     * attempts before BCrypt runs, so five or more correct logins at once answer 429 (reported as a finding, not tested here).
     */
    private List<ApiClient> logIn(String dni, int browsers) throws Exception {
        List<ApiClient> clients = new ArrayList<>();
        for (int first = 0; first < browsers; first += 4) {
            List<Callable<ApiClient>> logins = new ArrayList<>();
            for (int i = first; i < Math.min(browsers, first + 4); i++) {
                String actor = "browser-" + i + ":" + dni;
                logins.add(() -> loggedIn(actor, dni));
            }
            clients.addAll(together(logins));
        }
        return clients;
    }

    private UUID activeDeviation(UUID jornada, String type) {
        return UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND active AND type=?", String.class,
                jornada.toString(), type));
    }

    private static Instant at(LocalDate date, String time) {
        return Instant.parse(date + "T" + time + "Z");
    }

    private static Instant toInstant(Object value) {
        return value instanceof Timestamp ts ? ts.toInstant() : ((java.time.LocalDateTime) value).toInstant(java.time.ZoneOffset.UTC);
    }

    private JsonNode readJson(String raw) {
        try {
            return json.readTree(raw);
        } catch (java.io.IOException ex) {
            throw new java.io.UncheckedIOException(ex);
        }
    }

    private int count(String sql, Object... args) {
        Object[] values = new Object[args.length];
        for (int i = 0; i < args.length; i++) values[i] = args[i] instanceof UUID uuid ? uuid.toString() : args[i];
        return jdbc.queryForObject(sql, Integer.class, values);
    }
}
