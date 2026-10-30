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
    void v28AllowsOneGeofenceDeviationPerJornadaAndV29RecordsLocationSource() {
        DataSource dataSource = new DriverManagerDataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword());
        Flyway.configure().dataSource(dataSource).target(MigrationVersion.fromVersion("27")).load().migrate();

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Fixture fixture = seedV27Rows(jdbc);

        assertThrows(org.springframework.dao.DataAccessException.class,
                () -> insertDeviation(jdbc, id(), fixture, fixture.firstMark(), fixture.createdAt()));

        Flyway.configure().dataSource(dataSource).target(MigrationVersion.fromVersion("28")).load().migrate();
        insertDeviation(jdbc, fixture.firstDeviation(), fixture, fixture.firstMark(), fixture.createdAt());
        assertThrows(org.springframework.dao.DataAccessException.class,
                () -> insertDeviation(jdbc, id(), fixture, fixture.secondMark(), fixture.createdAt().plusMinutes(1)));
        assertEquals(1, count(jdbc, "SELECT COUNT(*) FROM deviations WHERE jornada_id=? AND active=TRUE AND type='FUERA_DE_SEDE'",
                fixture.jornadaId()));

        Flyway.configure().dataSource(dataSource).load().migrate();
        assertEquals(1, count(jdbc, "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() " +
                "AND table_name='site_location_audits' AND column_name='location_source'"));
        insertLocationAudit(jdbc, fixture, "CAPTURED");
        insertLocationAudit(jdbc, fixture, "MANUAL");
        assertThrows(org.springframework.dao.DataAccessException.class, () -> insertLocationAudit(jdbc, fixture, "OTHER"));
    }

    private Fixture seedV27Rows(JdbcTemplate jdbc) {
        String companyId = id();
        String siteId = id();
        String accountId = id();
        String employeeId = id();
        String templateId = id();
        String jornadaId = id();
        String firstMark = id();
        String secondMark = id();
        LocalDateTime createdAt = LocalDateTime.of(2026, 10, 30, 9, 0);

        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId, "Migration fixture", Timestamp.valueOf(createdAt));
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)", siteId, companyId, "Centro",
                "America/Argentina/Buenos_Aires", Timestamp.valueOf(createdAt));
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at) " +
                        "VALUES(?,?,?,'test-hash',FALSE,TRUE,?,?)", accountId, "30123456", "30.123.456", Timestamp.valueOf(createdAt), Timestamp.valueOf(createdAt));
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)",
                id(), companyId, accountId, Timestamp.valueOf(createdAt));
        jdbc.update("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at) " +
                        "VALUES(?,?,?,'Migration employee',10,TRUE,?,?)", employeeId, companyId, accountId, Timestamp.valueOf(createdAt), Timestamp.valueOf(createdAt));
        jdbc.update("INSERT INTO schedule_templates(id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at) " +
                        "VALUES(?,?,?,'Migration template',20,30,TRUE,?,?)", templateId, companyId, siteId, Timestamp.valueOf(createdAt), Timestamp.valueOf(createdAt));

        insertJornada(jdbc, jornadaId, companyId, employeeId, siteId, templateId, accountId, createdAt);
        insertMark(jdbc, firstMark, companyId, jornadaId, accountId, 1, createdAt);
        insertMark(jdbc, secondMark, companyId, jornadaId, accountId, 2, createdAt.plusMinutes(1));
        return new Fixture(companyId, siteId, accountId, employeeId, jornadaId, firstMark, secondMark, id(), createdAt);
    }

    private void insertJornada(JdbcTemplate jdbc, String jornadaId, String companyId, String employeeId, String siteId,
                               String templateId, String accountId, LocalDateTime createdAt) {
        jdbc.update("INSERT INTO jornadas(id,company_id,employee_id,site_id,template_id,local_date,time_zone,schedule_snapshot," +
                        "tolerance_minutes,scheduled_start_at,scheduled_end_at,state,next_sequence,created_by,created_at) " +
                        "VALUES(?,?,?,?,?,?,?,JSON_OBJECT(),10,?,?,'NO_INGRESO',1,?,?)",
                jornadaId, companyId, employeeId, siteId, templateId, LocalDate.of(2026, 10, 30),
                ZoneId.of("America/Argentina/Buenos_Aires").getId(), Timestamp.valueOf(createdAt), Timestamp.valueOf(createdAt.plusHours(8)),
                accountId, Timestamp.valueOf(createdAt));
    }

    private void insertMark(JdbcTemplate jdbc, String markId, String companyId, String jornadaId, String accountId,
                            int sequence, LocalDateTime occurredAt) {
        jdbc.update("INSERT INTO mark_events(id,company_id,jornada_id,sequence_number,action,original_action,occurred_at,original_occurred_at," +
                        "accepted_at,recorded_at,origin,created_by,location_status) VALUES(?,?,?,?,'INGRESO','INGRESO',?,?,?,?,'EMPLEADO',?,'RECIBIDA')",
                markId, companyId, jornadaId, sequence, Timestamp.valueOf(occurredAt), Timestamp.valueOf(occurredAt),
                Timestamp.valueOf(occurredAt), Timestamp.valueOf(occurredAt), accountId);
    }

    private void insertDeviation(JdbcTemplate jdbc, String deviationId, Fixture fixture, String markId, LocalDateTime createdAt) {
        jdbc.update("INSERT INTO deviations(id,company_id,jornada_id,source_mark_id,site_id,employee_id,type,created_at,updated_at,active) " +
                        "VALUES(?,?,?,?,?,?,'FUERA_DE_SEDE',?,?,TRUE)", deviationId, fixture.companyId(), fixture.jornadaId(), markId,
                fixture.siteId(), fixture.employeeId(), Timestamp.valueOf(createdAt), Timestamp.valueOf(createdAt));
    }

    private void insertLocationAudit(JdbcTemplate jdbc, Fixture fixture, String source) {
        LocalDateTime changedAt = fixture.createdAt().plusMinutes(5);
        jdbc.update("INSERT INTO site_location_audits(id,company_id,site_id,actor_account_id,before_latitude,before_longitude," +
                        "before_radius_meters,after_latitude,after_longitude,after_radius_meters,changed_at,location_source) " +
                        "VALUES(?,?,?,?,NULL,NULL,NULL,0,0,100,?,?)", id(), fixture.companyId(), fixture.siteId(), fixture.accountId(),
                Timestamp.valueOf(changedAt), source);
    }

    private int count(JdbcTemplate jdbc, String sql, Object... args) {
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    private static String id() { return UUID.randomUUID().toString(); }

    private record Fixture(String companyId, String siteId, String accountId, String employeeId, String jornadaId,
                           String firstMark, String secondMark, String firstDeviation, LocalDateTime createdAt) { }
}
