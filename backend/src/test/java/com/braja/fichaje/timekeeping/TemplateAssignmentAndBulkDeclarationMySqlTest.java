package com.braja.fichaje.timekeeping;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * Issue #59: template assignment per employee with a start date and history (D-20261015-02) and bulk declaration of jornadas by
 * date range and weekdays (D-20261027-11). Every rule goes through HTTP against MySQL 8.4 and asserts status, code, body and the
 * persisted rows. 2026-11-02 is a Monday; the site zone (Buenos Aires) is UTC-3 all year.
 */
@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class TemplateAssignmentAndBulkDeclarationMySqlTest {
    private static final String AES_KEY = java.util.Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = java.util.Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    private static final String PASSWORD = "CorrectHorseBattery9!";
    private static final String ZONE = "America/Argentina/Buenos_Aires";
    private static String passwordHash;

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja_assignment_bulk_test")
            .withUsername("braja_test")
            .withPassword("braja_test_password");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("braja.health-encryption-key-base64", () -> AES_KEY);
        registry.add("braja.login-ip-throttle-key-base64", () -> LOGIN_IP_THROTTLE_KEY);
        registry.add("braja.push-subscription-encryption-key-base64", () -> "");
        registry.add("braja.vapid-public-key", () -> "");
        registry.add("braja.vapid-private-key", () -> "");
        registry.add("braja.vapid-subject", () -> "");
        registry.add("braja.session-cookie-secure", () -> "false");
        registry.add("server.servlet.session.cookie.secure", () -> "false");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired PasswordEncoder passwordEncoder;

    private UUID companyId;
    private UUID siteId;
    private UUID otherSiteId;
    private UUID adminAccountId;
    private UUID first;
    private UUID second;
    private UUID otherSiteOnly;
    private UUID morning;
    private UUID afternoon;
    private UUID otherSiteTemplate;
    private String adminDni;
    private String firstDni;
    private String suffix;
    private Timestamp ts;

    @BeforeEach
    void setUp() {
        if (passwordHash == null) passwordHash = passwordEncoder.encode(PASSWORD);
        ts = Timestamp.from(Instant.now().truncatedTo(ChronoUnit.MICROS));
        suffix = String.format("%08d", Math.floorMod(System.nanoTime(), 100_000_000L));
        companyId = UUID.randomUUID();
        siteId = UUID.randomUUID();
        otherSiteId = UUID.randomUUID();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), "Bulk " + suffix, ts);
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", siteId.toString(), companyId.toString(), "Centro", ZONE, ts);
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", otherSiteId.toString(), companyId.toString(), "Norte", ZONE, ts);
        adminDni = "1" + suffix;
        adminAccountId = account(adminDni);
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'ADMIN',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), adminAccountId.toString(), ts);
        firstDni = "2" + suffix;
        first = employee(companyId, firstDni, 10, true, siteId, otherSiteId);
        second = employee(companyId, "3" + suffix, 15, true, siteId);
        otherSiteOnly = employee(companyId, "4" + suffix, 5, true, otherSiteId);
        morning = template(companyId, siteId, "Mañana", "08:00:00", "16:00:00");
        afternoon = template(companyId, siteId, "Tarde", "14:00:00", "22:00:00");
        otherSiteTemplate = template(companyId, otherSiteId, "Norte", "09:00:00", "17:00:00");
    }

    // Feature 1 (D-20261015-02): template assignment per employee with a start date, keeping the history.

    @Test
    void anAssignmentIsStoredWithItsAuthorAndTheHistoryIsListedNewestFirst() throws Exception {
        Login admin = login(adminDni);

        MvcResult created = send(admin, post("/api/v1/employees/{id}/template-assignments", first), assignmentBody(morning, "2026-11-01"));
        assertEquals(201, created.getResponse().getStatus(), created.getResponse().getContentAsString());
        JsonNode body = json(created);
        UUID assignmentId = UUID.fromString(body.get("id").asText());
        assertEquals(first.toString(), body.get("employeeId").asText());
        assertEquals(siteId.toString(), body.get("siteId").asText());
        assertEquals(morning.toString(), body.get("templateId").asText());
        assertEquals("Mañana", body.get("templateName").asText());
        assertEquals("2026-11-01", body.get("validFrom").asText());
        assertEquals(adminAccountId.toString(), jdbc.queryForObject("SELECT created_by FROM employee_template_assignments WHERE id=?", String.class, assignmentId.toString()));
        assertEquals(Instant.parse(body.get("createdAt").asText()),
                jdbc.queryForObject("SELECT created_at FROM employee_template_assignments WHERE id=?", Timestamp.class, assignmentId.toString()).toInstant());
        assertEquals(201, send(admin, post("/api/v1/employees/{id}/template-assignments", first), assignmentBody(afternoon, "2026-11-10")).getResponse().getStatus());
        assertEquals(201, send(admin, post("/api/v1/employees/{id}/template-assignments", first), assignmentBody(otherSiteTemplate, "2026-11-05")).getResponse().getStatus());

        JsonNode history = json(mockMvc.perform(get("/api/v1/employees/{id}/template-assignments", first).cookie(admin.session())).andReturn());

        // A change never edits or deletes a previous row: the history keeps all three, newest start date first.
        assertEquals(List.of("2026-11-10", "2026-11-05", "2026-11-01"), texts(history, "validFrom"));
        assertEquals(List.of("Tarde", "Norte", "Mañana"), texts(history, "templateName"));
        assertEquals(List.of(siteId.toString(), otherSiteId.toString(), siteId.toString()), texts(history, "siteId"));
        assertEquals(3, count("SELECT COUNT(*) FROM employee_template_assignments WHERE employee_id=?", first.toString()));
        assertEquals(0, json(mockMvc.perform(get("/api/v1/employees/{id}/template-assignments", second).cookie(admin.session())).andReturn()).size());
    }

    @Test
    void anAssignmentNeedsTheEmployeeAtTheTemplatesSiteADateWithinBoundsAnAdminAndIdsOfTheCompany() throws Exception {
        Login admin = login(adminDni);
        UUID foreignCompany = UUID.randomUUID();
        UUID foreignSite = UUID.randomUUID();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", foreignCompany.toString(), "Otra " + suffix, ts);
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", foreignSite.toString(), foreignCompany.toString(), "Ajena", ZONE, ts);
        UUID foreignTemplate = template(foreignCompany, foreignSite, "Ajena", "08:00:00", "16:00:00");
        UUID foreignEmployee = employee(foreignCompany, "5" + suffix, 5, true, foreignSite);

        assertProblem(send(admin, post("/api/v1/employees/{id}/template-assignments", second), assignmentBody(otherSiteTemplate, "2026-11-01")), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post("/api/v1/employees/{id}/template-assignments", first), assignmentBody(morning, "1999-12-31")), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post("/api/v1/employees/{id}/template-assignments", first), "{\"templateId\":\"" + morning + "\"}"), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post("/api/v1/employees/{id}/template-assignments", first), assignmentBody(foreignTemplate, "2026-11-01")), 404, "NOT_FOUND");
        assertProblem(send(admin, post("/api/v1/employees/{id}/template-assignments", foreignEmployee), assignmentBody(morning, "2026-11-01")), 404, "NOT_FOUND");
        assertProblem(mockMvc.perform(get("/api/v1/employees/{id}/template-assignments", foreignEmployee).cookie(admin.session())).andReturn(), 404, "NOT_FOUND");
        Login employee = login(firstDni);
        assertProblem(send(employee, post("/api/v1/employees/{id}/template-assignments", first), assignmentBody(morning, "2026-11-01")), 403, "FORBIDDEN");
        assertProblem(mockMvc.perform(get("/api/v1/employees/{id}/template-assignments", first).cookie(employee.session())).andReturn(), 403, "FORBIDDEN");

        assertEquals(0, count("SELECT COUNT(*) FROM employee_template_assignments WHERE company_id IN (?,?)", companyId.toString(), foreignCompany.toString()));
    }

    @Test
    void reusingTheSameEmployeeSiteAndStartDateIsAConflictAndKeepsTheFirstAssignment() throws Exception {
        Login admin = login(adminDni);
        assertEquals(201, send(admin, post("/api/v1/employees/{id}/template-assignments", first), assignmentBody(morning, "2026-11-01")).getResponse().getStatus());

        assertProblem(send(admin, post("/api/v1/employees/{id}/template-assignments", first), assignmentBody(afternoon, "2026-11-01")), 409, "ASSIGNMENT_EXISTS");

        assertEquals(morning.toString(), jdbc.queryForObject("SELECT template_id FROM employee_template_assignments WHERE employee_id=? AND site_id=?", String.class, first.toString(), siteId.toString()));
        // The same start date at another site is a different assignment.
        assertEquals(201, send(admin, post("/api/v1/employees/{id}/template-assignments", first), assignmentBody(otherSiteTemplate, "2026-11-01")).getResponse().getStatus());
    }

    @Test
    void declaringWithoutTemplateUsesTheAssignmentInForceOnThatDateAtThatSite() throws Exception {
        Login admin = login(adminDni);
        assign(admin, first, morning, "2026-11-01");
        assign(admin, first, afternoon, "2026-11-10");

        MvcResult before = send(admin, post("/api/v1/jornadas"), declareBody(first, siteId, "2026-11-09", null));
        MvcResult from = send(admin, post("/api/v1/jornadas"), declareBody(first, siteId, "2026-11-10", null));

        assertEquals(201, before.getResponse().getStatus(), before.getResponse().getContentAsString());
        assertEquals("Mañana", json(before).get("scheduleSnapshot").get("name").asText());
        assertEquals(morning.toString(), templateOf(json(before)));
        assertEquals(201, from.getResponse().getStatus(), from.getResponse().getContentAsString());
        assertEquals("Tarde", json(from).get("scheduleSnapshot").get("name").asText());
        assertEquals(afternoon.toString(), templateOf(json(from)));
        assertEquals(Instant.parse("2026-11-10T17:00:00Z"), scheduledStart(json(from)));
        // Before the first assignment, or at a site without one, there is no template in force.
        assertProblem(send(admin, post("/api/v1/jornadas"), declareBody(first, siteId, "2026-10-31", null)), 422, "TEMPLATE_REQUIRED");
        assertProblem(send(admin, post("/api/v1/jornadas"), declareBody(first, otherSiteId, "2026-11-12", null)), 422, "TEMPLATE_REQUIRED");
        assertEquals(2, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=?", first.toString()));
    }

    @Test
    void aTemplateGivenForADayOverridesTheAssignmentAndDeclaringKeepsItsPreviousRules() throws Exception {
        Login admin = login(adminDni);
        assign(admin, first, morning, "2026-11-01");

        MvcResult override = send(admin, post("/api/v1/jornadas"), declareBody(first, siteId, "2026-11-04", afternoon));

        assertEquals(201, override.getResponse().getStatus(), override.getResponse().getContentAsString());
        assertEquals("Tarde", json(override).get("scheduleSnapshot").get("name").asText());
        assertEquals(afternoon.toString(), templateOf(json(override)));
        assertEquals(10, json(override).get("toleranceMinutes").asInt());
        // Previous behaviour kept: a second live declaration, with or without template, is JORNADA_EXISTS.
        assertProblem(send(admin, post("/api/v1/jornadas"), declareBody(first, siteId, "2026-11-04", afternoon)), 409, "JORNADA_EXISTS");
        assertProblem(send(admin, post("/api/v1/jornadas"), declareBody(first, siteId, "2026-11-04", null)), 409, "JORNADA_EXISTS");
        // A template of another site, or an employee not at the site, is still NOT_FOUND.
        assertProblem(send(admin, post("/api/v1/jornadas"), declareBody(first, siteId, "2026-11-05", otherSiteTemplate)), 404, "NOT_FOUND");
        assertProblem(send(admin, post("/api/v1/jornadas"), declareBody(otherSiteOnly, siteId, "2026-11-05", morning)), 404, "NOT_FOUND");
        assertEquals(1, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=?", first.toString()));
    }

    @Test
    void aTemplateWithAssignmentsCannotMoveToAnotherSiteButAnUnusedOneStillCan() throws Exception {
        Login admin = login(adminDni);
        assign(admin, first, morning, "2026-11-01");

        assertProblem(send(admin, patch("/api/v1/templates/{id}", morning), templateBody(otherSiteId)), 409, "TEMPLATE_IN_USE");
        assertEquals(siteId.toString(), jdbc.queryForObject("SELECT site_id FROM schedule_templates WHERE id=?", String.class, morning.toString()));

        MvcResult moved = send(admin, patch("/api/v1/templates/{id}", afternoon), templateBody(otherSiteId));
        assertEquals(200, moved.getResponse().getStatus(), moved.getResponse().getContentAsString());
        assertEquals(otherSiteId.toString(), jdbc.queryForObject("SELECT site_id FROM schedule_templates WHERE id=?", String.class, afternoon.toString()));
    }

    // Feature 2 (D-20261027-11): bulk declaration by range and weekdays, created once, no stored rule.

    @Test
    void bulkCreatesOneJornadaPerSelectedWeekdayExactlyAsASingleDeclaration() throws Exception {
        Login admin = login(adminDni);
        UUID single = UUID.fromString(json(send(admin, post("/api/v1/jornadas"), declareBody(second, siteId, "2026-11-16", morning))).get("id").asText());

        MvcResult result = send(admin, post("/api/v1/jornadas/bulk"), bulkBody(List.of(first, second), siteId, "2026-11-02", "2026-11-08", List.of(1, 3, 5), morning));

        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        JsonNode body = json(result);
        assertEquals(0, body.get("skipped").size());
        assertEquals(6, body.get("created").size());
        Map<String, List<String>> datesByEmployee = new HashMap<>();
        for (JsonNode created : body.get("created")) {
            assertEquals(siteId.toString(), created.get("siteId").asText());
            assertEquals("NO_INGRESO", created.get("state").asText());
            assertEquals(created.get("localDate").asText(), jdbc.queryForObject("SELECT local_date FROM jornadas WHERE id=?", String.class, created.get("id").asText()));
            datesByEmployee.computeIfAbsent(created.get("employeeId").asText(), key -> new ArrayList<>()).add(created.get("localDate").asText());
        }
        assertEquals(List.of("2026-11-02", "2026-11-04", "2026-11-06"), datesByEmployee.get(first.toString()));
        assertEquals(List.of("2026-11-02", "2026-11-04", "2026-11-06"), datesByEmployee.get(second.toString()));
        assertEquals(3, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=? AND local_date BETWEEN '2026-11-02' AND '2026-11-08'", first.toString()));
        // Same snapshot, schedule, tolerance of each employee, author and initial state as POST /jornadas.
        String bulkSecond = jdbc.queryForObject("SELECT id FROM jornadas WHERE employee_id=? AND local_date='2026-11-02'", String.class, second.toString());
        assertEquals(jdbc.queryForObject("SELECT CAST(schedule_snapshot AS CHAR) FROM jornadas WHERE id=?", String.class, single.toString()),
                jdbc.queryForObject("SELECT CAST(schedule_snapshot AS CHAR) FROM jornadas WHERE id=?", String.class, bulkSecond));
        assertEquals(Instant.parse("2026-11-02T11:00:00Z"), jdbc.queryForObject("SELECT scheduled_start_at FROM jornadas WHERE id=?", Timestamp.class, bulkSecond).toInstant());
        assertEquals(Instant.parse("2026-11-02T19:00:00Z"), jdbc.queryForObject("SELECT scheduled_end_at FROM jornadas WHERE id=?", Timestamp.class, bulkSecond).toInstant());
        assertEquals(15, count("SELECT tolerance_minutes FROM jornadas WHERE id=?", bulkSecond));
        assertEquals(10, count("SELECT tolerance_minutes FROM jornadas WHERE employee_id=? AND local_date='2026-11-02'", first.toString()));
        assertEquals(6, count("SELECT COUNT(*) FROM jornadas WHERE company_id=? AND created_by=? AND template_id=? AND state='NO_INGRESO' AND next_sequence=1 AND time_zone=? AND local_date BETWEEN '2026-11-02' AND '2026-11-08'",
                companyId.toString(), adminAccountId.toString(), morning.toString(), ZONE));
        // The response jornada is the stored one: GET shows the same snapshot a single declaration would.
        JsonNode view = json(mockMvc.perform(get("/api/v1/jornadas/{id}", bulkSecond).cookie(admin.session())).andReturn());
        assertEquals("Mañana", view.get("scheduleSnapshot").get("name").asText());
    }

    @Test
    void bulkWithoutTemplateUsesEachEmployeesAssignmentInForceAndReportsDatesWithoutOne() throws Exception {
        Login admin = login(adminDni);
        assign(admin, first, morning, "2026-11-04");
        assign(admin, first, afternoon, "2026-11-06");

        MvcResult result = send(admin, post("/api/v1/jornadas/bulk"), bulkBody(List.of(first, second), siteId, "2026-11-02", "2026-11-08", List.of(1, 2, 3, 4, 5, 6, 7), null));

        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        JsonNode body = json(result);
        assertEquals(List.of("2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"), texts(body.get("created"), "localDate"));
        assertEquals(List.of("Mañana", "Mañana", "Tarde", "Tarde", "Tarde"),
                jdbc.query("SELECT JSON_UNQUOTE(JSON_EXTRACT(schedule_snapshot,'$.name')) FROM jornadas WHERE employee_id=? ORDER BY local_date", (rs, row) -> rs.getString(1), first.toString()));
        Map<String, List<String>> skipped = new HashMap<>();
        for (JsonNode item : body.get("skipped")) {
            assertEquals("TEMPLATE_REQUIRED", item.get("reason").asText());
            skipped.computeIfAbsent(item.get("employeeId").asText(), key -> new ArrayList<>()).add(item.get("localDate").asText());
        }
        assertEquals(List.of("2026-11-02", "2026-11-03"), skipped.get(first.toString()));
        assertEquals(IntStream.rangeClosed(2, 8).mapToObj(day -> "2026-11-0" + day).toList(), skipped.get(second.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=?", second.toString()));
    }

    @Test
    void bulkSkipsAndReportsExistingJornadasButNotCancelledOnes() throws Exception {
        Login admin = login(adminDni);
        UUID existing = UUID.fromString(json(send(admin, post("/api/v1/jornadas"), declareBody(first, siteId, "2026-11-03", afternoon))).get("id").asText());
        UUID cancelled = UUID.fromString(json(send(admin, post("/api/v1/jornadas"), declareBody(first, siteId, "2026-11-04", afternoon))).get("id").asText());
        assertEquals(200, send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", cancelled), "{\"reason\":\"Feriado\"}").getResponse().getStatus());

        MvcResult result = send(admin, post("/api/v1/jornadas/bulk"), bulkBody(List.of(first), siteId, "2026-11-03", "2026-11-04", List.of(2, 3), morning));

        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        JsonNode body = json(result);
        assertEquals(List.of("2026-11-04"), texts(body.get("created"), "localDate"));
        assertEquals(1, body.get("skipped").size());
        assertEquals(first.toString(), body.get("skipped").get(0).get("employeeId").asText());
        assertEquals("2026-11-03", body.get("skipped").get(0).get("localDate").asText());
        assertEquals("JORNADA_EXISTS", body.get("skipped").get(0).get("reason").asText());
        // The existing jornada is untouched; the cancelled one stays cancelled next to the new one.
        assertEquals(afternoon.toString(), jdbc.queryForObject("SELECT template_id FROM jornadas WHERE id=?", String.class, existing.toString()));
        assertEquals(2, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=? AND local_date='2026-11-04'", first.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=? AND local_date='2026-11-04' AND state='NO_INGRESO' AND template_id=?", first.toString(), morning.toString()));
    }

    @Test
    void bulkRejectsTheWholeRequestWhenAnEmployeeIsNotAssignedToTheSiteOrInactive() throws Exception {
        Login admin = login(adminDni);
        UUID inactive = employee(companyId, "6" + suffix, 5, false, siteId);

        assertProblem(send(admin, post("/api/v1/jornadas/bulk"), bulkBody(List.of(first, otherSiteOnly), siteId, "2026-11-02", "2026-11-06", List.of(1, 2, 3, 4, 5), morning)), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post("/api/v1/jornadas/bulk"), bulkBody(List.of(first, inactive), siteId, "2026-11-02", "2026-11-06", List.of(1, 2, 3, 4, 5), morning)), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post("/api/v1/jornadas/bulk"), bulkBody(List.of(first, UUID.randomUUID()), siteId, "2026-11-02", "2026-11-06", List.of(1), morning)), 404, "NOT_FOUND");

        assertEquals(0, count("SELECT COUNT(*) FROM jornadas WHERE company_id=?", companyId.toString()));
    }

    @Test
    void bulkBoundsAndScopeAreValidatedBeforeWritingAnything() throws Exception {
        Login admin = login(adminDni);
        String path = "/api/v1/jornadas/bulk";
        List<UUID> one = List.of(first);

        assertProblem(send(admin, post(path), bulkBody(one, siteId, "2026-11-01", "2026-12-02", List.of(1), morning)), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post(path), bulkBody(one, siteId, "2026-11-08", "2026-11-02", List.of(1), morning)), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post(path), bulkBody(one, siteId, "2101-01-01", "2101-01-02", List.of(1), morning)), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post(path), bulkBody(one, siteId, "2026-11-02", "2026-11-08", List.of(), morning)), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post(path), bulkBody(one, siteId, "2026-11-02", "2026-11-08", List.of(0), morning)), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post(path), bulkBody(one, siteId, "2026-11-02", "2026-11-08", List.of(8), morning)), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post(path), bulkBody(List.of(), siteId, "2026-11-02", "2026-11-08", List.of(1), morning)), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post(path), bulkBody(List.of(first, first), siteId, "2026-11-02", "2026-11-08", List.of(1), morning)), 422, "VALIDATION_ERROR");
        List<UUID> tooMany = IntStream.range(0, 201).mapToObj(i -> UUID.randomUUID()).collect(Collectors.toList());
        assertProblem(send(admin, post(path), bulkBody(tooMany, siteId, "2026-11-02", "2026-11-08", List.of(1), morning)), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post(path), bulkBody(one, UUID.randomUUID(), "2026-11-02", "2026-11-08", List.of(1), morning)), 404, "NOT_FOUND");
        assertProblem(send(admin, post(path), bulkBody(one, siteId, "2026-11-02", "2026-11-08", List.of(1), otherSiteTemplate)), 404, "NOT_FOUND");
        assertProblem(send(login(firstDni), post(path), bulkBody(one, siteId, "2026-11-02", "2026-11-08", List.of(1), morning)), 403, "FORBIDDEN");
        assertEquals(0, count("SELECT COUNT(*) FROM jornadas WHERE company_id=?", companyId.toString()));

        // 31 days inclusive is the largest range.
        MvcResult longest = send(admin, post(path), bulkBody(one, siteId, "2026-11-01", "2026-12-01", List.of(1, 2, 3, 4, 5, 6, 7), morning));
        assertEquals(200, longest.getResponse().getStatus(), longest.getResponse().getContentAsString());
        assertEquals(31, json(longest).get("created").size());
    }

    @Test
    void bulkAndSingleDeclarationsOfTheSameDaysAtTheSameTimeYieldOneJornadaPerDayAndNo5xx() throws Exception {
        List<String> dates = IntStream.rangeClosed(16, 22).mapToObj(day -> "2026-11-" + day).toList();
        Login bulkAdmin = login(adminDni);
        List<Login> singleAdmins = new ArrayList<>();
        for (int i = 0; i < dates.size(); i++) singleAdmins.add(login(adminDni));
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(dates.size() + 1);
        Future<MvcResult> bulk = pool.submit(() -> { start.await(); return send(bulkAdmin, post("/api/v1/jornadas/bulk"),
                bulkBody(List.of(first, second), siteId, "2026-11-16", "2026-11-22", List.of(1, 2, 3, 4, 5, 6, 7), morning)); });
        List<Future<MvcResult>> singles = new ArrayList<>();
        for (int i = 0; i < dates.size(); i++) {
            Login admin = singleAdmins.get(i);
            String date = dates.get(i);
            singles.add(pool.submit(() -> { start.await(); return send(admin, post("/api/v1/jornadas"), declareBody(first, siteId, date, morning)); }));
        }
        start.countDown();

        MvcResult bulkResult = bulk.get(60, TimeUnit.SECONDS);
        int singleCreated = 0;
        for (Future<MvcResult> future : singles) {
            MvcResult result = future.get(60, TimeUnit.SECONDS);
            int status = result.getResponse().getStatus();
            if (status == 201) singleCreated++;
            else if (status != 409 || !"JORNADA_EXISTS".equals(json(result).get("code").asText())) fail("unexpected single answer " + status + " " + result.getResponse().getContentAsString());
        }
        pool.shutdownNow();

        assertEquals(200, bulkResult.getResponse().getStatus(), bulkResult.getResponse().getContentAsString());
        JsonNode body = json(bulkResult);
        long bulkCreatedForFirst = 0;
        for (JsonNode created : body.get("created")) if (first.toString().equals(created.get("employeeId").asText())) bulkCreatedForFirst++;
        assertEquals(7, bulkCreatedForFirst + singleCreated);
        assertEquals(singleCreated, body.get("skipped").size());
        for (JsonNode item : body.get("skipped")) {
            assertEquals(first.toString(), item.get("employeeId").asText());
            assertEquals("JORNADA_EXISTS", item.get("reason").asText());
        }
        for (String date : dates) {
            assertEquals(1, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=? AND site_id=? AND local_date=?", first.toString(), siteId.toString(), date));
            assertEquals(1, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=? AND site_id=? AND local_date=?", second.toString(), siteId.toString(), date));
        }
    }

    private void assign(Login admin, UUID employee, UUID template, String validFrom) throws Exception {
        MvcResult result = send(admin, post("/api/v1/employees/{id}/template-assignments", employee), assignmentBody(template, validFrom));
        assertEquals(201, result.getResponse().getStatus(), result.getResponse().getContentAsString());
    }

    private String templateOf(JsonNode jornada) {
        return jdbc.queryForObject("SELECT template_id FROM jornadas WHERE id=?", String.class, jornada.get("id").asText());
    }

    private Instant scheduledStart(JsonNode jornada) {
        return jdbc.queryForObject("SELECT scheduled_start_at FROM jornadas WHERE id=?", Timestamp.class, jornada.get("id").asText()).toInstant();
    }

    private UUID account(String dni) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                id.toString(), dni, dni, passwordHash, ts, ts);
        return id;
    }

    private UUID employee(UUID company, String dni, int tolerance, boolean active, UUID... sites) {
        UUID accountId = account(dni);
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',?,?)",
                UUID.randomUUID().toString(), company.toString(), accountId.toString(), active, ts);
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                id.toString(), company.toString(), accountId.toString(), "Persona " + dni, tolerance, active, ts, ts);
        for (UUID site : sites) jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)", company.toString(), id.toString(), site.toString(), ts);
        return id;
    }

    private UUID template(UUID company, UUID site, String name, String start, String end) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,?,20,30,TRUE,?,?)",
                id.toString(), company.toString(), site.toString(), name, ts, ts);
        jdbc.update("INSERT INTO template_blocks(id,company_id,template_id,sequence_number,start_day_offset,starts_at,ends_at,end_day_offset) VALUES(?,?,?,1,0,?,?,0)",
                UUID.randomUUID().toString(), company.toString(), id.toString(), start, end);
        return id;
    }

    private static String assignmentBody(UUID template, String validFrom) {
        return "{\"templateId\":\"" + template + "\",\"validFrom\":\"" + validFrom + "\"}";
    }

    private static String declareBody(UUID employee, UUID site, String localDate, UUID template) {
        return "{\"employeeId\":\"" + employee + "\",\"siteId\":\"" + site + "\",\"localDate\":\"" + localDate + "\""
                + (template == null ? "" : ",\"templateId\":\"" + template + "\"") + "}";
    }

    private static String bulkBody(List<UUID> employees, UUID site, String from, String to, List<Integer> weekdays, UUID template) {
        String ids = employees.stream().map(id -> "\"" + id + "\"").collect(Collectors.joining(","));
        String days = weekdays.stream().map(String::valueOf).collect(Collectors.joining(","));
        return "{\"employeeIds\":[" + ids + "],\"siteId\":\"" + site + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\",\"weekdays\":[" + days + "]"
                + (template == null ? "" : ",\"templateId\":\"" + template + "\"") + "}";
    }

    private static String templateBody(UUID site) {
        return "{\"siteId\":\"" + site + "\",\"name\":\"Movida\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],"
                + "\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
    }

    private static List<String> texts(JsonNode array, String field) {
        List<String> values = new ArrayList<>();
        array.forEach(node -> values.add(node.get(field).asText()));
        return values;
    }

    private MvcResult send(Login login, MockHttpServletRequestBuilder request, String body) throws Exception {
        return mockMvc.perform(request.cookie(login.session()).header("X-CSRF-TOKEN", login.csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
    }

    private void assertProblem(MvcResult result, int status, String code) throws Exception {
        assertEquals(status, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        assertEquals("application/problem+json", result.getResponse().getContentType());
        assertEquals(code, json(result).get("code").asText());
    }

    /** Logs in over HTTP and reads the CSRF token the authenticated session holds afterwards. */
    private Login login(String dni) throws Exception {
        MvcResult csrf = mockMvc.perform(get("/api/v1/csrf")).andReturn();
        String token = json(csrf).get("token").asText();
        Cookie anonymous = cookie(csrf);
        MvcResult login = mockMvc.perform(post("/api/v1/session").cookie(anonymous).header("X-CSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"dni\":\"" + dni + "\",\"password\":\"" + PASSWORD + "\"}")).andReturn();
        assertEquals(200, login.getResponse().getStatus(), login.getResponse().getContentAsString());
        Cookie session = cookie(login);
        String current = json(mockMvc.perform(get("/api/v1/csrf").cookie(session)).andReturn()).get("token").asText();
        return new Login(session, current);
    }

    private Cookie cookie(MvcResult result) {
        String header = result.getResponse().getHeaders("Set-Cookie").stream().filter(h -> h.startsWith("BRAJA_SESSION=")).findFirst()
                .orElseThrow(() -> new AssertionError("Missing BRAJA_SESSION cookie"));
        String pair = header.split(";", 2)[0];
        return new Cookie("BRAJA_SESSION", pair.substring(pair.indexOf('=') + 1));
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private int count(String sql, Object... args) {
        Integer result = jdbc.queryForObject(sql, Integer.class, args);
        return result == null ? 0 : result;
    }

    private record Login(Cookie session, String csrf) { }
}
