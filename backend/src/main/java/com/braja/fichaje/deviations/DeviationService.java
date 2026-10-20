package com.braja.fichaje.deviations;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.notifications.DeviationNotificationPort;
import com.braja.fichaje.security.EncryptionService;
import com.braja.fichaje.security.ScopeService;
import com.braja.fichaje.timekeeping.MarkAction;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

@Service
public class DeviationService {
    private final DeviationPolicy policy = new DeviationPolicy();
    private final JdbcTemplate jdbc;
    private final ScopeService scopes;
    private final EncryptionService encryption;
    private final DeviationNotificationPort notifications;

    public DeviationService(JdbcTemplate jdbc, ScopeService scopes, EncryptionService encryption, DeviationNotificationPort notifications) {
        this.jdbc = jdbc;
        this.scopes = scopes;
        this.encryption = encryption;
        this.notifications = notifications;
    }

    @Transactional
    public void reconcile(UUID companyId, UUID jornadaId, UUID siteId, UUID employeeId, Instant scheduledStart, Instant scheduledEnd,
                         int toleranceMinutes, int breakfastLimit, int lunchLimit, List<MarkFact> marks, Instant now) {
        Map<DeviationType, DesiredDeviation> desired = new EnumMap<>(DeviationType.class);
        MarkFact ingress = marks.stream().filter(m -> m.action() == MarkAction.INGRESO).findFirst().orElse(null);
        if (ingress == null) {
            Instant absenceDue = scheduledStart.plus(Duration.ofMinutes(toleranceMinutes));
            if (now.isAfter(absenceDue)) desired.put(DeviationType.SIN_INGRESO, new DesiredDeviation(null, absenceDue));
        } else policy.arrival(scheduledStart, toleranceMinutes, ingress.occurredAt())
                .ifPresent(type -> desired.put(type, new DesiredDeviation(ingress.id(), ingress.occurredAt())));

        MarkFact egress = marks.stream().filter(m -> m.action() == MarkAction.EGRESO).findFirst().orElse(null);
        if (egress != null) {
            policy.egress(scheduledEnd, toleranceMinutes, egress.occurredAt())
                    .ifPresent(type -> desired.put(type, new DesiredDeviation(egress.id(), egress.occurredAt())));
        }
        // Missing egress is internal-only (never pushed); it shares one persistent deviation with the egress types.
        policy.missingEgress(scheduledEnd, toleranceMinutes, now, ingress != null, egress != null)
                .ifPresent(type -> desired.put(type, new DesiredDeviation(null, scheduledEnd.plus(Duration.ofMinutes(toleranceMinutes)))));

        MarkFact breakfastStart = null, lunchStart = null;
        for (MarkFact mark : marks) {
            switch (mark.action()) {
                case SALIDA_DESAYUNO -> breakfastStart = mark;
                case VUELTA_DESAYUNO -> {
                    if (breakfastStart != null) policy.pause(Duration.between(breakfastStart.occurredAt(), mark.occurredAt()), breakfastLimit, DeviationType.EXCESO_DESAYUNO)
                            .ifPresent(type -> desired.put(type, new DesiredDeviation(mark.id(), mark.occurredAt())));
                    breakfastStart = null;
                }
                case SALIDA_ALMUERZO -> lunchStart = mark;
                case VUELTA_ALMUERZO -> {
                    if (lunchStart != null) policy.pause(Duration.between(lunchStart.occurredAt(), mark.occurredAt()), lunchLimit, DeviationType.EXCESO_ALMUERZO)
                            .ifPresent(type -> desired.put(type, new DesiredDeviation(mark.id(), mark.occurredAt())));
                    lunchStart = null;
                }
                default -> { }
            }
        }

        List<ExistingDeviation> existing = jdbc.query("SELECT id,type,active FROM deviations WHERE company_id=? AND jornada_id=? ORDER BY created_at,id FOR UPDATE",
                (rs, row) -> new ExistingDeviation(UUID.fromString(rs.getString("id")), DeviationType.valueOf(rs.getString("type")), rs.getBoolean("active")),
                companyId.toString(), jornadaId.toString());
        Map<DeviationType, ExistingDeviation> active = new EnumMap<>(DeviationType.class);
        List<ExistingDeviation> activeRows = existing.stream().filter(ExistingDeviation::active).toList();

        for (Map.Entry<DeviationType, DesiredDeviation> entry : desired.entrySet()) {
            DeviationType wanted = entry.getKey();
            DesiredDeviation fact = entry.getValue();
            ExistingDeviation current = activeRows.stream().filter(d -> d.type() == wanted).findFirst().orElse(null);
            boolean replacement = false;
            if (current == null && wanted == DeviationType.LLEGADA_TARDE) {
                current = activeRows.stream().filter(d -> d.type() == DeviationType.SIN_INGRESO).findFirst().orElse(null);
                replacement = current != null;
            }
            if (current == null && wanted == DeviationType.SIN_INGRESO) {
                current = activeRows.stream().filter(d -> d.type() == DeviationType.LLEGADA_TARDE).findFirst().orElse(null);
                replacement = current != null;
            }
            if (current == null && isEgress(wanted)) {
                current = activeRows.stream().filter(d -> isEgress(d.type())).findFirst().orElse(null);
                replacement = current != null;
            }
            if (current != null) {
                if (current.type() != wanted) {
                    jdbc.update("UPDATE deviations SET type=?,source_mark_id=?,updated_at=? WHERE id=? AND company_id=?",
                            wanted.name(), fact.markId() == null ? null : fact.markId().toString(), timestamp(now), current.id().toString(), companyId.toString());
                    jdbc.update("INSERT INTO deviation_audits(id,company_id,deviation_id,change_type,before_type,after_type,actor_account_id,audit_reason,created_at) VALUES(?,?,?,'TYPE_REPLACED',?,?,NULL,'Corrected event reconciliation',?)",
                            UUID.randomUUID().toString(), companyId.toString(), current.id().toString(), current.type().name(), wanted.name(), timestamp(now));
                    if (wanted.isPushEligible()) notifications.enqueue(companyId, siteId, current.id(), wanted.name(), fact.occurredAt());
                } else {
                    jdbc.update("UPDATE deviations SET source_mark_id=?,updated_at=? WHERE id=? AND company_id=?",
                            fact.markId() == null ? null : fact.markId().toString(), timestamp(now), current.id().toString(), companyId.toString());
                }
                active.put(wanted, new ExistingDeviation(current.id(), wanted, true));
            } else {
                ExistingDeviation historical = existing.stream().filter(d -> d.type() == wanted && !d.active()).findFirst().orElse(null);
                UUID deviationId = historical == null ? UUID.randomUUID() : historical.id();
                if (historical == null) {
                    jdbc.update("INSERT INTO deviations(id,company_id,jornada_id,source_mark_id,site_id,employee_id,type,created_at,updated_at,active) VALUES(?,?,?,?,?,?,?,?,?,TRUE)",
                            deviationId.toString(), companyId.toString(), jornadaId.toString(), fact.markId() == null ? null : fact.markId().toString(),
                            siteId.toString(), employeeId.toString(), wanted.name(), timestamp(now), timestamp(now));
                } else {
                    jdbc.update("UPDATE deviations SET active=TRUE,source_mark_id=?,site_id=?,employee_id=?,type=?,motive_category=NULL,motive_text=NULL,motive_ciphertext=NULL,motive_iv=NULL,motive_cipher_key_id=NULL,motive_author_account_id=NULL,motive_created_at=NULL,motive_purged_at=NULL,classification=NULL,created_at=?,updated_at=? WHERE id=? AND company_id=?",
                            fact.markId() == null ? null : fact.markId().toString(), siteId.toString(), employeeId.toString(), wanted.name(), timestamp(now), timestamp(now), deviationId.toString(), companyId.toString());
                }
                jdbc.update("INSERT INTO deviation_audits(id,company_id,deviation_id,change_type,after_type,created_at) VALUES(?,?,?,'CREATED',?,?)",
                        UUID.randomUUID().toString(), companyId.toString(), deviationId.toString(), wanted.name(), timestamp(now));
                active.put(wanted, new ExistingDeviation(deviationId, wanted, true));
                if (wanted.isPushEligible()) notifications.enqueue(companyId, siteId, deviationId, wanted.name(), fact.occurredAt());
            }
        }

        for (ExistingDeviation deviation : activeRows) {
            if (active.containsKey(deviation.type())) continue;
            // Arrival types share one persistent deviation when an absence is replaced by a late mark.
            if ((deviation.type() == DeviationType.SIN_INGRESO && desired.containsKey(DeviationType.LLEGADA_TARDE))
                    || (deviation.type() == DeviationType.LLEGADA_TARDE && desired.containsKey(DeviationType.SIN_INGRESO))
                    || (isEgress(deviation.type()) && desired.keySet().stream().anyMatch(type -> isEgress(type)))) continue;
            jdbc.update("UPDATE deviations SET active=FALSE,updated_at=? WHERE id=? AND company_id=?", timestamp(now), deviation.id().toString(), companyId.toString());
            jdbc.update("INSERT INTO deviation_audits(id,company_id,deviation_id,change_type,before_type,created_at) VALUES(?,?,?,'RETRACTED',?,?)",
                    UUID.randomUUID().toString(), companyId.toString(), deviation.id().toString(), deviation.type().name(), timestamp(now));
        }
    }

    @Transactional
    public List<DeviationView> list(Authentication auth, ScopeService.Scope scope, LocalDate from, LocalDate to, UUID siteId) {
        if (from != null && to != null && (to.isBefore(from) || to.isAfter(from.plusDays(366)))) throw ApiException.invalid("Date range must be ordered and no longer than 366 days");
        if (siteId != null && !scopes.companyHasSite(scope.companyId(), siteId)) throw ApiException.notFound();
        UUID employeeId = "EMPLOYEE".equals(scope.role()) ? scopes.employeeIdFor(scope) : null;
        if ("EMPLOYEE".equals(scope.role()) && employeeId == null) throw ApiException.forbidden();
        StringBuilder sql = new StringBuilder("SELECT d.*,j.local_date,e.display_name AS employee_display_name FROM deviations d JOIN jornadas j ON j.id=d.jornada_id AND j.company_id=d.company_id JOIN employees e ON e.id=d.employee_id AND e.company_id=d.company_id WHERE d.company_id=? AND d.active=TRUE");
        List<Object> args = new ArrayList<>();
        args.add(scope.companyId().toString());
        if (employeeId != null) { sql.append(" AND d.employee_id=?"); args.add(employeeId.toString()); }
        if (siteId != null) { sql.append(" AND d.site_id=?"); args.add(siteId.toString()); }
        if (from != null) { sql.append(" AND j.local_date>=?"); args.add(from); }
        if (to != null) { sql.append(" AND j.local_date<=?"); args.add(to); }
        sql.append(" ORDER BY d.created_at DESC,d.id DESC");
        return jdbc.query(sql.toString(), (rs, row) -> deviationView(scope, rs), args.toArray());
    }

    @Transactional
    public InboxPage inbox(ScopeService.Scope scope, String cursor, int limit) {
        if (limit < 1 || limit > 100) throw ApiException.invalid("Inbox limit must be between 1 and 100");
        UUID employeeId = "EMPLOYEE".equals(scope.role()) ? scopes.employeeIdFor(scope) : null;
        if ("EMPLOYEE".equals(scope.role()) && employeeId == null) throw ApiException.forbidden();
        StringBuilder sql = new StringBuilder("SELECT d.*,j.local_date,e.display_name AS employee_display_name FROM deviations d JOIN jornadas j ON j.id=d.jornada_id AND j.company_id=d.company_id JOIN employees e ON e.id=d.employee_id AND e.company_id=d.company_id WHERE d.company_id=? AND d.active=TRUE");
        List<Object> args = new ArrayList<>();
        args.add(scope.companyId().toString());
        if (employeeId != null) { sql.append(" AND d.employee_id=?"); args.add(employeeId.toString()); }
        if (cursor != null && !cursor.isBlank()) {
            Cursor decoded = decodeCursor(cursor);
            sql.append(" AND (d.updated_at<? OR (d.updated_at=? AND d.id<?))");
            args.add(timestamp(decoded.updatedAt())); args.add(timestamp(decoded.updatedAt())); args.add(decoded.id().toString());
        }
        sql.append(" ORDER BY d.updated_at DESC,d.id DESC LIMIT ?");
        args.add(limit + 1);
        List<InboxRow> rows = jdbc.query(sql.toString(), (rs, row) -> new InboxRow(deviationView(scope, rs), rs.getTimestamp("updated_at").toInstant()), args.toArray());
        boolean hasMore = rows.size() > limit;
        if (hasMore) rows = rows.subList(0, limit);
        String nextCursor = hasMore ? encodeCursor(rows.getLast()) : null;
        return new InboxPage(rows.stream().map(InboxRow::deviation).toList(), nextCursor);
    }

    @Transactional
    public DeviationView saveMotive(Authentication auth, ScopeService.Scope scope, UUID deviationId, String category, String text) {
        UUID employeeId = scopes.employeeIdFor(scope);
        if (employeeId == null || !"EMPLOYEE".equals(scope.role())) throw ApiException.forbidden();
        if (text == null || text.isBlank() || text.length() > 4000) throw ApiException.invalid("Motive text must contain 1 to 4000 characters");
        DeviationRow deviation = getForUpdate(scope.companyId(), deviationId);
        if (deviation == null) throw ApiException.notFound();
        if (!deviation.employeeId().equals(employeeId)) throw ApiException.notFound();
        if (deviation.motiveCreatedAt() != null && deviation.motivePurgedAt() == null) throw ApiException.conflict("MOTIVE_ALREADY_SUBMITTED", "The reason for this deviation was already submitted");
        Instant now = Instant.now();
        if ("SALUD".equals(category)) {
            var encrypted = encryption.encryptHealth(text);
            jdbc.update("UPDATE deviations SET motive_category=?,motive_text=NULL,motive_ciphertext=?,motive_iv=?,motive_cipher_key_id=?,motive_author_account_id=?,motive_created_at=?,motive_purged_at=NULL,updated_at=? WHERE id=? AND company_id=?",
                    category, encrypted.ciphertext(), encrypted.iv(), encrypted.keyId(), scope.accountId().toString(), timestamp(now), timestamp(now), deviationId.toString(), scope.companyId().toString());
        } else if (Set.of("TRANSPORTE", "EMERGENCIA", "OTRA").contains(category)) {
            jdbc.update("UPDATE deviations SET motive_category=?,motive_text=?,motive_ciphertext=NULL,motive_iv=NULL,motive_cipher_key_id=NULL,motive_author_account_id=?,motive_created_at=?,motive_purged_at=NULL,updated_at=? WHERE id=? AND company_id=?",
                    category, text, scope.accountId().toString(), timestamp(now), timestamp(now), deviationId.toString(), scope.companyId().toString());
        } else throw ApiException.invalid("Unknown motive category");
        return loadView(scope, deviationId);
    }

    @Transactional
    public DeviationView classify(ScopeService.Scope scope, UUID deviationId, String classification, String reason) {
        DeviationRow deviation = getForUpdate(scope.companyId(), deviationId);
        if (deviation == null) throw ApiException.notFound();
        if (deviation.classification() != null && !deviation.classification().equals(classification) && (reason == null || reason.isBlank())) {
            throw ApiException.invalid("A correction reason is required when changing a classification");
        }
        if (!Set.of("JUSTIFICADO", "NO_JUSTIFICADO").contains(classification)) throw ApiException.invalid("Unknown classification");
        Instant now = Instant.now();
        jdbc.update("UPDATE deviations SET classification=?,updated_at=? WHERE id=? AND company_id=?", classification, timestamp(now), deviationId.toString(), scope.companyId().toString());
        jdbc.update("INSERT INTO deviation_audits(id,company_id,deviation_id,change_type,before_classification,after_classification,actor_account_id,audit_reason,created_at) VALUES(?, ?, ?, 'CLASSIFICATION_CHANGED', ?, ?, ?, ?, ?)",
                UUID.randomUUID().toString(), scope.companyId().toString(), deviationId.toString(), deviation.classification(), classification, scope.accountId().toString(),
                reason == null || reason.isBlank() ? null : reason.substring(0, Math.min(2000, reason.length())), timestamp(now));
        return loadView(scope, deviationId);
    }

    @Transactional
    public DeviationView loadView(ScopeService.Scope scope, UUID id) {
        DeviationView view = jdbc.query("SELECT d.*,j.local_date,e.display_name AS employee_display_name FROM deviations d JOIN jornadas j ON j.id=d.jornada_id AND j.company_id=d.company_id JOIN employees e ON e.id=d.employee_id AND e.company_id=d.company_id WHERE d.id=? AND d.company_id=? AND d.active=TRUE",
                rs -> rs.next() ? deviationView(scope, rs) : null, id.toString(), scope.companyId().toString());
        if (view != null && "EMPLOYEE".equals(scope.role()) && !view.employeeId().equals(scopes.employeeIdFor(scope))) throw ApiException.notFound();
        return view;
    }

    private DeviationRow getForUpdate(UUID companyId, UUID deviationId) {
        return jdbc.query("SELECT id,employee_id,classification,motive_created_at,motive_purged_at FROM deviations WHERE id=? AND company_id=? AND active=TRUE FOR UPDATE",
                rs -> rs.next() ? new DeviationRow(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("employee_id")), rs.getString("classification"),
                        rs.getTimestamp("motive_created_at") == null ? null : rs.getTimestamp("motive_created_at").toInstant(),
                        rs.getTimestamp("motive_purged_at") == null ? null : rs.getTimestamp("motive_purged_at").toInstant()) : null,
                deviationId.toString(), companyId.toString());
    }

    private DeviationView deviationView(ScopeService.Scope scope, java.sql.ResultSet rs) throws java.sql.SQLException {
        UUID id = UUID.fromString(rs.getString("id"));
        UUID author = rs.getString("motive_author_account_id") == null ? null : UUID.fromString(rs.getString("motive_author_account_id"));
        String category = rs.getString("motive_category");
        String text = null;
        boolean mayReadMotive = "ADMIN".equals(scope.role()) || scope.accountId().equals(author);
        if (mayReadMotive) {
            if ("SALUD".equals(category) && rs.getBytes("motive_ciphertext") != null) {
                text = encryption.decryptHealth(rs.getBytes("motive_ciphertext"), rs.getBytes("motive_iv"), rs.getString("motive_cipher_key_id"));
            } else text = rs.getString("motive_text");
        } else if ("SALUD".equals(category)) category = null;
        String classification = rs.getString("classification");
        String status = classification != null ? classification : rs.getTimestamp("motive_created_at") != null ? "PENDIENTE_REVISION" : "MOTIVO_PENDIENTE";
        DeviationType type = DeviationType.valueOf(rs.getString("type"));
        return new DeviationView(id, UUID.fromString(rs.getString("jornada_id")), UUID.fromString(rs.getString("site_id")),
                UUID.fromString(rs.getString("employee_id")), rs.getString("employee_display_name"), type.name(), status, category, text,
                rs.getTimestamp("created_at").toInstant(), rs.getTimestamp("updated_at").toInstant(), type.isPushEligible());
    }

    private boolean isEgress(DeviationType type) {
        return type == DeviationType.EGRESO_TEMPRANO || type == DeviationType.EGRESO_TARDIO || type == DeviationType.MARCA_FALTANTE;
    }
    private static java.sql.Timestamp timestamp(Instant instant) { return java.sql.Timestamp.from(instant); }
    private static Cursor decodeCursor(String raw) {
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(raw), StandardCharsets.UTF_8);
            int delimiter = decoded.lastIndexOf('|');
            return new Cursor(Instant.parse(decoded.substring(0, delimiter)), UUID.fromString(decoded.substring(delimiter + 1)));
        } catch (Exception ex) { throw ApiException.invalid("Inbox cursor is invalid"); }
    }
    private static String encodeCursor(InboxRow row) {
        String value = row.updatedAt().toString() + "|" + row.deviation().id();
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
    private record DesiredDeviation(UUID markId, Instant occurredAt) { }
    private record ExistingDeviation(UUID id, DeviationType type, boolean active) { }
    private record DeviationRow(UUID id, UUID employeeId, String classification, Instant motiveCreatedAt, Instant motivePurgedAt) { }
    private record Cursor(Instant updatedAt, UUID id) { }
    private record InboxRow(DeviationView deviation, Instant updatedAt) { }
    public record InboxPage(List<DeviationView> items, String nextCursor) { }
    public record MarkFact(UUID id, MarkAction action, Instant occurredAt) { }
    public record DeviationView(UUID id, UUID jornadaId, UUID siteId, UUID employeeId, String employeeDisplayName, String type, String status,
                                String category, String motiveText, Instant createdAt, Instant updatedAt, boolean pushEligible) { }
}
