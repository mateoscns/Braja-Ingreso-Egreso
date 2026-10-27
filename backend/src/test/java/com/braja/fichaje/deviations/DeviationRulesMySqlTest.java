package com.braja.fichaje.deviations;

import com.braja.fichaje.security.PrivacyRetentionScheduler;
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
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Issue #43 (S4, S8): health-only purge, review after a type change (D-20261027-01), motive correction until classified
 * (D-20261027-02), inbox ordered by fact time (D-20261027-03) and a bounded, status-filtered GET /deviations.
 */
@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class DeviationRulesMySqlTest {
    private static final String AES_KEY = java.util.Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = java.util.Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    private static final String PASSWORD = "CorrectHorseBattery9!";
    private static final String ZONE = "America/Argentina/Buenos_Aires";

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
    @Autowired PrivacyRetentionScheduler retention;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    private UUID company, site, template, adminAccount, employeeAccount, employee, otherCompany, otherSite, otherTemplate, otherEmployee;
    private ScopeService.Scope employeeScope, adminScope;

    @BeforeEach
    void setUp() {
        for (String table : List.of("notification_outbox_events", "notification_company_state", "notification_windows", "deviation_audits",
                "forgotten_mark_audits", "mark_correction_audits", "mark_idempotency", "deviations", "mark_events", "jornadas",
                "template_blocks", "schedule_templates", "employee_sites", "employees", "company_memberships", "accounts", "sites", "companies")) {
            jdbc.update("DELETE FROM " + table);
        }
        company = company("Empresa A");
        site = site(company);
        template = template(company, site);
        adminAccount = account("31000001");
        membership(company, adminAccount, "ADMIN");
        employeeAccount = account("31000002");
        membership(company, employeeAccount, "EMPLOYEE");
        employee = employee(company, employeeAccount, "Ana Empleada", site);
        otherCompany = company("Empresa B");
        otherSite = site(otherCompany);
        otherTemplate = template(otherCompany, otherSite);
        UUID otherAccount = account("31000003");
        membership(otherCompany, otherAccount, "EMPLOYEE");
        otherEmployee = employee(otherCompany, otherAccount, "Persona B", otherSite);
        employeeScope = new ScopeService.Scope(employeeAccount, company, "EMPLOYEE", false);
        adminScope = new ScopeService.Scope(adminAccount, company, "ADMIN", false);
    }

    // ---------- S4: retention purges only SALUD text ----------

    @Test
    void retentionPurgesOnlyHealthTextAndKeepsOtherCategoriesAndTheCategory() throws Exception {
        UUID health = deviation(jornada(LocalDate.of(2026, 3, 2)), "LLEGADA_TARDE", Instant.parse("2026-03-02T12:00:00Z"));
        UUID transport = deviation(jornada(LocalDate.of(2026, 3, 3)), "LLEGADA_TARDE", Instant.parse("2026-03-03T12:00:00Z"));
        Session employeeSession = login(employeeAccount, "31000002");
        motive(employeeSession, health, "SALUD", "Consulta médica privada").andExpect(status().isOk());
        motive(employeeSession, transport, "TRANSPORTE", "Paro de colectivos").andExpect(status().isOk());
        Timestamp old = ts(Instant.now().minus(91, ChronoUnit.DAYS));
        jdbc.update("UPDATE deviations SET motive_created_at=? WHERE company_id=?", old, company.toString());

        retention.purgeSensitiveData();

        Map<String, Object> healthRow = jdbc.queryForMap("SELECT * FROM deviations WHERE id=?", health.toString());
        assertEquals("SALUD", healthRow.get("motive_category"));
        assertNull(healthRow.get("motive_text"));
        assertNull(healthRow.get("motive_ciphertext"));
        assertNull(healthRow.get("motive_iv"));
        assertNull(healthRow.get("motive_cipher_key_id"));
        assertNotNull(healthRow.get("motive_purged_at"));
        Map<String, Object> transportRow = jdbc.queryForMap("SELECT * FROM deviations WHERE id=?", transport.toString());
        assertEquals("TRANSPORTE", transportRow.get("motive_category"));
        assertEquals("Paro de colectivos", transportRow.get("motive_text"));
        assertNull(transportRow.get("motive_purged_at"));

        Session admin = login(adminAccount, "31000001");
        JsonNode list = json(mockMvc.perform(get("/api/v1/deviations").cookie(admin.cookie())).andExpect(status().isOk()).andReturn());
        JsonNode healthView = byId(list, health), transportView = byId(list, transport);
        assertEquals("SALUD", healthView.get("category").asText());
        assertFalse(healthView.hasNonNull("motiveText"));
        assertEquals("PENDIENTE_REVISION", healthView.get("status").asText());
        assertEquals("Paro de colectivos", transportView.get("motiveText").asText());
    }

    // ---------- D-20261027-01: a type change sends a classified deviation back to review ----------

    @Test
    void classifiedAbsenceReplacedByLateArrivalGoesBackToReviewKeepingTheMotive() throws Exception {
        Instant start = Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(2 * 3600);
        UUID j = jornadaAt(company, employee, site, template, LocalDate.now(), start, start.plusSeconds(8 * 3600));
        marks.createDueAbsences(start.plusSeconds(11 * 60), 200);
        UUID deviationId = activeDeviation(j, "SIN_INGRESO");
        Session employeeSession = login(employeeAccount, "31000002");
        motive(employeeSession, deviationId, "TRANSPORTE", "Se cortó la ruta").andExpect(status().isOk());
        Session admin = login(adminAccount, "31000001");
        classify(admin, deviationId, "JUSTIFICADO", null).andExpect(status().isOk());

        marks.recordEmployeeMark(employeeScope, j, MarkAction.INGRESO, UUID.randomUUID(), start.plusSeconds(20 * 60));

        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM deviations WHERE id=?", deviationId.toString());
        assertEquals("LLEGADA_TARDE", row.get("type"));
        assertNull(row.get("classification"));
        assertEquals("TRANSPORTE", row.get("motive_category"));
        assertEquals("Se cortó la ruta", row.get("motive_text"));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='CLASSIFICATION_RESET' " +
                "AND before_classification='JUSTIFICADO' AND after_classification IS NULL AND before_type='SIN_INGRESO' AND after_type='LLEGADA_TARDE'", deviationId));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='TYPE_REPLACED' " +
                "AND before_type='SIN_INGRESO' AND after_type='LLEGADA_TARDE'", deviationId));
        JsonNode item = json(mockMvc.perform(get("/api/v1/inbox").cookie(admin.cookie())).andExpect(status().isOk()).andReturn()).at("/items/0");
        assertEquals("PENDIENTE_REVISION", item.get("status").asText());
        assertEquals("Se cortó la ruta", item.get("motiveText").asText());
    }

    @Test
    void unclassifiedTypeChangeWritesNoClassificationResetAudit() {
        Instant start = Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(2 * 3600);
        UUID j = jornadaAt(company, employee, site, template, LocalDate.now(), start, start.plusSeconds(8 * 3600));
        marks.createDueAbsences(start.plusSeconds(11 * 60), 200);
        UUID deviationId = activeDeviation(j, "SIN_INGRESO");

        marks.recordEmployeeMark(employeeScope, j, MarkAction.INGRESO, UUID.randomUUID(), start.plusSeconds(20 * 60));

        assertEquals("LLEGADA_TARDE", jdbc.queryForObject("SELECT type FROM deviations WHERE id=?", String.class, deviationId.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='CLASSIFICATION_RESET'", deviationId));
    }

    @Test
    void reactivatedDeviationKeepsItsMotiveAndGoesBackToReview() throws Exception {
        Instant start = Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(2 * 3600);
        UUID j = jornadaAt(company, employee, site, template, LocalDate.now(), start, start.plusSeconds(8 * 3600));
        UUID markId = marks.recordEmployeeMark(employeeScope, j, MarkAction.INGRESO, UUID.randomUUID(), start.plusSeconds(20 * 60)).mark().id();
        UUID deviationId = activeDeviation(j, "LLEGADA_TARDE");
        motive(login(employeeAccount, "31000002"), deviationId, "OTRA", "Turno médico").andExpect(status().isOk());
        classify(login(adminAccount, "31000001"), deviationId, "NO_JUSTIFICADO", null).andExpect(status().isOk());

        marks.correctMark(adminScope, markId, MarkAction.INGRESO, start.plusSeconds(5 * 60), "Hora corregida");
        assertEquals(0, count("SELECT COUNT(*) FROM deviations WHERE id=? AND active=TRUE", deviationId));
        marks.correctMark(adminScope, markId, MarkAction.INGRESO, start.plusSeconds(30 * 60), "Hora corregida otra vez");

        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM deviations WHERE id=?", deviationId.toString());
        assertEquals(Boolean.TRUE, row.get("active"));
        assertNull(row.get("classification"));
        assertEquals("OTRA", row.get("motive_category"));
        assertEquals("Turno médico", row.get("motive_text"));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='CLASSIFICATION_RESET' " +
                "AND before_classification='NO_JUSTIFICADO' AND after_classification IS NULL", deviationId));
    }

    // ---------- D-20261027-02: motive correction until classified ----------

    @Test
    void employeeCanCorrectTheMotiveWhileUnclassifiedAndEachChangeIsAudited() throws Exception {
        UUID deviationId = deviation(jornada(LocalDate.of(2026, 3, 2)), "LLEGADA_TARDE", Instant.parse("2026-03-02T12:00:00Z"));
        Session employeeSession = login(employeeAccount, "31000002");
        motive(employeeSession, deviationId, "OTRA", "Me quedé dormido").andExpect(status().isOk());

        motive(employeeSession, deviationId, "SALUD", "Fiebre alta").andExpect(status().isOk())
                .andExpect(jsonPath("$.category").value("SALUD"))
                .andExpect(jsonPath("$.motiveText").value("Fiebre alta"))
                .andExpect(jsonPath("$.status").value("PENDIENTE_REVISION"));

        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM deviations WHERE id=?", deviationId.toString());
        assertEquals("SALUD", row.get("motive_category"));
        assertNull(row.get("motive_text"));
        assertNotNull(row.get("motive_ciphertext"));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='MOTIVE_SUBMITTED' AND actor_account_id='" + employeeAccount + "'", deviationId));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='MOTIVE_CORRECTED' AND actor_account_id='" + employeeAccount
                + "' AND audit_reason='Motive category OTRA -> SALUD'", deviationId));
        String audits = jdbc.queryForList("SELECT COALESCE(audit_reason,'') FROM deviation_audits WHERE deviation_id=?", String.class, deviationId.toString()).toString();
        assertFalse(audits.contains("Fiebre"));
        assertFalse(audits.contains("dormido"));
    }

    @Test
    void motiveValidationStillRejectsEmptyTooLongAndUnknownCategory() throws Exception {
        UUID deviationId = deviation(jornada(LocalDate.of(2026, 3, 2)), "LLEGADA_TARDE", Instant.parse("2026-03-02T12:00:00Z"));
        Session employeeSession = login(employeeAccount, "31000002");
        motive(employeeSession, deviationId, "OTRA", " ").andExpect(status().isUnprocessableEntity());
        motive(employeeSession, deviationId, "OTRA", "x".repeat(4001)).andExpect(status().isUnprocessableEntity());
        motive(employeeSession, deviationId, "VIAJE", "Texto").andExpect(status().isUnprocessableEntity());
        motive(employeeSession, deviationId, "OTRA", "x".repeat(4000)).andExpect(status().isOk());
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=?", deviationId));
    }

    @Test
    void classifiedMotiveIsLockedWithMotiveLockedConflict() throws Exception {
        UUID deviationId = deviation(jornada(LocalDate.of(2026, 3, 2)), "LLEGADA_TARDE", Instant.parse("2026-03-02T12:00:00Z"));
        Session employeeSession = login(employeeAccount, "31000002");
        motive(employeeSession, deviationId, "OTRA", "Primer motivo").andExpect(status().isOk());
        classify(login(adminAccount, "31000001"), deviationId, "JUSTIFICADO", null).andExpect(status().isOk());

        motive(employeeSession, deviationId, "OTRA", "Otro motivo").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MOTIVE_LOCKED"));

        Map<String, Object> row = jdbc.queryForMap("SELECT * FROM deviations WHERE id=?", deviationId.toString());
        assertEquals("Primer motivo", row.get("motive_text"));
        assertEquals("JUSTIFICADO", row.get("classification"));
        assertEquals(0, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='MOTIVE_CORRECTED'", deviationId));
    }

    @Test
    void purgedHealthMotiveOfAClassifiedDeviationCannotBeResubmitted() throws Exception {
        UUID deviationId = deviation(jornada(LocalDate.of(2026, 3, 2)), "LLEGADA_TARDE", Instant.parse("2026-03-02T12:00:00Z"));
        Session employeeSession = login(employeeAccount, "31000002");
        motive(employeeSession, deviationId, "SALUD", "Consulta médica").andExpect(status().isOk());
        classify(login(adminAccount, "31000001"), deviationId, "JUSTIFICADO", null).andExpect(status().isOk());
        jdbc.update("UPDATE deviations SET motive_created_at=? WHERE id=?", ts(Instant.now().minus(91, ChronoUnit.DAYS)), deviationId.toString());
        retention.purgeSensitiveData();

        motive(employeeSession, deviationId, "OTRA", "Nuevo texto").andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("MOTIVE_LOCKED"));
        assertEquals("JUSTIFICADO", jdbc.queryForObject("SELECT classification FROM deviations WHERE id=?", String.class, deviationId.toString()));
    }

    @Test
    void firstMotiveAfterClassificationWithoutMotiveSendsTheDeviationBackToReview() throws Exception {
        UUID deviationId = deviation(jornada(LocalDate.of(2026, 3, 2)), "SIN_INGRESO", Instant.parse("2026-03-02T12:00:00Z"));
        classify(login(adminAccount, "31000001"), deviationId, "NO_JUSTIFICADO", null).andExpect(status().isOk());
        Session employeeSession = login(employeeAccount, "31000002");

        motive(employeeSession, deviationId, "EMERGENCIA", "Inundación en casa").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDIENTE_REVISION"));

        assertNull(jdbc.queryForObject("SELECT classification FROM deviations WHERE id=?", String.class, deviationId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='CLASSIFICATION_RESET' " +
                "AND before_classification='NO_JUSTIFICADO' AND after_classification IS NULL AND actor_account_id='" + employeeAccount + "'", deviationId));
        // Once that first motive exists and the ADMIN classifies again, the motive is fixed.
        classify(login(adminAccount, "31000001"), deviationId, "JUSTIFICADO", null).andExpect(status().isOk());
        motive(employeeSession, deviationId, "OTRA", "Cambio").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("MOTIVE_LOCKED"));
    }

    @Test
    void classificationStillAuditsAndCorrectionStillNeedsAReason() throws Exception {
        UUID deviationId = deviation(jornada(LocalDate.of(2026, 3, 2)), "LLEGADA_TARDE", Instant.parse("2026-03-02T12:00:00Z"));
        Session admin = login(adminAccount, "31000001");
        classify(admin, deviationId, "JUSTIFICADO", null).andExpect(status().isOk());
        classify(admin, deviationId, "NO_JUSTIFICADO", null).andExpect(status().isUnprocessableEntity());
        classify(admin, deviationId, "NO_JUSTIFICADO", "Revisé el parte").andExpect(status().isOk());
        assertEquals(2, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='CLASSIFICATION_CHANGED'", deviationId));
        classify(login(employeeAccount, "31000002"), deviationId, "JUSTIFICADO", "x").andExpect(status().isForbidden());
    }

    // ---------- D-20261027-03: inbox ordered by fact time ----------

    @Test
    void inboxOrdersByFactTimeAndKeepsPagingStableWhenARowIsUpdated() throws Exception {
        // Fact times: newest = c, then a, then b; last-update order is the reverse of that for a and c.
        Instant base = Instant.parse("2026-03-20T10:00:00Z");
        UUID a = deviation(jornada(LocalDate.of(2026, 3, 5)), "LLEGADA_TARDE", base.plusSeconds(600));
        UUID b = deviation(jornada(LocalDate.of(2026, 3, 4)), "EXCESO_ALMUERZO", base.plusSeconds(300));
        UUID c = deviation(jornada(LocalDate.of(2026, 3, 6)), "EGRESO_TEMPRANO", base.plusSeconds(900));
        markSource(a, "INGRESO", Instant.parse("2026-03-05T11:30:00Z"));
        markSource(b, "VUELTA_ALMUERZO", Instant.parse("2026-03-04T16:00:00Z"));
        markSource(c, "EGRESO", Instant.parse("2026-03-06T17:00:00Z"));
        jdbc.update("UPDATE deviations SET updated_at=? WHERE id=?", ts(base.plusSeconds(5000)), a.toString());
        Session admin = login(adminAccount, "31000001");

        JsonNode first = json(mockMvc.perform(get("/api/v1/inbox?limit=1").cookie(admin.cookie())).andExpect(status().isOk()).andReturn());
        assertEquals(c.toString(), first.at("/items/0/id").asText());
        // Classifying a row that was already shown must neither repeat it nor skip another row.
        classify(admin, c, "JUSTIFICADO", null).andExpect(status().isOk());
        JsonNode second = json(mockMvc.perform(get("/api/v1/inbox?limit=1&cursor=" + first.get("nextCursor").asText()).cookie(admin.cookie()))
                .andExpect(status().isOk()).andReturn());
        assertEquals(a.toString(), second.at("/items/0/id").asText());
        JsonNode third = json(mockMvc.perform(get("/api/v1/inbox?limit=1&cursor=" + second.get("nextCursor").asText()).cookie(admin.cookie()))
                .andExpect(status().isOk()).andReturn());
        assertEquals(b.toString(), third.at("/items/0/id").asText());
        assertFalse(third.has("nextCursor"));
        assertEquals(List.of(c, a, b), ids(json(mockMvc.perform(get("/api/v1/inbox").cookie(admin.cookie())).andReturn()).get("items")));
    }

    @Test
    void reconcileWithoutChangesDoesNotBumpUpdatedAt() {
        Instant start = Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(2 * 3600);
        UUID j = jornadaAt(company, employee, site, template, LocalDate.now(), start, start.plusSeconds(8 * 3600));
        marks.recordEmployeeMark(employeeScope, j, MarkAction.INGRESO, UUID.randomUUID(), start.plusSeconds(20 * 60));
        UUID deviationId = activeDeviation(j, "LLEGADA_TARDE");
        Timestamp before = jdbc.queryForObject("SELECT updated_at FROM deviations WHERE id=?", Timestamp.class, deviationId.toString());

        marks.recordEmployeeMark(employeeScope, j, MarkAction.SALIDA_DESAYUNO, UUID.randomUUID(), start.plusSeconds(60 * 60));

        assertEquals(before, jdbc.queryForObject("SELECT updated_at FROM deviations WHERE id=?", Timestamp.class, deviationId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=?", deviationId));
    }

    // ---------- S8: GET /deviations status filter and bounds ----------

    @Test
    void deviationListHonoursTheStatusFilterForEveryStatus() throws Exception {
        UUID pending = deviation(jornada(LocalDate.of(2026, 3, 2)), "LLEGADA_TARDE", Instant.parse("2026-03-02T12:00:00Z"));
        UUID review = deviation(jornada(LocalDate.of(2026, 3, 3)), "LLEGADA_TARDE", Instant.parse("2026-03-03T12:00:00Z"));
        UUID justified = deviation(jornada(LocalDate.of(2026, 3, 4)), "LLEGADA_TARDE", Instant.parse("2026-03-04T12:00:00Z"));
        UUID rejected = deviation(jornada(LocalDate.of(2026, 3, 5)), "LLEGADA_TARDE", Instant.parse("2026-03-05T12:00:00Z"));
        UUID foreign = deviation(otherCompany, jornadaAt(otherCompany, otherEmployee, otherSite, otherTemplate, LocalDate.of(2026, 3, 2),
                Instant.parse("2026-03-02T11:00:00Z"), Instant.parse("2026-03-02T19:00:00Z")), otherSite, otherEmployee, "SIN_INGRESO", Instant.parse("2026-03-02T12:00:00Z"));
        Session employeeSession = login(employeeAccount, "31000002");
        motive(employeeSession, review, "OTRA", "Texto").andExpect(status().isOk());
        Session admin = login(adminAccount, "31000001");
        classify(admin, justified, "JUSTIFICADO", null).andExpect(status().isOk());
        classify(admin, rejected, "NO_JUSTIFICADO", null).andExpect(status().isOk());

        assertEquals(List.of(pending), ids(list(employeeSession, "status=MOTIVO_PENDIENTE")));
        assertEquals(List.of(review), ids(list(employeeSession, "status=PENDIENTE_REVISION")));
        assertEquals(List.of(justified), ids(list(admin, "status=JUSTIFICADO")));
        assertEquals(List.of(rejected), ids(list(admin, "status=NO_JUSTIFICADO")));
        assertEquals(4, list(admin, "").size());
        assertFalse(list(admin, "status=MOTIVO_PENDIENTE").toString().contains(foreign.toString()));
        mockMvc.perform(get("/api/v1/deviations?status=OTRO").cookie(admin.cookie()))
                .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
    }

    @Test
    void pendingMotivesOfEveryDateIncludingThePreviousDayAreListedForTheEmployee() throws Exception {
        UUID yesterday = deviation(jornada(LocalDate.now().minusDays(1)), "MARCA_FALTANTE", Instant.now().minusSeconds(3600));
        UUID lastMonth = deviation(jornada(LocalDate.now().minusDays(30)), "LLEGADA_TARDE", Instant.now().minusSeconds(30 * 86400L));
        Session employeeSession = login(employeeAccount, "31000002");
        assertEquals(List.of(yesterday, lastMonth), ids(list(employeeSession, "status=MOTIVO_PENDIENTE")));
    }

    @Test
    void deviationListIsBoundedByLimitAndByAPairedDateRange() throws Exception {
        for (int i = 1; i <= 3; i++) deviation(jornada(LocalDate.of(2026, 3, i)), "LLEGADA_TARDE", Instant.parse("2026-03-0" + i + "T12:00:00Z"));
        Session admin = login(adminAccount, "31000001");
        assertEquals(1, list(admin, "limit=1").size());
        assertEquals(3, list(admin, "limit=200").size());
        assertEquals(2, list(admin, "from=2026-03-02&to=2026-03-03").size());
        for (String query : List.of("limit=0", "limit=201", "limit=-1", "from=2026-03-01", "to=2026-03-31", "from=2025-01-01&to=2026-03-02")) {
            mockMvc.perform(get("/api/v1/deviations?" + query).cookie(admin.cookie()))
                    .andExpect(status().isUnprocessableEntity()).andExpect(jsonPath("$.code").value("VALIDATION_ERROR"));
        }
    }

    // ---------- helpers ----------

    private record Session(Cookie cookie, String csrf) { }

    private org.springframework.test.web.servlet.ResultActions motive(Session session, UUID deviationId, String category, String text) throws Exception {
        return write(session, put("/api/v1/deviations/{id}/motive", deviationId),
                objectMapper.writeValueAsString(Map.of("category", category, "text", text)));
    }

    private org.springframework.test.web.servlet.ResultActions classify(Session session, UUID deviationId, String classification, String reason) throws Exception {
        Map<String, String> body = reason == null ? Map.of("classification", classification) : Map.of("classification", classification, "correctionReason", reason);
        return write(session, put("/api/v1/admin/deviations/{id}/classification", deviationId), objectMapper.writeValueAsString(body));
    }

    private org.springframework.test.web.servlet.ResultActions write(Session session,
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, String body) throws Exception {
        return mockMvc.perform(request.cookie(session.cookie(), new Cookie("BRAJA_CSRF", session.csrf())).header("X-CSRF-TOKEN", session.csrf())
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private JsonNode list(Session session, String query) throws Exception {
        return json(mockMvc.perform(get("/api/v1/deviations" + (query.isEmpty() ? "" : "?" + query)).cookie(session.cookie()))
                .andExpect(status().isOk()).andReturn());
    }

    private List<UUID> ids(JsonNode array) {
        List<UUID> ids = new ArrayList<>();
        array.forEach(item -> ids.add(UUID.fromString(item.get("id").asText())));
        return ids;
    }

    private JsonNode byId(JsonNode array, UUID id) {
        for (JsonNode item : array) if (item.get("id").asText().equals(id.toString())) return item;
        throw new AssertionError("Missing deviation " + id);
    }

    private int count(String sql, UUID deviationId) { return jdbc.queryForObject(sql, Integer.class, deviationId.toString()); }

    private JsonNode json(MvcResult result) throws Exception { return objectMapper.readTree(result.getResponse().getContentAsString()); }

    private Session login(UUID account, String dni) throws Exception {
        jdbc.update("UPDATE accounts SET password_hash=? WHERE id=?", passwordEncoder.encode(PASSWORD), account.toString());
        MvcResult csrfResponse = mockMvc.perform(get("/api/v1/csrf")).andExpect(status().isOk()).andReturn();
        String csrf = json(csrfResponse).get("token").asText();
        Cookie anonymous = sessionCookie(csrfResponse);
        MvcResult login = mockMvc.perform(post("/api/v1/session")
                        .cookie(anonymous, new Cookie("BRAJA_CSRF", csrf))
                        .header("X-CSRF-TOKEN", csrf).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dni\":\"" + dni + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk()).andReturn();
        Cookie session = sessionCookie(login);
        // Read the token bound to the authenticated session, whether or not login rotates it.
        String current = json(mockMvc.perform(get("/api/v1/csrf").cookie(session)).andExpect(status().isOk()).andReturn()).get("token").asText();
        return new Session(session, current);
    }

    private static Cookie sessionCookie(MvcResult result) {
        String header = result.getResponse().getHeaders("Set-Cookie").stream().filter(h -> h.startsWith("BRAJA_SESSION=")).findFirst().orElseThrow();
        return new Cookie("BRAJA_SESSION", header.split(";", 2)[0].substring("BRAJA_SESSION=".length()));
    }

    private static Timestamp ts(Instant instant) { return Timestamp.from(instant); }

    private UUID activeDeviation(UUID jornada, String type) {
        return UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND type=? AND active=TRUE", String.class, jornada.toString(), type));
    }

    private UUID company(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", id.toString(), name, ts(Instant.now()));
        return id;
    }

    private UUID site(UUID owner) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", id.toString(), owner.toString(), "Sede", ZONE, ts(Instant.now()));
        return id;
    }

    private UUID template(UUID owner, UUID templateSite) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,?,20,30,TRUE,?,?)",
                id.toString(), owner.toString(), templateSite.toString(), "Turno", ts(Instant.now()), ts(Instant.now()));
        return id;
    }

    private UUID account(String dni) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                id.toString(), dni, dni, "unused-test-hash", ts(Instant.now()), ts(Instant.now()));
        return id;
    }

    private void membership(UUID owner, UUID account, String role) {
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,?,TRUE,?)",
                UUID.randomUUID().toString(), owner.toString(), account.toString(), role, ts(Instant.now()));
    }

    private UUID employee(UUID owner, UUID account, String name, UUID employeeSite) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,10,TRUE,?,?)",
                id.toString(), owner.toString(), account.toString(), name, ts(Instant.now()), ts(Instant.now()));
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)", owner.toString(), id.toString(), employeeSite.toString(), ts(Instant.now()));
        return id;
    }

    private UUID jornada(LocalDate date) {
        Instant start = date.atTime(11, 0).toInstant(java.time.ZoneOffset.UTC);
        return jornadaAt(company, employee, site, template, date, start, start.plusSeconds(8 * 3600));
    }

    private UUID jornadaAt(UUID owner, UUID jornadaEmployee, UUID jornadaSite, UUID jornadaTemplate, LocalDate date, Instant start, Instant end) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,10,?,?,'NO_INGRESO',1,?,?)",
                id.toString(), owner.toString(), jornadaEmployee.toString(), jornadaSite.toString(), jornadaTemplate.toString(), date, ZONE,
                "{\"siteId\":\"" + jornadaSite + "\",\"name\":\"Turno\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}",
                ts(start), ts(end), adminAccount.toString(), ts(Instant.now()));
        return id;
    }

    private UUID deviation(UUID jornada, String type, Instant at) {
        return deviation(company, jornada, site, employee, type, at);
    }

    private UUID deviation(UUID owner, UUID jornada, UUID deviationSite, UUID deviationEmployee, String type, Instant at) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO deviations(id,company_id,jornada_id,site_id,employee_id,type,created_at,updated_at,active) VALUES(?,?,?,?,?,?,?,?,TRUE)",
                id.toString(), owner.toString(), jornada.toString(), deviationSite.toString(), deviationEmployee.toString(), type, ts(at), ts(at));
        return id;
    }

    /** Attaches a source mark with the given fact time to a seeded deviation (inserted directly; no reconcile runs). */
    private void markSource(UUID deviationId, String action, Instant occurredAt) {
        String jornadaId = jdbc.queryForObject("SELECT jornada_id FROM deviations WHERE id=?", String.class, deviationId.toString());
        UUID markId = UUID.randomUUID();
        jdbc.update("INSERT INTO mark_events(id,company_id,jornada_id,sequence_number,timeline_order,action,original_action,occurred_at,original_occurred_at,accepted_at,recorded_at,origin,created_by,location_status) VALUES(?,?,?,1,1000,?,?,?,?,?,?,'EMPLEADO',?,'NO_APLICA')",
                markId.toString(), company.toString(), jornadaId, action, action, ts(occurredAt), ts(occurredAt), ts(occurredAt), ts(occurredAt), adminAccount.toString());
        jdbc.update("UPDATE deviations SET source_mark_id=? WHERE id=?", markId.toString(), deviationId.toString());
    }
}
