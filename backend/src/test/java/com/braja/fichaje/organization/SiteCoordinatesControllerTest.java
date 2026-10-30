package com.braja.fichaje.organization;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.security.PasswordResetService;
import com.braja.fichaje.security.ScopeService;
import jakarta.servlet.http.HttpSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SiteCoordinatesControllerTest {
    private static final String ADMIN_SITES_QUERY = "SELECT id,name,time_zone,latitude,longitude,geofence_radius_meters FROM sites WHERE company_id=? ORDER BY name,id";
    private static final String EMPLOYEE_SITES_QUERY = "SELECT s.id,s.name,s.time_zone FROM sites s JOIN employee_sites es ON es.site_id=s.id AND es.company_id=s.company_id WHERE s.company_id=? AND es.employee_id=? ORDER BY s.name,s.id";

    private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
    private final ScopeService scopes = mock(ScopeService.class);
    private final OrganizationService service = mock(OrganizationService.class);
    private final Authentication authentication = mock(Authentication.class);
    private final HttpSession session = mock(HttpSession.class);
    private final UUID companyId = UUID.randomUUID();
    private OrganizationController controller;

    @BeforeEach
    void setUp() {
        controller = new OrganizationController(jdbc, scopes, service, mock(PasswordResetService.class));
    }

    @Test
    void adminCanCreateSiteWithOptionalCoordinates() {
        UUID accountId = UUID.randomUUID();
        when(scopes.requireAdmin(authentication, session)).thenReturn(new ScopeService.Scope(accountId, companyId, "ADMIN", false));
        BigDecimal latitude = new BigDecimal("-34.6037220");
        BigDecimal longitude = new BigDecimal("-58.3815920");
        var input = new OrganizationController.SiteInput(" Centro ", "America/Argentina/Buenos_Aires", latitude, longitude, 150);
        var expected = new OrganizationController.SiteView(UUID.randomUUID(), "Centro", "America/Argentina/Buenos_Aires", latitude, longitude, 150);
        when(service.createSite(companyId, accountId, input)).thenReturn(expected);

        OrganizationController.SiteView created = controller.createSite(authentication, session,
                input);

        assertEquals(expected, created);
        assertEquals(latitude, created.latitude());
        assertEquals(longitude, created.longitude());
        verify(service).createSite(companyId, accountId, input);
        verifyNoInteractions(jdbc);
    }

    @Test
    void siteCreationDelegatesMissingRadiusSoServiceCanApplyDefault() {
        UUID accountId = UUID.randomUUID();
        var input = new OrganizationController.SiteInput("Centro", "America/Argentina/Buenos_Aires", null, null, null);
        var expected = new OrganizationController.SiteView(UUID.randomUUID(), "Centro", "America/Argentina/Buenos_Aires", null, null, 100);
        when(service.createSite(companyId, accountId, input)).thenReturn(expected);

        when(scopes.requireAdmin(authentication, session)).thenReturn(new ScopeService.Scope(accountId, companyId, "ADMIN", false));
        assertEquals(100, controller.createSite(authentication, session, input).geofenceRadiusMeters());
        verify(service).createSite(companyId, accountId, input);
    }

    @Test
    void locationInputRejectsPartialCoordinatesAndInvalidRadiusBeforeDatabaseAccess() {
        OrganizationService realService = new OrganizationService(jdbc, scopes, mock(PasswordEncoder.class));
        var partialCoordinates = new OrganizationController.SiteLocationInput(new BigDecimal("-34.6"), null, 100);
        var invalidRadius = new OrganizationController.SiteLocationInput(null, null, 49);
        var invalidSource = new OrganizationController.SiteLocationInput(null, null, 100, "GPS");

        assertThrows(ApiException.class, () -> realService.updateSiteLocation(companyId, UUID.randomUUID(), UUID.randomUUID(), partialCoordinates));
        assertThrows(ApiException.class, () -> realService.updateSiteLocation(companyId, UUID.randomUUID(), UUID.randomUUID(), invalidRadius));
        assertThrows(ApiException.class, () -> realService.updateSiteLocation(companyId, UUID.randomUUID(), UUID.randomUUID(), invalidSource));
        verifyNoInteractions(jdbc);
    }

    @Test
    void adminSiteResponseIncludesExactCoordinates() throws Exception {
        UUID siteId = UUID.randomUUID();
        when(scopes.require(authentication, session)).thenReturn(new ScopeService.Scope(UUID.randomUUID(), companyId, "ADMIN", false));
        ResultSet row = mock(ResultSet.class);
        when(row.getString("id")).thenReturn(siteId.toString());
        when(row.getString("name")).thenReturn("Centro");
        when(row.getString("time_zone")).thenReturn("America/Argentina/Buenos_Aires");
        when(row.getBigDecimal("latitude")).thenReturn(new BigDecimal("-34.6037220"));
        when(row.getBigDecimal("longitude")).thenReturn(new BigDecimal("-58.3815920"));
        when(row.getInt("geofence_radius_meters")).thenReturn(175);
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked") RowMapper<OrganizationController.SiteView> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        }).when(jdbc).query(eq(ADMIN_SITES_QUERY), ArgumentMatchers.<RowMapper<OrganizationController.SiteView>>any(), eq(companyId.toString()));

        OrganizationController.SiteView visible = controller.sites(authentication, session).getFirst();

        assertEquals(new BigDecimal("-34.6037220"), visible.latitude());
        assertEquals(new BigDecimal("-58.3815920"), visible.longitude());
        assertEquals(175, visible.geofenceRadiusMeters());
    }

    @Test
    void employeeSiteResponseDoesNotExposeExactCoordinates() throws Exception {
        UUID accountId = UUID.randomUUID();
        UUID employeeId = UUID.randomUUID();
        UUID siteId = UUID.randomUUID();
        ScopeService.Scope employeeScope = new ScopeService.Scope(accountId, companyId, "EMPLOYEE", false);
        when(scopes.require(authentication, session)).thenReturn(employeeScope);
        when(scopes.employeeIdFor(employeeScope)).thenReturn(employeeId);
        ResultSet row = mock(ResultSet.class);
        when(row.getString("id")).thenReturn(siteId.toString());
        when(row.getString("name")).thenReturn("Centro");
        when(row.getString("time_zone")).thenReturn("America/Argentina/Buenos_Aires");
        doAnswer(invocation -> {
            @SuppressWarnings("unchecked") RowMapper<OrganizationController.SiteView> mapper = invocation.getArgument(1);
            return List.of(mapper.mapRow(row, 0));
        }).when(jdbc).query(eq(EMPLOYEE_SITES_QUERY), ArgumentMatchers.<RowMapper<OrganizationController.SiteView>>any(), eq(companyId.toString()), eq(employeeId.toString()));

        OrganizationController.SiteView visible = controller.sites(authentication, session).getFirst();

        assertEquals(siteId, visible.id());
        assertNull(visible.latitude());
        assertNull(visible.longitude());
        assertNull(visible.geofenceRadiusMeters());
        verify(row, never()).getBigDecimal(anyString());
    }
}
