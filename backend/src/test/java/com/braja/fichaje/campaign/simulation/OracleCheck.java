package com.braja.fichaje.campaign.simulation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * I3 (stored state = state of the valid marks), I5 (active deviations = {@link DeviationOracle}), I6 (FUERA_DE_SEDE
 * only with a snapshot and anchored on a mark that is outside) and CA3 (each jornada froze the schedule, tolerance and
 * geofence the model says were in force when it was declared). Three queries for the whole database, no N+1.
 */
final class OracleCheck {
    private record Row(String id, String employeeId, String state, java.time.LocalDate localDate, String zone, Instant start, Instant end, int tolerance, String snapshot,
                       BigDecimal latitude, BigDecimal longitude, Integer radius, boolean jobsSeeIt, boolean hasMembership) { }

    private record Active(String type, String sourceMarkId) { }

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final SimWorld world;

    OracleCheck(JdbcTemplate jdbc, ObjectMapper json, SimWorld world) {
        this.jdbc = jdbc;
        this.json = json;
        this.world = world;
    }

    /** Violations as "invariant jornada-tag: detail"; also returns active deviation counts by type for the summary. */
    List<String> check(Instant now, Map<String, Long> activeByType) {
        List<String> violations = new ArrayList<>();
        Map<String, List<DeviationOracle.Mark>> marks = new LinkedHashMap<>();
        jdbc.query("SELECT id, jornada_id, action, occurred_at, origin, location_status, latitude, longitude, accuracy_meters FROM mark_events"
                + " WHERE voided_at IS NULL ORDER BY jornada_id, timeline_order, sequence_number", rs -> {
            marks.computeIfAbsent(rs.getString("jornada_id"), k -> new ArrayList<>()).add(new DeviationOracle.Mark(rs.getString("id"),
                    rs.getString("action"), rs.getTimestamp("occurred_at").toInstant(), "EMPLEADO".equals(rs.getString("origin")),
                    rs.getString("location_status"), number(rs.getBigDecimal("latitude")), number(rs.getBigDecimal("longitude")),
                    number(rs.getBigDecimal("accuracy_meters"))));
        });
        Map<String, List<Active>> deviations = new LinkedHashMap<>();
        jdbc.query("SELECT jornada_id, type, source_mark_id FROM deviations WHERE active", rs -> {
            deviations.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(new Active(rs.getString(2), rs.getString(3)));
            activeByType.merge(rs.getString(2), 1L, Long::sum);
        });
        List<Row> rows = jdbc.query("""
                SELECT j.id, j.employee_id, j.state, j.local_date, j.time_zone, j.scheduled_start_at, j.scheduled_end_at, j.tolerance_minutes, j.schedule_snapshot,
                       j.site_geofence_latitude_snapshot, j.site_geofence_longitude_snapshot, j.site_geofence_radius_snapshot,
                       (e.active AND a.active AND cm.active) AS jobs_see_it, cm.account_id IS NOT NULL AS has_membership
                FROM jornadas j JOIN employees e ON e.id = j.employee_id AND e.company_id = j.company_id
                JOIN accounts a ON a.id = e.account_id
                LEFT JOIN company_memberships cm ON cm.company_id = e.company_id AND cm.account_id = e.account_id""",
                (rs, n) -> new Row(rs.getString(1), rs.getString(2), rs.getString(3), rs.getObject(4, java.time.LocalDate.class), rs.getString(5),
                        rs.getTimestamp(6).toInstant(), rs.getTimestamp(7).toInstant(),
                        rs.getInt(8), rs.getString(9), rs.getBigDecimal(10), rs.getBigDecimal(11), rs.getObject(12, Integer.class), rs.getBoolean(13),
                        rs.getBoolean(14)));
        for (Row row : rows) {
            SimWorld.Jornada model = world.jornadas.get(java.util.UUID.fromString(row.id()));
            String tag = model == null ? row.id() : model.tag();
            if (model == null) {
                violations.add("model: jornada " + row.id() + " exists in the database but the simulation never declared it");
                continue;
            }
            if (!row.hasMembership()) {
                violations.add("membership " + tag + ": no company_memberships row for the employee's account in its company, so the oracle cannot tell whether the jobs see it");
                continue;
            }
            JsonNode snapshot = read(row.snapshot());
            violations.addAll(frozen(tag, model, row, snapshot));
            DeviationOracle.Geofence fence = row.latitude() == null ? null
                    : new DeviationOracle.Geofence(row.latitude().doubleValue(), row.longitude().doubleValue(), row.radius());
            DeviationOracle.Jornada facts = new DeviationOracle.Jornada(row.localDate(), java.time.ZoneId.of(row.zone()), row.start(), row.end(), row.tolerance(),
                    snapshot.get("breakfastLimitMinutes").asInt(), snapshot.get("lunchLimitMinutes").asInt(), fence,
                    "CANCELADA".equals(row.state()), marks.getOrDefault(row.id(), List.of()));
            DeviationOracle.Expectation expected = DeviationOracle.expect(facts, now, row.jobsSeeIt());
            if (!expected.state().equals(row.state())) violations.add("I3 " + tag + ": stored state " + row.state() + " but the valid marks give " + expected.state());
            List<Active> active = deviations.getOrDefault(row.id(), List.of());
            Set<String> actual = new TreeSet<>();
            active.forEach(deviation -> actual.add(deviation.type()));
            Set<String> required = new TreeSet<>(expected.active());
            Set<String> allowed = new TreeSet<>(expected.active());
            allowed.addAll(expected.uncertain());
            if (!actual.containsAll(required) || !allowed.containsAll(actual)) {
                violations.add("I5 " + tag + ": active " + actual + " but the oracle expects " + required
                        + (expected.uncertain().isEmpty() ? "" : " (+ maybe " + expected.uncertain() + ")") + " from marks " + describe(marks.get(row.id())));
            }
            for (Active deviation : active) {
                if (!deviation.type().equals("FUERA_DE_SEDE")) continue;
                if (fence == null) violations.add("I6 " + tag + ": FUERA_DE_SEDE without a geofence snapshot");
                else if (!expected.outsideAnchors().contains(deviation.sourceMarkId()) && !expected.uncertain().contains("FUERA_DE_SEDE")) {
                    violations.add("I6 " + tag + ": FUERA_DE_SEDE anchored on " + deviation.sourceMarkId() + ", not one of the outside marks " + expected.outsideAnchors());
                }
            }
        }
        return violations;
    }

    /** CA3: the frozen copy equals what was in force at declaration time, whatever the ADMIN edited since. */
    private static List<String> frozen(String tag, SimWorld.Jornada model, Row row, JsonNode snapshot) {
        List<String> violations = new ArrayList<>();
        boolean cancelled = "CANCELADA".equals(row.state());
        if (cancelled != model.cancelled) violations.add("model " + tag + ": cancelled in the database " + cancelled + " but in the model " + model.cancelled);
        if (!row.start().equals(model.start) || !row.end().equals(model.end)) {
            violations.add("CA3 " + tag + ": scheduled " + row.start() + "-" + row.end() + " but the model expects " + model.start + "-" + model.end);
        }
        if (row.tolerance() != model.tolerance) violations.add("CA3 " + tag + ": tolerance " + row.tolerance() + " but the model expects " + model.tolerance);
        SimWorld.Version version = model.version;
        if (snapshot.get("breakfastLimitMinutes").asInt() != version.breakfastLimit() || snapshot.get("lunchLimitMinutes").asInt() != version.lunchLimit()
                || !snapshot.get("name").asText().equals(version.name()) || snapshot.get("blocks").size() != version.blocks().size()) {
            violations.add("CA3 " + tag + ": snapshot " + snapshot + " but the model froze " + version);
        } else {
            for (int i = 0; i < version.blocks().size(); i++) {
                JsonNode block = snapshot.get("blocks").get(i);
                if (!LocalTime.parse(block.get("start").asText()).equals(version.blocks().get(i).start())
                        || !LocalTime.parse(block.get("end").asText()).equals(version.blocks().get(i).end())) {
                    violations.add("CA3 " + tag + ": snapshot block " + block + " but the model froze " + version.blocks().get(i));
                }
            }
        }
        SimWorld.Center center = model.center;
        boolean hasFence = row.latitude() != null;
        if (hasFence != (center != null) || (center != null && (Math.abs(row.latitude().doubleValue() - center.latitude()) > 1e-7
                || Math.abs(row.longitude().doubleValue() - center.longitude()) > 1e-7 || row.radius() != center.radiusMeters()))) {
            violations.add("CA3 " + tag + ": geofence snapshot " + row.latitude() + "," + row.longitude() + " r=" + row.radius() + " but the model froze " + center);
        }
        return violations;
    }

    static Map<String, Long> sorted(Map<String, Long> counts) {
        return new TreeMap<>(counts);
    }

    private static String describe(List<DeviationOracle.Mark> marks) {
        if (marks == null) return "[]";
        List<String> parts = new ArrayList<>();
        for (DeviationOracle.Mark mark : marks) parts.add(mark.action() + "@" + mark.occurredAt() + (mark.byEmployee() ? "/" + mark.locationStatus() : "/ADMIN"));
        return parts.toString();
    }

    private static Double number(BigDecimal value) {
        return value == null ? null : value.doubleValue();
    }

    private JsonNode read(String raw) {
        try {
            return json.readTree(raw);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }
}
