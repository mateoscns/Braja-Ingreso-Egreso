package com.braja.fichaje.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
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
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Issue #35: the ADMIN created by the first-admin bootstrap keeps the configured name and the session exposes it. */
@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@AutoConfigureMockMvc
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BootstrapAdminNameMySqlTest {
    private static final String AES_KEY = java.util.Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = java.util.Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
    private static final String PASSWORD = "CorrectHorseBattery9!";
    private static final String BOOTSTRAP_DNI = "20111222";
    private static final String BOOTSTRAP_NAME = "Laura Administradora";

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
        registry.add("braja.bootstrap-enabled", () -> "true");
        registry.add("braja.bootstrap-dni", () -> BOOTSTRAP_DNI);
        registry.add("braja.bootstrap-password", () -> PASSWORD);
        registry.add("braja.bootstrap-admin-name", () -> BOOTSTRAP_NAME);
        registry.add("braja.bootstrap-company-name", () -> "Empresa Bootstrap");
        registry.add("braja.bootstrap-site-name", () -> "Sede Bootstrap");
        registry.add("braja.bootstrap-time-zone", () -> "America/Argentina/Buenos_Aires");
    }

    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    private String lastCsrf;

    @Test
    void bootstrapAdminSessionExposesTheConfiguredName() throws Exception {
        MvcResult login = loginResult(BOOTSTRAP_DNI);
        assertEquals(BOOTSTRAP_NAME, json(login).get("displayName").asText());
        mockMvc.perform(get("/api/v1/session").cookie(sessionCookie(login)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value(BOOTSTRAP_NAME));
    }

    @Test
    void membershipDisplayNameColumnExistsAndIsNullable() {
        assertEquals("YES", jdbc.queryForObject("SELECT is_nullable FROM information_schema.columns " +
                "WHERE table_schema=DATABASE() AND table_name='company_memberships' AND column_name='display_name'", String.class));
    }

    @Test
    void adminMembershipWithoutNameStillOmitsDisplayName() throws Exception {
        UUID company = company("Sin nombre SA");
        UUID account = account("20333444");
        membership(company, account, null);
        MvcResult login = loginResult("20333444");
        assertFalse(json(login).has("displayName"));
    }

    @Test
    void employeeNameWinsOverMembershipNameAndNameFollowsTheActiveCompany() throws Exception {
        UUID companyA = company("AAA Empresa");
        UUID companyB = company("ZZZ Empresa");
        UUID account = account("20555666");
        membership(companyA, account, "Nombre en A");
        membership(companyB, account, "Nombre en B");
        MvcResult login = loginResult("20555666");
        Cookie cookie = sessionCookie(login);
        // Companies are ordered by name, so the session starts in A; B's name must not leak into it.
        assertEquals(companyA.toString(), json(login).get("activeCompanyId").asText());
        assertEquals("Nombre en A", json(login).get("displayName").asText());
        mockMvc.perform(put("/api/v1/companies/active")
                        .cookie(cookie, new Cookie("BRAJA_CSRF", lastCsrf)).header("X-CSRF-TOKEN", lastCsrf)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"companyId\":\"" + companyB + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Nombre en B"));
        // An employee row in the active company takes precedence over the membership name.
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,10,TRUE,?,?)",
                UUID.randomUUID().toString(), companyB.toString(), account.toString(), "Empleado en B", ts(), ts());
        mockMvc.perform(get("/api/v1/session").cookie(cookie))
                .andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Empleado en B"));
    }

    private MvcResult loginResult(String dni) throws Exception {
        MvcResult csrfResponse = mockMvc.perform(get("/api/v1/csrf")).andExpect(status().isOk()).andReturn();
        String csrf = json(csrfResponse).get("token").asText();
        String anonymous = csrfResponse.getResponse().getHeaders("Set-Cookie").stream().filter(h -> h.startsWith("BRAJA_SESSION=")).findFirst().orElseThrow()
                .split(";", 2)[0].substring("BRAJA_SESSION=".length());
        lastCsrf = csrf;
        return mockMvc.perform(post("/api/v1/session")
                        .cookie(new Cookie("BRAJA_SESSION", anonymous), new Cookie("BRAJA_CSRF", csrf))
                        .header("X-CSRF-TOKEN", csrf).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"dni\":\"" + dni + "\",\"password\":\"" + PASSWORD + "\"}"))
                .andExpect(status().isOk()).andReturn();
    }

    private Cookie sessionCookie(MvcResult login) {
        String header = login.getResponse().getHeaders("Set-Cookie").stream().filter(h -> h.startsWith("BRAJA_SESSION=")).findFirst().orElseThrow();
        return new Cookie("BRAJA_SESSION", header.split(";", 2)[0].substring("BRAJA_SESSION=".length()));
    }

    private JsonNode json(MvcResult result) throws Exception { return objectMapper.readTree(result.getResponse().getContentAsString()); }

    private static Timestamp ts() { return Timestamp.from(Instant.now()); }

    private UUID company(String name) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", id.toString(), name, ts());
        return id;
    }

    private UUID account(String dni) {
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                id.toString(), dni, dni, passwordEncoder.encode(PASSWORD), ts(), ts());
        return id;
    }

    /** ADMIN membership; a null name leaves the (nullable) display_name column unset. */
    private void membership(UUID company, UUID account, String name) {
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'ADMIN',TRUE,?)",
                UUID.randomUUID().toString(), company.toString(), account.toString(), ts());
        if (name != null) {
            jdbc.update("UPDATE company_memberships SET display_name=? WHERE company_id=? AND account_id=?", name, company.toString(), account.toString());
        }
    }
}
