package com.braja.fichaje.campaign;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.sql.Statement;
import java.util.List;

/**
 * Base of every campaign suite: real HTTP on a random port, real MySQL 8.4, one shared Spring context
 * (no @DirtiesContext), the server clock under test control and a fake push provider.
 * Jobs never run on their own (scheduling off): a test or the simulation calls the real job beans.
 * Every test starts from an empty database, so jobs never see another test's rows.
 */
@Tag("campaign")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
@Import(CampaignTestConfiguration.class)
public abstract class CampaignTestBase {
    /** Kept: the schema version and nothing else. */
    private static final List<String> KEPT_TABLES = List.of("flyway_schema_history");

    @DynamicPropertySource
    static void campaignProperties(DynamicPropertyRegistry registry) {
        // Every value is set here so nothing from a developer's ../.env leaks into the campaign.
        registry.add("spring.datasource.url", SharedMySql::jdbcUrl);
        registry.add("spring.datasource.username", SharedMySql.MYSQL::getUsername);
        registry.add("spring.datasource.password", SharedMySql.MYSQL::getPassword);
        registry.add("braja.scheduling.enabled", () -> "false");
        registry.add("braja.bootstrap-enabled", () -> "false");
        registry.add("braja.health-encryption-key-base64", () -> TestKeys.HEALTH_KEY);
        registry.add("braja.login-ip-throttle-key-base64", () -> TestKeys.LOGIN_IP_THROTTLE_KEY);
        registry.add("braja.push-subscription-encryption-key-base64", () -> TestKeys.PUSH_SUBSCRIPTION_KEY);
        registry.add("braja.vapid-public-key", () -> TestKeys.VAPID_PUBLIC);
        registry.add("braja.vapid-private-key", () -> TestKeys.VAPID_PRIVATE);
        registry.add("braja.vapid-subject", () -> "mailto:campaign@example.invalid");
        registry.add("braja.login-ip-throttle-max-failures", () -> "100");
        registry.add("braja.login-ip-throttle-window", () -> "15m");
        registry.add("braja.login-ip-throttle-lock-duration", () -> "15m");
        // Requests come from 127.0.0.1, so each simulated person gets its own client IP via X-Forwarded-For.
        registry.add("braja.trusted-proxy-cidrs", () -> "127.0.0.1/32");
        registry.add("braja.session-cookie-secure", () -> "false");
        registry.add("server.servlet.session.cookie.secure", () -> "false");
    }

    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected MutableClock clock;
    @Autowired protected FakeWebPushGateway push;
    @Autowired protected ObjectMapper json;
    @Autowired private PasswordEncoder passwordEncoder;
    @LocalServerPort protected int port;

    protected final HttpLog httpLog = new HttpLog();
    protected Fixture fixture;

    @BeforeEach
    void resetCampaignState() {
        clock.reset();
        push.reset();
        httpLog.clear();
        wipeDatabase();
        fixture = new Fixture(baseUrl(), json, jdbc, passwordEncoder, clock, httpLog);
    }

    protected String baseUrl() {
        return "http://127.0.0.1:" + port;
    }

    private void wipeDatabase() {
        List<String> tables = jdbc.queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
                String.class);
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            try (Statement statement = connection.createStatement()) {
                statement.execute("SET FOREIGN_KEY_CHECKS = 0");
                try {
                    for (String table : tables) {
                        if (!KEPT_TABLES.contains(table)) statement.executeUpdate("DELETE FROM `" + table + "`");
                    }
                } finally {
                    statement.execute("SET FOREIGN_KEY_CHECKS = 1");
                }
            }
            return null;
        });
    }
}
