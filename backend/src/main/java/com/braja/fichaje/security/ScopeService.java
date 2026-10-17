package com.braja.fichaje.security;

import com.braja.fichaje.api.ApiException;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

import java.util.UUID;

@Service
public class ScopeService {
    private final JdbcTemplate jdbc;
    private final CurrentActor actor;

    public ScopeService(JdbcTemplate jdbc, CurrentActor actor) {
        this.jdbc = jdbc;
        this.actor = actor;
    }

    public Scope require(Authentication authentication, HttpSession session) {
        UUID accountId = actor.accountId(authentication);
        UUID companyId = actor.activeCompany(session);
        Scope scope = jdbc.query("SELECT m.role, a.must_change_password FROM company_memberships m JOIN accounts a ON a.id=m.account_id " +
                        "WHERE m.account_id=? AND m.company_id=? AND m.active=TRUE AND a.active=TRUE " +
                        "AND (m.role<>'EMPLOYEE' OR EXISTS (SELECT 1 FROM employees e WHERE e.company_id=m.company_id AND e.account_id=m.account_id AND e.active=TRUE))",
                rs -> rs.next() ? new Scope(accountId, companyId, rs.getString("role"), rs.getBoolean("must_change_password")) : null,
                accountId.toString(), companyId.toString());
        if (scope == null) throw ApiException.forbidden();
        if (scope.mustChangePassword()) throw new ApiException(HttpStatus.FORBIDDEN, "PASSWORD_CHANGE_REQUIRED", "Change the temporary password before continuing");
        return scope;
    }

    public Scope requireAdmin(Authentication authentication, HttpSession session) {
        Scope scope = require(authentication, session);
        if (!"ADMIN".equals(scope.role())) throw ApiException.forbidden();
        return scope;
    }

    public UUID employeeIdFor(Scope scope) {
        return jdbc.query("SELECT id FROM employees WHERE company_id=? AND account_id=? AND active=TRUE",
                rs -> rs.next() ? UUID.fromString(rs.getString(1)) : null, scope.companyId().toString(), scope.accountId().toString());
    }

    public boolean employeeHasSite(UUID companyId, UUID employeeId, UUID siteId) {
        return !jdbc.queryForList("SELECT 1 FROM employee_sites WHERE company_id=? AND employee_id=? AND site_id=?",
                companyId.toString(), employeeId.toString(), siteId.toString()).isEmpty();
    }

    public boolean companyHasSite(UUID companyId, UUID siteId) {
        return !jdbc.queryForList("SELECT 1 FROM sites WHERE company_id=? AND id=?",
                companyId.toString(), siteId.toString()).isEmpty();
    }

    public record Scope(UUID accountId, UUID companyId, String role, boolean mustChangePassword) { }
}
