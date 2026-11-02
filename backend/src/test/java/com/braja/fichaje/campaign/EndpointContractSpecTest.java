package com.braja.fichaje.campaign;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S9-S13: the API against the hand-written openapi.yaml, which nothing else compares with the code (CLAUDE.md §8).
 * The document is parsed here, so a route added to the code or to openapi.yaml without a probe in this suite fails.
 */
class EndpointContractSpecTest extends CampaignTestBase {
    private static final String BA = "America/Argentina/Buenos_Aires";
    private static final String API = "/api/v1";
    private static final Path OPENAPI = Path.of("..", "openapi.yaml");
    private static final Path MAIN_SOURCES = Path.of("src", "main", "java");
    private static final LocalDate DAY = LocalDate.parse("2027-03-02");
    private static final String ENDPOINT = "https://fcm.googleapis.com/fcm/send/";
    private static final Set<String> PUBLIC = Set.of("GET /public-config", "GET /csrf", "POST /session", "GET /health");
    /** S13: operations no HTTP test outside campaign/ called before the campaign (grep of backend/src/test/java on 2026-11-02). */
    private static final Set<String> PREVIOUSLY_UNTESTED = Set.of("GET /public-config", "GET /companies", "POST /sites", "GET /employees",
            "GET /templates", "GET /jornadas/mine", "PUT /push/subscriptions", "DELETE /push/subscriptions/{subscriptionId}");
    /**
     * S12: codes the backend emits that openapi.yaml never names. A ceiling that only goes down (CLAUDE.md §3): eight on
     * 2026-11-02, none since #73 documented them.
     */
    private static final Set<String> UNDOCUMENTED_CODES = Set.of();
    /** Statuses the S10 matrix sees that openapi.yaml does not list for the operation: GET /templates 404 until #73, none since. */
    private static final Set<String> UNDOCUMENTED_STATUSES = Set.of();
    private static final String TEMPLATE = "{\"siteId\":\"{site}\",\"name\":\"Tarde\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"14:00\","
            + "\"end\":\"18:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":15,\"lunchLimitMinutes\":30}";
    private static final String REASON = "{\"reason\":\"Contract probe\"}";
    /** The 404 probe sends the request with every path variable replaced by an id that does not exist. */
    private static final String AUTO = "auto";

    private enum Role { ANY, ADMIN, EMPLOYEE }

    /** One non-public operation: the request (relative to /api/v1) and body for the allowed role, and its unknown-id probe (null: none). */
    private record Route(String operation, Role role, String request, String body, String notFound) {
        String method() { return operation.substring(0, operation.indexOf(' ')); }
        String unknownIdRequest() { return AUTO.equals(notFound) ? request : notFound; }
    }

    private static final List<Route> ROUTES = List.of(
            new Route("GET /session", Role.ANY, "/session", null, null),
            new Route("DELETE /session", Role.ANY, "/session", null, null),
            new Route("PUT /session/password", Role.ANY, "/session/password",
                    "{\"currentPassword\":\"not-the-password\",\"newPassword\":\"another-password-1234\"}", null),
            new Route("GET /companies", Role.ANY, "/companies", null, null),
            new Route("PUT /companies/active", Role.ANY, "/companies/active", "{\"companyId\":\"{random}\"}", "/companies/active"),
            new Route("GET /sites", Role.ANY, "/sites", null, null),
            new Route("POST /sites", Role.ADMIN, "/sites", "{\"name\":\"Norte\",\"timeZone\":\"" + BA + "\"}", null),
            new Route("PUT /sites/{siteId}/location", Role.ADMIN, "/sites/{siteId}/location",
                    "{\"latitude\":-34.6037,\"longitude\":-58.3816,\"geofenceRadiusMeters\":100,\"locationSource\":\"MANUAL\"}", AUTO),
            new Route("GET /sites/{siteId}/location-audit", Role.ADMIN, "/sites/{siteId}/location-audit", null, AUTO),
            new Route("GET /employees", Role.ADMIN, "/employees", null, null),
            new Route("POST /employees", Role.ADMIN, "/employees", "{\"dni\":\"{dni}\",\"displayName\":\"Nueva\",\"siteIds\":[\"{site}\"],"
                    + "\"toleranceMinutes\":10,\"temporaryPassword\":\"temporary-pass-1234\"}", null),
            new Route("PATCH /employees/{employeeId}", Role.ADMIN, "/employees/{employeeId}", "{\"toleranceMinutes\":5}", AUTO),
            new Route("GET /employees/{employeeId}/template-assignments", Role.ADMIN, "/employees/{employeeId}/template-assignments", null, AUTO),
            new Route("POST /employees/{employeeId}/template-assignments", Role.ADMIN, "/employees/{employeeId}/template-assignments",
                    "{\"templateId\":\"{template}\",\"validFrom\":\"2027-03-01\"}", AUTO),
            new Route("POST /employees/{employeeId}/password-reset", Role.ADMIN, "/employees/{employeeId}/password-reset", null, AUTO),
            new Route("GET /templates", Role.ANY, "/templates", null, "/templates?siteId={random}"),
            new Route("POST /templates", Role.ADMIN, "/templates", TEMPLATE, null),
            new Route("PATCH /templates/{templateId}", Role.ADMIN, "/templates/{templateId}", TEMPLATE, AUTO),
            new Route("GET /jornadas", Role.ANY, "/jornadas?from=2027-03-01&to=2027-03-07", null,
                    "/jornadas?from=2027-03-01&to=2027-03-07&siteId={random}"),
            new Route("POST /jornadas", Role.ADMIN, "/jornadas", "{\"employeeId\":\"{random}\",\"siteId\":\"{site}\",\"localDate\":\"2027-03-02\"}",
                    "/jornadas"),
            new Route("POST /jornadas/bulk", Role.ADMIN, "/jornadas/bulk", "{\"employeeIds\":[\"{random}\"],\"siteId\":\"{random}\","
                    + "\"from\":\"2027-03-02\",\"to\":\"2027-03-03\",\"weekdays\":[1,2,3,4,5,6,7]}", "/jornadas/bulk"),
            new Route("GET /jornadas/mine", Role.ANY, "/jornadas/mine?localDate=2027-03-02", null, null),
            new Route("GET /jornadas/{jornadaId}", Role.ANY, "/jornadas/{jornadaId}", null, AUTO),
            new Route("POST /jornadas/{jornadaId}/marks", Role.EMPLOYEE, "/jornadas/{jornadaId}/marks", "{\"action\":\"INGRESO\"}", AUTO),
            new Route("GET /marks/{markId}", Role.ANY, "/marks/{markId}", null, AUTO),
            new Route("POST /marks/{markId}/location", Role.EMPLOYEE, "/marks/{markId}/location",
                    "{\"latitude\":-34.6037,\"longitude\":-58.3816,\"accuracyMeters\":15}", AUTO),
            new Route("POST /admin/jornadas/{jornadaId}/forgotten-marks", Role.ADMIN, "/admin/jornadas/{jornadaId}/forgotten-marks",
                    "{\"action\":\"INGRESO\",\"occurredAt\":\"2027-03-01T08:00:00Z\",\"auditReason\":\"Contract probe\"}", AUTO),
            new Route("POST /admin/marks/{markId}/correction", Role.ADMIN, "/admin/marks/{markId}/correction",
                    "{\"correctedAction\":\"INGRESO\",\"correctedOccurredAt\":\"2027-03-01T08:00:00Z\",\"auditReason\":\"Contract probe\"}", AUTO),
            new Route("POST /admin/marks/{markId}/void", Role.ADMIN, "/admin/marks/{markId}/void", REASON, AUTO),
            new Route("POST /admin/jornadas/{jornadaId}/cancellation", Role.ADMIN, "/admin/jornadas/{jornadaId}/cancellation", REASON, AUTO),
            new Route("GET /admin/jornadas/{jornadaId}/audit", Role.ADMIN, "/admin/jornadas/{jornadaId}/audit", null, AUTO),
            new Route("GET /deviations", Role.ANY, "/deviations", null, "/deviations?siteId={random}"),
            new Route("PUT /deviations/{deviationId}/motive", Role.EMPLOYEE, "/deviations/{deviationId}/motive",
                    "{\"category\":\"OTRA\",\"text\":\"Contract probe\"}", AUTO),
            new Route("PUT /admin/deviations/{deviationId}/classification", Role.ADMIN, "/admin/deviations/{deviationId}/classification",
                    "{\"classification\":\"JUSTIFICADO\"}", AUTO),
            new Route("GET /inbox", Role.ANY, "/inbox", null, "/inbox?siteId={random}"),
            new Route("PUT /push/subscriptions", Role.ADMIN, "/push/subscriptions", "{\"endpoint\":\"" + ENDPOINT + "probe\",\"keys\":"
                    + "{\"p256dh\":\"" + p256dh() + "\",\"auth\":\"" + Base64.getUrlEncoder().withoutPadding().encodeToString(new byte[16]) + "\"}}", null),
            new Route("POST /push/subscriptions/current", Role.ADMIN, "/push/subscriptions/current", "{\"endpoint\":\"" + ENDPOINT + "probe\"}", null),
            // Documented 204 "removed if owned by this account": an unknown id is not a 404 (pinned in the S10 test).
            new Route("DELETE /push/subscriptions/{subscriptionId}", Role.ADMIN, "/push/subscriptions/{subscriptionId}", null, null));

    private static Map<String, Object> openapi;

    @Autowired @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping mappings;

    private final Map<String, Set<String>> observed = new TreeMap<>();
    private final List<String> shapeFailures = new ArrayList<>();
    /** Required fields the schema allows to be null that the server omits instead (spring.jackson.default-property-inclusion=non_null). */
    private final Set<String> omittedNullables = new TreeSet<>();

    // ---------------------------------------------------------------- S9 status and shape

    @Test
    void s9EveryBackendRouteIsDocumentedAndEveryDocumentedRouteExists() {
        Set<String> backend = new TreeSet<>();
        for (RequestMappingInfo info : mappings.getHandlerMethods().keySet()) {
            for (String pattern : info.getPatternValues()) {
                if (!pattern.startsWith(API + "/")) continue;
                Set<RequestMethod> methods = info.getMethodsCondition().getMethods();
                if (methods.isEmpty()) backend.add("ANY " + pattern.substring(API.length()));
                methods.forEach(method -> backend.add(method.name() + " " + pattern.substring(API.length())));
            }
        }
        assertEquals(documentedOperations(), backend, "openapi.yaml and the backend's /api/v1 routes must list the same operations");
        assertEquals(42, backend.size());
    }

    @Test
    void s9EveryDocumentedOperationAnswersItsDocumentedStatusAndShapeOnAHappyPath() {
        ApiClient anonymous = fixture.client("anonymous");
        ok("GET /public-config", anonymous.get(API + "/public-config"));
        ok("GET /health", anonymous.get(API + "/health"));
        ok("GET /csrf", anonymous.get(API + "/csrf"));

        Fixture.Company company = fixture.company("Contrato");
        ApiClient admin = company.admin();
        ApiClient secondBrowser = fixture.client("admin:second-browser");
        ok("POST /session", secondBrowser.login(company.adminDni(), Fixture.PASSWORD));
        ok("GET /session", admin.get(API + "/session"));
        ok("GET /companies", admin.get(API + "/companies"));
        ok("PUT /companies/active", admin.put(API + "/companies/active", Map.of("companyId", company.id())));

        UUID site = ok("POST /sites", admin.post(API + "/sites", Map.of("name", "Centro", "timeZone", BA))).id();
        ok("PUT /sites/{siteId}/location", admin.put(API + "/sites/" + site + "/location", Map.of("latitude", -34.6037,
                "longitude", -58.3816, "geofenceRadiusMeters", 100, "locationSource", "MANUAL")));
        ok("GET /sites/{siteId}/location-audit", admin.get(API + "/sites/" + site + "/location-audit"));
        ok("GET /sites", admin.get(API + "/sites"));
        UUID template = ok("POST /templates", admin.post(API + "/templates", fill(TEMPLATE, site, null))).id();
        ok("PATCH /templates/{templateId}", admin.patch(API + "/templates/" + template, fill(TEMPLATE, site, null).replace("Tarde", "Tarde larga")));
        ok("GET /templates", admin.get(API + "/templates"));

        String dni = Fixture.nextDni();
        String temporary = "temporary-pass-" + dni;
        UUID employee = ok("POST /employees", admin.post(API + "/employees", Map.of("dni", dni, "displayName", "Ana", "siteIds", List.of(site),
                "toleranceMinutes", 10, "temporaryPassword", temporary))).id();
        ok("PATCH /employees/{employeeId}", admin.patch(API + "/employees/" + employee, Map.of("displayName", "Ana Pérez")));
        ok("GET /employees", admin.get(API + "/employees"));
        ok("POST /employees/{employeeId}/template-assignments", admin.post(API + "/employees/" + employee + "/template-assignments",
                Map.of("templateId", template, "validFrom", "2027-03-01")));
        ok("GET /employees/{employeeId}/template-assignments", admin.get(API + "/employees/" + employee + "/template-assignments"));
        ApiClient ana = fixture.client("employee:Ana");
        ana.login(dni, temporary).expect(200);
        ok("PUT /session/password", ana.put(API + "/session/password", Map.of("currentPassword", temporary, "newPassword", Fixture.PASSWORD)));

        UUID jornada = ok("POST /jornadas", admin.post(API + "/jornadas", Map.of("employeeId", employee, "siteId", site,
                "localDate", DAY.toString()))).id();
        JsonNode lot = ok("POST /jornadas/bulk", admin.post(API + "/jornadas/bulk", Map.of("employeeIds", List.of(employee), "siteId", site,
                "from", "2027-03-03", "to", "2027-03-05", "weekdays", List.of(1, 2, 3, 4, 5, 6, 7)))).body();
        ok("GET /jornadas", admin.get(API + "/jornadas?from=2027-03-01&to=2027-03-07&includeDetail=true"));
        ok("GET /jornadas/{jornadaId}", admin.get(API + "/jornadas/" + jornada));
        ok("POST /admin/jornadas/{jornadaId}/cancellation", admin.post(API + "/admin/jornadas/" + createdOn(lot, "2027-03-05")
                + "/cancellation", Map.of("reason", "Closed for inventory")));
        ok("GET /jornadas/mine", ana.get(API + "/jornadas/mine?localDate=" + DAY));

        // 14:20 in Buenos Aires against a 14:00 start and a 10-minute tolerance: the mark itself opens a LLEGADA_TARDE.
        clock.set(Instant.parse("2027-03-02T17:20:00Z"));
        UUID key = UUID.randomUUID();
        UUID ingreso = ok("POST /jornadas/{jornadaId}/marks", ana.mark(jornada, "INGRESO", key)).id();
        ok("POST /jornadas/{jornadaId}/marks", ana.mark(jornada, "INGRESO", key));
        clock.advance(Duration.ofSeconds(5));
        ok("POST /marks/{markId}/location", ana.post(API + "/marks/" + ingreso + "/location",
                Map.of("latitude", -34.6037, "longitude", -58.3816, "accuracyMeters", 15)));
        ok("GET /marks/{markId}", ana.get(API + "/marks/" + ingreso));
        JsonNode deviations = ok("GET /deviations", ana.get(API + "/deviations")).body();
        UUID deviation = UUID.fromString(deviations.get(0).get("id").asText());
        ok("PUT /deviations/{deviationId}/motive", ana.put(API + "/deviations/" + deviation + "/motive",
                Map.of("category", "TRANSPORTE", "text", "The bus did not come")));
        ok("GET /inbox", admin.get(API + "/inbox"));
        ok("PUT /admin/deviations/{deviationId}/classification", admin.put(API + "/admin/deviations/" + deviation + "/classification",
                Map.of("classification", "JUSTIFICADO")));

        clock.set(Instant.parse("2027-03-02T19:00:00Z"));
        UUID breakfast = ana.mark(jornada, "SALIDA_DESAYUNO", UUID.randomUUID()).expect(201).id();
        ok("POST /admin/marks/{markId}/correction", admin.post(API + "/admin/marks/" + breakfast + "/correction", Map.of(
                "correctedAction", "SALIDA_DESAYUNO", "correctedOccurredAt", "2027-03-02T18:55:00Z", "auditReason", "Clocked late at the till")));
        ok("POST /admin/marks/{markId}/void", admin.post(API + "/admin/marks/" + breakfast + "/void", Map.of("reason", "Marked by mistake")));
        ok("GET /admin/jornadas/{jornadaId}/audit", admin.get(API + "/admin/jornadas/" + jornada + "/audit"));

        clock.set(Instant.parse("2027-03-03T23:00:00Z"));
        ok("POST /admin/jornadas/{jornadaId}/forgotten-marks", admin.post(API + "/admin/jornadas/" + createdOn(lot, "2027-03-03")
                + "/forgotten-marks", Map.of("action", "INGRESO", "occurredAt", "2027-03-03T17:00:00Z", "auditReason", "Forgot to clock in")));

        UUID subscription = ok("PUT /push/subscriptions", admin.put(API + "/push/subscriptions", fill(route("PUT /push/subscriptions").body(),
                site, template))).id();
        ok("POST /push/subscriptions/current", admin.post(API + "/push/subscriptions/current", Map.of("endpoint", ENDPOINT + "probe")));
        ok("DELETE /push/subscriptions/{subscriptionId}", admin.delete(API + "/push/subscriptions/" + subscription));
        ok("POST /employees/{employeeId}/password-reset", admin.post(API + "/employees/" + employee + "/password-reset", null));
        ok("DELETE /session", secondBrowser.delete(API + "/session"));

        assertEquals(documentedSuccess(), observed, "every documented operation needs a probe that sees each documented 2xx");
        assertTrue(observed.keySet().containsAll(PREVIOUSLY_UNTESTED), "S13: the routes without an HTTP test before the campaign");
        assertEquals(List.of(), shapeFailures);
        // The server omits null fields (spring.jackson.default-property-inclusion=non_null), so no nullable field may be
        // required in openapi.yaml (#73: location-audit before*, POST /sites latitude/longitude and others were).
        assertEquals(Set.of(), omittedNullables);
        assertClean();
    }

    // ---------------------------------------------------------------- S10 permission matrix

    // CHAR: an anonymous mutation that carries a valid anonymous CSRF token gets 401 UNAUTHORIZED (the entry point); without the
    // token it gets 401 SESSION_EXPIRED (AuthAbuseSpecTest S17). DELETE /session is permitAll, so an anonymous logout is 204 although
    // openapi.yaml lists 401; an unknown push subscription id answers 204, as documented — confirm with Mateo.
    @Test
    void s10EveryRouteRefusesAnonymousWrongRoleAndUnknownIdsWithItsDocumentedProblem() {
        assertEquals(nonPublicOperations(), new TreeSet<>(ROUTES.stream().map(Route::operation).toList()), "one Route per documented operation");
        Fixture.Company company = fixture.company("Permisos");
        UUID site = fixture.site(company, "Centro", BA);
        UUID template = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 15, 30);
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        List<String> failures = new ArrayList<>();
        for (Route route : ROUTES) {
            // A fresh browser per route: the anonymous logout would otherwise end the session that holds the CSRF token.
            ApiClient.Response anon = call(fixture.client("anonymous"), route, route.request(), site, template);
            if (route.operation().equals("DELETE /session")) {
                if (anon.status() != 204) failures.add("anonymous DELETE /session -> " + anon.status());
            } else {
                expectProblem(failures, "anonymous", route, anon, 401, "UNAUTHORIZED", false);
            }
            if (route.role() != Role.ANY) {
                ApiClient wrongRole = route.role() == Role.ADMIN ? ana.client() : company.admin();
                expectProblem(failures, "wrong role", route, call(wrongRole, route, route.request(), site, template), 403, "FORBIDDEN", true);
            }
            if (route.unknownIdRequest() != null) {
                ApiClient owner = route.role() == Role.EMPLOYEE ? ana.client() : company.admin();
                expectProblem(failures, "unknown id", route, call(owner, route, route.unknownIdRequest(), site, template), 404, "NOT_FOUND", true);
            }
        }
        company.admin().delete(API + "/push/subscriptions/" + UUID.randomUUID()).expect(204);
        assertEquals(List.of(), failures);
        assertClean();
    }

    /** The S10 matrix sees GET /templates?siteId=<unknown> answer 404 NOT_FOUND; openapi.yaml lists only 200 and 403 for it. */
    @Test
    void s10EveryStatusTheMatrixSeesIsDocumented() {
        List<String> missing = new ArrayList<>();
        for (String entry : UNDOCUMENTED_STATUSES) {
            int space = entry.lastIndexOf(' ');
            if (!documentedStatuses(entry.substring(0, space)).contains(entry.substring(space + 1))) missing.add(entry);
        }
        assertEquals(List.of(), missing, "document these statuses in openapi.yaml, then empty UNDOCUMENTED_STATUSES");
    }

    // ---------------------------------------------------------------- S11 problem+json

    /** Every route with a body, sent an empty object by its allowed role: a documented 4xx Problem, never a 5xx. */
    @Test
    void s11ApplicationErrorsAreProblemJsonWithCodeAndTraceId() {
        Fixture.Company company = fixture.company("Problemas");
        UUID site = fixture.site(company, "Centro", BA);
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        List<String> failures = new ArrayList<>();
        for (Route route : ROUTES) {
            if (route.body() == null) continue;
            ApiClient owner = route.role() == Role.EMPLOYEE ? ana.client() : company.admin();
            Route empty = new Route(route.operation(), route.role(), route.request(), "{}", null);
            ApiClient.Response response = call(owner, empty, route.request(), site, null);
            String at = route.operation() + " {} -> " + response.status() + " " + response.code();
            if (response.status() < 400 || response.status() >= 500) failures.add(at);
            else if (!documentedStatuses(route.operation()).contains(Integer.toString(response.status()))) failures.add(at + ": undocumented status");
            problemShape(failures, at, response, true);
        }
        assertEquals(List.of(), failures);
        assertClean();
    }

    @Test
    void s11SecurityFilterProblemsCarryATraceId() {
        List<String> failures = new ArrayList<>();
        for (Route route : ROUTES) {
            if (route.operation().equals("DELETE /session")) continue;
            ApiClient.Response response = call(fixture.client("anonymous"), route, route.request(), UUID.randomUUID(), UUID.randomUUID());
            problemShape(failures, "anonymous " + route.operation(), response, true);
        }
        assertEquals(List.of(), failures);
    }

    @Test
    void s11FrameworkErrorsAreProblemJsonWithCode() {
        ApiClient admin = fixture.company("Marco").admin();
        Map<String, ApiClient.Response> sent = new LinkedHashMap<>();
        sent.put("unknown route", admin.get(API + "/does-not-exist"));
        sent.put("wrong method", admin.send("DELETE", API + "/sites", null, Map.of()));
        sent.put("unsupported media type", admin.raw("POST", API + "/sites", "text/plain", "name=Centro", Map.of("X-CSRF-TOKEN", csrf(admin))));
        sent.put("missing query parameter", admin.get(API + "/jornadas"));
        List<String> failures = new ArrayList<>();
        sent.forEach((name, response) -> {
            if (response.status() < 400 || response.status() >= 500) failures.add(name + ": " + response.status());
            problemShape(failures, name + " -> " + response.status(), response, true);
        });
        assertEquals(List.of(), failures);
    }

    // ---------------------------------------------------------------- S12 documented codes

    @Test
    void s12EveryCodeTheBackendEmitsIsDocumentedOrOnTheShrinkingList() throws IOException {
        Set<String> emitted = emittedCodes();
        // The scan must keep finding each way a code is written, or a new code could hide from it.
        assertTrue(emitted.containsAll(Set.of("NOT_FOUND", "FORBIDDEN", "VALIDATION_ERROR", "TOO_MANY_REQUESTS", "MOTIVE_LOCKED",
                "CURRENT_PASSWORD_INVALID", "SESSION_EXPIRED", "UNAUTHORIZED", "CONFLICT", "RETRYABLE_TRANSACTION_CONFLICT", "JORNADA_EXISTS",
                "TEMPLATE_REQUIRED", "INVALID_MARK_HISTORY", "INVALID_MARK_TRANSITION", "PASSWORD_CHANGE_REQUIRED")), emitted.toString());
        Set<String> documented = new TreeSet<>();
        Matcher token = Pattern.compile("\\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*\\b").matcher(Files.readString(OPENAPI, StandardCharsets.UTF_8));
        while (token.find()) documented.add(token.group());
        Set<String> undocumented = new TreeSet<>(emitted);
        undocumented.removeAll(documented);

        Set<String> newlyUndocumented = new TreeSet<>(undocumented);
        newlyUndocumented.removeAll(UNDOCUMENTED_CODES);
        assertEquals(Set.of(), newlyUndocumented, "document these codes in openapi.yaml");
        Set<String> fixed = new TreeSet<>(UNDOCUMENTED_CODES);
        fixed.removeAll(undocumented);
        assertEquals(Set.of(), fixed, "documented or gone: remove them from UNDOCUMENTED_CODES");
    }

    /** Code literals of src/main/java: ApiException factories and constructors, the handler, the security filter, constants and parameters. */
    private static Set<String> emittedCodes() throws IOException {
        Pattern literal = Pattern.compile("(?:ApiException\\.conflict\\(|new ApiException\\(\\s*HttpStatus\\.[A-Z_]+\\s*,"
                + "|\\b(?:response|problem|writeProblem)\\([^;\"]*?,)\\s*\"([A-Z][A-Z0-9_]+)\"");
        Pattern identifier = Pattern.compile("(?:ApiException\\.conflict\\(|new ApiException\\(\\s*HttpStatus\\.[A-Z_]+\\s*,)\\s*([A-Za-z_]\\w*)\\s*,");
        Set<String> codes = new TreeSet<>();
        try (Stream<Path> files = Files.walk(MAIN_SOURCES)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                String source = Files.readString(file, StandardCharsets.UTF_8);
                Matcher match = literal.matcher(source);
                while (match.find()) codes.add(match.group(1));
                match = identifier.matcher(source);
                while (match.find()) codes.addAll(resolve(source, match.group(1)));
            }
        }
        return codes;
    }

    /** A constant resolves to its value; a method parameter resolves to every code literal the method's callers in the file pass. */
    private static Set<String> resolve(String source, String name) {
        Set<String> codes = new TreeSet<>();
        Matcher constant = Pattern.compile("static final String " + name + "\\s*=\\s*\"([A-Z][A-Z0-9_]+)\"").matcher(source);
        if (constant.find()) return Set.of(constant.group(1));
        Matcher method = Pattern.compile("(\\w+)\\([^)]*\\bString " + name + "\\b[^)]*\\)").matcher(source);
        while (method.find()) {
            Matcher call = Pattern.compile("\\b" + method.group(1) + "\\(([^;{]*?)\\);").matcher(source);
            while (call.find()) {
                Matcher code = Pattern.compile("\"([A-Z][A-Z0-9_]+)\"").matcher(call.group(1));
                while (code.find()) codes.add(code.group(1));
            }
        }
        return codes;
    }

    // ---------------------------------------------------------------- helpers: requests

    private ApiClient.Response call(ApiClient client, Route route, String request, UUID site, UUID template) {
        String path = API + request.replace("{random}", UUID.randomUUID().toString()).replaceAll("\\{[A-Za-z]+}", UUID.randomUUID().toString());
        String body = route.body() == null ? null : fill(route.body(), site, template);
        return client.send(route.method(), path, body, Map.of("Idempotency-Key", UUID.randomUUID().toString()));
    }

    private static String fill(String body, UUID site, UUID template) {
        return body.replace("{site}", String.valueOf(site)).replace("{template}", String.valueOf(template))
                .replace("{dni}", Fixture.nextDni()).replace("{random}", UUID.randomUUID().toString());
    }

    private static Route route(String operation) {
        return ROUTES.stream().filter(route -> route.operation().equals(operation)).findFirst().orElseThrow();
    }

    private static UUID createdOn(JsonNode lot, String localDate) {
        for (JsonNode created : lot.get("created")) {
            if (created.get("localDate").asText().equals(localDate)) return UUID.fromString(created.get("id").asText());
        }
        throw new AssertionError("no jornada created on " + localDate + ": " + lot);
    }

    private String csrf(ApiClient client) {
        return client.get(API + "/csrf").expect(200).body().get("token").asText();
    }

    private static String p256dh() {
        byte[] point = new byte[65];
        point[0] = 0x04;
        return Base64.getUrlEncoder().withoutPadding().encodeToString(point);
    }

    // ---------------------------------------------------------------- helpers: contract checks

    /** A documented 2xx with a body that matches its documented schema; records the status for the coverage check. */
    private ApiClient.Response ok(String operation, ApiClient.Response response) {
        String status = Integer.toString(response.status());
        Map<String, Object> responses = map(operation(operation).get("responses"));
        if (!status.startsWith("2") || !responses.containsKey(status)) {
            throw new AssertionError(operation + " answered an undocumented " + status + ": " + response.raw());
        }
        observed.computeIfAbsent(operation, key -> new TreeSet<>()).add(status);
        Map<String, Object> content = map(resolve(map(responses.get(status))).get("content"));
        if (content.isEmpty()) {
            if (response.raw() != null && !response.raw().isBlank()) shapeFailures.add(operation + " " + status + ": documented without a body");
            return response;
        }
        String contentType = response.header("Content-Type");
        if (contentType == null || !contentType.startsWith("application/json")) shapeFailures.add(operation + " " + status + ": Content-Type " + contentType);
        validate(operation + " " + status + " $", map(content.get("application/json")).get("schema"), response.body(), shapeFailures);
        return response;
    }

    private void expectProblem(List<String> failures, String who, Route route, ApiClient.Response response, int status, String code, boolean traceId) {
        String at = who + " " + route.operation() + " -> " + response.status() + " " + response.code();
        if (response.status() != status || !code.equals(response.code())) {
            failures.add(at + " (expected " + status + " " + code + ")");
            return;
        }
        if (status != 401 && !documentedStatuses(route.operation()).contains(Integer.toString(status))
                && !UNDOCUMENTED_STATUSES.contains(route.operation() + " " + status)) failures.add(at + ": status not in openapi.yaml");
        problemShape(failures, at, response, traceId);
    }

    private void problemShape(List<String> failures, String at, ApiClient.Response response, boolean traceId) {
        String contentType = response.header("Content-Type");
        if (contentType == null || !contentType.startsWith("application/problem+json")) failures.add(at + ": Content-Type " + contentType);
        validate(at + " $", Map.of("$ref", "#/components/schemas/Problem"), response.body(), failures);
        if (traceId && (!response.body().hasNonNull("traceId") || response.body().get("traceId").asText().isBlank())) failures.add(at + ": no traceId");
    }

    /** A small JSON Schema check: $ref, oneOf/anyOf, allOf, type (with null), enum of strings, required, properties and items. */
    private void validate(String where, Object schemaNode, JsonNode value, List<String> failures) {
        Map<String, Object> schema = resolve(map(schemaNode));
        if (value == null || value.isMissingNode()) {
            failures.add(where + ": no body");
            return;
        }
        Object branches = schema.containsKey("oneOf") ? schema.get("oneOf") : schema.get("anyOf");
        if (branches != null) {
            for (Object branch : list(branches)) {
                List<String> attempt = new ArrayList<>();
                validate(where, branch, value, attempt);
                if (attempt.isEmpty()) return;
            }
            failures.add(where + ": matches no oneOf branch: " + value);
            return;
        }
        for (Object part : list(schema.get("allOf"))) validate(where, part, value, failures);
        List<String> types = types(schema);
        if (!types.isEmpty() && types.stream().noneMatch(type -> matches(type, value))) {
            failures.add(where + ": expected " + types + " but got " + value.getNodeType() + " " + value);
            return;
        }
        if (value.isTextual() && schema.containsKey("enum") && !list(schema.get("enum")).contains(value.asText())) {
            failures.add(where + ": " + value + " is not in " + schema.get("enum"));
        }
        Map<String, Object> properties = map(schema.get("properties"));
        if (value.isObject()) {
            for (Object required : list(schema.get("required"))) {
                String name = (String) required;
                if (value.has(name)) continue;
                if (properties.containsKey(name) && allowsNull(properties.get(name))) omittedNullables.add(where.replaceAll("\\[\\d+]", "[]") + "." + name);
                else failures.add(where + "." + name + ": required but absent");
            }
            properties.forEach((name, property) -> {
                if (value.has(name)) validate(where + "." + name, property, value.get(name), failures);
            });
        }
        if (value.isArray() && schema.containsKey("items")) {
            for (int index = 0; index < value.size(); index++) validate(where + "[" + index + "]", schema.get("items"), value.get(index), failures);
        }
    }

    private boolean allowsNull(Object schemaNode) {
        Map<String, Object> schema = resolve(map(schemaNode));
        if (types(schema).contains("null") || list(schema.get("enum")).contains(null)) return true;
        Object branches = schema.containsKey("oneOf") ? schema.get("oneOf") : schema.get("anyOf");
        return list(branches).stream().anyMatch(this::allowsNull);
    }

    private static boolean matches(String type, JsonNode value) {
        return switch (type) {
            case "string" -> value.isTextual();
            case "integer" -> value.isIntegralNumber();
            case "number" -> value.isNumber();
            case "boolean" -> value.isBoolean();
            case "array" -> value.isArray();
            case "object" -> value.isObject();
            case "null" -> value.isNull();
            default -> throw new IllegalStateException("unknown schema type " + type);
        };
    }

    private static List<String> types(Map<String, Object> schema) {
        Object type = schema.get("type");
        if (type == null) return List.of();
        return type instanceof List<?> many ? many.stream().map(String::valueOf).toList() : List.of(String.valueOf(type));
    }

    // ---------------------------------------------------------------- helpers: openapi.yaml

    private static synchronized Map<String, Object> openapi() {
        if (openapi == null) {
            try {
                openapi = new Yaml().load(Files.readString(OPENAPI, StandardCharsets.UTF_8));
            } catch (IOException ex) {
                throw new IllegalStateException(ex);
            }
        }
        return openapi;
    }

    private static Set<String> documentedOperations() {
        Set<String> operations = new TreeSet<>();
        map(openapi().get("paths")).forEach((path, item) -> map(item).keySet().stream()
                .filter(Set.of("get", "post", "put", "patch", "delete")::contains)
                .forEach(method -> operations.add(method.toUpperCase() + " " + path)));
        return operations;
    }

    private static Set<String> nonPublicOperations() {
        Set<String> operations = documentedOperations();
        operations.removeAll(PUBLIC);
        return operations;
    }

    private static Map<String, Set<String>> documentedSuccess() {
        Map<String, Set<String>> success = new TreeMap<>();
        for (String operation : documentedOperations()) {
            success.put(operation, new TreeSet<>(documentedStatuses(operation).stream().filter(status -> status.startsWith("2")).toList()));
        }
        return success;
    }

    private static Set<String> documentedStatuses(String operation) {
        return map(operation(operation).get("responses")).keySet();
    }

    private static Map<String, Object> operation(String operation) {
        int space = operation.indexOf(' ');
        Map<String, Object> item = map(map(openapi().get("paths")).get(operation.substring(space + 1)));
        Map<String, Object> found = map(item.get(operation.substring(0, space).toLowerCase()));
        if (found.isEmpty()) throw new AssertionError(operation + " is not in openapi.yaml");
        return found;
    }

    private static Map<String, Object> resolve(Map<String, Object> node) {
        Map<String, Object> current = node;
        while (current.containsKey("$ref")) {
            Map<String, Object> target = openapi();
            for (String segment : ((String) current.get("$ref")).substring(2).split("/")) target = map(target.get(segment));
            current = target;
        }
        return current;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object node) {
        if (node == null) return Map.of();
        Map<String, Object> copy = new LinkedHashMap<>();
        ((Map<Object, Object>) node).forEach((key, value) -> copy.put(String.valueOf(key), value));
        return copy;
    }

    private static List<Object> list(Object node) {
        return node == null ? new ArrayList<>() : new ArrayList<>((List<?>) node);
    }

    private void assertClean() {
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
        assertEquals(List.of(), httpLog.serverErrors());
    }
}
