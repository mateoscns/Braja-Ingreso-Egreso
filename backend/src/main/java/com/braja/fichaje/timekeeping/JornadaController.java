package com.braja.fichaje.timekeeping;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.organization.OrganizationController;
import com.braja.fichaje.security.ScopeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.*;
import java.util.*;

@RestController
@RequestMapping("/api/v1/jornadas")
public class JornadaController {
    private final JdbcTemplate jdbc;
    private final ScopeService scopes;
    private final ObjectMapper objectMapper;

    public JornadaController(JdbcTemplate jdbc, ScopeService scopes, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.scopes = scopes;
        this.objectMapper = objectMapper;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public JornadaView declare(Authentication auth, HttpSession session, @Valid @RequestBody DeclareJornada input) {
        var scope = scopes.requireAdmin(auth, session);
        if (!scopes.employeeHasSite(scope.companyId(), input.employeeId(), input.siteId())) throw ApiException.notFound();
        ScheduleRow schedule = jdbc.query("SELECT t.id,t.site_id,t.name,t.breakfast_limit_minutes,t.lunch_limit_minutes,s.time_zone,e.tolerance_minutes " +
                        "FROM schedule_templates t JOIN sites s ON s.id=t.site_id AND s.company_id=t.company_id " +
                        "JOIN employees e ON e.company_id=t.company_id WHERE t.id=? AND t.company_id=? AND t.site_id=? AND t.active=TRUE AND e.id=? AND e.active=TRUE",
                rs -> rs.next() ? new ScheduleRow(rs.getString("id"), rs.getString("site_id"), rs.getString("name"), rs.getInt("breakfast_limit_minutes"), rs.getInt("lunch_limit_minutes"), rs.getString("time_zone"), rs.getInt("tolerance_minutes")) : null,
                input.templateId().toString(), scope.companyId().toString(), input.siteId().toString(), input.employeeId().toString());
        if (schedule == null) throw ApiException.notFound();
        List<OrganizationController.BlockInput> blocks = jdbc.query("SELECT start_day_offset,starts_at,ends_at,end_day_offset FROM template_blocks WHERE company_id=? AND template_id=? ORDER BY sequence_number",
                (rs, row) -> new OrganizationController.BlockInput(rs.getInt("start_day_offset"), rs.getTime("starts_at").toLocalTime(), rs.getTime("ends_at").toLocalTime(), rs.getInt("end_day_offset")),
                scope.companyId().toString(), input.templateId().toString());
        if (blocks.isEmpty()) throw ApiException.invalid("The selected template has no work blocks");
        ZoneId zone = ZoneId.of(schedule.timeZone());
        Instant start = input.localDate().plusDays(blocks.getFirst().startDayOffset()).atTime(blocks.getFirst().start()).atZone(zone).toInstant();
        OrganizationController.BlockInput last = blocks.getLast();
        Instant end = input.localDate().plusDays(last.endDayOffset()).atTime(last.end()).atZone(zone).toInstant();
        if (!end.isAfter(start)) throw ApiException.invalid("The template must end after it starts");
        var snapshot = new OrganizationController.TemplateInput(input.siteId(), schedule.name(), blocks, schedule.breakfastLimit(), schedule.lunchLimit());
        UUID jornadaId = UUID.randomUUID();
        Instant createdAt = Instant.now();
        try {
            jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) " +
                            "VALUES(?,?,?,?,?,?,?,?,?,?,?,'NO_INGRESO',1,?,?)",
                    jornadaId.toString(), scope.companyId().toString(), input.employeeId().toString(), input.siteId().toString(), input.templateId().toString(),
                    input.localDate(), schedule.timeZone(), objectMapper.writeValueAsString(snapshot), schedule.toleranceMinutes(),
                    java.sql.Timestamp.from(start), java.sql.Timestamp.from(end), scope.accountId().toString(), java.sql.Timestamp.from(createdAt));
        } catch (org.springframework.dao.DuplicateKeyException ex) {
            throw ApiException.conflict("JORNADA_EXISTS", "A jornada already exists for this employee, site, and date");
        } catch (com.fasterxml.jackson.core.JsonProcessingException ex) {
            throw new IllegalStateException("Unable to save schedule snapshot", ex);
        }
        return getJornada(scope, jornadaId);
    }

    @GetMapping
    public List<JornadaSummary> list(Authentication auth, HttpSession session, @RequestParam LocalDate from,
                                     @RequestParam LocalDate to, @RequestParam(required=false) UUID employeeId) {
        var scope = scopes.require(auth, session);
        validateRange(from, to);
        UUID targetEmployee;
        if ("ADMIN".equals(scope.role())) targetEmployee = employeeId;
        else {
            if (employeeId != null) throw ApiException.forbidden();
            targetEmployee = scopes.employeeIdFor(scope);
            if (targetEmployee == null) return List.of();
        }
        String sql = "SELECT id,employee_id,site_id,local_date,state FROM jornadas WHERE company_id=? AND local_date BETWEEN ? AND ?" +
                (targetEmployee == null ? "" : " AND employee_id=?") + " ORDER BY local_date DESC,created_at DESC,id";
        Object[] args = targetEmployee == null
                ? new Object[]{scope.companyId().toString(), from, to}
                : new Object[]{scope.companyId().toString(), from, to, targetEmployee.toString()};
        return jdbc.query(sql, (rs, row) -> summary(rs), args);
    }

    @GetMapping("/mine")
    public List<JornadaView> mine(Authentication auth, HttpSession session, @RequestParam LocalDate localDate) {
        var scope = scopes.require(auth, session);
        UUID employeeId = scopes.employeeIdFor(scope);
        if (employeeId == null) return List.of();
        List<String> ids = jdbc.query("SELECT id FROM jornadas WHERE company_id=? AND employee_id=? AND local_date=? ORDER BY created_at,id",
                (rs, row) -> rs.getString(1), scope.companyId().toString(), employeeId.toString(), localDate);
        return ids.stream().map(id -> getJornada(scope, UUID.fromString(id))).toList();
    }

    @GetMapping("/{jornadaId}")
    public JornadaView one(Authentication auth, HttpSession session, @PathVariable UUID jornadaId) {
        return getJornada(scopes.require(auth, session), jornadaId);
    }

    private JornadaView getJornada(ScopeService.Scope scope, UUID jornadaId) {
        JornadaRow row = jdbc.query("SELECT id,employee_id,site_id,local_date,state,next_sequence,schedule_snapshot,tolerance_minutes FROM jornadas WHERE id=? AND company_id=?",
                rs -> rs.next() ? new JornadaRow(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("employee_id")), UUID.fromString(rs.getString("site_id")), rs.getDate("local_date").toLocalDate(), rs.getString("state"), rs.getLong("next_sequence") - 1, rs.getString("schedule_snapshot"), rs.getInt("tolerance_minutes")) : null,
                jornadaId.toString(), scope.companyId().toString());
        if (row == null) throw ApiException.notFound();
        if ("EMPLOYEE".equals(scope.role()) && !row.employeeId().equals(scopes.employeeIdFor(scope))) throw ApiException.notFound();
        OrganizationController.TemplateInput snapshot;
        try { snapshot = objectMapper.readValue(row.snapshot(), OrganizationController.TemplateInput.class); }
        catch (Exception ex) { throw new IllegalStateException("Stored schedule snapshot is invalid", ex); }
        List<MarkView> marks = jdbc.query("SELECT id,jornada_id,action,sequence_number,accepted_at,occurred_at,recorded_at,location_status,latitude,longitude FROM mark_events WHERE company_id=? AND jornada_id=? ORDER BY timeline_order,sequence_number",
                (rs, index) -> new MarkView(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("jornada_id")), rs.getString("action"), rs.getLong("sequence_number"),
                        rs.getTimestamp("accepted_at").toInstant(), rs.getTimestamp("occurred_at").toInstant(), rs.getTimestamp("recorded_at").toInstant(), rs.getString("location_status"),
                        "ADMIN".equals(scope.role()) ? nullableDouble(rs.getObject("latitude")) : null, "ADMIN".equals(scope.role()) ? nullableDouble(rs.getObject("longitude")) : null, List.of()),
                scope.companyId().toString(), jornadaId.toString());
        return new JornadaView(row.id(), row.employeeId(), row.siteId(), row.localDate(), row.state(), snapshot, row.toleranceMinutes(), row.sequence(), marks);
    }

    private JornadaSummary summary(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new JornadaSummary(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("employee_id")), UUID.fromString(rs.getString("site_id")), rs.getDate("local_date").toLocalDate(), rs.getString("state"));
    }

    private static Double nullableDouble(Object value) { return value == null ? null : ((Number) value).doubleValue(); }
    private static void validateRange(LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from) || to.isAfter(from.plusDays(366))) throw ApiException.invalid("Date range must be ordered and no longer than 366 days");
    }

    private record ScheduleRow(String templateId, String siteId, String name, int breakfastLimit, int lunchLimit, String timeZone, int toleranceMinutes) { }
    private record JornadaRow(UUID id, UUID employeeId, UUID siteId, LocalDate localDate, String state, long sequence, String snapshot, int toleranceMinutes) { }
    public record DeclareJornada(@NotNull UUID employeeId, @NotNull UUID siteId, @NotNull LocalDate localDate, @NotNull UUID templateId) { }
    public record JornadaSummary(UUID id, UUID employeeId, UUID siteId, LocalDate localDate, String state) { }
    public record JornadaView(UUID id, UUID employeeId, UUID siteId, LocalDate localDate, String state,
                              OrganizationController.TemplateInput scheduleSnapshot, int toleranceMinutes, long sequence, List<MarkView> marks) { }
    public record MarkView(UUID id, UUID jornadaId, String action, long sequence, Instant acceptedAt, Instant occurredAt, Instant recordedAt,
                           String locationStatus, Double latitude, Double longitude, List<Object> deviations) { }
}
