package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.ApiClient;
import com.braja.fichaje.campaign.Fixture;
import com.fasterxml.jackson.databind.JsonNode;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;

/**
 * The ADMIN API calls of the simulation, each with the answer the model predicts and the model update when it succeeds.
 * Declarations register the jornada with the schedule, tolerance and geofence it must freeze (checked by CA3 in
 * {@link OracleCheck}). Decisions over server-ordered lists (the inbox) are keyed per deviation, never per position.
 */
final class AdminActor {
    private final SimContext ctx;

    AdminActor(SimContext ctx) {
        this.ctx = ctx;
    }

    private static String tag(SimWorld.Company company) { return "admin:" + company.name; }

    // ---------------------------------------------------------------- declarations

    /** POST /jornadas/bulk; predicts created and skipped (JORNADA_EXISTS, TEMPLATE_REQUIRED) or a whole 422. */
    void bulk(SimWorld.Site site, List<SimWorld.Employee> employees, Set<Integer> weekdays, LocalDate from, LocalDate to) {
        SimWorld.Company company = site.company;
        boolean anyInactive = employees.stream().anyMatch(employee -> !employee.membership(site).active);
        Set<String> created = new TreeSet<>(), skipped = new TreeSet<>();
        Map<String, SimWorld.Template> templates = new LinkedHashMap<>();
        for (LocalDate date = from; !date.isAfter(to); date = date.plusDays(1)) {
            if (!weekdays.contains(date.getDayOfWeek().getValue())) continue;
            for (SimWorld.Employee employee : employees) {
                String key = employee.index + " " + date;
                SimWorld.Template template = employee.membership(site).inForce(site, date);
                if (ctx.world.live(employee, site, date) != null) skipped.add(key + " JORNADA_EXISTS");
                else if (template == null) skipped.add(key + " TEMPLATE_REQUIRED");
                else {
                    created.add(key);
                    templates.put(key, template);
                }
            }
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("employeeIds", employees.stream().map(employee -> employee.membership(site).employeeId).toList());
        body.put("siteId", site.id);
        body.put("from", from.toString());
        body.put("to", to.toString());
        body.put("weekdays", new ArrayList<>(new TreeSet<>(weekdays)));
        ApiClient.Response response = call(company, () -> company.admin().post("/api/v1/jornadas/bulk", body));
        String token = ctx.ledger.expect(tag(company), "admin.bulk", response, anyInactive ? "422 VALIDATION_ERROR" : "200");
        if (!"200".equals(token)) return;
        Set<String> gotCreated = new TreeSet<>(), gotSkipped = new TreeSet<>();
        for (JsonNode item : response.body().get("created")) {
            SimWorld.Employee employee = ctx.world.employeeById(UUID.fromString(item.get("employeeId").asText()));
            String key = employee.index + " " + item.get("localDate").asText();
            gotCreated.add(key);
            SimWorld.Template template = templates.get(key);
            if (template != null) {
                ctx.world.add(new SimWorld.Jornada(UUID.fromString(item.get("id").asText()), employee, site, LocalDate.parse(item.get("localDate").asText()),
                        template, employee.membership(site).tolerance));
            }
        }
        for (JsonNode item : response.body().get("skipped")) {
            SimWorld.Employee employee = ctx.world.employeeById(UUID.fromString(item.get("employeeId").asText()));
            gotSkipped.add(employee.index + " " + item.get("localDate").asText() + " " + item.get("reason").asText());
        }
        if (!gotCreated.equals(created)) ctx.ledger.violation(tag(company), "bulk " + site.code + " created " + gotCreated + " but the model expected " + created);
        if (!gotSkipped.equals(skipped)) ctx.ledger.violation(tag(company), "bulk " + site.code + " skipped " + gotSkipped + " but the model expected " + skipped);
        ctx.ledger.count("admin.bulk jornadas created", gotCreated.size());
        ctx.ledger.count("admin.bulk dates skipped", gotSkipped.size());
    }

    /** POST /jornadas with an explicit template (a one-off schedule) or with the assignment in force. */
    SimWorld.Jornada declare(SimWorld.Employee employee, SimWorld.Site site, LocalDate date, SimWorld.Template explicit) {
        SimWorld.Company company = site.company;
        SimWorld.Template template = explicit != null ? explicit : employee.membership(site).inForce(site, date);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("employeeId", employee.membership(site).employeeId);
        body.put("siteId", site.id);
        body.put("localDate", date.toString());
        if (explicit != null) body.put("templateId", explicit.id);
        ApiClient.Response response = call(company, () -> company.admin().post("/api/v1/jornadas", body));
        if (!"201".equals(ctx.ledger.expect(tag(company), "admin.declare", response, "201"))) return null;
        SimWorld.Jornada jornada = new SimWorld.Jornada(response.id(), employee, site, date, template, employee.membership(site).tolerance);
        ctx.world.add(jornada);
        return jornada;
    }

    void assign(SimWorld.Employee employee, SimWorld.Site site, SimWorld.Template template, LocalDate validFrom) {
        SimWorld.Membership membership = employee.membership(site);
        boolean exists = membership.assignments.computeIfAbsent(site, s -> new TreeMap<>()).containsKey(validFrom);
        ApiClient.Response response = call(site.company, () -> site.company.admin().post("/api/v1/employees/" + membership.employeeId
                + "/template-assignments", Map.of("templateId", template.id, "validFrom", validFrom.toString())));
        String token = ctx.ledger.expect(tag(site.company), "admin.assign", response, exists ? "409 ASSIGNMENT_EXISTS" : "201");
        if ("201".equals(token)) membership.assignments.get(site).put(validFrom, template);
    }

    // ---------------------------------------------------------------- jornada and mark corrections

    boolean cancel(SimWorld.Jornada jornada, String reason) {
        SimContext.DbJornada stored = ctx.jornada(jornada.id);
        String expected = stored.cancelled() ? "409 JORNADA_CANCELLED" : stored.valid().isEmpty() ? "200" : "409 JORNADA_HAS_MARKS";
        SimWorld.Company company = jornada.site.company;
        ApiClient.Response response = call(company, () -> company.admin().post("/api/v1/admin/jornadas/" + jornada.id + "/cancellation", Map.of("reason", reason)));
        boolean cancelled = "200".equals(ctx.ledger.expect(tag(company), "admin.cancel", response, expected));
        if (cancelled) ctx.world.cancel(jornada);
        return cancelled;
    }

    /** A forgotten mark at its real time; the history is ordered by that time (marks at or before it stay first). */
    void forgotten(SimWorld.Jornada jornada, String action, Instant occurredAt) {
        SimContext.DbJornada stored = ctx.jornada(jornada.id);
        List<String> history = new ArrayList<>();
        boolean inserted = false;
        for (SimContext.DbMark mark : stored.valid()) {
            if (!inserted && mark.occurredAt().isAfter(occurredAt)) {
                history.add(action);
                inserted = true;
            }
            history.add(mark.action());
        }
        if (!inserted) history.add(action);
        String[] expected = stored.cancelled() ? new String[] {"409 JORNADA_CANCELLED"}
                : MarkRules.validHistory(history) ? new String[] {"201"} : new String[] {"409 INVALID_MARK_TRANSITION", "409 INVALID_MARK_ORDER"};
        SimWorld.Company company = jornada.site.company;
        ApiClient.Response response = call(company, () -> company.admin().post("/api/v1/admin/jornadas/" + jornada.id + "/forgotten-marks",
                Map.of("action", action, "occurredAt", occurredAt.toString(), "auditReason", "Forgot to mark, checked with the manager")));
        ctx.ledger.expect(tag(company), "admin.forgotten " + action, response, expected);
    }

    void voidMark(SimWorld.Jornada jornada, UUID markId, String reason) {
        SimContext.DbJornada stored = ctx.jornada(jornada.id);
        SimContext.DbMark mark = stored.marks().stream().filter(m -> m.id().equals(markId)).findFirst().orElseThrow();
        List<String> remaining = stored.valid().stream().filter(m -> !m.id().equals(markId)).map(SimContext.DbMark::action).toList();
        String expected = mark.voided() ? "409 MARK_VOIDED" : MarkRules.validHistory(remaining) ? "200" : "409 INVALID_MARK_HISTORY";
        SimWorld.Company company = jornada.site.company;
        ApiClient.Response response = call(company, () -> company.admin().post("/api/v1/admin/marks/" + markId + "/void", Map.of("reason", reason)));
        ctx.ledger.expect(tag(company), "admin.void", response, expected);
    }

    void voidLater(SimWorld.Jornada jornada, UUID markId, Instant at) {
        ctx.at(at, tag(jornada.site.company), "void mistaken EGRESO of " + jornada.tag(), () -> voidMark(jornada, markId, "Tapped EGRESO by mistake"));
    }

    /** Moves a mark's time between its neighbours (the only correction the simulation predicts as accepted). */
    void correct(SimWorld.Jornada jornada, UUID markId, Instant occurredAt) {
        SimContext.DbJornada stored = ctx.jornada(jornada.id);
        List<SimContext.DbMark> valid = stored.valid();
        int index = valid.stream().map(SimContext.DbMark::id).toList().indexOf(markId);
        boolean ordered = index >= 0 && (index == 0 || !valid.get(index - 1).occurredAt().isAfter(occurredAt))
                && (index == valid.size() - 1 || !valid.get(index + 1).occurredAt().isBefore(occurredAt));
        SimWorld.Company company = jornada.site.company;
        String action = index >= 0 ? valid.get(index).action() : "INGRESO";
        ApiClient.Response response = call(company, () -> company.admin().post("/api/v1/admin/marks/" + markId + "/correction",
                Map.of("correctedAction", action, "correctedOccurredAt", occurredAt.toString(), "auditReason", "Checked against the camera")));
        ctx.ledger.expect(tag(company), "admin.correct", response, ordered ? new String[] {"200"} : new String[] {"409 INVALID_MARK_ORDER", "409 INVALID_MARK_TRANSITION"});
    }

    // ---------------------------------------------------------------- inbox review

    /** 18:00 local: the reviewer pages the last week's inbox and classifies; decisions are keyed per deviation. */
    void review(SimWorld.Company company) {
        LocalDate today = ctx.ledger.date();
        String filters = "&from=" + today.minusDays(6) + "&to=" + today;
        List<JsonNode> items = new ArrayList<>();
        String cursor = null;
        for (int page = 0; page < 50; page++) {
            String path = "/api/v1/inbox?limit=50" + filters + (cursor == null ? "" : "&cursor=" + java.net.URLEncoder.encode(cursor, java.nio.charset.StandardCharsets.UTF_8));
            ApiClient.Response response = call(company, () -> company.reviewer.get(path));
            if (!"200".equals(ctx.ledger.expect(tag(company), "admin.inbox", response, "200"))) return;
            response.body().get("items").forEach(items::add);
            cursor = response.body().path("nextCursor").isTextual() ? response.body().get("nextCursor").asText() : null;
            if (cursor == null) break;
        }
        Set<String> seen = new TreeSet<>();
        for (JsonNode item : items) {
            if (!seen.add(item.get("id").asText())) ctx.ledger.violation(tag(company), "the inbox cursor repeated deviation " + item.get("id").asText());
        }
        items.sort(java.util.Comparator.comparing((JsonNode item) -> ctx.world.employeeById(UUID.fromString(item.get("employeeId").asText())).index)
                .thenComparing(item -> ctx.world.jornadas.get(UUID.fromString(item.get("jornadaId").asText())).date)
                .thenComparing(item -> item.get("type").asText()));
        for (JsonNode item : items) classify(company, item, today);
    }

    private void classify(SimWorld.Company company, JsonNode item, LocalDate today) {
        SimWorld.Jornada jornada = ctx.world.jornadas.get(UUID.fromString(item.get("jornadaId").asText()));
        String status = item.get("status").asText(), type = item.get("type").asText();
        java.util.SplittableRandom random = Seeds.random(ctx.seed(), "classify", jornada.employee.index, jornada.date, type, status, today);
        String classification, reason = null, expected = "200";
        double draw = random.nextDouble();
        switch (status) {
            case "PENDIENTE_REVISION" -> classification = draw < 0.7 ? "JUSTIFICADO" : "NO_JUSTIFICADO";
            case "MOTIVO_PENDIENTE" -> {
                if (jornada.date.isAfter(today.minusDays(2))) return;
                classification = "NO_JUSTIFICADO";
            }
            default -> {
                String opposite = "JUSTIFICADO".equals(status) ? "NO_JUSTIFICADO" : "JUSTIFICADO";
                if (draw < 0.04) { classification = opposite; reason = "Reviewed the camera again"; }
                else if (draw < 0.06) { classification = opposite; expected = "422 VALIDATION_ERROR"; }
                else if (draw < 0.08) classification = status;
                else return;
            }
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("classification", classification);
        body.put("correctionReason", reason);
        UUID id = UUID.fromString(item.get("id").asText());
        ApiClient.Response response = call(company, () -> company.reviewer.put("/api/v1/admin/deviations/" + id + "/classification", body));
        ctx.ledger.expect(tag(company), "admin.classify " + status, response, expected);
    }

    // ---------------------------------------------------------------- organization

    void resetPassword(SimWorld.Employee employee, SimWorld.Company company) {
        boolean shared = employee.memberships.size() > 1;
        UUID id = employee.memberships.get(company).employeeId;
        ApiClient.Response response = call(company, () -> company.admin().post("/api/v1/employees/" + id + "/password-reset", Map.of()));
        if ("200".equals(ctx.ledger.expect(tag(company), "admin.password-reset", response, shared ? "409 ACCOUNT_SHARED" : "200"))) {
            employee.temporaryPassword = response.body().get("temporaryPassword").asText();
            ctx.ledger.note(tag(company), "reset the password of " + employee.tag() + ": every session of the account is closed");
        }
    }

    void editTemplate(SimWorld.Template template, SimWorld.Version version) {
        ApiClient.Response response = call(template.site.company, () -> template.site.company.admin().patch("/api/v1/templates/" + template.id, templateBody(template.site, version)));
        if ("200".equals(ctx.ledger.expect(tag(template.site.company), "admin.template-edit", response, "200"))) template.version = version;
    }

    void moveTemplate(SimWorld.Template template, SimWorld.Site other) {
        ApiClient.Response response = call(template.site.company, () -> template.site.company.admin().patch("/api/v1/templates/" + template.id, templateBody(other, template.version)));
        ctx.ledger.expect(tag(template.site.company), "admin.template-move", response, "409 TEMPLATE_IN_USE");
    }

    void tolerance(SimWorld.Employee employee, SimWorld.Company company, int minutes) {
        SimWorld.Membership membership = employee.memberships.get(company);
        ApiClient.Response response = call(company, () -> company.admin().patch("/api/v1/employees/" + membership.employeeId, Map.of("toleranceMinutes", minutes)));
        if ("200".equals(ctx.ledger.expect(tag(company), "admin.tolerance", response, "200"))) membership.tolerance = minutes;
    }

    void active(SimWorld.Employee employee, SimWorld.Company company, boolean active) {
        SimWorld.Membership membership = employee.memberships.get(company);
        ApiClient.Response response = call(company, () -> company.admin().patch("/api/v1/employees/" + membership.employeeId, Map.of("active", active)));
        if ("200".equals(ctx.ledger.expect(tag(company), active ? "admin.reactivate" : "admin.deactivate", response, "200"))) membership.active = active;
    }

    void siteCenter(SimWorld.Site site, SimWorld.Center center) {
        ApiClient.Response response = call(site.company, () -> site.company.admin().put("/api/v1/sites/" + site.id + "/location", Map.of("latitude", center.latitude(),
                "longitude", center.longitude(), "geofenceRadiusMeters", center.radiusMeters(), "locationSource", "MANUAL")));
        if (!"200".equals(ctx.ledger.expect(tag(site.company), "admin.site-center", response, "200"))) return;
        site.center = center;
        // D-20261102-01: the new fence also reaches this site's jornadas dated today or later (site zone) that have not
        // started, i.e. have no mark at all (a voided one counts as started) and are not cancelled.
        LocalDate today = LocalDate.ofInstant(ctx.now(), site.zone);
        for (SimWorld.Jornada jornada : ctx.world.jornadas.values()) {
            if (jornada.site != site || jornada.cancelled || jornada.date.isBefore(today)) continue;
            Integer marks = ctx.jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE jornada_id=?", Integer.class, jornada.id.toString());
            if (marks != null && marks == 0) jornada.center = center;
        }
    }

    void subscribe(SimWorld.Company company) {
        company.pushEndpoint = "https://fcm.googleapis.com/fcm/send/" + UUID.randomUUID();
        ApiClient.Response response = call(company, () -> company.admin().put("/api/v1/push/subscriptions", PushKeys.subscription(company.pushEndpoint)));
        if ("200".equals(ctx.ledger.expect(tag(company), "admin.push-subscribe", response, "200"))) company.subscribed = true;
    }

    /** Whether the ADMIN's device is still subscribed (a 404/410 from the provider removes it). */
    boolean stillSubscribed(SimWorld.Company company) {
        ApiClient.Response response = call(company, () -> company.admin().post("/api/v1/push/subscriptions/current", Map.of("endpoint", company.pushEndpoint)));
        ctx.ledger.expect(tag(company), "admin.push-current", response, "200");
        return response.body().path("subscribed").asBoolean(false);
    }

    static Map<String, Object> templateBody(SimWorld.Site site, SimWorld.Version version) {
        List<Map<String, Object>> blocks = new ArrayList<>();
        for (Fixture.Block block : version.blocks()) {
            blocks.add(Map.of("startDayOffset", block.startDayOffset(), "start", block.start().toString(), "end", block.end().toString(),
                    "endDayOffset", block.endDayOffset()));
        }
        return Map.of("siteId", site.id, "name", version.name(), "blocks", blocks, "breakfastLimitMinutes", version.breakfastLimit(),
                "lunchLimitMinutes", version.lunchLimit());
    }

    /** ADMIN sessions only end by real-time inactivity (S5); a 401 logs the ADMIN in again and is counted. */
    private ApiClient.Response call(SimWorld.Company company, java.util.function.Supplier<ApiClient.Response> request) {
        ApiClient.Response response = request.get();
        if (response.status() == 401) {
            ctx.ledger.count("admin relogin after 401");
            EmployeeActor.login(ctx, company.admin(), company.fixture.adminDni(), Fixture.PASSWORD).expect(200);
            if (company.reviewer != company.admin()) EmployeeActor.login(ctx, company.reviewer, company.reviewerDni, Fixture.PASSWORD).expect(200);
            response = request.get();
        }
        return response;
    }
}
