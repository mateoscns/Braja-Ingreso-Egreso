package com.braja.fichaje.campaign;

import com.braja.fichaje.timekeeping.MarkScheduler;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S75-S76: the migrations the first production deploy runs on real data (CLAUDE.md rules 19-20, §7 "Primer deploy").
 * Flyway work runs on throw-away databases created as root inside the shared container (never on {@code braja}, which the
 * shared Spring context owns); S76 needs the real job beans, so the class extends {@link CampaignTestBase}.
 */
class MigrationSpecTest extends CampaignTestBase {
    private static final Path MIGRATIONS = Path.of("src", "main", "resources", "db", "migration");
    private static final Pattern FILE = Pattern.compile("V(\\d+)__\\w+\\.sql");
    private static final Pattern REVERT = Pattern.compile("(?m)^--\\s*Revert:");
    /** Rule 19 applies from V12 on; V12 and V17 never existed (git log --all). */
    private static final Set<Integer> NEVER_EXISTED = Set.of(12, 17);
    /**
     * Exception ceiling, dated 2026-11-02: files that break "one statement and a -- Revert: comment". It may only shrink and
     * never reaches V12. V11 complies (one ALTER and its revert), so it is not listed.
     */
    private static final Map<Integer, String> PRE_RULE_EXCEPTIONS = Map.of(
            1, "8 statements, no revert", 2, "3 statements, no revert", 3, "2 statements, no revert",
            4, "2 statements, no revert", 5, "5 statements, no revert", 6, "1 statement, no revert",
            7, "3 statements, no revert", 8, "4 statements, no revert", 9, "6 statements, no revert",
            10, "3 statements (one UPDATE), no revert");
    private static final String BUENOS_AIRES = "America/Argentina/Buenos_Aires";
    private static final LocalDateTime T0 = LocalDateTime.of(2026, 10, 20, 12, 0);
    private static final Instant NOW = Instant.parse("2027-03-01T13:00:00Z");

    @Autowired private MarkScheduler scheduler;

    // S75 (a) ---------------------------------------------------------------------------------------------------------

    @Test
    void s75EmptyDatabaseMigratesToTheLatestVersionWithEveryVersionRecorded() throws IOException {
        try (SideDatabase db = SideDatabase.create()) {
            assertEquals(versionsOnDisk().size(), db.flyway(null).migrate().migrationsExecuted);
            assertTrue(db.flyway(null).validateWithResult().validationSuccessful);
            assertEquals(versionsOnDisk().stream().map(String::valueOf).toList(), db.jdbc.queryForList(
                    "SELECT version FROM flyway_schema_history WHERE success = 1 ORDER BY installed_rank", String.class));
        }
    }

    // S75 (b) and (c) -------------------------------------------------------------------------------------------------

    @Test
    void s75V23DatabaseWithDataMigratesKeepingEveryRowAndApplyingTheV24ToV29Defaults() {
        try (SideDatabase db = SideDatabase.create()) {
            Map<String, List<String>> before = migrateSeedAndUpgrade(db, "23", MigrationSpecTest::seedV23);
            assertEquals(Set.of("site_location_audits"), newTables(before, db.jdbc));
            assertEquals(Set.of("jornadas.site_geofence_latitude_snapshot", "jornadas.site_geofence_longitude_snapshot",
                    "jornadas.site_geofence_radius_snapshot", "sites.geofence_radius_meters", "sites.latitude", "sites.longitude"),
                    newColumnsOfOldTables(before, db.jdbc));
            // V24 and V27 leave old rows without a center or snapshot (no retroactive geofence); V25 gives every site 100 m.
            assertEquals(List.of("null|null|100", "null|null|100"), rows(db.jdbc,
                    "SELECT latitude, longitude, geofence_radius_meters FROM sites"));
            assertEquals(4, count(db.jdbc, "SELECT COUNT(*) FROM jornadas WHERE site_geofence_latitude_snapshot IS NULL"
                    + " AND site_geofence_longitude_snapshot IS NULL AND site_geofence_radius_snapshot IS NULL"));
            assertEquals(0, count(db.jdbc, "SELECT COUNT(*) FROM site_location_audits"));
            assertEquals(List.of("CANCELADA|null", "EGRESADA|2026-10-20", "EN_CURSO|2026-10-21", "NO_INGRESO|2026-10-21"),
                    rows(db.jdbc, "SELECT state, active_local_date FROM jornadas"));
            assertV28AcceptsOneGeofenceDeviation(db.jdbc);
        }
    }

    @Test
    void s75V27DatabaseWithGeofenceDataMigratesKeepingEveryRowAndLeavesTheOldAuditSourceUnknown() {
        try (SideDatabase db = SideDatabase.create()) {
            Map<String, List<String>> before = migrateSeedAndUpgrade(db, "27", jdbc -> {
                Seed seed = seedV23(jdbc);
                jdbc.update("UPDATE sites SET latitude = -34.6037000, longitude = -58.3816000, geofence_radius_meters = 250 WHERE id = ?",
                        seed.site());
                insert(jdbc, "site_location_audits", "id", id(), "company_id", seed.company(), "site_id", seed.site(),
                        "actor_account_id", seed.admin(), "after_latitude", -34.6037, "after_longitude", -58.3816,
                        "after_radius_meters", 250, "changed_at", ts(5));
                insert(jdbc, "jornadas", "id", id(), "company_id", seed.company(), "employee_id", seed.employee(), "site_id", seed.site(),
                        "template_id", seed.template(), "local_date", LocalDate.of(2026, 10, 23), "time_zone", BUENOS_AIRES,
                        "schedule_snapshot", "{}", "site_geofence_latitude_snapshot", -34.6037, "site_geofence_longitude_snapshot", -58.3816,
                        "site_geofence_radius_snapshot", 250, "tolerance_minutes", 10, "scheduled_start_at", ts(3 * 1440),
                        "scheduled_end_at", ts(3 * 1440 + 480), "created_by", seed.admin(), "created_at", ts(0));
            });
            assertEquals(Set.of(), newTables(before, db.jdbc));
            assertEquals(Set.of("site_location_audits.location_source"), newColumnsOfOldTables(before, db.jdbc));
            assertEquals(List.of("null"), rows(db.jdbc, "SELECT location_source FROM site_location_audits"));
            assertEquals(List.of("-34.6037000|-58.3816000|250"), rows(db.jdbc,
                    "SELECT site_geofence_latitude_snapshot, site_geofence_longitude_snapshot, site_geofence_radius_snapshot"
                            + " FROM jornadas WHERE site_geofence_radius_snapshot IS NOT NULL"));
            assertV28AcceptsOneGeofenceDeviation(db.jdbc);
        }
    }

    /** Migrates to {@code target}, seeds, snapshots every pre-existing column, migrates to the latest and asserts nothing changed. */
    private static Map<String, List<String>> migrateSeedAndUpgrade(SideDatabase db, String target, Consumer<JdbcTemplate> seed) {
        db.flyway(target).migrate();
        seed.accept(db.jdbc);
        Map<String, List<String>> columns = columns(db.jdbc);
        Map<String, List<String>> before = snapshot(db.jdbc, columns);
        int pending = versionsAfter(Integer.parseInt(target));
        assertEquals(pending, db.flyway(null).migrate().migrationsExecuted);
        assertTrue(db.flyway(null).validateWithResult().validationSuccessful);
        assertEquals(before, snapshot(db.jdbc, columns), "every pre-existing row and value survives (counts, ids, contents)");
        return columns;
    }

    /** V28: an old jornada now takes a FUERA_DE_SEDE with its source mark; one without a source mark is still refused. */
    private static void assertV28AcceptsOneGeofenceDeviation(JdbcTemplate jdbc) {
        String sql = "INSERT INTO deviations(id,company_id,jornada_id,source_mark_id,site_id,employee_id,type,created_at,updated_at)"
                + " SELECT ?, j.company_id, j.id, ?, j.site_id, j.employee_id, 'FUERA_DE_SEDE', ?, ? FROM jornadas j WHERE j.state = ?";
        String mark = jdbc.queryForObject("SELECT m.id FROM mark_events m JOIN jornadas j ON j.id = m.jornada_id"
                + " WHERE j.state = 'EGRESADA' ORDER BY m.sequence_number LIMIT 1", String.class);
        assertEquals(1, jdbc.update(sql, id(), mark, ts(600), ts(600), "EGRESADA"));
        assertThrows(DataAccessException.class, () -> jdbc.update(sql, id(), null, ts(600), ts(600), "EN_CURSO"));
    }

    // S75 (d) ---------------------------------------------------------------------------------------------------------

    @Test
    void s75FromV12OnEveryMigrationIsOneDdlStatementWithItsRevertAndTheExceptionsOnlyShrink() throws IOException {
        assertEquals(1, statements("-- a; b\nALTER TABLE t COMMENT 'x;y' /* ; */ , COMMENT \"q;\"; -- tail;\n").size(),
                "the statement splitter ignores semicolons in comments and strings");
        List<Integer> versions = versionsOnDisk();
        int latest = versions.get(versions.size() - 1);
        assertTrue(latest >= 29);
        assertEquals(IntStream.rangeClosed(1, latest).filter(v -> !NEVER_EXISTED.contains(v)).boxed().toList(), versions,
                "no gap except V12 and V17, and no V12/V17 file");
        Map<Integer, String> violations = new TreeMap<>();
        for (int version : versions) {
            String sql = Files.readString(migration(version), StandardCharsets.UTF_8);
            List<String> statements = statements(sql);
            boolean ddl = statements.stream().allMatch(s -> s.matches("(?is)^(CREATE|ALTER|DROP|RENAME)\\s.*"));
            if (statements.size() != 1 || !ddl || !REVERT.matcher(sql).find()) {
                violations.put(version, statements.size() + " statements, ddl=" + ddl + ", revert=" + REVERT.matcher(sql).find());
            }
        }
        assertTrue(PRE_RULE_EXCEPTIONS.keySet().stream().allMatch(v -> v < 12), "the exception list never reaches V12");
        assertEquals(new TreeSet<>(PRE_RULE_EXCEPTIONS.keySet()), violations.keySet(),
                "violations " + violations + ": a new one breaks rule 19; a fixed one must leave the ceiling");
    }

    // V11 revert (CLAUDE.md §7) ---------------------------------------------------------------------------------------

    @Test
    void v11DocumentedRevertFailsWhileAMissingEgressRowExistsAndLeavesFlywayHistoryClaimingV11() throws IOException {
        String revert = Files.readAllLines(migration(11)).stream().filter(line -> line.startsWith("--   ALTER TABLE"))
                .map(line -> line.substring(2).trim().replaceAll(";$", "")).findFirst().orElseThrow();
        try (SideDatabase db = SideDatabase.create()) {
            db.flyway("11").migrate();
            Seed seed = seedCore(db.jdbc);
            String deviation = id();
            insert(db.jdbc, "deviations", "id", deviation, "company_id", seed.company(), "jornada_id", seed.openJornada(),
                    "site_id", seed.site(), "employee_id", seed.employee(), "type", "MARCA_FALTANTE", "created_at", ts(600), "updated_at", ts(600));
            insert(db.jdbc, "deviation_audits", "id", id(), "company_id", seed.company(), "deviation_id", deviation,
                    "change_type", "CREATED", "after_type", "MARCA_FALTANTE", "created_at", ts(600));

            DataAccessException refused = assertThrows(DataAccessException.class, () -> db.jdbc.execute(revert));
            assertTrue(refused.getMessage().contains("chk_deviation_type"), refused.getMessage());
            assertTrue(typeCheck(db.jdbc).contains("MARCA_FALTANTE"), "the failed ALTER left the V11 check in place");

            db.jdbc.update("DELETE FROM deviation_audits WHERE deviation_id = ?", deviation);
            db.jdbc.update("DELETE FROM deviations WHERE id = ?", deviation);
            db.jdbc.execute(revert);
            assertTrue(!typeCheck(db.jdbc).contains("MARCA_FALTANTE"), "after the procedure the pre-V11 check is back");

            // CHAR: the V11 revert, unlike V19-V23, does not say to delete the V11 row from flyway_schema_history, so Flyway still
            // reports V11 applied and a later migrate never re-adds MARCA_FALTANTE — confirm with Mateo.
            assertEquals(List.of("11"), db.jdbc.queryForList(
                    "SELECT version FROM flyway_schema_history WHERE version = '11' AND success = 1", String.class));
            assertEquals(0, db.flyway("11").migrate().migrationsExecuted);
            assertTrue(!typeCheck(db.jdbc).contains("MARCA_FALTANTE"));
        }
    }

    private static String typeCheck(JdbcTemplate jdbc) {
        return jdbc.queryForObject("SELECT check_clause FROM information_schema.check_constraints"
                + " WHERE constraint_schema = DATABASE() AND constraint_name = 'chk_deviation_type'", String.class);
    }

    // S76 -------------------------------------------------------------------------------------------------------------

    /** Old open jornadas from months before "now", one closed, one never started and one of today (BA, 09:00-17:00). */
    @Test
    void s76FirstMissingEgressRunFlagsEveryHistoricOpenJornadaAndNoneOfThemNotifies() {
        clock.set(Instant.parse("2026-10-01T12:00:00Z"));
        Fixture.Company company = fixture.company("Historic");
        UUID site = fixture.site(company, "Centro", BUENOS_AIRES);
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        UUID template = fixture.template(company, site, "Day", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        List<UUID> open = new ArrayList<>();
        open.add(openJornada(company, site, template, ana, "2026-10-15"));
        UUID closed = openJornada(company, site, template, ana, "2026-11-02");
        mark(ana, closed, "EGRESO", "2026-11-02T20:00:00Z");
        open.add(openJornada(company, site, template, ana, "2026-11-16"));
        clock.set(Instant.parse("2026-12-01T11:00:00Z"));
        UUID absent = fixture.declare(company, ana.id(), site, LocalDate.parse("2026-12-01"), template);
        for (String day : List.of("2026-12-15", "2027-01-15", "2027-02-15")) open.add(openJornada(company, site, template, ana, day));
        UUID paused = openJornada(company, site, template, ana, "2027-02-16");
        mark(ana, paused, "SALIDA_ALMUERZO", "2027-02-16T16:00:00Z");
        open.add(paused);
        UUID today = openJornada(company, site, template, ana, "2027-03-01");

        clock.set(NOW);
        scheduler.createDueAbsences();

        // CHAR: the MARCA_FALTANTE query has no date bound, so the first tick flags every historic open jornada, up to
        // 4.5 months old here, all with created_at = now — confirm with Mateo.
        assertEquals(new TreeSet<>(open.stream().map(UUID::toString).toList()), new TreeSet<>(jdbc.queryForList(
                "SELECT jornada_id FROM deviations WHERE type = 'MARCA_FALTANTE' AND active = TRUE AND created_at = ?",
                String.class, Timestamp.from(NOW))));
        assertEquals(0, count(jdbc, "SELECT COUNT(*) FROM deviations WHERE jornada_id IN (?, ?)", closed.toString(), today.toString()));
        // CHAR: the absence query has no date bound either: the never-started jornada of three months ago becomes SIN_INGRESO
        // now, and it is the only one that enqueues a push (MARCA_FALTANTE never notifies, rule 8) — confirm with Mateo.
        assertEquals(List.of("SIN_INGRESO"), jdbc.queryForList("SELECT type FROM deviations WHERE jornada_id = ?", String.class,
                absent.toString()));
        assertEquals(List.of("SIN_INGRESO"), jdbc.queryForList("SELECT deviation_type FROM notification_outbox_events", String.class));

        scheduler.createDueAbsences();
        assertEquals(open.size() + 1, count(jdbc, "SELECT COUNT(*) FROM deviations"), "a second tick adds nothing");
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
        assertEquals(List.of(), httpLog.serverErrors());
    }

    /** 205 historic open jornadas: the backlog drains at 200 per tick (MarkScheduler batch), oldest first. */
    @Test
    void s76HistoricBacklogLargerThanOneBatchDrainsAtTwoHundredPerTick() {
        clock.set(Instant.parse("2026-06-01T12:00:00Z"));
        Fixture.Company company = fixture.company("Backlog");
        UUID site = fixture.site(company, "Centro", BUENOS_AIRES);
        Fixture.Employee beto = fixture.employee(company, "Beto", List.of(site), 10);
        UUID template = fixture.template(company, site, "Day", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        UUID newest = openJornada(company, site, template, beto, "2026-12-31");
        List<Object[]> jornadas = new ArrayList<>();
        List<Object[]> marks = new ArrayList<>();
        for (int daysBack = 1; daysBack <= 204; daysBack++) {
            String clone = id();
            jornadas.add(new Object[]{clone, daysBack, daysBack, daysBack, newest.toString()});
            marks.add(new Object[]{id(), clone, daysBack, daysBack, daysBack, newest.toString()});
        }
        jdbc.batchUpdate("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot,"
                + "tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) SELECT ?,company_id,"
                + "employee_id,site_id,template_id,DATE_SUB(local_date, INTERVAL ? DAY),time_zone,schedule_snapshot,tolerance_minutes,"
                + "DATE_SUB(scheduled_start_at, INTERVAL ? DAY),DATE_SUB(scheduled_end_at, INTERVAL ? DAY),state,next_sequence,created_by,"
                + "created_at FROM jornadas WHERE id = ?", jornadas);
        jdbc.batchUpdate("INSERT INTO mark_events(id,company_id,jornada_id,sequence_number,timeline_order,action,original_action,"
                + "occurred_at,original_occurred_at,accepted_at,recorded_at,origin,created_by,location_status) SELECT ?,company_id,?,"
                + "sequence_number,timeline_order,action,original_action,DATE_SUB(occurred_at, INTERVAL ? DAY),"
                + "DATE_SUB(original_occurred_at, INTERVAL ? DAY),DATE_SUB(accepted_at, INTERVAL ? DAY),recorded_at,origin,created_by,"
                + "'SIN_UBICACION' FROM mark_events WHERE jornada_id = ?", marks);
        assertEquals(205, count(jdbc, "SELECT COUNT(*) FROM jornadas WHERE state = 'EN_CURSO'"));

        clock.set(NOW);
        scheduler.createDueAbsences();
        // CHAR: one tick flags 200 of them (the batch limit), the oldest first; the rest wait 15 s for the next tick — confirm with Mateo.
        assertEquals(200, count(jdbc, "SELECT COUNT(*) FROM deviations WHERE type = 'MARCA_FALTANTE'"));
        assertEquals(0, count(jdbc, "SELECT COUNT(*) FROM deviations WHERE jornada_id = ?", newest.toString()));
        scheduler.createDueAbsences();
        assertEquals(205, count(jdbc, "SELECT COUNT(*) FROM deviations WHERE type = 'MARCA_FALTANTE'"));
        assertEquals(0, count(jdbc, "SELECT COUNT(*) FROM notification_outbox_events"));
    }

    private UUID openJornada(Fixture.Company company, UUID site, UUID template, Fixture.Employee employee, String day) {
        clock.set(Instant.parse(day + "T11:00:00Z"));
        UUID jornada = fixture.declare(company, employee.id(), site, LocalDate.parse(day), template);
        mark(employee, jornada, "INGRESO", day + "T12:00:00Z");
        return jornada;
    }

    private void mark(Fixture.Employee employee, UUID jornada, String action, String at) {
        clock.set(Instant.parse(at));
        employee.client().mark(jornada, action, UUID.randomUUID()).expect(201);
    }

    // Seeds (plain SQL, matching the schema of the target version) -----------------------------------------------------

    private record Seed(String company, String site, String admin, String employee, String template, String openJornada,
                        String closedJornada, String firstMark) { }

    /** Rows valid from V11 on (V1-V10 columns only): one company, site, ADMIN, employee, template and two jornadas. */
    private static Seed seedCore(JdbcTemplate jdbc) {
        String company = id(), site = id(), admin = id(), account = id(), employee = id(), template = id();
        insert(jdbc, "companies", "id", company, "name", "Migración SA", "created_at", ts(0));
        insert(jdbc, "sites", "id", site, "company_id", company, "name", "Centro", "time_zone", BUENOS_AIRES, "created_at", ts(0));
        for (String[] person : new String[][]{{admin, "20111222", "ADMIN"}, {account, "30123456", "EMPLOYEE"}}) {
            insert(jdbc, "accounts", "id", person[0], "dni_normalized", person[1], "dni_display", person[1], "password_hash", "$2a$12$hash",
                    "must_change_password", false, "created_at", ts(0), "updated_at", ts(0));
            insert(jdbc, "company_memberships", "id", id(), "company_id", company, "account_id", person[0], "role", person[2], "created_at", ts(0));
        }
        insert(jdbc, "employees", "id", employee, "company_id", company, "account_id", account, "display_name", "Ana",
                "tolerance_minutes", 10, "created_at", ts(0), "updated_at", ts(0));
        insert(jdbc, "employee_sites", "company_id", company, "employee_id", employee, "site_id", site, "created_at", ts(0));
        insert(jdbc, "schedule_templates", "id", template, "company_id", company, "site_id", site, "name", "Día",
                "breakfast_limit_minutes", 20, "lunch_limit_minutes", 30, "created_at", ts(0), "updated_at", ts(0));
        insert(jdbc, "template_blocks", "id", id(), "company_id", company, "template_id", template, "sequence_number", 1,
                "start_day_offset", 0, "starts_at", "09:00:00", "ends_at", "17:00:00", "end_day_offset", 0);
        String closed = jornada(jdbc, company, employee, site, template, admin, 0, "EGRESADA", 3);
        String open = jornada(jdbc, company, employee, site, template, admin, 1, "EN_CURSO", 2);
        String firstMark = markRow(jdbc, company, closed, account, 1, "INGRESO", 15);
        markRow(jdbc, company, closed, account, 2, "EGRESO", 480);
        markRow(jdbc, company, open, account, 1, "INGRESO", 1440);
        return new Seed(company, site, admin, employee, template, open, closed, firstMark);
    }

    /** A V23 database as production would hold it: every table that matters for the first deploy has rows. */
    private static Seed seedV23(JdbcTemplate jdbc) {
        Seed seed = seedCore(jdbc);
        String c = seed.company();
        jdbc.update("UPDATE company_memberships SET display_name = 'Dueña' WHERE role = 'ADMIN'");
        String mendoza = id();
        insert(jdbc, "sites", "id", mendoza, "company_id", c, "name", "Mendoza", "time_zone", "America/Argentina/Mendoza", "created_at", ts(0));
        insert(jdbc, "employee_sites", "company_id", c, "employee_id", seed.employee(), "site_id", mendoza, "created_at", ts(0));
        String employeeAccount = jdbc.queryForObject("SELECT account_id FROM employees WHERE id = ?", String.class, seed.employee());
        insert(jdbc, "employee_template_assignments", "id", id(), "company_id", c, "employee_id", seed.employee(), "site_id", seed.site(),
                "template_id", seed.template(), "valid_from", LocalDate.of(2026, 10, 1), "created_by", seed.admin(), "created_at", ts(0));
        jornada(jdbc, c, seed.employee(), seed.site(), seed.template(), seed.admin(), 2, "CANCELADA", 1);
        String mendozaTemplate = id();
        insert(jdbc, "schedule_templates", "id", mendozaTemplate, "company_id", c, "site_id", mendoza, "name", "Día",
                "breakfast_limit_minutes", 20, "lunch_limit_minutes", 30, "created_at", ts(0), "updated_at", ts(0));
        jornada(jdbc, c, seed.employee(), mendoza, mendozaTemplate, seed.admin(), 1, "NO_INGRESO", 1);
        String voided = markRow(jdbc, c, seed.openJornada(), employeeAccount, 2, "SALIDA_ALMUERZO", 1500);
        jdbc.update("UPDATE mark_events SET voided_at = ?, voided_by = ?, void_reason = 'Wrong button' WHERE id = ?", ts(1501), seed.admin(), voided);
        jdbc.update("UPDATE jornadas SET next_sequence = 3 WHERE id = ?", seed.openJornada());
        String late = deviation(jdbc, seed, seed.closedJornada(), seed.firstMark(), "LLEGADA_TARDE", true);
        jdbc.update("UPDATE deviations SET motive_category = 'OTRA', motive_text = 'Paro de colectivos', motive_author_account_id = ?,"
                + " motive_created_at = ?, classification = 'JUSTIFICADO' WHERE id = ?", employeeAccount, ts(30), late);
        deviation(jdbc, seed, seed.openJornada(), null, "MARCA_FALTANTE", true);
        String retracted = deviation(jdbc, seed, seed.openJornada(), null, "SIN_INGRESO", false);
        insert(jdbc, "deviation_audits", "id", id(), "company_id", c, "deviation_id", retracted, "change_type", "RETRACTED",
                "before_type", "SIN_INGRESO", "created_at", ts(1441));
        insert(jdbc, "mark_correction_audits", "id", id(), "company_id", c, "mark_id", voided, "before_action", "SALIDA_ALMUERZO",
                "after_action", "SALIDA_ALMUERZO", "before_occurred_at", ts(1500), "after_occurred_at", ts(1500), "actor_account_id",
                seed.admin(), "audit_reason", "Wrong button", "corrected_at", ts(1501), "change_kind", "VOID");
        insert(jdbc, "forgotten_mark_audits", "id", id(), "company_id", c, "jornada_id", seed.closedJornada(), "mark_id", seed.firstMark(),
                "actor_account_id", seed.admin(), "audit_reason", "Forgot to mark", "recorded_at", ts(500));
        insert(jdbc, "mark_idempotency", "account_id", employeeAccount, "idempotency_key", id(), "request_hash", "a".repeat(64),
                "response_body", "{\"action\":\"INGRESO\"}", "mark_id", seed.firstMark(), "created_at", ts(15));
        String window = id();
        insert(jdbc, "notification_windows", "id", window, "company_id", c, "window_started_at", ts(15), "window_ends_at", ts(20),
                "status", "SENT", "next_attempt_at", ts(20), "delivered_at", ts(20), "created_at", ts(15), "updated_at", ts(20));
        insert(jdbc, "notification_outbox_events", "id", id(), "company_id", c, "site_id", seed.site(), "deviation_id", late,
                "deviation_type", "LLEGADA_TARDE", "occurred_at", ts(15), "window_id", window, "created_at", ts(15), "deviation_activation_count", 1);
        insert(jdbc, "push_subscriptions", "id", id(), "company_id", c, "account_id", seed.admin(), "endpoint_hash", "b".repeat(64),
                "secret_ciphertext", new byte[]{1, 2, 3, 4}, "secret_iv", new byte[12], "created_at", ts(0), "updated_at", ts(0));
        insert(jdbc, "password_reset_audits", "id", id(), "company_id", c, "employee_id", seed.employee(), "account_id", employeeAccount,
                "actor_account_id", seed.admin(), "created_at", ts(60));
        insert(jdbc, "login_throttles", "dni_hash", "c".repeat(64), "window_started_at", ts(0), "failed_attempts", 2, "updated_at", ts(1));
        return seed;
    }

    private static String jornada(JdbcTemplate jdbc, String company, String employee, String site, String template, String admin,
                                  int dayOffset, String state, int nextSequence) {
        String id = id();
        List<Object> pairs = new ArrayList<>(List.of("id", id, "company_id", company, "employee_id", employee, "site_id", site,
                "template_id", template, "local_date", T0.toLocalDate().plusDays(dayOffset), "time_zone", BUENOS_AIRES,
                "schedule_snapshot", "{}", "tolerance_minutes", 10, "scheduled_start_at", ts(dayOffset * 1440),
                "scheduled_end_at", ts(dayOffset * 1440 + 480), "state", state, "next_sequence", nextSequence, "created_by", admin,
                "created_at", ts(0)));
        if (state.equals("CANCELADA")) pairs.addAll(List.of("cancelled_at", ts(1), "cancelled_by", admin, "cancel_reason", "Feriado"));
        insert(jdbc, "jornadas", pairs.toArray());
        return id;
    }

    private static String markRow(JdbcTemplate jdbc, String company, String jornada, String account, int sequence, String action, int minute) {
        String id = id();
        insert(jdbc, "mark_events", "id", id, "company_id", company, "jornada_id", jornada, "sequence_number", sequence,
                "timeline_order", sequence * 1000, "action", action, "original_action", action, "occurred_at", ts(minute),
                "original_occurred_at", ts(minute), "accepted_at", ts(minute), "recorded_at", ts(minute), "origin", "EMPLEADO",
                "created_by", account, "location_status", "RECIBIDA", "latitude", -34.6037, "longitude", -58.3816, "accuracy_meters", 12.5,
                "location_received_at", ts(minute), "location_expires_at", ts(minute + 90 * 1440));
        return id;
    }

    private static String deviation(JdbcTemplate jdbc, Seed seed, String jornada, String sourceMark, String type, boolean active) {
        String id = id();
        insert(jdbc, "deviations", "id", id, "company_id", seed.company(), "jornada_id", jornada, "source_mark_id", sourceMark,
                "site_id", seed.site(), "employee_id", seed.employee(), "type", type, "created_at", ts(15), "updated_at", ts(15), "active", active);
        insert(jdbc, "deviation_audits", "id", id(), "company_id", seed.company(), "deviation_id", id, "change_type", "CREATED",
                "after_type", type, "created_at", ts(15));
        return id;
    }

    /** INSERT from alternating column/value pairs; null values are written as NULL. */
    private static void insert(JdbcTemplate jdbc, String table, Object... pairs) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 0; i < pairs.length; i += 2) row.put((String) pairs[i], pairs[i + 1]);
        jdbc.update("INSERT INTO " + table + "(" + String.join(",", row.keySet()) + ") VALUES("
                + row.keySet().stream().map(k -> "?").collect(Collectors.joining(",")) + ")", row.values().toArray());
    }

    // Helpers ---------------------------------------------------------------------------------------------------------

    /** Every column of every application table (flyway_schema_history excluded), by table. */
    private static Map<String, List<String>> columns(JdbcTemplate jdbc) {
        Map<String, List<String>> columns = new TreeMap<>();
        jdbc.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = DATABASE()"
                        + " AND table_name <> 'flyway_schema_history' ORDER BY table_name, ordinal_position",
                rs -> { columns.computeIfAbsent(rs.getString(1), t -> new ArrayList<>()).add(rs.getString(2)); });
        return columns;
    }

    /** Sorted rendering of every row of every table, restricted to the given columns: equal snapshots mean equal data. */
    private static Map<String, List<String>> snapshot(JdbcTemplate jdbc, Map<String, List<String>> columns) {
        Map<String, List<String>> snapshot = new TreeMap<>();
        columns.forEach((table, cols) -> snapshot.put(table, rows(jdbc, "SELECT " + cols.stream().map(c -> "`" + c + "`")
                .collect(Collectors.joining(",")) + " FROM `" + table + "`")));
        return snapshot;
    }

    private static List<String> rows(JdbcTemplate jdbc, String sql) {
        List<String> rows = new ArrayList<>(jdbc.query(sql, (rs, n) -> {
            List<String> values = new ArrayList<>();
            for (int i = 1; i <= rs.getMetaData().getColumnCount(); i++) {
                Object value = rs.getObject(i);
                values.add(value instanceof byte[] bytes ? HexFormat.of().formatHex(bytes) : String.valueOf(value));
            }
            return String.join("|", values);
        }));
        rows.sort(null);
        return rows;
    }

    private static Set<String> newTables(Map<String, List<String>> before, JdbcTemplate jdbc) {
        Set<String> tables = new TreeSet<>(columns(jdbc).keySet());
        tables.removeAll(before.keySet());
        return tables;
    }

    private static Set<String> newColumnsOfOldTables(Map<String, List<String>> before, JdbcTemplate jdbc) {
        Set<String> added = new TreeSet<>();
        columns(jdbc).forEach((table, cols) -> {
            if (!before.containsKey(table)) return;
            assertTrue(cols.containsAll(before.get(table)), "no column of " + table + " was dropped");
            cols.stream().filter(c -> !before.get(table).contains(c)).forEach(c -> added.add(table + "." + c));
        });
        return added;
    }

    /** Statements of a SQL script, ignoring {@code --}, {@code #} and block comments and semicolons inside quotes. */
    static List<String> statements(String sql) {
        List<String> statements = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        char quote = 0;
        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            char next = i + 1 < sql.length() ? sql.charAt(i + 1) : 0;
            if (quote != 0) {
                current.append(c);
                if (c == '\\' && quote != '`' && next != 0) current.append(sql.charAt(++i));
                else if (c == quote) quote = 0;
            } else if ((c == '-' && next == '-') || c == '#') {
                while (i + 1 < sql.length() && sql.charAt(i + 1) != '\n') i++;
            } else if (c == '/' && next == '*') {
                int end = sql.indexOf("*/", i + 2);
                i = end < 0 ? sql.length() : end + 1;
            } else if (c == ';') {
                if (!current.toString().isBlank()) statements.add(current.toString().trim());
                current.setLength(0);
            } else {
                if (c == '\'' || c == '"' || c == '`') quote = c;
                current.append(c);
            }
        }
        if (!current.toString().isBlank()) statements.add(current.toString().trim());
        return statements;
    }

    private static List<Integer> versionsOnDisk() throws IOException {
        try (Stream<Path> files = Files.list(MIGRATIONS)) {
            return files.map(p -> FILE.matcher(p.getFileName().toString())).filter(Matcher::matches)
                    .map(m -> Integer.parseInt(m.group(1))).sorted().toList();
        }
    }

    private static int versionsAfter(int target) {
        try {
            return (int) versionsOnDisk().stream().filter(v -> v > target).count();
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static Path migration(int version) throws IOException {
        try (Stream<Path> files = Files.list(MIGRATIONS)) {
            return files.filter(p -> p.getFileName().toString().startsWith("V" + version + "__")).findFirst().orElseThrow();
        }
    }

    private static int count(JdbcTemplate jdbc, String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private static Timestamp ts(int minutesAfterT0) {
        return Timestamp.valueOf(T0.plusMinutes(minutesAfterT0));
    }

    private static String id() {
        return UUID.randomUUID().toString();
    }

    /** A throw-away database in the shared container, created and dropped as root (Testcontainers sets root's password). */
    private static final class SideDatabase implements AutoCloseable {
        private final String name = "mig_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        private final DriverManagerDataSource dataSource = new DriverManagerDataSource(url(name), "root", SharedMySql.MYSQL.getPassword());
        private final JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        static SideDatabase create() {
            SideDatabase db = new SideDatabase();
            root().execute("CREATE DATABASE `" + db.name + "`");
            return db;
        }

        Flyway flyway(String target) {
            var config = Flyway.configure().dataSource(dataSource).locations("classpath:db/migration");
            if (target != null) config.target(MigrationVersion.fromVersion(target));
            return config.load();
        }

        @Override
        public void close() {
            root().execute("DROP DATABASE IF EXISTS `" + name + "`");
        }

        private static JdbcTemplate root() {
            return new JdbcTemplate(new DriverManagerDataSource(url(""), "root", SharedMySql.MYSQL.getPassword()));
        }

        private static String url(String database) {
            return "jdbc:mysql://" + SharedMySql.MYSQL.getHost() + ":" + SharedMySql.MYSQL.getMappedPort(3306) + "/" + database
                    + "?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true&allowPublicKeyRetrieval=true&useSSL=false";
        }
    }
}
