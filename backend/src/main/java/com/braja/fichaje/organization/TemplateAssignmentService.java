package com.braja.fichaje.organization;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.api.DateRanges;
import com.braja.fichaje.security.ScopeService;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;

/**
 * Template assignment per employee and site with a start date (D-20261015-02). Rows are only inserted, never updated or
 * deleted, so the history is the table itself; the template in force on a date is the latest valid_from on or before it.
 */
@Service
public class TemplateAssignmentService {
    private final JdbcTemplate jdbc;
    private final ScopeService scopes;

    public TemplateAssignmentService(JdbcTemplate jdbc, ScopeService scopes) {
        this.jdbc = jdbc;
        this.scopes = scopes;
    }

    @Transactional
    public AssignmentView create(UUID companyId, UUID actorAccountId, UUID employeeId, AssignmentInput input) {
        if (!scopes.companyHasEmployee(companyId, employeeId)) throw ApiException.notFound();
        DateRanges.validateDate(input.validFrom());
        // Shared lock: a concurrent move of the template to another site (OrganizationService.saveTemplate, FOR UPDATE) either
        // waits for this insert and then answers TEMPLATE_IN_USE, or commits first and this read sees the new site.
        String[] template = jdbc.query("SELECT site_id,name FROM schedule_templates WHERE id=? AND company_id=? AND active=TRUE FOR SHARE",
                rs -> rs.next() ? new String[]{rs.getString("site_id"), rs.getString("name")} : null, input.templateId().toString(), companyId.toString());
        if (template == null) throw ApiException.notFound();
        UUID siteId = UUID.fromString(template[0]);
        if (!scopes.employeeHasSite(companyId, employeeId, siteId)) throw ApiException.invalid("The employee is not assigned to the template's site");
        UUID id = UUID.randomUUID();
        Instant createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);
        try {
            jdbc.update("INSERT INTO employee_template_assignments(id,company_id,employee_id,site_id,template_id,valid_from,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    id.toString(), companyId.toString(), employeeId.toString(), siteId.toString(), input.templateId().toString(), input.validFrom(),
                    actorAccountId.toString(), java.sql.Timestamp.from(createdAt));
        } catch (DuplicateKeyException ex) {
            throw ApiException.conflict("ASSIGNMENT_EXISTS", "The employee already has a template assigned at this site from that date");
        }
        return new AssignmentView(id, employeeId, siteId, input.templateId(), template[1], input.validFrom(), createdAt);
    }

    /** The history of an employee, newest start date first. */
    public List<AssignmentView> list(UUID companyId, UUID employeeId) {
        if (!scopes.companyHasEmployee(companyId, employeeId)) throw ApiException.notFound();
        return jdbc.query("SELECT a.id,a.site_id,a.template_id,t.name,a.valid_from,a.created_at FROM employee_template_assignments a " +
                        "JOIN schedule_templates t ON t.id=a.template_id AND t.company_id=a.company_id " +
                        "WHERE a.company_id=? AND a.employee_id=? ORDER BY a.valid_from DESC,a.created_at DESC,a.id",
                (rs, row) -> new AssignmentView(UUID.fromString(rs.getString("id")), employeeId, UUID.fromString(rs.getString("site_id")),
                        UUID.fromString(rs.getString("template_id")), rs.getString("name"), rs.getObject("valid_from", LocalDate.class),
                        rs.getTimestamp("created_at").toInstant()),
                companyId.toString(), employeeId.toString());
    }

    /** The template in force for the employee at the site on that date, or null when no assignment started on or before it. */
    public UUID templateInForce(UUID companyId, UUID employeeId, UUID siteId, LocalDate date) {
        return jdbc.query("SELECT template_id FROM employee_template_assignments WHERE employee_id=? AND company_id=? AND site_id=? AND valid_from<=? " +
                        "ORDER BY valid_from DESC LIMIT 1",
                rs -> rs.next() ? UUID.fromString(rs.getString(1)) : null, employeeId.toString(), companyId.toString(), siteId.toString(), date);
    }

    /**
     * Every assignment at the site that starts on or before {@code upTo}, for all the employees in one query (rule 17):
     * employee -> (valid_from -> template). {@code floorEntry(date)} gives the template in force on a date.
     */
    public Map<UUID, NavigableMap<LocalDate, UUID>> assignmentsUpTo(UUID companyId, UUID siteId, Collection<UUID> employeeIds, LocalDate upTo) {
        Map<UUID, NavigableMap<LocalDate, UUID>> result = new HashMap<>();
        if (employeeIds.isEmpty()) return result;
        List<Object> args = new ArrayList<>(List.of(companyId.toString(), siteId.toString(), upTo));
        employeeIds.forEach(id -> args.add(id.toString()));
        jdbc.query("SELECT employee_id,valid_from,template_id FROM employee_template_assignments WHERE company_id=? AND site_id=? AND valid_from<=? " +
                        "AND employee_id IN (" + String.join(",", Collections.nCopies(employeeIds.size(), "?")) + ")",
                rs -> {
                    result.computeIfAbsent(UUID.fromString(rs.getString("employee_id")), key -> new TreeMap<>())
                            .put(rs.getObject("valid_from", LocalDate.class), UUID.fromString(rs.getString("template_id")));
                }, args.toArray());
        return result;
    }

    public record AssignmentInput(@jakarta.validation.constraints.NotNull UUID templateId, @jakarta.validation.constraints.NotNull LocalDate validFrom) { }
    public record AssignmentView(UUID id, UUID employeeId, UUID siteId, UUID templateId, String templateName, LocalDate validFrom, Instant createdAt) { }
}
