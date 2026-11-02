package com.braja.fichaje.campaign;

import com.braja.fichaje.timekeeping.MarkScheduler;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * S50-S54: templates, assignments, bulk declaration and badly timed ADMIN edits to the organization, over real HTTP with the
 * server clock under test control (CA3, D-20261015-02, D-20261027-11). The base jornada is 09:00-17:00 in Buenos Aires
 * (12:00Z-20:00Z) with a 10 minute tolerance and break limits 20/30; 2027-03-01 is a Monday.
 */
class OrganizationSpecTest extends CampaignTestBase {
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    private static final double CENTER_LAT = -34.603722;
    private static final double CENTER_LON = -58.381592;
    private static final String MORNING = "0 09:00 17:00 0";

    @Autowired private MarkScheduler markScheduler;

    private Fixture.Company company;
    private UUID site;
    private UUID morning;
    private Fixture.Employee ana;

    @BeforeEach
    void organization() {
        company = fixture.company("Organizacion");
        site = fixture.site(company, "Centro", "America/Argentina/Buenos_Aires");
        morning = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
    }

    @AfterEach
    void noServerErrorAndInvariantsHold() {
        assertEquals(List.of(), httpLog.serverErrors());
        assertEquals(List.of(), httpLog.problemsWithoutCode());
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
    }

    // S50 ------------------------------------------------------------------------------------------------------------

    enum Edit { TEMPLATE_BLOCKS, TEMPLATE_LIMITS, TOLERANCE, ASSIGNMENT, SITE_CENTER }

    enum Timing { BEFORE_INGRESO, EN_CURSO }

    /**
     * Each edit would flip the day's outcome if it reached the jornada: INGRESO 30 min late (LLEGADA_TARDE), a 15 min breakfast,
     * EGRESO at 17:00 and both locations at the declared center. Frozen, the only deviation is the original LLEGADA_TARDE.
     * SITE_CENTER before the INGRESO is not here: since D-20261102-01 a site change reaches a jornada not started yet
     * (s50ASiteCenterChangedAfterDeclaringReachesTheJornadaOnlyUntilItStarts).
     */
    @ParameterizedTest(name = "{0} {1}")
    @CsvSource({
            "TEMPLATE_BLOCKS, BEFORE_INGRESO", "TEMPLATE_BLOCKS, EN_CURSO", "TEMPLATE_LIMITS, BEFORE_INGRESO", "TEMPLATE_LIMITS, EN_CURSO",
            "TOLERANCE, BEFORE_INGRESO", "TOLERANCE, EN_CURSO", "ASSIGNMENT, BEFORE_INGRESO", "ASSIGNMENT, EN_CURSO",
            "SITE_CENTER, EN_CURSO"})
    void s50EditsAfterDeclaringNeverReachTheDeclaredJornadaNorItsDeviations(Edit edit, Timing timing) {
        fixture.siteCenter(company, site, CENTER_LAT, CENTER_LON, 100);
        ana = ana();
        fixture.assign(company, ana.id(), morning, LocalDate.parse("2027-02-01"));
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, null);
        String frozen = row(jornada);

        if (timing == Timing.BEFORE_INGRESO) apply(edit);
        clock.set(at(DAY, "12:30"));
        locate(ana.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201).id());
        assertEquals(List.of("LLEGADA_TARDE"), activeTypes(jornada));
        String lateArrival = onlyActiveDeviation(jornada);
        if (timing == Timing.EN_CURSO) {
            assertEquals("EN_CURSO", state(jornada));
            apply(edit);
        }
        clock.set(at(DAY, "15:00"));
        ana.client().mark(jornada, "SALIDA_DESAYUNO", UUID.randomUUID()).expect(201);
        clock.set(at(DAY, "15:15"));
        ana.client().mark(jornada, "VUELTA_DESAYUNO", UUID.randomUUID()).expect(201);
        clock.set(at(DAY, "20:00"));
        locate(ana.client().mark(jornada, "EGRESO", UUID.randomUUID()).expect(201).id());
        clock.set(at(DAY, "20:30"));
        markScheduler.createDueAbsences();

        assertEquals(frozen, row(jornada));
        assertEquals("EGRESADA", state(jornada));
        assertEquals(List.of("LLEGADA_TARDE"), activeTypes(jornada));
        assertEquals(lateArrival, onlyActiveDeviation(jornada));
        assertEquals(1, count("SELECT COUNT(*) FROM deviations WHERE jornada_id=?", jornada));
        // The edit did take effect: the next day declared after it carries the new rules.
        assertNotEquals(rules(jornada), rules(fixture.declare(company, ana.id(), site, DAY.plusDays(1), null)));
    }

    /** The absence job reads the tolerance and start frozen in the jornada, never the employee's or the template's current ones. */
    @ParameterizedTest(name = "tolerance edited to {0}")
    @ValueSource(ints = {0, 60})
    void s50AbsenceJobUsesTheFrozenStartAndTolerance(int newTolerance) {
        ana = ana();
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, morning);
        company.admin().patch("/api/v1/employees/" + ana.id(), Map.of("toleranceMinutes", newTolerance)).expect(200);
        company.admin().patch("/api/v1/templates/" + morning, templateBody(site, "Mañana", "0 08:00 16:00 0", 20, 30)).expect(200);

        absenceJob(at(DAY, "12:10"));
        assertEquals(List.of(), activeTypes(jornada));
        absenceJob(at(DAY, "12:10").plus(1, ChronoUnit.MICROS));
        assertEquals(List.of("SIN_INGRESO"), activeTypes(jornada));
    }

    /**
     * D-20261102-01 (R4, replaces the freeze-at-declaration part of D-20261030-02): a center set or moved after declaring
     * reaches the jornada while it has not started (NO_INGRESO, no mark, dated today or later in the site's zone); once started,
     * the jornada keeps the fence it had, or none.
     */
    @ParameterizedTest(name = "center {0} {1}")
    @CsvSource({"ADDED, BEFORE_INGRESO", "ADDED, EN_CURSO", "MOVED, BEFORE_INGRESO", "MOVED, EN_CURSO"})
    void s50ASiteCenterChangedAfterDeclaringReachesTheJornadaOnlyUntilItStarts(String change, Timing timing) {
        if ("MOVED".equals(change)) fixture.siteCenter(company, site, 0.0, 0.0, 500);
        ana = ana();
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, morning);
        String declared = fence(jornada);
        clock.set(at(DAY, "12:00"));
        if (timing == Timing.EN_CURSO) ana.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);

        fixture.siteCenter(company, site, CENTER_LAT, CENTER_LON, 50);
        UUID located = ana.client().mark(jornada, timing == Timing.EN_CURSO ? "SALIDA_DESAYUNO" : "INGRESO", UUID.randomUUID()).expect(201).id();
        ana.client().post("/api/v1/marks/" + located + "/location", Map.of("latitude", 0.0, "longitude", 0.0, "accuracyMeters", 5.0)).expect(202);

        boolean reached = timing == Timing.BEFORE_INGRESO;
        assertEquals(reached ? List.of("FUERA_DE_SEDE") : List.of(), activeTypes(jornada));
        assertEquals(reached ? BigDecimal.valueOf(CENTER_LAT).stripTrailingZeros().toPlainString() + "/50" : declared, fence(jornada));
    }

    /** The jornada's frozen fence as "latitude/radius", or "null/null" without one. */
    private String fence(UUID jornada) {
        Map<String, Object> row = jdbc.queryForMap("SELECT site_geofence_latitude_snapshot lat,site_geofence_radius_snapshot radius FROM jornadas WHERE id=?",
                jornada.toString());
        Object latitude = row.get("lat"), radius = row.get("radius");
        return (latitude == null ? "null" : ((BigDecimal) latitude).stripTrailingZeros().toPlainString()) + "/"
                + (radius == null ? "null" : String.valueOf(((Number) radius).intValue()));
    }

    @Test
    void toleranceChangedWhileTheEmployeeMarksNeverReachesAJornadaDeclaredBefore() throws Exception {
        ana = ana();
        bulk(List.of(ana.id()), DAY, DAY.plusDays(4), List.of(1, 2, 3, 4, 5), morning).expect(200);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < 5; i++) {
                LocalDate day = DAY.plusDays(i);
                UUID jornada = jornadaOn(ana.id(), day);
                // Tolerance 0 would make a 5 min delay late; tolerance 240 would excuse a 30 min one. Frozen at 10, neither applies.
                int tolerance = i % 2 == 0 ? 0 : 240;
                clock.set(at(day, i % 2 == 0 ? "12:05" : "12:30"));
                CountDownLatch gate = new CountDownLatch(1);
                Future<ApiClient.Response> mark = pool.submit(() -> {
                    gate.await();
                    return ana.client().mark(jornada, "INGRESO", UUID.randomUUID());
                });
                Future<ApiClient.Response> edit = pool.submit(() -> {
                    gate.await();
                    return company.admin().patch("/api/v1/employees/" + ana.id(), Map.of("toleranceMinutes", tolerance));
                });
                gate.countDown();
                mark.get(30, TimeUnit.SECONDS).expect(201);
                edit.get(30, TimeUnit.SECONDS).expect(200);

                assertEquals(10, count("SELECT tolerance_minutes FROM jornadas WHERE id=?", jornada));
                assertEquals(i % 2 == 0 ? List.of() : List.of("LLEGADA_TARDE"), activeTypes(jornada), day.toString());
            }
        } finally {
            pool.shutdownNow();
        }
        // The last round (i = 4) set 0: the edits did land on the employee, only never on the jornadas.
        assertEquals(0, count("SELECT tolerance_minutes FROM employees WHERE id=?", ana.id()));
    }

    @Test
    void reassigningFromTomorrowOrRetroactivelyWhileTodaysJornadaIsOpenOnlyAffectsJornadasDeclaredLater() {
        ana = ana();
        fixture.assign(company, ana.id(), morning, LocalDate.parse("2027-02-01"));
        UUID today = fixture.declare(company, ana.id(), site, DAY, null);
        String frozen = row(today);
        clock.set(at(DAY, "12:00"));
        ana.client().mark(today, "INGRESO", UUID.randomUUID()).expect(201);

        UUID evening = fixture.template(company, site, "Tarde", List.of(Fixture.Block.sameDay("14:00", "22:00")), 20, 30);
        fixture.assign(company, ana.id(), evening, DAY.plusDays(1));
        fixture.assign(company, ana.id(), evening, LocalDate.parse("2027-02-15"));
        clock.set(at(DAY, "20:00"));
        ana.client().mark(today, "EGRESO", UUID.randomUUID()).expect(201);

        assertEquals(frozen, row(today));
        assertEquals("EGRESADA", state(today));
        assertEquals(List.of(), activeTypes(today));
        UUID tomorrow = fixture.declare(company, ana.id(), site, DAY.plusDays(1), null);
        assertEquals(evening.toString(), templateOf(tomorrow));
        List<String> history = new ArrayList<>();
        company.admin().get("/api/v1/employees/" + ana.id() + "/template-assignments").expect(200).body()
                .forEach(item -> history.add(item.get("validFrom").asText() + " " + item.get("templateName").asText()));
        assertEquals(List.of("2027-03-02 Tarde", "2027-02-15 Tarde", "2027-02-01 Mañana"), history);
    }

    @Test
    void removingTheSiteFromAnEmployeeMidJornadaStillLetsThemFinishIt() {
        // CHAR: marks never check employee_sites, so a jornada already declared at a site the employee lost can still be
        // worked to the end; only new declarations there are refused, single or by lot, with 409 EMPLOYEE_NOT_IN_SITE
        // (D-20261102-07).
        UUID other = fixture.site(company, "Norte", "America/Argentina/Buenos_Aires");
        ana = fixture.employee(company, "Ana", List.of(site, other), 10);
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, morning);
        clock.set(at(DAY, "12:00"));
        ana.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);

        company.admin().patch("/api/v1/employees/" + ana.id(), Map.of("siteIds", List.of(other))).expect(200);
        clock.set(at(DAY, "20:00"));
        ana.client().mark(jornada, "EGRESO", UUID.randomUUID()).expect(201);

        assertEquals("EGRESADA", state(jornada));
        assertProblem(declare(ana.id(), DAY.plusDays(1), morning), 409, "EMPLOYEE_NOT_IN_SITE");
        assertProblem(bulk(List.of(ana.id()), DAY.plusDays(1), DAY.plusDays(1), List.of(2), morning), 409, "EMPLOYEE_NOT_IN_SITE");
        assertEquals(1, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=?", ana.id()));
    }

    // S51 ------------------------------------------------------------------------------------------------------------

    @Test
    void s51TheAssignmentInForceIsTheLatestValidFromOnOrBeforeTheDateInSingleAndBulkDeclarations() {
        ana = ana();
        UUID b = fixture.template(company, site, "B", List.of(Fixture.Block.sameDay("10:00", "18:00")), 20, 30);
        UUID c = fixture.template(company, site, "C", List.of(Fixture.Block.sameDay("11:00", "19:00")), 20, 30);
        fixture.assign(company, ana.id(), morning, DAY);
        fixture.assign(company, ana.id(), b, LocalDate.parse("2027-03-10"));
        fixture.assign(company, ana.id(), c, LocalDate.parse("2027-03-05"));

        assertProblem(declare(ana.id(), LocalDate.parse("2027-02-28"), null), 422, "TEMPLATE_REQUIRED");
        declare(ana.id(), LocalDate.parse("2027-03-04"), null).expect(201);
        declare(ana.id(), LocalDate.parse("2027-03-05"), null).expect(201);
        bulk(List.of(ana.id()), LocalDate.parse("2027-03-06"), LocalDate.parse("2027-03-11"), List.of(1, 2, 3, 4, 5, 6, 7), null).expect(200);

        Map<String, String> names = Map.of(morning.toString(), "A", b.toString(), "B", c.toString(), "C");
        Map<String, String> byDate = new TreeMap<>();
        jdbc.query("SELECT local_date, template_id FROM jornadas WHERE employee_id=?",
                rs -> { byDate.put(rs.getString(1), names.get(rs.getString(2))); }, ana.id().toString());
        assertEquals(Map.of("2027-03-04", "A", "2027-03-05", "C", "2027-03-06", "C", "2027-03-07", "C", "2027-03-08", "C",
                "2027-03-09", "C", "2027-03-10", "B", "2027-03-11", "B"), byDate);
    }

    @Test
    void s51ADuplicateStartDateAtTheSameSiteIsAssignmentExistsWhileAnotherSiteOrDateIsAccepted() {
        UUID other = fixture.site(company, "Norte", "America/Argentina/Buenos_Aires");
        UUID otherTemplate = fixture.template(company, other, "Norte", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        UUID evening = fixture.template(company, site, "Tarde", List.of(Fixture.Block.sameDay("14:00", "22:00")), 20, 30);
        ana = fixture.employee(company, "Ana", List.of(site, other), 10);
        fixture.assign(company, ana.id(), morning, DAY);

        assertProblem(assign(ana.id(), evening, DAY), 409, "ASSIGNMENT_EXISTS");
        assertProblem(assign(ana.id(), morning, DAY), 409, "ASSIGNMENT_EXISTS");
        assign(ana.id(), otherTemplate, DAY).expect(201);
        assign(ana.id(), morning, DAY.plusDays(7)).expect(201);

        assertEquals(1, count("SELECT COUNT(*) FROM employee_template_assignments WHERE employee_id=? AND site_id=? AND valid_from=?",
                ana.id(), site, DAY));
        assertEquals(morning.toString(), jdbc.queryForObject("SELECT template_id FROM employee_template_assignments"
                + " WHERE employee_id=? AND site_id=? AND valid_from=?", String.class, ana.id().toString(), site.toString(), DAY));
        assertEquals(3, count("SELECT COUNT(*) FROM employee_template_assignments WHERE employee_id=?", ana.id()));
    }

    @ParameterizedTest(name = "validFrom {0} -> {1}")
    @CsvSource({"1999-12-31, 422", "2000-01-01, 201", "2100-12-31, 201", "2101-01-01, 422"})
    void s51AssignmentStartDatesAreBoundedTo2000Through2100(String validFrom, int status) {
        ana = ana();
        ApiClient.Response response = assign(ana.id(), morning, LocalDate.parse(validFrom));
        if (status == 201) response.expect(201);
        else assertProblem(response, 422, "VALIDATION_ERROR");
        assertEquals(status == 201 ? 1 : 0, count("SELECT COUNT(*) FROM employee_template_assignments WHERE employee_id=?", ana.id()));
    }

    @Test
    void s51ATemplateUsedOnlyByJornadasCannotMoveSiteEvenWhenTheyAreCancelled() {
        UUID other = fixture.site(company, "Norte", "America/Argentina/Buenos_Aires");
        ana = ana();
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, morning);
        String before = templateState(morning);
        Map<String, Object> moved = templateBody(other, "Mañana movida", "0 10:00 18:00 0", 15, 25);

        assertProblem(company.admin().patch("/api/v1/templates/" + morning, moved), 409, "TEMPLATE_IN_USE");
        assertEquals(before, templateState(morning));
        company.admin().post("/api/v1/admin/jornadas/" + jornada + "/cancellation", Map.of("reason", "Declared by mistake")).expect(200);
        // A cancelled jornada keeps its row and its (template, site) FK, so the template still cannot move.
        assertProblem(company.admin().patch("/api/v1/templates/" + morning, moved), 409, "TEMPLATE_IN_USE");
        assertEquals(before, templateState(morning));
    }

    // S52 ------------------------------------------------------------------------------------------------------------

    @ParameterizedTest(name = "{0} days -> {1}")
    @CsvSource({"31, 200", "32, 422"})
    void s52TheRangeIsAtMost31DaysInclusive(int days, int status) {
        ana = ana();
        ApiClient.Response response = bulk(List.of(ana.id()), DAY, DAY.plusDays(days - 1), List.of(1, 2, 3, 4, 5, 6, 7), morning);
        if (status == 200) assertEquals(31, response.expect(200).body().get("created").size());
        else assertProblem(response, 422, "VALIDATION_ERROR");
        assertEquals(status == 200 ? 31 : 0, count("SELECT COUNT(*) FROM jornadas WHERE company_id=?", company.id()));
    }

    /** The 200 employees are inserted in SQL, not through the API: 200 BCrypt hashes would cost minutes and prove nothing here. */
    @ParameterizedTest(name = "{0} employees -> {1}")
    @CsvSource({"200, 200", "201, 422"})
    void s52TheLotIsAtMost200Employees(int employees, int status) {
        List<UUID> ids = status == 200 ? cheapEmployees(employees) : randomIds(employees);
        ApiClient.Response response = bulk(ids, DAY, DAY, List.of(1), morning);
        if (status == 200) {
            assertEquals(200, response.expect(200).body().get("created").size());
            assertEquals(0, response.body().get("skipped").size());
        } else assertProblem(response, 422, "VALIDATION_ERROR");
        assertEquals(status == 200 ? 200 : 0, count("SELECT COUNT(*) FROM jornadas WHERE company_id=?", company.id()));
    }

    @Test
    void s52OnlySelectedWeekdaysAreDeclaredAndEverySkippedDateComesWithItsReason() {
        ana = ana();
        UUID retired = fixture.template(company, site, "Retirada", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        fixture.assign(company, ana.id(), morning, LocalDate.parse("2027-03-03"));
        fixture.assign(company, ana.id(), retired, LocalDate.parse("2027-03-05"));
        jdbc.update("UPDATE schedule_templates SET active=FALSE WHERE id=?", retired.toString()); // no endpoint deactivates one
        fixture.declare(company, ana.id(), site, LocalDate.parse("2027-03-04"), morning);

        JsonNode weekend = bulk(List.of(ana.id()), DAY, LocalDate.parse("2027-03-14"), List.of(6, 7), morning).expect(200).body();
        assertEquals(List.of("2027-03-06", "2027-03-07", "2027-03-13", "2027-03-14"), dates(weekend.get("created")));
        JsonNode lot = bulk(List.of(ana.id()), DAY, LocalDate.parse("2027-03-05"), List.of(1, 2, 3, 4, 5), null).expect(200).body();

        assertEquals(List.of("2027-03-03"), dates(lot.get("created")));
        List<String> skipped = new ArrayList<>();
        lot.get("skipped").forEach(item -> skipped.add(item.get("localDate").asText() + " " + item.get("reason").asText()));
        assertEquals(List.of("2027-03-01 TEMPLATE_REQUIRED", "2027-03-02 TEMPLATE_REQUIRED", "2027-03-04 JORNADA_EXISTS",
                "2027-03-05 TEMPLATE_INVALID"), skipped);
        assertEquals(6, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=?", ana.id()));
    }

    @Test
    void s52OneEmployeeDeactivatedThroughTheApiRejectsTheWholeLotAndCreatesNothing() {
        ana = ana();
        Fixture.Employee bruno = fixture.employee(company, "Bruno", List.of(site), 10);
        company.admin().patch("/api/v1/employees/" + bruno.id(), Map.of("active", false)).expect(200);

        assertProblem(bulk(List.of(ana.id(), bruno.id()), DAY, DAY.plusDays(4), List.of(1, 2, 3, 4, 5), morning), 422, "VALIDATION_ERROR");
        // An employee not assigned to the site also rejects the whole lot, with its own code, before the inactive one (D-20261102-07).
        Fixture.Employee carla = fixture.employee(company, "Carla", List.of(fixture.site(company, "Norte", "America/Argentina/Buenos_Aires")), 10);
        assertProblem(bulk(List.of(ana.id(), bruno.id(), carla.id()), DAY, DAY.plusDays(4), List.of(1, 2, 3, 4, 5), morning), 409, "EMPLOYEE_NOT_IN_SITE");
        assertEquals(0, count("SELECT COUNT(*) FROM jornadas WHERE company_id=?", company.id()));
    }

    // S53 ------------------------------------------------------------------------------------------------------------

    /** Blocks are "startDayOffset start end endDayOffset" separated by ';'. */
    @ParameterizedTest(name = "{0} -> {4}")
    @CsvSource(delimiter = '|', value = {
            "no blocks           | ''                                                                         | 20  | 30  | 422",
            "one block           | 0 09:00 17:00 0                                                            | 20  | 30  | 201",
            "four blocks         | 0 06:00 08:00 0;0 09:00 11:00 0;0 12:00 14:00 0;0 15:00 17:00 0            | 20  | 30  | 201",
            "five blocks         | 0 06:00 07:00 0;0 08:00 09:00 0;0 10:00 11:00 0;0 12:00 13:00 0;0 14:00 15:00 0 | 20 | 30 | 422",
            "first on day 1      | 1 09:00 17:00 1                                                            | 20  | 30  | 422",
            "start offset 2      | 0 09:00 12:00 0;2 09:00 12:00 2                                            | 20  | 30  | 422",
            "end offset 2        | 0 22:00 06:00 2                                                            | 20  | 30  | 422",
            "negative end offset | 0 09:00 12:00 -1                                                           | 20  | 30  | 422",
            "end before start    | 0 17:00 09:00 0                                                            | 20  | 30  | 422",
            "zero length         | 0 09:00 09:00 0                                                            | 20  | 30  | 422",
            "overlapping         | 0 09:00 13:00 0;0 12:00 17:00 0                                            | 20  | 30  | 422",
            "adjacent            | 0 09:00 13:00 0;0 13:00 17:00 0                                            | 20  | 30  | 201",
            "overnight           | 0 22:00 06:00 1                                                            | 20  | 30  | 201",
            "split overnight     | 0 20:00 23:00 0;1 01:00 05:00 1                                            | 20  | 30  | 201",
            "day 0 after day 1   | 0 22:00 02:00 1;0 23:00 23:30 0                                            | 20  | 30  | 422",
            "breakfast -1        | 0 09:00 17:00 0                                                            | -1  | 30  | 422",
            "breakfast 0         | 0 09:00 17:00 0                                                            | 0   | 30  | 201",
            "breakfast 240       | 0 09:00 17:00 0                                                            | 240 | 30  | 201",
            "breakfast 241       | 0 09:00 17:00 0                                                            | 241 | 30  | 422",
            "lunch -1            | 0 09:00 17:00 0                                                            | 20  | -1  | 422",
            "lunch 0             | 0 09:00 17:00 0                                                            | 20  | 0   | 201",
            "lunch 240           | 0 09:00 17:00 0                                                            | 20  | 240 | 201",
            "lunch 241           | 0 09:00 17:00 0                                                            | 20  | 241 | 422"})
    void s53TemplateShapeAndBreakLimitBounds(String label, String blocks, int breakfast, int lunch, int status) {
        int templatesBefore = count("SELECT COUNT(*) FROM template_blocks WHERE company_id=?", company.id());
        String morningBefore = templateState(morning);

        ApiClient.Response created = company.admin().post("/api/v1/templates", templateBody(site, label, blocks, breakfast, lunch));
        ApiClient.Response updated = company.admin().patch("/api/v1/templates/" + morning, templateBody(site, "Mañana", blocks, breakfast, lunch));

        if (status == 201) {
            created.expect(201);
            updated.expect(200);
            assertEquals(blocks, blocksOf(created.id()));
            assertEquals(blocks, blocksOf(morning));
        } else {
            assertProblem(created, 422, "VALIDATION_ERROR");
            assertProblem(updated, 422, "VALIDATION_ERROR");
            assertEquals(templatesBefore, count("SELECT COUNT(*) FROM template_blocks WHERE company_id=?", company.id()));
            assertEquals(morningBefore, templateState(morning));
        }
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
            "0 22:00 06:00 1                 | 2027-03-02T01:00:00Z | 2027-03-02T09:00:00Z",
            "0 20:00 23:00 0;1 01:00 05:00 1 | 2027-03-01T23:00:00Z | 2027-03-02T08:00:00Z"})
    void s53OvernightTemplatesBelongToTheStartDateAndTheAbsenceJobUsesTheirStart(String blocks, String start, String end) {
        ana = ana();
        UUID night = company.admin().post("/api/v1/templates", templateBody(site, "Noche", blocks, 20, 30)).expect(201).id();
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, night);

        assertEquals(DAY.toString(), jdbc.queryForObject("SELECT local_date FROM jornadas WHERE id=?", String.class, jornada.toString()));
        assertEquals(Instant.parse(start), timestamp("scheduled_start_at", jornada));
        assertEquals(Instant.parse(end), timestamp("scheduled_end_at", jornada));
        absenceJob(Instant.parse(start).plus(Duration.ofMinutes(10)));
        assertEquals(List.of(), activeTypes(jornada));
        absenceJob(Instant.parse(start).plus(Duration.ofMinutes(10)).plus(1, ChronoUnit.MICROS));
        assertEquals(List.of("SIN_INGRESO"), activeTypes(jornada));
    }

    @Test
    void employeeToleranceBoundsAreZeroThrough240() {
        ana = ana();
        for (int value : new int[] {-1, 0, 240, 241}) {
            ApiClient.Response response = company.admin().patch("/api/v1/employees/" + ana.id(), Map.of("toleranceMinutes", value));
            if (value == 0 || value == 240) assertEquals(value, response.expect(200).body().get("toleranceMinutes").asInt());
            else assertProblem(response, 422, "VALIDATION_ERROR");
        }
        assertEquals(240, count("SELECT tolerance_minutes FROM employees WHERE id=?", ana.id()));
    }

    // Deactivated template ------------------------------------------------------------------------------------------

    @Test
    void aTemplateDeactivatedWithFutureJornadasKeepsThemWorkableButCannotBeDeclaredOrAssignedAgain() {
        // CHAR: no endpoint deactivates a template (OrganizationService never writes active=FALSE), so this sets it in SQL,
        // and a PATCH silently reactivates it. Single and bulk declarations both answer TEMPLATE_INVALID (D-20261102-06):
        // 422 for the request when the template is named, or used through the assignment by a single declaration; a skipped
        // date when a lot uses it through the assignment. An assignment to it still answers 404.
        ana = ana();
        fixture.assign(company, ana.id(), morning, DAY);
        UUID future = fixture.declare(company, ana.id(), site, LocalDate.parse("2027-03-10"), null);
        UUID absent = fixture.declare(company, ana.id(), site, LocalDate.parse("2027-03-11"), morning);
        String frozen = row(future);
        jdbc.update("UPDATE schedule_templates SET active=FALSE WHERE id=?", morning.toString());

        assertProblem(declare(ana.id(), LocalDate.parse("2027-03-12"), morning), 422, "TEMPLATE_INVALID");
        assertProblem(declare(ana.id(), LocalDate.parse("2027-03-12"), null), 422, "TEMPLATE_INVALID");
        assertProblem(bulk(List.of(ana.id()), LocalDate.parse("2027-03-12"), LocalDate.parse("2027-03-12"), List.of(5), morning),
                422, "TEMPLATE_INVALID");
        assertProblem(assign(ana.id(), morning, LocalDate.parse("2027-04-01")), 404, "NOT_FOUND");
        assertEquals("TEMPLATE_INVALID", bulk(List.of(ana.id()), LocalDate.parse("2027-03-12"), LocalDate.parse("2027-03-12"),
                List.of(5), null).expect(200).body().get("skipped").get(0).get("reason").asText());
        // A template of another site, active or not, still looks unknown at this site.
        UUID elsewhere = fixture.site(company, "Norte", "America/Argentina/Buenos_Aires");
        UUID foreign = fixture.template(company, elsewhere, "Norte", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        jdbc.update("UPDATE schedule_templates SET active=FALSE WHERE id=?", foreign.toString());
        assertProblem(declare(ana.id(), LocalDate.parse("2027-03-12"), foreign), 404, "NOT_FOUND");
        assertProblem(bulk(List.of(ana.id()), LocalDate.parse("2027-03-12"), LocalDate.parse("2027-03-12"), List.of(5), foreign),
                404, "NOT_FOUND");
        assertEquals(2, count("SELECT COUNT(*) FROM jornadas WHERE employee_id=?", ana.id()));
        assertEquals("false", templateListed(morning).get("active").asText());

        clock.set(at(LocalDate.parse("2027-03-10"), "12:00"));
        ana.client().mark(future, "INGRESO", UUID.randomUUID()).expect(201);
        clock.set(at(LocalDate.parse("2027-03-10"), "20:00"));
        ana.client().mark(future, "EGRESO", UUID.randomUUID()).expect(201);
        absenceJob(at(LocalDate.parse("2027-03-11"), "12:10").plus(1, ChronoUnit.MICROS));
        assertEquals(frozen, row(future));
        assertEquals(List.of(), activeTypes(future));
        assertEquals(List.of("SIN_INGRESO"), activeTypes(absent));

        company.admin().patch("/api/v1/templates/" + morning, templateBody(site, "Mañana", MORNING, 20, 30)).expect(200);
        assertEquals("true", templateListed(morning).get("active").asText());
    }

    // Site time zone --------------------------------------------------------------------------------------------------

    /** D-20261102-05: a site zone is a region id of the IANA database; a fixed offset has no daylight saving rules. */
    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"-03:00", "+00:00", "Z", "UTC+3", "UTC-03:00", "GMT-3", "UT+1", "America/Nowhere", "america/argentina/buenos_aires"})
    void aSiteZoneThatIsNotAnIanaRegionIsRejectedAndNothingIsStored(String zone) {
        assertProblem(company.admin().post("/api/v1/sites", Map.of("name", "Zona", "timeZone", zone)), 422, "VALIDATION_ERROR");
        assertEquals(0, count("SELECT COUNT(*) FROM sites WHERE company_id=? AND name='Zona'", company.id()));
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"America/Argentina/Buenos_Aires", "America/Argentina/Mendoza", "America/Santiago", "Europe/Madrid", "UTC", "Etc/GMT+3"})
    void aSiteZoneThatIsAnIanaRegionIsStoredAsGiven(String zone) {
        UUID created = company.admin().post("/api/v1/sites", Map.of("name", "Zona", "timeZone", zone)).expect(201).id();
        assertEquals(zone, jdbc.queryForObject("SELECT time_zone FROM sites WHERE id=?", String.class, created.toString()));
    }

    // S54 ------------------------------------------------------------------------------------------------------------

    /**
     * R1 and R2 (D-20261102-02, D-20261102-03): declaring a date already gone is accepted (only 2000-2100 is checked). The next
     * tick, 2027-03-01 10:00 in Buenos Aires, records SIN_INGRESO only if the date is one of the last 7 local days (from 2027-02-23)
     * and never pushes it, because it was due days before it was detected.
     */
    @ParameterizedTest(name = "{0} -> {1}")
    @CsvSource({"2027-02-22, ''", "2027-02-23, SIN_INGRESO", "2027-02-28, SIN_INGRESO"})
    void s54APastDateIsFlaggedOnlyWithinTheLastSevenLocalDaysAndNeverPushed(LocalDate date, String expected) {
        ana = ana();
        UUID past = fixture.declare(company, ana.id(), site, date, morning);
        assertEquals(List.of(), activeTypes(past));

        absenceJob(at(DAY, "13:00"));

        assertEquals(expected.isEmpty() ? List.of() : List.of(expected), activeTypes(past));
        assertEquals(0, count("SELECT COUNT(*) FROM notification_outbox_events"));
    }

    // R3 -------------------------------------------------------------------------------------------------------------

    /**
     * R3 (D-20261102-03): Ana is deactivated before her 2027-02-10 shift and reactivated on 2027-03-01 at 20:00 in Buenos Aires,
     * with a jornada declared every day in between. The reactivation tick flags only the last 7 local days (02-23 to 03-01) and
     * pushes none of them: the freshest was due almost 11 h before.
     */
    @Test
    void r3AReactivationFlagsOnlyTheLastSevenLocalDaysOfTheInactiveSpanAndPushesNone() {
        clock.set(at(LocalDate.parse("2027-02-10"), "10:00"));
        ana = ana();
        bulk(List.of(ana.id()), LocalDate.parse("2027-02-10"), DAY, List.of(1, 2, 3, 4, 5, 6, 7), morning).expect(200);
        company.admin().patch("/api/v1/employees/" + ana.id(), Map.of("active", false)).expect(200);
        absenceJob(at(DAY, "22:59"));
        assertEquals(0, count("SELECT COUNT(*) FROM deviations"), "an inactive employee is never flagged");

        Instant reactivation = at(DAY, "23:00");
        clock.set(reactivation);
        company.admin().patch("/api/v1/employees/" + ana.id(), Map.of("active", true)).expect(200);
        markScheduler.createDueAbsences();

        assertEquals(List.of("2027-02-23", "2027-02-24", "2027-02-25", "2027-02-26", "2027-02-27", "2027-02-28", "2027-03-01"),
                jdbc.queryForList("SELECT DATE_FORMAT(j.local_date, '%Y-%m-%d') FROM deviations d JOIN jornadas j ON j.id = d.jornada_id"
                        + " WHERE d.type = 'SIN_INGRESO' AND d.active AND d.created_at = ? ORDER BY j.local_date", String.class, Timestamp.from(reactivation)));
        assertEquals(7, count("SELECT COUNT(*) FROM deviations"));
        assertEquals(0, count("SELECT COUNT(*) FROM notification_outbox_events"));
    }

    // helpers --------------------------------------------------------------------------------------------------------

    private Fixture.Employee ana() {
        return fixture.employee(company, "Ana", List.of(site), 10);
    }

    private void apply(Edit edit) {
        switch (edit) {
            case TEMPLATE_BLOCKS -> company.admin().patch("/api/v1/templates/" + morning, templateBody(site, "Mañana", "0 09:30 17:30 0", 20, 30)).expect(200);
            case TEMPLATE_LIMITS -> company.admin().patch("/api/v1/templates/" + morning, templateBody(site, "Mañana", MORNING, 5, 5)).expect(200);
            case TOLERANCE -> company.admin().patch("/api/v1/employees/" + ana.id(), Map.of("toleranceMinutes", 60)).expect(200);
            case ASSIGNMENT -> fixture.assign(company, ana.id(),
                    fixture.template(company, site, "Tarde", List.of(Fixture.Block.sameDay("14:00", "22:00")), 20, 30), DAY);
            case SITE_CENTER -> fixture.siteCenter(company, site, -34.7, -58.5, 50);
        }
    }

    private void locate(UUID mark) {
        ana.client().post("/api/v1/marks/" + mark + "/location",
                Map.of("latitude", CENTER_LAT, "longitude", CENTER_LON, "accuracyMeters", 10.0)).expect(202);
    }

    private void absenceJob(Instant now) {
        clock.set(now);
        markScheduler.createDueAbsences();
    }

    private ApiClient.Response declare(UUID employee, LocalDate date, UUID template) {
        Map<String, Object> body = new LinkedHashMap<>(Map.of("employeeId", employee, "siteId", site, "localDate", date.toString()));
        if (template != null) body.put("templateId", template);
        return company.admin().post("/api/v1/jornadas", body);
    }

    private ApiClient.Response bulk(List<UUID> employees, LocalDate from, LocalDate to, List<Integer> weekdays, UUID template) {
        Map<String, Object> body = new LinkedHashMap<>(Map.of("employeeIds", employees, "siteId", site, "from", from.toString(),
                "to", to.toString(), "weekdays", weekdays));
        if (template != null) body.put("templateId", template);
        return company.admin().post("/api/v1/jornadas/bulk", body);
    }

    private ApiClient.Response assign(UUID employee, UUID template, LocalDate validFrom) {
        return company.admin().post("/api/v1/employees/" + employee + "/template-assignments",
                Map.of("templateId", template, "validFrom", validFrom.toString()));
    }

    private static Map<String, Object> templateBody(UUID siteId, String name, String blocks, int breakfast, int lunch) {
        List<Map<String, Object>> parsed = new ArrayList<>();
        for (String block : blocks.isBlank() ? new String[0] : blocks.split(";")) {
            String[] part = block.trim().split(" ");
            parsed.add(Map.of("startDayOffset", Integer.parseInt(part[0]), "start", part[1], "end", part[2], "endDayOffset", Integer.parseInt(part[3])));
        }
        return Map.of("siteId", siteId, "name", name, "blocks", parsed, "breakfastLimitMinutes", breakfast, "lunchLimitMinutes", lunch);
    }

    /** Employees at the site straight in SQL, never logged in; the API path is covered by every other test. */
    private List<UUID> cheapEmployees(int n) {
        Timestamp now = Timestamp.from(clock.instant());
        List<Object[]> accounts = new ArrayList<>(), memberships = new ArrayList<>(), employees = new ArrayList<>(), sites = new ArrayList<>();
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            String dni = Fixture.nextDni();
            String account = UUID.randomUUID().toString();
            UUID employee = UUID.randomUUID();
            ids.add(employee);
            accounts.add(new Object[] {account, dni, dni, "unused: this account never logs in", now, now});
            memberships.add(new Object[] {UUID.randomUUID().toString(), company.id().toString(), account, now});
            employees.add(new Object[] {employee.toString(), company.id().toString(), account, "Bulk " + i, now, now});
            sites.add(new Object[] {company.id().toString(), employee.toString(), site.toString(), now});
        }
        jdbc.batchUpdate("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at)"
                + " VALUES(?,?,?,?,FALSE,TRUE,?,?)", accounts);
        jdbc.batchUpdate("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at) VALUES(?,?,?,'EMPLOYEE',TRUE,?)", memberships);
        jdbc.batchUpdate("INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at)"
                + " VALUES(?,?,?,?,10,TRUE,?,?)", employees);
        jdbc.batchUpdate("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)", sites);
        return ids;
    }

    private static List<UUID> randomIds(int n) {
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < n; i++) ids.add(UUID.randomUUID());
        return ids;
    }

    private static List<String> dates(JsonNode items) {
        List<String> dates = new ArrayList<>();
        items.forEach(item -> dates.add(item.get("localDate").asText()));
        return dates.stream().sorted().toList();
    }

    /** Everything the jornada froze at declaration. */
    private String row(UUID jornada) {
        return jdbc.queryForObject("SELECT CONCAT_WS('|', local_date, time_zone, scheduled_start_at, scheduled_end_at) FROM jornadas WHERE id=?",
                String.class, jornada.toString()) + "|" + rules(jornada);
    }

    /** The frozen rules without the date: template, snapshot, tolerance, geofence and local clock times of start and end. */
    private String rules(UUID jornada) {
        return jdbc.queryForObject("SELECT CONCAT_WS('|', template_id, schedule_snapshot, tolerance_minutes,"
                + " COALESCE(site_geofence_latitude_snapshot, '-'), COALESCE(site_geofence_longitude_snapshot, '-'),"
                + " COALESCE(site_geofence_radius_snapshot, '-'), TIME(scheduled_start_at), TIME(scheduled_end_at)) FROM jornadas WHERE id=?",
                String.class, jornada.toString());
    }

    private String templateState(UUID template) {
        return jdbc.queryForObject("SELECT CONCAT_WS('|', site_id, name, breakfast_limit_minutes, lunch_limit_minutes, active, updated_at)"
                + " FROM schedule_templates WHERE id=?", String.class, template.toString()) + "|" + blocksOf(template);
    }

    private String blocksOf(UUID template) {
        return String.join(";", jdbc.queryForList("SELECT CONCAT_WS(' ', start_day_offset, TIME_FORMAT(starts_at, '%H:%i'),"
                + " TIME_FORMAT(ends_at, '%H:%i'), end_day_offset) FROM template_blocks WHERE template_id=? ORDER BY sequence_number",
                String.class, template.toString()));
    }

    private JsonNode templateListed(UUID template) {
        for (JsonNode item : company.admin().get("/api/v1/templates").expect(200).body()) {
            if (item.get("id").asText().equals(template.toString())) return item;
        }
        throw new AssertionError("template " + template + " is not listed");
    }

    private UUID jornadaOn(UUID employee, LocalDate date) {
        return UUID.fromString(jdbc.queryForObject("SELECT id FROM jornadas WHERE employee_id=? AND local_date=?", String.class,
                employee.toString(), date));
    }

    private String templateOf(UUID jornada) {
        return jdbc.queryForObject("SELECT template_id FROM jornadas WHERE id=?", String.class, jornada.toString());
    }

    private String state(UUID jornada) {
        return jdbc.queryForObject("SELECT state FROM jornadas WHERE id=?", String.class, jornada.toString());
    }

    private Instant timestamp(String column, UUID jornada) {
        return jdbc.queryForObject("SELECT " + column + " FROM jornadas WHERE id=?", Timestamp.class, jornada.toString()).toInstant();
    }

    private List<String> activeTypes(UUID jornada) {
        return jdbc.queryForList("SELECT type FROM deviations WHERE jornada_id=? AND active ORDER BY type", String.class, jornada.toString());
    }

    private String onlyActiveDeviation(UUID jornada) {
        return jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND active", String.class, jornada.toString());
    }

    private static Instant at(LocalDate day, String utcTime) {
        return Instant.parse(day + "T" + utcTime + ":00Z");
    }

    private static void assertProblem(ApiClient.Response response, int status, String code) {
        assertEquals(status, response.status(), response.raw());
        assertEquals(code, response.code(), response.raw());
    }

    private int count(String sql, Object... args) {
        Object[] values = Arrays.stream(args).map(arg -> arg instanceof UUID uuid ? uuid.toString() : arg).toArray();
        return jdbc.queryForObject(sql, Integer.class, values);
    }
}
