package com.braja.fichaje.security;

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
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

/**
 * Login and session hardening (issue #41, audit 2026-10-27). The pool is deliberately tiny: a login that needs a second
 * pooled connection while holding the first starves it (2026-10-27: 12 concurrent logins blocked a 12-connection pool ~30 s).
 */
@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class LoginHardeningMySqlTest {
    private static final String AES_KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.US_ASCII));
    private static final String PASSWORD = "valid-password-123";
    private static final int POOL_SIZE = 2;

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja_login_hardening")
            .withUsername("braja_test")
            .withPassword("braja_test_password");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", MYSQL::getJdbcUrl);
        registry.add("spring.datasource.username", MYSQL::getUsername);
        registry.add("spring.datasource.password", MYSQL::getPassword);
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> Integer.toString(POOL_SIZE));
        registry.add("spring.datasource.hikari.connection-timeout", () -> "4000");
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
    private String passwordHash;

    @BeforeEach
    void cleanDatabase() {
        jdbc.update("DELETE FROM login_ip_throttles");
        jdbc.update("DELETE FROM login_throttles");
        jdbc.update("DELETE FROM SPRING_SESSION");
        jdbc.update("DELETE FROM company_memberships");
        jdbc.update("DELETE FROM accounts");
        jdbc.update("DELETE FROM companies");
        companyId = UUID.randomUUID();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), "Empresa login", Timestamp.from(Instant.now()));
        if (passwordHash == null) passwordHash = passwordEncoder.encode(PASSWORD);
    }

    @Test
    void concurrentLoginsBeyondThePoolSizeCompleteWithoutStarvingThePool() throws Exception {
        int logins = POOL_SIZE * 3;
        List<String> dnis = new ArrayList<>();
        for (int index = 0; index < logins; index++) {
            String dni = "4100000" + index;
            account(dni);
            dnis.add(dni);
        }
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(logins);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (String dni : dnis) {
                results.add(executor.submit(() -> {
                    start.await();
                    return login(dni, PASSWORD).getResponse().getStatus();
                }));
            }
            start.countDown();
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> result : results) statuses.add(result.get(60, TimeUnit.SECONDS));
            assertEquals(java.util.Collections.nCopies(logins, 200), statuses,
                    "Every login must succeed with a pool of " + POOL_SIZE + " connections");
        } finally {
            executor.shutdownNow();
        }
        assertEquals(0, count("SELECT COUNT(*) FROM login_throttles"), "Successful logins leave no failed attempts");
    }

    @Test
    void databaseFailureDuringAuthenticationAnswers503AndIsNotCountedAsAFailedAttempt() throws Exception {
        String dni = "42000001";
        account(dni);
        MvcResult unavailable;
        jdbc.execute("RENAME TABLE accounts TO accounts_unavailable");
        try {
            unavailable = login(dni, PASSWORD);
        } finally {
            jdbc.execute("RENAME TABLE accounts_unavailable TO accounts");
        }
        assertEquals(503, unavailable.getResponse().getStatus(), unavailable.getResponse().getContentAsString());
        assertEquals("AUTHENTICATION_UNAVAILABLE", body(unavailable).path("code").asText());
        assertEquals(0, count("SELECT COALESCE(SUM(failed_attempts),0) FROM login_throttles"),
                "An infrastructure failure is not a wrong password for the DNI throttle");
        assertEquals(0, count("SELECT COUNT(*) FROM login_ip_throttles"),
                "An infrastructure failure is not a wrong password for the IP throttle");

        MvcResult wrong = login(dni, "wrong-password");
        assertEquals(401, wrong.getResponse().getStatus());
        assertEquals("UNAUTHORIZED", body(wrong).path("code").asText());
        assertEquals("Invalid DNI or password", body(wrong).path("detail").asText());
        assertEquals(1, count("SELECT COALESCE(SUM(failed_attempts),0) FROM login_throttles"));
        assertEquals(1, count("SELECT COALESCE(SUM(failed_attempts),0) FROM login_ip_throttles"));
        assertEquals(200, login(dni, PASSWORD).getResponse().getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM login_throttles"), "A successful login still resets the DNI counter");
    }

    @Test
    void loginRotatesTheCsrfTokenSoThePreLoginTokenIsRejected() throws Exception {
        String dni = "43000001";
        account(dni);
        MvcResult csrf = mockMvc.perform(get("/api/v1/csrf")).andReturn();
        String preLoginToken = body(csrf).get("token").asText();
        Cookie anonymous = new Cookie("BRAJA_SESSION", cookieValue(csrf, "BRAJA_SESSION"));
        MvcResult login = mockMvc.perform(post("/api/v1/session")
                        .cookie(anonymous).header("X-CSRF-TOKEN", preLoginToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dni\":\"" + dni + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andReturn();
        assertEquals(200, login.getResponse().getStatus());
        Cookie session = new Cookie("BRAJA_SESSION", cookieValue(login, "BRAJA_SESSION"));
        assertNotEquals(anonymous.getValue(), session.getValue(), "Login keeps changing the session id");

        MvcResult stale = selectCompany(session, preLoginToken);
        assertEquals(403, stale.getResponse().getStatus(), "The pre-login CSRF token must not survive login");
        assertEquals("FORBIDDEN", body(stale).path("code").asText());

        String postLoginToken = csrfToken(session);
        assertNotEquals(preLoginToken, postLoginToken);
        assertEquals(200, selectCompany(session, postLoginToken).getResponse().getStatus());

        MvcResult logout = mockMvc.perform(delete("/api/v1/session").cookie(session).header("X-CSRF-TOKEN", postLoginToken)).andReturn();
        assertEquals(204, logout.getResponse().getStatus(), "Logout keeps working with the rotated token");
        assertEquals(401, mockMvc.perform(get("/api/v1/session").cookie(session)).andReturn().getResponse().getStatus());
    }

    @Test
    void concurrentWrongLoginsVerifyAtMostFivePasswordsForOneDni() throws Exception {
        String dni = "44000001";
        account(dni);
        int attempts = 10;
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(attempts);
        List<Integer> statuses = new ArrayList<>();
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int index = 0; index < attempts; index++) {
                results.add(executor.submit(() -> {
                    start.await();
                    return login(dni, "wrong-password").getResponse().getStatus();
                }));
            }
            start.countDown();
            for (Future<Integer> result : results) statuses.add(result.get(60, TimeUnit.SECONDS));
        } finally {
            executor.shutdownNow();
        }
        long verified = statuses.stream().filter(status -> status == 401).count();
        long limited = statuses.stream().filter(status -> status == 429).count();
        assertEquals(attempts, verified + limited, "Only 401 or 429 are acceptable: " + statuses);
        assertEquals(5, verified, "At most five wrong passwords may be verified per DNI window: " + statuses);
        Map<String, Object> row = jdbc.queryForMap("SELECT failed_attempts, locked_until FROM login_throttles");
        assertEquals(5, ((Number) row.get("failed_attempts")).intValue());
        assertNotNull(row.get("locked_until"));
        assertEquals(429, login(dni, PASSWORD).getResponse().getStatus(), "The locked DNI rejects even the right password");
    }

    @Test
    void wrongCurrentPasswordIsThrottledLikeLoginAndHasADistinctCode() throws Exception {
        String dni = "45000001";
        account(dni);
        MvcResult login = login(dni, PASSWORD);
        assertEquals(200, login.getResponse().getStatus());
        Cookie session = new Cookie("BRAJA_SESSION", cookieValue(login, "BRAJA_SESSION"));
        String token = csrfToken(session);

        for (int attempt = 1; attempt <= 5; attempt++) {
            MvcResult wrong = changePassword(session, token, "wrong-current-password");
            assertEquals(401, wrong.getResponse().getStatus());
            assertEquals("CURRENT_PASSWORD_INVALID", body(wrong).path("code").asText());
        }
        MvcResult locked = changePassword(session, token, PASSWORD);
        assertEquals(429, locked.getResponse().getStatus());
        assertEquals("TOO_MANY_REQUESTS", body(locked).path("code").asText());
        assertTrue(Long.parseLong(locked.getResponse().getHeader("Retry-After")) > 0);
        assertEquals(429, login(dni, PASSWORD).getResponse().getStatus(), "Password change and login share the DNI throttle");
        assertEquals(200, mockMvc.perform(get("/api/v1/session").cookie(session)).andReturn().getResponse().getStatus(),
                "A wrong current password does not end the session");

        jdbc.update("DELETE FROM login_throttles");
        assertEquals(204, changePassword(session, token, PASSWORD).getResponse().getStatus());
        assertEquals(0, count("SELECT COUNT(*) FROM login_throttles"), "A verified current password resets the DNI counter");
        assertEquals(200, login(dni, "replacement-password-456").getResponse().getStatus());
    }

    @Test
    void mutationWithoutAnAuthenticatedSessionIs401WhileCsrfMismatchOnALiveSessionStays403() throws Exception {
        String dni = "46000001";
        account(dni);
        MvcResult login = login(dni, PASSWORD);
        Cookie session = new Cookie("BRAJA_SESSION", cookieValue(login, "BRAJA_SESSION"));
        String token = csrfToken(session);

        MvcResult mismatch = selectCompany(session, "not-the-session-csrf-token");
        assertEquals(403, mismatch.getResponse().getStatus());
        assertEquals("FORBIDDEN", body(mismatch).path("code").asText());
        MvcResult missing = mockMvc.perform(put("/api/v1/companies/active").cookie(session)
                .contentType(MediaType.APPLICATION_JSON).content("{\"companyId\":\"" + companyId + "\"}")).andReturn();
        assertEquals(403, missing.getResponse().getStatus(), "A live session without a CSRF token stays 403");

        jdbc.update("DELETE FROM SPRING_SESSION");
        MvcResult expired = selectCompany(session, token);
        assertEquals(401, expired.getResponse().getStatus(), expired.getResponse().getContentAsString());
        assertEquals("SESSION_EXPIRED", body(expired).path("code").asText());

        MvcResult absent = mockMvc.perform(put("/api/v1/companies/active").header("X-CSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"companyId\":\"" + companyId + "\"}")).andReturn();
        assertEquals(401, absent.getResponse().getStatus());
        assertEquals("SESSION_EXPIRED", body(absent).path("code").asText());
    }

    private void account(String dni) {
        UUID accountId = UUID.randomUUID();
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                accountId.toString(), dni, dni, passwordHash, now, now);
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'ADMIN',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), accountId.toString(), now);
    }

    private MvcResult login(String dni, String password) throws Exception {
        MvcResult csrf = mockMvc.perform(get("/api/v1/csrf")).andReturn();
        String token = body(csrf).get("token").asText();
        return mockMvc.perform(post("/api/v1/session")
                        .cookie(new Cookie("BRAJA_SESSION", cookieValue(csrf, "BRAJA_SESSION")))
                        .header("X-CSRF-TOKEN", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dni\":\"" + dni + "\",\"password\":\"" + password + "\"}"))
                .andReturn();
    }

    private String csrfToken(Cookie session) throws Exception {
        MvcResult csrf = mockMvc.perform(get("/api/v1/csrf").cookie(session)).andReturn();
        assertEquals(200, csrf.getResponse().getStatus());
        return body(csrf).get("token").asText();
    }

    private MvcResult selectCompany(Cookie session, String token) throws Exception {
        return mockMvc.perform(put("/api/v1/companies/active").cookie(session).header("X-CSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"companyId\":\"" + companyId + "\"}")).andReturn();
    }

    private MvcResult changePassword(Cookie session, String token, String currentPassword) throws Exception {
        return mockMvc.perform(put("/api/v1/session/password").cookie(session).header("X-CSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"currentPassword\":\"" + currentPassword + "\",\"newPassword\":\"replacement-password-456\"}")).andReturn();
    }

    private String cookieValue(MvcResult result, String name) {
        String header = result.getResponse().getHeaders("Set-Cookie").stream()
                .filter(value -> value.startsWith(name + "="))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Missing " + name + " Set-Cookie header"));
        return header.split(";", 2)[0].substring(name.length() + 1);
    }

    private JsonNode body(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private int count(String sql) {
        Integer value = jdbc.queryForObject(sql, Integer.class);
        return value == null ? 0 : value;
    }
}
