package com.braja.fichaje.security;

import com.braja.fichaje.api.ApiException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * ADMIN reset of an employee password (D-20261027-09). The account is global per DNI (D-20261016-01), so the reset is
 * refused when the person holds any other membership (another company, active or not) or an ADMIN role: a company
 * must never change how that person signs in elsewhere. The temporary password is returned once and only its BCrypt
 * hash is stored; it is never logged nor audited.
 */
@Service
public class PasswordResetService {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate transactions;
    private final PasswordEncoder passwordEncoder;
    private final TemporaryPasswordGenerator generator;
    private final LoginThrottleService throttle;

    public PasswordResetService(JdbcTemplate jdbc, PlatformTransactionManager transactionManager, PasswordEncoder passwordEncoder,
                                TemporaryPasswordGenerator generator, LoginThrottleService throttle) {
        this.jdbc = jdbc;
        this.transactions = new TransactionTemplate(transactionManager);
        this.passwordEncoder = passwordEncoder;
        this.generator = generator;
        this.throttle = throttle;
    }

    /**
     * BCrypt runs before the transaction, like {@link AccountService#changePassword}, so no lock waits on it. Locks
     * follow the global order: account, memberships, employee. Hash, forced change, session deletion, DNI throttle
     * reset and audit commit together.
     */
    public String resetEmployeePassword(UUID companyId, UUID actorAccountId, UUID employeeId) {
        String temporaryPassword = generator.generate();
        String hash = passwordEncoder.encode(temporaryPassword);
        transactions.executeWithoutResult(status -> {
            UUID accountId = jdbc.query("SELECT account_id FROM employees WHERE id=? AND company_id=?",
                    rs -> rs.next() ? UUID.fromString(rs.getString(1)) : null, employeeId.toString(), companyId.toString());
            if (accountId == null) throw ApiException.notFound();
            AccountRow account = jdbc.queryForObject("SELECT dni_display,dni_normalized,active FROM accounts WHERE id=? FOR UPDATE",
                    (rs, row) -> new AccountRow(rs.getString("dni_display"), rs.getString("dni_normalized"), rs.getBoolean("active")), accountId.toString());
            List<MembershipRow> memberships = jdbc.query("SELECT company_id,role,active FROM company_memberships WHERE account_id=? ORDER BY id FOR UPDATE",
                    (rs, row) -> new MembershipRow(rs.getString("company_id"), rs.getString("role"), rs.getBoolean("active")), accountId.toString());
            if (memberships.stream().anyMatch(m -> !m.companyId().equals(companyId.toString()) || !"EMPLOYEE".equals(m.role()))) {
                throw ApiException.conflict("ACCOUNT_SHARED", "This account cannot be reset from this company; the operator must handle it");
            }
            Boolean employeeActive = jdbc.queryForObject("SELECT active FROM employees WHERE id=? AND company_id=? FOR UPDATE",
                    Boolean.class, employeeId.toString(), companyId.toString());
            if (!account.active() || !Boolean.TRUE.equals(employeeActive) || memberships.stream().noneMatch(MembershipRow::active)) {
                throw ApiException.conflict("EMPLOYEE_INACTIVE", "An inactive employee cannot have the password reset");
            }
            Timestamp now = Timestamp.from(Instant.now());
            jdbc.update("UPDATE accounts SET password_hash=?, must_change_password=TRUE, updated_at=? WHERE id=?", hash, now, accountId.toString());
            // Same principal as AccountService.changePassword: Spring Session stores dni_display (BrajaUserDetails).
            jdbc.update("DELETE FROM SPRING_SESSION WHERE PRINCIPAL_NAME=?", account.principalName());
            throttle.succeeded(account.dni()); // joins this transaction; clears a DNI lock so the employee can sign in
            jdbc.update("INSERT INTO password_reset_audits(id,company_id,employee_id,account_id,actor_account_id,created_at) VALUES(?,?,?,?,?,?)",
                    UUID.randomUUID().toString(), companyId.toString(), employeeId.toString(), accountId.toString(), actorAccountId.toString(), now);
        });
        return temporaryPassword;
    }

    private record AccountRow(String principalName, String dni, boolean active) { }
    private record MembershipRow(String companyId, String role, boolean active) { }
}
