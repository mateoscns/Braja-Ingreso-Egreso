package com.braja.fichaje.campaign;

import com.braja.fichaje.timekeeping.MarkScheduler;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * S73-S74: every malformed request is a 4xx problem, never a 5xx, and database contention surfaces as the documented
 * retryable 409 or the login's 503 AUTHENTICATION_UNAVAILABLE (CLAUDE.md rules 11, 21 and 26). The jornada is
 * 09:00-17:00 in Buenos Aires on 2027-03-01 (12:00Z-20:00Z) with a 10 minute tolerance.
 */
class ErrorContractSpecTest extends CampaignTestBase {
    private static final String BA = "America/Argentina/Buenos_Aires";
    private static final String JSON = "application/json";
    private static final String PROBLEM = "application/problem+json";
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    private static final Instant NINE_AM = Instant.parse("2027-03-01T12:00:00Z");

    @Autowired private MarkScheduler scheduler;

    /** {@code code} is the code the response carries today; null means today it has none (the S73 known defect). */
    private record Case(String name, int status, String code, ApiClient.Response response) { }

    private record Setup(Fixture.Company company, UUID site, Fixture.Employee ana, UUID jornada, UUID deviation) { }

    @AfterEach
    void noInvariantBrokenAndNoServerError() {
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
        // The only 5xx a test here may cause is the 503 that S74 itself demands from the login outage.
        assertEquals(List.of(), httpLog.serverErrors().stream()
                .filter(exchange -> !(exchange.status() == 503 && "AUTHENTICATION_UNAVAILABLE".equals(exchange.code()))).toList());
    }

    // ---------------------------------------------------------------- S73 malformed requests

    @Test
    void s73MalformedRequestsAreClientErrorsWithTheirStatusAndNeverA5xx() {
        List<String> failures = new ArrayList<>();
        for (Case sent : sendMalformedRequests(setUp())) {
            ApiClient.Response response = sent.response();
            if (response.status() != sent.status()) failures.add(sent.name() + ": expected " + sent.status() + " but got " + describe(response));
            else if (sent.code() != null && !sent.code().equals(response.code())) failures.add(sent.name() + ": code " + response.code());
        }
        assertEquals(List.of(), failures);
    }

    /** The statuses are pinned by the test above; only the missing problem body, code or traceId is the defect. */
    @Test
    @KnownDefect(issue = "TBD", reason = "Spring MVC errors (415, 405, 404, 406, missing body) fall through to Boot's /error page and the "
            + "security entry point writes problems without traceId")
    void s73EveryMalformedRequestIsAProblemWithCodeAndTraceId() {
        List<String> notProblems = new ArrayList<>();
        for (Case sent : sendMalformedRequests(setUp())) {
            ApiClient.Response response = sent.response();
            String contentType = response.header("Content-Type");
            boolean problem = contentType != null && contentType.startsWith(PROBLEM);
            boolean coded = response.code() != null && !response.code().isBlank();
            boolean traced = response.body().hasNonNull("traceId");
            if (!problem || !coded || !traced) notProblems.add(sent.name() + ": " + describe(response));
        }
        assertEquals(List.of(), notProblems);
    }

    private List<Case> sendMalformedRequests(Setup setup) {
        ApiClient admin = setup.company().admin();
        ApiClient ana = setup.ana().client();
        ApiClient anonymous = fixture.client("anonymous");
        String token = admin.get("/api/v1/csrf").expect(200).body().get("token").asText();
        Map<String, String> csrf = Map.of("X-CSRF-TOKEN", token);
        String site = "{\"name\":\"Norte\",\"timeZone\":\"" + BA + "\"}";
        String random = UUID.randomUUID().toString();
        List<Case> cases = new ArrayList<>();

        // Wrong or missing Content-Type on a JSON route.
        cases.add(new Case("text/plain body", 415, null, admin.raw("POST", "/api/v1/sites", "text/plain", site, csrf)));
        cases.add(new Case("form-urlencoded body", 415, null,
                admin.raw("POST", "/api/v1/sites", "application/x-www-form-urlencoded", "name=Norte&timeZone=" + BA, csrf)));
        cases.add(new Case("body without Content-Type", 415, null, admin.raw("POST", "/api/v1/sites", null, site, csrf)));
        cases.add(new Case("JSON route without body", 400, null, admin.raw("POST", "/api/v1/sites", JSON, null, csrf)));
        cases.add(new Case("empty JSON object", 422, "VALIDATION_ERROR", admin.raw("POST", "/api/v1/sites", JSON, "{}", csrf)));

        // Unknown enum values.
        cases.add(new Case("unknown mark action", 422, "VALIDATION_ERROR", ana.mark(setup.jornada(), "TELEPORT", UUID.randomUUID())));
        cases.add(new Case("lower-case mark action", 422, "VALIDATION_ERROR", ana.mark(setup.jornada(), "ingreso", UUID.randomUUID())));
        cases.add(new Case("unknown motive category", 422, "VALIDATION_ERROR", ana.put("/api/v1/deviations/" + setup.deviation() + "/motive",
                Map.of("category", "VACACIONES", "text", "Something happened"))));
        cases.add(new Case("unknown classification", 422, "VALIDATION_ERROR",
                admin.put("/api/v1/admin/deviations/" + setup.deviation() + "/classification", Map.of("classification", "PERDONADO"))));
        cases.add(new Case("unknown location source", 422, "VALIDATION_ERROR", admin.put("/api/v1/sites/" + setup.site() + "/location",
                Map.of("latitude", -34.6, "longitude", -58.4, "geofenceRadiusMeters", 100, "locationSource", "GPS"))));

        // Ids and query parameters that do not parse.
        // CHAR: a path id or query parameter that does not parse is 422 VALIDATION_ERROR, not 400 or 404 — confirm with Mateo.
        cases.add(new Case("path id not a UUID (GET)", 422, "VALIDATION_ERROR", admin.get("/api/v1/jornadas/not-a-uuid")));
        cases.add(new Case("path id not a UUID (POST)", 422, "VALIDATION_ERROR",
                admin.post("/api/v1/admin/marks/not-a-uuid/void", Map.of("reason", "typo"))));
        cases.add(new Case("query limit not a number", 422, "VALIDATION_ERROR", admin.get("/api/v1/deviations?limit=abc")));
        cases.add(new Case("query date not a date", 422, "VALIDATION_ERROR", admin.get("/api/v1/deviations?from=yesterday&to=today")));
        cases.add(new Case("problem asked for as HTML", 422, "VALIDATION_ERROR",
                admin.raw("GET", "/api/v1/jornadas/not-a-uuid", null, null, Map.of("Accept", "text/html"))));

        // Wrong method, unknown route, unacceptable representation.
        cases.add(new Case("DELETE on a collection", 405, null, admin.delete("/api/v1/sites")));
        cases.add(new Case("GET on a PUT-only route", 405, null, admin.get("/api/v1/session/password")));
        cases.add(new Case("PATCH on a GET-only route", 405, null, admin.patch("/api/v1/jornadas/" + random, Map.of("state", "EGRESADA"))));
        cases.add(new Case("unknown route", 404, null, admin.get("/api/v1/does-not-exist")));
        cases.add(new Case("trailing slash", 404, null, admin.get("/api/v1/sites/")));
        cases.add(new Case("unknown route, anonymous", 401, "UNAUTHORIZED", anonymous.get("/api/v1/does-not-exist")));
        cases.add(new Case("XML asked for", 406, null, admin.raw("GET", "/api/v1/sites", null, null, Map.of("Accept", "application/xml"))));
        return cases;
    }

    // ---------------------------------------------------------------- S74 lock failure and login outage

    /**
     * A real InnoDB deadlock: a heavier transaction holds the jornada row while the mark request holds the account and
     * membership rows and waits for the jornada; asking for the account closes the cycle and InnoDB rolls back the lighter
     * one, the request. The 50 s lock wait timeout path (also PessimisticLockingFailureException) is not reachable inside
     * the 30 s HTTP timeout without changing a global MySQL setting.
     */
    @Test
    void s74ADeadlockedMarkIsARetryable409AndItsRetrySucceeds() throws Exception {
        Setup setup = setUp();
        clock.set(NINE_AM);
        UUID key = UUID.randomUUID();
        CompletableFuture<ApiClient.Response> mark;
        try (Connection holder = holderConnection()) {
            try {
                addBallast(holder);
                lockRow(holder, "SELECT id FROM jornadas WHERE id=? FOR UPDATE", setup.jornada());
                mark = CompletableFuture.supplyAsync(() -> setup.ana().client().mark(setup.jornada(), "INGRESO", key));
                awaitStatementWaiting("%FROM jornadas WHERE id='" + setup.jornada() + "'%FOR UPDATE%");
                // Closes the cycle; InnoDB picks the request as the victim, so this returns once it rolled back.
                lockRow(holder, "SELECT id FROM accounts WHERE id=? FOR UPDATE", setup.ana().accountId());
            } finally {
                holder.rollback();
            }
        }

        ApiClient.Response response = mark.get(30, TimeUnit.SECONDS);
        assertEquals(409, response.status(), response.raw());
        assertEquals("RETRYABLE_TRANSACTION_CONFLICT", response.code());
        assertEquals("1", response.header("Retry-After"));
        assertTrue(response.header("Content-Type").startsWith(PROBLEM), response.header("Content-Type"));
        assertNotNull(response.body().get("traceId"));
        assertEquals(0, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", setup.jornada()));
        assertEquals(0, count("SELECT COUNT(*) FROM mark_idempotency WHERE idempotency_key=?", key));

        // Retryable means it: the same request with the same key now succeeds once.
        setup.ana().client().mark(setup.jornada(), "INGRESO", key).expect(201);
        assertEquals("EN_CURSO", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, setup.jornada().toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", setup.jornada()));
    }

    /**
     * The login's own database statement fails (KILL QUERY on the throttle reservation, as in a failover or an operator
     * kill), without stopping the container or touching global settings: 503 AUTHENTICATION_UNAVAILABLE, nothing counted.
     */
    @Test
    void s74ADatabaseFailureDuringLoginIs503AndCountsNoAttempt() throws Exception {
        Fixture.Company company = fixture.company("Caida");
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(fixture.site(company, "Centro", BA)), 10);
        assertEquals("UNAUTHORIZED", fixture.client("typo").login(ana.dni(), "wrong-password").expect(401).code());
        assertEquals(1, count("SELECT COUNT(*) FROM login_throttles WHERE failed_attempts=1"));

        CompletableFuture<ApiClient.Response> login;
        try (Connection holder = holderConnection()) {
            try {
                holder.createStatement().executeQuery("SELECT dni_hash FROM login_throttles FOR UPDATE").close();
                ApiClient phone = fixture.client("ana-phone");
                login = CompletableFuture.supplyAsync(() -> phone.login(ana.dni(), Fixture.PASSWORD));
                long waiting = awaitStatementWaiting("INSERT INTO login_throttles%");
                jdbc.execute("KILL QUERY " + waiting);
            } finally {
                holder.rollback();
            }
        }

        ApiClient.Response response = login.get(30, TimeUnit.SECONDS);
        assertEquals(503, response.status(), response.raw());
        assertEquals("AUTHENTICATION_UNAVAILABLE", response.code());
        assertTrue(response.header("Content-Type").startsWith(PROBLEM), response.header("Content-Type"));
        assertNotNull(response.body().get("traceId"));
        assertEquals(1, count("SELECT COUNT(*) FROM login_throttles WHERE failed_attempts=1"), "the outage must not count an attempt");
        assertEquals(0, count("SELECT COUNT(*) FROM login_ip_throttles WHERE failed_attempts > 1"));

        fixture.client("ana-again").login(ana.dni(), Fixture.PASSWORD).expect(200);
        assertEquals(0, count("SELECT COUNT(*) FROM login_throttles"));
    }

    // ---------------------------------------------------------------- helpers

    private Setup setUp() {
        Fixture.Company company = fixture.company("Errores");
        UUID site = fixture.site(company, "Centro", BA);
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        UUID template = fixture.template(company, site, "Manana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, template);
        clock.set(Instant.parse("2027-03-01T12:11:00Z"));
        scheduler.createDueAbsences();
        UUID deviation = UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND active=TRUE",
                String.class, jornada.toString()));
        return new Setup(company, site, ana, jornada, deviation);
    }

    /** A connection outside the pool, so holding its locks never starves the application. */
    private static Connection holderConnection() throws SQLException {
        Connection connection = DriverManager.getConnection(SharedMySql.jdbcUrl(), SharedMySql.MYSQL.getUsername(), SharedMySql.MYSQL.getPassword());
        connection.setAutoCommit(false);
        return connection;
    }

    /** 200 uncommitted rows make the holder the heavier transaction, so InnoDB never picks it as the deadlock victim. */
    private static void addBallast(Connection holder) throws SQLException {
        try (PreparedStatement insert = holder.prepareStatement("INSERT INTO login_ip_throttles(ip_hash,window_started_at,failed_attempts,"
                + "locked_until,updated_at) VALUES(?,'2027-01-01 00:00:00',0,NULL,'2027-01-01 00:00:00')")) {
            for (int row = 0; row < 200; row++) {
                byte[] hash = new byte[32];
                ThreadLocalRandom.current().nextBytes(hash);
                insert.setString(1, HexFormat.of().formatHex(hash));
                insert.addBatch();
            }
            insert.executeBatch();
        }
    }

    private static void lockRow(Connection holder, String sql, UUID id) throws SQLException {
        try (PreparedStatement select = holder.prepareStatement(sql)) {
            select.setString(1, id.toString());
            select.executeQuery().close();
        }
    }

    /** Waits until another connection of the application's MySQL user is executing a statement that matches. */
    private long awaitStatementWaiting(String pattern) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
        while (System.nanoTime() < deadline) {
            List<Long> ids = jdbc.queryForList("SELECT id FROM information_schema.PROCESSLIST WHERE id <> CONNECTION_ID() AND info LIKE ?",
                    Long.class, pattern);
            if (!ids.isEmpty()) return ids.getFirst();
            Thread.sleep(20);
        }
        return fail("no statement like " + pattern + " started waiting within 15 s");
    }

    private int count(String sql, Object... ids) {
        Object[] args = new Object[ids.length];
        for (int index = 0; index < ids.length; index++) args[index] = ids[index].toString();
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private static String describe(ApiClient.Response response) {
        String raw = response.raw() == null ? "" : response.raw().replaceAll("\\s+", " ");
        return response.status() + " " + response.header("Content-Type") + " " + (raw.length() > 140 ? raw.substring(0, 140) + "…" : raw);
    }
}
