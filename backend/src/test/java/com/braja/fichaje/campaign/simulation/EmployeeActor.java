package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.ApiClient;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.SplittableRandom;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * One person's PWA: marks with an Idempotency-Key, the location shortly after, motives at the end of the day, a new
 * login when the server closed the session (password reset), and the company switch of a multi-company account.
 * Before each request it predicts the answer from the persisted state and the specification order of checks
 * (replay, JORNADA_CANCELLED, MARK_TOO_EARLY, INVALID_MARK_TRANSITION, INVALID_MARK_ORDER) and the ledger compares.
 * A 409 RETRYABLE_TRANSACTION_CONFLICT (S64) is retried with the same key, as the PWA does, and counted.
 */
final class EmployeeActor {
    record KeyUse(UUID jornadaId, String action, UUID markId) { }

    private static final String HOSTILE = "Colectivo\u202E demorado\u200B\u0007 <script>alert(1)</script> \uFEFF";

    private final SimContext ctx;
    final SimWorld.Employee employee;
    private final Map<UUID, KeyUse> keys = new HashMap<>();
    private int passwordChanges;
    /** The company the next request is meant for, restored after a new login. */
    private SimWorld.Company wanted;

    EmployeeActor(SimContext ctx, SimWorld.Employee employee) {
        this.ctx = ctx;
        this.employee = employee;
    }

    String tag() { return employee.tag(); }

    // ---------------------------------------------------------------- planned taps

    void tap(SimWorld.Jornada jornada, DayPlanner.Tap tap) {
        SplittableRandom random = Seeds.random(ctx.seed(), "tap", employee.index, jornada.site.code, jornada.date, tap.action(), tap.at());
        UUID key = UUID.randomUUID();
        boolean lost = employee.persona == Persona.OFFLINE_RETRY && tap.style() == DayPlanner.Style.NORMAL && random.nextDouble() < 0.3;
        UUID created = send(jornada, tap.action(), key, lost ? "mark.lost" : "mark." + tap.style().name().toLowerCase());
        if (created != null && !lost) accepted(jornada, created, ctx.now(), tap);
        if (lost) {
            Instant retry = ctx.now().plusSeconds(Seeds.between(random, 15, 25));
            ctx.at(retry, tag(), "offline retry " + tap.action(), () -> {
                UUID replayed = send(jornada, tap.action(), key, "mark.retry");
                if (created != null && replayed != null) {
                    ctx.expiryFor(ctx.mark(created).acceptedAt());
                    DayPlanner.Location location = tap.location();
                    if (location.kind() != DayPlanner.LocationKind.NONE) {
                        ctx.at(ctx.now().plusSeconds(2), tag(), "location after retry", () -> locate(jornada, created, location));
                    }
                }
            });
        }
        if (employee.persona == Persona.DOUBLE_TAP) {
            ctx.at(ctx.now().plus(150, ChronoUnit.MILLIS), tag(), "double tap " + tap.action(), () -> send(jornada, tap.action(), key, "mark.double"));
        }
        if (employee.persona == Persona.SPAMMER) spam(jornada, tap, key, random);
    }

    private void spam(SimWorld.Jornada jornada, DayPlanner.Tap tap, UUID key, SplittableRandom random) {
        Instant at = ctx.now();
        int extra = Seeds.between(random, 2, 9);
        for (int i = 0; i < extra; i++) {
            at = at.plus(Seeds.between(random, 300, 900), ChronoUnit.MILLIS);
            double draw = random.nextDouble();
            String wrong = MarkRules.ACTIONS.get(random.nextInt(MarkRules.ACTIONS.size()));
            if (draw < 0.4) ctx.at(at, tag(), "spam replay", () -> send(jornada, tap.action(), key, "mark.spam"));
            else if (draw < 0.7) ctx.at(at, tag(), "spam again", () -> send(jornada, tap.action(), UUID.randomUUID(), "mark.spam"));
            else if (draw < 0.9) ctx.at(at, tag(), "spam " + wrong, () -> send(jornada, wrong, UUID.randomUUID(), "mark.spam"));
            else ctx.at(at, tag(), "spam reused key " + wrong, () -> send(jornada, wrong, key, "mark.spam"));
        }
    }

    /** After a new mark: the location (if any) and the expiry tick; a mistaken EGRESO is handed to the ADMIN. */
    void accepted(SimWorld.Jornada jornada, UUID markId, Instant acceptedAt, DayPlanner.Tap tap) {
        ctx.expiryFor(acceptedAt);
        DayPlanner.Location location = tap.location();
        if (location.kind() != DayPlanner.LocationKind.NONE) {
            ctx.at(acceptedAt.plusSeconds(location.delaySeconds()), tag(), "location " + location.kind(), () -> locate(jornada, markId, location));
        }
        if (tap.style() == DayPlanner.Style.MISTAKE_EGRESS) ctx.admin.voidLater(jornada, markId, acceptedAt.plus(Duration.ofMinutes(40)));
    }

    /** One mark request with its predicted answer; returns the mark id on 201 or a matching 200 replay. */
    UUID send(SimWorld.Jornada jornada, String action, UUID key, String kind) {
        ensureCompany(jornada.site.company);
        String expected = expectMark(jornada, action, key);
        ApiClient.Response response = withSession(() -> employee.browser().mark(jornada.id, action, key));
        for (int retry = 0; retry < 3 && "409 RETRYABLE_TRANSACTION_CONFLICT".equals(DayLedger.token(response)); retry++) {
            ctx.ledger.timing("retryable " + kind);
            ctx.ledger.note(tag(), "409 RETRYABLE_TRANSACTION_CONFLICT on " + action + ", retrying with the same key");
            response = employee.browser().mark(jornada.id, action, key);
        }
        String token = ctx.ledger.expect(tag(), kind + " " + action, response, expected);
        return settle(jornada, action, key, response, token);
    }

    /** Records a 201 and checks a 200 replays the original mark. */
    UUID settle(SimWorld.Jornada jornada, String action, UUID key, ApiClient.Response response, String token) {
        if ("201".equals(token)) {
            UUID id = response.id();
            keys.put(key, new KeyUse(jornada.id, action, id));
            return id;
        }
        if ("200".equals(token)) {
            KeyUse use = keys.get(key);
            if (use == null || !use.markId().equals(response.id())) ctx.ledger.violation(tag(), "replay of " + key + " returned another mark " + response.raw());
            return response.id();
        }
        return null;
    }

    String expectMark(SimWorld.Jornada jornada, String action, UUID key) {
        if (!employee.membership(jornada.site).active) return "403 FORBIDDEN";
        KeyUse used = keys.get(key);
        if (used != null) return used.jornadaId().equals(jornada.id) && used.action().equals(action) ? "200" : "409 IDEMPOTENCY_CONFLICT";
        SimContext.DbJornada stored = ctx.jornada(jornada.id);
        Instant now = ctx.now();
        if (stored.cancelled()) return "409 JORNADA_CANCELLED";
        if (now.isBefore(MarkRules.earliest(action, stored.start()))) return "409 MARK_TOO_EARLY";
        if (!MarkRules.allowed(stored.validActions(), action)) return "409 INVALID_MARK_TRANSITION";
        if (stored.valid().stream().anyMatch(mark -> mark.occurredAt().isAfter(now))) return "409 INVALID_MARK_ORDER";
        return "201";
    }

    // ---------------------------------------------------------------- location

    void locate(SimWorld.Jornada jornada, UUID markId, DayPlanner.Location plan) {
        ensureCompany(jornada.site.company);
        String expected = expectLocation(jornada, markId);
        double north = plan.northMeters(), east = plan.eastMeters();
        double latitude = round7(jornada.site.shopLatitude + Math.toDegrees(north / DeviationOracle.EARTH_RADIUS_METERS));
        double longitude = round7(jornada.site.shopLongitude
                + Math.toDegrees(east / (DeviationOracle.EARTH_RADIUS_METERS * Math.cos(Math.toRadians(jornada.site.shopLatitude)))));
        Map<String, Object> body = Map.of("latitude", latitude, "longitude", longitude, "accuracyMeters", (double) plan.accuracyMeters());
        ApiClient.Response response = withSession(() -> employee.browser().post("/api/v1/marks/" + markId + "/location", body));
        ctx.ledger.expect(tag(), "location " + plan.kind(), response, expected);
    }

    private String expectLocation(SimWorld.Jornada jornada, UUID markId) {
        if (!employee.membership(jornada.site).active) return "403 FORBIDDEN";
        if (ctx.jornada(jornada.id).cancelled()) return "409 JORNADA_CANCELLED";
        SimContext.DbMark mark = ctx.mark(markId);
        if (mark.voided()) return "409 MARK_VOIDED";
        boolean within = !ctx.now().isAfter(mark.acceptedAt().plusSeconds(30));
        if (!"PENDIENTE".equals(mark.locationStatus()) && !("SIN_UBICACION".equals(mark.locationStatus()) && within)) return "409 LOCATION_ALREADY_FINAL";
        return within ? "202" : "409 LOCATION_WINDOW_EXPIRED";
    }

    // ---------------------------------------------------------------- motives

    /** End of day: a first motive for every deviation without one, a few corrections, and (spammer) edits of locked ones. */
    void motives(SimWorld.Company company) {
        SimWorld.Membership membership = employee.memberships.get(company);
        if (membership == null || !membership.active) return;
        ensureCompany(company);
        String from = ctx.ledger.date().minusDays(10).toString(), to = ctx.ledger.date().plusDays(1).toString();
        ApiClient.Response list = withSession(() -> employee.browser().get("/api/v1/deviations?from=" + from + "&to=" + to + "&limit=200"));
        if (!"200".equals(ctx.ledger.expect(tag(), "motive.list", list, "200"))) return;
        List<JsonNode> items = new ArrayList<>();
        list.body().forEach(items::add);
        items.sort(Comparator.comparing((JsonNode item) -> ctx.world.jornadas.get(UUID.fromString(item.get("jornadaId").asText())).date)
                .thenComparing(item -> item.get("type").asText()));
        for (JsonNode item : items) {
            SimWorld.Jornada jornada = ctx.world.jornadas.get(UUID.fromString(item.get("jornadaId").asText()));
            String type = item.get("type").asText(), status = item.get("status").asText();
            boolean hasMotive = !item.path("category").isNull() && !item.path("category").isMissingNode();
            SplittableRandom random = Seeds.random(ctx.seed(), "motive", employee.index, jornada.date, type, status, ctx.ledger.dayIndex());
            String expected;
            if (!hasMotive) {
                if (random.nextDouble() >= 0.8) continue;
                expected = "200";
            } else if ("PENDIENTE_REVISION".equals(status)) {
                if (random.nextDouble() >= 0.1) continue;
                expected = "200";
            } else {
                if (employee.persona != Persona.SPAMMER || random.nextDouble() >= 0.5) continue;
                expected = "409 MOTIVE_LOCKED";
            }
            double draw = random.nextDouble();
            String category = draw < 0.15 ? "SALUD" : draw < 0.5 ? "TRANSPORTE" : draw < 0.65 ? "EMERGENCIA" : "OTRA";
            String text = employee.persona == Persona.MALICIOUS ? HOSTILE
                    : "SALUD".equals(category) ? "Turno médico por fiebre" : "Motivo " + type.toLowerCase() + " del " + jornada.date;
            if (employee.persona == Persona.MALICIOUS) ctx.ledger.count("hostile motive sent (S22: cleaned on input)");
            UUID id = UUID.fromString(item.get("id").asText());
            ApiClient.Response response = withSession(() -> employee.browser().put("/api/v1/deviations/" + id + "/motive",
                    Map.of("category", category, "text", text)));
            ctx.ledger.expect(tag(), "motive " + (hasMotive ? "again" : "first"), response, expected);
        }
    }

    // ---------------------------------------------------------------- session

    ApiClient.Response withSession(Supplier<ApiClient.Response> call) {
        ApiClient.Response response = call.get();
        boolean canLogIn = employee.memberships.values().stream().anyMatch(membership -> membership.active);
        if (response.status() == 401 && canLogIn) {
            ctx.ledger.count("relogin after 401");
            ctx.ledger.note(tag(), "session closed (" + response.code() + "), logging in again");
            logIn();
            if (wanted != null && wanted != employee.activeCompany) ensureCompany(wanted);
            response = call.get();
        }
        return response;
    }

    void logIn() {
        String password = employee.temporaryPassword != null ? employee.temporaryPassword : employee.password;
        ApiClient.Response login = login(ctx, employee.browser(), employee.dni, password);
        if (!"200".equals(ctx.ledger.expect(tag(), "login", login, "200"))) return;
        String active = login.body().path("activeCompanyId").asText(null);
        employee.activeCompany = ctx.world.companies.stream().filter(c -> c.id().toString().equals(active)).findFirst().orElse(null);
        if (employee.temporaryPassword != null) {
            String next = "sim-password-" + employee.index + "-" + (++passwordChanges) + "-abcdef";
            ApiClient.Response change = employee.browser().put("/api/v1/session/password",
                    Map.of("currentPassword", employee.temporaryPassword, "newPassword", next));
            if ("204".equals(ctx.ledger.expect(tag(), "password change after reset", change, "204"))) {
                employee.password = next;
                employee.temporaryPassword = null;
            }
        }
    }

    /**
     * A login from a browser whose session the server closed carries that session's CSRF token, which the server
     * rejects (401 SESSION_EXPIRED: "fetch a new CSRF token and sign in again"); the PWA does exactly that, once.
     */
    static ApiClient.Response login(SimContext ctx, ApiClient browser, String dni, String password) {
        ApiClient.Response login = browser.login(dni, password);
        if (login.status() == 401 && "SESSION_EXPIRED".equals(login.code())) {
            ctx.ledger.count("login retried with a fresh CSRF token");
            login = browser.login(dni, password);
        }
        return login;
    }

    void ensureCompany(SimWorld.Company company) {
        wanted = company;
        if (employee.activeCompany == company || employee.memberships.size() < 2) return;
        ApiClient.Response response = withSession(() -> employee.browser().put("/api/v1/companies/active", Map.of("companyId", company.id())));
        if ("200".equals(ctx.ledger.expect(tag(), "switch company", response, "200"))) employee.activeCompany = company;
    }

    static double round7(double value) {
        return Math.round(value * 1e7) / 1e7;
    }
}
