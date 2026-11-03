package com.braja.fichaje.campaign.simulation;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

/**
 * Independent oracle for S7: the deviations a jornada must have, computed from docs/ESPECIFICACION.md
 * ("Desvíos, pausas y ausencias" and "Definiciones adoptadas para la geocerca") over the jornada's frozen schedule,
 * tolerance, break limits and geofence snapshot and its valid marks. It never calls DeviationPolicy, GeofencePolicy,
 * MarkTransitionPolicy or MarkState. Job-made deviations (SIN_INGRESO, MARCA_FALTANTE) are expected only when
 * {@code jobsSeeTheEmployee}: the absence job skips inactive employees (S19), so while one is inactive they are uncertain.
 * They are also expected only for jornadas of the last {@link #JOB_LOOKBACK_DAYS} local days, today included, in the
 * jornada's zone ("Ventana de los jobs", D-20261102-02): older jornadas are never flagged by the jobs, so a job-made deviation
 * of an older jornada is uncertain (it stays if the jobs flagged it while the jornada was recent, or if an ADMIN change did).
 */
final class DeviationOracle {
    /** The spec's "últimos 7 días locales, contando hoy" (D-20261102-02); written here, not read from DeviationPolicy. */
    static final int JOB_LOOKBACK_DAYS = 7;
    /** The spec's "a más tardar 2 h después de su hecho" for a push (D-20261102-03); the simulation's push model uses it. */
    static final Duration PUSH_FRESHNESS = Duration.ofHours(2);
    /** IUGG mean Earth radius; the spec only says "distancia", the edge band below absorbs any formula difference. */
    static final double EARTH_RADIUS_METERS = 6_371_008.8;
    /** Distances this close to the radius are not asserted either way (the simulation never sends them). */
    static final double EDGE_BAND_METERS = 0.01;

    record Mark(String id, String action, Instant occurredAt, boolean byEmployee, String locationStatus,
                Double latitude, Double longitude, Double accuracyMeters) { }

    record Geofence(double latitude, double longitude, int radiusMeters) { }

    /** {@code localDate} and {@code zone}: the jornada's local date and its site's zone, for the job date bound. */
    record Jornada(LocalDate localDate, ZoneId zone, Instant scheduledStart, Instant scheduledEnd, int toleranceMinutes,
                   int breakfastLimitMinutes, int lunchLimitMinutes, Geofence geofence, boolean cancelled, List<Mark> validMarks) { }

    /**
     * {@code active}: must be active; {@code uncertain}: may or may not be; {@code outsideAnchors}: the marks a
     * FUERA_DE_SEDE may point to (I6).
     */
    record Expectation(String state, Set<String> active, Set<String> uncertain, Set<String> outsideAnchors) { }

    private DeviationOracle() { }

    static Expectation expect(Jornada jornada, Instant now, boolean jobsSeeTheEmployee) {
        if (jornada.cancelled()) return new Expectation("CANCELADA", Set.of(), Set.of(), Set.of());
        List<String> actions = jornada.validMarks().stream().map(Mark::action).toList();
        Set<String> active = new TreeSet<>();
        Set<String> uncertain = new TreeSet<>();
        Duration tolerance = Duration.ofMinutes(jornada.toleranceMinutes());
        Mark ingreso = first(jornada.validMarks(), "INGRESO");
        Mark egreso = first(jornada.validMarks(), "EGRESO");
        LocalDate today = LocalDate.ofInstant(now, jornada.zone());
        boolean recent = !jornada.localDate().isBefore(today.minusDays(JOB_LOOKBACK_DAYS - 1));
        Set<String> jobMade = jobsSeeTheEmployee && recent ? active : uncertain;

        // Arrival: SIN_INGRESO once start + tolerance has passed without INGRESO; LLEGADA_TARDE when it came later.
        if (ingreso == null) {
            if (now.isAfter(jornada.scheduledStart().plus(tolerance))) jobMade.add("SIN_INGRESO");
        } else if (ingreso.occurredAt().isAfter(jornada.scheduledStart().plus(tolerance))) {
            active.add("LLEGADA_TARDE");
        }

        // Exit: outside the inclusive tolerance around the scheduled end; MARCA_FALTANTE when it never came in time.
        if (egreso != null) {
            if (egreso.occurredAt().isBefore(jornada.scheduledEnd().minus(tolerance))) active.add("EGRESO_TEMPRANO");
            else if (egreso.occurredAt().isAfter(jornada.scheduledEnd().plus(tolerance))) active.add("EGRESO_TARDIO");
        } else if (ingreso != null && now.isAfter(jornada.scheduledEnd().plus(tolerance))) {
            jobMade.add("MARCA_FALTANTE");
        }

        // Breaks: a closed break longer than its frozen limit; an open break is not measured yet.
        pauseExcess(jornada.validMarks(), "DESAYUNO", jornada.breakfastLimitMinutes()).ifPresent(active::add);
        pauseExcess(jornada.validMarks(), "ALMUERZO", jornada.lunchLimitMinutes()).ifPresent(active::add);

        // Geofence: only with a snapshot; employee marks only (ADMIN marks are not subject to GPS); one per jornada.
        Set<String> anchors = new LinkedHashSet<>();
        if (jornada.geofence() != null) {
            boolean unsure = false;
            for (Mark mark : jornada.validMarks()) {
                if (!mark.byEmployee()) continue;
                Verdict verdict = verdict(jornada.geofence(), mark);
                if (verdict == Verdict.OUTSIDE) anchors.add(mark.id());
                if (verdict == Verdict.UNKNOWN) unsure = true;
            }
            if (!anchors.isEmpty()) active.add("FUERA_DE_SEDE");
            else if (unsure) uncertain.add("FUERA_DE_SEDE");
        }
        return new Expectation(MarkRules.state(actions), active, uncertain, anchors);
    }

    enum Verdict { INSIDE, OUTSIDE, PENDING, UNKNOWN }

    /** One mark against the frozen geofence: inside only if distance + reported accuracy is within the radius. */
    static Verdict verdict(Geofence fence, Mark mark) {
        return switch (mark.locationStatus()) {
            case "SIN_UBICACION" -> Verdict.OUTSIDE;
            case "PENDIENTE" -> Verdict.PENDING;
            case "RECIBIDA" -> {
                double reach = distanceMeters(fence.latitude(), fence.longitude(), mark.latitude(), mark.longitude()) + mark.accuracyMeters();
                if (Math.abs(reach - fence.radiusMeters()) < EDGE_BAND_METERS) yield Verdict.UNKNOWN;
                yield reach > fence.radiusMeters() ? Verdict.OUTSIDE : Verdict.INSIDE;
            }
            default -> Verdict.UNKNOWN; // PURGADA (the point is gone) or anything unexpected
        };
    }

    /** Great-circle distance through the chord between the two points as unit vectors (not the haversine form). */
    static double distanceMeters(double latitudeA, double longitudeA, double latitudeB, double longitudeB) {
        double[] a = unit(latitudeA, longitudeA), b = unit(latitudeB, longitudeB);
        double dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
        double chord = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return 2.0 * EARTH_RADIUS_METERS * Math.asin(Math.min(1.0, chord / 2.0));
    }

    private static double[] unit(double latitude, double longitude) {
        double phi = Math.toRadians(latitude), lambda = Math.toRadians(longitude);
        return new double[] {Math.cos(phi) * Math.cos(lambda), Math.cos(phi) * Math.sin(lambda), Math.sin(phi)};
    }

    private static java.util.Optional<String> pauseExcess(List<Mark> marks, String pause, int limitMinutes) {
        Mark left = null;
        List<String> found = new ArrayList<>();
        for (Mark mark : marks) {
            if (mark.action().equals("SALIDA_" + pause)) left = mark;
            else if (mark.action().equals("VUELTA_" + pause) && left != null) {
                if (Duration.between(left.occurredAt(), mark.occurredAt()).compareTo(Duration.ofMinutes(limitMinutes)) > 0) found.add("EXCESO_" + pause);
                left = null;
            }
        }
        return found.stream().findFirst();
    }

    private static Mark first(List<Mark> marks, String action) {
        return marks.stream().filter(mark -> mark.action().equals(action)).findFirst().orElse(null);
    }
}
