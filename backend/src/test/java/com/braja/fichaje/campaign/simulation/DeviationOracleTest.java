package com.braja.fichaje.campaign.simulation;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The oracle and the mark rules against the specification text, edge by edge (no Spring, no database). */
class DeviationOracleTest {
    private static final Instant START = Instant.parse("2027-03-01T12:00:00Z");
    private static final Instant END = Instant.parse("2027-03-01T20:00:00Z");
    private static final Duration TOL = Duration.ofMinutes(10);
    private static final Duration MICRO = Duration.of(1, ChronoUnit.MICROS);
    private static final double LAT = -34.6037, LON = -58.3816;
    private static final DeviationOracle.Geofence FENCE = new DeviationOracle.Geofence(LAT, LON, 100);
    private static final Instant LATE_NOW = END.plus(Duration.ofHours(5));

    private int ids;

    // ---------------------------------------------------------------- arrival

    @Test
    void absenceIsExpectedOneMicrosecondAfterStartPlusToleranceAndNotAtTheEdge() {
        assertEquals(Set.of(), expect(jornada(null), START.plus(TOL)).active());
        assertEquals(Set.of("SIN_INGRESO"), expect(jornada(null), START.plus(TOL).plus(MICRO)).active());
    }

    @Test
    void anAbsenceOfAnEmployeeTheJobsSkipIsUncertainNotExpected() {
        DeviationOracle.Expectation expectation = DeviationOracle.expect(jornada(null), LATE_NOW, false);
        assertEquals(Set.of(), expectation.active());
        assertEquals(Set.of("SIN_INGRESO"), expectation.uncertain());
    }

    @ParameterizedTest(name = "INGRESO at start {0} µs -> {1}")
    @CsvSource({"-1800000000, ''", "0, ''", "600000000, ''", "600000001, LLEGADA_TARDE", "3600000000, LLEGADA_TARDE"})
    void lateArrivalOnlyStrictlyAfterStartPlusTolerance(long offsetMicros, String expected) {
        DeviationOracle.Expectation expectation = expect(jornada(null, mark("INGRESO", START.plus(offsetMicros, ChronoUnit.MICROS))), START.plusSeconds(60));
        assertEquals(types(expected), expectation.active());
    }

    // ---------------------------------------------------------------- exit

    @ParameterizedTest(name = "EGRESO at end {0} µs -> {1}")
    @CsvSource({"-600000001, EGRESO_TEMPRANO", "-600000000, ''", "0, ''", "600000000, ''", "600000001, EGRESO_TARDIO"})
    void egressOnlyDeviatesOutsideTheInclusiveTolerance(long offsetMicros, String expected) {
        assertEquals(types(expected), expect(jornada(null, mark("INGRESO", START), mark("EGRESO", END.plus(offsetMicros, ChronoUnit.MICROS))), LATE_NOW).active());
    }

    @Test
    void missingEgressOneMicrosecondAfterEndPlusToleranceEvenWithAPauseOpen() {
        DeviationOracle.Jornada open = jornada(null, mark("INGRESO", START), mark("SALIDA_ALMUERZO", START.plus(Duration.ofHours(4))));
        assertEquals(Set.of(), expect(open, END.plus(TOL)).active());
        assertEquals(Set.of("MARCA_FALTANTE"), expect(open, END.plus(TOL).plus(MICRO)).active());
        assertEquals("PAUSA_ABIERTA", expect(open, LATE_NOW).state());
        assertEquals(Set.of("MARCA_FALTANTE"), DeviationOracle.expect(open, LATE_NOW, false).uncertain());
    }

    @Test
    void noMissingEgressWithoutIngresoOrOnceEgressExists() {
        assertEquals(Set.of("SIN_INGRESO"), expect(jornada(null), LATE_NOW).active());
        assertEquals(Set.of(), expect(jornada(null, mark("INGRESO", START), mark("EGRESO", END)), LATE_NOW).active());
    }

    // ---------------------------------------------------------------- breaks

    @ParameterizedTest(name = "{0} of {1} min + {2} µs -> {3}")
    @CsvSource({"DESAYUNO, 20, 0, ''", "DESAYUNO, 20, 1, EXCESO_DESAYUNO", "ALMUERZO, 30, 0, ''", "ALMUERZO, 30, 1, EXCESO_ALMUERZO"})
    void aClosedBreakLongerThanItsLimitIsAnExcess(String pause, int limit, long overMicros, String expected) {
        Instant left = START.plus(Duration.ofHours(2));
        DeviationOracle.Jornada jornada = jornada(null, mark("INGRESO", START), mark("SALIDA_" + pause, left),
                mark("VUELTA_" + pause, left.plus(Duration.ofMinutes(limit)).plus(overMicros, ChronoUnit.MICROS)));
        assertEquals(types(expected), expect(jornada, START.plus(Duration.ofHours(4))).active());
    }

    @Test
    void anOpenBreakIsNotAnExcessYet() {
        DeviationOracle.Jornada jornada = jornada(null, mark("INGRESO", START), mark("SALIDA_DESAYUNO", START.plusSeconds(60)));
        assertEquals(Set.of(), expect(jornada, START.plus(Duration.ofHours(3))).active());
    }

    // ---------------------------------------------------------------- geofence

    @Test
    void withoutASnapshotNothingIsComparedEvenWithoutLocation() {
        assertEquals(Set.of(), expect(jornada(null, located("INGRESO", START, "SIN_UBICACION", null, null, null)), START.plusSeconds(60)).active());
    }

    @Test
    void missingOrFarOrImpreciseLocationIsOutsideAndTheAnchorsAreThoseMarks() {
        DeviationOracle.Mark none = located("INGRESO", START, "SIN_UBICACION", null, null, null);
        DeviationOracle.Mark far = located("SALIDA_DESAYUNO", START.plusSeconds(3600), "RECIBIDA", LAT + metersOfLatitude(300), LON, 10.0);
        DeviationOracle.Mark vague = located("VUELTA_DESAYUNO", START.plusSeconds(4000), "RECIBIDA", LAT, LON, 150.0);
        DeviationOracle.Mark near = located("SALIDA_ALMUERZO", START.plusSeconds(9000), "RECIBIDA", LAT + metersOfLatitude(20), LON, 15.0);
        DeviationOracle.Expectation expectation = expect(jornada(FENCE, none, far, vague, near), START.plusSeconds(9100));
        assertEquals(Set.of("FUERA_DE_SEDE"), expectation.active());
        assertEquals(Set.of(none.id(), far.id(), vague.id()), expectation.outsideAnchors());
    }

    @Test
    void insideOnlyWhenDistancePlusAccuracyFitsTheRadius() {
        DeviationOracle.Mark fits = located("INGRESO", START, "RECIBIDA", LAT + metersOfLatitude(60), LON, 39.9);
        DeviationOracle.Mark spills = located("INGRESO", START, "RECIBIDA", LAT + metersOfLatitude(60), LON, 40.1);
        assertEquals(DeviationOracle.Verdict.INSIDE, DeviationOracle.verdict(FENCE, fits));
        assertEquals(DeviationOracle.Verdict.OUTSIDE, DeviationOracle.verdict(FENCE, spills));
        assertEquals(DeviationOracle.Verdict.UNKNOWN, DeviationOracle.verdict(FENCE,
                located("INGRESO", START, "RECIBIDA", LAT + metersOfLatitude(60), LON, 100 - DeviationOracle.distanceMeters(LAT, LON, LAT + metersOfLatitude(60), LON))));
    }

    @Test
    void pendingLocationsAdminMarksAndPurgedPointsAreNotOutside() {
        DeviationOracle.Mark pending = located("INGRESO", START, "PENDIENTE", null, null, null);
        DeviationOracle.Mark admin = new DeviationOracle.Mark("admin", "SALIDA_DESAYUNO", START.plusSeconds(60), false, "NO_APLICA", null, null, null);
        DeviationOracle.Expectation expectation = expect(jornada(FENCE, pending, admin), START.plusSeconds(120));
        assertEquals(Set.of(), expectation.active());
        assertEquals(Set.of(), expectation.uncertain());
        DeviationOracle.Expectation purged = expect(jornada(FENCE, located("INGRESO", START, "PURGADA", null, null, null)), START.plusSeconds(120));
        assertEquals(Set.of("FUERA_DE_SEDE"), purged.uncertain());
    }

    @Test
    void distanceMatchesKnownLengths() {
        assertEquals(111_195.08, DeviationOracle.distanceMeters(0, 0, 1, 0), 0.05);
        assertEquals(0.0, DeviationOracle.distanceMeters(LAT, LON, LAT, LON), 1e-9);
        assertEquals(300.0, DeviationOracle.distanceMeters(LAT, LON, LAT + metersOfLatitude(300), LON), 1e-6);
    }

    // ---------------------------------------------------------------- state and cancellation

    @Test
    void stateFollowsTheValidMarksAndACancelledJornadaHasNothing() {
        assertEquals("NO_INGRESO", expect(jornada(null), START).state());
        assertEquals("EN_CURSO", expect(jornada(null, mark("INGRESO", START)), START).state());
        assertEquals("PAUSA_ABIERTA", expect(jornada(null, mark("INGRESO", START), mark("SALIDA_ALMUERZO", START)), START).state());
        assertEquals("EGRESADA", expect(jornada(null, mark("INGRESO", START), mark("EGRESO", END)), END).state());
        DeviationOracle.Jornada cancelled = new DeviationOracle.Jornada(START, END, 10, 20, 30, FENCE, true, List.of());
        assertEquals(new DeviationOracle.Expectation("CANCELADA", Set.of(), Set.of(), Set.of()), DeviationOracle.expect(cancelled, LATE_NOW, true));
    }

    // ---------------------------------------------------------------- mark rules

    @Test
    void transitionsFollowTheSpecification() {
        assertTrue(MarkRules.allowed(List.of(), "INGRESO"));
        for (String other : List.of("EGRESO", "SALIDA_DESAYUNO", "VUELTA_DESAYUNO", "SALIDA_ALMUERZO", "VUELTA_ALMUERZO")) {
            assertFalse(MarkRules.allowed(List.of(), other), other);
        }
        assertFalse(MarkRules.allowed(List.of("INGRESO"), "INGRESO"));
        assertFalse(MarkRules.allowed(List.of("INGRESO"), "VUELTA_ALMUERZO"));
        assertTrue(MarkRules.allowed(List.of("INGRESO", "SALIDA_ALMUERZO", "VUELTA_ALMUERZO"), "SALIDA_DESAYUNO"), "either order");
        assertFalse(MarkRules.allowed(List.of("INGRESO", "SALIDA_DESAYUNO", "VUELTA_DESAYUNO"), "SALIDA_DESAYUNO"), "one cycle each");
        assertFalse(MarkRules.allowed(List.of("INGRESO", "SALIDA_DESAYUNO"), "EGRESO"), "no egress with a pause open");
        assertFalse(MarkRules.allowed(List.of("INGRESO", "SALIDA_DESAYUNO"), "SALIDA_ALMUERZO"), "one pause at a time");
        assertFalse(MarkRules.allowed(List.of("INGRESO", "SALIDA_DESAYUNO"), "VUELTA_ALMUERZO"));
        assertTrue(MarkRules.allowed(List.of("INGRESO", "SALIDA_DESAYUNO"), "VUELTA_DESAYUNO"));
        assertTrue(MarkRules.allowed(List.of("INGRESO"), "EGRESO"));
        for (String any : MarkRules.ACTIONS) assertFalse(MarkRules.allowed(List.of("INGRESO", "EGRESO"), any), "after EGRESO " + any);
        assertFalse(MarkRules.allowed(List.of("INGRESO"), "PAUSA"), "unknown action");
        assertTrue(MarkRules.validHistory(List.of("INGRESO", "SALIDA_DESAYUNO", "VUELTA_DESAYUNO", "EGRESO")));
        assertFalse(MarkRules.validHistory(List.of("INGRESO", "VUELTA_DESAYUNO", "EGRESO")));
        assertEquals(START.minus(Duration.ofMinutes(30)), MarkRules.earliest("INGRESO", START));
        assertEquals(START, MarkRules.earliest("EGRESO", START));
    }

    // ---------------------------------------------------------------- seeds

    @Test
    void keyedRandomsDependOnTheKeyNotOnTheOrderOfUse() {
        long a = Seeds.random(1, "persona", 3, "day", 7).nextLong();
        Seeds.random(1, "something else").nextLong();
        assertEquals(a, Seeds.random(1, "persona", 3, "day", 7).nextLong());
        assertFalse(a == Seeds.random(2, "persona", 3, "day", 7).nextLong());
    }

    // ---------------------------------------------------------------- helpers

    private static DeviationOracle.Expectation expect(DeviationOracle.Jornada jornada, Instant now) {
        return DeviationOracle.expect(jornada, now, true);
    }

    private static DeviationOracle.Jornada jornada(DeviationOracle.Geofence fence, DeviationOracle.Mark... marks) {
        return new DeviationOracle.Jornada(START, END, 10, 20, 30, fence, false, new ArrayList<>(Arrays.asList(marks)));
    }

    private DeviationOracle.Mark mark(String action, Instant at) {
        return new DeviationOracle.Mark("m" + ids++, action, at, true, "RECIBIDA", LAT, LON, 5.0);
    }

    private DeviationOracle.Mark located(String action, Instant at, String status, Double lat, Double lon, Double accuracy) {
        return new DeviationOracle.Mark("m" + ids++, action, at, true, status, lat, lon, accuracy);
    }

    private static double metersOfLatitude(double meters) {
        return Math.toDegrees(meters / DeviationOracle.EARTH_RADIUS_METERS);
    }

    private static Set<String> types(String csv) {
        return csv.isEmpty() ? Set.of() : Set.of(csv.split(";"));
    }
}
