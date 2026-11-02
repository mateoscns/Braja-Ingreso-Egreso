package com.braja.fichaje.campaign;

import com.braja.fichaje.timekeeping.MarkScheduler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.StringJoiner;
import java.util.TreeMap;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** S14-S21 and S23: login throttling, neutral errors, CSRF, session revocation, tenant isolation and hostile input. */
class AuthAbuseSpecTest extends CampaignTestBase {
    private static final String BA = "America/Argentina/Buenos_Aires";
    private static final String JSON = "application/json";
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    /** 09:00 in Buenos Aires on DAY. */
    private static final Instant NINE_AM = Instant.parse("2027-03-01T12:00:00Z");
    private static final Duration LOCK = Duration.ofMinutes(15);
    private static final String NEW_PASSWORD = "a-brand-new-password-5678";
    /** Rows that change on every request or login; everything else must stay byte-identical after a rejected call. */
    private static final Set<String> UNTRACKED = Set.of("spring_session", "spring_session_attributes", "login_throttles",
            "login_ip_throttles", "flyway_schema_history");

    @Autowired MarkScheduler scheduler;

    // ---------------------------------------------------------------- S14 DNI throttle

    @Test
    void s14FiveWrongPasswordsLockTheDniForExactlyFifteenSimulatedMinutes() throws Exception {
        Fixture.Company company = fixture.company("Candado");
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(fixture.site(company, "Centro", BA)), 10);
        Instant lockedAt = Instant.parse("2027-03-10T12:00:00Z");
        clock.set(lockedAt);
        ApiClient attacker = fixture.client("attacker");
        for (int attempt = 1; attempt <= 5; attempt++) {
            assertEquals("UNAUTHORIZED", attacker.login(ana.dni(), "wrong-password-" + attempt).expect(401).code());
        }

        // The lock is on the DNI: the right password from any other address is refused too.
        assertLocked(loginWithHeaders(Fixture.nextIp(), ana.dni(), Fixture.PASSWORD), "900");
        clock.set(lockedAt.plus(LOCK).minusNanos(1_000));
        assertLocked(loginWithHeaders(Fixture.nextIp(), ana.dni(), Fixture.PASSWORD), "1");
        clock.set(lockedAt.plus(LOCK));
        fixture.client("ana-phone").login(ana.dni(), Fixture.PASSWORD).expect(200);
        assertClean();
    }

    // CHAR: the 15-minute failure window is inclusive at its end, so when all five failures share one instant a wrong
    // password at the very instant the lock lifts locks the DNI again; one microsecond later it would not — confirm with Mateo.
    @Test
    void s14AWrongPasswordAtTheExactEdgeStillCountsInTheOldWindow() {
        Fixture.Company company = fixture.company("Borde");
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(fixture.site(company, "Centro", BA)), 10);
        Instant lockedAt = Instant.parse("2027-03-10T12:00:00Z");
        clock.set(lockedAt);
        ApiClient attacker = fixture.client("attacker");
        for (int attempt = 1; attempt <= 5; attempt++) attacker.login(ana.dni(), "wrong-password").expect(401);

        clock.set(lockedAt.plus(LOCK));
        attacker.login(ana.dni(), "wrong-password").expect(401);
        assertEquals("TOO_MANY_REQUESTS", fixture.client("ana").login(ana.dni(), Fixture.PASSWORD).expect(429).code());

        clock.set(lockedAt.plus(LOCK).plus(LOCK));
        attacker.login(ana.dni(), "wrong-password").expect(401);
        fixture.client("ana").login(ana.dni(), Fixture.PASSWORD).expect(200);
        assertClean();
    }

    // ---------------------------------------------------------------- S15 IP throttle

    /**
     * Only 127.0.0.1 can reach the test server and it is the trusted proxy, so "an untrusted peer's X-Forwarded-For"
     * is reached as the proxy chain it produces: the client's own header ends up on the left and is never used.
     */
    @Test
    void s15HundredFailuresLockOneClientAddressAndOnlyThatOne() throws Exception {
        Fixture.Company company = fixture.company("Proxy");
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(fixture.site(company, "Centro", BA)), 10);
        String attackerIp = "203.0.113.10";
        String spoofedIp = "192.0.2.77";
        ApiClient direct = new ApiClient(baseUrl(), json, httpLog, "attacker", attackerIp);
        ApiClient spoofing = new ApiClient(baseUrl(), json, httpLog, "attacker-spoofing", spoofedIp + ", " + attackerIp);
        for (int attempt = 0; attempt < 100; attempt++) {
            (attempt % 2 == 0 ? direct : spoofing).login(Fixture.nextDni(), "wrong-password").expect(401);
        }

        assertEquals(1, count("SELECT COUNT(*) FROM login_ip_throttles"), "the spoofed left-most address got its own counter");
        assertLocked(loginWithHeaders(attackerIp, ana.dni(), Fixture.PASSWORD), "900");
        spoofing.login(ana.dni(), Fixture.PASSWORD).expect(429);
        new ApiClient(baseUrl(), json, httpLog, "spoofed-address", spoofedIp).login(ana.dni(), Fixture.PASSWORD).expect(200);
        fixture.client("same-shop-other-ip").login(ana.dni(), Fixture.PASSWORD).expect(200);

        clock.advance(LOCK);
        direct.login(ana.dni(), Fixture.PASSWORD).expect(200);
        assertClean();
    }

    // CHAR: a trusted proxy that sends no usable client address gets 422 VALIDATION_ERROR (a proxy fault reported as a
    // client validation error) — confirm with Mateo.
    @Test
    void s15ATrustedProxyWithoutAUsableClientAddressIsRejectedBeforeAnythingIsCounted() {
        ApiClient brokenProxy = new ApiClient(baseUrl(), json, httpLog, "broken-proxy", "not-an-address");
        ApiClient.Response response = brokenProxy.login(Fixture.nextDni(), "whatever-password");
        assertEquals(422, response.status());
        assertEquals("VALIDATION_ERROR", response.code());
        assertEquals(0, count("SELECT COUNT(*) FROM login_throttles") + count("SELECT COUNT(*) FROM login_ip_throttles"));
    }

    // ---------------------------------------------------------------- S16 neutral login

    @Test
    void s16EveryLoginFailureLooksTheSame() {
        Fixture.Company company = fixture.company("Neutral");
        UUID site = fixture.site(company, "Centro", BA);
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        Fixture.Employee beto = fixture.employee(company, "Beto", List.of(site), 10);
        Fixture.Employee caro = fixture.employee(company, "Caro", List.of(site), 10);
        company.admin().patch("/api/v1/employees/" + beto.id(), Map.of("active", false)).expect(200);
        jdbc.update("UPDATE accounts SET active = FALSE WHERE id = ?", caro.accountId().toString());

        List<ApiClient.Response> failures = List.of(
                fixture.client("unknown-dni").login(Fixture.nextDni(), Fixture.PASSWORD),
                fixture.client("wrong-password").login(ana.dni(), "wrong-password-1234"),
                fixture.client("no-membership").login(beto.dni(), Fixture.PASSWORD),
                fixture.client("disabled-account").login(caro.dni(), Fixture.PASSWORD));

        JsonNode reference = withoutTraceId(failures.getFirst());
        List<String> traceIds = new ArrayList<>();
        for (ApiClient.Response failure : failures) {
            assertEquals(401, failure.status(), failure.raw());
            assertEquals("UNAUTHORIZED", failure.code());
            assertEquals(reference, withoutTraceId(failure));
            traceIds.add(UUID.fromString(failure.body().get("traceId").asText()).toString());
        }
        assertEquals(4, Set.copyOf(traceIds).size(), "traceId must be random per response");
        assertClean();
    }

    // ---------------------------------------------------------------- S17 CSRF

    @Test
    void s17EveryMutationWithoutAValidCsrfTokenIsRejectedAndWritesNothing() {
        Fixture.Company company = fixture.company("Csrf");
        fixture.employee(company, "Ana", List.of(fixture.site(company, "Centro", BA)), 10);
        Map<String, Object> before = fingerprint();
        ApiClient anonymous = fixture.client("anonymous");
        String id = UUID.randomUUID().toString();
        List<String[]> mutations = List.of(new String[] {"POST", "/api/v1/session"}, new String[] {"DELETE", "/api/v1/session"},
                new String[] {"PUT", "/api/v1/session/password"}, new String[] {"PUT", "/api/v1/companies/active"},
                new String[] {"POST", "/api/v1/sites"}, new String[] {"PUT", "/api/v1/sites/" + id + "/location"},
                new String[] {"POST", "/api/v1/employees"}, new String[] {"PATCH", "/api/v1/employees/" + id},
                new String[] {"POST", "/api/v1/employees/" + id + "/password-reset"},
                new String[] {"POST", "/api/v1/employees/" + id + "/template-assignments"},
                new String[] {"POST", "/api/v1/templates"}, new String[] {"PATCH", "/api/v1/templates/" + id},
                new String[] {"POST", "/api/v1/jornadas"}, new String[] {"POST", "/api/v1/jornadas/bulk"},
                new String[] {"POST", "/api/v1/jornadas/" + id + "/marks"}, new String[] {"POST", "/api/v1/marks/" + id + "/location"},
                new String[] {"POST", "/api/v1/admin/jornadas/" + id + "/forgotten-marks"},
                new String[] {"POST", "/api/v1/admin/marks/" + id + "/correction"}, new String[] {"POST", "/api/v1/admin/marks/" + id + "/void"},
                new String[] {"POST", "/api/v1/admin/jornadas/" + id + "/cancellation"},
                new String[] {"PUT", "/api/v1/deviations/" + id + "/motive"},
                new String[] {"PUT", "/api/v1/admin/deviations/" + id + "/classification"},
                new String[] {"PUT", "/api/v1/push/subscriptions"}, new String[] {"POST", "/api/v1/push/subscriptions/current"},
                new String[] {"DELETE", "/api/v1/push/subscriptions/" + id});

        List<String> failures = new ArrayList<>();
        for (String[] route : mutations) {
            expectRejection(failures, "anonymous", anonymous.raw(route[0], route[1], JSON, "{}", Map.of()), 401, "SESSION_EXPIRED");
            expectRejection(failures, "admin without token", company.admin().raw(route[0], route[1], JSON, "{}", Map.of()), 403, "FORBIDDEN");
            expectRejection(failures, "admin with forged token",
                    company.admin().raw(route[0], route[1], JSON, "{}", Map.of("X-CSRF-TOKEN", "forged-token")), 403, "FORBIDDEN");
        }
        assertEquals(List.of(), failures);
        assertEquals(before, fingerprint());
        company.admin().get("/api/v1/sites").expect(200);
        assertClean();
    }

    @Test
    void s17ATokenAloneGrantsNothingAndTheTokenDiesAtLoginAndLogout() {
        Fixture.Company company = fixture.company("Token");
        String body = "{\"companyId\":\"" + company.id() + "\"}";
        ApiClient browser = fixture.client("browser");
        String preLogin = browser.get("/api/v1/csrf").expect(200).body().get("token").asText();
        assertEquals("UNAUTHORIZED", browser.raw("PUT", "/api/v1/companies/active", JSON, body, Map.of("X-CSRF-TOKEN", preLogin)).expect(401).code());

        String login = "{\"dni\":\"" + company.adminDni() + "\",\"password\":\"" + Fixture.PASSWORD + "\"}";
        browser.raw("POST", "/api/v1/session", JSON, login, Map.of("X-CSRF-TOKEN", preLogin)).expect(200);
        assertEquals("FORBIDDEN", browser.raw("PUT", "/api/v1/companies/active", JSON, body, Map.of("X-CSRF-TOKEN", preLogin)).expect(403).code());
        String live = browser.get("/api/v1/csrf").expect(200).body().get("token").asText();
        browser.raw("PUT", "/api/v1/companies/active", JSON, body, Map.of("X-CSRF-TOKEN", live)).expect(200);

        browser.raw("DELETE", "/api/v1/session", null, null, Map.of("X-CSRF-TOKEN", live)).expect(204);
        assertEquals("SESSION_EXPIRED", browser.raw("PUT", "/api/v1/companies/active", JSON, body, Map.of("X-CSRF-TOKEN", live)).expect(401).code());
        browser.get("/api/v1/sites").expect(401);
        assertClean();
    }

    // ---------------------------------------------------------------- S18 password change and reset

    @Test
    void s18ChangingThePasswordClosesTheOtherSessionsOfThatAccountOnly() {
        Fixture.Company company = fixture.company("Clave");
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(fixture.site(company, "Centro", BA)), 10);
        ApiClient tablet = fixture.client("ana-tablet");
        tablet.login(ana.dni(), Fixture.PASSWORD).expect(200);

        ana.client().put("/api/v1/session/password", Map.of("currentPassword", Fixture.PASSWORD, "newPassword", NEW_PASSWORD)).expect(204);

        ana.client().get("/api/v1/sites").expect(200);
        assertEquals("UNAUTHORIZED", tablet.get("/api/v1/sites").expect(401).code());
        company.admin().get("/api/v1/sites").expect(200);
        tablet.login(ana.dni(), Fixture.PASSWORD).expect(401);
        tablet.login(ana.dni(), NEW_PASSWORD).expect(200);
        assertClean();
    }

    @Test
    void s18TheAdminResetClosesEverySessionLiftsTheDniLockAndForcesAPasswordChange() {
        Fixture.Company company = fixture.company("Reset");
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(fixture.site(company, "Centro", BA)), 10);
        ApiClient tablet = fixture.client("ana-tablet");
        tablet.login(ana.dni(), Fixture.PASSWORD).expect(200);
        ApiClient attacker = fixture.client("attacker");
        for (int attempt = 0; attempt < 5; attempt++) attacker.login(ana.dni(), "wrong-password").expect(401);
        fixture.client("ana-new-phone").login(ana.dni(), Fixture.PASSWORD).expect(429);

        String temporary = company.admin().post("/api/v1/employees/" + ana.id() + "/password-reset", Map.of())
                .expect(200).body().get("temporaryPassword").asText();
        assertTrue(temporary.length() >= 12);

        assertEquals("UNAUTHORIZED", ana.client().get("/api/v1/sites").expect(401).code());
        assertEquals("UNAUTHORIZED", tablet.get("/api/v1/sites").expect(401).code());
        fixture.client("old-password").login(ana.dni(), Fixture.PASSWORD).expect(401);
        ApiClient phone = fixture.client("ana-after-reset");
        assertTrue(phone.login(ana.dni(), temporary).expect(200).body().get("mustChangePassword").asBoolean());
        assertEquals("PASSWORD_CHANGE_REQUIRED", phone.get("/api/v1/sites").expect(403).code());
        assertEquals("PASSWORD_CHANGE_REQUIRED", phone.get("/api/v1/jornadas/mine?localDate=" + DAY).expect(403).code());

        phone.put("/api/v1/session/password", Map.of("currentPassword", temporary, "newPassword", NEW_PASSWORD)).expect(204);
        phone.get("/api/v1/sites").expect(200);
        assertFalse(phone.get("/api/v1/session").expect(200).body().get("mustChangePassword").asBoolean());
        assertClean();
    }

    // ---------------------------------------------------------------- S19 deactivation mid-jornada

    @Test
    void s19DeactivationMidJornadaCutsTheLiveSessionBlocksLoginAndTheJobsSkipThePerson() {
        Fixture.Company company = fixture.company("Baja");
        UUID site = fixture.site(company, "Centro", BA);
        UUID template = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        Fixture.Employee beto = fixture.employee(company, "Beto", List.of(site), 10);
        UUID anaToday = fixture.declare(company, ana.id(), site, DAY, template);
        fixture.declare(company, ana.id(), site, DAY.plusDays(1), template);
        UUID betoToday = fixture.declare(company, beto.id(), site, DAY, template);
        fixture.declare(company, beto.id(), site, DAY.plusDays(1), template);
        clock.set(NINE_AM.plus(Duration.ofMinutes(5)));
        ana.client().mark(anaToday, "INGRESO", UUID.randomUUID()).expect(201);
        beto.client().mark(betoToday, "INGRESO", UUID.randomUUID()).expect(201);

        company.admin().patch("/api/v1/employees/" + ana.id(), Map.of("active", false)).expect(200);

        assertEquals("FORBIDDEN", ana.client().mark(anaToday, "SALIDA_DESAYUNO", UUID.randomUUID()).expect(403).code());
        ana.client().get("/api/v1/jornadas/" + anaToday).expect(403);
        assertEquals(1, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id = '" + anaToday + "'"));
        fixture.client("ana-again").login(ana.dni(), Fixture.PASSWORD).expect(401);

        clock.set(Instant.parse("2027-03-02T13:00:00Z"));
        scheduler.createDueAbsences();
        assertEquals(List.of("MARCA_FALTANTE", "SIN_INGRESO"), activeDeviationTypes(beto.id()));
        assertEquals(List.of(), activeDeviationTypes(ana.id()));
        assertEquals(1, company.admin().get("/api/v1/jornadas/" + anaToday).expect(200).body().get("marks").size());
        assertClean();
    }

    // ---------------------------------------------------------------- S20 tenant isolation

    private record Probe(String method, String path, String body, Integer admin, Integer employee) { }

    @Test
    void s20EveryIdOfAnotherCompanyLooksLikeAnUnknownIdAndChangesNothing() {
        Fixture.Company a = fixture.company("Empresa A");
        UUID siteA = fixture.site(a, "Centro A", BA);
        UUID templateA = fixture.template(a, siteA, "Turno A", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        Fixture.Employee employeeA = fixture.employee(a, "Ana", List.of(siteA), 10);

        Fixture.Company b = fixture.company("Empresa Secreta");
        UUID siteB = fixture.site(b, "Sede Secreta", BA);
        UUID templateB = fixture.template(b, siteB, "Turno Secreto", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        Fixture.Employee employeeB = fixture.employee(b, "Bruno Secreto", List.of(siteB), 10);
        fixture.assign(b, employeeB.id(), templateB, DAY);
        UUID jornadaB = fixture.declare(b, employeeB.id(), siteB, DAY, null);
        clock.set(NINE_AM.plus(Duration.ofMinutes(30)));
        UUID markB = employeeB.client().mark(jornadaB, "INGRESO", UUID.randomUUID()).expect(201).id();
        UUID deviationB = UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id = ? AND active = TRUE",
                String.class, jornadaB.toString()));
        UUID subscriptionB = b.admin().put("/api/v1/push/subscriptions", pushSubscription("campaign-b")).expect(200).id();

        Map<String, String> foreign = Map.of("{jornada}", jornadaB.toString(), "{mark}", markB.toString(), "{deviation}", deviationB.toString(),
                "{employee}", employeeB.id().toString(), "{site}", siteB.toString(), "{template}", templateB.toString(),
                "{subscription}", subscriptionB.toString(), "{company}", b.id().toString());
        Map<String, String> own = Map.of("{ownEmployee}", employeeA.id().toString(), "{ownSite}", siteA.toString(),
                "{ownTemplate}", templateA.toString());
        List<String> secrets = new ArrayList<>(foreign.values());
        secrets.addAll(List.of(employeeB.dni(), "Bruno Secreto", "Sede Secreta", "Empresa Secreta", "Turno Secreto"));

        Map<String, Object> before = fingerprint();
        List<String> failures = new ArrayList<>();
        for (Probe probe : isolationProbes()) {
            for (boolean admin : new boolean[] {true, false}) {
                ApiClient client = admin ? a.admin() : employeeA.client();
                Map<String, String> unknown = new HashMap<>();
                foreign.keySet().forEach(key -> unknown.put(key, UUID.randomUUID().toString()));
                ApiClient.Response foreignResponse = call(client, probe, foreign, own);
                ApiClient.Response unknownResponse = call(client, probe, unknown, own);
                String where = (admin ? "ADMIN " : "EMPLOYEE ") + probe.method() + " " + probe.path() + " ";
                Integer expected = admin ? probe.admin() : probe.employee();
                if (expected != null && foreignResponse.status() != expected) {
                    failures.add(where + "expected " + expected + " but got " + foreignResponse.status() + " " + foreignResponse.code());
                }
                if (foreignResponse.status() != unknownResponse.status() || !Objects.equals(foreignResponse.code(), unknownResponse.code())) {
                    failures.add(where + "foreign id answers " + foreignResponse.status() + " " + foreignResponse.code()
                            + " but an unknown id answers " + unknownResponse.status() + " " + unknownResponse.code());
                }
                for (String secret : secrets) {
                    if (foreignResponse.raw() != null && foreignResponse.raw().contains(secret)) failures.add(where + "leaks " + secret);
                }
            }
        }
        assertEquals(List.of(), failures);
        assertEquals(before, fingerprint());
        assertClean();
    }

    /** admin/employee: the expected status, or null when only "same answer as an unknown id" is required. */
    private static List<Probe> isolationProbes() {
        String template = "{\"siteId\":\"%s\",\"name\":\"Probe\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"09:00\",\"end\":\"17:00\","
                + "\"endDayOffset\":0}],\"breakfastLimitMinutes\":10,\"lunchLimitMinutes\":10}";
        String range = "from=2027-03-01&to=2027-03-02";
        return List.of(
                new Probe("GET", "/api/v1/jornadas/{jornada}", null, 404, 404),
                new Probe("POST", "/api/v1/jornadas/{jornada}/marks", "{\"action\":\"SALIDA_DESAYUNO\"}", null, 404),
                new Probe("GET", "/api/v1/marks/{mark}", null, 404, 404),
                new Probe("POST", "/api/v1/marks/{mark}/location", "{\"latitude\":-34.6,\"longitude\":-58.4,\"accuracyMeters\":5}", null, 404),
                new Probe("POST", "/api/v1/admin/jornadas/{jornada}/forgotten-marks",
                        "{\"action\":\"SALIDA_DESAYUNO\",\"occurredAt\":\"2027-03-01T12:40:00Z\",\"auditReason\":\"probe\"}", 404, 403),
                new Probe("POST", "/api/v1/admin/marks/{mark}/correction",
                        "{\"correctedAction\":\"INGRESO\",\"correctedOccurredAt\":\"2027-03-01T12:20:00Z\",\"auditReason\":\"probe\"}", 404, 403),
                new Probe("POST", "/api/v1/admin/marks/{mark}/void", "{\"reason\":\"probe\"}", 404, 403),
                new Probe("POST", "/api/v1/admin/jornadas/{jornada}/cancellation", "{\"reason\":\"probe\"}", 404, 403),
                new Probe("GET", "/api/v1/admin/jornadas/{jornada}/audit", null, 404, 403),
                new Probe("PUT", "/api/v1/deviations/{deviation}/motive", "{\"category\":\"OTRA\",\"text\":\"probe\"}", null, 404),
                new Probe("PUT", "/api/v1/admin/deviations/{deviation}/classification",
                        "{\"classification\":\"JUSTIFICADO\",\"correctionReason\":\"probe\"}", 404, 403),
                new Probe("PUT", "/api/v1/sites/{site}/location",
                        "{\"latitude\":-34.6,\"longitude\":-58.4,\"geofenceRadiusMeters\":100,\"locationSource\":\"MANUAL\"}", 404, 403),
                new Probe("GET", "/api/v1/sites/{site}/location-audit", null, 404, 403),
                new Probe("PATCH", "/api/v1/employees/{employee}", "{\"displayName\":\"Hacked\"}", 404, 403),
                new Probe("POST", "/api/v1/employees/{employee}/password-reset", "{}", 404, 403),
                new Probe("GET", "/api/v1/employees/{employee}/template-assignments", null, 404, 403),
                new Probe("POST", "/api/v1/employees/{employee}/template-assignments",
                        "{\"templateId\":\"{ownTemplate}\",\"validFrom\":\"2027-03-01\"}", 404, 403),
                new Probe("PATCH", "/api/v1/templates/{template}", template.formatted("{ownSite}"), 404, 403),
                // CHAR: removing a subscription the ADMIN does not own answers 204, like an unknown id — confirm with Mateo.
                new Probe("DELETE", "/api/v1/push/subscriptions/{subscription}", null, null, 403),
                new Probe("POST", "/api/v1/jornadas", "{\"employeeId\":\"{employee}\",\"siteId\":\"{ownSite}\",\"localDate\":\"2027-03-05\"}", null, 403),
                new Probe("POST", "/api/v1/jornadas", "{\"employeeId\":\"{ownEmployee}\",\"siteId\":\"{site}\",\"localDate\":\"2027-03-05\"}", null, 403),
                new Probe("POST", "/api/v1/jornadas", "{\"employeeId\":\"{ownEmployee}\",\"siteId\":\"{ownSite}\",\"localDate\":\"2027-03-05\","
                        + "\"templateId\":\"{template}\"}", null, 403),
                new Probe("POST", "/api/v1/jornadas/bulk", "{\"employeeIds\":[\"{employee}\"],\"siteId\":\"{ownSite}\",\"from\":\"2027-03-08\","
                        + "\"to\":\"2027-03-09\",\"weekdays\":[1,2],\"templateId\":\"{ownTemplate}\"}", null, 403),
                new Probe("POST", "/api/v1/employees", "{\"dni\":\"{dni}\",\"displayName\":\"Probe\",\"siteIds\":[\"{site}\"],"
                        + "\"toleranceMinutes\":5,\"temporaryPassword\":\"temporary-pass-1234\"}", null, 403),
                new Probe("PATCH", "/api/v1/employees/{ownEmployee}", "{\"siteIds\":[\"{site}\"]}", null, 403),
                new Probe("POST", "/api/v1/employees/{ownEmployee}/template-assignments",
                        "{\"templateId\":\"{template}\",\"validFrom\":\"2027-03-01\"}", null, 403),
                new Probe("POST", "/api/v1/templates", template.formatted("{site}"), null, 403),
                new Probe("PATCH", "/api/v1/templates/{ownTemplate}", template.formatted("{site}"), null, 403),
                new Probe("GET", "/api/v1/templates?siteId={site}", null, null, null),
                new Probe("GET", "/api/v1/jornadas?" + range + "&employeeId={employee}&includeDetail=true", null, null, null),
                new Probe("GET", "/api/v1/jornadas?" + range + "&siteId={site}&includeDetail=true", null, null, null),
                new Probe("GET", "/api/v1/inbox?employeeId={employee}", null, null, null),
                new Probe("GET", "/api/v1/inbox?siteId={site}", null, null, null),
                new Probe("GET", "/api/v1/deviations?siteId={site}", null, null, null),
                new Probe("PUT", "/api/v1/companies/active", "{\"companyId\":\"{company}\"}", 404, 404));
    }

    // ---------------------------------------------------------------- S21 client-sent identity and time

    @Test
    void s21ForgedTimeIdentityAndStatusFieldsInMarksMotivesAndLocationsAreIgnored() {
        Fixture.Company company = fixture.company("Forja");
        Fixture.Company other = fixture.company("Otra");
        UUID site = fixture.site(company, "Centro", BA);
        UUID template = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, template);
        Instant now = NINE_AM.plus(Duration.ofMinutes(30));
        clock.set(now);
        Map<String, Object> forged = new LinkedHashMap<>(Map.of("companyId", other.id(), "accountId", other.adminAccountId(),
                "employeeId", UUID.randomUUID(), "jornadaId", UUID.randomUUID(), "role", "ADMIN"));

        Map<String, Object> markBody = new LinkedHashMap<>(forged);
        markBody.putAll(Map.of("action", "INGRESO", "acceptedAt", "2020-01-01T00:00:00Z", "occurredAt", "2020-01-01T00:00:00Z",
                "recordedAt", "2020-01-01T00:00:00Z", "sequence", 99, "locationStatus", "RECIBIDA", "voided", true));
        JsonNode mark = ana.client().send("POST", "/api/v1/jornadas/" + jornada + "/marks", markBody,
                Map.of("Idempotency-Key", UUID.randomUUID().toString())).expect(201).body();
        assertEquals(now, Instant.parse(mark.get("acceptedAt").asText()));
        assertEquals(now, Instant.parse(mark.get("occurredAt").asText()));
        assertEquals(1, mark.get("sequence").asInt());
        assertEquals("PENDIENTE", mark.get("locationStatus").asText());
        assertFalse(mark.get("voided").asBoolean());
        assertEquals(jornada.toString(), mark.get("jornadaId").asText());
        assertEquals(company.id().toString(), jdbc.queryForObject("SELECT company_id FROM mark_events WHERE id = ?", String.class,
                mark.get("id").asText()));

        Map<String, Object> locationBody = new LinkedHashMap<>(forged);
        locationBody.putAll(Map.of("latitude", -34.6, "longitude", -58.38, "accuracyMeters", 10, "receivedAt", "2020-01-01T00:00:00Z",
                "locationStatus", "SIN_UBICACION"));
        ana.client().post("/api/v1/marks/" + mark.get("id").asText() + "/location", locationBody).expect(202);
        assertEquals("RECIBIDA", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id = ?", String.class, mark.get("id").asText()));

        String deviation = jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id = ? AND active = TRUE", String.class, jornada.toString());
        Map<String, Object> motiveBody = new LinkedHashMap<>(forged);
        motiveBody.putAll(Map.of("category", "OTRA", "text", "Colectivo", "classification", "JUSTIFICADO", "type", "SIN_INGRESO", "active", false));
        ana.client().put("/api/v1/deviations/" + deviation + "/motive", motiveBody).expect(200);
        Map<String, Object> stored = jdbc.queryForMap("SELECT type, classification, active, employee_id, company_id FROM deviations WHERE id = ?", deviation);
        assertEquals("LLEGADA_TARDE", stored.get("type"));
        assertEquals(null, stored.get("classification"));
        assertEquals(Boolean.TRUE, stored.get("active"));
        assertEquals(ana.id().toString(), stored.get("employee_id"));
        assertEquals(company.id().toString(), stored.get("company_id"));
        assertClean();
    }

    @Test
    void s21ForgedRoleAndCompanyInLoginEmployeeCreationAndPatchAreIgnored() {
        Fixture.Company company = fixture.company("Rol");
        Fixture.Company other = fixture.company("Ajena");
        UUID site = fixture.site(company, "Centro", BA);
        String dni = Fixture.nextDni();
        UUID forgedAccount = UUID.randomUUID();
        Map<String, Object> hire = new LinkedHashMap<>(Map.of("dni", dni, "displayName", "Dora", "siteIds", List.of(site),
                "toleranceMinutes", 5, "temporaryPassword", "temporary-pass-" + dni));
        hire.putAll(Map.of("role", "ADMIN", "companyId", other.id(), "accountId", forgedAccount, "active", false, "mustChangePassword", false));
        UUID employee = company.admin().post("/api/v1/employees", hire).expect(201).id();
        company.admin().patch("/api/v1/employees/" + employee, Map.of("displayName", "Dora", "role", "ADMIN", "companyId", other.id())).expect(200);

        String account = jdbc.queryForObject("SELECT id FROM accounts WHERE dni_normalized = ?", String.class, dni);
        assertNotEquals(forgedAccount.toString(), account);
        assertEquals(List.of(Map.of("COMPANY_ID", company.id().toString(), "ROLE", "EMPLOYEE", "ACTIVE", true)),
                jdbc.queryForList("SELECT company_id AS COMPANY_ID, role AS ROLE, active AS ACTIVE FROM company_memberships WHERE account_id = ?", account)
                        .stream().map(TreeMap::new).toList());
        assertTrue(jdbc.queryForObject("SELECT must_change_password FROM accounts WHERE id = ?", Boolean.class, account));

        ApiClient dora = fixture.client("dora");
        Map<String, Object> login = new LinkedHashMap<>(Map.of("dni", dni, "password", "temporary-pass-" + dni));
        login.putAll(Map.of("role", "ADMIN", "companyId", other.id(), "activeCompanyId", other.id(), "accountId", other.adminAccountId()));
        JsonNode session = dora.post("/api/v1/session", login).expect(200).body();
        assertEquals(account, session.get("accountId").asText());
        assertEquals(company.id().toString(), session.get("activeCompanyId").asText());
        assertEquals(1, session.get("memberships").size());
        assertEquals("EMPLOYEE", session.get("memberships").get(0).get("role").asText());
        dora.get("/api/v1/employees").expect(403);
        assertClean();
    }

    @Test
    void s21SwitchingToACompanyWithoutAnActiveMembershipIs404AndKeepsTheSession() {
        Fixture.Company a = fixture.company("Alfa");
        UUID siteA = fixture.site(a, "Centro Alfa", BA);
        Fixture.Employee ana = fixture.employee(a, "Ana", List.of(siteA), 10);
        Fixture.Company b = fixture.company("Beta");
        UUID siteB = fixture.site(b, "Centro Beta", BA);
        UUID anaInB = b.admin().post("/api/v1/employees", Map.of("dni", ana.dni(), "displayName", "Ana", "siteIds", List.of(siteB),
                "toleranceMinutes", 5)).expect(201).id();
        Fixture.Company stranger = fixture.company("Gamma");

        assertEquals(b.id().toString(), ana.client().put("/api/v1/companies/active", Map.of("companyId", b.id())).expect(200)
                .body().get("activeCompanyId").asText());
        assertEquals(siteB.toString(), ana.client().get("/api/v1/sites").expect(200).body().get(0).get("id").asText());
        assertEquals("NOT_FOUND", ana.client().put("/api/v1/companies/active", Map.of("companyId", stranger.id())).expect(404).code());
        assertEquals(b.id().toString(), ana.client().get("/api/v1/session").expect(200).body().get("activeCompanyId").asText());
        assertEquals("NOT_FOUND", a.admin().put("/api/v1/companies/active", Map.of("companyId", b.id())).expect(404).code());

        b.admin().patch("/api/v1/employees/" + anaInB, Map.of("active", false)).expect(200);
        ana.client().get("/api/v1/sites").expect(403);
        ana.client().put("/api/v1/companies/active", Map.of("companyId", b.id())).expect(404);
        ana.client().put("/api/v1/companies/active", Map.of("companyId", a.id())).expect(200);
        assertEquals(siteA.toString(), ana.client().get("/api/v1/sites").expect(200).body().get(0).get("id").asText());
        assertClean();
    }

    // ---------------------------------------------------------------- S23 giant and malformed input

    private record Hostile(String name, ApiClient client, String method, String path, String body) { }

    @Test
    void s23OversizedButWellFormedInputIsA422WithACode() {
        Fixture.Company company = fixture.company("Gigante");
        UUID site = fixture.site(company, "Centro", BA);
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        String megabyte = "y".repeat(1 << 20);
        String id = UUID.randomUUID().toString();
        StringJoiner manyIds = new StringJoiner("\",\"", "[\"", "\"]");
        for (int index = 0; index < 100_000; index++) manyIds.add(UUID.randomUUID().toString());
        ApiClient anonymous = fixture.client("anonymous");
        Map<String, Object> before = fingerprint();

        List<String> failures = new ArrayList<>();
        for (Hostile hostile : List.of(
                new Hostile("100k-digit DNI", anonymous, "POST", "/api/v1/session", "{\"dni\":\"" + "9".repeat(100_000) + "\",\"password\":\"x\"}"),
                new Hostile("1 MB password", anonymous, "POST", "/api/v1/session", "{\"dni\":\"" + ana.dni() + "\",\"password\":\"" + megabyte + "\"}"),
                new Hostile("8 MB site name", company.admin(), "POST", "/api/v1/sites",
                        "{\"name\":\"" + "x".repeat(8 << 20) + "\",\"timeZone\":\"" + BA + "\"}"),
                new Hostile("1 MB display name", company.admin(), "POST", "/api/v1/employees", "{\"dni\":\"" + Fixture.nextDni()
                        + "\",\"displayName\":\"" + megabyte + "\",\"siteIds\":[\"" + site + "\"],\"toleranceMinutes\":5}"),
                new Hostile("latitude 1e400", company.admin(), "PUT", "/api/v1/sites/" + site + "/location",
                        "{\"latitude\":1e400,\"longitude\":0,\"geofenceRadiusMeters\":100}"),
                new Hostile("100k employee ids", company.admin(), "POST", "/api/v1/jornadas/bulk", "{\"employeeIds\":" + manyIds
                        + ",\"siteId\":\"" + site + "\",\"from\":\"2027-03-01\",\"to\":\"2027-03-02\",\"weekdays\":[1]}"),
                new Hostile("1 MB void reason", company.admin(), "POST", "/api/v1/admin/marks/" + id + "/void", "{\"reason\":\"" + megabyte + "\"}"),
                new Hostile("1 MB push endpoint", company.admin(), "PUT", "/api/v1/push/subscriptions",
                        "{\"endpoint\":\"https://fcm.googleapis.com/" + megabyte + "\",\"keys\":{\"p256dh\":\"a\",\"auth\":\"b\"}}"),
                new Hostile("1 MB motive", ana.client(), "PUT", "/api/v1/deviations/" + id + "/motive", "{\"category\":\"OTRA\",\"text\":\"" + megabyte + "\"}"),
                new Hostile("1 MB mark action", ana.client(), "POST", "/api/v1/jornadas/" + id + "/marks", "{\"action\":\"" + megabyte + "\"}"))) {
            ApiClient.Response response = hostile.client().send(hostile.method(), hostile.path(), hostile.body(),
                    Map.of("Idempotency-Key", UUID.randomUUID().toString()));
            if (response.status() != 422 || !"VALIDATION_ERROR".equals(response.code())) {
                failures.add(hostile.name() + ": " + response.status() + " " + response.code());
            }
        }
        assertEquals(List.of(), failures);
        assertEquals(before, fingerprint());
        assertEquals(List.of(), httpLog.problemsWithoutCode());
        assertClean();
    }

    @Test
    void s23MalformedJsonIsA4xxAndNeverA5xx() {
        Fixture.Company company = fixture.company("Roto");
        Map<String, Object> before = fingerprint();
        List<String> failures = new ArrayList<>();
        for (Map.Entry<String, ApiClient.Response> sent : sendMalformedJson(company).entrySet()) {
            int status = sent.getValue().status();
            if (status < 400 || status >= 500) failures.add(sent.getKey() + ": " + status + " " + abbreviate(sent.getValue().raw()));
        }
        assertEquals(List.of(), failures);
        assertEquals(before, fingerprint());
        assertClean();
    }

    /** Only the missing code is the defect; the 4xx status and the untouched database are pinned by the test above. */
    @Test
    @KnownDefect(issue = "#73", reason = "An unreadable JSON body falls through ApiExceptionHandler to Spring Boot's /error page: 400 without problem+json or code")
    void s23MalformedJsonCarriesAProblemCode() {
        List<String> withoutCode = new ArrayList<>();
        for (Map.Entry<String, ApiClient.Response> sent : sendMalformedJson(fixture.company("Roto")).entrySet()) {
            if (sent.getValue().code() == null) withoutCode.add(sent.getKey() + ": " + abbreviate(sent.getValue().raw()));
        }
        assertEquals(List.of(), withoutCode);
    }

    private Map<String, ApiClient.Response> sendMalformedJson(Fixture.Company company) {
        ApiClient anonymous = fixture.client("anonymous");
        String nested = "{\"name\":" + "[".repeat(5_000) + "]".repeat(5_000) + ",\"timeZone\":\"" + BA + "\"}";
        Map<String, ApiClient.Response> responses = new LinkedHashMap<>();
        for (Hostile hostile : List.of(
                new Hostile("truncated JSON", anonymous, "POST", "/api/v1/session", "{\"dni\":"),
                new Hostile("object where a string goes", anonymous, "POST", "/api/v1/session", "{\"dni\":{\"$gt\":\"\"},\"password\":\"x\"}"),
                new Hostile("5000 levels of nesting", company.admin(), "POST", "/api/v1/sites", nested),
                new Hostile("companyId that is not a UUID", company.admin(), "PUT", "/api/v1/companies/active", "{\"companyId\":\"../../etc\"}"))) {
            responses.put(hostile.name(), hostile.client().send(hostile.method(), hostile.path(), hostile.body(), Map.of()));
        }
        return responses;
    }

    // CHAR: bodies have no size cap (an unknown 8 MB field is parsed and ignored), and a new password longer than BCrypt's
    // 72 bytes is refused with a generic 422 although the API documents 12 to 256 characters — confirm with Mateo.
    @Test
    void s23TheEffectivePasswordLimitIs72BytesAndBodiesHaveNoSizeCap() {
        Fixture.Company company = fixture.company("Limite");
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(fixture.site(company, "Centro", BA)), 10);
        String hashBefore = jdbc.queryForObject("SELECT password_hash FROM accounts WHERE id = ?", String.class, ana.accountId().toString());

        ApiClient.Response longPassword = ana.client().put("/api/v1/session/password",
                Map.of("currentPassword", Fixture.PASSWORD, "newPassword", "p".repeat(73)));
        assertEquals(422, longPassword.status());
        assertEquals("VALIDATION_ERROR", longPassword.code());
        assertEquals(hashBefore, jdbc.queryForObject("SELECT password_hash FROM accounts WHERE id = ?", String.class, ana.accountId().toString()));
        ana.client().put("/api/v1/session/password", Map.of("currentPassword", Fixture.PASSWORD, "newPassword", "p".repeat(72))).expect(204);

        String padded = "{\"dni\":\"" + Fixture.nextDni() + "\",\"password\":\"whatever\",\"pad\":\"" + "z".repeat(8 << 20) + "\"}";
        assertEquals("UNAUTHORIZED", fixture.client("padded").send("POST", "/api/v1/session", padded, Map.of()).expect(401).code());
        assertClean();
    }

    // ---------------------------------------------------------------- helpers

    private ApiClient.Response call(ApiClient client, Probe probe, Map<String, String> ids, Map<String, String> own) {
        return client.send(probe.method(), fill(probe.path(), ids, own), probe.body() == null ? null : fill(probe.body(), ids, own),
                Map.of("Idempotency-Key", UUID.randomUUID().toString()));
    }

    private static String fill(String text, Map<String, String> ids, Map<String, String> own) {
        String filled = text.replace("{dni}", Fixture.nextDni());
        for (Map.Entry<String, String> entry : own.entrySet()) filled = filled.replace(entry.getKey(), entry.getValue());
        for (Map.Entry<String, String> entry : ids.entrySet()) filled = filled.replace(entry.getKey(), entry.getValue());
        return filled;
    }

    private static Map<String, Object> pushSubscription(String device) {
        byte[] point = new byte[65];
        point[0] = 0x04;
        java.util.Base64.Encoder base64 = java.util.Base64.getUrlEncoder().withoutPadding();
        return Map.of("endpoint", "https://fcm.googleapis.com/fcm/send/" + device,
                "keys", Map.of("p256dh", base64.encodeToString(point), "auth", base64.encodeToString(new byte[16])));
    }

    /** Logs in through a fresh browser and keeps the response headers, which ApiClient does not expose. */
    private HttpResponse<String> loginWithHeaders(String ip, String dni, String password) throws Exception {
        HttpClient http = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
        HttpResponse<String> csrf = http.send(HttpRequest.newBuilder(URI.create(baseUrl() + "/api/v1/csrf")).header("X-Forwarded-For", ip)
                .GET().build(), HttpResponse.BodyHandlers.ofString());
        String token = json.readTree(csrf.body()).get("token").asText();
        return http.send(HttpRequest.newBuilder(URI.create(baseUrl() + "/api/v1/session")).header("X-Forwarded-For", ip)
                .header("Content-Type", JSON).header("X-CSRF-TOKEN", token)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("dni", dni, "password", password)))).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private void assertLocked(HttpResponse<String> response, String retryAfter) throws Exception {
        assertEquals(429, response.statusCode(), response.body());
        assertEquals("TOO_MANY_REQUESTS", json.readTree(response.body()).get("code").asText());
        assertEquals(retryAfter, response.headers().firstValue("Retry-After").orElse(null));
    }

    private static void expectRejection(List<String> failures, String who, ApiClient.Response response, int status, String code) {
        if (response.status() != status || !code.equals(response.code())) failures.add(who + ": " + response.status() + " " + response.code());
    }

    private JsonNode withoutTraceId(ApiClient.Response response) {
        ObjectNode copy = response.body().deepCopy();
        copy.remove("traceId");
        return copy;
    }

    private List<String> activeDeviationTypes(UUID employeeId) {
        return jdbc.queryForList("SELECT type FROM deviations WHERE employee_id = ? AND active = TRUE ORDER BY type", String.class,
                employeeId.toString());
    }

    /** CHECKSUM TABLE of every table that a rejected request must not touch. */
    private Map<String, Object> fingerprint() {
        Map<String, Object> checksums = new TreeMap<>();
        for (String table : jdbc.queryForList("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()"
                + " AND table_type = 'BASE TABLE'", String.class)) {
            if (!UNTRACKED.contains(table.toLowerCase())) checksums.put(table, jdbc.queryForMap("CHECKSUM TABLE `" + table + "`").get("Checksum"));
        }
        return checksums;
    }

    private int count(String sql) {
        return jdbc.queryForObject(sql, Integer.class);
    }

    private static String abbreviate(String raw) {
        return raw == null ? "" : raw.length() > 160 ? raw.substring(0, 160) + "…" : raw;
    }

    private void assertClean() {
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
        assertEquals(List.of(), httpLog.serverErrors());
    }
}
