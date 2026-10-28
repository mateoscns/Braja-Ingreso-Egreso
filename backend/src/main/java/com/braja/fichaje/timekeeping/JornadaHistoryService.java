package com.braja.fichaje.timekeeping;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.api.DateRanges;
import com.braja.fichaje.deviations.DeviationService;
import com.braja.fichaje.security.ScopeService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.*;

/**
 * Jornada listing and per-employee/site history. With {@code includeDetail} each jornada carries its marks and active deviations,
 * loaded with one IN query each (never per row) inside one transaction so the three reads share a snapshot.
 */
@Service
public class JornadaHistoryService {
    /** Upper bound of jornadas in a detailed response; larger answers must narrow the range, site or employee. */
    static final int MAX_DETAIL_JORNADAS = 500;
    private static final String MARK_COLUMNS = "id,jornada_id,action,sequence_number,accepted_at,occurred_at,recorded_at,location_status,latitude,longitude,voided_at,void_reason";

    private final JdbcTemplate jdbc;
    private final ScopeService scopes;
    private final DeviationService deviations;

    public JornadaHistoryService(JdbcTemplate jdbc, ScopeService scopes, DeviationService deviations) {
        this.jdbc = jdbc;
        this.scopes = scopes;
        this.deviations = deviations;
    }

    @Transactional
    public List<JornadaController.JornadaSummary> list(ScopeService.Scope scope, LocalDate from, LocalDate to, UUID employeeId, UUID siteId, boolean includeDetail) {
        if (from == null || to == null) throw ApiException.invalid("from and to are required");
        DateRanges.validate(from, to);
        UUID targetEmployee;
        if ("ADMIN".equals(scope.role())) targetEmployee = employeeId;
        else {
            if (employeeId != null) throw ApiException.forbidden();
            targetEmployee = scopes.employeeIdFor(scope);
            if (targetEmployee == null) return List.of();
        }
        if (siteId != null && !scopes.companyHasSite(scope.companyId(), siteId)) throw ApiException.notFound();
        StringBuilder sql = new StringBuilder("SELECT j.id,j.employee_id,j.site_id,j.local_date,j.state,e.display_name FROM jornadas j " +
                "JOIN employees e ON e.id=j.employee_id AND e.company_id=j.company_id WHERE j.company_id=? AND j.local_date BETWEEN ? AND ?");
        List<Object> args = new ArrayList<>(List.of(scope.companyId().toString(), from, to));
        if (targetEmployee != null) { sql.append(" AND j.employee_id=?"); args.add(targetEmployee.toString()); }
        if (siteId != null) { sql.append(" AND j.site_id=?"); args.add(siteId.toString()); }
        sql.append(" ORDER BY j.local_date DESC,j.created_at DESC,j.id");
        if (includeDetail) { sql.append(" LIMIT ?"); args.add(MAX_DETAIL_JORNADAS + 1); }
        List<JornadaController.JornadaSummary> rows = jdbc.query(sql.toString(), (rs, row) -> new JornadaController.JornadaSummary(
                UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("employee_id")), UUID.fromString(rs.getString("site_id")),
                rs.getObject("local_date", LocalDate.class), rs.getString("state"), rs.getString("display_name"), null, null), args.toArray());
        if (!includeDetail) return rows;
        if (rows.size() > MAX_DETAIL_JORNADAS) throw ApiException.invalid("Too many jornadas for a detailed history; narrow the date range, site or employee");

        List<UUID> ids = rows.stream().map(JornadaController.JornadaSummary::id).toList();
        Map<UUID, List<JornadaController.MarkView>> marksByJornada = marks(scope, ids);
        Map<UUID, List<DeviationService.DeviationView>> deviationsByJornada = deviations.listForJornadas(scope, ids);
        return rows.stream().map(r -> new JornadaController.JornadaSummary(r.id(), r.employeeId(), r.siteId(), r.localDate(), r.state(), r.employeeDisplayName(),
                marksByJornada.getOrDefault(r.id(), List.of()), deviationsByJornada.getOrDefault(r.id(), List.of()))).toList();
    }

    private Map<UUID, List<JornadaController.MarkView>> marks(ScopeService.Scope scope, List<UUID> jornadaIds) {
        if (jornadaIds.isEmpty()) return Map.of();
        boolean admin = "ADMIN".equals(scope.role());
        StringBuilder sql = new StringBuilder("SELECT " + MARK_COLUMNS + " FROM mark_events WHERE company_id=? AND jornada_id IN (");
        List<Object> args = new ArrayList<>();
        args.add(scope.companyId().toString());
        for (UUID id : jornadaIds) { sql.append(args.size() > 1 ? ",?" : "?"); args.add(id.toString()); }
        sql.append(") ORDER BY jornada_id,timeline_order,sequence_number");
        Map<UUID, List<JornadaController.MarkView>> byJornada = new HashMap<>();
        jdbc.query(sql.toString(), rs -> {
            JornadaController.MarkView view = JornadaController.markView(rs, admin);
            byJornada.computeIfAbsent(view.jornadaId(), key -> new ArrayList<>()).add(view);
        }, args.toArray());
        return byJornada;
    }
}
