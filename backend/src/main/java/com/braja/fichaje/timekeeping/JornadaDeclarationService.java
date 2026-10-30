package com.braja.fichaje.timekeeping;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.api.DateRanges;
import com.braja.fichaje.organization.OrganizationController.BlockInput;
import com.braja.fichaje.organization.OrganizationController.TemplateInput;
import com.braja.fichaje.organization.TemplateAssignmentService;
import com.braja.fichaje.security.ScopeService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.*;

/**
 * Declares jornadas, one (POST /jornadas) or by lot (POST /jornadas/bulk, D-20261027-11), with the same template snapshot,
 * tolerance and scheduled start and end. Without a template, the employee's assignment in force on that date is used
 * (D-20261015-02). Locks: the templates used are read FOR SHARE (a move to another site waits) and then the jornadas are
 * inserted; uq_jornada_employee_site_active_date (V19) stays the last defence against a second live jornada.
 */
@Service
public class JornadaDeclarationService {
    static final int MAX_BULK_EMPLOYEES = 200;
    static final int MAX_BULK_DAYS = 31;
    static final String JORNADA_EXISTS = "JORNADA_EXISTS";
    static final String TEMPLATE_REQUIRED = "TEMPLATE_REQUIRED";
    static final String TEMPLATE_INVALID = "TEMPLATE_INVALID";

    private final JdbcTemplate jdbc;
    private final ScopeService scopes;
    private final ObjectMapper objectMapper;
    private final TemplateAssignmentService assignments;

    public JornadaDeclarationService(JdbcTemplate jdbc, ScopeService scopes, ObjectMapper objectMapper, TemplateAssignmentService assignments) {
        this.jdbc = jdbc;
        this.scopes = scopes;
        this.objectMapper = objectMapper;
        this.assignments = assignments;
    }

    @Transactional
    public UUID declare(ScopeService.Scope scope, JornadaController.DeclareJornada input) {
        UUID companyId = scope.companyId();
        DateRanges.validateDate(input.localDate());
        if (!scopes.employeeHasSite(companyId, input.employeeId(), input.siteId())) throw ApiException.notFound();
        UUID templateId = input.templateId() != null ? input.templateId()
                : assignments.templateInForce(companyId, input.employeeId(), input.siteId(), input.localDate());
        if (templateId == null) throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, TEMPLATE_REQUIRED, "The employee has no template assigned at this site on that date; choose a template");
        Template template = loadTemplates(companyId, input.siteId(), Set.of(templateId)).get(templateId);
        Integer tolerance = jdbc.query("SELECT tolerance_minutes FROM employees WHERE id=? AND company_id=? AND active=TRUE",
                rs -> rs.next() ? rs.getInt(1) : null, input.employeeId().toString(), companyId.toString());
        SiteConfiguration site = siteConfiguration(companyId, input.siteId());
        String timeZone = site == null ? null : site.timeZone();
        if (template == null || tolerance == null || timeZone == null) throw ApiException.notFound();
        String problem = template.problem();
        if (problem != null) throw ApiException.invalid(problem);
        Instant[] window = template.window(ZoneId.of(timeZone), input.localDate());
        if (window == null) throw ApiException.invalid("The template must end after it starts");
        UUID jornadaId = UUID.randomUUID();
        if (!insert(jornadaId, companyId, input.employeeId(), input.siteId(), template, input.localDate(), site, snapshot(template, input.siteId()),
                tolerance, window, scope.accountId(), Instant.now())) {
            throw ApiException.conflict(JORNADA_EXISTS, "A jornada already exists for this employee, site, and date");
        }
        return jornadaId;
    }

    /**
     * One transaction for the whole lot. Reads are set-based (employees, assignments, templates, existing jornadas); inserts
     * go one by one in a fixed order (employee id, then date), so two lots wait for each other instead of deadlocking. A
     * jornada committed by a concurrent declaration after the read makes its insert hit the unique key: MySQL rolls back only
     * that statement, and the date is reported as JORNADA_EXISTS instead of failing the lot.
     */
    @Transactional
    public BulkResult declareBulk(ScopeService.Scope scope, BulkDeclaration input) {
        UUID companyId = scope.companyId();
        List<LocalDate> dates = bulkDates(input);
        // Lock/read the site configuration once for the whole lot; all created jornadas share one point-in-time snapshot.
        SiteConfiguration site = siteConfiguration(companyId, input.siteId());
        String timeZone = site == null ? null : site.timeZone();
        if (timeZone == null) throw ApiException.notFound();
        List<UUID> employees = input.employeeIds().stream().sorted(Comparator.comparing(UUID::toString)).toList();
        Map<UUID, Integer> tolerances = bulkEmployees(companyId, input.siteId(), employees);
        Map<UUID, NavigableMap<LocalDate, UUID>> assigned = input.templateId() != null ? Map.of()
                : assignments.assignmentsUpTo(companyId, input.siteId(), employees, input.to());
        Set<UUID> templateIds = new HashSet<>();
        if (input.templateId() != null) templateIds.add(input.templateId());
        assigned.values().forEach(byDate -> templateIds.addAll(byDate.values()));
        Map<UUID, Template> templates = loadTemplates(companyId, input.siteId(), templateIds);
        if (input.templateId() != null) {
            Template chosen = templates.get(input.templateId());
            if (chosen == null) throw ApiException.notFound();
            if (chosen.problem() != null) throw ApiException.invalid(chosen.problem());
        }
        Set<String> existing = new HashSet<>(existingJornadas(companyId, input.siteId(), employees, input.from(), input.to()));
        ZoneId zone = ZoneId.of(timeZone);
        Instant createdAt = Instant.now();
        Map<UUID, String> snapshots = new HashMap<>();
        List<CreatedJornada> created = new ArrayList<>();
        List<SkippedJornada> skipped = new ArrayList<>();
        for (UUID employeeId : employees) {
            for (LocalDate date : dates) {
                if (existing.contains(key(employeeId, date))) { skipped.add(new SkippedJornada(employeeId, date, JORNADA_EXISTS)); continue; }
                UUID templateId = input.templateId() != null ? input.templateId() : inForce(assigned.get(employeeId), date);
                if (templateId == null) { skipped.add(new SkippedJornada(employeeId, date, TEMPLATE_REQUIRED)); continue; }
                Template template = templates.get(templateId);
                Instant[] window = template == null || template.problem() != null ? null : template.window(zone, date);
                if (window == null) { skipped.add(new SkippedJornada(employeeId, date, TEMPLATE_INVALID)); continue; }
                String snapshot = snapshots.computeIfAbsent(templateId, id -> snapshot(template, input.siteId()));
                UUID jornadaId = UUID.randomUUID();
                if (insert(jornadaId, companyId, employeeId, input.siteId(), template, date, site, snapshot, tolerances.get(employeeId), window, scope.accountId(), createdAt)) {
                    created.add(new CreatedJornada(jornadaId, employeeId, input.siteId(), date, "NO_INGRESO"));
                } else skipped.add(new SkippedJornada(employeeId, date, JORNADA_EXISTS));
            }
        }
        return new BulkResult(created, skipped);
    }

    /** Validates the lot bounds (rule 15) and returns the dates in range whose ISO weekday was selected. */
    private static List<LocalDate> bulkDates(BulkDeclaration input) {
        List<UUID> employees = input.employeeIds();
        if (employees == null || employees.isEmpty() || employees.size() > MAX_BULK_EMPLOYEES || employees.stream().anyMatch(Objects::isNull)
                || new HashSet<>(employees).size() != employees.size()) {
            throw ApiException.invalid("Choose between 1 and " + MAX_BULK_EMPLOYEES + " different employees");
        }
        List<Integer> weekdays = input.weekdays();
        if (weekdays == null || weekdays.isEmpty() || weekdays.stream().anyMatch(day -> day == null || day < 1 || day > 7)) {
            throw ApiException.invalid("Choose at least one weekday between 1 (Monday) and 7 (Sunday)");
        }
        if (input.siteId() == null || input.from() == null || input.to() == null) throw ApiException.invalid("siteId, from and to are required");
        DateRanges.validateDate(input.from());
        DateRanges.validateDate(input.to());
        if (input.to().isBefore(input.from()) || input.to().isAfter(input.from().plusDays(MAX_BULK_DAYS - 1))) {
            throw ApiException.invalid("The range must be ordered and no longer than " + MAX_BULK_DAYS + " days");
        }
        Set<Integer> selected = new HashSet<>(weekdays);
        List<LocalDate> dates = new ArrayList<>();
        for (LocalDate date = input.from(); !date.isAfter(input.to()); date = date.plusDays(1)) {
            if (selected.contains(date.getDayOfWeek().getValue())) dates.add(date);
        }
        return dates;
    }

    /** Tolerance of each employee; the whole lot is rejected before writing if one is absent, inactive or not at the site. */
    private Map<UUID, Integer> bulkEmployees(UUID companyId, UUID siteId, List<UUID> employees) {
        List<Object> args = new ArrayList<>(List.of(siteId.toString(), companyId.toString()));
        employees.forEach(id -> args.add(id.toString()));
        Map<UUID, Integer> tolerances = new HashMap<>();
        boolean[] ineligible = {false};
        jdbc.query("SELECT e.id,e.active,e.tolerance_minutes,EXISTS(SELECT 1 FROM employee_sites es WHERE es.company_id=e.company_id AND es.employee_id=e.id AND es.site_id=?) AS at_site " +
                        "FROM employees e WHERE e.company_id=? AND e.id IN (" + placeholders(employees.size()) + ")",
                rs -> {
                    tolerances.put(UUID.fromString(rs.getString("id")), rs.getInt("tolerance_minutes"));
                    if (!rs.getBoolean("active") || !rs.getBoolean("at_site")) ineligible[0] = true;
                }, args.toArray());
        if (tolerances.size() != employees.size()) throw ApiException.notFound();
        if (ineligible[0]) throw ApiException.invalid("Every employee must be active and assigned to the site");
        return tolerances;
    }

    private List<String> existingJornadas(UUID companyId, UUID siteId, List<UUID> employees, LocalDate from, LocalDate to) {
        List<Object> args = new ArrayList<>(List.of(companyId.toString(), siteId.toString(), from, to));
        employees.forEach(id -> args.add(id.toString()));
        return jdbc.query("SELECT employee_id,local_date FROM jornadas WHERE company_id=? AND site_id=? AND state<>'CANCELADA' AND local_date BETWEEN ? AND ? " +
                        "AND employee_id IN (" + placeholders(employees.size()) + ")",
                (rs, row) -> key(UUID.fromString(rs.getString("employee_id")), rs.getObject("local_date", LocalDate.class)), args.toArray());
    }

    /** Active templates of the site with their blocks, in two queries; the template rows are share-locked until commit. */
    private Map<UUID, Template> loadTemplates(UUID companyId, UUID siteId, Set<UUID> templateIds) {
        Map<UUID, Template> templates = new HashMap<>();
        if (templateIds.isEmpty()) return templates;
        List<Object> args = new ArrayList<>(List.of(companyId.toString(), siteId.toString()));
        templateIds.forEach(id -> args.add(id.toString()));
        jdbc.query("SELECT id,name,breakfast_limit_minutes,lunch_limit_minutes FROM schedule_templates WHERE company_id=? AND site_id=? AND active=TRUE " +
                        "AND id IN (" + placeholders(templateIds.size()) + ") FOR SHARE",
                rs -> {
                    UUID id = UUID.fromString(rs.getString("id"));
                    templates.put(id, new Template(id, rs.getString("name"), rs.getInt("breakfast_limit_minutes"), rs.getInt("lunch_limit_minutes"), new ArrayList<>()));
                }, args.toArray());
        if (templates.isEmpty()) return templates;
        List<Object> blockArgs = new ArrayList<>(List.of(companyId.toString()));
        templates.keySet().forEach(id -> blockArgs.add(id.toString()));
        jdbc.query("SELECT template_id,start_day_offset,starts_at,ends_at,end_day_offset FROM template_blocks WHERE company_id=? " +
                        "AND template_id IN (" + placeholders(templates.size()) + ") ORDER BY template_id,sequence_number",
                rs -> {
                    templates.get(UUID.fromString(rs.getString("template_id"))).blocks().add(new BlockInput(rs.getInt("start_day_offset"),
                            rs.getTime("starts_at").toLocalTime(), rs.getTime("ends_at").toLocalTime(), rs.getInt("end_day_offset")));
                }, blockArgs.toArray());
        return templates;
    }

    private SiteConfiguration siteConfiguration(UUID companyId, UUID siteId) {
        return jdbc.query("SELECT time_zone,latitude,longitude,geofence_radius_meters FROM sites WHERE id=? AND company_id=? FOR SHARE",
                rs -> rs.next() ? new SiteConfiguration(rs.getString("time_zone"), rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude"),
                        rs.getInt("geofence_radius_meters")) : null, siteId.toString(), companyId.toString());
    }

    private String snapshot(Template template, UUID siteId) {
        try {
            return objectMapper.writeValueAsString(new TemplateInput(siteId, template.name(), template.blocks(), template.breakfastLimit(), template.lunchLimit()));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Unable to save schedule snapshot", ex);
        }
    }

    /** False when the employee already has a live jornada at the site on that date (uq_jornada_employee_site_active_date). */
    private boolean insert(UUID jornadaId, UUID companyId, UUID employeeId, UUID siteId, Template template, LocalDate localDate, SiteConfiguration site,
                           String snapshot, int tolerance, Instant[] window, UUID createdBy, Instant createdAt) {
        try {
            jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,site_geofence_latitude_snapshot,site_geofence_longitude_snapshot,site_geofence_radius_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) " +
                            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,'NO_INGRESO',1,?,?)",
                    jornadaId.toString(), companyId.toString(), employeeId.toString(), siteId.toString(), template.id().toString(), localDate, site.timeZone(), snapshot,
                    site.latitude(), site.longitude(), site.latitude() == null ? null : site.geofenceRadiusMeters(), tolerance,
                    java.sql.Timestamp.from(window[0]), java.sql.Timestamp.from(window[1]), createdBy.toString(), java.sql.Timestamp.from(createdAt));
            return true;
        } catch (DuplicateKeyException ex) {
            return false;
        }
    }

    private static UUID inForce(NavigableMap<LocalDate, UUID> byDate, LocalDate date) {
        if (byDate == null) return null;
        Map.Entry<LocalDate, UUID> entry = byDate.floorEntry(date);
        return entry == null ? null : entry.getValue();
    }

    private static String key(UUID employeeId, LocalDate date) { return employeeId + "|" + date; }

    private static String placeholders(int count) { return String.join(",", Collections.nCopies(count, "?")); }

    private record Template(UUID id, String name, int breakfastLimit, int lunchLimit, List<BlockInput> blocks) {
        /** Why the template cannot be declared as is, or null. */
        String problem() {
            if (blocks.isEmpty()) return "The selected template has no work blocks";
            // The jornada date is the local date of its first block; templates saved before that rule may still start on day 1.
            if (blocks.getFirst().startDayOffset() != 0) return "The selected template's first block must start on day offset 0; update the template";
            return null;
        }

        /** Scheduled start and end on that local date in the site zone, or null when the end does not come after the start. */
        Instant[] window(ZoneId zone, LocalDate localDate) {
            Instant start = localDate.plusDays(blocks.getFirst().startDayOffset()).atTime(blocks.getFirst().start()).atZone(zone).toInstant();
            BlockInput last = blocks.getLast();
            Instant end = localDate.plusDays(last.endDayOffset()).atTime(last.end()).atZone(zone).toInstant();
            return end.isAfter(start) ? new Instant[]{start, end} : null;
        }
    }

    private record SiteConfiguration(String timeZone, BigDecimal latitude, BigDecimal longitude, Integer geofenceRadiusMeters) { }

    /** weekdays are ISO (1 = Monday ... 7 = Sunday); templateId is optional (each employee's assignment in force otherwise). */
    public record BulkDeclaration(@NotNull @Size(min = 1, max = MAX_BULK_EMPLOYEES) List<@NotNull UUID> employeeIds, @NotNull UUID siteId,
                                  @NotNull LocalDate from, @NotNull LocalDate to,
                                  @NotNull @Size(min = 1, max = 7) List<@NotNull @Min(1) @Max(7) Integer> weekdays, UUID templateId) { }
    public record BulkResult(List<CreatedJornada> created, List<SkippedJornada> skipped) { }
    public record CreatedJornada(UUID id, UUID employeeId, UUID siteId, LocalDate localDate, String state) { }
    /** reason: JORNADA_EXISTS, TEMPLATE_REQUIRED (no assignment in force) or TEMPLATE_INVALID (assigned template unusable). */
    public record SkippedJornada(UUID employeeId, LocalDate localDate, String reason) { }
}
