package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.ApiClient;
import com.braja.fichaje.campaign.FakeWebPushGateway;
import com.braja.fichaje.campaign.Fixture;
import com.braja.fichaje.campaign.HttpLog;
import com.braja.fichaje.campaign.MutableClock;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/** Everything one simulation run shares: the server-side handles, the model, the timeline and the ledger. */
final class SimContext {
    record DbMark(UUID id, String action, Instant occurredAt, Instant acceptedAt, boolean voided, String origin, String locationStatus) { }

    record DbJornada(String state, Instant start, Instant end, List<DbMark> marks) {
        boolean cancelled() { return "CANCELADA".equals(state); }

        List<DbMark> valid() { return marks.stream().filter(mark -> !mark.voided()).toList(); }

        List<String> validActions() { return valid().stream().map(DbMark::action).toList(); }
    }

    final SimSettings settings;
    final SimWorld world = new SimWorld();
    final Timeline timeline = new Timeline();
    final DayLedger ledger;
    final SimJobs jobs;
    final JdbcTemplate jdbc;
    final MutableClock clock;
    final ObjectMapper json;
    final Fixture fixture;
    final HttpLog http;
    final FakeWebPushGateway push;
    final String passwordHash;
    final String baseUrl;
    AdminActor admin;
    private final Set<Instant> expiryTicks = new HashSet<>();

    SimContext(SimSettings settings, JdbcTemplate jdbc, MutableClock clock, ObjectMapper json, Fixture fixture, HttpLog http,
               FakeWebPushGateway push, String passwordHash, String baseUrl, JobBeans beans) {
        this.settings = settings;
        this.jdbc = jdbc;
        this.clock = clock;
        this.json = json;
        this.fixture = fixture;
        this.http = http;
        this.push = push;
        this.passwordHash = passwordHash;
        this.baseUrl = baseUrl;
        this.ledger = new DayLedger(settings.seed(), settings.outputDir(), clock::instant);
        this.jobs = new SimJobs(beans.marks(), beans.dispatcher(), beans.privacy(), jdbc, ledger);
    }

    record JobBeans(com.braja.fichaje.timekeeping.MarkScheduler marks, com.braja.fichaje.notifications.NotificationOutboxDispatcher dispatcher,
                    com.braja.fichaje.security.PrivacyRetentionScheduler privacy) { }

    long seed() { return settings.seed(); }

    Instant now() { return clock.instant(); }

    void at(Instant at, String actor, String label, Runnable action) {
        timeline.at(at.truncatedTo(ChronoUnit.MICROS), actor, label, action);
    }

    /** The location expiry job at accepted + 30 s + 1 µs, the first instant its strict comparison sees the mark. */
    void expiryFor(Instant acceptedAt) {
        Instant tick = acceptedAt.plusSeconds(30).plus(1, ChronoUnit.MICROS);
        if (expiryTicks.add(tick)) at(tick, "job", "location expiry", jobs::locationExpiry);
    }

    ApiClient client(String actor) {
        return fixture.client(actor);
    }

    DbJornada jornada(UUID id) {
        Object[] head = jdbc.query("SELECT state, scheduled_start_at, scheduled_end_at FROM jornadas WHERE id=?",
                rs -> rs.next() ? new Object[] {rs.getString(1), rs.getTimestamp(2).toInstant(), rs.getTimestamp(3).toInstant()} : null, id.toString());
        if (head == null) throw new IllegalStateException("jornada " + id + " is not in the database");
        List<DbMark> marks = jdbc.query("SELECT id, action, occurred_at, accepted_at, voided_at, origin, location_status FROM mark_events"
                        + " WHERE jornada_id=? ORDER BY timeline_order, sequence_number",
                (rs, row) -> new DbMark(UUID.fromString(rs.getString(1)), rs.getString(2), rs.getTimestamp(3).toInstant(), rs.getTimestamp(4).toInstant(),
                        rs.getTimestamp(5) != null, rs.getString(6), rs.getString(7)), id.toString());
        return new DbJornada((String) head[0], (Instant) head[1], (Instant) head[2], marks);
    }

    DbMark mark(UUID id) {
        return jdbc.query("SELECT id, action, occurred_at, accepted_at, voided_at, origin, location_status FROM mark_events WHERE id=?",
                rs -> rs.next() ? new DbMark(UUID.fromString(rs.getString(1)), rs.getString(2), rs.getTimestamp(3).toInstant(), rs.getTimestamp(4).toInstant(),
                        rs.getTimestamp(5) != null, rs.getString(6), rs.getString(7)) : null, id.toString());
    }

    int count(String sql, Object... args) {
        Integer value = jdbc.queryForObject(sql, Integer.class, args);
        return value == null ? 0 : value;
    }

    static Timestamp ts(Instant instant) {
        return Timestamp.from(instant);
    }
}
