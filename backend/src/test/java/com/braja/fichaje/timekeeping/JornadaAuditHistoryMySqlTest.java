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
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * Issue #60 (CLAUDE.md rule 6): the ADMIN reads the change history of a jornada. Every change is made through the existing
 * endpoints against MySQL 8.4 and the history is read over HTTP; motive text and coordinates never appear in the raw body.
 */
@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class JornadaAuditHistoryMySqlTest {
    private static final String AES_KEY = java.util.Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = java.util.Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    private static final String PASSWORD = "CorrectHorseBattery9!";
    private static final String ZONE = "America/Argentina/Buenos_Aires";
    private static final String HEALTH_TEXT = "Turno con el cardiologo secreto";
    private static final String TRANSPORT_TEXT = "Colectivo demorado en Avellaneda";
    private static String passwordHash;

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja_audit_history_test")
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
    @Autowired MarkService marks;

    private UUID companyId;
    private UUID siteId;
    private UUID adminAccountId;
    private UUID unnamedAdminAccountId;
    private UUID employeeAccountId;
    private UUID employeeId;
    private UUID templateId;
    private UUID jornadaId;
    private String suffix;
    private String adminDni;
    private String unnamedAdminDni;
    private String employeeDni;
    private Instant now;

    @BeforeEach
    void setUp() {
        if (passwordHash == null) passwordHash = passwordEncoder.encode(PASSWORD);
        now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        companyId = UUID.randomUUID();
        siteId = UUID.randomUUID();
        adminAccountId = UUID.randomUUID();
        unnamedAdminAccountId = UUID.randomUUID();
        employeeAccountId = UUID.randomUUID();
        employeeId = UUID.randomUUID();
        templateId = UUID.randomUUID();
        suffix = String.format("%08d", Math.floorMod(System.nanoTime(), 100_000_000L));
        adminDni = "1" + suffix;
        unnamedAdminDni = "3" + suffix;
        employeeDni = "2" + suffix;
        Timestamp ts = Timestamp.from(now);
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), "Audit " + suffix, ts);
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", siteId.toString(), companyId.toString(), "Centro", ZONE, ts);
        insertAccount(adminAccountId, adminDni);
        insertAccount(unnamedAdminAccountId, unnamedAdminDni);
        insertAccount(employeeAccountId, employeeDni);
        // The named ADMIN has only a membership name (bootstrap ADMIN); the unnamed one falls back to the DNI.
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at,display_name) VALUES(?,?,?,'ADMIN',TRUE,?,?)",
                UUID.randomUUID().toString(), companyId.toString(), adminAccountId.toString(), ts, "Ana Admin");
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'ADMIN',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), unnamedAdminAccountId.toString(), ts);
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), employeeAccountId.toString(), ts);
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,10,TRUE,?,?)",
                employeeId.toString(), companyId.toString(), employeeAccountId.toString(), "Persona " + suffix, ts, ts);
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)", companyId.toString(), employeeId.toString(), siteId.toString(), ts);
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,'Turno',20,30,TRUE,?,?)",
                templateId.toString(), companyId.toString(), siteId.toString(), ts, ts);
        jdbc.update("INSERT INTO template_blocks(id,company_id,template_id,sequence_number,start_day_offset,starts_at,ends_at,end_day_offset) VALUES(?,?,?,1,0,'08:00:00','16:00:00',0)",
                UUID.randomUUID().toString(), companyId.toString(), templateId.toString());
        // Started 15 minutes ago with a 10-minute tolerance: an absence is already due.
        jornadaId = insertJornada(LocalDate.now(ZoneId.of(ZONE)), now.minusSeconds(900), now.plusSeconds(3600));
    }

    @Test
    void adminReadsEveryChangeOfTheJornadaInOrderWithActorNamesAndNoMotiveTextOrCoordinates() throws Exception {
        marks.createDueAbsences(now, 200);
        UUID deviationId = UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO'", String.class, jornadaId.toString()));
        Login admin = login(adminDni);
        Login employee = login(employeeDni);
        Instant forgottenAt = now.minusSeconds(120);
        // A late forgotten INGRESO turns the absence into LLEGADA_TARDE (system TYPE_REPLACED in the same transaction).
        MvcResult forgotten = send(admin, post("/api/v1/admin/jornadas/{id}/forgotten-marks", jornadaId),
                "{\"action\":\"INGRESO\",\"occurredAt\":\"" + forgottenAt + "\",\"auditReason\":\"Se olvido de marcar\"}");
        assertEquals(201, forgotten.getResponse().getStatus(), forgotten.getResponse().getContentAsString());
        UUID ingressId = UUID.fromString(json(forgotten).get("id").asText());
        ok(send(admin, put("/api/v1/admin/deviations/{id}/classification", deviationId), "{\"classification\":\"JUSTIFICADO\"}"));
        // A first motive after the classification sends the deviation back to review (D-20261027-02).
        ok(send(employee, put("/api/v1/deviations/{id}/motive", deviationId), "{\"category\":\"SALUD\",\"text\":\"" + HEALTH_TEXT + "\"}"));
        ok(send(employee, put("/api/v1/deviations/{id}/motive", deviationId), "{\"category\":\"TRANSPORTE\",\"text\":\"" + TRANSPORT_TEXT + "\"}"));
        ok(send(admin, put("/api/v1/admin/deviations/{id}/classification", deviationId), "{\"classification\":\"NO_JUSTIFICADO\"}"));
        Instant correctedAt = now.minusSeconds(60);
        ok(send(admin, post("/api/v1/admin/marks/{id}/correction", ingressId),
                "{\"correctedAction\":\"INGRESO\",\"correctedOccurredAt\":\"" + correctedAt + "\",\"auditReason\":\"Hora real segun camara\"}"));
        MvcResult breakfast = mark(employee, jornadaId, "SALIDA_DESAYUNO");
        assertEquals(201, breakfast.getResponse().getStatus(), breakfast.getResponse().getContentAsString());
        UUID breakfastId = UUID.fromString(json(breakfast).get("id").asText());
        assertEquals(202, send(employee, post("/api/v1/marks/{id}/location", breakfastId),
                "{\"latitude\":-34.6037221,\"longitude\":-58.3815704,\"accuracyMeters\":12.5}").getResponse().getStatus());
        ok(send(admin, post("/api/v1/admin/marks/{id}/void", breakfastId), "{\"reason\":\"No salio a desayunar\"}"));

        MvcResult result = mockMvc.perform(get("/api/v1/admin/jornadas/{id}/audit", jornadaId).cookie(admin.session())).andReturn();

        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        String body = result.getResponse().getContentAsString();
        for (String hidden : List.of(HEALTH_TEXT, TRANSPORT_TEXT, "-34.60", "-58.38", "latitude", "longitude", "motiveText", "ciphertext")) {
            assertFalse(body.contains(hidden), "the audit must not expose " + hidden + ": " + body);
        }
        JsonNode audit = objectMapper.readTree(body);
        assertEquals(jornadaId.toString(), audit.get("jornadaId").asText());
        assertEquals(ZONE, audit.get("timeZone").asText());
        assertFalse(audit.get("truncated").asBoolean());
        JsonNode entries = audit.get("entries");
        List<String> kinds = new ArrayList<>();
        entries.forEach(entry -> kinds.add(entry.get("kind").asText() + (entry.has("changeType") ? ":" + entry.get("changeType").asText() : "")));
        assertEquals(List.of("DEVIATION:CREATED", "FORGOTTEN_MARK", "DEVIATION:TYPE_REPLACED", "DEVIATION:CLASSIFICATION_CHANGED",
                "DEVIATION:MOTIVE_SUBMITTED", "DEVIATION:CLASSIFICATION_RESET", "DEVIATION:MOTIVE_CORRECTED", "DEVIATION:CLASSIFICATION_CHANGED",
                "MARK_CORRECTION", "MARK_VOID"), kinds);
        for (int i = 1; i < entries.size(); i++) {
            assertFalse(Instant.parse(entries.get(i).get("changedAt").asText()).isBefore(Instant.parse(entries.get(i - 1).get("changedAt").asText())), "chronological order");
        }

        JsonNode created = entries.get(0);
        assertEquals(deviationId.toString(), created.get("deviationId").asText());
        assertEquals("SIN_INGRESO", created.get("afterType").asText());
        assertAbsent(created, "actorAccountId");
        assertAbsent(created, "actorDisplayName");

        JsonNode forgottenEntry = entries.get(1);
        assertEquals(ingressId.toString(), forgottenEntry.get("markId").asText());
        assertEquals(1, forgottenEntry.get("markSequence").asLong());
        assertEquals("INGRESO", forgottenEntry.get("afterAction").asText());
        assertEquals(forgottenAt, Instant.parse(forgottenEntry.get("afterOccurredAt").asText()));
        assertEquals("Se olvido de marcar", forgottenEntry.get("reason").asText());
        assertEquals(adminAccountId.toString(), forgottenEntry.get("actorAccountId").asText());
        assertEquals("Ana Admin", forgottenEntry.get("actorDisplayName").asText());

        JsonNode replaced = entries.get(2);
        assertEquals("SIN_INGRESO", replaced.get("beforeType").asText());
        assertEquals("LLEGADA_TARDE", replaced.get("afterType").asText());
        assertEquals("LLEGADA_TARDE", replaced.get("deviationType").asText());
        assertAbsent(replaced, "actorDisplayName");

        JsonNode firstClassification = entries.get(3);
        assertAbsent(firstClassification, "beforeClassification");
        assertEquals("JUSTIFICADO", firstClassification.get("afterClassification").asText());
        assertEquals("Ana Admin", firstClassification.get("actorDisplayName").asText());

        JsonNode submitted = entries.get(4);
        assertEquals("SALUD", submitted.get("afterMotiveCategory").asText());
        assertAbsent(submitted, "beforeMotiveCategory");
        assertAbsent(submitted, "reason");
        assertEquals(employeeAccountId.toString(), submitted.get("actorAccountId").asText());
        assertEquals("Persona " + suffix, submitted.get("actorDisplayName").asText());

        JsonNode reset = entries.get(5);
        assertEquals("JUSTIFICADO", reset.get("beforeClassification").asText());
        assertAbsent(reset, "afterClassification");

        JsonNode correctedMotive = entries.get(6);
        assertEquals("SALUD", correctedMotive.get("beforeMotiveCategory").asText());
        assertEquals("TRANSPORTE", correctedMotive.get("afterMotiveCategory").asText());
        assertAbsent(correctedMotive, "reason");

        assertEquals("NO_JUSTIFICADO", entries.get(7).get("afterClassification").asText());

        JsonNode correction = entries.get(8);
        assertEquals(ingressId.toString(), correction.get("markId").asText());
        assertEquals("INGRESO", correction.get("beforeAction").asText());
        assertEquals("INGRESO", correction.get("afterAction").asText());
        assertEquals(forgottenAt, Instant.parse(correction.get("beforeOccurredAt").asText()));
        assertEquals(correctedAt, Instant.parse(correction.get("afterOccurredAt").asText()));
        assertEquals("Hora real segun camara", correction.get("reason").asText());
        assertEquals("Ana Admin", correction.get("actorDisplayName").asText());

        JsonNode voided = entries.get(9);
        assertEquals(breakfastId.toString(), voided.get("markId").asText());
        assertEquals(2, voided.get("markSequence").asLong());
        assertEquals("SALIDA_DESAYUNO", voided.get("beforeAction").asText());
        assertEquals("No salio a desayunar", voided.get("reason").asText());
        assertEquals(Instant.parse(voided.get("changedAt").asText()),
                jdbc.queryForObject("SELECT voided_at FROM mark_events WHERE id=?", Timestamp.class, breakfastId.toString()).toInstant());
    }

    @Test
    void aCancelledJornadaShowsItsCancellationBeforeTheRetractedAbsenceWithTheDniOfAnUnnamedAdmin() throws Exception {
        marks.createDueAbsences(now, 200);
        Login unnamedAdmin = login(unnamedAdminDni);
        ok(send(unnamedAdmin, post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), "{\"reason\":\"Feriado nacional\"}"));

        JsonNode audit = json(mockMvc.perform(get("/api/v1/admin/jornadas/{id}/audit", jornadaId).cookie(login(adminDni).session())).andReturn());

        JsonNode entries = audit.get("entries");
        assertEquals(3, entries.size(), entries.toString());
        assertEquals("CREATED", entries.get(0).get("changeType").asText());
        JsonNode cancellation = entries.get(1);
        assertEquals("JORNADA_CANCELLATION", cancellation.get("kind").asText());
        assertEquals("Feriado nacional", cancellation.get("reason").asText());
        assertEquals(unnamedAdminAccountId.toString(), cancellation.get("actorAccountId").asText());
        assertEquals("DNI " + unnamedAdminDni, cancellation.get("actorDisplayName").asText());
        assertEquals(jdbc.queryForObject("SELECT cancelled_at FROM jornadas WHERE id=?", Timestamp.class, jornadaId.toString()).toInstant(),
                Instant.parse(cancellation.get("changedAt").asText()));
        assertEquals("RETRACTED", entries.get(2).get("changeType").asText());
        assertEquals("SIN_INGRESO", entries.get(2).get("beforeType").asText());
    }

    @Test
    void aJornadaWithoutChangesHasAnEmptyHistory() throws Exception {
        JsonNode audit = json(mockMvc.perform(get("/api/v1/admin/jornadas/{id}/audit", jornadaId).cookie(login(adminDni).session())).andReturn());

        assertEquals(0, audit.get("entries").size());
        assertFalse(audit.get("truncated").asBoolean());
    }

    @Test
    void onlyAnAdminOfTheSameCompanyReadsTheHistory() throws Exception {
        UUID otherCompany = UUID.randomUUID();
        UUID otherAdmin = UUID.randomUUID();
        String otherAdminDni = "4" + suffix;
        Timestamp ts = Timestamp.from(now);
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", otherCompany.toString(), "Otra " + suffix, ts);
        insertAccount(otherAdmin, otherAdminDni);
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'ADMIN',TRUE,?)",
                UUID.randomUUID().toString(), otherCompany.toString(), otherAdmin.toString(), ts);

        assertProblem(mockMvc.perform(get("/api/v1/admin/jornadas/{id}/audit", jornadaId).cookie(login(employeeDni).session())).andReturn(), 403, "FORBIDDEN");
        assertProblem(mockMvc.perform(get("/api/v1/admin/jornadas/{id}/audit", jornadaId).cookie(login(otherAdminDni).session())).andReturn(), 404, "NOT_FOUND");
        assertProblem(mockMvc.perform(get("/api/v1/admin/jornadas/{id}/audit", UUID.randomUUID()).cookie(login(adminDni).session())).andReturn(), 404, "NOT_FOUND");
        assertEquals(401, mockMvc.perform(get("/api/v1/admin/jornadas/{id}/audit", jornadaId)).andReturn().getResponse().getStatus());
    }

    @Test
    void theHistoryIsCappedAt500EntriesAndSaysItWasTruncated() throws Exception {
        marks.createDueAbsences(now, 200);
        String deviationId = jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=?", String.class, jornadaId.toString());
        List<Object[]> rows = new ArrayList<>();
        for (int i = 1; i <= 500; i++) {
            rows.add(new Object[]{UUID.randomUUID().toString(), companyId.toString(), deviationId, Timestamp.from(now.plusSeconds(i))});
        }
        jdbc.batchUpdate("INSERT INTO deviation_audits(id,company_id,deviation_id,change_type,after_classification,created_at) VALUES(?,?,?,'CLASSIFICATION_CHANGED','JUSTIFICADO',?)", rows);

        JsonNode audit = json(mockMvc.perform(get("/api/v1/admin/jornadas/{id}/audit", jornadaId).cookie(login(adminDni).session())).andReturn());

        assertTrue(audit.get("truncated").asBoolean());
        assertEquals(500, audit.get("entries").size());
        assertEquals("CREATED", audit.get("entries").get(0).get("changeType").asText());
        assertEquals(now.plusSeconds(499), Instant.parse(audit.get("entries").get(499).get("changedAt").asText()));
    }

    private void insertAccount(UUID account, String dni) {
        Timestamp ts = Timestamp.from(now);
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                account.toString(), dni, dni, passwordHash, ts, ts);
    }

    private UUID insertJornada(LocalDate localDate, Instant start, Instant end) {
        UUID id = UUID.randomUUID();
        String snapshot = "{\"siteId\":\"" + siteId + "\",\"name\":\"Turno\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,10,?,?,'NO_INGRESO',1,?,?)",
                id.toString(), companyId.toString(), employeeId.toString(), siteId.toString(), templateId.toString(), localDate,
                ZONE, snapshot, Timestamp.from(start), Timestamp.from(end), adminAccountId.toString(), Timestamp.from(now));
        return id;
    }

    private MvcResult mark(Login login, UUID jornada, String action) throws Exception {
        return mockMvc.perform(post("/api/v1/jornadas/{id}/marks", jornada).cookie(login.session())
                .header("X-CSRF-TOKEN", login.csrf()).header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"" + action + "\"}")).andReturn();
    }

    private MvcResult send(Login login, MockHttpServletRequestBuilder request, String body) throws Exception {
        return mockMvc.perform(request.cookie(login.session()).header("X-CSRF-TOKEN", login.csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body)).andReturn();
    }

    private static void ok(MvcResult result) throws Exception {
        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
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

    /** Null fields are left out of the JSON body; either form means "not exposed". */
    private static void assertAbsent(JsonNode node, String field) {
        assertTrue(node.path(field).isMissingNode() || node.get(field).isNull(), field + " must not be exposed: " + node);
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private record Login(Cookie session, String csrf) { }
}
