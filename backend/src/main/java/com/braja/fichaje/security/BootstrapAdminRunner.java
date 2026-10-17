package com.braja.fichaje.security;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.util.UUID;

@Component
@ConditionalOnProperty(name = "braja.bootstrap-enabled", havingValue = "true")
public class BootstrapAdminRunner implements ApplicationRunner {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final Environment env;

    public BootstrapAdminRunner(JdbcTemplate jdbc, PasswordEncoder passwords, Environment env) {
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.env = env;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        String dniInput = required("braja.bootstrap-dni");
        String password = required("braja.bootstrap-password");
        String adminName = required("braja.bootstrap-admin-name");
        String companyName = required("braja.bootstrap-company-name");
        String siteName = required("braja.bootstrap-site-name");
        String timeZone = required("braja.bootstrap-time-zone");
        if (password.length() < 16 || password.length() > 256) throw new IllegalStateException("Bootstrap password must contain 16 to 256 characters");
        ZoneId.of(timeZone);
        String dni = DniNormalizer.normalize(dniInput);

        Integer companyCount = jdbc.queryForObject("SELECT COUNT(*) FROM companies", Integer.class);
        java.sql.Timestamp consumedAt = jdbc.queryForObject("SELECT consumed_at FROM bootstrap_guard WHERE id=1 FOR UPDATE", java.sql.Timestamp.class);
        if (companyCount == null || companyCount != 0 || consumedAt != null) {
            throw new IllegalStateException("First-admin bootstrap is available only once on an empty database");
        }
        if (jdbc.queryForObject("SELECT COUNT(*) FROM accounts WHERE dni_normalized=?", Integer.class, dni) != 0) {
            throw new IllegalStateException("Bootstrap DNI already exists");
        }
        Instant now = Instant.now();
        UUID accountId = UUID.randomUUID();
        UUID companyId = UUID.randomUUID();
        UUID siteId = UUID.randomUUID();
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                accountId.toString(), dni, dniInput.trim(), passwords.encode(password), java.sql.Timestamp.from(now), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), companyName.trim(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'ADMIN',TRUE,?)",
                UUID.randomUUID().toString(), companyId.toString(), accountId.toString(), java.sql.Timestamp.from(now));
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", siteId.toString(), companyId.toString(), siteName.trim(), timeZone, java.sql.Timestamp.from(now));
        jdbc.update("UPDATE bootstrap_guard SET consumed_at=? WHERE id=1 AND consumed_at IS NULL", java.sql.Timestamp.from(now));
    }

    private String required(String name) {
        String value = env.getProperty(name);
        if (value == null || value.isBlank()) throw new IllegalStateException("Bootstrap requires " + name + "; no default credentials are provided");
        return value;
    }
}
