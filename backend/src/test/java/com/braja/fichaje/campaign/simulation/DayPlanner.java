package com.braja.fichaje.campaign.simulation;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.SplittableRandom;

/**
 * Plans one person's taps for one jornada from its frozen schedule and the persona, with a generator keyed by seed,
 * person, site and date. The plan is what the person intends; what the server answers is checked when it runs.
 */
final class DayPlanner {
    enum Style {
        NORMAL,
        /** INGRESO inside the weekly 20-thread burst. */
        BURST,
        /** A tap at the burst instant before the INGRESO window opens (MARK_TOO_EARLY). */
        EARLY_PROBE,
        /** EGRESO tapped by mistake; the ADMIN voids it. */
        MISTAKE_EGRESS,
        /** EGRESO tried with the lunch still open (INVALID_MARK_TRANSITION). */
        PAUSED_EGRESS
    }

    enum LocationKind { NONE, INSIDE, FAR, IMPRECISE, LATE, AT_THIRTY_SECONDS }

    record Location(LocationKind kind, int delaySeconds, double northMeters, double eastMeters, int accuracyMeters) { }

    record Tap(Instant at, String action, Style style, Location location) { }

    private DayPlanner() { }

    static List<Tap> plan(long seed, SimWorld.Jornada jornada, Instant burstAt) {
        SimWorld.Employee employee = jornada.employee;
        Persona persona = employee.persona;
        SplittableRandom random = Seeds.random(seed, "plan", employee.index, jornada.site.code, jornada.date);
        List<Tap> taps = new ArrayList<>();
        if (random.nextDouble() < persona.absentRate) return taps;

        Instant start = jornada.start, end = jornada.end;
        Duration length = Duration.between(start, end);
        boolean late = random.nextDouble() < persona.lateRate;
        Instant ingreso = start.plus(Duration.ofMinutes(late ? Seeds.between(random, persona.lateMinMinutes, persona.lateMaxMinutes)
                : Seeds.between(random, -20, 4)));
        Style ingresoStyle = Style.NORMAL;
        if (burstAt != null && !burstAt.isBefore(MarkRules.earliest("INGRESO", start)) && burstAt.isBefore(end.minus(Duration.ofHours(2)))) {
            ingreso = burstAt;
            ingresoStyle = Style.BURST;
        } else if (burstAt != null && burstAt.isBefore(MarkRules.earliest("INGRESO", start))) {
            taps.add(new Tap(burstAt, "INGRESO", Style.EARLY_PROBE, location(random, persona)));
        }
        taps.add(new Tap(ingresoStyle == Style.BURST ? ingreso : jitter(random, ingreso), "INGRESO", ingresoStyle, location(random, persona)));
        Instant cursor = ingreso.plus(Duration.ofMinutes(20));

        if (persona == Persona.EARLY_EGRESS && random.nextDouble() < 0.25) {
            Instant mistake = ingreso.plus(Duration.ofMinutes(Seeds.between(random, 60, 120)));
            taps.add(new Tap(jitter(random, mistake), "EGRESO", Style.MISTAKE_EGRESS, location(random, persona)));
            cursor = mistake.plus(Duration.ofMinutes(45));
        }

        SimWorld.Version version = jornada.version;
        boolean abuser = persona == Persona.BREAK_ABUSER;
        if (length.compareTo(Duration.ofHours(6)) >= 0 && random.nextDouble() < 0.7) {
            Instant out = later(cursor, start.plus(Duration.ofMinutes(90 + Seeds.between(random, -20, 20))));
            int minutes = abuser && random.nextDouble() < 0.7 ? version.breakfastLimit() + Seeds.between(random, 1, 20)
                    : Seeds.between(random, 5, Math.max(5, version.breakfastLimit() - 1));
            taps.add(new Tap(jitter(random, out), "SALIDA_DESAYUNO", Style.NORMAL, location(random, persona)));
            taps.add(new Tap(jitter(random, out.plus(Duration.ofMinutes(minutes))), "VUELTA_DESAYUNO", Style.NORMAL, location(random, persona)));
            cursor = out.plus(Duration.ofMinutes(minutes + 15));
        }
        if (length.compareTo(Duration.ofHours(7)) >= 0 && random.nextDouble() < 0.8) {
            Instant out = later(cursor, start.plus(Duration.ofMinutes(240 + Seeds.between(random, -30, 30))));
            int minutes = abuser && random.nextDouble() < 0.7 ? version.lunchLimit() + Seeds.between(random, 5, 40)
                    : Seeds.between(random, 15, Math.max(15, version.lunchLimit() - 1));
            taps.add(new Tap(jitter(random, out), "SALIDA_ALMUERZO", Style.NORMAL, location(random, persona)));
            if (abuser && random.nextDouble() < 0.3) {
                taps.add(new Tap(jitter(random, out.plus(Duration.ofMinutes(5))), "EGRESO", Style.PAUSED_EGRESS, location(random, persona)));
            }
            taps.add(new Tap(jitter(random, out.plus(Duration.ofMinutes(minutes))), "VUELTA_ALMUERZO", Style.NORMAL, location(random, persona)));
            cursor = out.plus(Duration.ofMinutes(minutes + 15));
        }

        if (random.nextDouble() >= persona.forgetEgressRate) {
            Instant egreso = random.nextDouble() < 0.04 ? end.minus(Duration.ofMinutes(Seeds.between(random, 15, 60)))
                    : end.plus(Duration.ofMinutes(Seeds.between(random, -5, 8)));
            taps.add(new Tap(jitter(random, later(cursor, egreso)), "EGRESO", Style.NORMAL, location(random, persona)));
        }
        return taps;
    }

    private static Location location(SplittableRandom random, Persona persona) {
        double bearing = random.nextDouble() * 2 * Math.PI;
        double meters = random.nextDouble() * 30;
        int accuracy = Seeds.between(random, 5, 25);
        int delay = Seeds.between(random, 1, 12);
        double draw = random.nextDouble();
        LocationKind kind = switch (persona.gps) {
            case NONE -> LocationKind.NONE;
            case OUTSIDE -> draw < 0.5 ? LocationKind.FAR : draw < 0.75 ? LocationKind.IMPRECISE : LocationKind.INSIDE;
            case LATE -> draw < 0.5 ? LocationKind.LATE : LocationKind.INSIDE;
            case NORMAL -> draw < 0.03 ? LocationKind.NONE : draw < 0.05 ? LocationKind.AT_THIRTY_SECONDS : LocationKind.INSIDE;
        };
        return switch (kind) {
            case NONE -> new Location(kind, 0, 0, 0, 0);
            case FAR -> new Location(kind, delay, 300 * Math.cos(bearing), 300 * Math.sin(bearing), accuracy);
            case IMPRECISE -> new Location(kind, delay, 0, 0, 150);
            case LATE -> new Location(kind, 31, meters * Math.cos(bearing), meters * Math.sin(bearing), accuracy);
            case AT_THIRTY_SECONDS -> new Location(kind, 30, meters * Math.cos(bearing), meters * Math.sin(bearing), accuracy);
            case INSIDE -> new Location(kind, delay, meters * Math.cos(bearing), meters * Math.sin(bearing), accuracy);
        };
    }

    private static Instant later(Instant a, Instant b) {
        return a.isAfter(b) ? a : b;
    }

    /** Sub-second spread so marks do not all land on whole seconds. */
    private static Instant jitter(SplittableRandom random, Instant at) {
        return at.truncatedTo(ChronoUnit.SECONDS).plus(random.nextInt(1_000_000), ChronoUnit.MICROS);
    }
}
