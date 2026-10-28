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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * Issue #53: cancel a declared jornada without marks (D-20261027-07) and void a wrong mark (D-20261027-08). Every rule goes
 * through HTTP against MySQL 8.4 and asserts status, code, body and the persisted rows; the jobs are driven through MarkService.
 */
@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class JornadaCancellationAndMarkVoidMySqlTest {
    private static final String AES_KEY = java.util.Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = java.util.Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    private static final String PASSWORD = "CorrectHorseBattery9!";
    private static final String ZONE = "America/Argentina/Buenos_Aires";
    private static String passwordHash;

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja_cancel_void_test")
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
    private UUID employeeAccountId;
    private UUID employeeId;
    private UUID templateId;
    private UUID jornadaId;
    private String adminDni;
    private String employeeDni;
    private Instant now;

    @BeforeEach
    void setUp() {
        if (passwordHash == null) passwordHash = passwordEncoder.encode(PASSWORD);
        now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        companyId = UUID.randomUUID();
        siteId = UUID.randomUUID();
        adminAccountId = UUID.randomUUID();
        employeeAccountId = UUID.randomUUID();
        employeeId = UUID.randomUUID();
        templateId = UUID.randomUUID();
        String suffix = String.format("%08d", Math.floorMod(System.nanoTime(), 100_000_000L));
        adminDni = "1" + suffix;
        employeeDni = "2" + suffix;
        Timestamp ts = Timestamp.from(now);
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), "Cancel " + suffix, ts);
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", siteId.toString(), companyId.toString(), "Centro", ZONE, ts);
        for (UUID account : new UUID[]{adminAccountId, employeeAccountId}) {
            String dni = account.equals(adminAccountId) ? adminDni : employeeDni;
            jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                    account.toString(), dni, dni, passwordHash, ts, ts);
        }
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'ADMIN',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), adminAccountId.toString(), ts);
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), employeeAccountId.toString(), ts);
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,10,TRUE,?,?)",
                employeeId.toString(), companyId.toString(), employeeAccountId.toString(), "Persona " + suffix, ts, ts);
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)", companyId.toString(), employeeId.toString(), siteId.toString(), ts);
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,'Turno',20,30,TRUE,?,?)",
                templateId.toString(), companyId.toString(), siteId.toString(), ts, ts);
        jdbc.update("INSERT INTO template_blocks(id,company_id,template_id,sequence_number,start_day_offset,starts_at,ends_at,end_day_offset) VALUES(?,?,?,1,0,'08:00:00','16:00:00',0)",
                UUID.randomUUID().toString(), companyId.toString(), templateId.toString());
        // Started 15 minutes ago with a 10-minute tolerance: an absence is already due and an INGRESO now is late.
        jornadaId = insertJornada(LocalDate.now(ZoneId.of(ZONE)), now.minusSeconds(900), now.plusSeconds(3600));
    }

    // Feature 1 (D-20261027-07): cancel a declared jornada without marks.

    @Test
    void cancellingAJornadaWithoutMarksStoresAuthorTimeAndReasonAndRetractsItsAbsence() throws Exception {
        marks.createDueAbsences(now, 200);
        UUID absence = UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", String.class, jornadaId.toString()));
        Login admin = login(adminDni);

        MvcResult result = send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), reasonBody("Feriado nacional"));

        assertEquals(200, result.getResponse().getStatus(), result.getResponse().getContentAsString());
        assertEquals(jornadaId.toString(), json(result).get("jornadaId").asText());
        assertEquals("CANCELADA", json(result).get("state").asText());
        assertEquals("Feriado nacional", json(result).get("cancelReason").asText());
        assertEquals(adminAccountId.toString(), json(result).get("cancelledBy").asText());
        assertEquals("CANCELADA", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        assertEquals(adminAccountId.toString(), jdbc.queryForObject("SELECT cancelled_by FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        assertEquals("Feriado nacional", jdbc.queryForObject("SELECT cancel_reason FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        Instant cancelledAt = jdbc.queryForObject("SELECT cancelled_at FROM jornadas WHERE id=?", Timestamp.class, jornadaId.toString()).toInstant();
        assertFalse(cancelledAt.isBefore(now));
        assertEquals(cancelledAt, Instant.parse(json(result).get("cancelledAt").asText()));
        // The absence is retracted through the reconcile retraction (audited). Push is off here; with push on, a pending
        // outbox event of an inactive deviation is not counted (NotificationWindowRepository.loadSiteCounts), as for any retraction.
        assertEquals(0, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active=TRUE", jornadaId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='RETRACTED' AND before_type='SIN_INGRESO'", absence.toString()));
        // Both roles see the jornada as cancelled; only the ADMIN reads the reason.
        JsonNode adminView = json(mockMvc.perform(get("/api/v1/jornadas/{id}", jornadaId).cookie(admin.session())).andReturn());
        assertEquals("CANCELADA", adminView.get("state").asText());
        assertEquals("Feriado nacional", adminView.get("cancelReason").asText());
        JsonNode employeeView = json(mockMvc.perform(get("/api/v1/jornadas/{id}", jornadaId).cookie(login(employeeDni).session())).andReturn());
        assertEquals("CANCELADA", employeeView.get("state").asText());
        assertEquals(cancelledAt, Instant.parse(employeeView.get("cancelledAt").asText()));
        assertAbsent(employeeView, "cancelReason");
    }

    @Test
    void cancellingAJornadaWithValidMarksIsAConflictButOnlyVoidedMarksDoNotBlockIt() throws Exception {
        Login employee = login(employeeDni);
        UUID markId = UUID.fromString(json(mark(employee, jornadaId, UUID.randomUUID(), "INGRESO")).get("id").asText());
        Login admin = login(adminDni);

        assertProblem(send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), reasonBody("Licencia")), 409, "JORNADA_HAS_MARKS");
        assertEquals("EN_CURSO", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        assertNull(jdbc.queryForObject("SELECT cancelled_at FROM jornadas WHERE id=?", Timestamp.class, jornadaId.toString()));

        assertEquals(200, send(admin, post("/api/v1/admin/marks/{id}/void", markId), reasonBody("Marca equivocada")).getResponse().getStatus());
        assertEquals("NO_INGRESO", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        // Owner answer 2026-10-27: voided marks do not count, so the jornada can be cancelled and keeps the voided mark.
        assertEquals(200, send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), reasonBody("Licencia")).getResponse().getStatus());
        assertEquals("CANCELADA", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM mark_events WHERE id=? AND voided_at IS NOT NULL", markId.toString()));
    }

    @Test
    void cancellingTwiceIsAConflictAndKeepsTheFirstCancellation() throws Exception {
        Login admin = login(adminDni);
        assertEquals(200, send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), reasonBody("Feriado")).getResponse().getStatus());
        Timestamp first = jdbc.queryForObject("SELECT cancelled_at FROM jornadas WHERE id=?", Timestamp.class, jornadaId.toString());

        assertProblem(send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), reasonBody("Otro motivo")), 409, "JORNADA_CANCELLED");

        assertEquals("Feriado", jdbc.queryForObject("SELECT cancel_reason FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        assertEquals(first, jdbc.queryForObject("SELECT cancelled_at FROM jornadas WHERE id=?", Timestamp.class, jornadaId.toString()));
    }

    @Test
    void cancellationNeedsAReasonOfAtMost2000CharactersAnAdminAndAJornadaOfTheCompany() throws Exception {
        Login admin = login(adminDni);
        assertProblem(send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), reasonBody(" ")), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), reasonBody("x".repeat(2001))), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", UUID.randomUUID()), reasonBody("Feriado")), 404, "NOT_FOUND");
        assertProblem(send(login(employeeDni), post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), reasonBody("Feriado")), 403, "FORBIDDEN");
        assertEquals("NO_INGRESO", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));

        assertEquals(200, send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), reasonBody("x".repeat(2000))).getResponse().getStatus());
    }

    @Test
    void marksAndForgottenMarksOnACancelledJornadaAreConflicts() throws Exception {
        Login admin = login(adminDni);
        assertEquals(200, send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), reasonBody("Feriado")).getResponse().getStatus());

        assertProblem(mark(login(employeeDni), jornadaId, UUID.randomUUID(), "INGRESO"), 409, "JORNADA_CANCELLED");
        assertProblem(send(admin, post("/api/v1/admin/jornadas/{id}/forgotten-marks", jornadaId),
                "{\"action\":\"INGRESO\",\"occurredAt\":\"" + now.minusSeconds(600) + "\",\"auditReason\":\"Olvido\"}"), 409, "JORNADA_CANCELLED");

        assertEquals(0, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", jornadaId.toString()));
        assertEquals("CANCELADA", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
    }

    @Test
    void absenceJobIgnoresACancelledJornada() throws Exception {
        assertEquals(200, send(login(adminDni), post("/api/v1/admin/jornadas/{id}/cancellation", jornadaId), reasonBody("Feriado")).getResponse().getStatus());

        marks.createDueAbsences(now.plusSeconds(7200), 200);

        assertEquals(0, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=?", jornadaId.toString()));
        // Previous behaviour kept: a non-cancelled jornada that is due still gets its absence.
        UUID other = insertJornada(LocalDate.now(ZoneId.of(ZONE)).plusDays(1), now.minusSeconds(900), now.plusSeconds(3600));
        marks.createDueAbsences(now, 200);
        assertEquals(1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", other.toString()));
    }

    @Test
    void aCancelledJornadaCanBeDeclaredAgainForTheSameEmployeeSiteAndDate() throws Exception {
        Login admin = login(adminDni);
        String body = declareBody("2026-11-03");
        MvcResult declared = send(admin, post("/api/v1/jornadas"), body);
        assertEquals(201, declared.getResponse().getStatus(), declared.getResponse().getContentAsString());
        UUID first = UUID.fromString(json(declared).get("id").asText());
        // Previous behaviour kept: a second live declaration is rejected.
        assertProblem(send(admin, post("/api/v1/jornadas"), body), 409, "JORNADA_EXISTS");

        assertEquals(200, send(admin, post("/api/v1/admin/jornadas/{id}/cancellation", first), reasonBody("Se declaró por error")).getResponse().getStatus());
        MvcResult again = send(admin, post("/api/v1/jornadas"), body);

        assertEquals(201, again.getResponse().getStatus(), again.getResponse().getContentAsString());
        assertEquals("NO_INGRESO", json(again).get("state").asText());
        assertNotEquals(first.toString(), json(again).get("id").asText());
        assertProblem(send(admin, post("/api/v1/jornadas"), body), 409, "JORNADA_EXISTS");
        assertEquals(2, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=? AND site_id=? AND local_date='2026-11-03'", employeeId.toString(), siteId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=? AND site_id=? AND local_date='2026-11-03' AND state<>'CANCELADA'", employeeId.toString(), siteId.toString()));
    }

    @Test
    void concurrentDeclarationsOfTheSameEmployeeSiteAndDateStillYieldOneJornada() throws Exception {
        int threads = 4;
        List<Login> admins = new ArrayList<>();
        for (int i = 0; i < threads; i++) admins.add(login(adminDni));
        String body = declareBody("2026-11-04");
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        List<Future<MvcResult>> results = new ArrayList<>();
        for (Login admin : admins) results.add(pool.submit(() -> { start.await(); return send(admin, post("/api/v1/jornadas"), body); }));
        start.countDown();
        int created = 0, conflicts = 0;
        for (Future<MvcResult> future : results) {
            MvcResult result = future.get(30, TimeUnit.SECONDS);
            int status = result.getResponse().getStatus();
            if (status == 201) created++;
            else if (status == 409 && "JORNADA_EXISTS".equals(json(result).get("code").asText())) conflicts++;
            else fail("unexpected answer " + status + " " + result.getResponse().getContentAsString());
        }
        pool.shutdownNow();

        assertEquals(1, created);
        assertEquals(threads - 1, conflicts);
        assertEquals(1, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=? AND site_id=? AND local_date='2026-11-04'", employeeId.toString(), siteId.toString()));
    }

    // Feature 2 (D-20261027-08): void a wrong mark.

    @Test
    void voidingAMarkKeepsTheRowAuditsItAndStopsCountingIt() throws Exception {
        Login employee = login(employeeDni);
        MvcResult ingress = mark(employee, jornadaId, UUID.randomUUID(), "INGRESO");
        MvcResult breakfast = mark(employee, jornadaId, UUID.randomUUID(), "SALIDA_DESAYUNO");
        UUID breakfastId = UUID.fromString(json(breakfast).get("id").asText());
        assertEquals("PAUSA_ABIERTA", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        Login admin = login(adminDni);

        MvcResult voided = send(admin, post("/api/v1/admin/marks/{id}/void", breakfastId), reasonBody("No salió a desayunar"));

        assertEquals(200, voided.getResponse().getStatus(), voided.getResponse().getContentAsString());
        assertTrue(json(voided).get("voided").asBoolean());
        assertEquals("No salió a desayunar", json(voided).get("voidReason").asText());
        assertEquals(2, json(voided).get("sequence").asLong());
        assertEquals("SALIDA_DESAYUNO", json(voided).get("action").asText());
        assertEquals(adminAccountId.toString(), jdbc.queryForObject("SELECT voided_by FROM mark_events WHERE id=?", String.class, breakfastId.toString()));
        assertEquals("No salió a desayunar", jdbc.queryForObject("SELECT void_reason FROM mark_events WHERE id=?", String.class, breakfastId.toString()));
        assertEquals(Instant.parse(json(voided).get("voidedAt").asText()),
                jdbc.queryForObject("SELECT voided_at FROM mark_events WHERE id=?", Timestamp.class, breakfastId.toString()).toInstant());
        assertEquals(2, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", jornadaId.toString()));
        assertEquals("EN_CURSO", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM mark_correction_audits WHERE mark_id=? AND change_kind='VOID' AND actor_account_id=? AND audit_reason=? " +
                "AND before_action='SALIDA_DESAYUNO' AND after_action='SALIDA_DESAYUNO'", breakfastId.toString(), adminAccountId.toString(), "No salió a desayunar"));

        // The voided pause no longer counts: the employee may start breakfast again; receipt sequences keep increasing.
        MvcResult again = mark(employee, jornadaId, UUID.randomUUID(), "SALIDA_DESAYUNO");
        assertEquals(201, again.getResponse().getStatus(), again.getResponse().getContentAsString());
        assertEquals(3, json(again).get("sequence").asLong());
        assertEquals(json(ingress).get("id").asText(), json(mockMvc.perform(get("/api/v1/jornadas/{id}", jornadaId).cookie(admin.session())).andReturn()).get("marks").get(0).get("id").asText());
    }

    @Test
    void voidingTheOnlyIngressTurnsTheLateArrivalBackIntoAnAbsence() throws Exception {
        Login employee = login(employeeDni);
        UUID ingress = UUID.fromString(json(mark(employee, jornadaId, UUID.randomUUID(), "INGRESO")).get("id").asText());
        UUID deviation = UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND type='LLEGADA_TARDE' AND active=TRUE", String.class, jornadaId.toString()));

        assertEquals(200, send(login(adminDni), post("/api/v1/admin/marks/{id}/void", ingress), reasonBody("Marcó en la jornada equivocada")).getResponse().getStatus());

        assertEquals("NO_INGRESO", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        // Reconcile replaces the same deviation (D-20261027-01), now without a source mark.
        assertEquals("SIN_INGRESO", jdbc.queryForObject("SELECT type FROM deviations WHERE id=? AND active=TRUE", String.class, deviation.toString()));
        assertNull(jdbc.queryForObject("SELECT source_mark_id FROM deviations WHERE id=?", String.class, deviation.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active=TRUE", jornadaId.toString()));
    }

    @Test
    void voidingAMarkThatLeavesAnInvalidHistoryIsAConflict() throws Exception {
        Login employee = login(employeeDni);
        UUID ingress = UUID.fromString(json(mark(employee, jornadaId, UUID.randomUUID(), "INGRESO")).get("id").asText());
        mark(employee, jornadaId, UUID.randomUUID(), "SALIDA_DESAYUNO");

        assertProblem(send(login(adminDni), post("/api/v1/admin/marks/{id}/void", ingress), reasonBody("Error")), 409, "INVALID_MARK_HISTORY");

        assertNull(jdbc.queryForObject("SELECT voided_at FROM mark_events WHERE id=?", Timestamp.class, ingress.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM mark_correction_audits WHERE mark_id=?", ingress.toString()));
        assertEquals("PAUSA_ABIERTA", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
    }

    @Test
    void voidingTwiceOrCorrectingAVoidedMarkIsAConflictAndVoidNeedsAReasonAndAnAdmin() throws Exception {
        Login employee = login(employeeDni);
        UUID ingress = UUID.fromString(json(mark(employee, jornadaId, UUID.randomUUID(), "INGRESO")).get("id").asText());
        Login admin = login(adminDni);
        assertProblem(send(admin, post("/api/v1/admin/marks/{id}/void", ingress), reasonBody("")), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post("/api/v1/admin/marks/{id}/void", ingress), reasonBody("x".repeat(2001))), 422, "VALIDATION_ERROR");
        assertProblem(send(employee, post("/api/v1/admin/marks/{id}/void", ingress), reasonBody("Error")), 403, "FORBIDDEN");
        assertProblem(send(admin, post("/api/v1/admin/marks/{id}/void", UUID.randomUUID()), reasonBody("Error")), 404, "NOT_FOUND");
        assertEquals(200, send(admin, post("/api/v1/admin/marks/{id}/void", ingress), reasonBody("Error")).getResponse().getStatus());

        assertProblem(send(admin, post("/api/v1/admin/marks/{id}/void", ingress), reasonBody("Otra vez")), 409, "MARK_VOIDED");
        assertProblem(send(admin, post("/api/v1/admin/marks/{id}/correction", ingress),
                "{\"correctedAction\":\"INGRESO\",\"correctedOccurredAt\":\"" + now.minusSeconds(60) + "\",\"auditReason\":\"Hora\"}"), 409, "MARK_VOIDED");

        assertEquals("Error", jdbc.queryForObject("SELECT void_reason FROM mark_events WHERE id=?", String.class, ingress.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM mark_correction_audits WHERE mark_id=?", ingress.toString()));
    }

    @Test
    void correctionOfAMarkThatIsNotVoidedStillWorksAndIsAuditedAsACorrection() throws Exception {
        Login employee = login(employeeDni);
        UUID ingress = UUID.fromString(json(mark(employee, jornadaId, UUID.randomUUID(), "INGRESO")).get("id").asText());
        Instant correctedAt = now.minusSeconds(600);

        MvcResult corrected = send(login(adminDni), post("/api/v1/admin/marks/{id}/correction", ingress),
                "{\"correctedAction\":\"INGRESO\",\"correctedOccurredAt\":\"" + correctedAt + "\",\"auditReason\":\"Hora\"}");

        assertEquals(200, corrected.getResponse().getStatus(), corrected.getResponse().getContentAsString());
        assertFalse(json(corrected).get("voided").asBoolean());
        assertEquals(correctedAt, Instant.parse(json(corrected).get("occurredAt").asText()));
        assertEquals(1, count("SELECT COUNT(*) FROM mark_correction_audits WHERE mark_id=? AND change_kind='CORRECTION'", ingress.toString()));
    }

    @Test
    void idempotentReplayOfAVoidedMarkReturnsItsCurrentStateWithoutTheAdminFields() throws Exception {
        Login employee = login(employeeDni);
        UUID key = UUID.randomUUID();
        UUID ingress = UUID.fromString(json(mark(employee, jornadaId, key, "INGRESO")).get("id").asText());
        assertEquals(200, send(login(adminDni), post("/api/v1/admin/marks/{id}/void", ingress), reasonBody("Licencia médica")).getResponse().getStatus());

        MvcResult replay = mark(employee, jornadaId, key, "INGRESO");

        assertEquals(200, replay.getResponse().getStatus(), replay.getResponse().getContentAsString());
        assertEquals(ingress.toString(), json(replay).get("id").asText());
        assertTrue(json(replay).get("voided").asBoolean());
        assertAbsent(json(replay), "voidReason");
        assertAbsent(json(replay), "voidedAt");
        assertEquals(1, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", jornadaId.toString()));
    }

    @Test
    void jornadaAndHistoryViewsShowVoidedMarks() throws Exception {
        Login employee = login(employeeDni);
        mark(employee, jornadaId, UUID.randomUUID(), "INGRESO");
        UUID breakfast = UUID.fromString(json(mark(employee, jornadaId, UUID.randomUUID(), "SALIDA_DESAYUNO")).get("id").asText());
        Login admin = login(adminDni);
        assertEquals(200, send(admin, post("/api/v1/admin/marks/{id}/void", breakfast), reasonBody("Tocó por error")).getResponse().getStatus());

        JsonNode adminMarks = json(mockMvc.perform(get("/api/v1/jornadas/{id}", jornadaId).cookie(admin.session())).andReturn()).get("marks");
        assertEquals(2, adminMarks.size());
        assertFalse(adminMarks.get(0).get("voided").asBoolean());
        assertTrue(adminMarks.get(1).get("voided").asBoolean());
        assertEquals("Tocó por error", adminMarks.get(1).get("voidReason").asText());
        JsonNode history = json(mockMvc.perform(get("/api/v1/jornadas").param("from", LocalDate.now(ZoneId.of(ZONE)).toString())
                .param("to", LocalDate.now(ZoneId.of(ZONE)).toString()).param("employeeId", employeeId.toString()).param("includeDetail", "true")
                .cookie(admin.session())).andReturn());
        assertTrue(history.get(0).get("marks").get(1).get("voided").asBoolean());
        assertEquals("Tocó por error", history.get(0).get("marks").get(1).get("voidReason").asText());
        JsonNode employeeMarks = json(mockMvc.perform(get("/api/v1/jornadas/{id}", jornadaId).cookie(employee.session())).andReturn()).get("marks");
        assertTrue(employeeMarks.get(1).get("voided").asBoolean());
        assertAbsent(employeeMarks.get(1), "voidReason");
    }

    @Test
    void absenceJobCountsAVoidedIngressAsMissing() throws Exception {
        // Starts in 10 minutes: an early INGRESO is accepted (30-minute window) and no absence is due yet.
        UUID upcoming = insertJornada(LocalDate.now(ZoneId.of(ZONE)).plusDays(2), now.plusSeconds(600), now.plusSeconds(7200));
        Login employee = login(employeeDni);
        MvcResult ingress = mark(employee, upcoming, UUID.randomUUID(), "INGRESO");
        assertEquals(201, ingress.getResponse().getStatus(), ingress.getResponse().getContentAsString());
        assertEquals(200, send(login(adminDni), post("/api/v1/admin/marks/{id}/void", json(ingress).get("id").asText()), reasonBody("Jornada equivocada")).getResponse().getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=?", upcoming.toString()));

        marks.createDueAbsences(now.plusSeconds(1800), 200);

        assertEquals(1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", upcoming.toString()));
    }

    @Test
    void missingEgressJobCountsAVoidedEgressAsMissing() throws Exception {
        Login employee = login(employeeDni);
        mark(employee, jornadaId, UUID.randomUUID(), "INGRESO");
        UUID egress = UUID.fromString(json(mark(employee, jornadaId, UUID.randomUUID(), "EGRESO")).get("id").asText());
        assertEquals(200, send(login(adminDni), post("/api/v1/admin/marks/{id}/void", egress), reasonBody("Salida equivocada")).getResponse().getStatus());
        assertEquals("EN_CURSO", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type IN ('EGRESO_TEMPRANO','MARCA_FALTANTE') AND active=TRUE", jornadaId.toString()));

        marks.createDueAbsences(now.plusSeconds(7200), 200);

        assertEquals(1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='MARCA_FALTANTE' AND active=TRUE", jornadaId.toString()));
    }

    private UUID insertJornada(LocalDate localDate, Instant start, Instant end) {
        UUID id = UUID.randomUUID();
        String snapshot = "{\"siteId\":\"" + siteId + "\",\"name\":\"Turno\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,10,?,?,'NO_INGRESO',1,?,?)",
                id.toString(), companyId.toString(), employeeId.toString(), siteId.toString(), templateId.toString(), localDate,
                ZONE, snapshot, Timestamp.from(start), Timestamp.from(end), adminAccountId.toString(), Timestamp.from(now));
        return id;
    }

    private String reasonBody(String reason) {
        return "{\"reason\":\"" + reason + "\"}";
    }

    private String declareBody(String localDate) {
        return "{\"employeeId\":\"" + employeeId + "\",\"siteId\":\"" + siteId + "\",\"localDate\":\"" + localDate + "\",\"templateId\":\"" + templateId + "\"}";
    }

    private MvcResult mark(Login login, UUID jornada, UUID key, String action) throws Exception {
        return mockMvc.perform(post("/api/v1/jornadas/{id}/marks", jornada).cookie(login.session())
                .header("X-CSRF-TOKEN", login.csrf()).header("Idempotency-Key", key.toString())
                .contentType(MediaType.APPLICATION_JSON).content("{\"action\":\"" + action + "\"}")).andReturn();
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

    /** Null fields are left out of the JSON body; either form means "not exposed". */
    private static void assertAbsent(JsonNode node, String field) {
        assertTrue(node.path(field).isMissingNode() || node.get(field).isNull(), field + " must not be exposed: " + node);
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
