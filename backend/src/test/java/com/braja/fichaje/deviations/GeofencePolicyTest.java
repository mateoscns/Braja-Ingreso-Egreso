package com.braja.fichaje.deviations;

import org.junit.jupiter.api.Test;

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
}
