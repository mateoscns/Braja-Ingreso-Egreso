package com.braja.fichaje.timekeeping;

import com.braja.fichaje.api.ApiException;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * Bounds and reachable-500 fixes of timekeeping and organization (issue #46, 2026-10-27 audit): every case goes
 * through HTTP (or the service where a race cannot be driven over HTTP) against MySQL 8.4 and asserts status, code
 * and the persisted rows.
 */
@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class TimekeepingBoundsMySqlTest {
    private static final String AES_KEY = java.util.Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = java.util.Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    private static final String PASSWORD = "CorrectHorseBattery9!";
    private static final String ZONE = "America/Argentina/Buenos_Aires";
    private static String passwordHash;

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja_bounds_test")
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
    @Autowired PlatformTransactionManager transactionManager;

    private UUID companyId;
    private UUID siteId;
    private UUID otherSiteId;
    private UUID adminAccountId;
    private UUID employeeAccountId;
    private UUID employeeId;
    private UUID templateId;
    private UUID jornadaId;
    private String adminDni;
    private String employeeDni;
    private Instant scheduledStart;

    @BeforeEach
    void setUp() {
        if (passwordHash == null) passwordHash = passwordEncoder.encode(PASSWORD);
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        companyId = UUID.randomUUID();
        siteId = UUID.randomUUID();
        otherSiteId = UUID.randomUUID();
        adminAccountId = UUID.randomUUID();
        employeeAccountId = UUID.randomUUID();
        employeeId = UUID.randomUUID();
        templateId = UUID.randomUUID();
        jornadaId = UUID.randomUUID();
        String suffix = String.format("%08d", Math.floorMod(System.nanoTime(), 100_000_000L));
        adminDni = "1" + suffix;
        employeeDni = "2" + suffix;
        Timestamp ts = Timestamp.from(now);
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), "Bounds " + suffix, ts);
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", siteId.toString(), companyId.toString(), "Centro", ZONE, ts);
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", otherSiteId.toString(), companyId.toString(), "Norte", ZONE, ts);
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
        insertTemplate(templateId, 0);
        scheduledStart = now.minusSeconds(900);
        String snapshot = "{\"siteId\":\"" + siteId + "\",\"name\":\"Turno\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":20,\"lunchLimitMinutes\":30}";
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,10,?,?,'NO_INGRESO',1,?,?)",
                jornadaId.toString(), companyId.toString(), employeeId.toString(), siteId.toString(), templateId.toString(), LocalDate.now(ZoneId.of(ZONE)),
                ZONE, snapshot, Timestamp.from(scheduledStart), Timestamp.from(now.plusSeconds(3600)), adminAccountId.toString(), ts);
    }

    // S6: the first block must start on day offset 0 (openapi.yaml TemplateInput); the jornada date is the date of the first block.

    @Test
    void templateWhoseFirstBlockStartsOnTheNextDayIsRejectedOnCreateAndUpdate() throws Exception {
        Login admin = login(adminDni);

        MvcResult rejected = send(admin, post("/api/v1/templates"), templateBody(siteId, "Noche", 1, "08:00:00", "16:00:00", 1));
        assertProblem(rejected, 422, "VALIDATION_ERROR");
        assertEquals(0, count("SELECT COUNT(*) FROM schedule_templates WHERE company_id=? AND name='Noche'", companyId.toString()));

        // Previous behaviour kept: an overnight template whose first block starts on day 0 is accepted.
        MvcResult overnight = send(admin, post("/api/v1/templates"), templateBody(siteId, "Noche", 0, "22:00:00", "06:00:00", 1));
        assertEquals(201, overnight.getResponse().getStatus());
        UUID created = UUID.fromString(json(overnight).get("id").asText());

        MvcResult update = send(admin, patch("/api/v1/templates/{id}", created), templateBody(siteId, "Noche", 1, "08:00:00", "16:00:00", 1));
        assertProblem(update, 422, "VALIDATION_ERROR");
        assertEquals(0, count("SELECT COUNT(*) FROM template_blocks WHERE template_id=? AND start_day_offset<>0", created.toString()));
        assertEquals(LocalTime.of(22, 0), jdbc.queryForObject("SELECT starts_at FROM template_blocks WHERE template_id=?", java.sql.Time.class, created.toString()).toLocalTime());
    }

    @Test
    void declaringWithALegacyTemplateWhoseFirstBlockStartsOnTheNextDayIsRejected() throws Exception {
        UUID legacy = UUID.randomUUID();
        insertTemplate(legacy, 1);
        Login admin = login(adminDni);

        MvcResult result = send(admin, post("/api/v1/jornadas"), declareBody(legacy, "2026-11-02"));

        assertProblem(result, 422, "VALIDATION_ERROR");
        assertEquals(0, count("SELECT COUNT(*) FROM jornadas WHERE company_id=? AND template_id=?", companyId.toString(), legacy.toString()));
    }

    @Test
    void declaredJornadaKeepsTheInputDateAsTheDateOfItsFirstBlock() throws Exception {
        Login admin = login(adminDni);

        MvcResult result = send(admin, post("/api/v1/jornadas"), declareBody(templateId, "2026-11-02"));

        assertEquals(201, result.getResponse().getStatus());
        String id = json(result).get("id").asText();
        assertEquals("2026-11-02", json(result).get("localDate").asText());
        assertEquals(LocalDate.of(2026, 11, 2).atTime(8, 0).atZone(ZoneId.of(ZONE)).toInstant(),
                jdbc.queryForObject("SELECT scheduled_start_at FROM jornadas WHERE id=?", Timestamp.class, id).toInstant());
    }

    // S7: declare localDate bounded to the years 2000-2100 (same bound as api/DateRanges).

    @Test
    void declaringOutsideTheYears2000To2100IsAValidationError() throws Exception {
        Login admin = login(adminDni);

        for (String date : new String[]{"1999-12-31", "2101-01-01", "+10000-01-01"}) {
            MvcResult result = send(admin, post("/api/v1/jornadas"), declareBody(templateId, date));
            assertProblem(result, 422, "VALIDATION_ERROR");
        }
        assertEquals(1, count("SELECT COUNT(*) FROM jornadas WHERE company_id=?", companyId.toString()));
        assertEquals(201, send(admin, post("/api/v1/jornadas"), declareBody(templateId, "2100-12-31")).getResponse().getStatus());
    }

    // S7: location fields are required; {} or nulls never store 0,0.

    @Test
    void locationWithoutCoordinatesIsAValidationErrorAndKeepsTheMarkPending() throws Exception {
        Login employee = login(employeeDni);
        UUID markId = UUID.fromString(json(mark(employee, UUID.randomUUID(), "INGRESO")).get("id").asText());

        assertProblem(send(employee, post("/api/v1/marks/{id}/location", markId), "{}"), 422, "VALIDATION_ERROR");
        assertProblem(send(employee, post("/api/v1/marks/{id}/location", markId),
                "{\"latitude\":null,\"longitude\":-58.4,\"accuracyMeters\":12}"), 422, "VALIDATION_ERROR");
        assertProblem(send(employee, post("/api/v1/marks/{id}/location", markId),
                "{\"latitude\":-34.6,\"longitude\":-58.4}"), 422, "VALIDATION_ERROR");
        assertEquals("PENDIENTE", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, markId.toString()));
        assertNull(jdbc.queryForObject("SELECT latitude FROM mark_events WHERE id=?", java.math.BigDecimal.class, markId.toString()));

        // Previous behaviour kept: a complete body inside the bounds is accepted.
        MvcResult accepted = send(employee, post("/api/v1/marks/{id}/location", markId),
                "{\"latitude\":-34.6,\"longitude\":-58.4,\"accuracyMeters\":12}");
        assertEquals(202, accepted.getResponse().getStatus());
        assertEquals("RECIBIDA", jdbc.queryForObject("SELECT location_status FROM mark_events WHERE id=?", String.class, markId.toString()));
        assertEquals(-34.6, jdbc.queryForObject("SELECT latitude FROM mark_events WHERE id=?", Double.class, markId.toString()), 1e-9);
    }

    // S7: ADMIN event times (forgotten marks, corrections) are bounded: never in the future, within 24 h of the schedule.

    @Test
    void forgottenMarkAndCorrectionRejectFutureOrFarAwayEventTimes() throws Exception {
        Login admin = login(adminDni);
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);

        assertProblem(send(admin, post("/api/v1/admin/jornadas/{id}/forgotten-marks", jornadaId),
                forgottenBody("INGRESO", now.plusSeconds(300))), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post("/api/v1/admin/jornadas/{id}/forgotten-marks", jornadaId),
                forgottenBody("INGRESO", scheduledStart.minus(25, ChronoUnit.HOURS))), 422, "VALIDATION_ERROR");
        assertEquals(0, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", jornadaId.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM forgotten_mark_audits WHERE jornada_id=?", jornadaId.toString()));

        // Previous behaviour kept: a past event time inside the window is accepted.
        Instant ingressAt = scheduledStart.plusSeconds(60);
        MvcResult forgotten = send(admin, post("/api/v1/admin/jornadas/{id}/forgotten-marks", jornadaId), forgottenBody("INGRESO", ingressAt));
        assertEquals(201, forgotten.getResponse().getStatus());
        UUID markId = UUID.fromString(json(forgotten).get("id").asText());

        assertProblem(send(admin, post("/api/v1/admin/marks/{id}/correction", markId),
                correctionBody("INGRESO", now.plusSeconds(300))), 422, "VALIDATION_ERROR");
        assertProblem(send(admin, post("/api/v1/admin/marks/{id}/correction", markId),
                correctionBody("INGRESO", scheduledStart.minus(25, ChronoUnit.HOURS))), 422, "VALIDATION_ERROR");
        assertEquals(ingressAt, jdbc.queryForObject("SELECT occurred_at FROM mark_events WHERE id=?", Timestamp.class, markId.toString()).toInstant());
        assertEquals(0, count("SELECT COUNT(*) FROM mark_correction_audits WHERE mark_id=?", markId.toString()));
    }

    // S7: reachable 500s become stable Problem Details.

    @Test
    void markOfAnAccountDeactivatedAfterTheScopeCheckIsForbidden() {
        ScopeService.Scope scope = new ScopeService.Scope(employeeAccountId, companyId, "EMPLOYEE", false);
        jdbc.update("UPDATE accounts SET active=FALSE WHERE id=?", employeeAccountId.toString());

        ApiException error = assertThrows(ApiException.class,
                () -> marks.recordEmployeeMark(scope, jornadaId, MarkAction.INGRESO, UUID.randomUUID(), Instant.now()));

        assertEquals(403, error.status().value());
        assertEquals("FORBIDDEN", error.code());
        assertEquals(0, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", jornadaId.toString()));
    }

    @Test
    void templateUsedByJornadasCannotMoveToAnotherSite() throws Exception {
        Login admin = login(adminDni);

        MvcResult result = send(admin, patch("/api/v1/templates/{id}", templateId), templateBody(otherSiteId, "Turno", 0, "08:00:00", "16:00:00", 0));

        assertProblem(result, 409, "TEMPLATE_IN_USE");
        assertEquals(siteId.toString(), jdbc.queryForObject("SELECT site_id FROM schedule_templates WHERE id=?", String.class, templateId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM template_blocks WHERE template_id=?", templateId.toString()));

        // Previous behaviour kept: an unused template may move to another site; a used one may keep its site.
        UUID unused = UUID.randomUUID();
        insertTemplate(unused, 0);
        assertEquals(200, send(admin, patch("/api/v1/templates/{id}", unused), templateBody(otherSiteId, "Libre", 0, "09:00:00", "17:00:00", 0)).getResponse().getStatus());
        assertEquals(otherSiteId.toString(), jdbc.queryForObject("SELECT site_id FROM schedule_templates WHERE id=?", String.class, unused.toString()));
        assertEquals(200, send(admin, patch("/api/v1/templates/{id}", templateId), templateBody(siteId, "Turno nuevo", 0, "09:00:00", "17:00:00", 0)).getResponse().getStatus());
    }

    @Test
    void nullBlockTimesAndNullSiteIdsAreValidationErrors() throws Exception {
        Login admin = login(adminDni);

        assertProblem(send(admin, post("/api/v1/templates"), "{\"siteId\":\"" + siteId + "\",\"name\":\"Nulo\",\"blocks\":[{\"startDayOffset\":0,\"start\":null,\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":15,\"lunchLimitMinutes\":30}"),
                422, "VALIDATION_ERROR");
        assertProblem(send(admin, post("/api/v1/templates"), "{\"siteId\":\"" + siteId + "\",\"name\":\"Nulo\",\"blocks\":[null],\"breakfastLimitMinutes\":15,\"lunchLimitMinutes\":30}"),
                422, "VALIDATION_ERROR");
        assertEquals(0, count("SELECT COUNT(*) FROM schedule_templates WHERE company_id=? AND name='Nulo'", companyId.toString()));

        String newDni = "3" + adminDni.substring(1);
        assertProblem(send(admin, post("/api/v1/employees"), "{\"dni\":\"" + newDni + "\",\"displayName\":\"Nueva\",\"siteIds\":[null],\"toleranceMinutes\":10,\"temporaryPassword\":\"TemporaryPass123\"}"),
                422, "VALIDATION_ERROR");
        assertEquals(0, count("SELECT COUNT(*) FROM accounts WHERE dni_normalized=?", newDni));
        assertProblem(send(admin, patch("/api/v1/employees/{id}", employeeId), "{\"siteIds\":[\"" + otherSiteId + "\",null]}"),
                422, "VALIDATION_ERROR");
        assertEquals(1, count("SELECT COUNT(*) FROM employee_sites WHERE employee_id=? AND site_id=?", employeeId.toString(), siteId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM employee_sites WHERE employee_id=?", employeeId.toString()));
    }

    // S7: date ranges cover at most 366 days inclusive.

    @Test
    void jornadaListAcceptsAtMost366DaysInclusive() throws Exception {
        Login admin = login(adminDni);

        assertEquals(200, mockMvc.perform(get("/api/v1/jornadas").param("from", "2028-01-01").param("to", "2028-12-31")
                .cookie(admin.session())).andReturn().getResponse().getStatus());
        assertProblem(mockMvc.perform(get("/api/v1/jornadas").param("from", "2028-01-01").param("to", "2029-01-01")
                .cookie(admin.session())).andReturn(), 422, "VALIDATION_ERROR");
    }

    // S7: the server instant of an employee mark is taken once the locks are held, and history stays chronological.

    @Test
    void employeeMarkTimeIsTakenAfterTheJornadaLockIsReleasedByAnotherTransaction() throws Exception {
        Login employee = login(employeeDni);
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        CountDownLatch locked = new CountDownLatch(1);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        Future<Instant> holder = pool.submit(() -> tx.execute(status -> {
            jdbc.queryForObject("SELECT id FROM jornadas WHERE id=? FOR UPDATE", String.class, jornadaId.toString());
            locked.countDown();
            try { Thread.sleep(1500); } catch (InterruptedException ex) { Thread.currentThread().interrupt(); }
            return Instant.now();
        }));
        assertTrue(locked.await(10, TimeUnit.SECONDS));

        MvcResult result = mark(employee, UUID.randomUUID(), "INGRESO");
        Instant releasedAt = holder.get(15, TimeUnit.SECONDS);
        pool.shutdownNow();

        assertEquals(201, result.getResponse().getStatus());
        Instant occurredAt = jdbc.queryForObject("SELECT occurred_at FROM mark_events WHERE jornada_id=?", Timestamp.class, jornadaId.toString()).toInstant();
        assertFalse(occurredAt.isBefore(releasedAt.truncatedTo(ChronoUnit.MICROS)),
                "mark time " + occurredAt + " must not precede the release of the jornada lock at " + releasedAt);
        assertEquals(occurredAt, Instant.parse(json(result).get("acceptedAt").asText()));
    }

    @Test
    void employeeMarkEarlierThanTheLastStoredMarkIsRejected() throws Exception {
        Instant future = Instant.now().plusSeconds(600).truncatedTo(ChronoUnit.MICROS);
        jdbc.update("INSERT INTO mark_events(id,company_id,jornada_id,sequence_number,timeline_order,action,original_action,occurred_at,original_occurred_at,accepted_at,recorded_at,origin,created_by,location_status) VALUES(?,?,?,1,1000,'INGRESO','INGRESO',?,?,?,?,'ADMIN',?,'NO_APLICA')",
                UUID.randomUUID().toString(), companyId.toString(), jornadaId.toString(), Timestamp.from(future), Timestamp.from(future),
                Timestamp.from(scheduledStart), Timestamp.from(scheduledStart), adminAccountId.toString());
        jdbc.update("UPDATE jornadas SET state='EN_CURSO',next_sequence=2 WHERE id=?", jornadaId.toString());
        Login employee = login(employeeDni);

        MvcResult result = mark(employee, UUID.randomUUID(), "SALIDA_DESAYUNO");

        assertProblem(result, 409, "INVALID_MARK_ORDER");
        assertEquals(1, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", jornadaId.toString()));
        assertEquals("EN_CURSO", jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornadaId.toString()));
    }

    // S7: an idempotent replay returns the current state of the mark, with the original replay status.

    @Test
    void idempotentReplayAfterAnAdminCorrectionReturnsTheCorrectedMark() throws Exception {
        Login employee = login(employeeDni);
        UUID key = UUID.randomUUID();
        MvcResult first = mark(employee, key, "INGRESO");
        assertEquals(201, first.getResponse().getStatus());
        UUID markId = UUID.fromString(json(first).get("id").asText());
        Instant correctedAt = Instant.parse(json(first).get("occurredAt").asText()).minusSeconds(60);
        marks.correctMark(new ScopeService.Scope(adminAccountId, companyId, "ADMIN", false), markId, MarkAction.INGRESO, correctedAt, "Hora corregida");

        MvcResult replay = mark(employee, key, "INGRESO");

        assertEquals(200, replay.getResponse().getStatus());
        assertEquals(markId.toString(), json(replay).get("id").asText());
        assertEquals(correctedAt, Instant.parse(json(replay).get("occurredAt").asText()));
        assertEquals(json(first).get("acceptedAt").asText(), json(replay).get("acceptedAt").asText());
        assertTrue(json(replay).path("latitude").isMissingNode() || json(replay).get("latitude").isNull(), "an employee replay never exposes coordinates");
        assertEquals(1, count("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", jornadaId.toString()));
    }

    private void insertTemplate(UUID id, int firstStartDayOffset) {
        Timestamp ts = Timestamp.from(Instant.now());
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,?,20,30,TRUE,?,?)",
                id.toString(), companyId.toString(), siteId.toString(), "T-" + id.toString().substring(0, 8), ts, ts);
        jdbc.update("INSERT INTO template_blocks(id,company_id,template_id,sequence_number,start_day_offset,starts_at,ends_at,end_day_offset) VALUES(?,?,?,1,?,'08:00:00','16:00:00',?)",
                UUID.randomUUID().toString(), companyId.toString(), id.toString(), firstStartDayOffset, firstStartDayOffset);
    }

    private String templateBody(UUID site, String name, int startDay, String start, String end, int endDay) {
        return "{\"siteId\":\"" + site + "\",\"name\":\"" + name + "\",\"blocks\":[{\"startDayOffset\":" + startDay + ",\"start\":\"" + start
                + "\",\"end\":\"" + end + "\",\"endDayOffset\":" + endDay + "}],\"breakfastLimitMinutes\":15,\"lunchLimitMinutes\":30}";
    }

    private String declareBody(UUID template, String localDate) {
        return "{\"employeeId\":\"" + employeeId + "\",\"siteId\":\"" + siteId + "\",\"localDate\":\"" + localDate + "\",\"templateId\":\"" + template + "\"}";
    }

    private String forgottenBody(String action, Instant occurredAt) {
        return "{\"action\":\"" + action + "\",\"occurredAt\":\"" + occurredAt + "\",\"auditReason\":\"Olvido\"}";
    }

    private String correctionBody(String action, Instant occurredAt) {
        return "{\"correctedAction\":\"" + action + "\",\"correctedOccurredAt\":\"" + occurredAt + "\",\"auditReason\":\"Corrección\"}";
    }

    private MvcResult mark(Login login, UUID key, String action) throws Exception {
        return mockMvc.perform(post("/api/v1/jornadas/{id}/marks", jornadaId).cookie(login.session())
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

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private int count(String sql, Object... args) {
        Integer result = jdbc.queryForObject(sql, Integer.class, args);
        return result == null ? 0 : result;
    }

    private record Login(Cookie session, String csrf) { }
}
