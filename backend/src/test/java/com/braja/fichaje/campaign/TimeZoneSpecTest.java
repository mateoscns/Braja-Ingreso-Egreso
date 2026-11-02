package com.braja.fichaje.campaign;

import com.braja.fichaje.timekeeping.MarkScheduler;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.time.zone.ZoneOffsetTransition;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S68-S71: site time zones, Chile's daylight saving changes and overnight shifts, through the real HTTP API and job beans.
 * Buenos Aires is UTC-3 without DST; Mendoza has the same offset under another id; Santiago is UTC-3 until the fall-back
 * at 2027-04-04T03:00Z (local 24:00 becomes 23:00 again), then UTC-4 until the spring-forward at 2027-09-05T04:00Z
 * (local 00:00-01:00 does not exist). Every employee has a 10 min tolerance.
 */
class TimeZoneSpecTest extends CampaignTestBase {
    private static final String BUENOS_AIRES = "America/Argentina/Buenos_Aires";
    private static final String MENDOZA = "America/Argentina/Mendoza";
    private static final String SANTIAGO = "America/Santiago";
    private static final Duration TOLERANCE = Duration.ofMinutes(10);
    private static final Duration MICRO = Duration.of(1, ChronoUnit.MICROS);

    @Autowired private MarkScheduler markScheduler;

    private Fixture.Company company;

    private record Setup(UUID site, Fixture.Employee employee) { }

    private record Scheduled(LocalDate localDate, String zone, Instant start, Instant end) { }

    @BeforeEach
    void company() {
        company = fixture.company("Zonas");
    }

    @AfterEach
    void noServerErrorAndInvariantsHold() {
        assertEquals(List.of(), httpLog.serverErrors());
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
    }

    // S68 ------------------------------------------------------------------------------------------------------------

    /** Guards the cases below: if tzdata moves Chile's 2027 changes, this fails instead of the others passing silently. */
    @Test
    void s68SantiagoFallsBackInApril2027AndSpringsForwardInSeptember() {
        var rules = ZoneId.of(SANTIAGO).getRules();
        ZoneOffsetTransition fallBack = rules.nextTransition(Instant.parse("2027-03-01T00:00:00Z"));
        assertEquals(Instant.parse("2027-04-04T03:00:00Z"), fallBack.getInstant());
        assertTrue(fallBack.isOverlap());
        assertEquals(ZoneOffset.ofHours(-3), fallBack.getOffsetBefore());
        assertEquals(ZoneOffset.ofHours(-4), fallBack.getOffsetAfter());
        ZoneOffsetTransition springForward = rules.nextTransition(fallBack.getInstant());
        assertEquals(Instant.parse("2027-09-05T04:00:00Z"), springForward.getInstant());
        assertTrue(springForward.isGap());
        assertNull(ZoneId.of(BUENOS_AIRES).getRules().nextTransition(Instant.parse("2027-01-01T00:00:00Z")));
    }

    // CHAR: a shift is its local wall-clock span, so the 20:00-04:00 shift on the fall-back night lasts 9 real hours (and one on
    // the spring-forward night would last 7); the spec only asks for "una hora final inequívoca" — confirm with Mateo.
    @ParameterizedTest(name = "{0} {1}-{2} (+{3}d) -> {4} .. {5}, {6} real min")
    @CsvSource({
            "2027-04-02, 20:00, 04:00, 1, 2027-04-02T23:00:00Z, 2027-04-03T07:00:00Z, 480",
            "2027-04-03, 20:00, 04:00, 1, 2027-04-03T23:00:00Z, 2027-04-04T08:00:00Z, 540",
            "2027-04-04, 20:00, 04:00, 1, 2027-04-05T00:00:00Z, 2027-04-05T08:00:00Z, 480",
            "2027-04-03, 09:00, 17:00, 0, 2027-04-03T12:00:00Z, 2027-04-03T20:00:00Z, 480",
            "2027-04-04, 09:00, 17:00, 0, 2027-04-04T13:00:00Z, 2027-04-04T21:00:00Z, 480"})
    void s68SantiagoJornadasAroundTheFallBackKeepTheirLocalDateAndFollowTheWallClock(LocalDate date, String start, String end,
                                                                                     int endDayOffset, Instant expectedStart,
                                                                                     Instant expectedEnd, long realMinutes) {
        Setup setup = setup(SANTIAGO);
        UUID jornada = fixture.declare(company, setup.employee().id(), setup.site(), date, template(setup.site(), start, end, endDayOffset));

        assertEquals(new Scheduled(date, SANTIAGO, expectedStart, expectedEnd), scheduled(jornada));
        assertEquals(realMinutes, Duration.between(expectedStart, expectedEnd).toMinutes());
    }

    @Test
    void s68BulkDeclarationAcrossTheFallBackComputesEachDayLikeASingleDeclaration() {
        Setup setup = setup(SANTIAGO);
        UUID template = template(setup.site(), "20:00", "04:00", 1);

        JsonNode result = company.admin().post("/api/v1/jornadas/bulk", Map.of("employeeIds", List.of(setup.employee().id()),
                "siteId", setup.site(), "from", "2027-04-02", "to", "2027-04-04", "weekdays", List.of(1, 2, 3, 4, 5, 6, 7),
                "templateId", template)).expect(200).body();

        assertEquals(3, result.get("created").size());
        assertEquals(0, result.get("skipped").size());
        List<Scheduled> rows = jdbc.query("SELECT local_date,time_zone,scheduled_start_at,scheduled_end_at FROM jornadas"
                + " WHERE employee_id = ? ORDER BY local_date", (rs, row) -> scheduledRow(rs), setup.employee().id().toString());
        assertEquals(List.of(
                new Scheduled(LocalDate.parse("2027-04-02"), SANTIAGO, Instant.parse("2027-04-02T23:00:00Z"), Instant.parse("2027-04-03T07:00:00Z")),
                new Scheduled(LocalDate.parse("2027-04-03"), SANTIAGO, Instant.parse("2027-04-03T23:00:00Z"), Instant.parse("2027-04-04T08:00:00Z")),
                new Scheduled(LocalDate.parse("2027-04-04"), SANTIAGO, Instant.parse("2027-04-05T00:00:00Z"), Instant.parse("2027-04-05T08:00:00Z"))),
                rows);
    }

    // CHAR: on the fall-back night, leaving after 8 real hours (03:00 local, second pass) is EGRESO_TEMPRANO; leaving at the
    // wall-clock 04:00 (9 real hours) is on time — confirm with Mateo.
    @ParameterizedTest(name = "egreso {0} real min after a 20:00 start on the fall-back night -> {1}")
    @CsvSource({"480, EGRESO_TEMPRANO", "540, ''"})
    void s68EgressOnTheFallBackNightIsMeasuredAgainstTheWallClockEnd(long minutesAfterStart, String expected) {
        Setup setup = setup(SANTIAGO);
        UUID jornada = fixture.declare(company, setup.employee().id(), setup.site(), LocalDate.parse("2027-04-03"),
                template(setup.site(), "20:00", "04:00", 1));
        Instant start = Instant.parse("2027-04-03T23:00:00Z");

        clock.set(start);
        setup.employee().client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);
        clock.set(start.plus(Duration.ofMinutes(minutesAfterStart)));
        setup.employee().client().mark(jornada, "EGRESO", UUID.randomUUID()).expect(201);

        assertEquals(expected.isEmpty() ? List.of() : List.of(expected), activeTypes(jornada));
        assertEquals("EGRESADA", state(jornada));
    }

    // S69 ------------------------------------------------------------------------------------------------------------

    /** 22:00-06:00 in Buenos Aires on 2027-03-01 runs 2027-03-02T01:00Z .. 09:00Z: its UTC dates are all the next day. */
    @Test
    void s69AnOvernightShiftIsMarkedAcrossMidnightAndStaysOnItsStartDate() {
        Setup setup = setup(BUENOS_AIRES);
        UUID jornada = overnightBuenosAires(setup);
        assertEquals(new Scheduled(LocalDate.parse("2027-03-01"), BUENOS_AIRES, Instant.parse("2027-03-02T01:00:00Z"),
                Instant.parse("2027-03-02T09:00:00Z")), scheduled(jornada));

        clock.set(Instant.parse("2027-03-02T00:55:00Z")); // 21:55 local, before midnight
        setup.employee().client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);
        clock.set(Instant.parse("2027-03-02T09:00:00Z")); // 06:00 local, the next day
        setup.employee().client().mark(jornada, "EGRESO", UUID.randomUUID()).expect(201);

        assertEquals("EGRESADA", state(jornada));
        assertEquals(List.of(), activeTypes(jornada));
        ApiClient employee = setup.employee().client();
        JsonNode startDay = employee.get("/api/v1/jornadas/mine?localDate=2027-03-01").expect(200).body();
        assertEquals(1, startDay.size());
        assertEquals(jornada.toString(), startDay.get(0).get("id").asText());
        assertEquals(2, startDay.get(0).get("marks").size());
        assertEquals(0, employee.get("/api/v1/jornadas/mine?localDate=2027-03-02").expect(200).body().size());
        // The ADMIN's range is by local date too: the night belongs to 03-01 although every instant of it is on 03-02 UTC.
        assertEquals(Set.of(jornada), ids(company.admin().get("/api/v1/jornadas?from=2027-03-01&to=2027-03-01").expect(200).body()));
        assertEquals(Set.of(), ids(company.admin().get("/api/v1/jornadas?from=2027-03-02&to=2027-03-02").expect(200).body()));
    }

    @Test
    void s69TheAbsenceJobUsesTheOvernightStartAndNotTheLocalDate() {
        Setup setup = setup(BUENOS_AIRES);
        UUID jornada = overnightBuenosAires(setup);

        runJob(Instant.parse("2027-03-01T23:59:00Z")); // 20:59 local on the jornada date: nothing is due yet
        assertEquals(List.of(), activeTypes(jornada));
        assertJobEdge(jornada, Instant.parse("2027-03-02T01:00:00Z").plus(TOLERANCE), "SIN_INGRESO");
    }

    @Test
    void s69MissingEgressWaitsForTheNextDayEndPlusTolerance() {
        Setup setup = setup(BUENOS_AIRES);
        UUID jornada = overnightBuenosAires(setup);
        clock.set(Instant.parse("2027-03-02T01:00:00Z"));
        setup.employee().client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);

        runJob(Instant.parse("2027-03-02T03:00:01Z")); // just past local midnight: the jornada is still in progress
        assertEquals(List.of(), activeTypes(jornada));
        assertJobEdge(jornada, Instant.parse("2027-03-02T09:00:00Z").plus(TOLERANCE), "MARCA_FALTANTE");
    }

    /** 21:15 local is 00:15Z the next UTC day, so the INGRESO window opens at 23:45Z on the previous UTC day (20:45 local). */
    @Test
    void s69TheIngresoWindowOpensThirtyMinutesEarlyAcrossMidnightUtc() {
        Setup setup = setup(BUENOS_AIRES);
        UUID jornada = fixture.declare(company, setup.employee().id(), setup.site(), LocalDate.parse("2027-03-01"),
                template(setup.site(), "21:15", "23:45", 0));
        Instant opens = Instant.parse("2027-03-01T23:45:00Z");
        assertEquals(opens.plus(Duration.ofMinutes(30)), scheduled(jornada).start());

        clock.set(opens.minus(MICRO));
        ApiClient.Response early = setup.employee().client().mark(jornada, "INGRESO", UUID.randomUUID());
        assertEquals(409, early.status());
        assertEquals("MARK_TOO_EARLY", early.code());
        assertEquals("NO_INGRESO", state(jornada));

        clock.set(opens);
        setup.employee().client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);
        assertEquals("EN_CURSO", state(jornada));
        assertEquals(List.of(), activeTypes(jornada));
    }

    // S70 ------------------------------------------------------------------------------------------------------------

    // CHAR: block times that fall in a DST gap or overlap resolve like LocalDateTime.atZone: a time in the gap moves forward by
    // the gap (00:30 -> 01:30 -03), a repeated time takes the earlier offset (23:30 -03, not -04); declaration stores that and the
    // absence job uses it unchanged; there is no warning to the ADMIN — confirm with Mateo.
    @ParameterizedTest(name = "{0} {1}-{2} (+{3}d) -> {4} .. {5}")
    @CsvSource({
            "2027-09-05, 00:30, 08:30, 0, 2027-09-05T04:30:00Z, 2027-09-05T11:30:00Z",
            "2027-09-04, 20:00, 00:30, 1, 2027-09-05T00:00:00Z, 2027-09-05T04:30:00Z",
            "2027-04-03, 23:30, 07:30, 1, 2027-04-04T02:30:00Z, 2027-04-04T11:30:00Z",
            "2027-04-03, 18:00, 23:30, 0, 2027-04-03T21:00:00Z, 2027-04-04T02:30:00Z"})
    void s70BlockTimesInAGapOrOverlapResolveLikeJavaTimeForDeclarationAndTheAbsenceJob(LocalDate date, String start, String end,
                                                                                       int endDayOffset, Instant expectedStart,
                                                                                       Instant expectedEnd) {
        Setup setup = setup(SANTIAGO);
        UUID jornada = fixture.declare(company, setup.employee().id(), setup.site(), date, template(setup.site(), start, end, endDayOffset));

        assertEquals(new Scheduled(date, SANTIAGO, expectedStart, expectedEnd), scheduled(jornada));
        assertJobEdge(jornada, expectedStart.plus(TOLERANCE), "SIN_INGRESO");
    }

    // S71 ------------------------------------------------------------------------------------------------------------

    /**
     * The backend has no "today": GET /jornadas/mine takes a required localDate and returns that date at every site. The PWA
     * picks each site's today from the zone that GET /sites returns (frontend dayData.ts), which this test replays.
     */
    @Test
    void s71AnEmployeeWithSitesInTwoZonesHasADifferentTodayInEachAndOneLocalDateLandsOnDifferentInstants() {
        UUID buenosAires = fixture.site(company, "Obelisco", BUENOS_AIRES);
        UUID santiago = fixture.site(company, "Providencia", SANTIAGO);
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(buenosAires, santiago), 10);
        LocalDate date = LocalDate.parse("2027-04-10");
        UUID buenosAiresDay = fixture.declare(company, ana.id(), buenosAires, date, template(buenosAires, "09:00", "17:00", 0));
        UUID santiagoDay = fixture.declare(company, ana.id(), santiago, date, template(santiago, "09:00", "17:00", 0));
        UUID santiagoPreviousNight = fixture.declare(company, ana.id(), santiago, date.minusDays(1), template(santiago, "23:30", "07:30", 1));

        assertEquals(Instant.parse("2027-04-10T12:00:00Z"), scheduled(buenosAiresDay).start());
        assertEquals(Instant.parse("2027-04-10T13:00:00Z"), scheduled(santiagoDay).start());
        assertEquals(Instant.parse("2027-04-10T03:30:00Z"), scheduled(santiagoPreviousNight).start());

        clock.set(Instant.parse("2027-04-10T03:30:00Z"));
        Map<UUID, String> zones = new HashMap<>();
        for (JsonNode site : ana.client().get("/api/v1/sites").expect(200).body()) {
            zones.put(UUID.fromString(site.get("id").asText()), site.get("timeZone").asText());
        }
        assertEquals(Map.of(buenosAires, BUENOS_AIRES, santiago, SANTIAGO), zones);
        LocalDate buenosAiresToday = LocalDate.ofInstant(clock.instant(), ZoneId.of(zones.get(buenosAires)));
        LocalDate santiagoToday = LocalDate.ofInstant(clock.instant(), ZoneId.of(zones.get(santiago)));
        assertEquals(date, buenosAiresToday);
        assertEquals(date.minusDays(1), santiagoToday);

        assertEquals(Set.of(buenosAiresDay, santiagoDay), ids(ana.client().get("/api/v1/jornadas/mine?localDate=" + buenosAiresToday).expect(200).body()));
        assertEquals(Set.of(santiagoPreviousNight), ids(ana.client().get("/api/v1/jornadas/mine?localDate=" + santiagoToday).expect(200).body()));
        // At 00:30 in Buenos Aires and 23:30 in Santiago only Santiago's today has started.
        ana.client().mark(santiagoPreviousNight, "INGRESO", UUID.randomUUID()).expect(201);
        ApiClient.Response tooEarly = ana.client().mark(buenosAiresDay, "INGRESO", UUID.randomUUID());
        assertEquals(409, tooEarly.status());
        assertEquals("MARK_TOO_EARLY", tooEarly.code());
        assertEquals(List.of(), activeTypes(santiagoPreviousNight));
    }

    @Test
    void s71MendozaSharesTheBuenosAiresOffsetButKeepsItsOwnZoneId() {
        UUID buenosAires = fixture.site(company, "Obelisco", BUENOS_AIRES);
        UUID mendoza = fixture.site(company, "Godoy Cruz", MENDOZA);
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(buenosAires, mendoza), 10);
        LocalDate date = LocalDate.parse("2027-03-01");

        UUID inBuenosAires = fixture.declare(company, ana.id(), buenosAires, date, template(buenosAires, "09:00", "17:00", 0));
        UUID inMendoza = fixture.declare(company, ana.id(), mendoza, date, template(mendoza, "09:00", "17:00", 0));

        Instant start = Instant.parse("2027-03-01T12:00:00Z");
        Instant end = Instant.parse("2027-03-01T20:00:00Z");
        assertEquals(new Scheduled(date, BUENOS_AIRES, start, end), scheduled(inBuenosAires));
        assertEquals(new Scheduled(date, MENDOZA, start, end), scheduled(inMendoza));
        assertEquals(MENDOZA, jdbc.queryForObject("SELECT time_zone FROM sites WHERE id = ?", String.class, mendoza.toString()));
        Set<String> listed = new HashSet<>();
        company.admin().get("/api/v1/sites").expect(200).body().forEach(site -> listed.add(site.get("timeZone").asText()));
        assertEquals(Set.of(BUENOS_AIRES, MENDOZA), listed);
    }

    // D-20261102-05: a site zone must be an IANA region id; a fixed offset like "-03:00" (no DST rules) is rejected.
    @Test
    void s71AFixedOffsetIsRejectedAsASiteZone() {
        ApiClient.Response offset = company.admin().post("/api/v1/sites", Map.of("name", "Offset", "timeZone", "-03:00"));
        assertEquals(422, offset.status());
        assertEquals("VALIDATION_ERROR", offset.code());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM sites WHERE name = 'Offset'", Integer.class));
        ApiClient.Response unknown = company.admin().post("/api/v1/sites", Map.of("name", "Nowhere", "timeZone", "America/Nowhere"));
        assertEquals(422, unknown.status());
        assertEquals("VALIDATION_ERROR", unknown.code());
    }

    // helpers --------------------------------------------------------------------------------------------------------

    private Setup setup(String zone) {
        UUID site = fixture.site(company, "Sede", zone);
        return new Setup(site, fixture.employee(company, "Ana", List.of(site), 10));
    }

    private UUID overnightBuenosAires(Setup setup) {
        return fixture.declare(company, setup.employee().id(), setup.site(), LocalDate.parse("2027-03-01"),
                template(setup.site(), "22:00", "06:00", 1));
    }

    private UUID template(UUID site, String start, String end, int endDayOffset) {
        String name = "T " + start + "-" + end + "+" + endDayOffset;
        return fixture.template(company, site, name, List.of(new Fixture.Block(0, LocalTime.parse(start), LocalTime.parse(end), endDayOffset)), 20, 30);
    }

    /** At the deadline the job creates nothing (strict edge); one microsecond later it creates exactly {@code type}. */
    private void assertJobEdge(UUID jornada, Instant deadline, String type) {
        runJob(deadline);
        assertEquals(List.of(), activeTypes(jornada));
        runJob(deadline.plus(MICRO));
        assertEquals(List.of(type), activeTypes(jornada));
    }

    private void runJob(Instant at) {
        clock.set(at);
        markScheduler.createDueAbsences();
    }

    private Scheduled scheduled(UUID jornada) {
        return jdbc.queryForObject("SELECT local_date,time_zone,scheduled_start_at,scheduled_end_at FROM jornadas WHERE id = ?",
                (rs, row) -> scheduledRow(rs), jornada.toString());
    }

    private static Scheduled scheduledRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Scheduled(rs.getObject("local_date", LocalDate.class), rs.getString("time_zone"),
                rs.getTimestamp("scheduled_start_at").toInstant(), rs.getTimestamp("scheduled_end_at").toInstant());
    }

    private String state(UUID jornada) {
        return jdbc.queryForObject("SELECT state FROM jornadas WHERE id = ?", String.class, jornada.toString());
    }

    private List<String> activeTypes(UUID jornada) {
        return jdbc.queryForList("SELECT type FROM deviations WHERE jornada_id = ? AND active ORDER BY type", String.class, jornada.toString());
    }

    private static Set<UUID> ids(JsonNode jornadas) {
        Set<UUID> ids = new HashSet<>();
        jornadas.forEach(item -> ids.add(UUID.fromString(item.get("id").asText())));
        return ids;
    }
}
