package com.braja.fichaje;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.annotation.DirtiesContext;
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
import java.util.List;
import java.util.UUID;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PasswordChangeSessionInvalidationMySqlTest {
    private static final String AES_KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private static final String DNI = "12345678";
    private static final String OLD_PASSWORD = "initial-password-123";
    private static final String NEW_PASSWORD = "replacement-password-456";

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
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    @Test
    void changingPasswordRevokesOtherSessionsAndPreservesTheCurrentSession() throws Exception {
        UUID companyId = UUID.randomUUID();
        UUID accountId = UUID.randomUUID();
        Instant now = Instant.now();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), "Empresa de prueba", java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                accountId.toString(), DNI, DNI, passwordEncoder.encode(OLD_PASSWORD), java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'ADMIN',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), accountId.toString(), java.sql.Timestamp.from(now));

        HttpLogin current = loginOverHttp();
        HttpLogin other = loginOverHttp();
        String currentSessionId = sessionId(current.sessionCookie());
        String otherSessionId = sessionId(other.sessionCookie());
        assertNotEquals(currentSessionId, otherSessionId);
        List<String> storedSessionIds = jdbc.queryForList("SELECT SESSION_ID FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?", String.class, DNI);
        assertEquals(2, storedSessionIds.size());
        assertEquals(1, storedSessionIds.stream().filter(currentSessionId::equals).count(), "Current cookie must identify its stored session: " + storedSessionIds);
        assertEquals(1, storedSessionIds.stream().filter(otherSessionId::equals).count(), "Other cookie must identify its stored session: " + storedSessionIds);

        mockMvc.perform(put("/api/v1/session/password")
                        .cookie(current.sessionCookie(), new Cookie("BRAJA_CSRF", current.csrfToken()))
                        .header("X-CSRF-TOKEN", current.csrfToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\":\"" + OLD_PASSWORD + "\",\"newPassword\":\"" + NEW_PASSWORD + "\"}"))
                .andExpect(status().isNoContent());

        List<String> storedSessionIdsAfterChange = jdbc.queryForList("SELECT SESSION_ID FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?", String.class, DNI);
        assertEquals(List.of(currentSessionId), storedSessionIdsAfterChange);
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM SPRING_SESSION WHERE SESSION_ID=?", Integer.class, otherSessionId));
        mockMvc.perform(get("/api/v1/session").cookie(current.sessionCookie())).andExpect(status().isOk());
        mockMvc.perform(get("/api/v1/session").cookie(other.sessionCookie())).andExpect(status().isUnauthorized());
        loginOverHttp(NEW_PASSWORD);
    }

    private HttpLogin loginOverHttp() throws Exception { return loginOverHttp(OLD_PASSWORD); }

    private HttpLogin loginOverHttp(String password) throws Exception {
        MvcResult csrfResponse = mockMvc.perform(get("/api/v1/csrf")).andExpect(status().isOk()).andReturn();
        JsonNode csrfBody = objectMapper.readTree(csrfResponse.getResponse().getContentAsString());
        String csrfToken = csrfBody.get("token").asText();
        String anonymousSessionId = cookieValue(setCookieHeader(csrfResponse, "BRAJA_SESSION"));

        MvcResult loginResponse = mockMvc.perform(post("/api/v1/session")
                        .cookie(new Cookie("BRAJA_SESSION", anonymousSessionId), new Cookie("BRAJA_CSRF", csrfToken))
                        .header("X-CSRF-TOKEN", csrfToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dni\":\"" + DNI + "\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return new HttpLogin(new Cookie("BRAJA_SESSION", cookieValue(setCookieHeader(loginResponse, "BRAJA_SESSION"))), csrfToken);
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

    private String sessionId(Cookie cookie) {
        return new String(Base64.getUrlDecoder().decode(cookie.getValue()), StandardCharsets.UTF_8);
    }

    private record HttpLogin(Cookie sessionCookie, String csrfToken) { }
}
