package com.braja.fichaje.ops;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
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
import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * CLAUDE.md rule 32: the deploy gates on GET /api/v1/health (2026-11-02, issue #81: there was no health endpoint and no
 * actuator). Anonymous, no CSRF, no session, no data; 503 problem+json when MySQL cannot answer. The last test stops the
 * container, so the order is fixed.
 */
@Testcontainers
@SpringBootTest(properties = {"braja.scheduling.enabled=false", "spring.datasource.hikari.connection-timeout=2000"})
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class HealthEndpointMySqlTest {
    private static final String AES_KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(StandardCharsets.US_ASCII));

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

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @Test
    @Order(1)
    void anonymousRequestWithoutCsrfOrSessionGetsUpAndCreatesNoSession() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/v1/health")).andReturn();

        assertEquals(200, result.getResponse().getStatus());
        assertEquals("{\"status\":\"UP\"}", result.getResponse().getContentAsString());
        assertTrue(result.getResponse().getContentType().startsWith("application/json"));
        assertEquals("no-store", result.getResponse().getHeader("Cache-Control"));
        assertNull(result.getResponse().getHeader("Set-Cookie"), "health must not open a session");
        assertNull(result.getRequest().getSession(false), "health must not open a session");
    }

    @Test
    @Order(2)
    void otherRoutesStillRequireASession() throws Exception {
        assertEquals(401, mockMvc.perform(get("/api/v1/session")).andReturn().getResponse().getStatus());
        assertEquals(401, mockMvc.perform(get("/api/v1/sites")).andReturn().getResponse().getStatus());
        assertEquals(200, mockMvc.perform(get("/api/v1/public-config")).andReturn().getResponse().getStatus());
    }

    @Test
    @Order(3)
    void unreachableDatabaseAnswers503ProblemWithAStableCode() throws Exception {
        MYSQL.stop();

        MvcResult result = mockMvc.perform(get("/api/v1/health")).andReturn();

        assertEquals(503, result.getResponse().getStatus());
        assertTrue(result.getResponse().getContentType().startsWith("application/problem+json"));
        JsonNode problem = objectMapper.readTree(result.getResponse().getContentAsString());
        assertEquals(503, problem.get("status").asInt());
        assertEquals("DATABASE_UNAVAILABLE", problem.get("code").asText());
        assertTrue(problem.hasNonNull("traceId"));
    }
}
