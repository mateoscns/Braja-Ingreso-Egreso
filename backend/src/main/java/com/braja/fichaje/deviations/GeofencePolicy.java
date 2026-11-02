package com.braja.fichaje.deviations;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** Deterministic spherical geodesic check for a mark against its jornada's frozen site center. */
public final class GeofencePolicy {
    static final double MEAN_EARTH_RADIUS_METERS = 6_371_008.8;
    /** Scale of mark_events.latitude/longitude and of every center column: DECIMAL(10,7). */
    private static final int COORDINATE_SCALE = 7;
    /** Scale of mark_events.accuracy_meters: DECIMAL(9,2). */
    private static final int ACCURACY_SCALE = 2;

    /** A reported coordinate exactly as it is stored: rounded half away from zero to 7 decimals, as MySQL rounds DECIMAL. */
    public static BigDecimal storedCoordinate(double degrees) {
        return BigDecimal.valueOf(degrees).setScale(COORDINATE_SCALE, RoundingMode.HALF_UP);
    }

    /**
     * A reported accuracy exactly as it is stored: rounded up to the centimeter, never down, so the stored value never makes a
     * mark look more precise than the device reported (issue #77: 100.004 m stored as 100.00 was outside at receipt and inside
     * when re-evaluated after a void).
     */
    public static BigDecimal storedAccuracy(double meters) {
        return BigDecimal.valueOf(meters).setScale(ACCURACY_SCALE, RoundingMode.CEILING);
    }

    /**
     * The check on stored values. The first evaluation (location received) and every re-evaluation (re-anchoring) call this one,
     * with the values as stored, so they cannot judge the same mark differently.
     */
    public boolean isOutside(BigDecimal siteLatitude, BigDecimal siteLongitude, BigDecimal markLatitude, BigDecimal markLongitude,
                             BigDecimal accuracyMeters, int radiusMeters) {
        return isOutside(siteLatitude.doubleValue(), siteLongitude.doubleValue(), markLatitude.doubleValue(), markLongitude.doubleValue(),
                accuracyMeters.doubleValue(), radiusMeters);
    }

    /**
     * A mark is in the site only when the complete reported accuracy circle fits inside the configured radius.
     * Therefore missing/poor accuracy cannot be treated as proof that the mark was inside.
     */
    public boolean isOutside(double siteLatitude, double siteLongitude, double markLatitude, double markLongitude,
                             double accuracyMeters, int radiusMeters) {
        return distanceMeters(siteLatitude, siteLongitude, markLatitude, markLongitude) + accuracyMeters > radiusMeters;
    }

    /** Haversine great-circle distance with a fixed mean Earth radius; returns meters. */
    public double distanceMeters(double latitudeA, double longitudeA, double latitudeB, double longitudeB) {
        double latA = Math.toRadians(latitudeA);
        double latB = Math.toRadians(latitudeB);
        double deltaLatitude = latB - latA;
        double deltaLongitude = Math.toRadians(longitudeB - longitudeA);
        double sinLatitude = Math.sin(deltaLatitude / 2.0);
        double sinLongitude = Math.sin(deltaLongitude / 2.0);
        double haversine = sinLatitude * sinLatitude + Math.cos(latA) * Math.cos(latB) * sinLongitude * sinLongitude;
        return 2.0 * MEAN_EARTH_RADIUS_METERS * Math.asin(Math.min(1.0, Math.sqrt(haversine)));
    }
}
