package com.braja.fichaje.deviations;

import com.braja.fichaje.security.ScopeService;
import com.braja.fichaje.timekeeping.MarkAction;
import com.braja.fichaje.timekeeping.MarkService;
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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Issue #31: inbox filters, per-employee history, display name in session and deviation fact time. */
@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AdminHistoryFiltersMySqlTest {
    private static final String AES_KEY = java.util.Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = java.util.Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    private static final String PASSWORD = "CorrectHorseBattery9!";
    private static final String ZONE = "America/Argentina/Buenos_Aires";
    private static final LocalDate D1 = LocalDate.of(2026, 3, 2);
    private static final LocalDate D2 = LocalDate.of(2026, 3, 10);

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja")
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
    @Autowired MarkService marks;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    private UUID companyA, siteS1, siteS2, templateS1, templateS2;
    private UUID companyB, siteB, templateB;
    private UUID adminA, accountE1, accountE2, adminB, accountEB;
    private UUID employee1, employee2, employeeB;
    private String lastCsrf;

    @BeforeEach
    void setUp() {
        for (String table : List.of("notification_outbox_events", "notification_company_state", "notification_windows", "deviation_audits",
                "forgotten_mark_audits", "mark_correction_audits", "mark_idempotency", "deviations", "mark_events", "jornadas",
                "template_blocks", "schedule_templates", "employee_sites", "employees", "company_memberships", "accounts", "sites", "companies")) {
            jdbc.update("DELETE FROM " + table);
        }
        companyA = company("Empresa A");
        siteS1 = site(companyA, "Sede 1");
        siteS2 = site(companyA, "Sede 2");
        templateS1 = template(companyA, siteS1);
        templateS2 = template(companyA, siteS2);
        companyB = company("Empresa B");
        siteB = site(companyB, "Sede B");
        templateB = template(companyB, siteB);

        adminA = account("30000001");
        membership(companyA, adminA, "ADMIN");
        accountE1 = account("30000002");
        membership(companyA, accountE1, "EMPLOYEE");
        employee1 = employee(companyA, accountE1, "Ana Empleada", siteS1);
        accountE2 = account("30000003");
        membership(companyA, accountE2, "EMPLOYEE");
        employee2 = employee(companyA, accountE2, "Bruno Empleado", siteS2);
        adminB = account("30000004");
        membership(companyB, adminB, "ADMIN");
        accountEB = account("30000005");
        membership(companyB, accountEB, "EMPLOYEE");
        employeeB = employee(companyB, accountEB, "Persona empresa B", siteB);
    }

    // ---------- Inbox filters (S1) ----------

    private record Seed(UUID a, UUID b, UUID c, UUID d, UUID foreign) { }

    /** a: e1/S1/D1 tardia, b: e1/S1/D2 almuerzo, c: e2/S2/D1 sin ingreso, d: e2/S2/D2 egreso temprano; updated order a<b<c<d. */
    private Seed seedInbox() {
        Instant base = Instant.parse("2026-03-20T10:00:00Z");
        UUID ja = jornada(companyA, employee1, siteS1, templateS1, D1);
        UUID jb = jornada(companyA, employee1, siteS1, templateS1, D2);
        UUID jc = jornada(companyA, employee2, siteS2, templateS2, D1);
        UUID jd = jornada(companyA, employee2, siteS2, templateS2, D2);
        UUID jf = jornada(companyB, employeeB, siteB, templateB, D1);
        return new Seed(
                deviation(companyA, ja, siteS1, employee1, "LLEGADA_TARDE", null, base),
                deviation(companyA, jb, siteS1, employee1, "EXCESO_ALMUERZO", null, base.plusSeconds(60)),
                deviation(companyA, jc, siteS2, employee2, "SIN_INGRESO", null, base.plusSeconds(120)),
                deviation(companyA, jd, siteS2, employee2, "EGRESO_TEMPRANO", null, base.plusSeconds(180)),
                deviation(companyB, jf, siteB, employeeB, "SIN_INGRESO", null, base.plusSeconds(240)));
    }

    @Test
    void inboxWithoutFiltersKeepsReturningEveryCompanyDeviationNewestFirst() throws Exception {
        Seed s = seedInbox();
        assertEquals(List.of(s.d(), s.c(), s.b(), s.a()), inboxIds(login(adminA, "30000001"), ""));
    }

    @Test
    void inboxFiltersByEmployeeBySiteByDateRangeAndTheirCombination() throws Exception {
        Seed s = seedInbox();
        Cookie admin = login(adminA, "30000001");
        assertEquals(List.of(s.b(), s.a()), inboxIds(admin, "employeeId=" + employee1));
        assertEquals(List.of(s.d(), s.c()), inboxIds(admin, "siteId=" + siteS2));
        assertEquals(List.of(s.d(), s.b()), inboxIds(admin, "from=2026-03-05&to=2026-03-31"));
        assertEquals(List.of(s.c(), s.a()), inboxIds(admin, "from=2026-03-01&to=2026-03-05"));
        assertEquals(List.of(s.d(), s.c(), s.b(), s.a()), inboxIds(admin, "from=2026-03-02&to=2026-03-10"));
        assertEquals(List.of(s.b()), inboxIds(admin, "employeeId=" + employee1 + "&from=2026-03-05&to=2026-03-31"));
        assertEquals(List.of(s.c()), inboxIds(admin, "employeeId=" + employee2 + "&siteId=" + siteS2 + "&from=2026-03-01&to=2026-03-05"));
        assertEquals(List.of(), inboxIds(admin, "employeeId=" + employee1 + "&siteId=" + siteS2));
    }

    @Test
    void inboxRejectsInvertedOverlongAndMalformedFilters() throws Exception {
        seedInbox();
        Cookie admin = login(adminA, "30000001");
        for (String query : List.of("from=2026-03-10&to=2026-03-02", "from=2025-01-01&to=2026-03-02", "employeeId=not-a-uuid",
                "siteId=not-a-uuid", "from=2026-13-45")) {
            mockMvc.perform(get("/api/v1/inbox?" + query).cookie(admin))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        mockMvc.perform(get("/api/v1/inbox?from=2025-03-02&to=2026-03-02").cookie(admin)).andExpect(status().isOk());
    }

    @Test
    void inboxCursorWithFilterPagesAcrossTwoPagesAndIsBoundToThoseFilters() throws Exception {
        Seed s = seedInbox();
        Cookie admin = login(adminA, "30000001");
        String filter = "employeeId=" + employee1;
        JsonNode first = json(mockMvc.perform(get("/api/v1/inbox?limit=1&" + filter).cookie(admin)).andExpect(status().isOk()).andReturn());
        assertEquals(s.b().toString(), first.at("/items/0/id").asText());
        String cursor = first.get("nextCursor").asText();
        JsonNode second = json(mockMvc.perform(get("/api/v1/inbox?limit=1&" + filter + "&cursor=" + cursor).cookie(admin)).andExpect(status().isOk()).andReturn());
        assertEquals(1, second.get("items").size());
        assertEquals(s.a().toString(), second.at("/items/0/id").asText());
        assertFalse(second.has("nextCursor"));

        // A cursor issued for one filter set never works with another (no leak of other rows).
        for (String other : List.of("employeeId=" + employee2, "siteId=" + siteS1, "")) {
            mockMvc.perform(get("/api/v1/inbox?limit=1&" + other + "&cursor=" + cursor).cookie(admin))
                    .andExpect(status().isUnprocessableEntity())
                    .andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        // And an unfiltered cursor is rejected when a filter is added.
        JsonNode plain = json(mockMvc.perform(get("/api/v1/inbox?limit=1").cookie(admin)).andReturn());
        mockMvc.perform(get("/api/v1/inbox?limit=1&" + filter + "&cursor=" + plain.get("nextCursor").asText()).cookie(admin))
                .andExpect(status().isUnprocessableEntity());
        // Unfiltered paging keeps working.
        mockMvc.perform(get("/api/v1/inbox?limit=1&cursor=" + plain.get("nextCursor").asText()).cookie(admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(s.c().toString()));
    }

    @Test
    void inboxFilterWithAnotherCompanysEmployeeOrSiteIsNotFoundAndLeaksNothing() throws Exception {
        Seed s = seedInbox();
        Cookie admin = login(adminA, "30000001");
        for (String query : List.of("employeeId=" + employeeB, "siteId=" + siteB, "employeeId=" + employeeB + "&siteId=" + siteB)) {
            MvcResult result = mockMvc.perform(get("/api/v1/inbox?" + query).cookie(admin)).andExpect(status().isNotFound()).andReturn();
            assertFalse(result.getResponse().getContentAsString().contains(s.foreign().toString()));
        }
        // The other company's admin sees only its own data and gets the same answer for company A's ids.
        Cookie other = login(adminB, "30000004");
        assertEquals(List.of(s.foreign()), inboxIds(other, ""));
        mockMvc.perform(get("/api/v1/inbox?employeeId=" + employee1).cookie(other)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/inbox?siteId=" + siteS1).cookie(other)).andExpect(status().isNotFound());
        assertEquals(5, jdbc.queryForObject("SELECT COUNT(*) FROM deviations", Integer.class));
    }

    @Test
    void employeeInboxStaysScopedToSelfAndCannotFilterByAnotherEmployee() throws Exception {
        Seed s = seedInbox();
        Cookie employee = login(accountE1, "30000002");
        assertEquals(List.of(s.b(), s.a()), inboxIds(employee, ""));
        assertEquals(List.of(s.b(), s.a()), inboxIds(employee, "employeeId=" + employee1));
        assertEquals(List.of(s.b()), inboxIds(employee, "from=2026-03-05&to=2026-03-31"));
        mockMvc.perform(get("/api/v1/inbox?employeeId=" + employee2).cookie(employee)).andExpect(status().isForbidden());
        assertEquals(List.of(), inboxIds(employee, "siteId=" + siteS2));
    }

    // ---------- History (S2) ----------

    @Test
    void historyReturnsJornadasWithMarksAndDeviationsOfOneEmployeeInTheRange() throws Exception {
        Seed s = seedInbox();
        UUID j1 = jornadaId(employee1, siteS1, D1), j2 = jornadaId(employee1, siteS1, D2);
        insertMark(companyA, j1, 1, "INGRESO", Instant.parse("2026-03-02T11:20:00Z"));
        insertMark(companyA, j2, 1, "INGRESO", Instant.parse("2026-03-10T11:00:00Z"));
        insertMark(companyA, j2, 2, "EGRESO", Instant.parse("2026-03-10T19:00:00Z"));
        Cookie admin = login(adminA, "30000001");

        JsonNode body = json(mockMvc.perform(get("/api/v1/jornadas?from=2026-03-01&to=2026-03-31&employeeId=" + employee1 + "&includeDetail=true").cookie(admin))
                .andExpect(status().isOk()).andReturn());
        assertEquals(2, body.size());
        assertEquals(j2.toString(), body.get(0).get("id").asText());
        assertEquals("Ana Empleada", body.get(0).get("employeeDisplayName").asText());
        assertEquals(List.of("INGRESO", "EGRESO"), texts(body.get(0).get("marks"), "action"));
        assertEquals(List.of(s.b().toString()), texts(body.get(0).get("deviations"), "id"));
        assertEquals(List.of("EXCESO_ALMUERZO"), texts(body.get(0).get("deviations"), "type"));
        assertEquals(j1.toString(), body.get(1).get("id").asText());
        assertEquals(1, body.get(1).get("marks").size());
        assertEquals(List.of(s.a().toString()), texts(body.get(1).get("deviations"), "id"));
        assertFalse(body.toString().contains(employee2.toString()));
        assertFalse(body.toString().contains(employeeB.toString()));
    }

    @Test
    void historyBySiteCoversEveryEmployeeOfThatSiteAndNothingFromOtherSitesOrCompanies() throws Exception {
        seedInbox();
        Cookie admin = login(adminA, "30000001");
        JsonNode body = json(mockMvc.perform(get("/api/v1/jornadas?from=2026-03-01&to=2026-03-31&siteId=" + siteS2 + "&includeDetail=true").cookie(admin))
                .andExpect(status().isOk()).andReturn());
        assertEquals(2, body.size());
        assertEquals(List.of(employee2.toString(), employee2.toString()), texts(body, "employeeId"));
        assertEquals(List.of(siteS2.toString(), siteS2.toString()), texts(body, "siteId"));
        mockMvc.perform(get("/api/v1/jornadas?from=2026-03-01&to=2026-03-31&siteId=" + siteB).cookie(admin)).andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/jornadas?from=2026-03-01&to=2026-03-31&employeeId=" + employeeB + "&includeDetail=true").cookie(admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void historyWithoutIncludeDetailKeepsTheOriginalSummaryShape() throws Exception {
        seedInbox();
        mockMvc.perform(get("/api/v1/jornadas?from=2026-03-01&to=2026-03-31&employeeId=" + employee1).cookie(login(adminA, "30000001")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].marks").doesNotExist())
                .andExpect(jsonPath("$[0].deviations").doesNotExist())
                .andExpect(jsonPath("$[0].state").value("NO_INGRESO"));
    }

    @Test
    void historyRejectsInvertedOverlongRangesAndTooManyJornadas() throws Exception {
        seedInbox();
        Cookie admin = login(adminA, "30000001");
        for (String range : List.of("from=2026-03-31&to=2026-03-01", "from=2025-01-01&to=2026-03-31")) {
            mockMvc.perform(get("/api/v1/jornadas?" + range + "&employeeId=" + employee1 + "&includeDetail=true").cookie(admin))
                    .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
        // 2 employees x 251 distinct days = 502 jornadas in one site, above the 500 detail cap.
        UUID extraAccount = account("30000006");
        membership(companyA, extraAccount, "EMPLOYEE");
        UUID extra = employee(companyA, extraAccount, "Carla Empleada", siteS1);
        batchJornadas(employee1, siteS1, templateS1, LocalDate.of(2025, 6, 1), 251);
        batchJornadas(extra, siteS1, templateS1, LocalDate.of(2025, 6, 1), 251);
        mockMvc.perform(get("/api/v1/jornadas?from=2025-06-01&to=2026-02-14&siteId=" + siteS1 + "&includeDetail=true").cookie(admin))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        mockMvc.perform(get("/api/v1/jornadas?from=2025-06-01&to=2026-02-14&siteId=" + siteS1).cookie(admin))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(502));
    }

    @Test
    void employeeCannotReadAnotherEmployeesHistoryButCanReadTheirOwnDetail() throws Exception {
        seedInbox();
        insertMark(companyA, jornadaId(employee1, siteS1, D1), 1, "INGRESO", Instant.parse("2026-03-02T11:20:00Z"));
        Cookie employee = login(accountE1, "30000002");
        mockMvc.perform(get("/api/v1/jornadas?from=2026-03-01&to=2026-03-31&employeeId=" + employee2 + "&includeDetail=true").cookie(employee))
                .andExpect(status().isForbidden());
        JsonNode own = json(mockMvc.perform(get("/api/v1/jornadas?from=2026-03-01&to=2026-03-31&includeDetail=true").cookie(employee))
                .andExpect(status().isOk()).andReturn());
        assertEquals(2, own.size());
        assertEquals(List.of(employee1.toString(), employee1.toString()), texts(own, "employeeId"));
        // A site filter cannot widen an employee's view beyond themselves.
        mockMvc.perform(get("/api/v1/jornadas?from=2026-03-01&to=2026-03-31&siteId=" + siteS2 + "&includeDetail=true").cookie(employee))
                .andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(0));
    }

    // ---------- Session display name (S3) ----------

    @Test
    void sessionExposesTheEmployeeDisplayNameOnLoginAndOnGetSession() throws Exception {
        MvcResult login = loginResult(accountE1, "30000002");
        assertEquals("Ana Empleada", json(login).get("displayName").asText());
        mockMvc.perform(get("/api/v1/session").cookie(sessionCookie(login)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Ana Empleada"));
    }

    @Test
    void adminWithoutEmployeeRowHasNoDisplayNameBecauseNoNameIsStoredForThem() throws Exception {
        // accounts and company_memberships store no name; the bootstrap admin name is not persisted (BootstrapAdminRunner).
        MvcResult login = loginResult(adminA, "30000001");
        assertFalse(json(login).has("displayName"));
        mockMvc.perform(get("/api/v1/session").cookie(sessionCookie(login)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").doesNotExist());
    }

    @Test
    void sessionDisplayNameFollowsTheActiveCompany() throws Exception {
        membership(companyB, accountE1, "EMPLOYEE");
        employee(companyB, accountE1, "Ana en B", siteB);
        MvcResult login = loginResult(accountE1, "30000002");
        Cookie cookie = sessionCookie(login);
        String firstCompany = json(login).get("activeCompanyId").asText();
        boolean startsInA = firstCompany.equals(companyA.toString());
        assertEquals(startsInA ? "Ana Empleada" : "Ana en B", json(login).get("displayName").asText());
        mockMvc.perform(put("/api/v1/companies/active")
                        .cookie(cookie, new Cookie("BRAJA_CSRF", lastCsrf)).header("X-CSRF-TOKEN", lastCsrf)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"companyId\":\"" + (startsInA ? companyB : companyA) + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value(startsInA ? "Ana en B" : "Ana Empleada"));
    }

    // ---------- Deviation occurredAt (S4) ----------

    @Test
    void lateArrivalOccurredAtIsTheMarkTimeNotTheDetectionTimeOfTheAbsenceItReplaced() throws Exception {
        Instant start = Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(2 * 3600);
        UUID j = jornadaAt(companyA, employee1, siteS1, templateS1, LocalDate.now(), start, start.plusSeconds(8 * 3600));
        Instant detected = start.plusSeconds(11 * 60);
        marks.createDueAbsences(detected, 200);
        Instant markTime = start.plusSeconds(20 * 60);
        marks.recordEmployeeMark(new ScopeService.Scope(accountE1, companyA, "EMPLOYEE", false), j, MarkAction.INGRESO, UUID.randomUUID(), markTime);

        JsonNode item = json(mockMvc.perform(get("/api/v1/inbox").cookie(login(adminA, "30000001"))).andExpect(status().isOk()).andReturn()).at("/items/0");
        assertEquals("LLEGADA_TARDE", item.get("type").asText());
        Instant storedMark = jdbc.queryForObject("SELECT occurred_at FROM mark_events WHERE jornada_id=?", Timestamp.class, j.toString()).toInstant();
        assertEquals(storedMark, Instant.parse(item.get("occurredAt").asText()));
        assertEquals(detected, Instant.parse(item.get("createdAt").asText()));
        assertNotEquals(item.get("createdAt").asText(), item.get("occurredAt").asText());
    }

    @Test
    void missingArrivalOccurredAtIsTheDueTimeScheduledStartPlusTolerance() throws Exception {
        Instant start = Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(2 * 3600);
        jornadaAt(companyA, employee2, siteS2, templateS2, LocalDate.now(), start, start.plusSeconds(8 * 3600));
        marks.createDueAbsences(start.plusSeconds(25 * 60), 200);

        JsonNode item = json(mockMvc.perform(get("/api/v1/inbox").cookie(login(adminA, "30000001"))).andExpect(status().isOk()).andReturn()).at("/items/0");
        assertEquals("SIN_INGRESO", item.get("type").asText());
        assertEquals(start.plusSeconds(10 * 60), Instant.parse(item.get("occurredAt").asText()));
        assertEquals(start.plusSeconds(25 * 60), Instant.parse(item.get("createdAt").asText()));
    }

    @Test
    void missingEgressOccurredAtIsTheDueTimeScheduledEndPlusTolerance() throws Exception {
        Instant end = Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600);
        Instant start = end.minusSeconds(8 * 3600);
        UUID j = jornadaAt(companyA, employee2, siteS2, templateS2, LocalDate.now(), start, end);
        jdbc.update("UPDATE jornadas SET state='EN_CURSO',next_sequence=2 WHERE id=?", j.toString());
        insertMark(companyA, j, 1, "INGRESO", start);
        marks.createDueAbsences(end.plusSeconds(15 * 60), 200);

        JsonNode item = json(mockMvc.perform(get("/api/v1/inbox").cookie(login(adminA, "30000001"))).andExpect(status().isOk()).andReturn()).at("/items/0");
        assertEquals("MARCA_FALTANTE", item.get("type").asText());
        assertEquals(end.plusSeconds(10 * 60), Instant.parse(item.get("occurredAt").asText()));
        assertEquals(end.plusSeconds(15 * 60), Instant.parse(item.get("createdAt").asText()));
    }

    @Test
    void markBasedDeviationOccurredAtAppearsInInboxAndHistory() throws Exception {
        Instant markTime = Instant.parse("2026-03-10T15:30:00Z");
        UUID j = jornada(companyA, employee1, siteS1, templateS1, D2);
        insertMark(companyA, j, 1, "SALIDA_ALMUERZO", markTime);
        UUID markId = UUID.fromString(jdbc.queryForObject("SELECT id FROM mark_events WHERE jornada_id=?", String.class, j.toString()));
        deviation(companyA, j, siteS1, employee1, "EXCESO_ALMUERZO", markId, Instant.parse("2026-03-20T10:00:00Z"));
        Cookie admin = login(adminA, "30000001");
        mockMvc.perform(get("/api/v1/inbox").cookie(admin))
                .andExpect(jsonPath("$.items[0].occurredAt").value("2026-03-10T15:30:00Z"))
                .andExpect(jsonPath("$.items[0].createdAt").value("2026-03-20T10:00:00Z"));
        mockMvc.perform(get("/api/v1/jornadas?from=2026-03-01&to=2026-03-31&includeDetail=true").cookie(admin))
                .andExpect(jsonPath("$[0].deviations[0].occurredAt").value("2026-03-10T15:30:00Z"));
    }

    // ---------- Review corrections ----------

    @Test
    void inboxRequiresBothEndsOfTheDateRangeOrNeither() throws Exception {
        seedInbox();
        Cookie admin = login(adminA, "30000001");
        for (String query : List.of("from=2026-03-01", "to=2026-03-31")) {
            mockMvc.perform(get("/api/v1/inbox?" + query).cookie(admin))
                    .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
    }

    @Test
    void extremeOrImplausibleDatesAreRejectedWith422NotAServerError() throws Exception {
        seedInbox();
        Cookie admin = login(adminA, "30000001");
        for (String range : List.of("from=%2B999999999-12-31&to=%2B999999999-12-31", "from=-999999999-01-01&to=2026-03-01",
                "from=0001-01-01&to=0001-02-01", "from=2026-03-01&to=2101-01-01")) {
            mockMvc.perform(get("/api/v1/inbox?" + range).cookie(admin)).andExpect(status().isUnprocessableEntity());
            mockMvc.perform(get("/api/v1/jornadas?" + range).cookie(admin)).andExpect(status().isUnprocessableEntity());
            mockMvc.perform(get("/api/v1/deviations?" + range).cookie(admin)).andExpect(status().isUnprocessableEntity());
        }
    }

    @Test
    void malformedOrForgedInboxCursorsAreRejectedWith422() throws Exception {
        seedInbox();
        Cookie admin = login(adminA, "30000001");
        java.util.Base64.Encoder enc = java.util.Base64.getUrlEncoder().withoutPadding();
        String uuid = UUID.randomUUID().toString();
        List<String> cursors = List.of("!!!not-base64!!!", enc.encodeToString("garbage".getBytes()), enc.encodeToString("a|b|c".getBytes()),
                enc.encodeToString(("2026-03-20T10:00:00Z|" + "zz" + "|not-a-uuid").getBytes()),
                enc.encodeToString(("not-an-instant||" + uuid).getBytes()), enc.encodeToString(("2026-03-20T10:00:00Z|ffffffffffffffff|" + uuid).getBytes()),
                enc.encodeToString("||".getBytes()), "A");
        for (String cursor : cursors) {
            mockMvc.perform(get("/api/v1/inbox?cursor=" + cursor).cookie(admin))
                    .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
    }

    @Test
    void employeeHistoryDetailNeverExposesAnotherAuthorsMotiveOrCoordinatesButAdminSeesCoordinates() throws Exception {
        seedInbox();
        UUID j = jornadaId(employee1, siteS1, D1);
        insertMark(companyA, j, 1, "INGRESO", Instant.parse("2026-03-02T11:20:00Z"));
        jdbc.update("UPDATE mark_events SET latitude=-34.6037000,longitude=-58.3816000,location_status='RECIBIDA' WHERE jornada_id=?", j.toString());
        jdbc.update("UPDATE deviations SET motive_category='OTRA',motive_text='nota-privada-del-admin',motive_author_account_id=?,motive_created_at=? WHERE jornada_id=?",
                adminA.toString(), ts(Instant.parse("2026-03-21T10:00:00Z")), j.toString());
        String path = "/api/v1/jornadas?from=2026-03-01&to=2026-03-31&includeDetail=true";

        String asEmployee = mockMvc.perform(get(path).cookie(login(accountE1, "30000002"))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertFalse(asEmployee.contains("nota-privada-del-admin"));
        assertFalse(asEmployee.contains("-34.6037"));
        assertFalse(asEmployee.contains("latitude"));
        assertFalse(asEmployee.contains("longitude"));

        String asAdmin = mockMvc.perform(get(path + "&employeeId=" + employee1).cookie(login(adminA, "30000001"))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertTrue(asAdmin.contains("\"latitude\":-34.6037"));
        assertTrue(asAdmin.contains("\"longitude\":-58.3816"));
        assertTrue(asAdmin.contains("nota-privada-del-admin"));
    }


    // ---------- helpers ----------

    private List<UUID> inboxIds(Cookie cookie, String query) throws Exception {
        JsonNode body = json(mockMvc.perform(get("/api/v1/inbox" + (query.isEmpty() ? "" : "?" + query)).cookie(cookie))
                .andExpect(status().isOk()).andReturn());
        List<UUID> ids = new ArrayList<>();
        body.get("items").forEach(item -> ids.add(UUID.fromString(item.get("id").asText())));
        return ids;
    }

    private List<String> texts(JsonNode array, String field) {
        List<String> values = new ArrayList<>();
        array.forEach(node -> values.add(node.get(field).asText()));
        return values;
    }

    private JsonNode json(MvcResult result) throws Exception { return objectMapper.readTree(result.getResponse().getContentAsString()); }

    private Cookie login(UUID account, String dni) throws Exception { return sessionCookie(loginResult(account, dni)); }

    private Cookie sessionCookie(MvcResult login) {
        String header = login.getResponse().getHeaders("Set-Cookie").stream().filter(h -> h.startsWith("BRAJA_SESSION=")).findFirst().orElseThrow();
        return new Cookie("BRAJA_SESSION", header.split(";", 2)[0].substring("BRAJA_SESSION=".length()));
    }

    private MvcResult loginResult(UUID account, String dni) throws Exception {
        jdbc.update("UPDATE accounts SET password_hash=? WHERE id=?", passwordEncoder.encode(PASSWORD), account.toString());
        MvcResult csrfResponse = mockMvc.perform(get("/api/v1/csrf")).andExpect(status().isOk()).andReturn();
        String csrf = json(csrfResponse).get("token").asText();
        String anonymous = csrfResponse.getResponse().getHeaders("Set-Cookie").stream().filter(h -> h.startsWith("BRAJA_SESSION=")).findFirst().orElseThrow()
                .split(";", 2)[0].substring("BRAJA_SESSION=".length());
        lastCsrf = csrf;
        return mockMvc.perform(post("/api/v1/session")
                        .cookie(new Cookie("BRAJA_SESSION", anonymous), new Cookie("BRAJA_CSRF", csrf))
                        .header("X-CSRF-TOKEN", csrf).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dni\":\"" + dni + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk()).andReturn();
    }

    private static Timestamp ts(Instant instant) { return Timestamp.from(instant); }

    private UUID company(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", id.toString(), name, ts(Instant.now()));
        return id;
    }

    private UUID site(UUID company, String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", id.toString(), company.toString(), name, ZONE, ts(Instant.now()));
        return id;
    }

    private UUID template(UUID company, UUID site) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,?,20,30,TRUE,?,?)",
                id.toString(), company.toString(), site.toString(), "Turno", ts(Instant.now()), ts(Instant.now()));
        return id;
    }

    private UUID account(String dni) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                id.toString(), dni, dni, "unused-test-hash", ts(Instant.now()), ts(Instant.now()));
        return id;
    }

    private void membership(UUID company, UUID account, String role) {
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,?,TRUE,?)",
                UUID.randomUUID().toString(), company.toString(), account.toString(), role, ts(Instant.now()));
    }

    private UUID employee(UUID company, UUID account, String name, UUID site) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,10,TRUE,?,?)",
                id.toString(), company.toString(), account.toString(), name, ts(Instant.now()), ts(Instant.now()));
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)", company.toString(), id.toString(), site.toString(), ts(Instant.now()));
        return id;
    }

    private UUID jornada(UUID company, UUID employee, UUID site, UUID template, LocalDate date) {
        Instant start = date.atTime(11, 0).toInstant(java.time.ZoneOffset.UTC);
        return jornadaAt(company, employee, site, template, date, start, start.plusSeconds(8 * 3600));
    }

    private UUID jornadaAt(UUID company, UUID employee, UUID site, UUID template, LocalDate date, Instant start, Instant end) {
        UUID id = UUID.randomUUID();
        insertJornada(id, company, employee, site, template, date, start, end);
        return id;
    }

    private void insertJornada(UUID id, UUID company, UUID employee, UUID site, UUID template, LocalDate date, Instant start, Instant end) {
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,10,?,?,'NO_INGRESO',1,?,?)",
                id.toString(), company.toString(), employee.toString(), site.toString(), template.toString(), date, ZONE,
                "{\"siteId\":\"" + site + "\",\"name\":\"Turno\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}",
                ts(start), ts(end), adminA.toString(), ts(Instant.now()));
    }

    private void batchJornadas(UUID employee, UUID site, UUID template, LocalDate first, int days) {
        for (int i = 0; i < days; i++) {
            LocalDate date = first.plusDays(i);
            Instant start = date.atTime(11, 0).toInstant(java.time.ZoneOffset.UTC);
            insertJornada(UUID.randomUUID(), companyA, employee, site, template, date, start, start.plusSeconds(8 * 3600));
        }
    }

    private UUID jornadaId(UUID employee, UUID site, LocalDate date) {
        return UUID.fromString(jdbc.queryForObject("SELECT id FROM jornadas WHERE employee_id=? AND site_id=? AND local_date=?", String.class,
                employee.toString(), site.toString(), date));
    }

    private void insertMark(UUID company, UUID jornada, long sequence, String action, Instant occurredAt) {
        Instant recordedAt = occurredAt.plusSeconds(1);
        jdbc.update("INSERT INTO mark_events(id,company_id,jornada_id,sequence_number,timeline_order,action,original_action,occurred_at,original_occurred_at,accepted_at,recorded_at,origin,created_by,location_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'EMPLEADO',?,'NO_APLICA')",
                UUID.randomUUID().toString(), company.toString(), jornada.toString(), sequence, sequence * 1000, action, action,
                ts(occurredAt), ts(occurredAt), ts(recordedAt), ts(recordedAt), adminA.toString());
    }

    private UUID deviation(UUID company, UUID jornada, UUID site, UUID employee, String type, UUID sourceMark, Instant at) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO deviations(id,company_id,jornada_id,source_mark_id,site_id,employee_id,type,created_at,updated_at,active) VALUES(?,?,?,?,?,?,?,?,?,TRUE)",
                id.toString(), company.toString(), jornada.toString(), sourceMark == null ? null : sourceMark.toString(), site.toString(), employee.toString(), type, ts(at), ts(at));
        return id;
    }
}
