package com.braja.fichaje.campaign;

import com.braja.fichaje.timekeeping.MarkScheduler;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.IntFunction;
import java.util.function.ToIntFunction;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S66-S67: spam on the employee's write endpoints, and the number of SQL statements a listing runs as its rows grow
 * (CLAUDE.md rule 17). Statements are counted by {@link StatementCounter}, leaving out Spring Session's own SPRING_SESSION*
 * work; the assertion is that a listing runs the same statements with 1 row and with 30.
 */
class QueryCountSpecTest extends CampaignTestBase {
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    /** 09:00 in Buenos Aires: the scheduled start of the template on DAY. */
    private static final Instant START = Instant.parse("2027-03-01T12:00:00Z");
    private static final int MANY = 30;
    private static final List<String> ACTIONS = List.of(
            "INGRESO", "SALIDA_DESAYUNO", "VUELTA_DESAYUNO", "SALIDA_ALMUERZO", "VUELTA_ALMUERZO", "EGRESO");
    private static final List<String> MOTIVE_CATEGORIES = List.of("TRANSPORTE", "EMERGENCIA", "OTRA");

    @Autowired private StatementCounter counter;
    @Autowired private MarkScheduler scheduler;

    private Fixture.Company company;
    private UUID site;

    /** Statements a listing ran and the rows it returned, at one row and at {@link #MANY} rows. */
    private record Growth(int statementsAtOne, int statementsAtMany, int sizeAtOne, int sizeAtMany) {
        String describe(String endpoint) {
            return endpoint + " ran " + statementsAtOne + " statements for " + sizeAtOne + " row(s) and "
                    + statementsAtMany + " for " + sizeAtMany;
        }
    }

    private record Measure(int statements, int size) { }

    @BeforeEach
    void company() {
        company = fixture.company("Consultas");
        site = fixture.site(company, "Centro", "America/Argentina/Buenos_Aires");
    }

    @AfterEach
    void noServerErrorAndInvariantsHold() {
        counter.stop();
        assertEquals(List.of(), httpLog.serverErrors());
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
    }

    // S66 ------------------------------------------------------------------------------------------------------------

    @Test
    void s66AThousandMarkRequestsInOneSimulatedMinuteAnswerOnlyExpectedCodesAndCreateNoExtraMark() throws Exception {
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, morning("Mañana"));
        clock.set(START);
        Duration step = Duration.ofMillis(60); // 1000 requests x 60 ms = one simulated minute
        List<ApiClient.Response> all = new ArrayList<>();

        // Phase 1: 200 INGRESO on 4 threads; every 4th request reuses one of five "retry" keys.
        List<UUID> retryKeys = List.of(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        UUID[] keys = new UUID[200];
        for (int i = 0; i < keys.length; i++) keys[i] = i % 4 == 0 ? retryKeys.get(i / 4 % 5) : UUID.randomUUID();
        List<ApiClient.Response> burst = burst(4, keys.length, i -> {
            clock.advance(step);
            return ana.client().mark(jornada, "INGRESO", keys[i]);
        });
        all.addAll(burst);
        Map<UUID, String> accepted = new HashMap<>(); // idempotency key -> mark id
        for (int i = 0; i < burst.size(); i++) {
            if (burst.get(i).status() == 201) accepted.put(keys[i], burst.get(i).body().get("id").asText());
        }
        assertEquals(1, accepted.size(), "exactly one INGRESO wins the burst");
        UUID winner = accepted.keySet().iterator().next();
        for (int i = 0; i < burst.size(); i++) {
            ApiClient.Response response = burst.get(i);
            if (response.status() == 200) {
                assertEquals(winner, keys[i], "only the winning key replays");
                assertEquals(accepted.get(winner), response.body().get("id").asText());
            } else if (response.status() != 201) {
                assertEquals(409, response.status(), response.raw());
                assertEquals("INVALID_MARK_TRANSITION", response.code());
            }
        }

        // Phase 2: 800 sequential requests mixing fresh keys, retries, reused keys with another action and bad actions.
        List<String> done = new ArrayList<>(List.of("INGRESO"));
        Map<UUID, String> actionOfKey = new LinkedHashMap<>();
        for (UUID key : keys) actionOfKey.put(key, "INGRESO");
        Random random = new Random(66);
        for (int i = 0; i < 800; i++) {
            clock.advance(step);
            double r = random.nextDouble();
            ApiClient.Response response;
            if (r < 0.10) {
                response = ana.client().mark(jornada, "TELEPORT", UUID.randomUUID());
                assertEquals(422, response.status(), "request " + i + ": " + response.raw());
                assertEquals("VALIDATION_ERROR", response.code());
            } else if (r < 0.20) {
                UUID key = new ArrayList<>(accepted.keySet()).get(random.nextInt(accepted.size()));
                String other = ACTIONS.get((ACTIONS.indexOf(actionOfKey.get(key)) + 1 + random.nextInt(5)) % ACTIONS.size());
                response = ana.client().mark(jornada, other, key);
                assertEquals(409, response.status(), "request " + i + ": " + response.raw());
                assertEquals("IDEMPOTENCY_CONFLICT", response.code());
            } else {
                boolean retry = r < 0.40;
                UUID key = retry ? new ArrayList<>(actionOfKey.keySet()).get(random.nextInt(actionOfKey.size())) : UUID.randomUUID();
                String action = retry ? actionOfKey.get(key) : random.nextInt(100) < 3 ? "EGRESO" : ACTIONS.get(random.nextInt(5));
                actionOfKey.putIfAbsent(key, action);
                response = ana.client().mark(jornada, action, key);
                String context = "request " + i + " " + action + " after " + done + ": " + response.raw();
                if (accepted.containsKey(key)) {
                    assertEquals(200, response.status(), context);
                    assertEquals(accepted.get(key), response.body().get("id").asText(), context);
                } else if (allowed(done, action)) {
                    assertEquals(201, response.status(), context);
                    done.add(action);
                    accepted.put(key, response.body().get("id").asText());
                } else {
                    assertEquals(409, response.status(), context);
                    assertEquals("INVALID_MARK_TRANSITION", response.code(), context);
                }
            }
            all.add(response);
        }

        assertEquals(1000, all.size());
        assertTrue(!clock.instant().isAfter(START.plus(Duration.ofMinutes(1))), "the spam fits in one simulated minute");
        assertTrue(all.stream().allMatch(response -> Set.of(200, 201, 409, 422).contains(response.status())));
        assertEquals(done.size(), all.stream().filter(response -> response.status() == 201).count());
        assertEquals(done, jdbc.queryForList("SELECT action FROM mark_events WHERE jornada_id = ? ORDER BY sequence_number",
                String.class, jornada.toString()));
        Map<UUID, String> stored = new HashMap<>();
        jdbc.query("SELECT idempotency_key, mark_id FROM mark_idempotency WHERE account_id = ?",
                rs -> { stored.put(UUID.fromString(rs.getString(1)), rs.getString(2)); }, ana.accountId().toString());
        assertEquals(accepted, stored, "one idempotency row per accepted mark, and only those");
        assertEquals(stateAfter(done), jdbc.queryForObject("SELECT state FROM jornadas WHERE id = ?", String.class, jornada.toString()));
        System.out.printf("S66 marks: %d accepted %s out of 1000 requests%n", done.size(), done);
    }

    @Test
    void s66TwoHundredConcurrentLocationPostsOnOneMarkAcceptExactlyOneAndKeepIt() throws Exception {
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, morning("Mañana"));
        clock.set(START);
        UUID mark = ana.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201).id();

        List<ApiClient.Response> responses = burst(4, 200, i -> {
            clock.advance(Duration.ofMillis(10)); // 2 s in all: well inside the 30 s location window
            double latitude = i % 10 == 0 ? 91.0 : -34.6 - i * 0.0001;
            return ana.client().post("/api/v1/marks/" + mark + "/location",
                    Map.of("latitude", latitude, "longitude", -58.38, "accuracyMeters", 15.0));
        });

        Integer winner = null;
        for (int i = 0; i < responses.size(); i++) {
            ApiClient.Response response = responses.get(i);
            if (i % 10 == 0) {
                assertEquals(422, response.status(), response.raw());
                assertEquals("VALIDATION_ERROR", response.code());
            } else if (response.status() == 202) {
                assertNull(winner,"a second location was accepted at request " + i);
                winner = i;
            } else {
                assertEquals(409, response.status(), response.raw());
                assertEquals("LOCATION_ALREADY_FINAL", response.code());
            }
        }
        assertTrue(winner != null, "one location is accepted");
        Map<String, Object> row = jdbc.queryForMap("SELECT location_status, latitude FROM mark_events WHERE id = ?", mark.toString());
        assertEquals("RECIBIDA", row.get("location_status"));
        assertEquals(-34.6 - winner * 0.0001, ((Number) row.get("latitude")).doubleValue(), 1e-6);
    }

    @Test
    void s66MotiveSpamOnOneDeviationKeepsOneCoherentMotiveAndOneAuditPerAcceptedPut() throws Exception {
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, morning("Mañana"));
        clock.set(START.plus(Duration.ofMinutes(20)));
        ana.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);
        String deviation = jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id = ? AND active AND type = 'LLEGADA_TARDE'",
                String.class, jornada.toString());
        String path = "/api/v1/deviations/" + deviation + "/motive";

        List<ApiClient.Response> open = burst(4, 100, i -> {
            clock.advance(Duration.ofMillis(10));
            String category = i % 10 == 0 ? "BOGUS" : MOTIVE_CATEGORIES.get(i % 3);
            return ana.client().put(path, Map.of("category", category, "text", "spam " + i));
        });
        int acceptedPuts = 0;
        for (int i = 0; i < open.size(); i++) {
            ApiClient.Response response = open.get(i);
            if (i % 10 == 0) {
                assertEquals(422, response.status(), response.raw());
                assertEquals("VALIDATION_ERROR", response.code());
            } else {
                assertEquals(200, response.status(), response.raw());
                acceptedPuts++;
            }
        }
        Map<String, Object> row = motiveRow(deviation);
        int last = Integer.parseInt(((String) row.get("motive_text")).substring("spam ".length()));
        assertTrue(last % 10 != 0, "the stored motive is one of the accepted ones");
        assertEquals(MOTIVE_CATEGORIES.get(last % 3), row.get("motive_category"), "category and text come from the same request");
        assertEquals(Map.of("CREATED", 1, "MOTIVE_SUBMITTED", 1, "MOTIVE_CORRECTED", acceptedPuts - 1), auditCounts(deviation));

        company.admin().put("/api/v1/admin/deviations/" + deviation + "/classification", Map.of("classification", "JUSTIFICADO")).expect(200);
        List<ApiClient.Response> locked = burst(2, 40, i -> ana.client().put(path, Map.of("category", "OTRA", "text", "late " + i)));

        assertTrue(locked.stream().allMatch(response -> response.status() == 409 && "MOTIVE_LOCKED".equals(response.code())));
        assertEquals(row, motiveRow(deviation));
        assertEquals("JUSTIFICADO", jdbc.queryForObject("SELECT classification FROM deviations WHERE id = ?", String.class, deviation));
        assertEquals(Map.of("CREATED", 1, "MOTIVE_SUBMITTED", 1, "MOTIVE_CORRECTED", acceptedPuts - 1, "CLASSIFICATION_CHANGED", 1),
                auditCounts(deviation));
    }

    // S67 ------------------------------------------------------------------------------------------------------------

    @Test
    void s67EmployeesListsEveryEmployee() {
        Growth growth = employeesGrowth();
        System.out.println("S67 " + growth.describe("GET /employees"));
        assertEquals(1, growth.sizeAtOne());
        assertEquals(MANY, growth.sizeAtMany());
    }

    @Test
    @KnownDefect(issue = "TBD", reason = "GET /employees reads the sites of each employee in its own query (OrganizationService.employeeView): N+1, CLAUDE.md rule 17.")
    void s67EmployeesRunsAConstantNumberOfStatements() {
        Growth growth = employeesGrowth();
        assertEquals(growth.statementsAtOne(), growth.statementsAtMany(), growth.describe("GET /employees"));
    }

    @Test
    void s67TemplatesListsEveryTemplate() {
        Growth growth = templatesGrowth();
        System.out.println("S67 " + growth.describe("GET /templates"));
        assertEquals(1, growth.sizeAtOne());
        assertEquals(MANY, growth.sizeAtMany());
    }

    @Test
    @KnownDefect(issue = "TBD", reason = "GET /templates reads the blocks of each template in its own query (OrganizationService.templateView): N+1, CLAUDE.md rule 17.")
    void s67TemplatesRunsAConstantNumberOfStatements() {
        Growth growth = templatesGrowth();
        assertEquals(growth.statementsAtOne(), growth.statementsAtMany(), growth.describe("GET /templates"));
    }

    @Test
    void s67MineListsEveryJornadaOfTheDay() {
        Growth growth = mineGrowth();
        System.out.println("S67 " + growth.describe("GET /jornadas/mine"));
        assertEquals(1, growth.sizeAtOne());
        assertEquals(MANY, growth.sizeAtMany());
    }

    @Test
    @KnownDefect(issue = "TBD", reason = "GET /jornadas/mine loads each jornada, the caller's employee id and its marks one jornada at a time (JornadaController.getJornada): N+1, CLAUDE.md rule 17.")
    void s67MineRunsAConstantNumberOfStatements() {
        Growth growth = mineGrowth();
        assertEquals(growth.statementsAtOne(), growth.statementsAtMany(), growth.describe("GET /jornadas/mine"));
    }

    @Test
    void s67RangeListingsRunTheSameStatementsWhateverTheRowCount() {
        UUID template = morning("Mañana");
        Map<String, ToIntFunction<JsonNode>> listings = new LinkedHashMap<>();
        listings.put("/api/v1/inbox", body -> body.get("items").size());
        listings.put("/api/v1/deviations", JsonNode::size);
        listings.put("/api/v1/jornadas?from=" + DAY + "&to=" + DAY, JsonNode::size);
        listings.put("/api/v1/jornadas?from=" + DAY + "&to=" + DAY + "&includeDetail=true", JsonNode::size);

        absentEmployees(1, template, START.plus(Duration.ofMinutes(11)));
        Map<String, Measure> atOne = new LinkedHashMap<>();
        listings.forEach((path, size) -> atOne.put(path, measure(company.admin(), path, size)));
        absentEmployees(MANY - 1, template, START.plus(Duration.ofMinutes(12)));

        List<String> growing = new ArrayList<>();
        listings.forEach((path, size) -> {
            Growth growth = growth(atOne.get(path), measure(company.admin(), path, size));
            System.out.println("S67 " + growth.describe("GET " + path));
            assertEquals(1, growth.sizeAtOne(), path);
            assertEquals(MANY, growth.sizeAtMany(), path);
            if (growth.statementsAtOne() != growth.statementsAtMany()) growing.add(growth.describe(path));
        });
        assertEquals(List.of(), growing);
    }

    // Helpers --------------------------------------------------------------------------------------------------------

    private Growth employeesGrowth() {
        cheapEmployees(1);
        Measure one = measure(company.admin(), "/api/v1/employees", JsonNode::size);
        cheapEmployees(MANY - 1);
        return growth(one, measure(company.admin(), "/api/v1/employees", JsonNode::size));
    }

    private Growth templatesGrowth() {
        morning("T00");
        Measure one = measure(company.admin(), "/api/v1/templates", JsonNode::size);
        for (int i = 1; i < MANY; i++) morning("T%02d".formatted(i));
        return growth(one, measure(company.admin(), "/api/v1/templates", JsonNode::size));
    }

    /** One employee with a jornada on DAY at each of 30 sites: the only way to give `mine` 30 active rows for one date. */
    private Growth mineGrowth() {
        List<UUID> sites = new ArrayList<>(List.of(site));
        for (int i = 1; i < MANY; i++) sites.add(fixture.site(company, "Sede %02d".formatted(i), "America/Argentina/Buenos_Aires"));
        Fixture.Employee ana = fixture.employee(company, "Ana", sites, 10);
        String path = "/api/v1/jornadas/mine?localDate=" + DAY;
        fixture.declare(company, ana.id(), site, DAY, morning("Mañana"));
        Measure one = measure(ana.client(), path, JsonNode::size);
        for (int i = 1; i < MANY; i++) {
            UUID template = fixture.template(company, sites.get(i), "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
            fixture.declare(company, ana.id(), sites.get(i), DAY, template);
        }
        return growth(one, measure(ana.client(), path, JsonNode::size));
    }

    /** Runs the GET once unmeasured (so the session is settled), then counts the statements of the second run. */
    private Measure measure(ApiClient client, String path, ToIntFunction<JsonNode> size) {
        client.get(path).expect(200);
        counter.start();
        ApiClient.Response response;
        List<String> statements;
        try {
            response = client.get(path).expect(200);
        } finally {
            statements = StatementCounter.withoutSessionStore(counter.stop());
        }
        return new Measure(statements.size(), size.applyAsInt(response.body()));
    }

    private static Growth growth(Measure one, Measure many) {
        return new Growth(one.statements(), many.statements(), one.size(), many.size());
    }

    /** {@code n} employees declared on DAY through the bulk endpoint, then left absent so each gets a SIN_INGRESO deviation. */
    private void absentEmployees(int n, UUID template, Instant absenceJobAt) {
        List<UUID> ids = cheapEmployees(n);
        company.admin().post("/api/v1/jornadas/bulk", Map.of("employeeIds", ids, "siteId", site, "from", DAY.toString(),
                "to", DAY.toString(), "weekdays", List.of(1), "templateId", template)).expect(200);
        clock.set(absenceJobAt);
        scheduler.createDueAbsences();
    }

    private UUID morning(String name) {
        return fixture.template(company, site, name, List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
    }

    /** Active employees of {@code site} inserted in SQL, without BCrypt: they never log in (idea from OrganizationSpecTest). */
    private List<UUID> cheapEmployees(int n) {
        Timestamp now = Timestamp.from(clock.instant());
        List<Object[]> accounts = new ArrayList<>(), memberships = new ArrayList<>(), employees = new ArrayList<>(), sites = new ArrayList<>();
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            String dni = Fixture.nextDni();
            String account = UUID.randomUUID().toString();
            UUID employee = UUID.randomUUID();
            ids.add(employee);
            accounts.add(new Object[] {account, dni, dni, "unused: this account never logs in", now, now});
            memberships.add(new Object[] {UUID.randomUUID().toString(), company.id().toString(), account, now});
            employees.add(new Object[] {employee.toString(), company.id().toString(), account, "Bulk " + dni, now, now});
            sites.add(new Object[] {company.id().toString(), employee.toString(), site.toString(), now});
        }
        jdbc.batchUpdate("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at)"
                + " VALUES(?,?,?,?,FALSE,TRUE,?,?)", accounts);
        jdbc.batchUpdate("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)", memberships);
        jdbc.batchUpdate("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at)"
                + " VALUES(?,?,?,?,10,TRUE,?,?)", employees);
        jdbc.batchUpdate("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)", sites);
        return ids;
    }

    /**
     * Independent oracle of docs/ESPECIFICACION.md ("Marcas"): INGRESO first; an open pause must be closed next; each
     * pause at most once; EGRESO only with no open pause; nothing after EGRESO.
     */
    private static boolean allowed(List<String> done, String action) {
        if (done.isEmpty()) return action.equals("INGRESO");
        if (done.contains("EGRESO")) return false;
        String last = done.getLast();
        if (last.startsWith("SALIDA_")) return action.equals("VUELTA_" + last.substring("SALIDA_".length()));
        if (action.startsWith("SALIDA_")) return !done.contains(action);
        return action.equals("EGRESO");
    }

    private static String stateAfter(List<String> done) {
        if (done.isEmpty()) return "NO_INGRESO";
        if (done.getLast().equals("EGRESO")) return "EGRESADA";
        return done.getLast().startsWith("SALIDA_") ? "PAUSA_ABIERTA" : "EN_CURSO";
    }

    private Map<String, Object> motiveRow(String deviation) {
        return jdbc.queryForMap("SELECT motive_category, motive_text, motive_created_at FROM deviations WHERE id = ?", deviation);
    }

    private Map<String, Integer> auditCounts(String deviation) {
        Map<String, Integer> counts = new HashMap<>();
        jdbc.query("SELECT change_type, COUNT(*) FROM deviation_audits WHERE deviation_id = ? GROUP BY change_type",
                rs -> { counts.put(rs.getString(1), rs.getInt(2)); }, deviation);
        return counts;
    }

    /** Sends {@code requests} requests from {@code threads} threads and returns the responses in request order. */
    private static <T> List<T> burst(int threads, int requests, IntFunction<T> request) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (int i = 0; i < requests; i++) {
                int index = i;
                futures.add(pool.submit(() -> request.apply(index)));
            }
            List<T> results = new ArrayList<>();
            for (Future<T> future : futures) results.add(future.get(60, TimeUnit.SECONDS));
            return results;
        } finally {
            pool.shutdownNow();
        }
    }
}
