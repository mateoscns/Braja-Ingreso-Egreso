package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.FakeWebPushGateway;
import com.braja.fichaje.campaign.Fixture;
import com.braja.fichaje.campaign.HttpLog;
import com.braja.fichaje.campaign.MutableClock;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.sql.Statement;
import java.util.List;

/** Wires one simulation run from what the campaign base injects; also empties the database between two runs (S8). */
final class SimulationHarness {
    private static volatile String cachedHash;

    private SimulationHarness() { }

    record Handles(JdbcTemplate jdbc, MutableClock clock, ObjectMapper json, Fixture fixture, HttpLog http, FakeWebPushGateway push,
                   PasswordEncoder passwords, String baseUrl, SimContext.JobBeans beans) { }

    static SimulationDriver.Result run(SimSettings settings, Handles handles) {
        SimContext ctx = new SimContext(settings, handles.jdbc(), handles.clock(), handles.json(), handles.fixture(), handles.http(),
                handles.push(), hash(handles.passwords()), handles.baseUrl(), handles.beans());
        SimulationDriver.Result result = new SimulationDriver(ctx).run();
        System.out.println("SIMULATION seed=" + settings.seed() + " days=" + settings.days() + " took " + result.elapsed().toSeconds() + " s; output "
                + settings.outputDir().toAbsolutePath());
        List<String> lines = result.summaries();
        lines.subList(Math.max(0, lines.size() - 3), lines.size()).forEach(System.out::println);
        System.out.println(result.s54());
        System.out.println(result.s77());
        System.out.println("epilogue: " + result.epilogue());
        return result;
    }

    /** The same reset the campaign base does before each test method, for a second run inside one method. */
    static void reset(Handles handles) {
        handles.clock().reset();
        handles.push().reset();
        handles.http().clear();
        List<String> tables = handles.jdbc().queryForList(
                "SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'", String.class);
        handles.jdbc().execute((ConnectionCallback<Void>) connection -> {
            try (Statement statement = connection.createStatement()) {
                statement.execute("SET FOREIGN_KEY_CHECKS = 0");
                try {
                    for (String table : tables) if (!table.equals("flyway_schema_history")) statement.executeUpdate("DELETE FROM `" + table + "`");
                } finally {
                    statement.execute("SET FOREIGN_KEY_CHECKS = 1");
                }
            }
            return null;
        });
    }

    /** One BCrypt hash for every seeded account: BCrypt 12 costs about 250 ms per hash. */
    private static String hash(PasswordEncoder passwords) {
        String hash = cachedHash;
        if (hash == null) cachedHash = hash = passwords.encode(Fixture.PASSWORD);
        return hash;
    }
}
