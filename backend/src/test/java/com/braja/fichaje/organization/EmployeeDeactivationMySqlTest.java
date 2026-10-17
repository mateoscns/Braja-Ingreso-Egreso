package com.braja.fichaje.organization;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.security.AccountService;
import com.braja.fichaje.security.BrajaUserDetails;
import com.braja.fichaje.security.CurrentActor;
import com.braja.fichaje.security.ScopeService;
import com.braja.fichaje.timekeeping.MarkService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@Testcontainers
@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class EmployeeDeactivationMySqlTest {
    private static final String PASSWORD = "CorrectHorseBattery9!";
    private static final String AES_KEY = java.util.Base64.getEncoder().encodeToString(new byte[32]);

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja_deactivation_test")
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
    @Autowired OrganizationController organizations;
    @Autowired ScopeService scopes;
    @Autowired AccountService accounts;
    @Autowired MarkService marks;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;

    private UUID companyId;
    private UUID employeeAccountId;
    private UUID adminAccountId;
    private UUID employeeId;
    private UUID siteId;
    private UUID templateId;
    private UUID jornadaId;
    private MockHttpSession adminSession;
    private MockHttpSession employeeSession;
    private Authentication adminAuthentication;
    private Authentication employeeAuthentication;

    @BeforeEach
    void setUp() {
        Instant now = Instant.now();
        companyId = UUID.randomUUID();
        employeeAccountId = UUID.randomUUID();
        adminAccountId = UUID.randomUUID();
        employeeId = UUID.randomUUID();
        siteId = UUID.randomUUID();
        templateId = UUID.randomUUID();
        jornadaId = UUID.randomUUID();
        String suffix = String.format("%08d", Math.floorMod(System.nanoTime(), 100_000_000L));
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), "Deactivation " + suffix, Timestamp.from(now));
        insertAccount(employeeAccountId, "301" + suffix, "30.1" + suffix, now);
        insertAccount(adminAccountId, "302" + suffix, "30.2" + suffix, now);
        insertMembership(employeeAccountId, "EMPLOYEE", now);
        insertMembership(adminAccountId, "ADMIN", now);
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,0,TRUE,?,?)",
                employeeId.toString(), companyId.toString(), employeeAccountId.toString(), "Persona " + suffix, Timestamp.from(now), Timestamp.from(now));
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", siteId.toString(), companyId.toString(), "Sede " + suffix, "America/Argentina/Buenos_Aires", Timestamp.from(now));
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,?,15,45,TRUE,?,?)",
                templateId.toString(), companyId.toString(), siteId.toString(), "Turno " + suffix, Timestamp.from(now), Timestamp.from(now));
        Instant scheduledStart = now.minusSeconds(3600);
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) " +
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,'NO_INGRESO',1,?,?)",
                jornadaId.toString(), companyId.toString(), employeeId.toString(), siteId.toString(), templateId.toString(), java.time.LocalDate.now(),
                "America/Argentina/Buenos_Aires", "{\"siteId\":\"" + siteId + "\",\"name\":\"Turno\",\"blocks\":[{\"startDayOffset\":0,\"start\":\"08:00:00\",\"end\":\"16:00:00\",\"endDayOffset\":0}],\"breakfastLimitMinutes\":15,\"lunchLimitMinutes\":45}",
                0, Timestamp.from(scheduledStart), Timestamp.from(now.plusSeconds(3600)), employeeAccountId.toString(), Timestamp.from(now));
        adminSession = sessionFor(companyId);
        employeeSession = sessionFor(companyId);
        adminAuthentication = authentication(adminAccountId, "30.2" + suffix);
        employeeAuthentication = authentication(employeeAccountId, "30.1" + suffix);
    }

    @Test
    void deactivationRevokesMembershipAndExistingSessionScopeAndLogin() {
        assertEquals("EMPLOYEE", scopes.require(employeeAuthentication, employeeSession).role());

        organizations.updateEmployee(adminAuthentication, adminSession, employeeId,
                new OrganizationController.EmployeePatch(null, null, null, false));

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM company_memberships WHERE company_id=? AND account_id=? AND role='EMPLOYEE' AND active=TRUE",
                Integer.class, companyId.toString(), employeeAccountId.toString()));
        assertThrows(ApiException.class, () -> scopes.require(employeeAuthentication, employeeSession));
        assertThrows(ApiException.class, () -> accounts.login("30.1" + dniSuffix(), PASSWORD,
                new MockHttpServletRequest(), new MockHttpServletResponse()));
    }

    @Test
    void reactivationRestoresTheEmployeeMembership() {
        organizations.updateEmployee(adminAuthentication, adminSession, employeeId,
                new OrganizationController.EmployeePatch(null, null, null, false));
        organizations.updateEmployee(adminAuthentication, adminSession, employeeId,
                new OrganizationController.EmployeePatch(null, null, null, true));

        assertEquals("EMPLOYEE", scopes.require(employeeAuthentication, employeeSession).role());
    }

    @Test
    void inactiveEmployeeDoesNotReceiveScheduledAbsenceOrPushAlert() {
        organizations.updateEmployee(adminAuthentication, adminSession, employeeId,
                new OrganizationController.EmployeePatch(null, null, null, false));

        marks.createDueAbsences(Instant.now(), 200);

        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND type='SIN_INGRESO' AND active=TRUE",
                Integer.class, jornadaId.toString()));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM notification_outbox_events WHERE company_id=?",
                Integer.class, companyId.toString()));
    }

    private String dniSuffix() {
        return jdbc.queryForObject("SELECT RIGHT(dni_normalized,8) FROM accounts WHERE id=?", String.class, employeeAccountId.toString());
    }

    private void insertAccount(UUID id, String dni, String display, Instant now) {
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                id.toString(), dni, display, passwordEncoder.encode(PASSWORD), Timestamp.from(now), Timestamp.from(now));
    }

    private void insertMembership(UUID accountId, String role, Instant now) {
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,?,TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), accountId.toString(), role, Timestamp.from(now));
    }

    private MockHttpSession sessionFor(UUID company) {
        MockHttpSession session = new MockHttpSession();
        session.setAttribute(CurrentActor.ACTIVE_COMPANY_SESSION_KEY, company);
        return session;
    }

    private Authentication authentication(UUID accountId, String dni) {
        return UsernamePasswordAuthenticationToken.authenticated(
                new BrajaUserDetails(accountId, dni, "unused", true), "unused", java.util.List.of());
    }
}
