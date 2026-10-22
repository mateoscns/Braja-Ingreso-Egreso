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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.time.Instant;
import java.util.Base64;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
class LoginThrottleByIpMySqlTest {
    private static final String AES_KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    private static final String KNOWN_DNI = "12345678";

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja_login_ip")
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
        registry.add("braja.login-ip-throttle-max-failures", () -> "2");
        registry.add("braja.login-ip-throttle-window", () -> "15m");
        registry.add("braja.login-ip-throttle-lock-duration", () -> "15m");
        registry.add("braja.trusted-proxy-cidrs", () -> "10.0.0.0/8");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired com.braja.fichaje.config.BrajaProperties brajaProperties;
    @Autowired ClientAddressResolver clientAddressResolver;
    @Autowired PrivacyRetentionScheduler privacyRetentionScheduler;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    @BeforeEach
    void createKnownAccount() {
        jdbc.update("DELETE FROM login_ip_throttles");
        jdbc.update("DELETE FROM login_throttles");
        jdbc.update("DELETE FROM company_memberships");
        jdbc.update("DELETE FROM accounts");
        jdbc.update("DELETE FROM companies");
        UUID companyId = UUID.randomUUID();
        UUID accountId = UUID.randomUUID();
        Instant now = Instant.now();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), "Empresa login", java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                accountId.toString(), KNOWN_DNI, KNOWN_DNI, passwordEncoder.encode("valid-password-123"), java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'ADMIN',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), accountId.toString(), java.sql.Timestamp.from(now));
    }

    @Test
    void throttlesAcrossDnisAndTrustsForwardedAddressesOnlyFromConfiguredProxies() throws Exception {
        assertEquals(2, brajaProperties.getLoginIpThrottleMaxFailures(), "The integration test configures a low IP threshold");
        MvcResult knownDniFailure = login(KNOWN_DNI, "wrong-password", "198.51.100.100", null);
        MvcResult unknownDniFailure = login("87654321", "wrong-password", "198.51.100.101", null);
        assertEquals(401, knownDniFailure.getResponse().getStatus());
        assertEquals(401, unknownDniFailure.getResponse().getStatus());
        JsonNode knownError = objectMapper.readTree(knownDniFailure.getResponse().getContentAsString());
        JsonNode unknownError = objectMapper.readTree(unknownDniFailure.getResponse().getContentAsString());
        assertEquals(knownError.path("code").asText(), unknownError.path("code").asText());
        assertEquals(knownError.path("detail").asText(), unknownError.path("detail").asText());

        for (int attempt = 0; attempt < 4; attempt++) {
            assertEquals(401, login(KNOWN_DNI, "wrong-password", "198.51.100." + (102 + attempt), null).getResponse().getStatus());
        }
        assertEquals(429, login(KNOWN_DNI, "wrong-password", "198.51.100.106", null).getResponse().getStatus(),
                "The existing per-DNI limit remains active across different addresses");

        String untrustedAddress = "192.0.2.10";
        assertEquals(401, login("60000001", "wrong-password", untrustedAddress, "203.0.113.1").getResponse().getStatus());
        assertEquals(401, login("60000002", "wrong-password", untrustedAddress, "203.0.113.2").getResponse().getStatus());
        int rowsBeforeBlockedAttempt = jdbc.queryForObject("SELECT COUNT(*) FROM login_ip_throttles", Integer.class);
        MvcResult repeatedUntrustedAddress = login("60000003", "wrong-password", untrustedAddress, "203.0.113.3");
        assertEquals(429, repeatedUntrustedAddress.getResponse().getStatus(),
                "Untrusted X-Forwarded-For must not split one client into many counters: "
                        + jdbc.queryForList("SELECT ip_hash,failed_attempts,locked_until FROM login_ip_throttles"));
        assertEquals(rowsBeforeBlockedAttempt, jdbc.queryForObject("SELECT COUNT(*) FROM login_ip_throttles", Integer.class));
        assertEquals(401, login("60000004", "wrong-password", "192.0.2.11", "203.0.113.1").getResponse().getStatus(),
                "A different direct client must have an independent counter");

        String trustedProxy = "10.20.0.1";
        assertEquals(401, login("70000001", "wrong-password", trustedProxy, "203.0.113.50").getResponse().getStatus());
        assertEquals(401, login("70000002", "wrong-password", trustedProxy, "203.0.113.51").getResponse().getStatus(),
                "A trusted proxy may identify separate client addresses");
        assertEquals(401, login("70000003", "wrong-password", trustedProxy, "203.0.113.50").getResponse().getStatus());
        assertEquals(429, login("70000004", "wrong-password", trustedProxy, "203.0.113.50").getResponse().getStatus());
        assertTrue(jdbc.queryForObject("SELECT COUNT(*) FROM login_ip_throttles", Integer.class) >= 5,
                "IP throttle state must be persisted in MySQL");
    }

    @Test
    void purgesExpiredIpThrottleRowsButKeepsActiveLocks() {
        Instant now = Instant.now();
        Instant old = now.minus(java.time.Duration.ofDays(2));
        String expiredHash = "expired-test-hash";
        String lockedHash = "active-lock-test-hash";
        jdbc.update("INSERT INTO login_ip_throttles(ip_hash,window_started_at,failed_attempts,locked_until,updated_at) VALUES(?,?,1,NULL,?)",
                expiredHash, java.sql.Timestamp.from(old), java.sql.Timestamp.from(old));
        jdbc.update("INSERT INTO login_ip_throttles(ip_hash,window_started_at,failed_attempts,locked_until,updated_at) VALUES(?,?,2,?,?)",
                lockedHash, java.sql.Timestamp.from(old), java.sql.Timestamp.from(now.plusSeconds(3600)), java.sql.Timestamp.from(old));

        privacyRetentionScheduler.purgeSensitiveData();

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM login_ip_throttles WHERE ip_hash=?", Integer.class, expiredHash));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM login_ip_throttles WHERE ip_hash=?", Integer.class, lockedHash));
    }

    private MvcResult login(String dni, String password, String remoteAddress, String forwardedFor) throws Exception {
        MvcResult csrfResponse = mockMvc.perform(get("/api/v1/csrf")
                        .with(request -> { request.setRemoteAddr(remoteAddress); return request; }))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode csrfBody = objectMapper.readTree(csrfResponse.getResponse().getContentAsString());
        String csrfToken = csrfBody.get("token").asText();
        String sessionCookie = csrfResponse.getResponse().getHeaders("Set-Cookie").stream()
                .filter(header -> header.startsWith("BRAJA_SESSION="))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Missing BRAJA_SESSION cookie"))
                .split(";", 2)[0].substring("BRAJA_SESSION=".length());

        var request = post("/api/v1/session")
                .with(servletRequest -> {
                    servletRequest.setRemoteAddr(remoteAddress);
                    if (!remoteAddress.startsWith("10.")) {
                        assertEquals(remoteAddress, clientAddressResolver.resolve(servletRequest));
                    }
                    return servletRequest;
                })
                .cookie(new Cookie("BRAJA_SESSION", sessionCookie), new Cookie("BRAJA_CSRF", csrfToken))
                .header("X-CSRF-TOKEN", csrfToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new LoginPayload(dni, password)));
        if (forwardedFor != null) request.header("X-Forwarded-For", forwardedFor);
        return mockMvc.perform(request).andReturn();
    }

    private record LoginPayload(String dni, String password) { }
}
