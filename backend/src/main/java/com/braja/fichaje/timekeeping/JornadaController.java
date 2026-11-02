package com.braja.fichaje.timekeeping;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.deviations.DeviationService;
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
    private static final String JORNADA_COLUMNS = "id,employee_id,site_id,local_date,state,next_sequence,schedule_snapshot,tolerance_minutes,cancelled_at,cancel_reason";

    private final JdbcTemplate jdbc;
    private final ScopeService scopes;
    private final ObjectMapper objectMapper;
    private final JornadaHistoryService history;
    private final JornadaDeclarationService declarations;

    public JornadaController(JdbcTemplate jdbc, ScopeService scopes, ObjectMapper objectMapper, JornadaHistoryService history, JornadaDeclarationService declarations) {
        this.jdbc = jdbc;
        this.scopes = scopes;
        this.objectMapper = objectMapper;
        this.history = history;
        this.declarations = declarations;
    }

    /** Without templateId, the employee's assignment in force at the site on that date is used (D-20261015-02). */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public JornadaView declare(Authentication auth, HttpSession session, @Valid @RequestBody DeclareJornada input) {
        var scope = scopes.requireAdmin(auth, session);
        return getJornada(scope, declarations.declare(scope, input));
    }

    /** Declares by lot (D-20261027-11): each jornada once, no stored rule; existing ones and dates without template are reported. */
    @PostMapping("/bulk")
    public JornadaDeclarationService.BulkResult declareBulk(Authentication auth, HttpSession session,
                                                            @Valid @RequestBody JornadaDeclarationService.BulkDeclaration input) {
        return declarations.declareBulk(scopes.requireAdmin(auth, session), input);
    }

    @GetMapping
    public List<JornadaSummary> list(Authentication auth, HttpSession session, @RequestParam LocalDate from,
                                     @RequestParam LocalDate to, @RequestParam(required=false) UUID employeeId,
                                     @RequestParam(required=false) UUID siteId, @RequestParam(defaultValue="false") boolean includeDetail) {
        return history.list(scopes.require(auth, session), from, to, employeeId, siteId, includeDetail);
    }

    @GetMapping("/mine")
    public List<JornadaView> mine(Authentication auth, HttpSession session, @RequestParam LocalDate localDate) {
        var scope = scopes.require(auth, session);
        UUID employeeId = scopes.employeeIdFor(scope);
        if (employeeId == null) return List.of();
        // One query for the jornadas and one for all their marks, never one per jornada (CLAUDE.md rule 17, #75). The list is
        // bounded: one active jornada per site and date (uq_jornada_employee_site_active_date) plus cancelled ones.
        List<JornadaRow> rows = jdbc.query("SELECT " + JORNADA_COLUMNS + " FROM jornadas WHERE company_id=? AND employee_id=? AND local_date=? ORDER BY created_at,id",
                (rs, row) -> jornadaRow(rs), scope.companyId().toString(), employeeId.toString(), localDate);
        return jornadaViews(scope, rows);
    }

    @GetMapping("/{jornadaId}")
    public JornadaView one(Authentication auth, HttpSession session, @PathVariable UUID jornadaId) {
        return getJornada(scopes.require(auth, session), jornadaId);
    }

    private JornadaView getJornada(ScopeService.Scope scope, UUID jornadaId) {
        JornadaRow row = jdbc.query("SELECT " + JORNADA_COLUMNS + " FROM jornadas WHERE id=? AND company_id=?",
                rs -> rs.next() ? jornadaRow(rs) : null, jornadaId.toString(), scope.companyId().toString());
        if (row == null) throw ApiException.notFound();
        if ("EMPLOYEE".equals(scope.role()) && !row.employeeId().equals(scopes.employeeIdFor(scope))) throw ApiException.notFound();
        return jornadaViews(scope, List.of(row)).getFirst();
    }

    /** Builds the views of jornadas the caller may read, loading the marks of all of them in one query. */
    private List<JornadaView> jornadaViews(ScopeService.Scope scope, List<JornadaRow> rows) {
        boolean admin = "ADMIN".equals(scope.role());
        Map<UUID, List<MarkView>> marks = history.marks(scope, rows.stream().map(JornadaRow::id).toList());
        // The cancellation reason is written by the ADMIN and may name a licence: only the ADMIN reads it.
        return rows.stream().map(row -> new JornadaView(row.id(), row.employeeId(), row.siteId(), row.localDate(), row.state(), snapshot(row),
                row.toleranceMinutes(), row.sequence(), marks.getOrDefault(row.id(), List.of()), row.cancelledAt(), admin ? row.cancelReason() : null)).toList();
    }

    private OrganizationController.TemplateInput snapshot(JornadaRow row) {
        try { return objectMapper.readValue(row.snapshot(), OrganizationController.TemplateInput.class); }
        catch (Exception ex) { throw new IllegalStateException("Stored schedule snapshot is invalid", ex); }
    }

    /** Maps a jornadas row selected with {@link #JORNADA_COLUMNS}. */
    private static JornadaRow jornadaRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        java.sql.Timestamp cancelledAt = rs.getTimestamp("cancelled_at");
        return new JornadaRow(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("employee_id")), UUID.fromString(rs.getString("site_id")),
                rs.getObject("local_date", LocalDate.class), rs.getString("state"), rs.getLong("next_sequence") - 1, rs.getString("schedule_snapshot"),
                rs.getInt("tolerance_minutes"), cancelledAt == null ? null : cancelledAt.toInstant(), rs.getString("cancel_reason"));
    }

    /**
     * Maps a mark_events row (columns id..longitude, voided_at, void_reason). Coordinates and the void time and reason are only
     * exposed to ADMIN; everyone sees whether the mark was voided (D-20261027-08).
     */
    static MarkView markView(java.sql.ResultSet rs, boolean admin) throws java.sql.SQLException {
        java.sql.Timestamp voidedAt = rs.getTimestamp("voided_at");
        return new MarkView(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("jornada_id")), rs.getString("action"), rs.getLong("sequence_number"),
                rs.getTimestamp("accepted_at").toInstant(), rs.getTimestamp("occurred_at").toInstant(), rs.getTimestamp("recorded_at").toInstant(), rs.getString("location_status"),
                admin ? nullableDouble(rs.getObject("latitude")) : null, admin ? nullableDouble(rs.getObject("longitude")) : null,
                voidedAt != null, admin && voidedAt != null ? voidedAt.toInstant() : null, admin ? rs.getString("void_reason") : null, List.of());
    }

    private static Double nullableDouble(Object value) { return value == null ? null : ((Number) value).doubleValue(); }

    private record JornadaRow(UUID id, UUID employeeId, UUID siteId, LocalDate localDate, String state, long sequence, String snapshot, int toleranceMinutes,
                              Instant cancelledAt, String cancelReason) { }
    /** templateId is optional: without it the assignment in force is used, or 422 TEMPLATE_REQUIRED. */
    public record DeclareJornada(@NotNull UUID employeeId, @NotNull UUID siteId, @NotNull LocalDate localDate, UUID templateId) { }
    /** includeDetail=true adds marks and deviations (absent otherwise); employeeDisplayName is always present. */
    public record JornadaSummary(UUID id, UUID employeeId, UUID siteId, LocalDate localDate, String state, String employeeDisplayName,
                                 List<MarkView> marks, List<DeviationService.DeviationView> deviations) { }
    /** cancelledAt is set only for a CANCELADA jornada; cancelReason is returned only to ADMIN (D-20261027-07). */
    public record JornadaView(UUID id, UUID employeeId, UUID siteId, LocalDate localDate, String state,
                              OrganizationController.TemplateInput scheduleSnapshot, int toleranceMinutes, long sequence, List<MarkView> marks,
                              Instant cancelledAt, String cancelReason) { }
    /** Voided marks stay listed and keep their sequence; voidedAt and voidReason are returned only to ADMIN (D-20261027-08). */
    public record MarkView(UUID id, UUID jornadaId, String action, long sequence, Instant acceptedAt, Instant occurredAt, Instant recordedAt,
                           String locationStatus, Double latitude, Double longitude, boolean voided, Instant voidedAt, String voidReason, List<Object> deviations) { }
}
