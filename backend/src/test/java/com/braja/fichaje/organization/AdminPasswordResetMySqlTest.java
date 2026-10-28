package com.braja.fichaje.organization;

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
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Issue #54 (D-20261027-09): an ADMIN resets the password of an employee that belongs only to the active company. */
@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class AdminPasswordResetMySqlTest {
    private static final String AES_KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.US_ASCII));
    private static final String ADMIN_PASSWORD = "admin-password-123";
    private static final String EMPLOYEE_PASSWORD = "employee-password-123";
    private static final String OTHER_COMPANY_NAME = "Empresa Vecina Secreta";

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
    @Autowired PasswordEncoder passwordEncoder;

    private UUID companyId;
    private UUID otherCompanyId;
    private UUID adminAccountId;
    private String adminDni;
    private HttpLogin admin;

    @BeforeEach
    void companiesAndAdmin() throws Exception {
        jdbc.update("DELETE FROM login_throttles");
        jdbc.update("DELETE FROM login_ip_throttles");
        companyId = company("Braja " + UUID.randomUUID());
        otherCompanyId = company(OTHER_COMPANY_NAME + " " + UUID.randomUUID());
        adminDni = uniqueDni();
        adminAccountId = account(adminDni, ADMIN_PASSWORD, false, true);
        membership(companyId, adminAccountId, "ADMIN", true);
        admin = login(adminDni, ADMIN_PASSWORD);
    }

    @Test
    void resetShowsTemporaryPasswordOnceRevokesSessionsClearsThrottleAuditsAndForcesChange() throws Exception {
        String dni = uniqueDni();
        UUID accountId = account(dni, EMPLOYEE_PASSWORD, false, true);
        UUID employeeId = employee(companyId, accountId, true);
        HttpLogin employeeSession = login(dni, EMPLOYEE_PASSWORD);
        String hashBefore = passwordHash(accountId);
        for (int attempt = 0; attempt < 5; attempt++) loginExpecting(dni, "wrong-password-0000", 401);
        loginExpecting(dni, EMPLOYEE_PASSWORD, 429); // the DNI is locked before the reset
        assertEquals(1, throttleRows());
        assertEquals(1, sessions(dni));

        MvcResult result = reset(admin, employeeId)
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")))
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        assertEquals(1, body.size(), "the response only carries the temporary password: " + body);
        String temporary = body.get("temporaryPassword").asText();
        assertTrue(temporary.length() >= 12 && temporary.length() <= 256, "policy length");

        String hashAfter = passwordHash(accountId);
        assertNotEquals(hashBefore, hashAfter);
        assertTrue(passwordEncoder.matches(temporary, hashAfter));
        assertTrue(jdbc.queryForObject("SELECT must_change_password FROM accounts WHERE id=?", Boolean.class, accountId.toString()));
        assertEquals(0, sessions(dni), "every session of the employee is closed");
        assertEquals(0, throttleRows(), "the DNI lock is cleared so the employee can sign in");
        assertEquals(1, sessions(adminDni), "the ADMIN keeps the session");
        List<Map<String, Object>> audits = jdbc.queryForList("SELECT company_id,employee_id,account_id,actor_account_id FROM password_reset_audits WHERE account_id=?", accountId.toString());
        assertEquals(List.of(Map.of("company_id", companyId.toString(), "employee_id", employeeId.toString(),
                "account_id", accountId.toString(), "actor_account_id", adminAccountId.toString())), audits);
        assertNoStoredPlaintext(temporary);

        mockMvc.perform(get("/api/v1/session").cookie(employeeSession.sessionCookie())).andExpect(status().isUnauthorized());
        HttpLogin renewed = login(dni, temporary);
        mockMvc.perform(get("/api/v1/session").cookie(renewed.sessionCookie()))
                .andExpect(status().isOk()).andExpect(jsonPath("$.mustChangePassword").value(true));
        mockMvc.perform(get("/api/v1/sites").cookie(renewed.sessionCookie()))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("PASSWORD_CHANGE_REQUIRED"));
        mockMvc.perform(put("/api/v1/session/password").cookie(renewed.sessionCookie()).header("X-CSRF-TOKEN", renewed.csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + temporary + "\",\"newPassword\":\"chosen-by-employee-1\"}"))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/v1/sites").cookie(renewed.sessionCookie())).andExpect(status().isOk());
        loginExpecting(dni, EMPLOYEE_PASSWORD, 401);
    }

    @Test
    void accountWithMembershipInAnotherCompanyIsRejectedWithoutNamingItAndNothingChanges() throws Exception {
        String dni = uniqueDni();
        UUID accountId = account(dni, EMPLOYEE_PASSWORD, false, true);
        UUID employeeId = employee(companyId, accountId, true);
        membership(otherCompanyId, accountId, "EMPLOYEE", false); // even an inactive membership elsewhere rejects
        login(dni, EMPLOYEE_PASSWORD);
        Snapshot before = snapshot(accountId, dni);

        String body = reset(admin, employeeId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("ACCOUNT_SHARED"))
                .andReturn().getResponse().getContentAsString();
        assertFalse(body.contains(OTHER_COMPANY_NAME) || body.contains(otherCompanyId.toString()), body);
        assertEquals(before, snapshot(accountId, dni));
    }

    @Test
    void accountWithAdminRoleIsRejectedAndNothingChanges() throws Exception {
        String dni = uniqueDni();
        UUID accountId = account(dni, EMPLOYEE_PASSWORD, false, true);
        membership(companyId, accountId, "ADMIN", true);
        UUID employeeId = UUID.randomUUID(); // an employee row whose membership in this company is ADMIN
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,5,TRUE,?,?)",
                employeeId.toString(), companyId.toString(), accountId.toString(), "Encargada", now(), now());
        login(dni, EMPLOYEE_PASSWORD);
        Snapshot before = snapshot(accountId, dni);

        reset(admin, employeeId).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ACCOUNT_SHARED"));
        assertEquals(before, snapshot(accountId, dni));
    }

    @Test
    void employeeOfAnotherCompanyIsNotFoundAndNothingChanges() throws Exception {
        String dni = uniqueDni();
        UUID accountId = account(dni, EMPLOYEE_PASSWORD, false, true);
        UUID employeeId = employee(otherCompanyId, accountId, true);
        Snapshot before = snapshot(accountId, dni);

        reset(admin, employeeId).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("NOT_FOUND"));
        assertEquals(before, snapshot(accountId, dni));
    }

    @Test
    void inactiveEmployeeIsRejectedAndNothingChanges() throws Exception {
        String dni = uniqueDni();
        UUID accountId = account(dni, EMPLOYEE_PASSWORD, false, true);
        UUID employeeId = employee(companyId, accountId, false);
        Snapshot before = snapshot(accountId, dni);

        reset(admin, employeeId).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("EMPLOYEE_INACTIVE"));
        assertEquals(before, snapshot(accountId, dni));
    }

    @Test
    void employeeCallerIsForbiddenAndAMissingCsrfTokenIsRejected() throws Exception {
        String dni = uniqueDni();
        UUID accountId = account(dni, EMPLOYEE_PASSWORD, false, true);
        UUID employeeId = employee(companyId, accountId, true);
        HttpLogin employeeSession = login(dni, EMPLOYEE_PASSWORD);
        Snapshot before = snapshot(accountId, dni);

        reset(employeeSession, employeeId).andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
        mockMvc.perform(post("/api/v1/employees/{id}/password-reset", employeeId).cookie(admin.sessionCookie()))
                .andExpect(status().isForbidden());
        assertEquals(before, snapshot(accountId, dni));
    }

    private ResultActions reset(HttpLogin caller, UUID employeeId) throws Exception {
        return mockMvc.perform(post("/api/v1/employees/{id}/password-reset", employeeId)
                .cookie(caller.sessionCookie()).header("X-CSRF-TOKEN", caller.csrfToken()));
    }

    /** No character or binary column of the schema may hold the temporary password in plaintext. */
    private void assertNoStoredPlaintext(String temporary) {
        List<Map<String, Object>> columns = jdbc.queryForList("SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() " +
                "AND DATA_TYPE IN ('char','varchar','text','mediumtext','longtext','blob','mediumblob','longblob','varbinary','binary','json')");
        assertFalse(columns.isEmpty());
        for (Map<String, Object> column : columns) {
            String sql = "SELECT COUNT(*) FROM `" + column.get("TABLE_NAME") + "` WHERE INSTR(CAST(`" + column.get("COLUMN_NAME") + "` AS BINARY), CAST(? AS BINARY)) > 0";
            assertEquals(0, jdbc.queryForObject(sql, Integer.class, temporary), "plaintext found in " + column);
        }
    }

    private Snapshot snapshot(UUID accountId, String dni) {
        Map<String, Object> account = jdbc.queryForMap("SELECT password_hash, must_change_password FROM accounts WHERE id=?", accountId.toString());
        return new Snapshot(String.valueOf(account.get("password_hash")), String.valueOf(account.get("must_change_password")), sessions(dni),
                jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_audits", Integer.class));
    }

    private int sessions(String dni) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?", Integer.class, dni);
    }

    private int throttleRows() { return jdbc.queryForObject("SELECT COUNT(*) FROM login_throttles", Integer.class); }

    private String passwordHash(UUID accountId) {
        return jdbc.queryForObject("SELECT password_hash FROM accounts WHERE id=?", String.class, accountId.toString());
    }

    private UUID company(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", id.toString(), name, now());
        return id;
    }

    private UUID account(String dni, String password, boolean mustChange, boolean active) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                id.toString(), dni, dni, passwordEncoder.encode(password), mustChange, active, now(), now());
        return id;
    }

    private void membership(UUID company, UUID accountId, String role, boolean active) {
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,?,?,?)",
                UUID.randomUUID().toString(), company.toString(), accountId.toString(), role, active, now());
    }

    private UUID employee(UUID company, UUID accountId, boolean active) {
        membership(company, accountId, "EMPLOYEE", active);
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,5,?,?,?)",
                id.toString(), company.toString(), accountId.toString(), "Empleada", active, now(), now());
        return id;
    }

    private static String uniqueDni() {
        return String.valueOf(10_000_000L + (Math.abs(UUID.randomUUID().getMostSignificantBits()) % 89_999_999L));
    }

    private static Timestamp now() { return Timestamp.from(Instant.now()); }

    private void loginExpecting(String dni, String password, int expectedStatus) throws Exception {
        Csrf csrf = anonymousCsrf();
        mockMvc.perform(post("/api/v1/session").cookie(csrf.session(), new Cookie("BRAJA_CSRF", csrf.token())).header("X-CSRF-TOKEN", csrf.token())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"dni\":\"" + dni + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().is(expectedStatus));
    }

    private HttpLogin login(String dni, String password) throws Exception {
        Csrf csrf = anonymousCsrf();
        MvcResult loginResponse = mockMvc.perform(post("/api/v1/session")
                        .cookie(csrf.session(), new Cookie("BRAJA_CSRF", csrf.token()))
                        .header("X-CSRF-TOKEN", csrf.token())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dni\":\"" + dni + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        Cookie sessionCookie = new Cookie("BRAJA_SESSION", cookieValue(setCookieHeader(loginResponse, "BRAJA_SESSION")));
        MvcResult authenticatedCsrf = mockMvc.perform(get("/api/v1/csrf").cookie(sessionCookie)).andExpect(status().isOk()).andReturn();
        return new HttpLogin(sessionCookie, objectMapper.readTree(authenticatedCsrf.getResponse().getContentAsString()).get("token").asText());
    }

    private Csrf anonymousCsrf() throws Exception {
        MvcResult csrfResponse = mockMvc.perform(get("/api/v1/csrf")).andExpect(status().isOk()).andReturn();
        String token = objectMapper.readTree(csrfResponse.getResponse().getContentAsString()).get("token").asText();
        return new Csrf(new Cookie("BRAJA_SESSION", cookieValue(setCookieHeader(csrfResponse, "BRAJA_SESSION"))), token);
    }

    private static String setCookieHeader(MvcResult result, String cookieName) {
        return result.getResponse().getHeaders("Set-Cookie").stream()
                .filter(value -> value.startsWith(cookieName + "="))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Missing " + cookieName + " Set-Cookie header"));
    }

    private static String cookieValue(String setCookieHeader) {
        String pair = setCookieHeader.split(";", 2)[0];
        return pair.substring(pair.indexOf('=') + 1);
    }

    private record HttpLogin(Cookie sessionCookie, String csrfToken) { }
    private record Csrf(Cookie session, String token) { }
    private record Snapshot(String passwordHash, String mustChange, int sessions, int audits) { }
}
