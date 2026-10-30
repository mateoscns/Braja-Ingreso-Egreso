package com.braja.fichaje.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import javax.sql.DataSource;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@Testcontainers
class DailyGeofenceDeviationMigrationMySqlTest {
    @Container
    private static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja_daily_geofence_migration_test")
            .withUsername("test")
            .withPassword("test");

    @Test
    void v29KeepsOneLegacyDeviationPerJornadaAndAuditsRetractedDuplicates() {
        DataSource dataSource = new DriverManagerDataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
        Flyway.configure().dataSource(dataSource).target(MigrationVersion.fromVersion("28")).load().migrate();

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Fixture fixture = seedV28Rows(jdbc);

        Flyway.configure().dataSource(dataSource).load().migrate();

        assertEquals(1, count(jdbc, "SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active=TRUE AND type='FUERA_DE_SEDE'", fixture.firstJornada()));
        assertEquals(1, count(jdbc, "SELECT COUNT(*) FROM deviations WHERE id=? AND active=TRUE", fixture.earliestDeviation()));
        assertEquals(0, count(jdbc, "SELECT COUNT(*) FROM deviations WHERE id=? AND active=TRUE", fixture.duplicateDeviation()));
        assertEquals(1, count(jdbc, "SELECT COUNT(*) FROM deviation_audits WHERE deviation_id=? AND change_type='RETRACTED' AND before_type='FUERA_DE_SEDE'",
                fixture.duplicateDeviation()));
        assertEquals(1, count(jdbc, "SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND id=? AND active=TRUE AND source_mark_id=?",
                fixture.secondJornada(), fixture.isolatedDeviation(), fixture.isolatedMark()));

        assertThrows(org.springframework.dao.DataAccessException.class, () -> jdbc.update(
                "INSERT INTO deviations(id,company_id,jornada_id,source_mark_id,site_id,employee_id,type,created_at,updated_at,active) " +
                        "VALUES(?,?,?,?,?,?,'FUERA_DE_SEDE',?,?,TRUE)", fixture.newDeviation(), fixture.companyId(), fixture.firstJornada(),
                fixture.unusedMark(), fixture.siteId(), fixture.employeeId(), Timestamp.valueOf(fixture.createdAt()), Timestamp.valueOf(fixture.createdAt())));
    }

    private Fixture seedV28Rows(JdbcTemplate jdbc) {
        String companyId = id();
        String siteId = id();
        String accountId = id();
        String employeeId = id();
        String templateId = id();
        String firstJornada = id();
        String secondJornada = id();
        String firstMark = id();
        String secondMark = id();
        String unusedMark = id();
        String isolatedMark = id();
        String earliestDeviation = id();
        String duplicateDeviation = id();
        String isolatedDeviation = id();
        LocalDateTime createdAt = LocalDateTime.of(2026, 10, 30, 9, 0);

        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId, "Migration fixture", Timestamp.valueOf(createdAt));
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", siteId, companyId, "Centro", "America/Argentina/Buenos_Aires", Timestamp.valueOf(createdAt));
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) " +
                        "VALUES(?,?,?,'test-hash',FALSE,TRUE,?,?)", accountId, "30123456", "30.123.456", Timestamp.valueOf(createdAt), Timestamp.valueOf(createdAt));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                id(), companyId, accountId, Timestamp.valueOf(createdAt));
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) " +
                        "VALUES(?,?,?,'Migration employee',10,TRUE,?,?)", employeeId, companyId, accountId, Timestamp.valueOf(createdAt), Timestamp.valueOf(createdAt));
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) " +
                        "VALUES(?,?,?,'Migration template',20,30,TRUE,?,?)", templateId, companyId, siteId, Timestamp.valueOf(createdAt), Timestamp.valueOf(createdAt));

        insertJornada(jdbc, firstJornada, companyId, employeeId, siteId, templateId, accountId, LocalDate.of(2026, 10, 30), createdAt);
        insertJornada(jdbc, secondJornada, companyId, employeeId, siteId, templateId, accountId, LocalDate.of(2026, 10, 31), createdAt);
        insertMark(jdbc, firstMark, companyId, firstJornada, accountId, 1, createdAt);
        insertMark(jdbc, secondMark, companyId, firstJornada, accountId, 2, createdAt.plusMinutes(1));
        insertMark(jdbc, unusedMark, companyId, firstJornada, accountId, 3, createdAt.plusMinutes(2));
        insertMark(jdbc, isolatedMark, companyId, secondJornada, accountId, 1, createdAt);
        insertDeviation(jdbc, earliestDeviation, companyId, firstJornada, firstMark, siteId, employeeId, createdAt);
        insertDeviation(jdbc, duplicateDeviation, companyId, firstJornada, secondMark, siteId, employeeId, createdAt.plusMinutes(1));
        insertDeviation(jdbc, isolatedDeviation, companyId, secondJornada, isolatedMark, siteId, employeeId, createdAt);
        return new Fixture(companyId, siteId, employeeId, firstJornada, secondJornada, unusedMark, isolatedMark,
                earliestDeviation, duplicateDeviation, isolatedDeviation, id(), createdAt);
    }

    private void insertJornada(JdbcTemplate jdbc, String jornadaId, String companyId, String employeeId, String siteId,
                               String templateId, String accountId, LocalDate localDate, LocalDateTime createdAt) {
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot," +
                        "tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) " +
                        "VALUES(?,?,?,?,?,?,?,JSON_OBJECT(),10,?,?,'NO_INGRESO',1,?,?)",
                jornadaId, companyId, employeeId, siteId, templateId, localDate, ZoneId.of("America/Argentina/Buenos_Aires").getId(),
                Timestamp.valueOf(createdAt), Timestamp.valueOf(createdAt.plusHours(8)), accountId, Timestamp.valueOf(createdAt));
    }

    private void insertMark(JdbcTemplate jdbc, String markId, String companyId, String jornadaId, String accountId,
                            int sequence, LocalDateTime occurredAt) {
        jdbc.update("INSERT INTO mark_events(id,company_id,jornada_id,sequence_number,action,original_action,occurred_at,original_occurred_at," +
                        "accepted_at,recorded_at,origin,created_by,location_status) VALUES(?,?,?,?,'INGRESO','INGRESO',?,?,?,?,'EMPLEADO',?,'RECIBIDA')",
                markId, companyId, jornadaId, sequence, Timestamp.valueOf(occurredAt), Timestamp.valueOf(occurredAt),
                Timestamp.valueOf(occurredAt), Timestamp.valueOf(occurredAt), accountId);
    }

    private void insertDeviation(JdbcTemplate jdbc, String deviationId, String companyId, String jornadaId, String markId,
                                 String siteId, String employeeId, LocalDateTime createdAt) {
        jdbc.update("INSERT INTO deviations(id,company_id,jornada_id,source_mark_id,site_id,employee_id,type,created_at,updated_at,active) " +
                        "VALUES(?,?,?,?,?,?,'FUERA_DE_SEDE',?,?,TRUE)", deviationId, companyId, jornadaId, markId, siteId, employeeId,
                Timestamp.valueOf(createdAt), Timestamp.valueOf(createdAt));
    }

    private int count(JdbcTemplate jdbc, String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private static String id() { return UUID.randomUUID().toString(); }

    private record Fixture(String companyId, String siteId, String employeeId, String firstJornada, String secondJornada,
                           String unusedMark, String isolatedMark, String earliestDeviation, String duplicateDeviation, String isolatedDeviation,
                           String newDeviation, LocalDateTime createdAt) { }
}
