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
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
public class MarkService {
    private static final Logger LOGGER = LoggerFactory.getLogger(MarkService.class);
    private static final Duration EARLY_INGRESS_WINDOW = Duration.ofMinutes(30);
    private static final Duration ADMIN_EVENT_MARGIN = Duration.ofHours(24);
    private static final DeviationWorkerRetryPolicy DEVIATION_WORKER_RETRY_POLICY = new DeviationWorkerRetryPolicy();

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

    /** Records with a fixed server instant; for callers that already hold it (tests). The HTTP path passes the system clock. */
    @Transactional
    public MarkResult recordEmployeeMark(ScopeService.Scope scope, UUID jornadaId, MarkAction action, UUID idempotencyKey, Instant receivedAt) {
        return recordEmployeeMark(scope, jornadaId, action, idempotencyKey, Clock.fixed(receivedAt, ZoneOffset.UTC));
    }

    /**
     * The server instant is read from {@code serverClock} only after the account, membership and jornada locks are held
     * (D-20261015-06), so a higher sequence never carries an earlier time than a mark committed while this request waited.
     */
    @Transactional
    public MarkResult recordEmployeeMark(ScopeService.Scope scope, UUID jornadaId, MarkAction action, UUID idempotencyKey, Clock serverClock) {
        if (!"EMPLOYEE".equals(scope.role())) throw ApiException.forbidden();
        String fingerprint = MarkRequestFingerprint.sha256(jornadaId, action);
        // The account may be deactivated between the scope check and this lock: same answer as a deactivated session (rule 7).
        String lockedAccount = jdbc.query("SELECT id FROM accounts WHERE id=? AND active=TRUE FOR UPDATE",
                rs -> rs.next() ? rs.getString(1) : null, scope.accountId().toString());
        if (lockedAccount == null) throw ApiException.forbidden();
        String membershipRole = jdbc.query("SELECT role FROM company_memberships WHERE account_id=? AND company_id=? AND active=TRUE FOR UPDATE",
                rs -> rs.next() ? rs.getString("role") : null, scope.accountId().toString(), scope.companyId().toString());
        if (!"EMPLOYEE".equals(membershipRole)) throw ApiException.forbidden();
        JornadaLock jornada = lockJornada(scope.companyId(), jornadaId);
        Instant receivedAt = serverClock.instant().truncatedTo(ChronoUnit.MICROS); // DATETIME(6): the response equals the stored value
        UUID employeeId = scopes.employeeIdFor(scope);
        if (employeeId == null || !jornada.employeeId().equals(employeeId)) throw ApiException.notFound();

        Optional<UUID> previous = findIdempotent(scope.accountId(), idempotencyKey, fingerprint);
        // A replay answers the current state of that mark (it may have been corrected by an ADMIN since).
        if (previous.isPresent()) return new MarkResult(getMark(scope, previous.get()), true);
        requireNotCancelled(jornada);

        validateMarkTime(jornada, action, receivedAt);

        List<HistoryRow> history = loadHistory(scope.companyId(), jornadaId);
        validateAppend(history, action);
        // ADMIN paths keep the history chronological (retroactiveTimeline); an appended mark must not precede it either.
        if (history.stream().anyMatch(row -> row.occurredAt().isAfter(receivedAt))) {
            throw ApiException.conflict("INVALID_MARK_ORDER", "A stored mark of this jornada is later than the current server time");
        }
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

    /** The current state of a mark, voided or not (same mapping as the jornada views); coordinates and void details are ADMIN-only. */
    @Transactional(readOnly = true)
    public JornadaController.MarkView getMark(ScopeService.Scope scope, UUID markId) {
        boolean admin = "ADMIN".equals(scope.role());
        record Found(JornadaController.MarkView view, UUID employeeId) { }
        Found mark = jdbc.query("SELECT m.id,m.jornada_id,m.action,m.sequence_number,m.accepted_at,m.occurred_at,m.recorded_at,m.location_status,m.latitude,m.longitude," +
                        "m.voided_at,m.void_reason,j.employee_id FROM mark_events m JOIN jornadas j ON j.id=m.jornada_id AND j.company_id=m.company_id WHERE m.id=? AND m.company_id=?",
                rs -> rs.next() ? new Found(JornadaController.markView(rs, admin), UUID.fromString(rs.getString("employee_id"))) : null,
                markId.toString(), scope.companyId().toString());
        if (mark == null) throw ApiException.notFound();
        if ("EMPLOYEE".equals(scope.role()) && !mark.employeeId().equals(scopes.employeeIdFor(scope))) throw ApiException.notFound();
        return mark.view();
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
        requireNotCancelled(jornada);
        Instant now = Instant.now();
        validateAdminEventTime(jornada, occurredAt, now);
        List<HistoryRow> history = loadHistory(scope.companyId(), jornadaId);
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
        LockedMark mark = lockMark(scope.companyId(), markId);
        if (mark == null) throw ApiException.notFound();
        if (mark.voided()) throw markVoided();
        Instant now = Instant.now();
        // Only a new event time is bounded: keeping the stored time (an action-only fix) must stay possible even for an
        // employee mark recorded outside the window (2026-10-27 review finding).
        if (!newOccurredAt.equals(mark.occurredAt())) validateAdminEventTime(jornada, newOccurredAt, now);
        List<HistoryRow> history = loadHistory(scope.companyId(), mark.jornadaId());
        List<HistoryRow> corrected = retroactiveTimeline(history, history.stream()
                .filter(row -> row.id().equals(markId))
                .map(row -> new HistoryRow(row.id(), row.sequence(), row.timelineOrder(), newAction, newOccurredAt))
                .findFirst().orElseThrow());
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

    /**
     * D-20261027-07: cancels a declared jornada that has no mark at all (a voided mark still counts as a mark). The jornada lock
     * is taken first, then its marks and deviations (CLAUDE.md §5.11); its active deviations are retracted and audited.
     */
    @Transactional
    public CancellationResult cancelJornada(ScopeService.Scope scope, UUID jornadaId, String reason) {
        if (!"ADMIN".equals(scope.role())) throw ApiException.forbidden();
        JornadaLock jornada = lockJornada(scope.companyId(), jornadaId);
        requireNotCancelled(jornada);
        Integer marks = jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE company_id=? AND jornada_id=? FOR UPDATE",
                Integer.class, scope.companyId().toString(), jornadaId.toString());
        if (!"NO_INGRESO".equals(jornada.state()) || marks == null || marks > 0) {
            throw ApiException.conflict("JORNADA_HAS_MARKS", "A jornada with marks cannot be cancelled; correct or void its marks instead");
        }
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        jdbc.update("UPDATE jornadas SET state='CANCELADA',cancelled_at=?,cancelled_by=?,cancel_reason=? WHERE id=? AND company_id=? AND state='NO_INGRESO'",
                timestamp(now), scope.accountId().toString(), reason, jornadaId.toString(), scope.companyId().toString());
        deviations.retractAll(scope.companyId(), jornadaId, now);
        return new CancellationResult(jornadaId, "CANCELADA", now, scope.accountId(), reason);
    }

    /**
     * D-20261027-08: voids a wrong mark. The row and its sequence number stay; the mark stops counting for the state, the
     * transitions and the deviations, which are recomputed in the same transaction. Only allowed when the remaining history is
     * valid; the void is audited in mark_correction_audits (change_kind VOID).
     */
    @Transactional
    public JornadaController.MarkView voidMark(ScopeService.Scope scope, UUID markId, String reason) {
        if (!"ADMIN".equals(scope.role())) throw ApiException.forbidden();
        UUID jornadaId = jornadaIdForMark(scope.companyId(), markId);
        if (jornadaId == null) throw ApiException.notFound();
        JornadaLock jornada = lockJornada(scope.companyId(), jornadaId);
        LockedMark mark = lockMark(scope.companyId(), markId);
        if (mark == null) throw ApiException.notFound();
        if (mark.voided()) throw markVoided();
        List<HistoryRow> remaining = loadHistory(scope.companyId(), jornadaId).stream().filter(row -> !row.id().equals(markId)).toList();
        validateHistory(remaining, "INVALID_MARK_HISTORY");
        Instant now = Instant.now().truncatedTo(ChronoUnit.MICROS);
        jdbc.update("INSERT INTO mark_correction_audits(id,company_id,mark_id,before_action,after_action,before_occurred_at,after_occurred_at,actor_account_id,audit_reason,corrected_at,change_kind) VALUES(?,?,?,?,?,?,?,?,?,?,'VOID')",
                UUID.randomUUID().toString(), scope.companyId().toString(), markId.toString(), mark.action().name(), mark.action().name(), timestamp(mark.occurredAt()),
                timestamp(mark.occurredAt()), scope.accountId().toString(), reason, timestamp(now));
        jdbc.update("UPDATE mark_events SET voided_at=?,voided_by=?,void_reason=? WHERE id=? AND company_id=? AND voided_at IS NULL",
                timestamp(now), scope.accountId().toString(), reason, markId.toString(), scope.companyId().toString());
        jdbc.update("UPDATE jornadas SET state=? WHERE id=? AND company_id=?",
                MarkState.from(remaining.stream().map(HistoryRow::action).toList()), jornadaId.toString(), scope.companyId().toString());
        reconcile(scope.companyId(), jornada, remaining, now);
        return getMark(scope, markId);
    }

    public void createDueAbsences(Instant now, int batchSize) {
        if (batchSize < 1) return;
        String activeJoins = "FROM jornadas j " +
                "JOIN employees e ON e.id=j.employee_id AND e.company_id=j.company_id AND e.active=TRUE " +
                "JOIN accounts a ON a.id=e.account_id AND a.active=TRUE " +
                "JOIN company_memberships cm ON cm.company_id=e.company_id AND cm.account_id=e.account_id AND cm.active=TRUE ";
        List<Candidate> candidates = new ArrayList<>(isolatedTransaction.execute(status -> jdbc.query("SELECT j.id,j.company_id,j.deviation_worker_failure_count " + activeJoins +
                        "WHERE j.state='NO_INGRESO' AND DATE_ADD(j.scheduled_start_at, INTERVAL j.tolerance_minutes MINUTE) < ? " +
                        "AND (j.deviation_worker_retry_at IS NULL OR j.deviation_worker_retry_at<=?) " +
                        "AND NOT EXISTS (SELECT 1 FROM mark_events m WHERE m.jornada_id=j.id AND m.action='INGRESO' AND m.voided_at IS NULL) " +
                        "AND NOT EXISTS (SELECT 1 FROM deviations d WHERE d.jornada_id=j.id AND d.type='SIN_INGRESO' AND d.active=TRUE) " +
                        "ORDER BY j.scheduled_start_at,j.id LIMIT ?",
                (rs, row) -> new Candidate(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("company_id")), rs.getInt("deviation_worker_failure_count")),
                timestamp(now), timestamp(now), batchSize)));
        // MARCA_FALTANTE (D-20261018-01): INGRESO without EGRESO past scheduled end + tolerance, not yet flagged.
        candidates.addAll(isolatedTransaction.execute(status -> jdbc.query("SELECT j.id,j.company_id,j.deviation_worker_failure_count " + activeJoins +
                        "WHERE j.state IN ('EN_CURSO','PAUSA_ABIERTA') AND DATE_ADD(j.scheduled_end_at, INTERVAL j.tolerance_minutes MINUTE) < ? " +
                        "AND (j.deviation_worker_retry_at IS NULL OR j.deviation_worker_retry_at<=?) " +
                        "AND EXISTS (SELECT 1 FROM mark_events m WHERE m.jornada_id=j.id AND m.company_id=j.company_id AND m.action='INGRESO' AND m.voided_at IS NULL) " +
                        "AND NOT EXISTS (SELECT 1 FROM mark_events m WHERE m.jornada_id=j.id AND m.company_id=j.company_id AND m.action='EGRESO' AND m.voided_at IS NULL) " +
                        "AND NOT EXISTS (SELECT 1 FROM deviations d WHERE d.jornada_id=j.id AND d.company_id=j.company_id AND d.type='MARCA_FALTANTE' AND d.active=TRUE) " +
                        "ORDER BY j.scheduled_end_at,j.id LIMIT ?",
                (rs, row) -> new Candidate(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("company_id")), rs.getInt("deviation_worker_failure_count")),
                timestamp(now), timestamp(now), batchSize)));
        for (Candidate candidate : candidates) {
            try {
                isolatedTransaction.executeWithoutResult(status -> {
                    createAbsenceIfStillDue(candidate.companyId(), candidate.jornadaId(), now);
                    jdbc.update("UPDATE jornadas SET deviation_worker_failure_count=0,deviation_worker_retry_at=NULL WHERE id=? AND company_id=?",
                            candidate.jornadaId().toString(), candidate.companyId().toString());
                });
            } catch (RuntimeException ex) {
                recordDeviationWorkerFailure(candidate, now, ex);
            }
        }
    }

    private void recordDeviationWorkerFailure(Candidate candidate, Instant now, RuntimeException failure) {
        try {
            RetrySchedule retry = isolatedTransaction.execute(status -> {
                Integer previousFailureCount = jdbc.query("SELECT deviation_worker_failure_count FROM jornadas WHERE id=? AND company_id=? FOR UPDATE",
                        rs -> rs.next() ? rs.getInt(1) : null, candidate.jornadaId().toString(), candidate.companyId().toString());
                if (previousFailureCount == null) return null;
                int failureCount = DEVIATION_WORKER_RETRY_POLICY.nextFailureCount(previousFailureCount);
                Instant retryAt = now.plus(DEVIATION_WORKER_RETRY_POLICY.delayForFailure(failureCount));
                jdbc.update("UPDATE jornadas SET deviation_worker_failure_count=?,deviation_worker_retry_at=? WHERE id=? AND company_id=?",
                        failureCount, timestamp(retryAt), candidate.jornadaId().toString(), candidate.companyId().toString());
                return new RetrySchedule(failureCount, retryAt);
            });
            if (retry == null) return;
            if (DEVIATION_WORKER_RETRY_POLICY.shouldWarnOnFailure(candidate.failureCount(), retry.failureCount())) {
                LOGGER.warn("Due deviation candidate {} in company {} failed on attempt {}; retry scheduled at {} (failureType={})",
                        candidate.jornadaId(), candidate.companyId(), retry.failureCount(), retry.retryAt(), failure.getClass().getSimpleName());
            } else {
                LOGGER.debug("Due deviation candidate {} in company {} failed on attempt {}; retry scheduled at {} (failureType={})",
                        candidate.jornadaId(), candidate.companyId(), retry.failureCount(), retry.retryAt(), failure.getClass().getSimpleName());
            }
        } catch (RuntimeException retryFailure) {
            LOGGER.error("Could not persist retry for due deviation candidate {} in company {} (failureType={}, retryStateFailureType={})",
                    candidate.jornadaId(), candidate.companyId(), failure.getClass().getSimpleName(), retryFailure.getClass().getSimpleName());
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
        // Picked before an ADMIN cancelled it (D-20261027-07): a cancelled jornada never gets a deviation again.
        if (CANCELADA.equals(jornada.state())) return;
        List<HistoryRow> history = loadHistory(companyId, jornadaId);
        reconcile(companyId, jornada, history, now);
    }

    private static void requireNotCancelled(JornadaLock jornada) {
        if (CANCELADA.equals(jornada.state())) throw ApiException.conflict("JORNADA_CANCELLED", "The jornada was cancelled by an ADMIN");
    }

    private static ApiException markVoided() { return ApiException.conflict("MARK_VOIDED", "The mark was voided by an ADMIN"); }

    private LockedMark lockMark(UUID companyId, UUID markId) {
        return jdbc.query("SELECT id,jornada_id,action,occurred_at,voided_at FROM mark_events WHERE id=? AND company_id=? FOR UPDATE",
                rs -> rs.next() ? new LockedMark(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("jornada_id")),
                        MarkAction.valueOf(rs.getString("action")), rs.getTimestamp("occurred_at").toInstant(), rs.getTimestamp("voided_at") != null) : null,
                markId.toString(), companyId.toString());
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

    /** The id of the mark already recorded with this key and payload; a different payload under the same key conflicts. */
    private Optional<UUID> findIdempotent(UUID accountId, UUID key, String fingerprint) {
        return jdbc.query("SELECT request_hash,mark_id FROM mark_idempotency WHERE account_id=? AND idempotency_key=?",
                rs -> {
                    if (!rs.next()) return Optional.empty();
                    if (!fingerprint.equals(rs.getString("request_hash"))) throw ApiException.conflict("IDEMPOTENCY_CONFLICT", "This idempotency key was used for a different mark request");
                    return Optional.of(UUID.fromString(rs.getString("mark_id")));
                }, accountId.toString(), key.toString());
    }

    /** ADMIN event times are bounded (rule 15): never after the server time, and within 24 h of the jornada schedule. */
    private static void validateAdminEventTime(JornadaLock jornada, Instant occurredAt, Instant now) {
        if (occurredAt.isAfter(now) || occurredAt.isBefore(jornada.scheduledStart().minus(ADMIN_EVENT_MARGIN))
                || occurredAt.isAfter(jornada.scheduledEnd().plus(ADMIN_EVENT_MARGIN))) {
            throw ApiException.invalid("The event time cannot be in the future and must be within 24 hours of the jornada schedule");
        }
    }

    private JornadaLock lockJornada(UUID companyId, UUID jornadaId) {
        JornadaLock row = jdbc.query("SELECT id,employee_id,site_id,schedule_snapshot,tolerance_minutes,scheduled_start_at,scheduled_end_at,next_sequence,state FROM jornadas WHERE id=? AND company_id=? FOR UPDATE",
                rs -> rs.next() ? new JornadaLock(UUID.fromString(rs.getString("id")), UUID.fromString(rs.getString("employee_id")), UUID.fromString(rs.getString("site_id")),
                        rs.getString("schedule_snapshot"), rs.getInt("tolerance_minutes"), rs.getTimestamp("scheduled_start_at").toInstant(),
                        rs.getTimestamp("scheduled_end_at").toInstant(), rs.getLong("next_sequence"), rs.getString("state")) : null, jornadaId.toString(), companyId.toString());
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

    /** The marks that count (voided ones excluded, D-20261027-08), in timeline order, locked. */
    private List<HistoryRow> loadHistory(UUID companyId, UUID jornadaId) {
        return jdbc.query("SELECT id,sequence_number,timeline_order,action,occurred_at FROM mark_events WHERE company_id=? AND jornada_id=? AND voided_at IS NULL ORDER BY timeline_order,sequence_number FOR UPDATE",
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
        validateHistory(history, "INVALID_MARK_TRANSITION");
    }

    private void validateHistory(List<HistoryRow> history, String conflictCode) {
        List<MarkAction> actions = new ArrayList<>();
        for (HistoryRow row : history) {
            try { transitions.validate(actions, row.action()); actions.add(row.action()); }
            catch (InvalidStateTransitionException ex) { throw ApiException.conflict(conflictCode, ex.getMessage()); }
        }
    }

    /** A just-written mark: never voided. */
    private JornadaController.MarkView toView(UUID id, UUID jornadaId, MarkAction action, long sequence, Instant acceptedAt, Instant occurredAt,
                                               Instant recordedAt, String status, Double lat, Double lon) {
        return new JornadaController.MarkView(id, jornadaId, action.name(), sequence, acceptedAt, occurredAt, recordedAt, status, lat, lon, false, null, null, List.of());
    }

    private static java.sql.Timestamp timestamp(Instant instant) { return java.sql.Timestamp.from(instant); }

    private static final String CANCELADA = "CANCELADA";

    public record MarkResult(JornadaController.MarkView mark, boolean replay) { }
    public record LocationResult(UUID markId, String locationStatus) { }
    public record CancellationResult(UUID jornadaId, String state, Instant cancelledAt, UUID cancelledBy, String cancelReason) { }
    private record HistoryRow(UUID id, long sequence, long timelineOrder, MarkAction action, Instant occurredAt) { }
    private record JornadaLock(UUID id, UUID employeeId, UUID siteId, String snapshot, int toleranceMinutes, Instant scheduledStart, Instant scheduledEnd, long nextSequence,
                               String state) { }
    private record LockedMark(UUID id, UUID jornadaId, MarkAction action, Instant occurredAt, boolean voided) { }
    private record Candidate(UUID jornadaId, UUID companyId, int failureCount) { }
    private record RetrySchedule(int failureCount, Instant retryAt) { }
    private record MarkRow(UUID id, UUID jornadaId, UUID employeeId, MarkAction action, long sequence, Instant acceptedAt, Instant occurredAt, Instant recordedAt,
                           String locationStatus, BigDecimal latitude, BigDecimal longitude) { }
}
