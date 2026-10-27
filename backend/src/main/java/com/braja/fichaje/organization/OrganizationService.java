package com.braja.fichaje.organization;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.organization.OrganizationController.BlockInput;
import com.braja.fichaje.organization.OrganizationController.EmployeeInput;
import com.braja.fichaje.organization.OrganizationController.EmployeePatch;
import com.braja.fichaje.organization.OrganizationController.EmployeeView;
import com.braja.fichaje.organization.OrganizationController.TemplateInput;
import com.braja.fichaje.organization.OrganizationController.TemplateView;
import com.braja.fichaje.security.DniNormalizer;
import com.braja.fichaje.security.ScopeService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

/**
 * Owns the transaction of every multi-statement organization write, so a failure halfway never leaves
 * a membership without employee or a template without blocks.
 */
@Service
public class OrganizationService {
    private final JdbcTemplate jdbc;
    private final ScopeService scopes;
    private final PasswordEncoder passwords;

    public OrganizationService(JdbcTemplate jdbc, ScopeService scopes, PasswordEncoder passwords) {
        this.jdbc = jdbc;
        this.scopes = scopes;
        this.passwords = passwords;
    }

    @Transactional
    public EmployeeView createEmployee(UUID companyId, EmployeeInput input) {
        validateSites(companyId, input.siteIds(), true);
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
        int hasMembership = jdbc.queryForObject("SELECT COUNT(*) FROM company_memberships WHERE company_id=? AND account_id=?", Integer.class, companyId.toString(), accountId.toString());
        if (hasMembership > 0) throw ApiException.conflict("MEMBERSHIP_EXISTS", "This account already has a role in the active company");
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), accountId.toString(), now());
        UUID employeeId = UUID.randomUUID();
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) VALUES(?,?,?,?,?,TRUE,?,?)",
                employeeId.toString(), companyId.toString(), accountId.toString(), input.displayName().trim(), input.toleranceMinutes(), now(), now());
        for (UUID siteId : input.siteIds()) addEmployeeSite(companyId, employeeId, siteId);
        return employeeView(companyId, employeeId, input.displayName().trim(), input.toleranceMinutes(), true,
                existing.isEmpty() ? input.dni().trim() : jdbc.queryForObject("SELECT dni_display FROM accounts WHERE id=?", String.class, accountId.toString()), mustChange);
    }

    @Transactional
    public EmployeeView updateEmployee(UUID companyId, UUID employeeId, EmployeePatch input) {
        if (jdbc.queryForList("SELECT id FROM employees WHERE id=? AND company_id=?", employeeId.toString(), companyId.toString()).isEmpty()) throw ApiException.notFound();
        if (input.displayName() == null && input.siteIds() == null && input.toleranceMinutes() == null && input.active() == null) throw ApiException.invalid("At least one field must be supplied");
        if (input.displayName() != null && input.displayName().isBlank()) throw ApiException.invalid("Display name cannot be blank");
        if (input.toleranceMinutes() != null && (input.toleranceMinutes() < 0 || input.toleranceMinutes() > 240)) throw ApiException.invalid("Tolerance must be between 0 and 240 minutes");
        if (input.active() != null) {
            UUID employeeAccountId = jdbc.queryForObject("SELECT account_id FROM employees WHERE id=? AND company_id=?",
                    (rs, row) -> UUID.fromString(rs.getString(1)), employeeId.toString(), companyId.toString());
            jdbc.update("UPDATE company_memberships SET active=? WHERE company_id=? AND account_id=? AND role='EMPLOYEE'",
                    input.active(), companyId.toString(), employeeAccountId.toString());
        }
        if (input.siteIds() != null) {
            validateSites(companyId, input.siteIds(), false);
            jdbc.update("DELETE FROM employee_sites WHERE company_id=? AND employee_id=?", companyId.toString(), employeeId.toString());
            for (UUID siteId : input.siteIds()) addEmployeeSite(companyId, employeeId, siteId);
        }
        jdbc.update("UPDATE employees SET display_name=COALESCE(?,display_name), tolerance_minutes=COALESCE(?,tolerance_minutes), active=COALESCE(?,active), updated_at=? WHERE id=? AND company_id=?",
                input.displayName() == null ? null : input.displayName().trim(), input.toleranceMinutes(), input.active(), now(), employeeId.toString(), companyId.toString());
        return loadEmployee(companyId, employeeId);
    }

    @Transactional
    public TemplateView createTemplate(UUID companyId, TemplateInput input) {
        return saveTemplate(companyId, UUID.randomUUID(), input, false);
    }

    @Transactional
    public TemplateView updateTemplate(UUID companyId, UUID templateId, TemplateInput input) {
        if (jdbc.queryForList("SELECT id FROM schedule_templates WHERE id=? AND company_id=?", templateId.toString(), companyId.toString()).isEmpty()) throw ApiException.notFound();
        return saveTemplate(companyId, templateId, input, true);
    }

    private TemplateView saveTemplate(UUID companyId, UUID id, TemplateInput input, boolean update) {
        validateTemplate(input);
        if (!scopes.companyHasSite(companyId, input.siteId())) throw ApiException.notFound();
        if (update) {
            // Declared jornadas reference (template, site): moving a used template would break fk_jornada_template.
            String currentSite = jdbc.query("SELECT site_id FROM schedule_templates WHERE id=? AND company_id=? FOR UPDATE",
                    rs -> rs.next() ? rs.getString(1) : null, id.toString(), companyId.toString());
            if (currentSite == null) throw ApiException.notFound();
            if (!currentSite.equals(input.siteId().toString()) && !jdbc.queryForList("SELECT id FROM jornadas WHERE company_id=? AND template_id=? LIMIT 1 FOR SHARE",
                    companyId.toString(), id.toString()).isEmpty()) {
                throw ApiException.conflict("TEMPLATE_IN_USE", "A template already used by jornadas cannot move to another site; create a new template for that site");
            }
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
        if (input.blocks().stream().anyMatch(block -> block == null || block.start() == null || block.end() == null)) throw ApiException.invalid("Every block needs a start and an end");
        // The jornada date is the local date of its first block (openapi.yaml TemplateInput).
        if (input.blocks().getFirst().startDayOffset() != 0) throw ApiException.invalid("The first block must start on day offset 0");
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

    public TemplateView templateView(UUID companyId, UUID id, UUID siteId, String name, int breakfast, int lunch, boolean active) {
        List<BlockInput> blocks = jdbc.query("SELECT start_day_offset,starts_at,ends_at,end_day_offset FROM template_blocks WHERE template_id=? AND company_id=? ORDER BY sequence_number",
                (rs, row) -> new BlockInput(rs.getInt("start_day_offset"), rs.getTime("starts_at").toLocalTime(), rs.getTime("ends_at").toLocalTime(), rs.getInt("end_day_offset")), id.toString(), companyId.toString());
        return new TemplateView(id, siteId, name, blocks, breakfast, lunch, active);
    }

    public EmployeeView employeeView(UUID companyId, UUID employeeId, String name, int tolerance, boolean active, String dni, boolean mustChange) {
        List<UUID> siteIds = jdbc.query("SELECT site_id FROM employee_sites WHERE company_id=? AND employee_id=? ORDER BY site_id",
                (rs, row) -> UUID.fromString(rs.getString(1)), companyId.toString(), employeeId.toString());
        return new EmployeeView(employeeId, name, dni, siteIds, tolerance, active, mustChange);
    }

    private EmployeeView loadEmployee(UUID companyId, UUID employeeId) {
        return jdbc.query("SELECT e.display_name,e.tolerance_minutes,e.active,a.dni_display,a.must_change_password FROM employees e JOIN accounts a ON a.id=e.account_id WHERE e.id=? AND e.company_id=?",
                rs -> rs.next() ? employeeView(companyId, employeeId, rs.getString("display_name"), rs.getInt("tolerance_minutes"), rs.getBoolean("active"), rs.getString("dni_display"), rs.getBoolean("must_change_password")) : null,
                employeeId.toString(), companyId.toString());
    }

    private void validateSites(UUID companyId, List<UUID> siteIds, boolean requireOne) {
        if (siteIds == null || (requireOne && siteIds.isEmpty()) || siteIds.stream().anyMatch(java.util.Objects::isNull) || new HashSet<>(siteIds).size() != siteIds.size()) throw ApiException.invalid("At least one unique site is required");
        for (UUID siteId : siteIds) if (!scopes.companyHasSite(companyId, siteId)) throw ApiException.notFound();
    }

    private void addEmployeeSite(UUID companyId, UUID employeeId, UUID siteId) {
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)", companyId.toString(), employeeId.toString(), siteId.toString(), now());
    }

    private static java.sql.Timestamp now() { return java.sql.Timestamp.from(Instant.now()); }
}
