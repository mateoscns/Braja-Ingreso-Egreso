package com.braja.fichaje.deviations;

/** Deterministic spherical geodesic check for a mark against its jornada's frozen site center. */
public final class GeofencePolicy {
    static final double MEAN_EARTH_RADIUS_METERS = 6_371_008.8;

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
