package com.braja.fichaje.security;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.config.BrajaProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Service
public class AccountService {
    private final JdbcTemplate jdbc;
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
                          BrajaProperties properties, LoginThrottleService throttle, ClientAddressResolver clientAddressResolver) {
        this.jdbc = jdbc;
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

    @Transactional
    public SessionView login(String rawDni, String password, HttpServletRequest request, HttpServletResponse response) {
        String dni = DniNormalizer.normalize(rawDni);
        String clientAddress = clientAddressResolver.resolve(request);
        throttle.assertNotLocked(dni, clientAddress);
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(dni, password));
        } catch (org.springframework.security.core.AuthenticationException ex) {
            throttle.failed(dni, clientAddress);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Invalid DNI or password");
        }
        UUID accountId = ((BrajaUserDetails) authentication.getPrincipal()).accountId();
        List<MembershipView> activeMemberships = memberships(accountId);
        if (activeMemberships.isEmpty()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Invalid DNI or password");
        }
        throttle.succeeded(dni);
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

    /** Name stored in the active company's employee row; an ADMIN without one (no name is persisted for them) yields null. */
    private String displayName(UUID accountId, UUID companyId) {
        if (companyId == null) return null;
        return jdbc.query("SELECT display_name FROM employees WHERE company_id=? AND account_id=? AND active=TRUE",
                rs -> rs.next() ? rs.getString(1) : null, companyId.toString(), accountId.toString());
    }

    public List<MembershipView> memberships(UUID accountId) {
        return jdbc.query("SELECT m.company_id, c.name, m.role FROM company_memberships m JOIN companies c ON c.id=m.company_id " +
                        "WHERE m.account_id=? AND m.active=TRUE AND (m.role<>'EMPLOYEE' OR EXISTS " +
                        "(SELECT 1 FROM employees e WHERE e.company_id=m.company_id AND e.account_id=m.account_id AND e.active=TRUE)) " +
                        "ORDER BY c.name, m.company_id",
                (rs, row) -> new MembershipView(UUID.fromString(rs.getString("company_id")), rs.getString("name"), rs.getString("role")), accountId.toString());
    }

    @Transactional
    public void changePassword(UUID accountId, String currentPassword, String newPassword, String currentSessionId) {
        if (newPassword == null || newPassword.length() < 12 || newPassword.length() > 256) throw ApiException.invalid("New password must contain between 12 and 256 characters");
        AccountCredentials account = jdbc.queryForObject("SELECT password_hash,dni_display FROM accounts WHERE id=? AND active=TRUE",
                (rs, row) -> new AccountCredentials(rs.getString("password_hash"), rs.getString("dni_display")), accountId.toString());
        if (!passwordEncoder.matches(currentPassword, account.passwordHash())) throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Current password is incorrect");
        jdbc.update("UPDATE accounts SET password_hash=?, must_change_password=FALSE, updated_at=? WHERE id=?", passwordEncoder.encode(newPassword), Instant.now(), accountId.toString());
        jdbc.update("DELETE FROM SPRING_SESSION WHERE PRINCIPAL_NAME=? AND SESSION_ID<>?", account.principalName(), currentSessionId);
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
    private record AccountCredentials(String passwordHash, String principalName) { }
}
