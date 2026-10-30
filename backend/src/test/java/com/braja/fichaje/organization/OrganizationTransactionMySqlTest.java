package com.braja.fichaje.organization;

import com.braja.fichaje.security.BrajaUserDetails;
import com.braja.fichaje.security.CurrentActor;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Timestamp;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Multi-statement organization writes must be atomic. Failures are injected with a real MySQL CHECK
 * constraint that rejects a later statement of the operation, after earlier rows were already written.
 */
@Testcontainers
@SpringBootTest(properties = "braja.scheduling.enabled=false")
@ActiveProfiles("local")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OrganizationTransactionMySqlTest {
    private static final String AES_KEY = java.util.Base64.getEncoder().encodeToString(new byte[32]);
    private static final String LOGIN_IP_THROTTLE_KEY = java.util.Base64.getEncoder().encodeToString(
            "0123456789abcdef0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.US_ASCII));

    @Container
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja_org_tx_test")
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
    @Autowired OrganizationController organizations;

    private UUID companyId;
    private UUID siteId;
    private UUID adminAccountId;
    private Authentication adminAuthentication;
    private MockHttpSession adminSession;
    private String suffix;

    @BeforeEach
    void setUp() {
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        companyId = UUID.randomUUID();
        siteId = UUID.randomUUID();
        adminAccountId = UUID.randomUUID();
        suffix = String.format("%08d", Math.floorMod(System.nanoTime(), 100_000_000L));
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), "OrgTx " + suffix, Timestamp.from(now));
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                adminAccountId.toString(), "401" + suffix, "40.1" + suffix, "unused", Timestamp.from(now), Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at,display_name) VALUES(?,?,?,'ADMIN',TRUE,?,?)",
                UUID.randomUUID().toString(), companyId.toString(), adminAccountId.toString(), Timestamp.from(now), "Admin " + suffix);
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)",
                siteId.toString(), companyId.toString(), "Sede " + suffix, "America/Argentina/Buenos_Aires", Timestamp.from(now));
        adminSession = new MockHttpSession();
        adminSession.setAttribute(CurrentActor.ACTIVE_COMPANY_SESSION_KEY, companyId);
        adminAuthentication = UsernamePasswordAuthenticationToken.authenticated(
                new BrajaUserDetails(adminAccountId, "40.1" + suffix, "unused", true), "unused", List.of());
    }

    @AfterEach
    void dropInjectedFailures() {
        dropConstraint("employee_sites", "chk_test_inject");
        dropConstraint("template_blocks", "chk_test_inject");
        dropConstraint("site_location_audits", "chk_test_inject");
    }

    @Test
    void createEmployeeFailingOnSiteLinkLeavesNoAccountMembershipOrEmployee() {
        inject("employee_sites", "FALSE");
        String dni = "50" + suffix.substring(0, 6);
        var input = new OrganizationController.EmployeeInput(dni, "Persona " + suffix, List.of(siteId), 10, "TemporaryPass123");

        assertThrows(DataAccessException.class, () -> organizations.createEmployee(adminAuthentication, adminSession, input));

        assertEquals(0, count("SELECT COUNT(*) FROM accounts WHERE dni_normalized=?", dni));
        assertEquals(0, count("SELECT COUNT(*) FROM employees WHERE company_id=?", companyId.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM company_memberships WHERE company_id=? AND role='EMPLOYEE'", companyId.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM employee_sites WHERE company_id=?", companyId.toString()));
    }

    @Test
    void createEmployeeHappyPathPersistsEverything() {
        String dni = "51" + suffix.substring(0, 6);
        var view = organizations.createEmployee(adminAuthentication, adminSession,
                new OrganizationController.EmployeeInput(dni, "Persona " + suffix, List.of(siteId), 10, "TemporaryPass123"));

        assertEquals(List.of(siteId), view.siteIds());
        assertEquals(1, count("SELECT COUNT(*) FROM accounts WHERE dni_normalized=?", dni));
        assertEquals(1, count("SELECT COUNT(*) FROM employees WHERE company_id=? AND id=?", companyId.toString(), view.id().toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM company_memberships WHERE company_id=? AND role='EMPLOYEE'", companyId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM employee_sites WHERE company_id=?", companyId.toString()));
    }

    @Test
    void createTemplateFailingOnSecondBlockLeavesNoTemplateOrBlocks() {
        inject("template_blocks", "sequence_number < 2");

        assertThrows(DataAccessException.class, () -> organizations.createTemplate(adminAuthentication, adminSession, twoBlockTemplate("Nuevo")));

        assertEquals(0, count("SELECT COUNT(*) FROM schedule_templates WHERE company_id=?", companyId.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM template_blocks WHERE company_id=?", companyId.toString()));
    }

    @Test
    void updateTemplateFailingOnSecondBlockKeepsPreviousTemplateAndBlocks() {
        var created = organizations.createTemplate(adminAuthentication, adminSession, oneBlockTemplate("Original"));
        inject("template_blocks", "sequence_number < 2");

        assertThrows(DataAccessException.class, () -> organizations.updateTemplate(adminAuthentication, adminSession, created.id(), twoBlockTemplate("Cambiado")));

        assertEquals(oneBlockTemplate("Original").name(), jdbc.queryForObject("SELECT name FROM schedule_templates WHERE id=? AND company_id=?", String.class, created.id().toString(), companyId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM template_blocks WHERE template_id=? AND company_id=?", created.id().toString(), companyId.toString()));
    }

    @Test
    void templateHappyPathCreatesAndUpdatesWithAllBlocks() {
        var created = organizations.createTemplate(adminAuthentication, adminSession, oneBlockTemplate("Original"));
        assertEquals(1, created.blocks().size());

        var updated = organizations.updateTemplate(adminAuthentication, adminSession, created.id(), twoBlockTemplate("Cambiado"));

        assertEquals(twoBlockTemplate("Cambiado").name(), updated.name());
        assertEquals(2, updated.blocks().size());
        assertEquals(2, count("SELECT COUNT(*) FROM template_blocks WHERE template_id=? AND company_id=?", created.id().toString(), companyId.toString()));
    }

    @Test
    void createSiteSavesFirstCenterAuditInSameTransaction() {
        BigDecimal latitude = new BigDecimal("-34.6037220");
        BigDecimal longitude = new BigDecimal("-58.3815920");
        var input = new OrganizationController.SiteInput("New site " + suffix, "America/Argentina/Buenos_Aires", latitude, longitude, 125);

        var created = organizations.createSite(adminAuthentication, adminSession, input);

        assertEquals(latitude, created.latitude());
        assertEquals(longitude, created.longitude());
        assertEquals(125, created.geofenceRadiusMeters());
        assertEquals(1, count("SELECT COUNT(*) FROM sites WHERE id=? AND company_id=?", created.id().toString(), companyId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM site_location_audits WHERE site_id=? AND company_id=?", created.id().toString(), companyId.toString()));
        var audit = organizations.siteLocationAudit(adminAuthentication, adminSession, created.id()).entries().getFirst();
        assertEquals("Admin " + suffix, audit.actorDisplayName());
        assertNull(audit.beforeLatitude());
        assertNull(audit.beforeLongitude());
        assertNull(audit.beforeRadiusMeters());
        assertEquals(latitude, audit.afterLatitude());
        assertEquals(longitude, audit.afterLongitude());
        assertEquals(125, audit.afterRadiusMeters());
        assertNotNull(audit.changedAt());
    }

    @Test
    void createSiteWithDefaultLocationHasNoChangeAudit() {
        var input = new OrganizationController.SiteInput("Default site " + suffix, "America/Argentina/Buenos_Aires", null, null, null);

        var created = organizations.createSite(adminAuthentication, adminSession, input);

        assertEquals(100, created.geofenceRadiusMeters());
        assertNull(created.latitude());
        assertNull(created.longitude());
        assertEquals(0, count("SELECT COUNT(*) FROM site_location_audits WHERE site_id=? AND company_id=?", created.id().toString(), companyId.toString()));
    }

    @Test
    void createSiteRollsBackWhenInitialAuditCannotBeWritten() {
        inject("site_location_audits", "after_radius_meters <> 275");
        var input = new OrganizationController.SiteInput("Rollback site " + suffix, "America/Argentina/Buenos_Aires",
                new BigDecimal("-34.6"), new BigDecimal("-58.4"), 275);

        assertThrows(DataAccessException.class, () -> organizations.createSite(adminAuthentication, adminSession, input));

        assertEquals(0, count("SELECT COUNT(*) FROM sites WHERE company_id=? AND name=?", companyId.toString(), input.name()));
        assertEquals(0, count("SELECT COUNT(*) FROM site_location_audits WHERE company_id=?", companyId.toString()));
    }

    @Test
    void siteLocationUpdateAuditsAndRollsBackAsOneTransaction() {
        var input = new OrganizationController.SiteLocationInput(null, null, 200);

        var updated = organizations.updateSiteLocation(adminAuthentication, adminSession, siteId, input);

        assertEquals(200, updated.geofenceRadiusMeters());
        assertEquals(1, count("SELECT COUNT(*) FROM site_location_audits WHERE site_id=? AND company_id=?", siteId.toString(), companyId.toString()));
        var audit = organizations.siteLocationAudit(adminAuthentication, adminSession, siteId).entries().getFirst();
        assertEquals(100, audit.beforeRadiusMeters());
        assertEquals(200, audit.afterRadiusMeters());
        assertEquals("Admin " + suffix, audit.actorDisplayName());

        inject("site_location_audits", "after_radius_meters <> 275");
        assertThrows(DataAccessException.class, () -> organizations.updateSiteLocation(adminAuthentication, adminSession, siteId,
                new OrganizationController.SiteLocationInput(new BigDecimal("-34.6"), new BigDecimal("-58.4"), 275)));

        assertEquals(200, jdbc.queryForObject("SELECT geofence_radius_meters FROM sites WHERE id=? AND company_id=?", Integer.class,
                siteId.toString(), companyId.toString()));
        assertEquals(1, count("SELECT COUNT(*) FROM site_location_audits WHERE site_id=? AND company_id=?", siteId.toString(), companyId.toString()));
    }

    @Test
    void siteLocationValidationRejectsInvalidRadiusAndPartialCenterBeforeWriting() {
        assertThrows(com.braja.fichaje.api.ApiException.class, () -> organizations.updateSiteLocation(adminAuthentication, adminSession,
                siteId, new OrganizationController.SiteLocationInput(null, null, 49)));
        assertThrows(com.braja.fichaje.api.ApiException.class, () -> organizations.updateSiteLocation(adminAuthentication, adminSession,
                siteId, new OrganizationController.SiteLocationInput(new BigDecimal("-34.6"), null, 100)));

        assertEquals(100, jdbc.queryForObject("SELECT geofence_radius_meters FROM sites WHERE id=? AND company_id=?", Integer.class,
                siteId.toString(), companyId.toString()));
        assertEquals(0, count("SELECT COUNT(*) FROM site_location_audits WHERE site_id=? AND company_id=?", siteId.toString(), companyId.toString()));
    }

    @Test
    void siteLocationEndpointsEnforceAdminAndCompanyIsolation() {
        UUID otherCompanyId = UUID.randomUUID();
        UUID otherSiteId = UUID.randomUUID();
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", otherCompanyId.toString(), "Other " + suffix, Timestamp.from(now));
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)",
                otherSiteId.toString(), otherCompanyId.toString(), "Other site " + suffix, "America/Argentina/Buenos_Aires", Timestamp.from(now));

        assertThrows(com.braja.fichaje.api.ApiException.class, () -> organizations.updateSiteLocation(adminAuthentication, adminSession,
                otherSiteId, new OrganizationController.SiteLocationInput(null, null, 200)));
        assertThrows(com.braja.fichaje.api.ApiException.class, () -> organizations.siteLocationAudit(adminAuthentication, adminSession, otherSiteId));
        assertEquals(100, jdbc.queryForObject("SELECT geofence_radius_meters FROM sites WHERE id=?", Integer.class, otherSiteId.toString()));

        var employee = organizations.createEmployee(adminAuthentication, adminSession,
                new OrganizationController.EmployeeInput("52" + suffix.substring(0, 6), "Empleado " + suffix,
                        List.of(siteId), 10, "TemporaryPass123"));
        UUID employeeAccount = UUID.fromString(jdbc.queryForObject("SELECT account_id FROM employees WHERE id=? AND company_id=?", String.class,
                employee.id().toString(), companyId.toString()));
        jdbc.update("UPDATE accounts SET must_change_password=FALSE WHERE id=?", employeeAccount.toString());
        Authentication employeeAuthentication = UsernamePasswordAuthenticationToken.authenticated(
                new BrajaUserDetails(employeeAccount, "52" + suffix.substring(0, 6), "unused", true), "unused", List.of());

        assertThrows(com.braja.fichaje.api.ApiException.class, () -> organizations.updateSiteLocation(employeeAuthentication, adminSession,
                siteId, new OrganizationController.SiteLocationInput(null, null, 200)));
        assertThrows(com.braja.fichaje.api.ApiException.class, () -> organizations.siteLocationAudit(employeeAuthentication, adminSession, siteId));
        assertEquals(0, count("SELECT COUNT(*) FROM site_location_audits WHERE company_id=?", companyId.toString()));
    }

    private OrganizationController.TemplateInput oneBlockTemplate(String name) {
        return new OrganizationController.TemplateInput(siteId, name + " " + suffix,
                List.of(new OrganizationController.BlockInput(0, LocalTime.of(8, 0), LocalTime.of(16, 0), 0)), 15, 45);
    }

    private OrganizationController.TemplateInput twoBlockTemplate(String name) {
        return new OrganizationController.TemplateInput(siteId, name + " " + suffix, List.of(
                new OrganizationController.BlockInput(0, LocalTime.of(8, 0), LocalTime.of(12, 0), 0),
                new OrganizationController.BlockInput(0, LocalTime.of(14, 0), LocalTime.of(18, 0), 0)), 15, 45);
    }

    private void inject(String table, String allowedCondition) {
        // Only rows of this test's company can be rejected; rows written by other tests stay valid.
        jdbc.execute("ALTER TABLE " + table + " ADD CONSTRAINT chk_test_inject CHECK (" + allowedCondition
                + " OR company_id <> '" + companyId + "')");
    }

    private int count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private void dropConstraint(String table, String name) {
        try { jdbc.execute("ALTER TABLE " + table + " DROP CHECK " + name); }
        catch (DataAccessException ignored) { /* constraint was not installed by this test */ }
    }
}
