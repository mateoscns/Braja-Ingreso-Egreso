package com.braja.fichaje.timekeeping;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.deviations.DeviationService;
import com.braja.fichaje.organization.OrganizationController;
import com.braja.fichaje.security.ScopeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;

@Service
public class MarkService {
    private static final Logger LOGGER = LoggerFactory.getLogger(MarkService.class);
    private static final Duration EARLY_INGRESS_WINDOW = Duration.ofMinutes(30);

    private final JdbcTemplate jdbc;
    private final ScopeService scopes;
    private final ObjectMapper objectMapper;
    private final DeviationService deviations;
    private final TransactionTemplate isolatedTransaction;
    private final MarkTransitionPolicy transitions = new MarkTransitionPolicy();

    public MarkService(JdbcTemplate jdbc, ScopeService scopes, ObjectMapper objectMapper, DeviationService deviations,
                       PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.scopes = scopes;
        this.objectMapper = objectMapper;
        this.deviations = deviations;
        this.isolatedTransaction = new TransactionTemplate(transactionManager);
        this.isolatedTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.isolatedTransaction.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }

    @Transactional
    public MarkResult recordEmployeeMark(ScopeService.Scope scope, UUID jornadaId, MarkAction action, UUID idempotencyKey, Instant receivedAt) {
        if (!"EMPLOYEE".equals(scope.role())) throw ApiException.forbidden();
        String fingerprint = MarkRequestFingerprint.sha256(jornadaId, action);
        jdbc.queryForObject("SELECT id FROM accounts WHERE id=? AND active=TRUE FOR UPDATE", String.class, scope.accountId().toString());
        String membershipRole = jdbc.query("SELECT role FROM company_memberships WHERE account_id=? AND company_id=? AND active=TRUE FOR UPDATE",
                rs -> rs.next() ? rs.getString("role") : null, scope.accountId().toString(), scope.companyId().toString());
        if (!"EMPLOYEE".equals(membershipRole)) throw ApiException.forbidden();
        JornadaLock jornada = lockJornada(scope.companyId(), jornadaId);
        UUID employeeId = scopes.employeeIdFor(scope);
        if (employeeId == null || !jornada.employeeId().equals(employeeId)) throw ApiException.notFound();

        Optional<MarkResult> previous = findIdempotent(scope.accountId(), idempotencyKey, fingerprint);
        if (previous.isPresent()) return previous.get().asReplay();

        validateMarkTime(jornada, action, receivedAt);

        List<HistoryRow> history = loadHistory(scope.companyId(), jornadaId);
        validateAppend(history, action);
        UUID markId = UUID.randomUUID();
        long sequence = jornada.nextSequence();
        long timelineOrder = history.isEmpty() ? 1000 : history.getLast().timelineOrder() + 1000;
        Instant recordedAt = Instant.now();
        jdbc.update("INSERT INTO mark_events(id,company_id,jornada_id,sequence_number,timeline_order,action,original_action,occurred_at,original_occurred_at,accepted_at,recorded_at,origin,created_by,location_status,location_expires_at) " +
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,'EMPLEADO',?,'PENDIENTE',?)",
                markId.toString(), scope.companyId().toString(), jornadaId.toString(), sequence, timelineOrder, action.name(), action.name(),
                timestamp(receivedAt), timestamp(receivedAt), timestamp(receivedAt), timestamp(recordedAt), scope.accountId().toString(), timestamp(receivedAt.plusSeconds(30)));
        List<MarkAction> actions = history.stream().map(HistoryRow::action).collect(java.util.stream.Collectors.toCollection(ArrayList::new));
        actions.add(action);
        jdbc.update("UPDATE jornadas SET state=?,next_sequence=next_sequence+1 WHERE id=? AND company_id=?",
                MarkState.from(actions), jornadaId.toString(), scope.companyId().toString());
        List<HistoryRow> updated = new ArrayList<>(history);
        updated.add(new HistoryRow(markId, sequence, timelineOrder, action, receivedAt));
        reconcile(scope.companyId(), jornada, updated, Instant.now());
        JornadaController.MarkView view = toView(markId, jornadaId, action, sequence, receivedAt, receivedAt, recordedAt, "PENDIENTE", null, null);
        String response;
        try { response = objectMapper.writeValueAsString(view); }
        catch (Exception ex) { throw new IllegalStateException("Unable to serialize idempotent mark response", ex); }
        try {
            jdbc.update("INSERT INTO mark_idempotency(account_id,idempotency_key,request_hash,response_body,mark_id,created_at) VALUES(?,?,?,?,?,?)",
                    scope.accountId().toString(), idempotencyKey.toString(), fingerprint, response, markId.toString(), timestamp(Instant.now()));
        } catch (DuplicateKeyException ex) {
            throw ApiException.conflict("IDEMPOTENCY_CONFLICT", "This idempotency key is already in use");
        }
        return new MarkResult(view, false);
    }

    @Transactional(readOnly = true)
    public JornadaController.MarkView getMark(ScopeService.Scope scope, UUID markId) {
        MarkRow mark = jdbc.query("SELECT m.id,m.jornada_id,m.action,m.sequence_number,m.accepted_at,m.occurred_at,m.recorded_at,m.location_status,m.latitude,m.longitude,j.employee_id " +
                        "FROM mark_events m JOIN jornadas j ON j.id=m.jornada_id AND j.company_id=m.company_id WHERE m.id=? AND m.company_id=?",
                rs -> rs.next() ? new MarkRow(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("jornada_id")), UUID.fromString(rs.getString("employee_id")),
                        MarkAction.valueOf(rs.getString("action")), rs.getLong("sequence_number"), rs.getTimestamp("accepted_at").toInstant(),
                        rs.getTimestamp("occurred_at").toInstant(), rs.getTimestamp("recorded_at").toInstant(), apiLocationStatus(rs.getString("location_status")),
                        rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude")) : null, markId.toString(), scope.companyId().toString());
        if (mark == null) throw ApiException.notFound();
        if ("EMPLOYEE".equals(scope.role()) && !mark.employeeId().equals(scopes.employeeIdFor(scope))) throw ApiException.notFound();
        return toView(mark.id(), mark.jornadaId(), mark.action(), mark.sequence(), mark.acceptedAt(), mark.occurredAt(), mark.recordedAt(), mark.locationStatus(),
                "ADMIN".equals(scope.role()) ? decimal(mark.latitude()) : null, "ADMIN".equals(scope.role()) ? decimal(mark.longitude()) : null);
    }

    @Transactional
    public LocationResult attachLocation(ScopeService.Scope scope, UUID markId, double latitude, double longitude, double accuracyMeters, Instant receivedAt) {
        if ("EMPLOYEE".equals(scope.role()) == false) throw ApiException.forbidden();
        if (!Double.isFinite(latitude) || latitude < -90 || latitude > 90 || !Double.isFinite(longitude) || longitude < -180 || longitude > 180
                || !Double.isFinite(accuracyMeters) || accuracyMeters < 0 || accuracyMeters > 100000) throw ApiException.invalid("Location coordinates or accuracy are outside valid bounds");
        UUID jornadaId = jornadaIdForMark(scope.companyId(), markId);
        if (jornadaId == null) throw ApiException.notFound();
        lockJornada(scope.companyId(), jornadaId);
        MarkRow mark = jdbc.query("SELECT m.id,m.jornada_id,m.action,m.sequence_number,m.accepted_at,m.occurred_at,m.recorded_at,m.location_status,m.latitude,m.longitude,j.employee_id " +
                        "FROM mark_events m JOIN jornadas j ON j.id=m.jornada_id AND j.company_id=m.company_id WHERE m.id=? AND m.company_id=? FOR UPDATE",
                rs -> rs.next() ? new MarkRow(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("jornada_id")), UUID.fromString(rs.getString("employee_id")),
                        MarkAction.valueOf(rs.getString("action")), rs.getLong("sequence_number"), rs.getTimestamp("accepted_at").toInstant(),
                        rs.getTimestamp("occurred_at").toInstant(), rs.getTimestamp("recorded_at").toInstant(), rs.getString("location_status"),
                        rs.getBigDecimal("latitude"), rs.getBigDecimal("longitude")) : null, markId.toString(), scope.companyId().toString());
        if (mark == null || !mark.employeeId().equals(scopes.employeeIdFor(scope))) throw ApiException.notFound();
        if (!"PENDIENTE".equals(mark.locationStatus())) throw ApiException.conflict("LOCATION_ALREADY_FINAL", "Location is no longer pending");
        if (receivedAt.isAfter(mark.acceptedAt().plusSeconds(30))) throw ApiException.conflict("LOCATION_WINDOW_EXPIRED", "Location must arrive within 30 seconds of the mark");
        jdbc.update("UPDATE mark_events SET location_status='RECIBIDA',latitude=?,longitude=?,accuracy_meters=?,location_received_at=? WHERE id=? AND company_id=? AND location_status='PENDIENTE'",
                BigDecimal.valueOf(latitude), BigDecimal.valueOf(longitude), BigDecimal.valueOf(accuracyMeters), timestamp(receivedAt), markId.toString(), scope.companyId().toString());
        return new LocationResult(markId, "RECIBIDA");
    }

    @Transactional
    public JornadaController.MarkView forgottenMark(ScopeService.Scope scope, UUID jornadaId, MarkAction action, Instant occurredAt, String auditReason) {
        JornadaLock jornada = lockJornada(scope.companyId(), jornadaId);
        List<HistoryRow> history = loadHistory(scope.companyId(), jornadaId);
        Instant now = Instant.now();
        UUID markId = UUID.randomUUID();
        long sequence = jornada.nextSequence();
        List<HistoryRow> updated = retroactiveTimeline(history, new HistoryRow(markId, sequence, 0, action, occurredAt));
        long timelineOrder = updated.stream().filter(row -> row.id().equals(markId)).findFirst().orElseThrow().timelineOrder();
        jdbc.update("INSERT INTO mark_events(id,company_id,jornada_id,sequence_number,timeline_order,action,original_action,occurred_at,original_occurred_at,accepted_at,recorded_at,origin,created_by,location_status) " +
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,'ADMIN',?,'NO_APLICA')",
                markId.toString(), scope.companyId().toString(), jornadaId.toString(), sequence, timelineOrder, action.name(), action.name(), timestamp(occurredAt), timestamp(occurredAt),
                timestamp(now), timestamp(now), scope.accountId().toString());
        persistTimelineOrder(scope.companyId(), jornadaId, updated);
        jdbc.update("INSERT INTO forgotten_mark_audits(id,company_id,jornada_id,mark_id,actor_account_id,audit_reason,recorded_at) VALUES(?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), scope.companyId().toString(), jornadaId.toString(), markId.toString(), scope.accountId().toString(), auditReason, timestamp(now));
        jdbc.update("UPDATE jornadas SET state=?,next_sequence=next_sequence+1 WHERE id=? AND company_id=?",
                MarkState.from(updated.stream().map(HistoryRow::action).toList()), jornadaId.toString(), scope.companyId().toString());
        reconcile(scope.companyId(), jornada, updated, now);
        return toView(markId, jornadaId, action, sequence, now, occurredAt, now, "NO_APLICA", null, null);
    }

    @Transactional
    public JornadaController.MarkView correctMark(ScopeService.Scope scope, UUID markId, MarkAction newAction, Instant newOccurredAt, String reason) {
        UUID jornadaId = jornadaIdForMark(scope.companyId(), markId);
        if (jornadaId == null) throw ApiException.notFound();
        JornadaLock jornada = lockJornada(scope.companyId(), jornadaId);
        MarkRow mark = jdbc.query("SELECT m.id,m.jornada_id,m.action,m.occurred_at,m.original_action,m.original_occurred_at,j.employee_id,j.company_id " +
                        "FROM mark_events m JOIN jornadas j ON j.id=m.jornada_id AND j.company_id=m.company_id WHERE m.id=? AND m.company_id=? FOR UPDATE",
                rs -> rs.next() ? new MarkRow(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("jornada_id")), UUID.fromString(rs.getString("employee_id")),
                        MarkAction.valueOf(rs.getString("action")), 0, null, rs.getTimestamp("occurred_at").toInstant(), null, null, null, null) : null,
                markId.toString(), scope.companyId().toString());
        if (mark == null) throw ApiException.notFound();
        List<HistoryRow> history = loadHistory(scope.companyId(), mark.jornadaId());
        List<HistoryRow> corrected = retroactiveTimeline(history, history.stream()
                .filter(row -> row.id().equals(markId))
                .map(row -> new HistoryRow(row.id(), row.sequence(), row.timelineOrder(), newAction, newOccurredAt))
                .findFirst().orElseThrow());
        Instant now = Instant.now();
        jdbc.update("INSERT INTO mark_correction_audits(id,company_id,mark_id,before_action,after_action,before_occurred_at,after_occurred_at,actor_account_id,audit_reason,corrected_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                UUID.randomUUID().toString(), scope.companyId().toString(), markId.toString(), mark.action().name(), newAction.name(), timestamp(mark.occurredAt()),
                timestamp(newOccurredAt), scope.accountId().toString(), reason, timestamp(now));
        jdbc.update("UPDATE mark_events SET action=?,occurred_at=?,recorded_at=? WHERE id=? AND company_id=?",
                newAction.name(), timestamp(newOccurredAt), timestamp(now), markId.toString(), scope.companyId().toString());
        persistTimelineOrder(scope.companyId(), mark.jornadaId(), corrected);
        jdbc.update("UPDATE jornadas SET state=? WHERE id=? AND company_id=?",
                MarkState.from(corrected.stream().map(HistoryRow::action).toList()), jornada.id().toString(), scope.companyId().toString());
        reconcile(scope.companyId(), jornada, corrected, now);
        return getMark(scope, markId);
    }

    public void createDueAbsences(Instant now, int batchSize) {
        if (batchSize < 1) return;
        List<Candidate> candidates = isolatedTransaction.execute(status -> jdbc.query("SELECT j.id,j.company_id FROM jornadas j " +
                        "JOIN employees e ON e.id=j.employee_id AND e.company_id=j.company_id AND e.active=TRUE " +
                        "JOIN accounts a ON a.id=e.account_id AND a.active=TRUE " +
                        "JOIN company_memberships cm ON cm.company_id=e.company_id AND cm.account_id=e.account_id AND cm.active=TRUE " +
                        "WHERE j.state='NO_INGRESO' AND DATE_ADD(j.scheduled_start_at, INTERVAL j.tolerance_minutes MINUTE) < ? " +
                        "AND NOT EXISTS (SELECT 1 FROM mark_events m WHERE m.jornada_id=j.id AND m.action='INGRESO') " +
                        "AND NOT EXISTS (SELECT 1 FROM deviations d WHERE d.jornada_id=j.id AND d.type='SIN_INGRESO' AND d.active=TRUE) " +
                        "ORDER BY j.scheduled_start_at,j.id LIMIT ?",
                (rs, row) -> new Candidate(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("company_id"))), timestamp(now), batchSize));
        for (Candidate candidate : candidates) {
            try {
                isolatedTransaction.executeWithoutResult(status -> createAbsenceIfStillDue(candidate.companyId(), candidate.jornadaId(), now));
            } catch (RuntimeException ex) {
                LOGGER.error("Failed to process due absence for jornada {} in company {}", candidate.jornadaId(), candidate.companyId(), ex);
            }
        }
    }

    @Transactional
    public void resolveLocationTimeouts(Instant now) {
        jdbc.update("UPDATE mark_events SET location_status='SIN_UBICACION' WHERE location_status='PENDIENTE' AND accepted_at < ?",
                timestamp(now.minusSeconds(30)));
    }

    private void createAbsenceIfStillDue(UUID companyId, UUID jornadaId, Instant now) {
        UUID accountId = jdbc.query("SELECT e.account_id FROM jornadas j JOIN employees e ON e.id=j.employee_id AND e.company_id=j.company_id WHERE j.id=? AND j.company_id=?",
                rs -> rs.next() ? UUID.fromString(rs.getString("account_id")) : null, jornadaId.toString(), companyId.toString());
        if (accountId == null) return;
        Boolean activeAccount = jdbc.query("SELECT active FROM accounts WHERE id=? FOR UPDATE",
                rs -> rs.next() ? rs.getBoolean("active") : null, accountId.toString());
        if (!Boolean.TRUE.equals(activeAccount)) return;
        String activeRole = jdbc.query("SELECT role FROM company_memberships WHERE company_id=? AND account_id=? AND active=TRUE FOR UPDATE",
                rs -> rs.next() ? rs.getString("role") : null, companyId.toString(), accountId.toString());
        if (!"EMPLOYEE".equals(activeRole)) return;
        String activeEmployee = jdbc.query("SELECT id FROM employees WHERE id=(SELECT employee_id FROM jornadas WHERE id=? AND company_id=?) " +
                        "AND company_id=? AND account_id=? AND active=TRUE FOR UPDATE",
                rs -> rs.next() ? rs.getString("id") : null, jornadaId.toString(), companyId.toString(), companyId.toString(), accountId.toString());
        if (activeEmployee == null) return;
        JornadaLock jornada = lockJornada(companyId, jornadaId);
        List<HistoryRow> history = loadHistory(companyId, jornadaId);
        reconcile(companyId, jornada, history, now);
    }

    private UUID jornadaIdForMark(UUID companyId, UUID markId) {
        return jdbc.query("SELECT jornada_id FROM mark_events WHERE id=? AND company_id=?",
                rs -> rs.next() ? UUID.fromString(rs.getString("jornada_id")) : null, markId.toString(), companyId.toString());
    }

    private void reconcile(UUID companyId, JornadaLock jornada, List<HistoryRow> history, Instant now) {
        OrganizationController.TemplateInput snapshot;
        try { snapshot = objectMapper.readValue(jornada.snapshot(), OrganizationController.TemplateInput.class); }
        catch (Exception ex) { throw new IllegalStateException("Stored schedule snapshot is invalid", ex); }
        List<DeviationService.MarkFact> marks = history.stream().map(h -> new DeviationService.MarkFact(h.id(), h.action(), h.occurredAt())).toList();
        deviations.reconcile(companyId, jornada.id(), jornada.siteId(), jornada.employeeId(), jornada.scheduledStart(), jornada.scheduledEnd(),
                jornada.toleranceMinutes(), snapshot.breakfastLimitMinutes(), snapshot.lunchLimitMinutes(), marks, now);
    }

    private Optional<MarkResult> findIdempotent(UUID accountId, UUID key, String fingerprint) {
        return jdbc.query("SELECT request_hash,response_body FROM mark_idempotency WHERE account_id=? AND idempotency_key=?",
                rs -> {
                    if (!rs.next()) return Optional.empty();
                    if (!fingerprint.equals(rs.getString("request_hash"))) throw ApiException.conflict("IDEMPOTENCY_CONFLICT", "This idempotency key was used for a different mark request");
                    try { return Optional.of(new MarkResult(objectMapper.readValue(rs.getString("response_body"), JornadaController.MarkView.class), true)); }
                    catch (Exception ex) { throw new IllegalStateException("Stored idempotent response is invalid", ex); }
                }, accountId.toString(), key.toString());
    }

    private JornadaLock lockJornada(UUID companyId, UUID jornadaId) {
        JornadaLock row = jdbc.query("SELECT id,employee_id,site_id,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,next_sequence FROM jornadas WHERE id=? AND company_id=? FOR UPDATE",
                rs -> rs.next() ? new JornadaLock(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("employee_id")), UUID.fromString(rs.getString("site_id")),
                        rs.getString("schedule_snapshot"), rs.getInt("tolerance_minutes"), rs.getTimestamp("scheduled_start_at").toInstant(),
                        rs.getTimestamp("scheduled_end_at").toInstant(), rs.getLong("next_sequence")) : null, jornadaId.toString(), companyId.toString());
        if (row == null) throw ApiException.notFound();
        return row;
    }

    private void validateMarkTime(JornadaLock jornada, MarkAction action, Instant receivedAt) {
        Instant earliestIngress = jornada.scheduledStart().minus(EARLY_INGRESS_WINDOW);
        if (receivedAt.isBefore(earliestIngress)
                || (action != MarkAction.INGRESO && receivedAt.isBefore(jornada.scheduledStart()))) {
            throw ApiException.conflict("MARK_TOO_EARLY", "The mark is earlier than the allowed window for this jornada");
        }
    }

    private List<HistoryRow> loadHistory(UUID companyId, UUID jornadaId) {
        return jdbc.query("SELECT id,sequence_number,timeline_order,action,occurred_at FROM mark_events WHERE company_id=? AND jornada_id=? ORDER BY timeline_order,sequence_number FOR UPDATE",
                (rs, row) -> new HistoryRow(UUID.fromString(rs.getString("id")), rs.getLong("sequence_number"), rs.getLong("timeline_order"), MarkAction.valueOf(rs.getString("action")), rs.getTimestamp("occurred_at").toInstant()),
                companyId.toString(), jornadaId.toString());
    }

    private List<HistoryRow> retroactiveTimeline(List<HistoryRow> history, HistoryRow changed) {
        List<HistoryRow> ordered = new ArrayList<>(history);
        int existingIndex = -1;
        for (int i = 0; i < ordered.size(); i++) {
            if (ordered.get(i).id().equals(changed.id())) {
                existingIndex = i;
                break;
            }
        }
        if (existingIndex >= 0) {
            ordered.set(existingIndex, changed);
        } else {
            int insertionIndex = 0;
            while (insertionIndex < ordered.size()
                    && !ordered.get(insertionIndex).occurredAt().isAfter(changed.occurredAt())) insertionIndex++;
            ordered.add(insertionIndex, changed);
        }
        for (int i = 1; i < ordered.size(); i++) {
            if (ordered.get(i).occurredAt().isBefore(ordered.get(i - 1).occurredAt())) {
                throw ApiException.conflict("INVALID_MARK_ORDER", "The mark time conflicts with the accepted action order");
            }
        }
        validateWholeHistory(ordered);
        List<HistoryRow> positioned = new ArrayList<>(ordered.size());
        for (int i = 0; i < ordered.size(); i++) {
            HistoryRow row = ordered.get(i);
            positioned.add(new HistoryRow(row.id(), row.sequence(), (i + 1L) * 1000L, row.action(), row.occurredAt()));
        }
        return positioned;
    }

    private void persistTimelineOrder(UUID companyId, UUID jornadaId, List<HistoryRow> history) {
        for (HistoryRow row : history) {
            jdbc.update("UPDATE mark_events SET timeline_order=? WHERE id=? AND company_id=? AND jornada_id=?",
                    row.timelineOrder(), row.id().toString(), companyId.toString(), jornadaId.toString());
        }
    }

    private void validateAppend(List<HistoryRow> history, MarkAction action) {
        List<MarkAction> actions = new ArrayList<>();
        for (HistoryRow row : history) {
            try { transitions.validate(actions, row.action()); actions.add(row.action()); }
            catch (InvalidStateTransitionException ex) { throw ApiException.conflict("INVALID_MARK_HISTORY", ex.getMessage()); }
        }
        try { transitions.validate(actions, action); }
        catch (InvalidStateTransitionException ex) { throw ApiException.conflict("INVALID_MARK_TRANSITION", ex.getMessage()); }
    }

    private void validateWholeHistory(List<HistoryRow> history) {
        List<MarkAction> actions = new ArrayList<>();
        for (HistoryRow row : history) {
            try { transitions.validate(actions, row.action()); actions.add(row.action()); }
            catch (InvalidStateTransitionException ex) { throw ApiException.conflict("INVALID_MARK_TRANSITION", ex.getMessage()); }
        }
    }

    private JornadaController.MarkView toView(UUID id, UUID jornadaId, MarkAction action, long sequence, Instant acceptedAt, Instant occurredAt,
                                               Instant recordedAt, String status, Double lat, Double lon) {
        return new JornadaController.MarkView(id, jornadaId, action.name(), sequence, acceptedAt, occurredAt, recordedAt, apiLocationStatus(status), lat, lon, List.of());
    }

    private static String apiLocationStatus(String status) { return "PURGADA".equals(status) ? "PURGADA" : status; }
    private static Double decimal(BigDecimal value) { return value == null ? null : value.doubleValue(); }
    private static java.sql.Timestamp timestamp(Instant instant) { return java.sql.Timestamp.from(instant); }

    public record MarkResult(JornadaController.MarkView mark, boolean replay) {
        public MarkResult asReplay() { return new MarkResult(mark, true); }
    }
    public record LocationResult(UUID markId, String locationStatus) { }
    private record HistoryRow(UUID id, long sequence, long timelineOrder, MarkAction action, Instant occurredAt) { }
    private record JornadaLock(UUID id, UUID employeeId, UUID siteId, String snapshot, int toleranceMinutes, Instant scheduledStart, Instant scheduledEnd, long nextSequence) { }
    private record Candidate(UUID jornadaId, UUID companyId) { }
    private record MarkRow(UUID id, UUID jornadaId, UUID employeeId, MarkAction action, long sequence, Instant acceptedAt, Instant occurredAt, Instant recordedAt,
                           String locationStatus, BigDecimal latitude, BigDecimal longitude) { }
}
