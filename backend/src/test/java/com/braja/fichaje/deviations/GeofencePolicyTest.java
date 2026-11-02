package com.braja.fichaje.deviations;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.*;

class GeofencePolicyTest {
    private final GeofencePolicy policy = new GeofencePolicy();

    @Test
    void accuracyMustFitWithinTheRemainingRadius() {
        assertFalse(policy.isOutside(-26.82, -65.21, -26.82, -65.21, 100, 100));
        assertTrue(policy.isOutside(-26.82, -65.21, -26.82, -65.21, 100.001, 100));
    }

    @Test
    void addsAccuracyToGeodesicDistanceAndTreatsExactBoundaryAsInside() {
        double fiftyMetersNorth = Math.toDegrees(50.0 / GeofencePolicy.MEAN_EARTH_RADIUS_METERS);
        assertEquals(50.0, policy.distanceMeters(0, 0, fiftyMetersNorth, 0), 1e-8);
        assertFalse(policy.isOutside(0, 0, fiftyMetersNorth, 0, 50, 100));
        assertTrue(policy.isOutside(0, 0, fiftyMetersNorth, 0, 50.001, 100));
    }

    @Test
    void computesDistanceAcrossLongitudeAndNearTheDateline() {
        assertTrue(policy.distanceMeters(0, 179.999, 0, -179.999) < 225);
    }

    // Issue #77: the first evaluation and every re-evaluation judge the values exactly as mark_events stores them.
    @Test
    void storedAccuracyIsRoundedUpToTheCentimeterSoItNeverLooksMorePreciseThanReported() {
        assertEquals(new BigDecimal("100.01"), GeofencePolicy.storedAccuracy(100.004));
        assertEquals(new BigDecimal("100.01"), GeofencePolicy.storedAccuracy(100.001));
        assertEquals(new BigDecimal("100.00"), GeofencePolicy.storedAccuracy(100.0));
        assertEquals(new BigDecimal("11.04"), GeofencePolicy.storedAccuracy(11.04));
        assertEquals(new BigDecimal("0.00"), GeofencePolicy.storedAccuracy(0));
        BigDecimal latitude = new BigDecimal("-26.8200000"), longitude = new BigDecimal("-65.2100000");
        assertTrue(policy.isOutside(latitude, longitude, latitude, longitude, GeofencePolicy.storedAccuracy(100.004), 100));
        assertFalse(policy.isOutside(latitude, longitude, latitude, longitude, GeofencePolicy.storedAccuracy(100.0), 100));
    }

    @Test
    void storedCoordinateIsRoundedHalfAwayFromZeroToSevenDecimalsLikeMySql() {
        assertEquals(new BigDecimal("-34.6037000"), GeofencePolicy.storedCoordinate(-34.6037));
        assertEquals(new BigDecimal("-34.6037001"), GeofencePolicy.storedCoordinate(-34.60370005));
        assertEquals(new BigDecimal("58.3816000"), GeofencePolicy.storedCoordinate(58.38159996));
    }
}
