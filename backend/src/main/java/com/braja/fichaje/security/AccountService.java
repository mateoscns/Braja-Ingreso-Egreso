package com.braja.fichaje.security;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.config.BrajaProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.util.*;

@Service
public class AccountService {
    private static final Logger LOGGER = LoggerFactory.getLogger(AccountService.class);
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final AuthenticationManager authenticationManager;
    private final PasswordEncoder passwordEncoder;
    private final CurrentActor currentActor;
    private final SessionAuthenticationStrategy sessionStrategy;
    private final SecurityContextRepository contextRepository;
    private final CsrfTokenRepository csrfRepository;
    private final BrajaProperties properties;
    private final LoginThrottleService throttle;
    private final ClientAddressResolver clientAddressResolver;

    public AccountService(JdbcTemplate jdbc, AuthenticationManager authenticationManager, PasswordEncoder passwordEncoder,
                          CurrentActor currentActor, SessionAuthenticationStrategy sessionStrategy,
                          SecurityContextRepository contextRepository, CsrfTokenRepository csrfRepository,
                          BrajaProperties properties, LoginThrottleService throttle, ClientAddressResolver clientAddressResolver,
                          PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.transactions = new TransactionTemplate(transactionManager);
        this.authenticationManager = authenticationManager;
        this.passwordEncoder = passwordEncoder;
        this.currentActor = currentActor;
        this.sessionStrategy = sessionStrategy;
        this.contextRepository = contextRepository;
        this.csrfRepository = csrfRepository;
        this.properties = properties;
        this.throttle = throttle;
        this.clientAddressResolver = clientAddressResolver;
    }

    /**
     * Deliberately not {@code @Transactional}: each step takes one pooled connection and returns it before the next,
     * and BCrypt runs without holding any (2026-10-27: an outer transaction plus the user lookup's own connection
     * starved the pool under 12 concurrent logins). The DNI attempt is reserved before the password is verified.
     * Any database failure answers 503 and returns a reservation whose check did not finish (2026-10-27: only the user
     * lookup did; a failing throttle or membership query answered 500 and kept the attempt counted).
     */
    public SessionView login(String rawDni, String password, HttpServletRequest request, HttpServletResponse response) {
        String dni = DniNormalizer.normalize(rawDni);
        String clientAddress = clientAddressResolver.resolve(request);
        AttemptState attempt = new AttemptState(dni);
        try {
            return authenticate(dni, password, clientAddress, attempt, request, response);
        } catch (EmptyResultDataAccessException ex) {
            throw ex; // a missing row is not an outage; the reservation, if any, was already settled
        } catch (DataAccessException | org.springframework.transaction.TransactionException | AuthenticationServiceException ex) {
            if (attempt.sessionStarted) clearSession(request, ex);
            throw unavailable(attempt, ex);
        }
    }

    private SessionView authenticate(String dni, String password, String clientAddress, AttemptState attempt,
                                     HttpServletRequest request, HttpServletResponse response) {
        throttle.assertNotLocked(dni, clientAddress);
        throttle.reserveAttempt(dni);
        attempt.held = true;
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(dni, password));
        } catch (AuthenticationServiceException ex) {
            throw ex; // 2026-10-27: a database failure was counted as a wrong password and answered "Invalid DNI or password".
        } catch (org.springframework.security.core.AuthenticationException ex) {
            attempt.held = false; // a verified wrong password consumes the reservation, even if the IP update fails
            throttle.failedFromAddress(clientAddress);
            throw invalidCredentials();
        }
        UUID accountId = ((BrajaUserDetails) authentication.getPrincipal()).accountId();
        List<MembershipView> activeMemberships = memberships(accountId);
        if (activeMemberships.isEmpty()) {
            attempt.held = false; // the reserved DNI attempt stays counted
            throw invalidCredentials();
        }
        throttle.succeeded(dni);
        attempt.held = false;
        attempt.sessionStarted = true;
        sessionStrategy.onAuthentication(authentication, request, response);
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, request, response);
        UUID activeCompany = activeMemberships.getFirst().companyId();
        if (activeCompany != null) request.getSession(true).setAttribute(CurrentActor.ACTIVE_COMPANY_SESSION_KEY, activeCompany);
        return session(accountId, request);
    }

    public SessionView session(UUID accountId, HttpServletRequest request) {
        AccountRow account = jdbc.queryForObject("SELECT id, dni_display, must_change_password FROM accounts WHERE id = ? AND active = TRUE",
                (rs, row) -> new AccountRow(UUID.fromString(rs.getString("id")), rs.getString("dni_display"), rs.getBoolean("must_change_password")), accountId.toString());
        List<MembershipView> memberships = memberships(accountId);
        UUID active = null;
        var session = request.getSession(false);
        if (session != null) {
            Object activeValue = session.getAttribute(CurrentActor.ACTIVE_COMPANY_SESSION_KEY);
            if (activeValue instanceof UUID id && memberships.stream().anyMatch(m -> m.companyId().equals(id))) active = id;
        }
        if (active == null && !memberships.isEmpty()) {
            active = memberships.getFirst().companyId();
            request.getSession(true).setAttribute(CurrentActor.ACTIVE_COMPANY_SESSION_KEY, active);
        }
        return new SessionView(account.id(), account.dni(), memberships, active, account.mustChangePassword(), displayName(accountId, active));
    }

    /** Active company employee name, else the membership name (bootstrap ADMIN); null when neither is stored. */
    private String displayName(UUID accountId, UUID companyId) {
        if (companyId == null) return null;
        return jdbc.query("SELECT COALESCE((SELECT e.display_name FROM employees e WHERE e.company_id=m.company_id AND e.account_id=m.account_id AND e.active=TRUE), m.display_name) " +
                        "FROM company_memberships m WHERE m.company_id=? AND m.account_id=? AND m.active=TRUE",
                rs -> rs.next() ? rs.getString(1) : null, companyId.toString(), accountId.toString());
    }

    public List<MembershipView> memberships(UUID accountId) {
        return jdbc.query("SELECT m.company_id, c.name, m.role FROM company_memberships m JOIN companies c ON c.id=m.company_id " +
                        "WHERE m.account_id=? AND m.active=TRUE AND (m.role<>'EMPLOYEE' OR EXISTS " +
                        "(SELECT 1 FROM employees e WHERE e.company_id=m.company_id AND e.account_id=m.account_id AND e.active=TRUE)) " +
                        "ORDER BY c.name, m.company_id",
                (rs, row) -> new MembershipView(UUID.fromString(rs.getString("company_id")), rs.getString("name"), rs.getString("role")), accountId.toString());
    }

    /**
     * The current password counts against the same DNI throttle as login (2026-10-27: it had no attempt limit), and a
     * wrong one answers {@code CURRENT_PASSWORD_INVALID} so the client does not mistake it for an expired session.
     * Like login, the throttle and BCrypt run outside the transaction that writes the new password.
     */
    public void changePassword(UUID accountId, String currentPassword, String newPassword, String currentSessionId) {
        if (newPassword == null || newPassword.length() < 12 || newPassword.length() > 256) throw ApiException.invalid("New password must contain between 12 and 256 characters");
        AttemptState attempt = new AttemptState(null);
        try {
            AccountCredentials account = jdbc.queryForObject("SELECT password_hash,dni_display,dni_normalized FROM accounts WHERE id=? AND active=TRUE",
                    (rs, row) -> new AccountCredentials(rs.getString("password_hash"), rs.getString("dni_display"), rs.getString("dni_normalized")), accountId.toString());
            attempt.dni = account.dni();
            throttle.reserveAttempt(account.dni());
            attempt.held = true;
            if (!passwordEncoder.matches(currentPassword, account.passwordHash())) {
                attempt.held = false;
                throw new ApiException(HttpStatus.UNAUTHORIZED, "CURRENT_PASSWORD_INVALID", "Current password is incorrect");
            }
            throttle.succeeded(account.dni());
            attempt.held = false;
            String newHash = passwordEncoder.encode(newPassword);
            transactions.executeWithoutResult(status -> {
                jdbc.update("UPDATE accounts SET password_hash=?, must_change_password=FALSE, updated_at=? WHERE id=?", newHash, Instant.now(), accountId.toString());
                jdbc.update("DELETE FROM SPRING_SESSION WHERE PRINCIPAL_NAME=? AND SESSION_ID<>?", account.principalName(), currentSessionId);
            });
        } catch (EmptyResultDataAccessException ex) {
            throw ex; // an inactive or missing account is not an outage; behaviour unchanged
        } catch (DataAccessException | org.springframework.transaction.TransactionException ex) {
            throw unavailable(attempt, ex);
        }
    }

    /**
     * Returns a reservation whose check did not finish (best effort) and logs the cause once. The log carries no DNI,
     * password or address; a failed release is attached to the cause as suppressed instead of logged separately.
     */
    private ApiException unavailable(AttemptState attempt, RuntimeException cause) {
        boolean released = false;
        if (attempt.held) {
            try {
                throttle.releaseAttempt(attempt.dni);
                released = true;
            } catch (RuntimeException releaseFailure) {
                cause.addSuppressed(releaseFailure);
            }
        }
        LOGGER.warn("Authentication unavailable because of a database failure (reserved attempt released: {})", released, cause);
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AUTHENTICATION_UNAVAILABLE", "Authentication is temporarily unavailable");
    }

    /** A 503 must not leave behind a session that was already authenticated before the failure. */
    private static void clearSession(HttpServletRequest request, RuntimeException cause) {
        SecurityContextHolder.clearContext();
        try {
            var session = request.getSession(false);
            if (session != null) session.invalidate();
        } catch (RuntimeException invalidateFailure) {
            cause.addSuppressed(invalidateFailure);
        }
    }

    /** What an infrastructure failure must undo: a DNI reservation still held, or a session already authenticated. */
    private static final class AttemptState {
        private String dni;
        private boolean held;
        private boolean sessionStarted;

        private AttemptState(String dni) { this.dni = dni; }
    }

    private static ApiException invalidCredentials() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Invalid DNI or password");
    }

    public void invalidateSession(HttpServletRequest request, HttpServletResponse response) {
        SecurityContextHolder.clearContext();
        var session = request.getSession(false);
        if (session != null) session.invalidate();
        csrfRepository.saveToken(null, request, response);
        response.addHeader("Set-Cookie", "BRAJA_CSRF=; Path=/; Max-Age=0; SameSite=Lax" + (properties.isSessionCookieSecure() ? "; Secure" : ""));
    }

    public record MembershipView(UUID companyId, String companyName, String role) { }
    public record SessionView(UUID accountId, String dni, List<MembershipView> memberships, UUID activeCompanyId, boolean mustChangePassword, String displayName) { }
    private record AccountRow(UUID id, String dni, boolean mustChangePassword) { }
    private record AccountCredentials(String passwordHash, String principalName, String dni) { }
}
