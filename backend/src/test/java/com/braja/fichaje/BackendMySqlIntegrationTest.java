package com.braja.fichaje;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.deviations.DeviationController;
import com.braja.fichaje.deviations.DeviationService;
import com.braja.fichaje.organization.OrganizationController;
import com.braja.fichaje.security.BrajaUserDetails;
import com.braja.fichaje.security.CurrentActor;
import com.braja.fichaje.security.PrivacyRetentionScheduler;
import com.braja.fichaje.timekeeping.MarkAction;
import com.braja.fichaje.timekeeping.MarkController;
import com.braja.fichaje.timekeeping.MarkService;
import com.braja.fichaje.timekeeping.JornadaDeclarationService;
import com.braja.fichaje.security.ScopeService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.security.core.Authentication;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.time.temporal.ChronoUnit;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BackendMySqlIntegrationTest {
    private static final String AES_KEY = java.util.Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = java.util.Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.US_ASCII));

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
    @Autowired MarkService marks;
    @Autowired JornadaDeclarationService jornadaDeclarations;
    @Autowired MarkController markController;
    @Autowired DeviationService deviations;
    @Autowired DeviationController deviationController;
    @Autowired OrganizationController organizations;
    @Autowired PrivacyRetentionScheduler retention;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    private UUID companyId;
    private UUID siteId;
    private UUID accountId;
    private UUID adminAccountId;
    private UUID employeeId;
    private UUID jornadaId;
    private UUID templateId;
    private ScopeService.Scope employeeScope;
    private ScopeService.Scope adminScope;

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM notification_outbox_events");
        jdbc.update("DELETE FROM notification_company_state");
        jdbc.update("DELETE FROM notification_windows");
        jdbc.update("DELETE FROM push_subscriptions");
        jdbc.update("DELETE FROM deviation_audits");
        jdbc.update("DELETE FROM forgotten_mark_audits");
        jdbc.update("DELETE FROM mark_correction_audits");
        jdbc.update("DELETE FROM mark_idempotency");
        jdbc.update("DELETE FROM deviations");
        jdbc.update("DELETE FROM mark_events");
        jdbc.update("DELETE FROM jornadas");
        jdbc.update("DELETE FROM template_blocks");
        jdbc.update("DELETE FROM schedule_templates");
        jdbc.update("DELETE FROM employee_sites");
        jdbc.update("DELETE FROM employees");
        jdbc.update("DELETE FROM site_location_audits");
        jdbc.update("DELETE FROM company_memberships");
        jdbc.update("DELETE FROM accounts");
        jdbc.update("DELETE FROM sites");
        jdbc.update("DELETE FROM companies");

        Instant now = Instant.now();
        companyId = UUID.randomUUID();
        siteId = UUID.randomUUID();
        accountId = UUID.randomUUID();
        adminAccountId = UUID.randomUUID();
        employeeId = UUID.randomUUID();
        jornadaId = UUID.randomUUID();
        templateId = UUID.randomUUID();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), "Braja test", java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", siteId.toString(), companyId.toString(), "Centro", "America/Argentina/Buenos_Aires", java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                accountId.toString(), "30123456", "30.123.456", "unused-test-hash", java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                adminAccountId.toString(), "30123457", "30.123.457", "unused-test-hash", java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), accountId.toString(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'ADMIN',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), adminAccountId.toString(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,?,TRUE,?,?)",
                employeeId.toString(), companyId.toString(), accountId.toString(), "Persona de prueba", 10, java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)", companyId.toString(), employeeId.toString(), siteId.toString(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,?,20,30,TRUE,?,?)",
                templateId.toString(), companyId.toString(), siteId.toString(), "Turno", java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO template_blocks(id,company_id,template_id,sequence_number,start_day_offset,starts_at,ends_at,end_day_offset) VALUES(?,?,?,1,0,'08:00:00','16:00:00',0)",
                UUID.randomUUID().toString(), companyId.toString(), templateId.toString());
        Instant scheduleStart = now.minusSeconds(900);
        Instant scheduleEnd = now.plusSeconds(3600);
        String snapshot = "{\"siteId\":\"" + siteId + "\",\"name\":\"Turno\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'NO_INGRESO',1,?,?)",
                jornadaId.toString(), companyId.toString(), employeeId.toString(), siteId.toString(), templateId.toString(), java.time.LocalDate.now(),
                "America/Argentina/Buenos_Aires", snapshot, 10, java.sql.Timestamp.from(scheduleStart), java.sql.Timestamp.from(scheduleEnd), accountId.toString(), java.sql.Timestamp.from(now));
        employeeScope = new ScopeService.Scope(accountId, companyId, "EMPLOYEE", false);
        adminScope = new ScopeService.Scope(adminAccountId, companyId, "ADMIN", false);
    }

    @Test
    void migrationsCreateTheTenantAndPrivacyInvariants() {
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='notification_outbox_events'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='deviations' AND column_name='active_type'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='site_location_audits' AND column_name='location_source'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='jornadas' AND column_name='site_geofence_latitude_snapshot'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.check_constraints WHERE constraint_schema=DATABASE() AND constraint_name='chk_deviation_fuera_source_mark'", Integer.class));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM bootstrap_guard WHERE id=1 AND consumed_at IS NULL", Integer.class));
    }

    @Test
    void journeyDatesDoNotDependOnJvmDefaultTimeZone() throws Exception {
        java.time.LocalDate expectedDate = java.time.LocalDate.of(2026, 10, 19);
        jdbc.update("UPDATE jornadas SET local_date=? WHERE id=?", expectedDate, jornadaId.toString());
        java.util.TimeZone originalTimeZone = java.util.TimeZone.getDefault();
        try {
            java.util.TimeZone.setDefault(java.util.TimeZone.getTimeZone("Pacific/Honolulu"));
            HttpLogin login = loginOverHttp(accountId, "30.123.456", "CorrectHorseBattery9!");

            mockMvc.perform(get("/api/v1/jornadas")
                            .param("from", expectedDate.toString())
                            .param("to", expectedDate.toString())
                            .cookie(login.sessionCookie()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].localDate").value(expectedDate.toString()));
            mockMvc.perform(get("/api/v1/jornadas/{id}", jornadaId).cookie(login.sessionCookie()))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.localDate").value(expectedDate.toString()));
        } finally {
            java.util.TimeZone.setDefault(originalTimeZone);
        }
    }

    @Test
    void identicalConcurrentRetriesPersistOneMarkAndReturnTheOriginalResponse() throws Exception {
        UUID key = UUID.randomUUID();
        Instant receivedAt = Instant.now();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        Callable<MarkService.MarkResult> task = () -> {
            ready.countDown();
            start.await();
            return marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.INGRESO, key, receivedAt);
        };
        Future<MarkService.MarkResult> one = pool.submit(task);
        Future<MarkService.MarkResult> two = pool.submit(task);
        assertTrue(ready.await(5, TimeUnit.SECONDS));
        start.countDown();
        MarkService.MarkResult a = one.get(15, TimeUnit.SECONDS);
        MarkService.MarkResult b = two.get(15, TimeUnit.SECONDS);
        pool.shutdownNow();

        assertEquals(a.mark().id(), b.mark().id());
        assertNotEquals(a.replay(), b.replay());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", Integer.class, jornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mark_idempotency WHERE account_id=? AND idempotency_key=?", Integer.class, accountId.toString(), key.toString()));
        // Responses carry the stored DATETIME(6) precision, so the first response and the replay agree.
        assertEquals(receivedAt.truncatedTo(ChronoUnit.MICROS), a.mark().acceptedAt());
        assertEquals(a.mark().acceptedAt(), b.mark().acceptedAt());
    }

    @Test
    void distinctConcurrentPauseMarksSerializeToOneAcceptedMarkAndOneConflict() throws Exception {
        HttpLogin login = loginOverHttp(accountId, "30.123.456", "CorrectHorseBattery9!");
        MvcResult ingress = postEmployeeMark(login, jornadaId, UUID.randomUUID(), MarkAction.INGRESO);
        assertEquals(201, ingress.getResponse().getStatus());

        UUID breakfastKey = UUID.randomUUID();
        UUID lunchKey = UUID.randomUUID();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        Future<MvcResult> breakfast = pool.submit(() -> {
            ready.countDown();
            start.await();
            return postEmployeeMark(login, jornadaId, breakfastKey, MarkAction.SALIDA_DESAYUNO);
        });
        Future<MvcResult> lunch = pool.submit(() -> {
            ready.countDown();
            start.await();
            return postEmployeeMark(login, jornadaId, lunchKey, MarkAction.SALIDA_ALMUERZO);
        });

        MvcResult breakfastResponse;
        MvcResult lunchResponse;
        try {
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();
            breakfastResponse = breakfast.get(20, TimeUnit.SECONDS);
            lunchResponse = lunch.get(20, TimeUnit.SECONDS);
        } finally {
            start.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS));
        }

        List<Integer> statuses = List.of(
                breakfastResponse.getResponse().getStatus(),
                lunchResponse.getResponse().getStatus());
        assertEquals(1, statuses.stream().filter(status -> status == 201).count());
        assertEquals(1, statuses.stream().filter(status -> status == 409).count());
        assertTrue(statuses.stream().noneMatch(status -> status >= 500));

        MvcResult accepted = breakfastResponse.getResponse().getStatus() == 201 ? breakfastResponse : lunchResponse;
        MvcResult conflicted = breakfastResponse.getResponse().getStatus() == 409 ? breakfastResponse : lunchResponse;
        JsonNode acceptedBody = objectMapper.readTree(accepted.getResponse().getContentAsString());
        JsonNode conflictBody = objectMapper.readTree(conflicted.getResponse().getContentAsString());
        String acceptedAction = acceptedBody.path("action").asText();
        assertTrue(List.of("SALIDA_DESAYUNO", "SALIDA_ALMUERZO").contains(acceptedAction));
        assertEquals(2L, acceptedBody.path("sequence").asLong());
        assertEquals("INVALID_MARK_TRANSITION", conflictBody.path("code").asText());

        List<String> actions = jdbc.query("SELECT action FROM mark_events WHERE jornada_id=? ORDER BY sequence_number",
                (rs, row) -> rs.getString(1), jornadaId.toString());
        assertEquals(2, actions.size());
        assertEquals("INGRESO", actions.getFirst());
        assertEquals(acceptedAction, actions.getLast());
        assertEquals(List.of(1L, 2L), jdbc.query(
                "SELECT sequence_number FROM mark_events WHERE jornada_id=? ORDER BY sequence_number",
                (rs, row) -> rs.getLong(1), jornadaId.toString()));
        assertEquals(1, jdbc.queryForObject(
                "SELECT COUNT(*) FROM mark_events WHERE jornada_id=? AND action IN ('SALIDA_DESAYUNO','SALIDA_ALMUERZO')",
                Integer.class, jornadaId.toString()));
        assertEquals(0, jdbc.queryForObject(
                "SELECT COUNT(*) FROM mark_events WHERE jornada_id=? AND action IN ('VUELTA_DESAYUNO','VUELTA_ALMUERZO')",
                Integer.class, jornadaId.toString()));
        assertEquals("PAUSA_ABIERTA", jdbc.queryForObject(
                "SELECT state FROM jornadas WHERE id=? AND company_id=?", String.class, jornadaId.toString(), companyId.toString()));
        assertEquals(3L, jdbc.queryForObject(
                "SELECT next_sequence FROM jornadas WHERE id=? AND company_id=?", Long.class, jornadaId.toString(), companyId.toString()));
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?",
                Integer.class, jornadaId.toString()));
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM mark_idempotency WHERE account_id=?",
                Integer.class, accountId.toString()));
    }

    @Test
    void fiveDistinctConcurrentPauseRequestsYieldOneAcceptedMarkAndFourCodedConflicts() throws Exception {
        HttpLogin login = loginOverHttp(accountId, "30.123.456", "CorrectHorseBattery9!");
        MvcResult ingress = postEmployeeMark(login, jornadaId, UUID.randomUUID(), MarkAction.INGRESO);
        assertEquals(201, ingress.getResponse().getStatus());

        List<MarkAction> contenderActions = List.of(
                MarkAction.SALIDA_DESAYUNO,
                MarkAction.SALIDA_DESAYUNO,
                MarkAction.SALIDA_DESAYUNO,
                MarkAction.SALIDA_ALMUERZO,
                MarkAction.SALIDA_ALMUERZO);
        ExecutorService pool = Executors.newFixedThreadPool(contenderActions.size());
        CountDownLatch ready = new CountDownLatch(contenderActions.size());
        CountDownLatch start = new CountDownLatch(1);
        List<Future<MvcResult>> futures = new ArrayList<>();
        for (MarkAction action : contenderActions) {
            UUID idempotencyKey = UUID.randomUUID();
            futures.add(pool.submit(() -> {
                ready.countDown();
                start.await();
                return postEmployeeMark(login, jornadaId, idempotencyKey, action);
            }));
        }

        List<MvcResult> responses = new ArrayList<>();
        try {
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();
            for (Future<MvcResult> future : futures) responses.add(future.get(20, TimeUnit.SECONDS));
        } finally {
            start.countDown();
            pool.shutdownNow();
            assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS));
        }

        assertEquals(1, responses.stream().filter(result -> result.getResponse().getStatus() == 201).count());
        List<MvcResult> conflicts = responses.stream().filter(result -> result.getResponse().getStatus() == 409).toList();
        assertEquals(4, conflicts.size());
        assertTrue(responses.stream().noneMatch(result -> result.getResponse().getStatus() >= 500));
        for (MvcResult conflict : conflicts) {
            JsonNode body = objectMapper.readTree(conflict.getResponse().getContentAsString());
            assertEquals("INVALID_MARK_TRANSITION", body.path("code").asText());
        }

        MvcResult accepted = responses.stream().filter(result -> result.getResponse().getStatus() == 201).findFirst().orElseThrow();
        JsonNode acceptedBody = objectMapper.readTree(accepted.getResponse().getContentAsString());
        String acceptedAction = acceptedBody.path("action").asText();
        assertTrue(List.of("SALIDA_DESAYUNO", "SALIDA_ALMUERZO").contains(acceptedAction));
        assertEquals(2L, acceptedBody.path("sequence").asLong());
        assertEquals(List.of("INGRESO", acceptedAction), jdbc.query(
                "SELECT action FROM mark_events WHERE jornada_id=? ORDER BY sequence_number",
                (rs, row) -> rs.getString(1), jornadaId.toString()));
        assertEquals(List.of(1L, 2L), jdbc.query(
                "SELECT sequence_number FROM mark_events WHERE jornada_id=? ORDER BY sequence_number",
                (rs, row) -> rs.getLong(1), jornadaId.toString()));
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?",
                Integer.class, jornadaId.toString()));
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM mark_idempotency WHERE account_id=?",
                Integer.class, accountId.toString()));
        assertEquals("PAUSA_ABIERTA", jdbc.queryForObject(
                "SELECT state FROM jornadas WHERE id=? AND company_id=?", String.class,
                jornadaId.toString(), companyId.toString()));
        assertEquals(3L, jdbc.queryForObject(
                "SELECT next_sequence FROM jornadas WHERE id=? AND company_id=?", Long.class,
                jornadaId.toString(), companyId.toString()));
    }

    @Test
    void employeeCannotMarkMoreThanThirtyMinutesBeforeJornadaStart() {
        Instant now = Instant.now();
        Instant futureStart = now.plusSeconds(3600);
        jdbc.update("UPDATE jornadas SET scheduled_start_at=?,scheduled_end_at=? WHERE id=?",
                java.sql.Timestamp.from(futureStart), java.sql.Timestamp.from(futureStart.plusSeconds(8 * 3600)), jornadaId.toString());

        ApiException error = assertThrows(ApiException.class,
                () -> marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.INGRESO, UUID.randomUUID(), now));

        assertEquals("MARK_TOO_EARLY", error.code());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", Integer.class, jornadaId.toString()));
    }

    @Test
    void employeeMayMarkAtThirtyMinuteBoundary() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Instant futureStart = now.plusSeconds(600);
        jdbc.update("UPDATE jornadas SET scheduled_start_at=?,scheduled_end_at=? WHERE id=?",
                java.sql.Timestamp.from(futureStart), java.sql.Timestamp.from(futureStart.plusSeconds(8 * 3600)), jornadaId.toString());

        var early = marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.INGRESO, UUID.randomUUID(), futureStart.minusSeconds(1800));
        assertEquals(futureStart.minusSeconds(1800), early.mark().acceptedAt());
    }

    @Test
    void lateIngressRemainsAccepted() {
        Instant now = Instant.now();
        Instant lateStart = now.minusSeconds(1200);
        jdbc.update("UPDATE jornadas SET scheduled_start_at=?,scheduled_end_at=? WHERE id=?",
                java.sql.Timestamp.from(lateStart), java.sql.Timestamp.from(lateStart.plusSeconds(8 * 3600)), jornadaId.toString());

        var late = marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.INGRESO, UUID.randomUUID(), now);

        assertEquals(now.truncatedTo(ChronoUnit.MICROS), late.mark().acceptedAt());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='LLEGADA_TARDE' AND active=TRUE", Integer.class, jornadaId.toString()));
    }

    @Test
    void idempotencyReplayCannotReturnAnotherCompanyReceiptAfterCompanySwitch() {
        Instant now = Instant.now();
        UUID otherCompany = UUID.randomUUID();
        UUID otherSite = UUID.randomUUID();
        UUID otherTemplate = UUID.randomUUID();
        UUID otherEmployee = UUID.randomUUID();
        UUID otherJornada = UUID.randomUUID();
        UUID otherMembership = UUID.randomUUID();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", otherCompany.toString(), "Empresa B", java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", otherSite.toString(), otherCompany.toString(), "Sede B", "America/Argentina/Buenos_Aires", java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,?,20,30,TRUE,?,?)",
                otherTemplate.toString(), otherCompany.toString(), otherSite.toString(), "Turno B", java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                otherMembership.toString(), otherCompany.toString(), accountId.toString(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,10,TRUE,?,?)",
                otherEmployee.toString(), otherCompany.toString(), accountId.toString(), "Persona B", java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)",
                otherCompany.toString(), otherEmployee.toString(), otherSite.toString(), java.sql.Timestamp.from(now));
        String snapshot = "{\"siteId\":\"" + otherSite + "\",\"name\":\"Turno B\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'NO_INGRESO',1,?,?)",
                otherJornada.toString(), otherCompany.toString(), otherEmployee.toString(), otherSite.toString(), otherTemplate.toString(), java.time.LocalDate.now(),
                "America/Argentina/Buenos_Aires", snapshot, 10, java.sql.Timestamp.from(now.minusSeconds(900)), java.sql.Timestamp.from(now.plusSeconds(3600)), accountId.toString(), java.sql.Timestamp.from(now));

        ScopeService.Scope companyBScope = new ScopeService.Scope(accountId, otherCompany, "EMPLOYEE", false);
        UUID key = UUID.randomUUID();
        var companyBReceipt = marks.recordEmployeeMark(companyBScope, otherJornada, MarkAction.INGRESO, key, now).mark();
        jdbc.update("UPDATE company_memberships SET active=FALSE WHERE id=?", otherMembership.toString());

        ApiException denied = assertThrows(ApiException.class, () -> markController.record(authentication(accountId, "30123456"),
                activeCompanySession(companyId), otherJornada, key, new MarkController.MarkInput("INGRESO")));

        assertEquals(404, denied.status().value());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE id=? AND company_id=?",
                Integer.class, companyBReceipt.id().toString(), otherCompany.toString()));
    }

    @Test
    void pendingLocationBecomesSinUbicacionAfterThirtySecondWindow() {
        Instant acceptedAt = Instant.now();
        UUID markId = marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.INGRESO, UUID.randomUUID(), acceptedAt).mark().id();

        assertEquals("PENDIENTE", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, markId.toString()));
        marks.resolveLocationTimeouts(acceptedAt.plusSeconds(31));

        assertEquals("SIN_UBICACION", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, markId.toString()));
    }

    @Test
    void declaredJornadaFreezesTheSiteGeofenceAndCreatesOneDeviationPerJornadaWhileKeepingEveryMark() {
        jdbc.update("UPDATE sites SET latitude=-26.8200000,longitude=-65.2100000,geofence_radius_meters=100 WHERE id=? AND company_id=?",
                siteId.toString(), companyId.toString());
        java.time.LocalDate date = java.time.LocalDate.now().plusDays(1);
        UUID geofenceJornada = declareJornada(date);
        assertEquals(-26.82, jdbc.queryForObject("SELECT site_geofence_latitude_snapshot FROM jornadas WHERE id=?", Double.class, geofenceJornada.toString()));
        assertEquals(-65.21, jdbc.queryForObject("SELECT site_geofence_longitude_snapshot FROM jornadas WHERE id=?", Double.class, geofenceJornada.toString()));
        assertEquals(100, jdbc.queryForObject("SELECT site_geofence_radius_snapshot FROM jornadas WHERE id=?", Integer.class, geofenceJornada.toString()));

        // Later ADMIN changes affect future declarations only.
        jdbc.update("UPDATE sites SET latitude=-30.0000000,longitude=-60.0000000,geofence_radius_meters=500 WHERE id=? AND company_id=?",
                siteId.toString(), companyId.toString());
        assertEquals(-26.82, jdbc.queryForObject("SELECT site_geofence_latitude_snapshot FROM jornadas WHERE id=?", Double.class, geofenceJornada.toString()));
        assertEquals(100, jdbc.queryForObject("SELECT site_geofence_radius_snapshot FROM jornadas WHERE id=?", Integer.class, geofenceJornada.toString()));

        Instant acceptedAt = date.atTime(9, 0).atZone(ZoneId.of("America/Argentina/Buenos_Aires")).toInstant();
        UUID insideMark = marks.recordEmployeeMark(employeeScope, geofenceJornada, MarkAction.INGRESO, UUID.randomUUID(), acceptedAt).mark().id();
        marks.attachLocation(employeeScope, insideMark, -26.82, -65.21, 0, acceptedAt.plusSeconds(1));
        UUID firstOutside = marks.recordEmployeeMark(employeeScope, geofenceJornada, MarkAction.SALIDA_DESAYUNO, UUID.randomUUID(), acceptedAt.plusSeconds(60)).mark().id();
        marks.attachLocation(employeeScope, firstOutside, -30, -60, 0, acceptedAt.plusSeconds(61));
        UUID secondOutside = marks.recordEmployeeMark(employeeScope, geofenceJornada, MarkAction.VUELTA_DESAYUNO, UUID.randomUUID(), acceptedAt.plusSeconds(120)).mark().id();
        marks.attachLocation(employeeScope, secondOutside, -30, -60, 0, acceptedAt.plusSeconds(121));
        UUID thirdOutside = marks.recordEmployeeMark(employeeScope, geofenceJornada, MarkAction.EGRESO, UUID.randomUUID(), acceptedAt.plusSeconds(180)).mark().id();
        marks.attachLocation(employeeScope, thirdOutside, -30, -60, 0, acceptedAt.plusSeconds(181));

        List<com.braja.fichaje.deviations.DeviationService.DeviationView> outside = deviations.list(adminScope,
                new DeviationService.ListFilter(null, null, null, null, 100)).stream().filter(item -> "FUERA_DE_SEDE".equals(item.type())).toList();
        assertEquals(1, outside.size());
        assertFalse(outside.stream().anyMatch(item -> insideMark.equals(item.sourceMarkId())));
        assertEquals(firstOutside, outside.getFirst().sourceMarkId());
        assertEquals("SALIDA_DESAYUNO", outside.getFirst().sourceMarkAction());
        assertEquals(2, outside.getFirst().sourceMarkSequence());
        assertEquals(4, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE jornada_id=? AND voided_at IS NULL", Integer.class, geofenceJornada.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE' AND active=TRUE", Integer.class, geofenceJornada.toString()));
        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update(
                "INSERT INTO deviations(id,company_id,jornada_id,source_mark_id,site_id,employee_id,type,created_at,updated_at,active) " +
                        "VALUES(?,?,?,?,?,?,'FUERA_DE_SEDE',?,?,TRUE)", UUID.randomUUID().toString(), companyId.toString(), geofenceJornada.toString(),
                secondOutside.toString(), siteId.toString(), employeeId.toString(), java.sql.Timestamp.from(acceptedAt), java.sql.Timestamp.from(acceptedAt)));
        assertTrue(outside.stream().noneMatch(item -> item.pushEligible()));
        assertThrows(org.springframework.dao.DataAccessException.class,
                () -> jdbc.update("UPDATE deviations SET source_mark_id=NULL WHERE jornada_id=? AND source_mark_id=? AND type='FUERA_DE_SEDE'",
                        geofenceJornada.toString(), firstOutside.toString()));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox_events WHERE deviation_id IN " +
                "(SELECT id FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE')", Integer.class, geofenceJornada.toString()));

        // Later marks remain available after the first daily reason; voiding a non-anchor mark does not retract that reason.
        marks.voidMark(adminScope, thirdOutside, "Egreso cargado por error");
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE' AND active=TRUE", Integer.class, geofenceJornada.toString()));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND source_mark_id=? AND type='FUERA_DE_SEDE' AND active=FALSE",
                Integer.class, geofenceJornada.toString(), thirdOutside.toString()));

        // If the anchor is voided, a still-valid outside mark anchors the same daily deviation.
        UUID dailyDeviationId = outside.getFirst().id();
        Instant correctionAt = Instant.now();
        jdbc.update("UPDATE mark_events SET voided_at=?,voided_by=?,void_reason=? WHERE id=? AND company_id=?",
                java.sql.Timestamp.from(correctionAt), adminAccountId.toString(), "Marca de salida cargada por error", firstOutside.toString(), companyId.toString());
        deviations.retractOutOfSiteForMark(companyId, geofenceJornada, firstOutside, correctionAt);
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE id=? AND active=TRUE AND source_mark_id=?",
                Integer.class, dailyDeviationId.toString(), secondOutside.toString()));
        var reanchoredDeviation = deviations.list(adminScope, new DeviationService.ListFilter(null, null, null, null, 100)).stream()
                .filter(item -> item.id().equals(dailyDeviationId)).findFirst().orElseThrow();
        assertEquals(acceptedAt.plusSeconds(120), reanchoredDeviation.occurredAt());
        correctionAt = Instant.now();
        jdbc.update("UPDATE mark_events SET voided_at=?,voided_by=?,void_reason=? WHERE id=? AND company_id=?",
                java.sql.Timestamp.from(correctionAt), adminAccountId.toString(), "Marca de vuelta cargada por error", secondOutside.toString(), companyId.toString());
        deviations.retractOutOfSiteForMark(companyId, geofenceJornada, secondOutside, correctionAt);
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE' AND active=TRUE",
                Integer.class, geofenceJornada.toString()));

        jdbc.update("UPDATE mark_events SET location_received_at=? WHERE id IN (?,?,?,?)", java.sql.Timestamp.from(Instant.now().minusSeconds(91L * 86400)),
                insideMark.toString(), firstOutside.toString(), secondOutside.toString(), thirdOutside.toString());
        retention.purgeSensitiveData();
        assertEquals("PURGADA", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, firstOutside.toString()));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE' AND active=TRUE", Integer.class, geofenceJornada.toString()));
    }

    @Test
    void missingEmployeeLocationCreatesOnePerJornadaAfterThirtySecondsAndDoesNotDuplicateOnRetry() {
        jdbc.update("UPDATE sites SET latitude=-26.8200000,longitude=-65.2100000,geofence_radius_meters=100 WHERE id=? AND company_id=?",
                siteId.toString(), companyId.toString());
        UUID geofenceJornada = declareJornada(java.time.LocalDate.now().plusDays(2));
        Instant acceptedAt = java.time.LocalDate.now().plusDays(2).atTime(9, 0).atZone(ZoneId.of("America/Argentina/Buenos_Aires")).toInstant();
        UUID markId = marks.recordEmployeeMark(employeeScope, geofenceJornada, MarkAction.INGRESO, UUID.randomUUID(), acceptedAt).mark().id();

        marks.resolveLocationTimeouts(acceptedAt.plusSeconds(31));
        marks.resolveLocationTimeouts(acceptedAt.plusSeconds(32));

        assertEquals("SIN_UBICACION", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, markId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE' AND source_mark_id=? AND active=TRUE",
                Integer.class, geofenceJornada.toString(), markId.toString()));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE id=? AND (latitude IS NOT NULL OR longitude IS NOT NULL)", Integer.class, markId.toString()));
        ApiException lateLocation = assertThrows(ApiException.class,
                () -> marks.attachLocation(employeeScope, markId, -26.82, -65.21, 5, acceptedAt.plusSeconds(33)));
        assertEquals("LOCATION_ALREADY_FINAL", lateLocation.code());
    }

    @Test
    void locationAttachmentAndThirtySecondTimeoutRaceAcceptsOnTimePayload() throws Exception {
        jdbc.update("UPDATE sites SET latitude=-26.8200000,longitude=-65.2100000,geofence_radius_meters=100 WHERE id=? AND company_id=?",
                siteId.toString(), companyId.toString());
        java.time.LocalDate date = java.time.LocalDate.now().plusDays(5);
        UUID geofenceJornada = declareJornada(date);
        Instant acceptedAt = date.atTime(9, 0).atZone(ZoneId.of("America/Argentina/Buenos_Aires")).toInstant();
        UUID markId = marks.recordEmployeeMark(employeeScope, geofenceJornada, MarkAction.INGRESO, UUID.randomUUID(), acceptedAt).mark().id();

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        Future<MarkService.LocationResult> attachment = pool.submit(() -> {
            ready.countDown();
            start.await();
            return marks.attachLocation(employeeScope, markId, -30, -60, 5, acceptedAt.plusSeconds(29));
        });
        Future<?> timeout = pool.submit(() -> {
            ready.countDown();
            start.await();
            marks.resolveLocationTimeouts(acceptedAt.plusSeconds(31));
            return null;
        });
        try {
            assertTrue(ready.await(5, TimeUnit.SECONDS));
            start.countDown();
            MarkService.LocationResult location = attachment.get(15, TimeUnit.SECONDS);
            timeout.get(15, TimeUnit.SECONDS);
            assertEquals("RECIBIDA", location.locationStatus());
            assertEquals("RECIBIDA", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, markId.toString()));
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND source_mark_id=? AND type='FUERA_DE_SEDE' AND active=TRUE",
                    Integer.class, geofenceJornada.toString(), markId.toString()));
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void timelyLocationAfterTimeoutRetractsOrPreservesTheSameDailyDeviation() {
        jdbc.update("UPDATE sites SET latitude=-26.8200000,longitude=-65.2100000,geofence_radius_meters=100 WHERE id=? AND company_id=?",
                siteId.toString(), companyId.toString());
        java.time.LocalDate insideDate = java.time.LocalDate.now().plusDays(6);
        UUID insideJornada = declareJornada(insideDate);
        Instant insideAcceptedAt = insideDate.atTime(9, 0).atZone(ZoneId.of("America/Argentina/Buenos_Aires")).toInstant();
        UUID insideMark = marks.recordEmployeeMark(employeeScope, insideJornada, MarkAction.INGRESO, UUID.randomUUID(), insideAcceptedAt).mark().id();
        marks.resolveLocationTimeouts(insideAcceptedAt.plusSeconds(31));
        UUID provisionalInsideDeviation = jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND source_mark_id=? AND type='FUERA_DE_SEDE' AND active=TRUE",
                (rs, row) -> UUID.fromString(rs.getString(1)), insideJornada.toString(), insideMark.toString());

        marks.attachLocation(employeeScope, insideMark, -26.82, -65.21, 5, insideAcceptedAt.plusSeconds(29));
        assertEquals("RECIBIDA", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, insideMark.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE id=? AND active=FALSE", Integer.class, provisionalInsideDeviation.toString()));

        java.time.LocalDate outsideDate = java.time.LocalDate.now().plusDays(7);
        UUID outsideJornada = declareJornada(outsideDate);
        Instant outsideAcceptedAt = outsideDate.atTime(9, 0).atZone(ZoneId.of("America/Argentina/Buenos_Aires")).toInstant();
        UUID outsideMark = marks.recordEmployeeMark(employeeScope, outsideJornada, MarkAction.INGRESO, UUID.randomUUID(), outsideAcceptedAt).mark().id();
        marks.resolveLocationTimeouts(outsideAcceptedAt.plusSeconds(31));
        UUID provisionalOutsideDeviation = jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND source_mark_id=? AND type='FUERA_DE_SEDE' AND active=TRUE",
                (rs, row) -> UUID.fromString(rs.getString(1)), outsideJornada.toString(), outsideMark.toString());

        marks.attachLocation(employeeScope, outsideMark, -30, -60, 5, outsideAcceptedAt.plusSeconds(29));
        assertEquals("RECIBIDA", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, outsideMark.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE id=? AND active=TRUE", Integer.class, provisionalOutsideDeviation.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND source_mark_id=? AND type='FUERA_DE_SEDE'",
                Integer.class, outsideJornada.toString(), outsideMark.toString()));
    }

    @Test
    void outOfSiteDeviationIsJustifiedAndClassifiedAndGoesBackToReviewWhenItMovesToAnotherMark() {
        // 2026-10-30, PR #69 review: a JUSTIFICADO decided for one mark silently stayed on the replacement mark, unaudited.
        jdbc.update("UPDATE sites SET latitude=-26.8200000,longitude=-65.2100000,geofence_radius_meters=100 WHERE id=? AND company_id=?",
                siteId.toString(), companyId.toString());
        java.time.LocalDate date = java.time.LocalDate.now().plusDays(8);
        UUID geofenceJornada = declareJornada(date);
        Instant acceptedAt = date.atTime(9, 0).atZone(ZoneId.of("America/Argentina/Buenos_Aires")).toInstant();
        UUID firstMark = marks.recordEmployeeMark(employeeScope, geofenceJornada, MarkAction.INGRESO, UUID.randomUUID(), acceptedAt).mark().id();
        marks.resolveLocationTimeouts(acceptedAt.plusSeconds(31));
        UUID deviationId = jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND source_mark_id=? AND type='FUERA_DE_SEDE' AND active=TRUE",
                (rs, row) -> UUID.fromString(rs.getString(1)), geofenceJornada.toString(), firstMark.toString());
        UUID secondMark = marks.recordEmployeeMark(employeeScope, geofenceJornada, MarkAction.SALIDA_DESAYUNO, UUID.randomUUID(), acceptedAt.plusSeconds(60)).mark().id();
        marks.attachLocation(employeeScope, secondMark, -30, -60, 5, acceptedAt.plusSeconds(61));

        var justified = deviations.saveMotive(null, employeeScope, deviationId, "TRANSPORTE", "El colectivo me dejó lejos del local");
        assertEquals("FUERA_DE_SEDE", justified.type());
        assertEquals("TRANSPORTE", justified.category());
        deviations.classify(adminScope, deviationId, "JUSTIFICADO", null);
        assertEquals("JUSTIFICADO", jdbc.queryForObject("SELECT classification FROM deviations WHERE id=?", String.class, deviationId.toString()));

        // The first mark's on-time location arrives inside: the jornada's single deviation moves to the second (outside) mark.
        marks.attachLocation(employeeScope, firstMark, -26.82, -65.21, 5, acceptedAt.plusSeconds(29));

        assertEquals(1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE' AND active=TRUE", geofenceJornada.toString()));
        assertEquals(secondMark.toString(), jdbc.queryForObject("SELECT source_mark_id FROM deviations WHERE id=?", String.class, deviationId.toString()));
        assertNull(jdbc.queryForObject("SELECT classification FROM deviations WHERE id=?", String.class, deviationId.toString()));
        assertEquals("TRANSPORTE", jdbc.queryForObject("SELECT motive_category FROM deviations WHERE id=?", String.class, deviationId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='CLASSIFICATION_RESET' " +
                "AND before_classification='JUSTIFICADO' AND after_classification IS NULL AND audit_reason='Source mark changed'", deviationId.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM notification_outbox_events WHERE deviation_id=?", deviationId.toString()));
    }

    @Test
    void siteLocationRoutesValidateOverHttpAndStayInsideTheAdminsCompany() throws Exception {
        OtherTenantAdmin tenantB = createOtherTenantAdmin();
        HttpLogin admin = loginOverHttp(adminAccountId, "30.123.457", "CorrectHorseBattery9!");
        HttpLogin employee = loginOverHttp(accountId, "30.123.456", "CorrectHorseBattery9!");
        HttpLogin adminB = loginOverHttp(tenantB.adminAccountId(), tenantB.adminDni(), "CorrectHorseBattery9!");
        String manualCenter = "{\"latitude\":-26.82,\"longitude\":-65.21,\"geofenceRadiusMeters\":150,\"locationSource\":\"MANUAL\"}";

        for (String invalid : List.of(
                "{\"latitude\":-26.82,\"longitude\":-65.21,\"geofenceRadiusMeters\":49,\"locationSource\":\"MANUAL\"}",
                "{\"latitude\":-26.82,\"longitude\":-65.21,\"geofenceRadiusMeters\":501,\"locationSource\":\"MANUAL\"}",
                "{\"latitude\":91,\"longitude\":-65.21,\"geofenceRadiusMeters\":150,\"locationSource\":\"MANUAL\"}",
                "{\"latitude\":-26.82,\"geofenceRadiusMeters\":150,\"locationSource\":\"MANUAL\"}",
                "{\"latitude\":-26.82,\"longitude\":-65.21,\"geofenceRadiusMeters\":150,\"locationSource\":\"GPS\"}",
                "{\"latitude\":-26.82,\"longitude\":-65.21,\"geofenceRadiusMeters\":150}")) {
            MvcResult rejected = adminWrite(admin, put("/api/v1/sites/{id}/location", siteId), invalid);
            assertEquals(422, rejected.getResponse().getStatus(), invalid);
            assertEquals("VALIDATION_ERROR", objectMapper.readTree(rejected.getResponse().getContentAsString()).get("code").asText(), invalid);
        }
        mockMvc.perform(put("/api/v1/sites/{id}/location", siteId).cookie(admin.sessionCookie())
                        .contentType(MediaType.APPLICATION_JSON).content(manualCenter))
                .andExpect(status().isForbidden());
        assertEquals(403, adminWrite(employee, put("/api/v1/sites/{id}/location", siteId), manualCenter).getResponse().getStatus());
        mockMvc.perform(get("/api/v1/sites/{id}/location-audit", siteId).cookie(employee.sessionCookie()))
                .andExpect(status().isForbidden());
        assertEquals(404, adminWrite(adminB, put("/api/v1/sites/{id}/location", siteId), manualCenter).getResponse().getStatus());
        mockMvc.perform(get("/api/v1/sites/{id}/location-audit", siteId).cookie(adminB.sessionCookie()))
                .andExpect(status().isNotFound());
        assertEquals(0, count("SELECT COUNT(*) FROM site_location_audits WHERE site_id=?", siteId.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM sites WHERE id=? AND latitude IS NOT NULL", siteId.toString()));

        MvcResult saved = adminWrite(admin, put("/api/v1/sites/{id}/location", siteId), manualCenter);
        assertEquals(200, saved.getResponse().getStatus());
        JsonNode body = objectMapper.readTree(saved.getResponse().getContentAsString());
        assertEquals(-26.82, body.get("latitude").asDouble());
        assertEquals(150, body.get("geofenceRadiusMeters").asInt());
        mockMvc.perform(get("/api/v1/sites/{id}/location-audit", siteId).cookie(admin.sessionCookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries.length()").value(1))
                .andExpect(jsonPath("$.entries[0].locationSource").value("MANUAL"))
                .andExpect(jsonPath("$.entries[0].afterRadiusMeters").value(150));

        // A radius-only change needs no source; an unchanged PUT writes no audit row.
        String radiusOnly = "{\"latitude\":-26.82,\"longitude\":-65.21,\"geofenceRadiusMeters\":200}";
        assertEquals(200, adminWrite(admin, put("/api/v1/sites/{id}/location", siteId), radiusOnly).getResponse().getStatus());
        assertEquals(200, adminWrite(admin, put("/api/v1/sites/{id}/location", siteId), radiusOnly).getResponse().getStatus());
        assertEquals(2, count("SELECT COUNT(*) FROM site_location_audits WHERE site_id=?", siteId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM site_location_audits WHERE site_id=? AND after_radius_meters=200 AND location_source IS NULL", siteId.toString()));
    }

    @Test
    void adminForgottenMarkIsNotAssessedAgainstGeofence() {
        jdbc.update("UPDATE sites SET latitude=-26.8200000,longitude=-65.2100000,geofence_radius_meters=100 WHERE id=? AND company_id=?",
                siteId.toString(), companyId.toString());
        jdbc.update("UPDATE jornadas SET site_geofence_latitude_snapshot=-26.8200000,site_geofence_longitude_snapshot=-65.2100000,site_geofence_radius_snapshot=100 WHERE id=?",
                jornadaId.toString());
        var forgotten = marks.forgottenMark(adminScope, jornadaId, MarkAction.INGRESO, Instant.now(), "Marca olvidada");

        assertEquals("NO_APLICA", forgotten.locationStatus());
        assertEquals("ADMIN", jdbc.queryForObject("SELECT origin FROM mark_events WHERE id=?", String.class, forgotten.id().toString()));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE' AND source_mark_id=?",
                Integer.class, jornadaId.toString(), forgotten.id().toString()));
    }

    @Test
    void jornadaDeclaredWithoutSiteCenterSkipsGeofenceEvenAfterSiteIsConfigured() {
        jdbc.update("UPDATE sites SET latitude=NULL,longitude=NULL,geofence_radius_meters=100 WHERE id=? AND company_id=?",
                siteId.toString(), companyId.toString());
        java.time.LocalDate date = java.time.LocalDate.now().plusDays(3);
        UUID geofenceJornada = declareJornada(date);
        assertNull(jdbc.queryForObject("SELECT site_geofence_latitude_snapshot FROM jornadas WHERE id=?", Double.class, geofenceJornada.toString()));
        assertNull(jdbc.queryForObject("SELECT site_geofence_radius_snapshot FROM jornadas WHERE id=?", Integer.class, geofenceJornada.toString()));
        jdbc.update("UPDATE sites SET latitude=-26.8200000,longitude=-65.2100000 WHERE id=? AND company_id=?", siteId.toString(), companyId.toString());

        Instant acceptedAt = date.atTime(9, 0).atZone(ZoneId.of("America/Argentina/Buenos_Aires")).toInstant();
        UUID markId = marks.recordEmployeeMark(employeeScope, geofenceJornada, MarkAction.INGRESO, UUID.randomUUID(), acceptedAt).mark().id();
        marks.attachLocation(employeeScope, markId, -30, -60, 0, acceptedAt.plusSeconds(1));

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE'", Integer.class, geofenceJornada.toString()));
    }

    @Test
    void voidedMarkRejectsLateLocationAndNeverCreatesOutsideDeviation() {
        jdbc.update("UPDATE sites SET latitude=-26.8200000,longitude=-65.2100000,geofence_radius_meters=100 WHERE id=? AND company_id=?",
                siteId.toString(), companyId.toString());
        java.time.LocalDate date = java.time.LocalDate.now().plusDays(4);
        UUID geofenceJornada = declareJornada(date);
        Instant acceptedAt = date.atTime(9, 0).atZone(ZoneId.of("America/Argentina/Buenos_Aires")).toInstant();
        UUID markId = marks.recordEmployeeMark(employeeScope, geofenceJornada, MarkAction.INGRESO, UUID.randomUUID(), acceptedAt).mark().id();

        marks.voidMark(adminScope, markId, "Marca ingresada por error");
        ApiException lateLocation = assertThrows(ApiException.class,
                () -> marks.attachLocation(employeeScope, markId, -30, -60, 0, acceptedAt.plusSeconds(1)));

        assertEquals("MARK_VOIDED", lateLocation.code());
        assertEquals("SIN_UBICACION", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, markId.toString()));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='FUERA_DE_SEDE'", Integer.class, geofenceJornada.toString()));
    }

    private UUID declareJornada(java.time.LocalDate date) {
        return jornadaDeclarations.declare(adminScope,
                new com.braja.fichaje.timekeeping.JornadaController.DeclareJornada(employeeId, siteId, date, templateId));
    }

    @Test
    void httpLoginCreatesHttpOnlySessionCookieAndCsrfProtectsMutableRoutes() throws Exception {
        String password = "CorrectHorseBattery9!";
        HttpLogin login = loginOverHttp(accountId, "30.123.456", password);

        mockMvc.perform(get("/api/v1/session").cookie(login.sessionCookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(accountId.toString()))
                .andExpect(jsonPath("$.activeCompanyId").value(companyId.toString()));

        UUID unknownCompany = UUID.randomUUID();
        mockMvc.perform(put("/api/v1/companies/active")
                        .cookie(login.sessionCookie())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"companyId\":\"" + unknownCompany + "\"}"))
                .andExpect(status().isForbidden());

        mockMvc.perform(put("/api/v1/companies/active")
                        .cookie(login.sessionCookie(), new Cookie("BRAJA_CSRF", login.csrfToken()))
                        .header("X-CSRF-TOKEN", login.csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"companyId\":\"" + unknownCompany + "\"}"))
                .andExpect(status().isNotFound());
    }

    // 2026-10-27 (issue #47, D-20261027-04): alerts are per company, so the PWA asks whether this device is
    // subscribed in the active company instead of re-registering it whenever a company is opened.
    @Test
    void pushSubscriptionLookupIsAdminOnlyCsrfProtectedAndScopedToTheActiveCompany() throws Exception {
        String endpoint = "https://fcm.googleapis.com/fcm/send/it-device";
        String endpointHash = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                .digest(endpoint.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        UUID subscriptionId = UUID.randomUUID();
        java.sql.Timestamp now = java.sql.Timestamp.from(Instant.now());
        jdbc.update("INSERT INTO push_subscriptions(id,company_id,account_id,endpoint_hash,secret_ciphertext,secret_iv,active,created_at,updated_at) VALUES(?,?,?,?,?,?,TRUE,?,?)",
                subscriptionId.toString(), companyId.toString(), adminAccountId.toString(), endpointHash,
                new byte[]{1, 2, 3}, new byte[12], now, now);
        HttpLogin admin = loginOverHttp(adminAccountId, "30.123.457", "CorrectHorseBattery9!");

        MvcResult subscribed = adminWrite(admin, post("/api/v1/push/subscriptions/current"), "{\"endpoint\":\"" + endpoint + "\"}");
        assertEquals(200, subscribed.getResponse().getStatus());
        JsonNode subscribedBody = objectMapper.readTree(subscribed.getResponse().getContentAsString());
        assertTrue(subscribedBody.get("subscribed").asBoolean());
        assertEquals(subscriptionId.toString(), subscribedBody.get("id").asText());

        MvcResult otherDevice = adminWrite(admin, post("/api/v1/push/subscriptions/current"), "{\"endpoint\":\"" + endpoint + "-other\"}");
        assertEquals(200, otherDevice.getResponse().getStatus());
        JsonNode otherBody = objectMapper.readTree(otherDevice.getResponse().getContentAsString());
        assertFalse(otherBody.get("subscribed").asBoolean());
        assertFalse(otherBody.has("id"));

        mockMvc.perform(post("/api/v1/push/subscriptions/current").cookie(admin.sessionCookie())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"endpoint\":\"" + endpoint + "\"}"))
                .andExpect(status().isForbidden());
        HttpLogin employee = loginOverHttp(accountId, "30.123.456", "CorrectHorseBattery9!");
        assertEquals(403, adminWrite(employee, post("/api/v1/push/subscriptions/current"),
                "{\"endpoint\":\"" + endpoint + "\"}").getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM push_subscriptions WHERE company_id=?", companyId.toString()));
    }

    @Test
    void httpSecurityRejectsAnonymousRequestsAndEmployeeCannotUseAnotherCompaniesIdsOrAdminRoutes() throws Exception {
        mockMvc.perform(get("/api/v1/inbox"))
                .andExpect(status().isUnauthorized());

        OtherTenantMark foreign = createOtherTenantMark();
        mockMvc.perform(get("/api/v1/jornadas/{id}", foreign.jornadaId()))
                .andExpect(status().isUnauthorized());

        HttpLogin login = loginOverHttp(accountId, "30.123.456", "CorrectHorseBattery9!");
        mockMvc.perform(put("/api/v1/companies/active")
                        .cookie(login.sessionCookie(), new Cookie("BRAJA_CSRF", login.csrfToken()))
                        .header("X-CSRF-TOKEN", login.csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"companyId\":\"" + companyId + "\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/jornadas/{id}", foreign.jornadaId()).cookie(login.sessionCookie()))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/marks/{id}", foreign.markId()).cookie(login.sessionCookie()))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/jornadas")
                        .param("from", java.time.LocalDate.now().toString())
                        .param("to", java.time.LocalDate.now().toString())
                        .param("employeeId", foreign.employeeId().toString())
                        .cookie(login.sessionCookie()))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/v1/jornadas")
                        .cookie(login.sessionCookie(), new Cookie("BRAJA_CSRF", login.csrfToken()))
                        .header("X-CSRF-TOKEN", login.csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"employeeId\":\"" + foreign.employeeId() + "\",\"siteId\":\"" + foreign.siteId()
                                + "\",\"localDate\":\"" + java.time.LocalDate.now().plusDays(1) + "\",\"templateId\":\""
                                + foreign.templateId() + "\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void validAdminsCannotReadOrModifyRecordsFromAnotherCompany() throws Exception {
        OtherTenantAdmin tenantB = createOtherTenantAdmin();
        Instant markAAt = Instant.now().minusSeconds(240).truncatedTo(ChronoUnit.MICROS);
        UUID markAId = marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.INGRESO,
                UUID.randomUUID(), markAAt).mark().id();
        UUID deviationAId = activeDeviationId(companyId, jornadaId, "LLEGADA_TARDE");
        ScopeService.Scope tenantBEmployeeScope = new ScopeService.Scope(
                tenantB.employeeAccountId(), tenantB.companyId(), "EMPLOYEE", false);
        Instant markBAt = Instant.now().minusSeconds(240).truncatedTo(ChronoUnit.MICROS);
        UUID markBId = marks.recordEmployeeMark(tenantBEmployeeScope, tenantB.jornadaId(), MarkAction.INGRESO,
                UUID.randomUUID(), markBAt).mark().id();
        UUID deviationBId = activeDeviationId(tenantB.companyId(), tenantB.jornadaId(), "LLEGADA_TARDE");
        HttpLogin adminA = loginOverHttp(adminAccountId, "30.123.457", "CorrectHorseBattery9!");
        HttpLogin adminB = loginOverHttp(tenantB.adminAccountId(), tenantB.adminDni(), "CorrectHorseBattery9!");

        mockMvc.perform(get("/api/v1/session").cookie(adminA.sessionCookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeCompanyId").value(companyId.toString()))
                .andExpect(jsonPath("$.memberships[0].role").value("ADMIN"));
        mockMvc.perform(get("/api/v1/session").cookie(adminB.sessionCookie()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.activeCompanyId").value(tenantB.companyId().toString()))
                .andExpect(jsonPath("$.memberships[0].role").value("ADMIN"));

        mockMvc.perform(get("/api/v1/jornadas/{id}", jornadaId).cookie(adminA.sessionCookie()))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/jornadas/{id}", tenantB.jornadaId()).cookie(adminB.sessionCookie()))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/jornadas/{id}", tenantB.jornadaId()).cookie(adminA.sessionCookie()))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/jornadas/{id}", jornadaId).cookie(adminB.sessionCookie()))
                .andExpect(status().isNotFound());

        assertEquals(404, adminWrite(adminA,
                patch("/api/v1/employees/{id}", tenantB.employeeId()),
                "{\"displayName\":\"Modificado desde A\"}").getResponse().getStatus());
        assertEquals(404, adminWrite(adminB,
                patch("/api/v1/employees/{id}", employeeId),
                "{\"displayName\":\"Modificado desde B\"}").getResponse().getStatus());
        assertEquals("Persona de prueba", jdbc.queryForObject(
                "SELECT display_name FROM employees WHERE id=? AND company_id=?", String.class,
                employeeId.toString(), companyId.toString()));
        assertEquals(tenantB.employeeName(), jdbc.queryForObject(
                "SELECT display_name FROM employees WHERE id=? AND company_id=?", String.class,
                tenantB.employeeId().toString(), tenantB.companyId().toString()));

        MvcResult ownEmployeePatch = adminWrite(adminA, patch("/api/v1/employees/{id}", employeeId),
                "{\"displayName\":\"Modificado desde A\"}");
        assertEquals(200, ownEmployeePatch.getResponse().getStatus());
        assertEquals("Modificado desde A", jdbc.queryForObject(
                "SELECT display_name FROM employees WHERE id=? AND company_id=?", String.class,
                employeeId.toString(), companyId.toString()));

        // Valid in BOTH companies: each jornada holds only an INGRESO, so moving that INGRESO 60 s earlier keeps
        // the history valid. The same body is replayed against the attacker's own mark at the end (positive control).
        Instant correctedMarkBAt = markBAt.minusSeconds(60);
        Instant correctedMarkAAt = markAAt.minusSeconds(60);
        String correctMarkBodyA = "{\"correctedAction\":\"INGRESO\",\"correctedOccurredAt\":\""
                + correctedMarkBAt + "\",\"auditReason\":\"Cross-company test\"}";
        String correctMarkBodyB = "{\"correctedAction\":\"INGRESO\",\"correctedOccurredAt\":\""
                + correctedMarkAAt + "\",\"auditReason\":\"Cross-company test\"}";
        assertEquals(404, adminWrite(adminA,
                post("/api/v1/admin/marks/{id}/correction", markBId), correctMarkBodyA).getResponse().getStatus());
        assertEquals(404, adminWrite(adminB,
                post("/api/v1/admin/marks/{id}/correction", markAId), correctMarkBodyB).getResponse().getStatus());
        assertMarkUnchanged(markAId, markAAt);
        assertMarkUnchanged(markBId, markBAt);

        // After both INGRESO marks (about -240 s), so an EGRESO at this instant is a valid history in either company.
        Instant forgottenAt = Instant.now().minusSeconds(60).truncatedTo(ChronoUnit.MICROS);
        String forgottenMarkBody = "{\"action\":\"EGRESO\",\"occurredAt\":\"" + forgottenAt
                + "\",\"auditReason\":\"Cross-company test\"}";
        assertEquals(404, adminWrite(adminA,
                post("/api/v1/admin/jornadas/{id}/forgotten-marks", tenantB.jornadaId()), forgottenMarkBody)
                .getResponse().getStatus());
        assertEquals(404, adminWrite(adminB,
                post("/api/v1/admin/jornadas/{id}/forgotten-marks", jornadaId), forgottenMarkBody)
                .getResponse().getStatus());
        assertEquals(1, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", jornadaId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", tenantB.jornadaId().toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM forgotten_mark_audits WHERE jornada_id IN (?,?)",
                jornadaId.toString(), tenantB.jornadaId().toString()));

        String classificationBody = "{\"classification\":\"JUSTIFICADO\",\"correctionReason\":\"Cross-company test\"}";
        int deviationAuditsBeforeClassification = count(
                "SELECT COUNT(*) FROM deviation_audits WHERE deviation_id IN (?,?)",
                deviationAId.toString(), deviationBId.toString());
        assertEquals(404, adminWrite(adminA,
                put("/api/v1/admin/deviations/{id}/classification", deviationBId), classificationBody)
                .getResponse().getStatus());
        assertEquals(404, adminWrite(adminB,
                put("/api/v1/admin/deviations/{id}/classification", deviationAId), classificationBody)
                .getResponse().getStatus());
        assertNull(jdbc.queryForObject("SELECT classification FROM deviations WHERE id=? AND company_id=?",
                String.class, deviationAId.toString(), companyId.toString()));
        assertNull(jdbc.queryForObject("SELECT classification FROM deviations WHERE id=? AND company_id=?",
                String.class, deviationBId.toString(), tenantB.companyId().toString()));
        assertEquals(deviationAuditsBeforeClassification,
                count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id IN (?,?)",
                        deviationAId.toString(), deviationBId.toString()));

        String templateFromA = templateUpdateBody(tenantB.siteId(), "Intento desde A");
        String templateFromB = templateUpdateBody(siteId, "Intento desde B");
        assertEquals(404, adminWrite(adminA,
                patch("/api/v1/templates/{id}", tenantB.templateId()), templateFromA).getResponse().getStatus());
        assertEquals(404, adminWrite(adminB,
                patch("/api/v1/templates/{id}", templateId), templateFromB).getResponse().getStatus());
        assertEquals("Turno", jdbc.queryForObject("SELECT name FROM schedule_templates WHERE id=? AND company_id=?",
                String.class, templateId.toString(), companyId.toString()));
        assertEquals("Turno B", jdbc.queryForObject("SELECT name FROM schedule_templates WHERE id=? AND company_id=?",
                String.class, tenantB.templateId().toString(), tenantB.companyId().toString()));

        String inboxA = mockMvc.perform(get("/api/v1/inbox").cookie(adminA.sessionCookie()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String inboxB = mockMvc.perform(get("/api/v1/inbox").cookie(adminB.sessionCookie()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertTrue(inboxA.contains(deviationAId.toString()));
        assertFalse(inboxA.contains(deviationBId.toString()));
        assertTrue(inboxB.contains(deviationBId.toString()));
        assertFalse(inboxB.contains(deviationAId.toString()));

        // Positive controls: the very same bodies, sent by the attacking ADMIN against their OWN company, succeed
        // and change the database. So the cross-company 404s above come from tenant isolation, not from a body
        // that is invalid for the jornada state.
        for (int i = 0; i < 2; i++) {
            HttpLogin admin = i == 0 ? adminA : adminB;
            UUID ownCompany = i == 0 ? companyId : tenantB.companyId();
            UUID ownMark = i == 0 ? markAId : markBId;
            UUID ownJornada = i == 0 ? jornadaId : tenantB.jornadaId();
            UUID ownDeviation = i == 0 ? deviationAId : deviationBId;
            String markBody = i == 0 ? correctMarkBodyA : correctMarkBodyB;
            Instant markCorrectedAt = i == 0 ? correctedMarkBAt : correctedMarkAAt;
            Instant markOriginalAt = i == 0 ? markAAt : markBAt;

            MvcResult classified = adminWrite(admin,
                    put("/api/v1/admin/deviations/{id}/classification", ownDeviation), classificationBody);
            assertEquals(200, classified.getResponse().getStatus());
            assertEquals("JUSTIFICADO", jdbc.queryForObject(
                    "SELECT classification FROM deviations WHERE id=? AND company_id=?", String.class,
                    ownDeviation.toString(), ownCompany.toString()));
            assertEquals(1, count("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? "
                    + "AND change_type='CLASSIFICATION_CHANGED' AND after_classification='JUSTIFICADO'",
                    ownDeviation.toString()));

            MvcResult corrected = adminWrite(admin,
                    post("/api/v1/admin/marks/{id}/correction", ownMark), markBody);
            assertEquals(200, corrected.getResponse().getStatus());
            assertEquals("INGRESO", jdbc.queryForObject("SELECT action FROM mark_events WHERE id=? AND company_id=?",
                    String.class, ownMark.toString(), ownCompany.toString()));
            assertEquals(markCorrectedAt, jdbc.queryForObject(
                    "SELECT occurred_at FROM mark_events WHERE id=? AND company_id=?",
                    java.sql.Timestamp.class, ownMark.toString(), ownCompany.toString()).toInstant());
            assertEquals(1, count("SELECT COUNT(*) FROM mark_correction_audits WHERE mark_id=? AND company_id=? "
                    + "AND before_occurred_at=? AND after_occurred_at=?", ownMark.toString(), ownCompany.toString(),
                    java.sql.Timestamp.from(markOriginalAt), java.sql.Timestamp.from(markCorrectedAt)));

            MvcResult forgotten = adminWrite(admin,
                    post("/api/v1/admin/jornadas/{id}/forgotten-marks", ownJornada), forgottenMarkBody);
            assertEquals(2, forgotten.getResponse().getStatus() / 100);
            assertEquals(2, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=? AND company_id=?",
                    ownJornada.toString(), ownCompany.toString()));
            assertEquals(1, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=? AND company_id=? "
                    + "AND action='EGRESO' AND origin='ADMIN' AND occurred_at=?", ownJornada.toString(),
                    ownCompany.toString(), java.sql.Timestamp.from(forgottenAt)));
            assertEquals(1, count("SELECT COUNT(*) FROM forgotten_mark_audits WHERE jornada_id=? AND company_id=?",
                    ownJornada.toString(), ownCompany.toString()));
        }
    }

    @Test
    void reusedIdempotencyKeyWithDifferentPayloadConflictsAndPauseMustCloseBeforeEgress() {
        UUID key = UUID.randomUUID();
        Instant now = Instant.now();
        marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.INGRESO, key, now);
        assertEquals("IDEMPOTENCY_CONFLICT", assertThrows(ApiException.class,
                () -> marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.EGRESO, key, now.plusSeconds(1))).code());

        marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.SALIDA_DESAYUNO, UUID.randomUUID(), now.plusSeconds(2));
        assertEquals("INVALID_MARK_TRANSITION", assertThrows(ApiException.class,
                () -> marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.EGRESO, UUID.randomUUID(), now.plusSeconds(3))).code());
        marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.VUELTA_DESAYUNO, UUID.randomUUID(), now.plusSeconds(4));
        marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.EGRESO, UUID.randomUUID(), now.plusSeconds(5));
        assertEquals("EGRESADA", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
    }

    @Test
    void ingresoCommittedAfterRepeatableReadSnapshotWinsAgainstAbsenceWorker() throws Exception {
        CountDownLatch snapshotReady = new CountDownLatch(1);
        CountDownLatch continueWorker = new CountDownLatch(1);
        TransactionTemplate transaction = new TransactionTemplate(transactionManager);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        Future<?> worker = pool.submit(() -> transaction.executeWithoutResult(status -> {
            jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", Integer.class, jornadaId.toString());
            snapshotReady.countDown();
            await(continueWorker);
            marks.createDueAbsences(Instant.now().plusSeconds(1), 200);
        }));

        assertTrue(snapshotReady.await(5, TimeUnit.SECONDS));
        try {
            marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.INGRESO, UUID.randomUUID(), Instant.now());
        } finally {
            continueWorker.countDown();
        }
        worker.get(15, TimeUnit.SECONDS);
        pool.shutdownNow();

        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active=TRUE", Integer.class, jornadaId.toString()));
        assertEquals("LLEGADA_TARDE", jdbc.queryForObject("SELECT type FROM deviations WHERE jornada_id=? AND active=TRUE", String.class, jornadaId.toString()));
    }

    @Test
    void absenceWorkerSkipsAlreadyProcessedCandidatesOnNextTick() {
        Instant now = Instant.now().plusSeconds(1);
        marks.createDueAbsences(now, 200);
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, jornadaId.toString()));

        marks.createDueAbsences(now.plusSeconds(1), 200);

        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, jornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO'", Integer.class, jornadaId.toString()));
    }

    @Test
    void absenceWorkerAdvancesPastFirstTwoHundredCandidates() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        UUID templateId = jdbc.queryForObject("SELECT id FROM schedule_templates WHERE company_id=? LIMIT 1", (rs, row) -> UUID.fromString(rs.getString(1)), companyId.toString());
        Instant start = now.minusSeconds(3600);
        Instant end = now.minusSeconds(600);
        String snapshot = "{\"siteId\":\"" + siteId + "\",\"name\":\"Turno\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
        for (int i = 1; i <= 205; i++) {
            UUID jornada = UUID.randomUUID();
            jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,0,?,?,'NO_INGRESO',1,?,?)",
                    jornada.toString(), companyId.toString(), employeeId.toString(), siteId.toString(), templateId.toString(), java.time.LocalDate.now().minusDays(i),
                    "America/Argentina/Buenos_Aires", snapshot, java.sql.Timestamp.from(start), java.sql.Timestamp.from(end), accountId.toString(), java.sql.Timestamp.from(now));
        }

        marks.createDueAbsences(now, 200);
        assertEquals(200, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE company_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, companyId.toString()));

        marks.createDueAbsences(now.plusSeconds(1), 200);
        assertEquals(206, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE company_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, companyId.toString()));
    }

    @Test
    void absenceWorkerBacksOffFailingCandidateAndProcessesNextCandidateOnce() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        UUID templateId = jdbc.queryForObject("SELECT id FROM schedule_templates WHERE company_id=? LIMIT 1", (rs, row) -> UUID.fromString(rs.getString(1)), companyId.toString());
        jdbc.update("UPDATE jornadas SET state='EGRESADA' WHERE id=?", jornadaId.toString());
        String validSnapshot = "{\"siteId\":\"" + siteId + "\",\"name\":\"Turno\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
        UUID brokenJornadaId = UUID.randomUUID();
        UUID validJornadaId = UUID.randomUUID();
        insertDueJornada(brokenJornadaId, templateId, employeeId, adminAccountId, now.minusSeconds(7200), java.time.LocalDate.now().minusDays(2), "{\"blocks\":\"x\"}", now);
        insertDueJornada(validJornadaId, templateId, employeeId, adminAccountId, now.minusSeconds(3600), java.time.LocalDate.now().minusDays(1), validSnapshot, now);

        marks.createDueAbsences(now, 1);

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, brokenJornadaId.toString()));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, validJornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT deviation_worker_failure_count FROM jornadas WHERE id=?", Integer.class, brokenJornadaId.toString()));
        assertEquals(java.sql.Timestamp.from(now.plusSeconds(30)), jdbc.queryForObject(
                "SELECT deviation_worker_retry_at FROM jornadas WHERE id=?", java.sql.Timestamp.class, brokenJornadaId.toString()));

        marks.createDueAbsences(now.plusSeconds(15), 1);

        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, validJornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT deviation_worker_failure_count FROM jornadas WHERE id=?", Integer.class, brokenJornadaId.toString()));

        marks.createDueAbsences(now.plusSeconds(30), 1);

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, brokenJornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, validJornadaId.toString()));
        assertEquals(2, jdbc.queryForObject("SELECT deviation_worker_failure_count FROM jornadas WHERE id=?", Integer.class, brokenJornadaId.toString()));
        assertEquals(java.sql.Timestamp.from(now.plusSeconds(90)), jdbc.queryForObject(
                "SELECT deviation_worker_retry_at FROM jornadas WHERE id=?", java.sql.Timestamp.class, brokenJornadaId.toString()));

        jdbc.update("UPDATE jornadas SET schedule_snapshot=? WHERE id=?", validSnapshot, brokenJornadaId.toString());
        marks.createDueAbsences(now.plusSeconds(90), 1);

        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, brokenJornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, validJornadaId.toString()));
        assertEquals(0, jdbc.queryForObject("SELECT deviation_worker_failure_count FROM jornadas WHERE id=?", Integer.class, brokenJornadaId.toString()));
        assertNull(jdbc.queryForObject("SELECT deviation_worker_retry_at FROM jornadas WHERE id=?", java.sql.Timestamp.class, brokenJornadaId.toString()));
    }

    @Test
    void absenceWorkerSkipsInactiveAccounts() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS).plusSeconds(1);
        UUID inactiveAccountId = UUID.randomUUID();
        UUID inactiveEmployeeId = UUID.randomUUID();
        UUID inactiveJornadaId = UUID.randomUUID();
        UUID templateId = jdbc.queryForObject("SELECT id FROM schedule_templates WHERE company_id=? LIMIT 1", (rs, row) -> UUID.fromString(rs.getString(1)), companyId.toString());
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,FALSE,?,?)",
                inactiveAccountId.toString(), "30999998", "30.999.998", "unused-test-hash", java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), inactiveAccountId.toString(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,0,TRUE,?,?)",
                inactiveEmployeeId.toString(), companyId.toString(), inactiveAccountId.toString(), "Cuenta inactiva", java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)",
                companyId.toString(), inactiveEmployeeId.toString(), siteId.toString(), java.sql.Timestamp.from(now));
        String snapshot = "{\"siteId\":\"" + siteId + "\",\"name\":\"Turno\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
        insertDueJornada(inactiveJornadaId, templateId, inactiveEmployeeId, adminAccountId, now.minusSeconds(7200), java.time.LocalDate.now().minusDays(2), snapshot, now);

        marks.createDueAbsences(now, 1);

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, inactiveJornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, jornadaId.toString()));
    }

    @Test
    void missingEgressWorkerCreatesOneInternalDeviationAndSkipsItOnNextTick() {
        Instant end = openJornadaEndingAt(Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600));
        Instant due = end.plusSeconds(10 * 60 + 1);

        marks.createDueAbsences(due, 200);

        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='MARCA_FALTANTE' AND active=TRUE", Integer.class, jornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active=TRUE", Integer.class, jornadaId.toString()));
        java.sql.Timestamp updatedAt = jdbc.queryForObject("SELECT updated_at FROM deviations WHERE jornada_id=?", java.sql.Timestamp.class, jornadaId.toString());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox_events", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM notification_windows", Integer.class));

        marks.createDueAbsences(due.plusSeconds(60), 200);

        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=?", Integer.class, jornadaId.toString()));
        assertEquals(updatedAt, jdbc.queryForObject("SELECT updated_at FROM deviations WHERE jornada_id=?", java.sql.Timestamp.class, jornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviation_audits WHERE company_id=?", Integer.class, companyId.toString()));
    }

    @Test
    void missingEgressWorkerWaitsForTheStrictToleranceBoundary() {
        Instant end = openJornadaEndingAt(Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600));

        marks.createDueAbsences(end.plusSeconds(10 * 60), 200);
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=?", Integer.class, jornadaId.toString()));

        marks.createDueAbsences(end.plusSeconds(10 * 60 + 1), 200);
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='MARCA_FALTANTE'", Integer.class, jornadaId.toString()));
    }

    @Test
    void laterEgressWithinToleranceClosesMissingEgressWithoutLeavingADeviation() {
        Instant end = openJornadaEndingAt(Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600));
        marks.createDueAbsences(end.plusSeconds(10 * 60 + 1), 200);

        marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.EGRESO, UUID.randomUUID(), end.plusSeconds(5 * 60));

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active=TRUE", Integer.class, jornadaId.toString()));
        assertEquals("MARCA_FALTANTE", jdbc.queryForObject("SELECT type FROM deviations WHERE jornada_id=?", String.class, jornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviation_audits WHERE company_id=? AND change_type='RETRACTED' AND before_type='MARCA_FALTANTE'", Integer.class, companyId.toString()));
    }

    @Test
    void laterEgressOutsideToleranceReplacesTheSameDeviationWithEgresoTardioAndKeepsTheMotive() {
        Instant end = openJornadaEndingAt(Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600));
        marks.createDueAbsences(end.plusSeconds(10 * 60 + 1), 200);
        String deviationId = jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=?", String.class, jornadaId.toString());
        deviations.saveMotive(null, employeeScope, UUID.fromString(deviationId), "OTRA", "Me olvide de fichar");
        deviations.classify(adminScope, UUID.fromString(deviationId), "JUSTIFICADO", null);

        marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.EGRESO, UUID.randomUUID(), end.plusSeconds(20 * 60));

        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active=TRUE", Integer.class, jornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=?", Integer.class, jornadaId.toString()));
        assertEquals(deviationId, jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND type='EGRESO_TARDIO' AND active=TRUE", String.class, jornadaId.toString()));
        assertEquals("Me olvide de fichar", jdbc.queryForObject("SELECT motive_text FROM deviations WHERE id=?", String.class, deviationId));
        // D-20261027-01: the type changed, so the classification goes back to review (the motive above stays).
        assertNull(jdbc.queryForObject("SELECT classification FROM deviations WHERE id=?", String.class, deviationId));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='CLASSIFICATION_RESET' AND before_classification='JUSTIFICADO' AND after_classification IS NULL", Integer.class, deviationId));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='TYPE_REPLACED' AND before_type='MARCA_FALTANTE' AND after_type='EGRESO_TARDIO'", Integer.class, deviationId));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox_events", Integer.class));
    }

    @Test
    void adminForgottenEgressOutsideToleranceReplacesMissingEgressWithEgresoTardio() {
        Instant end = openJornadaEndingAt(Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600));
        marks.createDueAbsences(end.plusSeconds(10 * 60 + 1), 200);
        String deviationId = jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=?", String.class, jornadaId.toString());

        marks.forgottenMark(adminScope, jornadaId, MarkAction.EGRESO, end.plusSeconds(30 * 60), "Egreso olvidado");

        assertEquals("EGRESO_TARDIO", jdbc.queryForObject("SELECT type FROM deviations WHERE id=? AND active=TRUE", String.class, deviationId));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active=TRUE", Integer.class, jornadaId.toString()));
    }

    @Test
    void adminForgottenEgressInsideToleranceLeavesNoActiveDeviation() {
        Instant end = openJornadaEndingAt(Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600));
        marks.createDueAbsences(end.plusSeconds(10 * 60 + 1), 200);

        marks.forgottenMark(adminScope, jornadaId, MarkAction.EGRESO, end.plusSeconds(2 * 60), "Egreso olvidado");

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active=TRUE", Integer.class, jornadaId.toString()));
    }

    @Test
    void adminCorrectionTurningEgressIntoLateEgressReplacesNothingExtra() {
        Instant end = openJornadaEndingAt(Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600));
        marks.createDueAbsences(end.plusSeconds(10 * 60 + 1), 200);
        var egress = marks.forgottenMark(adminScope, jornadaId, MarkAction.EGRESO, end.plusSeconds(2 * 60), "Egreso olvidado");

        marks.correctMark(adminScope, egress.id(), MarkAction.EGRESO, end.plusSeconds(40 * 60), "Hora corregida");

        assertEquals(List.of("EGRESO_TARDIO"), jdbc.query("SELECT type FROM deviations WHERE jornada_id=? AND active=TRUE", (rs, row) -> rs.getString(1), jornadaId.toString()));
    }

    @Test
    void veryLateIngressWithoutEgressYieldsLateArrivalAndMissingEgress() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        jdbc.update("UPDATE jornadas SET scheduled_start_at=?,scheduled_end_at=? WHERE id=?",
                java.sql.Timestamp.from(now.minusSeconds(9 * 3600)), java.sql.Timestamp.from(now.minusSeconds(3600)), jornadaId.toString());

        marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.INGRESO, UUID.randomUUID(), now);

        assertEquals(List.of("LLEGADA_TARDE", "MARCA_FALTANTE"), jdbc.query("SELECT type FROM deviations WHERE jornada_id=? AND active=TRUE ORDER BY type",
                (rs, row) -> rs.getString(1), jornadaId.toString()));
    }

    @Test
    void adminCorrectionRemovingEgressTurnsLateEgressIntoMissingEgressWhenPastTolerance() {
        Instant end = openJornadaEndingAt(Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600));
        var egress = marks.forgottenMark(adminScope, jornadaId, MarkAction.EGRESO, end.plusSeconds(30 * 60), "Egreso olvidado");
        String deviationId = jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND type='EGRESO_TARDIO' AND active=TRUE", String.class, jornadaId.toString());

        marks.correctMark(adminScope, egress.id(), MarkAction.SALIDA_ALMUERZO, end.plusSeconds(30 * 60), "No era el egreso");

        assertEquals(List.of("MARCA_FALTANTE"), jdbc.query("SELECT type FROM deviations WHERE jornada_id=? AND active=TRUE", (rs, row) -> rs.getString(1), jornadaId.toString()));
        assertEquals(deviationId, jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND active=TRUE", String.class, jornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='TYPE_REPLACED' AND before_type='EGRESO_TARDIO' AND after_type='MARCA_FALTANTE'", Integer.class, deviationId));
    }

    @Test
    void adminCorrectionRemovingEgressRetractsEarlyEgressDeviationWhenNotYetPastTolerance() {
        Instant end = openJornadaEndingAt(Instant.now().truncatedTo(ChronoUnit.MICROS).plusSeconds(2 * 3600));
        Instant egressAt = Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600);
        var egress = marks.forgottenMark(adminScope, jornadaId, MarkAction.EGRESO, egressAt, "Egreso olvidado");
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='EGRESO_TEMPRANO' AND active=TRUE", Integer.class, jornadaId.toString()));

        marks.correctMark(adminScope, egress.id(), MarkAction.SALIDA_ALMUERZO, egressAt, "No era el egreso");

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active=TRUE", Integer.class, jornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviation_audits WHERE company_id=? AND change_type='RETRACTED' AND before_type='EGRESO_TEMPRANO'", Integer.class, companyId.toString()));
        assertTrue(end.isAfter(egressAt));
    }

    @Test
    void missingEgressStillAppliesWhenAPauseIsOpenAtTheScheduledEnd() {
        Instant end = openJornadaEndingAt(Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600));
        insertHistoricalMark(2, "SALIDA_ALMUERZO", end.minusSeconds(30 * 60));
        jdbc.update("UPDATE jornadas SET state='PAUSA_ABIERTA',next_sequence=3 WHERE id=?", jornadaId.toString());

        marks.createDueAbsences(end.plusSeconds(10 * 60 + 1), 200);

        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='MARCA_FALTANTE' AND active=TRUE", Integer.class, jornadaId.toString()));
    }

    @Test
    void missingEgressUsesStoredScheduledEndNotTheSnapshotOrLocalDate() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Instant end = openJornadaEndingAt(now.plusSeconds(2 * 3600));
        jdbc.update("UPDATE jornadas SET local_date=? WHERE id=?", java.time.LocalDate.now().minusDays(1), jornadaId.toString());

        marks.createDueAbsences(now.plusSeconds(3600), 200);
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=?", Integer.class, jornadaId.toString()));

        marks.createDueAbsences(end.plusSeconds(10 * 60 + 1), 200);
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='MARCA_FALTANTE' AND active=TRUE", Integer.class, jornadaId.toString()));
    }

    @Test
    void missingEgressWorkerSkipsInactiveEmployeesAndAccounts() {
        Instant end = openJornadaEndingAt(Instant.now().truncatedTo(ChronoUnit.MICROS).minusSeconds(3600));
        Instant due = end.plusSeconds(10 * 60 + 1);

        jdbc.update("UPDATE employees SET active=FALSE WHERE id=?", employeeId.toString());
        marks.createDueAbsences(due, 200);
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=?", Integer.class, jornadaId.toString()));

        jdbc.update("UPDATE employees SET active=TRUE WHERE id=?", employeeId.toString());
        jdbc.update("UPDATE accounts SET active=FALSE WHERE id=?", accountId.toString());
        marks.createDueAbsences(due, 200);
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=?", Integer.class, jornadaId.toString()));
    }

    @Test
    void missingEgressIsNotCreatedWithoutIngress() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        jdbc.update("UPDATE jornadas SET scheduled_start_at=?,scheduled_end_at=? WHERE id=?",
                java.sql.Timestamp.from(now.minusSeconds(9 * 3600)), java.sql.Timestamp.from(now.minusSeconds(3600)), jornadaId.toString());

        marks.createDueAbsences(now, 200);

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='MARCA_FALTANTE'", Integer.class, jornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE", Integer.class, jornadaId.toString()));
    }

    @Test
    void missingEgressWorkerAdvancesPastTheBatchLimit() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        Instant end = openJornadaEndingAt(now.minusSeconds(3600));
        UUID templateId = jdbc.queryForObject("SELECT id FROM schedule_templates WHERE company_id=? LIMIT 1", (rs, row) -> UUID.fromString(rs.getString(1)), companyId.toString());
        String snapshot = "{\"siteId\":\"" + siteId + "\",\"name\":\"Turno\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
        for (int i = 1; i <= 3; i++) {
            UUID other = UUID.randomUUID();
            insertDueJornada(other, templateId, employeeId, adminAccountId, end.minusSeconds(8 * 3600L + i), java.time.LocalDate.now().minusDays(i + 1), snapshot, now);
            jdbc.update("UPDATE jornadas SET scheduled_end_at=?,state='EN_CURSO' WHERE id=?", java.sql.Timestamp.from(end.minusSeconds(i)), other.toString());
            jdbc.update("INSERT INTO mark_events(id,company_id,jornada_id,sequence_number,timeline_order,action,original_action,occurred_at,original_occurred_at,accepted_at,recorded_at,origin,created_by,location_status) VALUES(?,?,?,1,1000,'INGRESO','INGRESO',?,?,?,?,'EMPLEADO',?,'NO_APLICA')",
                    UUID.randomUUID().toString(), companyId.toString(), other.toString(), java.sql.Timestamp.from(end.minusSeconds(8 * 3600L)),
                    java.sql.Timestamp.from(end.minusSeconds(8 * 3600L)), java.sql.Timestamp.from(end.minusSeconds(8 * 3600L)),
                    java.sql.Timestamp.from(end.minusSeconds(8 * 3600L)), accountId.toString());
        }
        Instant due = end.plusSeconds(10 * 60 + 1);

        marks.createDueAbsences(due, 2);
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE company_id=? AND type='MARCA_FALTANTE' AND active=TRUE", Integer.class, companyId.toString()));

        marks.createDueAbsences(due.plusSeconds(1), 2);
        assertEquals(4, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE company_id=? AND type='MARCA_FALTANTE' AND active=TRUE", Integer.class, companyId.toString()));
    }

    @Test
    void forgottenIngressCanBeInsertedBeforeAlreadyStoredEgresoAndKeepsReceiptSequence() {
        Instant acceptedAt = Instant.now().minusSeconds(30);
        Instant egressAt = Instant.now();
        UUID egressId = UUID.randomUUID();
        jdbc.update("INSERT INTO mark_events(id,company_id,jornada_id,sequence_number,timeline_order,action,original_action,occurred_at,original_occurred_at,accepted_at,recorded_at,origin,created_by,location_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'EMPLEADO',?,'NO_APLICA')",
                egressId.toString(), companyId.toString(), jornadaId.toString(), 1L, 1000L, "EGRESO", "EGRESO", java.sql.Timestamp.from(egressAt), java.sql.Timestamp.from(egressAt), java.sql.Timestamp.from(acceptedAt), java.sql.Timestamp.from(acceptedAt), accountId.toString());
        jdbc.update("UPDATE jornadas SET state='EGRESADA',next_sequence=2 WHERE id=?", jornadaId.toString());

        Instant eventAt = egressAt.minusSeconds(3600);
        var result = marks.forgottenMark(adminScope, jornadaId, MarkAction.INGRESO, eventAt, "Ingreso olvidado");

        assertEquals(2L, result.sequence());
        Instant storedEventAt = jdbc.queryForObject("SELECT occurred_at FROM mark_events WHERE id=?", java.sql.Timestamp.class, result.id().toString()).toInstant();
        assertTrue(Math.abs(java.time.Duration.between(eventAt, storedEventAt).toNanos()) <= 1000,
                "MySQL DATETIME(6) must preserve the forgotten event time to microsecond precision");
        assertEquals("ADMIN", jdbc.queryForObject("SELECT origin FROM mark_events WHERE id=?", String.class, result.id().toString()));
        assertTrue(jdbc.queryForObject("SELECT accepted_at <= recorded_at FROM mark_events WHERE id=?", Boolean.class, result.id().toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM forgotten_mark_audits WHERE mark_id=? AND actor_account_id=? AND audit_reason=?",
                Integer.class, result.id().toString(), adminAccountId.toString(), "Ingreso olvidado"));
        assertEquals(egressId.toString(), jdbc.queryForObject("SELECT id FROM mark_events WHERE jornada_id=? AND sequence_number=1", String.class, jornadaId.toString()));
        assertEquals(List.of(2L, 1L), jdbc.query("SELECT sequence_number FROM mark_events WHERE jornada_id=? ORDER BY timeline_order",
                (rs, row) -> rs.getLong(1), jornadaId.toString()));
        assertEquals("EGRESADA", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
    }

    @Test
    void forgottenPauseReturnCanRepairPauseBeforeAlreadyStoredEgreso() {
        Instant start = Instant.now().minusSeconds(5 * 60 * 60L);
        Instant pauseOut = Instant.now().minusSeconds(3 * 60 * 60L);
        Instant egressAt = Instant.now().minusSeconds(60);
        insertHistoricalMark(1, "INGRESO", start);
        insertHistoricalMark(2, "SALIDA_DESAYUNO", pauseOut);
        insertHistoricalMark(3, "EGRESO", egressAt);
        jdbc.update("UPDATE jornadas SET state='EGRESADA',next_sequence=4 WHERE id=?", jornadaId.toString());

        var result = marks.forgottenMark(adminScope, jornadaId, MarkAction.VUELTA_DESAYUNO,
                pauseOut.plusSeconds(60 * 60L), "Vuelta de desayuno olvidada");

        assertEquals(4L, result.sequence());
        assertEquals("EGRESADA", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
        assertEquals(4, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", Integer.class, jornadaId.toString()));
        assertEquals("VUELTA_DESAYUNO", jdbc.queryForObject("SELECT action FROM mark_events WHERE id=?", String.class, result.id().toString()));
        assertEquals(List.of("INGRESO", "SALIDA_DESAYUNO", "VUELTA_DESAYUNO", "EGRESO"), jdbc.query(
                "SELECT action FROM mark_events WHERE jornada_id=? ORDER BY timeline_order", (rs, row) -> rs.getString(1), jornadaId.toString()));
        assertEquals(List.of(1L, 2L, 4L, 3L), jdbc.query(
                "SELECT sequence_number FROM mark_events WHERE jornada_id=? ORDER BY timeline_order", (rs, row) -> rs.getLong(1), jornadaId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM forgotten_mark_audits WHERE mark_id=?", Integer.class, result.id().toString()));
    }

    @Test
    void forgottenPauseStartCannotLeaveInvalidHistoryWhenReturnIsAlsoMissing() {
        Instant start = Instant.now().minusSeconds(5 * 60 * 60L);
        Instant egressAt = Instant.now().minusSeconds(60);
        insertHistoricalMark(1, "INGRESO", start);
        insertHistoricalMark(2, "EGRESO", egressAt);
        jdbc.update("UPDATE jornadas SET state='EGRESADA',next_sequence=3 WHERE id=?", jornadaId.toString());

        assertThrows(ApiException.class, () -> marks.forgottenMark(adminScope, jornadaId,
                MarkAction.SALIDA_DESAYUNO, start.plusSeconds(60 * 60L), "Pausa olvidada"));

        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", Integer.class, jornadaId.toString()));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM forgotten_mark_audits WHERE jornada_id=?", Integer.class, jornadaId.toString()));
        assertEquals(3L, jdbc.queryForObject("SELECT next_sequence FROM jornadas WHERE id=?", Long.class, jornadaId.toString()));
    }

    @Test
    void employeeWithoutActiveEmployeeProfileCannotReadDeviationEndpoints() {
        insertDeviation("SIN_INGRESO");
        org.springframework.security.core.Authentication authentication = authentication(accountId, "30123456");
        MockHttpSession session = activeCompanySession(companyId);
        jdbc.update("UPDATE employees SET active=FALSE WHERE id=?", employeeId.toString());

        assertEquals(403, assertThrows(ApiException.class,
                () -> deviationController.list(authentication, session, null, null, null, null, 100)).status().value());
        assertEquals(403, assertThrows(ApiException.class,
                () -> deviationController.inbox(authentication, session, null, 50, null, null, null, null)).status().value());
    }

    @Test
    void employeeTemplateListIsRestrictedToAssignedSitesWithoutSiteFilter() {
        UUID secondSite = UUID.randomUUID();
        UUID secondTemplate = UUID.randomUUID();
        Instant now = Instant.now();
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)",
                secondSite.toString(), companyId.toString(), "Norte", "America/Argentina/Buenos_Aires", java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,?,20,30,TRUE,?,?)",
                secondTemplate.toString(), companyId.toString(), secondSite.toString(), "Norte turno", java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));

        var templates = organizations.templates(authentication(accountId, "30123456"), activeCompanySession(companyId), null);

        assertEquals(1, templates.size());
        assertEquals(siteId, templates.getFirst().siteId());

        UUID otherCompany = UUID.randomUUID();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", otherCompany.toString(), "Otra empresa", java.sql.Timestamp.from(now));
        assertEquals(403, assertThrows(ApiException.class,
                () -> organizations.templates(authentication(adminAccountId, "30123457"), activeCompanySession(otherCompany), null)).status().value());
    }

    @Test
    void healthMotiveAndCoordinatesAreScopedAndPurgedAfterNinetyDays() {
        UUID deviationId = insertDeviation("SIN_INGRESO");
        ScopeService.Scope secondEmployeeScope = createEmployeeScope("30123458", "Otra persona", siteId);
        Authentication employeeAuth = authentication(accountId, "30123456");
        var authorView = deviations.saveMotive(employeeAuth, employeeScope, deviationId, "SALUD", "Consulta médica privada");

        assertEquals("SALUD", authorView.category());
        assertEquals("Consulta médica privada", authorView.motiveText());
        assertEquals("Persona de prueba", deviations.list(employeeScope, new DeviationService.ListFilter(null, null, null, null, 100)).getFirst().employeeDisplayName());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE id=? AND motive_text IS NULL AND motive_ciphertext IS NOT NULL",
                Integer.class, deviationId.toString()));
        assertTrue(deviations.list(secondEmployeeScope,
                new DeviationService.ListFilter(null, null, null, null, 100)).stream().noneMatch(item -> item.id().equals(deviationId)));
        assertEquals(404, assertThrows(ApiException.class,
                () -> deviations.loadView(secondEmployeeScope, deviationId)).status().value());
        var adminView = deviations.loadView(adminScope, deviationId);
        assertEquals("Persona de prueba", adminView.employeeDisplayName());
        assertEquals("Consulta médica privada", adminView.motiveText());

        Instant acceptedAt = Instant.now();
        UUID markId = marks.recordEmployeeMark(employeeScope, jornadaId, MarkAction.INGRESO, UUID.randomUUID(), acceptedAt).mark().id();
        marks.attachLocation(employeeScope, markId, -26.82, -65.21, 8.0, acceptedAt.plusSeconds(1));
        var employeeMark = marks.getMark(employeeScope, markId);
        var adminMark = marks.getMark(adminScope, markId);
        assertNull(employeeMark.latitude());
        assertEquals(-26.82, adminMark.latitude());

        ScopeService.Scope foreignCompanyAdmin = new ScopeService.Scope(UUID.randomUUID(), UUID.randomUUID(), "ADMIN", false);
        assertThrows(ApiException.class, () -> marks.getMark(foreignCompanyAdmin, markId));
        jdbc.update("UPDATE mark_events SET location_received_at=? WHERE id=?", java.sql.Timestamp.from(Instant.now().minusSeconds(91L * 86400)), markId.toString());
        jdbc.update("UPDATE deviations SET motive_created_at=? WHERE id=?", java.sql.Timestamp.from(Instant.now().minusSeconds(91L * 86400)), deviationId.toString());

        retention.purgeSensitiveData();

        assertEquals("PURGADA", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, markId.toString()));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE id=? AND (latitude IS NOT NULL OR longitude IS NOT NULL)", Integer.class, markId.toString()));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE id=? AND motive_category='SALUD' AND motive_ciphertext IS NULL AND motive_iv IS NULL AND motive_cipher_key_id IS NULL AND motive_purged_at IS NOT NULL",
                Integer.class, deviationId.toString()));
        assertNull(deviations.loadView(adminScope, deviationId).motiveText());
    }

    private UUID insertDeviation(String type) {
        UUID id = UUID.randomUUID();
        Instant now = Instant.now();
        jdbc.update("INSERT INTO deviations(id,company_id,jornada_id,site_id,employee_id,type,created_at,updated_at,active) VALUES(?,?,?,?,?,?,?, ?,TRUE)",
                id.toString(), companyId.toString(), jornadaId.toString(), siteId.toString(), employeeId.toString(), type,
                java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        return id;
    }

    private UUID activeDeviationId(UUID company, UUID jornada, String type) {
        return UUID.fromString(jdbc.queryForObject(
                "SELECT id FROM deviations WHERE company_id=? AND jornada_id=? AND type=? AND active=TRUE",
                String.class, company.toString(), jornada.toString(), type));
    }

    private ScopeService.Scope createEmployeeScope(String dni, String displayName, UUID assignedSite) {
        UUID account = UUID.randomUUID();
        UUID employee = UUID.randomUUID();
        Instant now = Instant.now();
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                account.toString(), dni, dni, "unused-test-hash", java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), account.toString(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,10,TRUE,?,?)",
                employee.toString(), companyId.toString(), account.toString(), displayName, java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)",
                companyId.toString(), employee.toString(), assignedSite.toString(), java.sql.Timestamp.from(now));
        return new ScopeService.Scope(account, companyId, "EMPLOYEE", false);
    }

    private HttpLogin loginOverHttp(UUID account, String dni, String password) throws Exception {
        jdbc.update("UPDATE accounts SET password_hash=? WHERE id=?", passwordEncoder.encode(password), account.toString());
        MvcResult csrfResponse = mockMvc.perform(get("/api/v1/csrf"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode csrfBody = objectMapper.readTree(csrfResponse.getResponse().getContentAsString());
        String csrfToken = csrfBody.get("token").asText();
        String anonymousSessionId = cookieValue(setCookieHeader(csrfResponse, "BRAJA_SESSION"));

        MvcResult loginResponse = mockMvc.perform(post("/api/v1/session")
                        .cookie(new Cookie("BRAJA_SESSION", anonymousSessionId), new Cookie("BRAJA_CSRF", csrfToken))
                        .header("X-CSRF-TOKEN", csrfToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dni\":\"" + dni + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accountId").value(account.toString()))
                .andReturn();

        String sessionCookieHeader = setCookieHeader(loginResponse, "BRAJA_SESSION");
        assertTrue(sessionCookieHeader.toLowerCase().contains("httponly"),
                "Authenticated session cookie must be HttpOnly");
        String sessionId = cookieValue(sessionCookieHeader);
        Cookie sessionCookie = new Cookie("BRAJA_SESSION", sessionId);
        // Login rotates the CSRF token, so the authenticated session fetches a new one like the PWA does.
        MvcResult authenticatedCsrf = mockMvc.perform(get("/api/v1/csrf").cookie(sessionCookie)).andExpect(status().isOk()).andReturn();
        String authenticatedToken = objectMapper.readTree(authenticatedCsrf.getResponse().getContentAsString()).get("token").asText();
        assertNotEquals(csrfToken, authenticatedToken, "Login must rotate the CSRF token");
        return new HttpLogin(sessionCookie, authenticatedToken);
    }

    private MvcResult adminWrite(HttpLogin login, MockHttpServletRequestBuilder request, String body) throws Exception {
        return mockMvc.perform(request
                .cookie(new Cookie("BRAJA_SESSION", login.sessionCookie().getValue()),
                        new Cookie("BRAJA_CSRF", login.csrfToken()))
                .header("X-CSRF-TOKEN", login.csrfToken())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body)).andReturn();
    }

    private void assertMarkUnchanged(UUID markId, Instant expectedOccurredAt) {
        assertEquals("INGRESO", jdbc.queryForObject("SELECT action FROM mark_events WHERE id=?", String.class, markId.toString()));
        assertEquals(expectedOccurredAt, jdbc.queryForObject("SELECT occurred_at FROM mark_events WHERE id=?",
                java.sql.Timestamp.class, markId.toString()).toInstant());
        assertEquals(0, count("SELECT COUNT(*) FROM mark_correction_audits WHERE mark_id=?", markId.toString()));
    }

    private String templateUpdateBody(UUID targetSiteId, String name) {
        return "{\"siteId\":\"" + targetSiteId + "\",\"name\":\"" + name
                + "\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"17:00:00\",\"endDayOffset\":0}],"
                + "\"breakfastLimitMinutes\":15,\"lunchLimitMinutes\":30}";
    }

    private int count(String sql, Object... args) {
        Integer result = jdbc.queryForObject(sql, Integer.class, args);
        return result == null ? 0 : result;
    }

    private MvcResult postEmployeeMark(HttpLogin login, UUID targetJornadaId, UUID idempotencyKey,
                                       MarkAction action) throws Exception {
        return mockMvc.perform(post("/api/v1/jornadas/{jornadaId}/marks", targetJornadaId)
                        .cookie(new Cookie(login.sessionCookie().getName(), login.sessionCookie().getValue()),
                                new Cookie("BRAJA_CSRF", login.csrfToken()))
                        .header("X-CSRF-TOKEN", login.csrfToken())
                        .header("Idempotency-Key", idempotencyKey.toString())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"" + action.name() + "\"}"))
                .andReturn();
    }

    private String setCookieHeader(MvcResult result, String cookieName) {
        return result.getResponse().getHeaders("Set-Cookie").stream()
                .filter(header -> header.startsWith(cookieName + "="))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Missing " + cookieName + " Set-Cookie header"));
    }

    private String cookieValue(String setCookieHeader) {
        String pair = setCookieHeader.split(";", 2)[0];
        return pair.substring(pair.indexOf('=') + 1);
    }

    private OtherTenantMark createOtherTenantMark() {
        Instant now = Instant.now();
        UUID otherCompany = UUID.randomUUID();
        UUID otherSite = UUID.randomUUID();
        UUID otherTemplate = UUID.randomUUID();
        UUID otherEmployee = UUID.randomUUID();
        UUID otherJornada = UUID.randomUUID();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)",
                otherCompany.toString(), "Empresa B", java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)",
                otherSite.toString(), otherCompany.toString(), "Sede B", "America/Argentina/Buenos_Aires", java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,?,20,30,TRUE,?,?)",
                otherTemplate.toString(), otherCompany.toString(), otherSite.toString(), "Turno B", java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                UUID.randomUUID().toString(), otherCompany.toString(), accountId.toString(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,10,TRUE,?,?)",
                otherEmployee.toString(), otherCompany.toString(), accountId.toString(), "Persona empresa B", java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)",
                otherCompany.toString(), otherEmployee.toString(), otherSite.toString(), java.sql.Timestamp.from(now));
        String snapshot = "{\"siteId\":\"" + otherSite + "\",\"name\":\"Turno B\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'NO_INGRESO',1,?,?)",
                otherJornada.toString(), otherCompany.toString(), otherEmployee.toString(), otherSite.toString(), otherTemplate.toString(), java.time.LocalDate.now(),
                "America/Argentina/Buenos_Aires", snapshot, 10, java.sql.Timestamp.from(now.minusSeconds(900)),
                java.sql.Timestamp.from(now.plusSeconds(3600)), accountId.toString(), java.sql.Timestamp.from(now));

        var result = marks.recordEmployeeMark(new ScopeService.Scope(accountId, otherCompany, "EMPLOYEE", false),
                otherJornada, MarkAction.INGRESO, UUID.randomUUID(), now);
        return new OtherTenantMark(otherCompany, otherSite, otherEmployee, otherTemplate, otherJornada, result.mark().id());
    }

    private OtherTenantAdmin createOtherTenantAdmin() {
        Instant now = Instant.now();
        String suffix = String.format("%08d", Math.floorMod(System.nanoTime(), 100_000_000L));
        String adminDni = "42" + suffix;
        String employeeDni = "43" + suffix;
        String employeeName = "Persona empresa B " + suffix;
        UUID otherCompany = UUID.randomUUID();
        UUID otherAdmin = UUID.randomUUID();
        UUID otherEmployeeAccount = UUID.randomUUID();
        UUID otherSite = UUID.randomUUID();
        UUID otherTemplate = UUID.randomUUID();
        UUID otherEmployee = UUID.randomUUID();
        UUID otherJornada = UUID.randomUUID();

        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)",
                otherCompany.toString(), "Empresa B " + suffix, java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)",
                otherSite.toString(), otherCompany.toString(), "Sede B " + suffix,
                "America/Argentina/Buenos_Aires", java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                otherAdmin.toString(), adminDni, adminDni, "unused-test-hash",
                java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                otherEmployeeAccount.toString(), employeeDni, employeeDni, "unused-test-hash",
                java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'ADMIN',TRUE,?)",
                UUID.randomUUID().toString(), otherCompany.toString(), otherAdmin.toString(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                UUID.randomUUID().toString(), otherCompany.toString(), otherEmployeeAccount.toString(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,10,TRUE,?,?)",
                otherEmployee.toString(), otherCompany.toString(), otherEmployeeAccount.toString(), employeeName,
                java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)",
                otherCompany.toString(), otherEmployee.toString(), otherSite.toString(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,?,20,30,TRUE,?,?)",
                otherTemplate.toString(), otherCompany.toString(), otherSite.toString(), "Turno B",
                java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        String snapshot = "{\"siteId\":\"" + otherSite + "\",\"name\":\"Turno B\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,'NO_INGRESO',1,?,?)",
                otherJornada.toString(), otherCompany.toString(), otherEmployee.toString(), otherSite.toString(),
                otherTemplate.toString(), java.time.LocalDate.now(), "America/Argentina/Buenos_Aires",
                snapshot, 10, java.sql.Timestamp.from(now.minusSeconds(900)),
                java.sql.Timestamp.from(now.plusSeconds(3600)), otherAdmin.toString(), java.sql.Timestamp.from(now));
        return new OtherTenantAdmin(otherCompany, otherAdmin, adminDni, otherEmployeeAccount, otherEmployee,
                employeeName, otherSite, otherTemplate, otherJornada);
    }

    private record HttpLogin(Cookie sessionCookie, String csrfToken) { }
    private record OtherTenantMark(UUID companyId, UUID siteId, UUID employeeId, UUID templateId,
                                   UUID jornadaId, UUID markId) { }
    private record OtherTenantAdmin(UUID companyId, UUID adminAccountId, String adminDni, UUID employeeAccountId,
                                    UUID employeeId, String employeeName, UUID siteId, UUID templateId, UUID jornadaId) { }

    /** Turns the default jornada into one with an INGRESO and no EGRESO that ends at the given instant (tolerance is 10 minutes). */
    private Instant openJornadaEndingAt(Instant end) {
        Instant start = end.minusSeconds(8 * 3600L);
        jdbc.update("UPDATE jornadas SET scheduled_start_at=?,scheduled_end_at=?,state='EN_CURSO',next_sequence=2 WHERE id=?",
                java.sql.Timestamp.from(start), java.sql.Timestamp.from(end), jornadaId.toString());
        insertHistoricalMark(1, "INGRESO", start);
        return end;
    }

    private void insertHistoricalMark(long sequence, String action, Instant occurredAt) {
        Instant recordedAt = occurredAt.plusSeconds(1);
        jdbc.update("INSERT INTO mark_events(id,company_id,jornada_id,sequence_number,timeline_order,action,original_action,occurred_at,original_occurred_at,accepted_at,recorded_at,origin,created_by,location_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'EMPLEADO',?,'NO_APLICA')",
                UUID.randomUUID().toString(), companyId.toString(), jornadaId.toString(), sequence, sequence * 1000,
                action, action, java.sql.Timestamp.from(occurredAt), java.sql.Timestamp.from(occurredAt),
                java.sql.Timestamp.from(recordedAt), java.sql.Timestamp.from(recordedAt), accountId.toString());
    }

    private void insertDueJornada(UUID id, UUID templateId, UUID targetEmployeeId, UUID createdBy,
                                  Instant scheduledStart, java.time.LocalDate localDate, String scheduleSnapshot, Instant createdAt) {
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) " +
                        "VALUES(?,?,?,?,?,?,?,?,0,?,?,'NO_INGRESO',1,?,?)",
                id.toString(), companyId.toString(), targetEmployeeId.toString(), siteId.toString(), templateId.toString(), localDate,
                "America/Argentina/Buenos_Aires", scheduleSnapshot, java.sql.Timestamp.from(scheduledStart),
                java.sql.Timestamp.from(scheduledStart.plusSeconds(8 * 3600)), createdBy.toString(), java.sql.Timestamp.from(createdAt));
    }

    private org.springframework.security.core.Authentication authentication(UUID account, String dni) {
        return new UsernamePasswordAuthenticationToken(new BrajaUserDetails(account, dni, "unused-test-hash", true), "", List.of());
    }

    private MockHttpSession activeCompanySession(UUID company) {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(CurrentActor.ACTIVE_COMPANY_SESSION_KEY, company);
        return session;
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out waiting in concurrency test");
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted during concurrency test", ex);
        }
    }
}
