package com.braja.fichaje.timekeeping;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.security.ScopeService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Issue #60 (CLAUDE.md rule 6): the change history of one jornada for its company's ADMIN. It reads the insert-only audits
 * (mark corrections and voids, forgotten marks, deviation audits) and the jornada cancellation with one query per source and
 * one query for every actor name (rule 17), inside one read-only transaction so all sources share a snapshot.
 * Motive text never leaves the deviation row (D-20261016-04, D-20261027-02): a motive change only exposes its categories,
 * parsed from the fixed audit_reason the service writes. Coordinates are not read at all.
 */
@Service
public class JornadaAuditService {
    /** Upper bound of entries in one answer; a jornada's history is naturally far smaller. */
    static final int MAX_ENTRIES = 500;
    private static final Pattern MOTIVE_CATEGORIES =
            Pattern.compile("^Motive category (SALUD|TRANSPORTE|EMERGENCIA|OTRA)(?: -> (SALUD|TRANSPORTE|EMERGENCIA|OTRA))?$");
    /** Order of changes written in the same transaction (same instant): the cause before its consequences. */
    private static final List<String> DEVIATION_CHANGE_ORDER = List.of("CREATED", "TYPE_REPLACED", "MOTIVE_SUBMITTED", "MOTIVE_CORRECTED",
            "CLASSIFICATION_CHANGED", "CLASSIFICATION_RESET", "RETRACTED");

    private final JdbcTemplate jdbc;

    public JornadaAuditService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public JornadaAudit forJornada(ScopeService.Scope scope, UUID jornadaId) {
        if (!"ADMIN".equals(scope.role())) throw ApiException.forbidden();
        String company = scope.companyId().toString();
        String jornada = jornadaId.toString();
        List<Ranked> rows = new ArrayList<>();
        String timeZone = jdbc.query("SELECT time_zone,cancelled_at,cancelled_by,cancel_reason FROM jornadas WHERE id=? AND company_id=?", rs -> {
            if (!rs.next()) return null;
            if (rs.getTimestamp("cancelled_at") != null) {
                rows.add(new Ranked(new Entry("JORNADA_CANCELLATION", instant(rs, "cancelled_at"), uuid(rs, "cancelled_by"), null, rs.getString("cancel_reason"),
                        null, null, null, null, null, null, null, null, null, null, null, null, null, null, null), 0, ""));
            }
            return rs.getString("time_zone");
        }, jornada, company);
        if (timeZone == null) throw ApiException.notFound();

        jdbc.query("SELECT f.id,f.mark_id,m.sequence_number,m.original_action,m.original_occurred_at,f.actor_account_id,f.audit_reason,f.recorded_at " +
                        "FROM forgotten_mark_audits f JOIN mark_events m ON m.id=f.mark_id AND m.company_id=f.company_id " +
                        "WHERE f.company_id=? AND f.jornada_id=? ORDER BY f.recorded_at,f.id LIMIT ?",
                rs -> { rows.add(new Ranked(new Entry("FORGOTTEN_MARK", instant(rs, "recorded_at"), uuid(rs, "actor_account_id"), null, rs.getString("audit_reason"),
                        uuid(rs, "mark_id"), rs.getLong("sequence_number"), null, rs.getString("original_action"), null, instant(rs, "original_occurred_at"),
                        null, null, null, null, null, null, null, null, null), 1, rs.getString("id"))); },
                company, jornada, MAX_ENTRIES + 1);

        jdbc.query("SELECT a.id,a.mark_id,m.sequence_number,a.change_kind,a.before_action,a.after_action,a.before_occurred_at,a.after_occurred_at," +
                        "a.actor_account_id,a.audit_reason,a.corrected_at FROM mark_correction_audits a JOIN mark_events m ON m.id=a.mark_id AND m.company_id=a.company_id " +
                        "WHERE m.company_id=? AND m.jornada_id=? ORDER BY a.corrected_at,a.id LIMIT ?",
                rs -> { rows.add(new Ranked(new Entry("VOID".equals(rs.getString("change_kind")) ? "MARK_VOID" : "MARK_CORRECTION", instant(rs, "corrected_at"),
                        uuid(rs, "actor_account_id"), null, rs.getString("audit_reason"), uuid(rs, "mark_id"), rs.getLong("sequence_number"),
                        rs.getString("before_action"), rs.getString("after_action"), instant(rs, "before_occurred_at"), instant(rs, "after_occurred_at"),
                        null, null, null, null, null, null, null, null, null), 2, rs.getString("id"))); },
                company, jornada, MAX_ENTRIES + 1);

        jdbc.query("SELECT a.id,a.deviation_id,d.type AS deviation_type,a.change_type,a.before_type,a.after_type,a.before_classification,a.after_classification," +
                        "a.actor_account_id,a.audit_reason,a.created_at FROM deviation_audits a JOIN deviations d ON d.id=a.deviation_id AND d.company_id=a.company_id " +
                        "WHERE d.company_id=? AND d.jornada_id=? ORDER BY a.created_at,a.id LIMIT ?",
                rs -> { rows.add(deviationEntry(rs)); }, company, jornada, MAX_ENTRIES + 1);

        rows.sort(Comparator.comparing((Ranked row) -> row.entry().changedAt()).thenComparingInt(Ranked::rank).thenComparing(Ranked::tie));
        boolean truncated = rows.size() > MAX_ENTRIES;
        List<Entry> entries = rows.subList(0, Math.min(rows.size(), MAX_ENTRIES)).stream().map(Ranked::entry).toList();
        Map<UUID, String> names = actorNames(company, entries.stream().map(Entry::actorAccountId).filter(Objects::nonNull).distinct().toList());
        return new JornadaAudit(jornadaId, timeZone, entries.stream().map(entry -> entry.withActorName(names.get(entry.actorAccountId()))).toList(), truncated);
    }

    private static Ranked deviationEntry(ResultSet rs) throws SQLException {
        String change = rs.getString("change_type");
        String reason = rs.getString("audit_reason");
        String beforeCategory = null, afterCategory = null;
        if ("MOTIVE_SUBMITTED".equals(change) || "MOTIVE_CORRECTED".equals(change)) {
            // Only the categories leave this method, and only when the stored reason has the exact shape saveMotive writes.
            Matcher matcher = MOTIVE_CATEGORIES.matcher(reason == null ? "" : reason);
            if (matcher.matches()) {
                beforeCategory = matcher.group(2) == null ? null : matcher.group(1);
                afterCategory = matcher.group(2) == null ? matcher.group(1) : matcher.group(2);
            }
            reason = null;
        }
        int order = DEVIATION_CHANGE_ORDER.indexOf(change);
        return new Ranked(new Entry("DEVIATION", instant(rs, "created_at"), uuid(rs, "actor_account_id"), null, reason, null, null, null, null, null, null,
                uuid(rs, "deviation_id"), rs.getString("deviation_type"), change, rs.getString("before_type"), rs.getString("after_type"),
                rs.getString("before_classification"), rs.getString("after_classification"), beforeCategory, afterCategory),
                3 + (order < 0 ? DEVIATION_CHANGE_ORDER.size() : order), rs.getString("deviation_id") + rs.getString("id"));
    }

    /** Employee name in this company, else the membership name (bootstrap ADMIN), else the DNI; one query for every actor. */
    private Map<UUID, String> actorNames(String company, List<UUID> accountIds) {
        Map<UUID, String> names = new HashMap<>();
        if (accountIds.isEmpty()) return names;
        StringBuilder sql = new StringBuilder("SELECT a.id,a.dni_display," +
                "(SELECT e.display_name FROM employees e WHERE e.company_id=? AND e.account_id=a.id) AS employee_name," +
                "(SELECT m.display_name FROM company_memberships m WHERE m.company_id=? AND m.account_id=a.id) AS membership_name " +
                "FROM accounts a WHERE a.id IN (");
        List<Object> args = new ArrayList<>(List.of(company, company));
        for (UUID id : accountIds) { sql.append(args.size() > 2 ? ",?" : "?"); args.add(id.toString()); }
        sql.append(")");
        jdbc.query(sql.toString(), rs -> {
            String name = firstPresent(rs.getString("employee_name"), rs.getString("membership_name"));
            names.put(UUID.fromString(rs.getString("id")), name != null ? name : "DNI " + rs.getString("dni_display"));
        }, args.toArray());
        return names;
    }

    private static String firstPresent(String... values) {
        for (String value : values) if (value != null && !value.isBlank()) return value;
        return null;
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp value = rs.getTimestamp(column);
        return value == null ? null : value.toInstant();
    }

    private static UUID uuid(ResultSet rs, String column) throws SQLException {
        String value = rs.getString(column);
        return value == null ? null : UUID.fromString(value);
    }

    private record Ranked(Entry entry, int rank, String tie) { }

    /** entries are chronological (oldest first); truncated is true when the jornada has more than MAX_ENTRIES changes. */
    public record JornadaAudit(UUID jornadaId, String timeZone, List<Entry> entries, boolean truncated) { }

    /**
     * One change. kind is JORNADA_CANCELLATION, FORGOTTEN_MARK, MARK_CORRECTION, MARK_VOID or DEVIATION; fields that do not apply
     * to a kind are null (left out of the JSON). actorAccountId and actorDisplayName are null for a change made by the system.
     * For FORGOTTEN_MARK, afterAction and afterOccurredAt are the action and event time the ADMIN entered.
     */
    public record Entry(String kind, Instant changedAt, UUID actorAccountId, String actorDisplayName, String reason,
                        UUID markId, Long markSequence, String beforeAction, String afterAction, Instant beforeOccurredAt, Instant afterOccurredAt,
                        UUID deviationId, String deviationType, String changeType, String beforeType, String afterType,
                        String beforeClassification, String afterClassification, String beforeMotiveCategory, String afterMotiveCategory) {
        Entry withActorName(String name) {
            return new Entry(kind, changedAt, actorAccountId, actorAccountId == null ? null : name, reason, markId, markSequence, beforeAction, afterAction,
                    beforeOccurredAt, afterOccurredAt, deviationId, deviationType, changeType, beforeType, afterType, beforeClassification,
                    afterClassification, beforeMotiveCategory, afterMotiveCategory);
        }
    }
}
