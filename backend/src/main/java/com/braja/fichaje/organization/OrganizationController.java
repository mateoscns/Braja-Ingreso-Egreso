package com.braja.fichaje.organization;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.security.DniNormalizer;
import com.braja.fichaje.security.ScopeService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.ZoneId;
import java.util.*;

@RestController
@RequestMapping("/api/v1")
public class OrganizationController {
    private final JdbcTemplate jdbc;
    private final ScopeService scopes;
    private final PasswordEncoder passwords;

    public OrganizationController(JdbcTemplate jdbc, ScopeService scopes, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.scopes = scopes;
        this.passwords = passwords;
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
                (rs, row) -> employeeView(scope.companyId(), UUID.fromString(rs.getString("id")), rs.getString("display_name"), rs.getInt("tolerance_minutes"), rs.getBoolean("active"), rs.getString("dni_display"), rs.getBoolean("must_change_password")),
                scope.companyId().toString());
    }

    @PostMapping("/employees")
    @ResponseStatus(HttpStatus.CREATED)
    public EmployeeView createEmployee(Authentication auth, HttpSession session, @Valid @RequestBody EmployeeInput input) {
        var scope = scopes.requireAdmin(auth, session);
        validateSites(scope.companyId(), input.siteIds(), true);
        if (input.toleranceMinutes() > 240) throw ApiException.invalid("Tolerance must be between 0 and 240 minutes");
        String dni = DniNormalizer.normalize(input.dni());
        List<String> existing = jdbc.query("SELECT id FROM accounts WHERE dni_normalized=?", (rs, row) -> rs.getString(1), dni);
        UUID accountId;
        boolean mustChange;
        if (existing.isEmpty()) {
            if (input.temporaryPassword() == null || input.temporaryPassword().length() < 12 || input.temporaryPassword().length() > 256) {
                throw ApiException.invalid("A new account requires a temporary password of at least 12 characters");
            }
            accountId = UUID.randomUUID();
            mustChange = true;
            jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,TRUE,TRUE,?,?)",
                    accountId.toString(), dni, input.dni().trim(), passwords.encode(input.temporaryPassword()), now(), now());
        } else {
            accountId = UUID.fromString(existing.getFirst());
            Boolean accountActive = jdbc.queryForObject("SELECT active FROM accounts WHERE id=?", Boolean.class, accountId.toString());
            if (!Boolean.TRUE.equals(accountActive)) {
                throw ApiException.conflict("ACCOUNT_INACTIVE", "An inactive account cannot be added to a company");
            }
            mustChange = jdbc.queryForObject("SELECT must_change_password FROM accounts WHERE id=?", Boolean.class, accountId.toString());
        }
        int hasMembership = jdbc.queryForObject("SELECT COUNT(*) FROM company_memberships WHERE company_id=? AND account_id=?", Integer.class, scope.companyId().toString(), accountId.toString());
        if (hasMembership > 0) throw ApiException.conflict("MEMBERSHIP_EXISTS", "This account already has a role in the active company");
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                UUID.randomUUID().toString(), scope.companyId().toString(), accountId.toString(), now());
        UUID employeeId = UUID.randomUUID();
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,?,TRUE,?,?)",
                employeeId.toString(), scope.companyId().toString(), accountId.toString(), input.displayName().trim(), input.toleranceMinutes(), now(), now());
        for (UUID siteId : input.siteIds()) addEmployeeSite(scope.companyId(), employeeId, siteId);
        return employeeView(scope.companyId(), employeeId, input.displayName().trim(), input.toleranceMinutes(), true,
                existing.isEmpty() ? input.dni().trim() : jdbc.queryForObject("SELECT dni_display FROM accounts WHERE id=?", String.class, accountId.toString()), mustChange);
    }

    @PatchMapping("/employees/{employeeId}")
    @Transactional
    public EmployeeView updateEmployee(Authentication auth, HttpSession session, @PathVariable UUID employeeId, @Valid @RequestBody EmployeePatch input) {
        var scope = scopes.requireAdmin(auth, session);
        ensureEmployee(scope.companyId(), employeeId);
        if (input.displayName() == null && input.siteIds() == null && input.toleranceMinutes() == null && input.active() == null) throw ApiException.invalid("At least one field must be supplied");
        if (input.displayName() != null && input.displayName().isBlank()) throw ApiException.invalid("Display name cannot be blank");
        if (input.toleranceMinutes() != null && (input.toleranceMinutes() < 0 || input.toleranceMinutes() > 240)) throw ApiException.invalid("Tolerance must be between 0 and 240 minutes");
        UUID employeeAccountId = null;
        if (input.active() != null) {
            employeeAccountId = jdbc.queryForObject("SELECT account_id FROM employees WHERE id=? AND company_id=?",
                    (rs, row) -> UUID.fromString(rs.getString(1)), employeeId.toString(), scope.companyId().toString());
            jdbc.update("UPDATE company_memberships SET active=? WHERE company_id=? AND account_id=? AND role='EMPLOYEE'",
                    input.active(), scope.companyId().toString(), employeeAccountId.toString());
        }
        if (input.siteIds() != null) {
            validateSites(scope.companyId(), input.siteIds(), false);
            jdbc.update("DELETE FROM employee_sites WHERE company_id=? AND employee_id=?", scope.companyId().toString(), employeeId.toString());
            for (UUID siteId : input.siteIds()) addEmployeeSite(scope.companyId(), employeeId, siteId);
        }
        jdbc.update("UPDATE employees SET display_name=COALESCE(?,display_name), tolerance_minutes=COALESCE(?,tolerance_minutes), active=COALESCE(?,active), updated_at=? WHERE id=? AND company_id=?",
                input.displayName() == null ? null : input.displayName().trim(), input.toleranceMinutes(), input.active(), now(), employeeId.toString(), scope.companyId().toString());
        return loadEmployee(scope.companyId(), employeeId);
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
        return jdbc.query(sql.toString(), (rs, row) -> templateView(scope.companyId(), UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("site_id")), rs.getString("name"), rs.getInt("breakfast_limit_minutes"), rs.getInt("lunch_limit_minutes"), rs.getBoolean("active")), args.toArray());
    }

    @PostMapping("/templates")
    @ResponseStatus(HttpStatus.CREATED)
    public TemplateView createTemplate(Authentication auth, HttpSession session, @Valid @RequestBody TemplateInput input) {
        var scope = scopes.requireAdmin(auth, session);
        return saveTemplate(scope.companyId(), UUID.randomUUID(), input, false);
    }

    @PatchMapping("/templates/{templateId}")
    public TemplateView updateTemplate(Authentication auth, HttpSession session, @PathVariable UUID templateId, @Valid @RequestBody TemplateInput input) {
        var scope = scopes.requireAdmin(auth, session);
        if (jdbc.queryForList("SELECT id FROM schedule_templates WHERE id=? AND company_id=?", templateId.toString(), scope.companyId().toString()).isEmpty()) throw ApiException.notFound();
        return saveTemplate(scope.companyId(), templateId, input, true);
    }

    private TemplateView saveTemplate(UUID companyId, UUID id, TemplateInput input, boolean update) {
        validateTemplate(input);
        if (!scopes.companyHasSite(companyId, input.siteId())) throw ApiException.notFound();
        if (update) {
            jdbc.update("UPDATE schedule_templates SET site_id=?,name=?,breakfast_limit_minutes=?,lunch_limit_minutes=?,active=TRUE,updated_at=? WHERE id=? AND company_id=?",
                    input.siteId().toString(), input.name().trim(), input.breakfastLimitMinutes(), input.lunchLimitMinutes(), now(), id.toString(), companyId.toString());
            jdbc.update("DELETE FROM template_blocks WHERE template_id=? AND company_id=?", id.toString(), companyId.toString());
        } else {
            jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) VALUES(?,?,?,?,?,?,TRUE,?,?)",
                    id.toString(), companyId.toString(), input.siteId().toString(), input.name().trim(), input.breakfastLimitMinutes(), input.lunchLimitMinutes(), now(), now());
        }
        int sequence = 1;
        for (BlockInput block : input.blocks()) {
            jdbc.update("INSERT INTO template_blocks(id,company_id,template_id,sequence_number,start_day_offset,starts_at,ends_at,end_day_offset) VALUES(?,?,?,?,?,?,?,?)",
                    UUID.randomUUID().toString(), companyId.toString(), id.toString(), sequence++, block.startDayOffset(), block.start(), block.end(), block.endDayOffset());
        }
        return templateView(companyId, id, input.siteId(), input.name().trim(), input.breakfastLimitMinutes(), input.lunchLimitMinutes(), true);
    }

    private void validateTemplate(TemplateInput input) {
        if (input.blocks() == null || input.blocks().isEmpty() || input.blocks().size() > 4) throw ApiException.invalid("A template needs one to four work blocks");
        if (input.breakfastLimitMinutes() < 0 || input.breakfastLimitMinutes() > 240 || input.lunchLimitMinutes() < 0 || input.lunchLimitMinutes() > 240) throw ApiException.invalid("Break limits must be between 0 and 240 minutes");
        int previousEndDay = -1;
        java.time.LocalTime previousEnd = null;
        for (BlockInput block : input.blocks()) {
            if (block.startDayOffset() < 0 || block.startDayOffset() > 1 || block.endDayOffset() < 0 || block.endDayOffset() > 1 || block.endDayOffset() < block.startDayOffset()) throw ApiException.invalid("Block day offsets must be 0 or 1 and end cannot precede start");
            if (block.startDayOffset() == block.endDayOffset() && !block.end().isAfter(block.start())) throw ApiException.invalid("Block end must be after its start");
            if (block.startDayOffset() < previousEndDay || (block.startDayOffset() == previousEndDay && previousEnd != null && block.start().isBefore(previousEnd))) throw ApiException.invalid("Work blocks must be ordered and cannot overlap");
            previousEndDay = block.endDayOffset();
            previousEnd = block.end();
        }
    }

    private TemplateView templateView(UUID companyId, UUID id, UUID siteId, String name, int breakfast, int lunch, boolean active) {
        List<BlockInput> blocks = jdbc.query("SELECT start_day_offset,starts_at,ends_at,end_day_offset FROM template_blocks WHERE template_id=? AND company_id=? ORDER BY sequence_number",
                (rs, row) -> new BlockInput(rs.getInt("start_day_offset"), rs.getTime("starts_at").toLocalTime(), rs.getTime("ends_at").toLocalTime(), rs.getInt("end_day_offset")), id.toString(), companyId.toString());
        return new TemplateView(id, siteId, name, blocks, breakfast, lunch, active);
    }

    private EmployeeView employeeView(UUID companyId, UUID employeeId, String name, int tolerance, boolean active, String dni, boolean mustChange) {
        List<UUID> siteIds = jdbc.query("SELECT site_id FROM employee_sites WHERE company_id=? AND employee_id=? ORDER BY site_id",
                (rs, row) -> UUID.fromString(rs.getString(1)), companyId.toString(), employeeId.toString());
        return new EmployeeView(employeeId, name, dni, siteIds, tolerance, active, mustChange);
    }

    private EmployeeView loadEmployee(UUID companyId, UUID employeeId) {
        return jdbc.query("SELECT e.display_name,e.tolerance_minutes,e.active,a.dni_display,a.must_change_password FROM employees e JOIN accounts a ON a.id=e.account_id WHERE e.id=? AND e.company_id=?",
                rs -> rs.next() ? employeeView(companyId, employeeId, rs.getString("display_name"), rs.getInt("tolerance_minutes"), rs.getBoolean("active"), rs.getString("dni_display"), rs.getBoolean("must_change_password")) : null,
                employeeId.toString(), companyId.toString());
    }

    private UUID requireEmployee(ScopeService.Scope scope) {
        UUID employee = scopes.employeeIdFor(scope);
        if (employee == null) throw ApiException.forbidden();
        return employee;
    }

    private void ensureEmployee(UUID companyId, UUID employeeId) {
        if (jdbc.queryForList("SELECT id FROM employees WHERE id=? AND company_id=?", employeeId.toString(), companyId.toString()).isEmpty()) throw ApiException.notFound();
    }

    private void validateSites(UUID companyId, List<UUID> siteIds, boolean requireOne) {
        if (siteIds == null || (requireOne && siteIds.isEmpty()) || new HashSet<>(siteIds).size() != siteIds.size()) throw ApiException.invalid("At least one unique site is required");
        for (UUID siteId : siteIds) if (!scopes.companyHasSite(companyId, siteId)) throw ApiException.notFound();
    }

    private void addEmployeeSite(UUID companyId, UUID employeeId, UUID siteId) {
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)", companyId.toString(), employeeId.toString(), siteId.toString(), now());
    }

    private static void validateZone(String zone) {
        try { ZoneId.of(zone); }
        catch (Exception ex) { throw ApiException.invalid("timeZone must be a valid IANA time zone"); }
    }

    private static java.sql.Timestamp now() { return java.sql.Timestamp.from(Instant.now()); }

    public record SiteInput(@NotBlank @Size(max=120) String name, @NotBlank @Size(max=64) String timeZone) { }
    public record SiteView(UUID id, String name, String timeZone) { }
    public record EmployeeInput(@NotBlank @Size(min=7,max=12) String dni, @NotBlank @Size(max=160) String displayName,
                                @NotEmpty List<UUID> siteIds, @Min(0) @Max(240) int toleranceMinutes,
                                @Size(min=12,max=256) String temporaryPassword) { }
    public record EmployeePatch(@Size(min=1,max=160) String displayName, List<UUID> siteIds,
                                @Min(0) @Max(240) Integer toleranceMinutes, Boolean active) { }
    public record EmployeeView(UUID id, String displayName, String dni, List<UUID> siteIds, int toleranceMinutes, boolean active, boolean mustChangePassword) { }
    public record BlockInput(@Min(0) @Max(1) int startDayOffset, java.time.LocalTime start, java.time.LocalTime end, @Min(0) @Max(1) int endDayOffset) { }
    public record TemplateInput(@NotNull UUID siteId, @NotBlank @Size(max=120) String name, @NotEmpty @Size(max=4) List<@Valid BlockInput> blocks,
                                @Min(0) @Max(240) int breakfastLimitMinutes, @Min(0) @Max(240) int lunchLimitMinutes) { }
    public record TemplateView(UUID id, UUID siteId, String name, List<BlockInput> blocks, int breakfastLimitMinutes, int lunchLimitMinutes, boolean active) { }
}
