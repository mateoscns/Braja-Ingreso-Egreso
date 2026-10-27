package com.braja.fichaje.organization;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.security.PasswordResetService;
import com.braja.fichaje.security.ScopeService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.ZoneId;
import java.util.*;

@RestController
@RequestMapping("/api/v1")
public class OrganizationController {
    private final JdbcTemplate jdbc;
    private final ScopeService scopes;
    private final OrganizationService service;
    private final PasswordResetService passwordResets;

    public OrganizationController(JdbcTemplate jdbc, ScopeService scopes, OrganizationService service, PasswordResetService passwordResets) {
        this.jdbc = jdbc;
        this.scopes = scopes;
        this.service = service;
        this.passwordResets = passwordResets;
    }

    @GetMapping("/sites")
    public List<SiteView> sites(Authentication auth, HttpSession session) {
        var scope = scopes.require(auth, session);
        if ("ADMIN".equals(scope.role())) {
            return jdbc.query("SELECT id,name,time_zone FROM sites WHERE company_id=? ORDER BY name,id",
                    (rs, row) -> new SiteView(UUID.fromString(rs.getString("id")), rs.getString("name"), rs.getString("time_zone")), scope.companyId().toString());
        }
        UUID employeeId = requireEmployee(scope);
        return jdbc.query("SELECT s.id,s.name,s.time_zone FROM sites s JOIN employee_sites es ON es.site_id=s.id AND es.company_id=s.company_id WHERE s.company_id=? AND es.employee_id=? ORDER BY s.name,s.id",
                (rs, row) -> new SiteView(UUID.fromString(rs.getString("id")), rs.getString("name"), rs.getString("time_zone")), scope.companyId().toString(), employeeId.toString());
    }

    @PostMapping("/sites")
    @ResponseStatus(HttpStatus.CREATED)
    public SiteView createSite(Authentication auth, HttpSession session, @Valid @RequestBody SiteInput input) {
        var scope = scopes.requireAdmin(auth, session);
        validateZone(input.timeZone());
        UUID id = UUID.randomUUID();
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", id.toString(), scope.companyId().toString(), input.name().trim(), input.timeZone(), now());
        return new SiteView(id, input.name().trim(), input.timeZone());
    }

    @GetMapping("/employees")
    public List<EmployeeView> employees(Authentication auth, HttpSession session) {
        var scope = scopes.requireAdmin(auth, session);
        return jdbc.query("SELECT e.id,e.display_name,e.tolerance_minutes,e.active,a.dni_display,a.must_change_password FROM employees e JOIN accounts a ON a.id=e.account_id WHERE e.company_id=? ORDER BY e.display_name,e.id",
                (rs, row) -> service.employeeView(scope.companyId(), UUID.fromString(rs.getString("id")), rs.getString("display_name"), rs.getInt("tolerance_minutes"), rs.getBoolean("active"), rs.getString("dni_display"), rs.getBoolean("must_change_password")),
                scope.companyId().toString());
    }

    @PostMapping("/employees")
    @ResponseStatus(HttpStatus.CREATED)
    public EmployeeView createEmployee(Authentication auth, HttpSession session, @Valid @RequestBody EmployeeInput input) {
        var scope = scopes.requireAdmin(auth, session);
        return service.createEmployee(scope.companyId(), input);
    }

    @PatchMapping("/employees/{employeeId}")
    public EmployeeView updateEmployee(Authentication auth, HttpSession session, @PathVariable UUID employeeId, @Valid @RequestBody EmployeePatch input) {
        var scope = scopes.requireAdmin(auth, session);
        return service.updateEmployee(scope.companyId(), employeeId, input);
    }

    /** D-20261027-09: the temporary password travels only in this no-store response. */
    @PostMapping("/employees/{employeeId}/password-reset")
    public ResponseEntity<PasswordResetView> resetEmployeePassword(Authentication auth, HttpSession session, @PathVariable UUID employeeId) {
        var scope = scopes.requireAdmin(auth, session);
        String temporaryPassword = passwordResets.resetEmployeePassword(scope.companyId(), scope.accountId(), employeeId);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new PasswordResetView(temporaryPassword));
    }

    @GetMapping("/templates")
    public List<TemplateView> templates(Authentication auth, HttpSession session, @RequestParam(required = false) UUID siteId) {
        var scope = scopes.require(auth, session);
        if ("EMPLOYEE".equals(scope.role())) {
            UUID employeeId = requireEmployee(scope);
            if (siteId != null && !scopes.employeeHasSite(scope.companyId(), employeeId, siteId)) throw ApiException.notFound();
        } else if (siteId != null && !scopes.companyHasSite(scope.companyId(), siteId)) throw ApiException.notFound();
        StringBuilder sql = new StringBuilder("SELECT id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active FROM schedule_templates WHERE company_id=?");
        List<Object> args = new ArrayList<>();
        args.add(scope.companyId().toString());
        if ("EMPLOYEE".equals(scope.role())) {
            sql.append(" AND site_id IN (SELECT site_id FROM employee_sites WHERE company_id=? AND employee_id=?)");
            args.add(scope.companyId().toString());
            args.add(requireEmployee(scope).toString());
        }
        if (siteId != null) {
            sql.append(" AND site_id=?");
            args.add(siteId.toString());
        }
        sql.append(" ORDER BY name,id");
        return jdbc.query(sql.toString(), (rs, row) -> service.templateView(scope.companyId(), UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("site_id")), rs.getString("name"), rs.getInt("breakfast_limit_minutes"), rs.getInt("lunch_limit_minutes"), rs.getBoolean("active")), args.toArray());
    }

    @PostMapping("/templates")
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateView createTemplate(Authentication auth, HttpSession session, @Valid @RequestBody TemplateInput input) {
        var scope = scopes.requireAdmin(auth, session);
        return service.createTemplate(scope.companyId(), input);
    }

    @PatchMapping("/templates/{templateId}")
    public TemplateView updateTemplate(Authentication auth, HttpSession session, @PathVariable UUID templateId, @Valid @RequestBody TemplateInput input) {
        var scope = scopes.requireAdmin(auth, session);
        return service.updateTemplate(scope.companyId(), templateId, input);
    }

    private UUID requireEmployee(ScopeService.Scope scope) {
        UUID employee = scopes.employeeIdFor(scope);
        if (employee == null) throw ApiException.forbidden();
        return employee;
    }

    private static void validateZone(String zone) {
        try { ZoneId.of(zone); }
        catch (Exception ex) { throw ApiException.invalid("timeZone must be a valid IANA time zone"); }
    }

    private static java.sql.Timestamp now() { return java.sql.Timestamp.from(Instant.now()); }

    public record SiteInput(@NotBlank @Size(max=120) String name, @NotBlank @Size(max=64) String timeZone) { }
    public record SiteView(UUID id, String name, String timeZone) { }
    public record EmployeeInput(@NotBlank @Size(min=7,max=12) String dni, @NotBlank @Size(max=160) String displayName,
                                @NotEmpty List<@NotNull UUID> siteIds, @Min(0) @Max(240) int toleranceMinutes,
                                @Size(min=12,max=256) String temporaryPassword) { }
    public record EmployeePatch(@Size(min=1,max=160) String displayName, List<@NotNull UUID> siteIds,
                                @Min(0) @Max(240) Integer toleranceMinutes, Boolean active) { }
    public record EmployeeView(UUID id, String displayName, String dni, List<UUID> siteIds, int toleranceMinutes, boolean active, boolean mustChangePassword) { }
    public record PasswordResetView(String temporaryPassword) {
        @Override public String toString() { return "PasswordResetView[temporaryPassword=<redacted>]"; }
    }
    public record BlockInput(@Min(0) @Max(1) int startDayOffset, @NotNull java.time.LocalTime start, @NotNull java.time.LocalTime end, @Min(0) @Max(1) int endDayOffset) { }
    public record TemplateInput(@NotNull UUID siteId, @NotBlank @Size(max=120) String name, @NotEmpty @Size(max=4) List<@NotNull @Valid BlockInput> blocks,
                                @Min(0) @Max(240) int breakfastLimitMinutes, @Min(0) @Max(240) int lunchLimitMinutes) { }
    public record TemplateView(UUID id, UUID siteId, String name, List<BlockInput> blocks, int breakfastLimitMinutes, int lunchLimitMinutes, boolean active) { }
}
