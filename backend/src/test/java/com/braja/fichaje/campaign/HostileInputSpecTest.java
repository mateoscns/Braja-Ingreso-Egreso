package com.braja.fichaje.campaign;

import com.braja.fichaje.timekeeping.MarkScheduler;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S22 (CLAUDE.md rule 25): every text the ADMIN sees must come back without control, bidi or zero-width characters and
 * within its length cap. {@code api.HostileText} cleans every such field in its request record, before validation (#76).
 *
 * Decision for the expected cleaning (an assumption until Mateo confirms): forbidden are C0 controls U+0000-U+001F, DEL
 * and C1 U+007F-U+009F, bidi embeddings and overrides U+202A-U+202E, bidi isolates U+2066-U+2069, zero-width
 * U+200B-U+200D and U+FEFF. A line feed U+000A stays allowed only in the free-text fields (motive and the ADMIN's
 * reasons), which the PWA edits in a text area; names are single-line, so a line feed is forbidden there.
 * The jornada is 09:00-17:00 in Buenos Aires on 2027-03-01 (12:00Z-20:00Z) with a 10 minute tolerance.
 */
class HostileInputSpecTest extends CampaignTestBase {
    private static final String BA = "America/Argentina/Buenos_Aires";
    private static final String JSON = "application/json";
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    /** Every forbidden family once, plus a line feed and plain text around them. */
    private static final String CORE = "\u0000nul\u0007bel\u001B[31mansi\t\rcr\u007Fdel\u0085nel\u202Erlo\u202C\u2066iso\u2069"
            + "\u200Bzw\u200C\u200D\uFEFFbom\nline";

    /** One hostile value sent, padded to the field's cap, which the ADMIN must see back. */
    private record Sent(String field, String value, boolean multiline) { }

    private record Submitted(List<Sent> sent, ApiClient admin, List<UUID> jornadas) { }

    @Autowired private MarkScheduler scheduler;

    @AfterEach
    void noInvariantBrokenAndNoServerError() {
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
        assertEquals(List.of(), httpLog.serverErrors());
    }

    /** Every hostile value at its exact cap is accepted and reaches the ADMIN's views; the 5xx check runs after each test. */
    @Test
    void s22HostileTextAtItsCapIsAcceptedAndReachesTheAdmin() {
        Map<String, String> seen = adminView(submitHostileEverywhere());
        assertEquals(List.of("motive", "displayName", "siteName", "templateName", "forgottenReason", "correctionReason",
                "voidReason", "classificationReason", "cancelReason"), List.copyOf(seen.keySet()));
        for (Map.Entry<String, String> entry : seen.entrySet()) {
            assertTrue(entry.getValue() != null && !entry.getValue().isEmpty(), entry.getKey() + " is not visible to the ADMIN");
        }
    }

    @Test
    void s22EveryAdminVisibleTextKeepsItsLengthCap() {
        Fixture.Company company = fixture.company("Topes");
        UUID site = fixture.site(company, "Centro", BA);
        Fixture.Employee ana = fixture.employee(company, "Ana", List.of(site), 10);
        ApiClient admin = company.admin();
        String id = UUID.randomUUID().toString();
        String occurredAt = "2027-03-01T12:05:00Z";
        Map<String, ApiClient.Response> overCap = new LinkedHashMap<>();
        overCap.put("motive 4001", ana.client().put("/api/v1/deviations/" + id + "/motive", Map.of("category", "OTRA", "text", "m".repeat(4001))));
        overCap.put("display name 161", admin.post("/api/v1/employees", Map.of("dni", Fixture.nextDni(), "displayName", "d".repeat(161),
                "siteIds", List.of(site), "toleranceMinutes", 5)));
        overCap.put("site name 121", admin.post("/api/v1/sites", Map.of("name", "s".repeat(121), "timeZone", BA)));
        overCap.put("template name 121", admin.post("/api/v1/templates", Map.of("siteId", site, "name", "t".repeat(121),
                "blocks", List.of(Map.of("startDayOffset", 0, "start", "09:00", "end", "17:00", "endDayOffset", 0)),
                "breakfastLimitMinutes", 20, "lunchLimitMinutes", 30)));
        overCap.put("forgotten reason 2001", admin.post("/api/v1/admin/jornadas/" + id + "/forgotten-marks",
                Map.of("action", "INGRESO", "occurredAt", occurredAt, "auditReason", "f".repeat(2001))));
        overCap.put("correction reason 2001", admin.post("/api/v1/admin/marks/" + id + "/correction",
                Map.of("correctedAction", "INGRESO", "correctedOccurredAt", occurredAt, "auditReason", "c".repeat(2001))));
        overCap.put("void reason 2001", admin.post("/api/v1/admin/marks/" + id + "/void", Map.of("reason", "v".repeat(2001))));
        overCap.put("classification reason 2001", admin.put("/api/v1/admin/deviations/" + id + "/classification",
                Map.of("classification", "JUSTIFICADO", "correctionReason", "k".repeat(2001))));
        overCap.put("cancel reason 2001", admin.post("/api/v1/admin/jornadas/" + id + "/cancellation", Map.of("reason", "x".repeat(2001))));

        List<String> failures = new ArrayList<>();
        overCap.forEach((name, response) -> {
            if (response.status() != 422 || !"VALIDATION_ERROR".equals(response.code())) failures.add(name + ": " + response.status() + " " + response.code());
        });
        assertEquals(List.of(), failures);
    }

    /**
     * NUL, lone surrogates and invalid UTF-8 never reach a 5xx. Escapes go through {@code raw}; the invalid bytes need a
     * byte body, which ApiClient cannot send.
     */
    @Test
    void s22NulLoneSurrogatesAndInvalidUtf8AreNeverA5xx() throws Exception {
        Fixture.Company company = fixture.company("Bytes");
        ApiClient admin = company.admin();
        String token = admin.get("/api/v1/csrf").expect(200).body().get("token").asText();
        Map<String, String> csrf = Map.of("X-CSRF-TOKEN", token);
        Map<String, ApiClient.Response> sent = new LinkedHashMap<>();
        for (String name : List.of("only \\u0000", "lone \\ud800 high", "lone \\udc00 low", "reversed \\udc00\\ud800 pair", "nul\\u0000inside")) {
            sent.put(name, admin.raw("POST", "/api/v1/sites", JSON, "{\"name\":\"" + name + "\",\"timeZone\":\"" + BA + "\"}", csrf));
        }
        List<String> failures = new ArrayList<>();
        sent.forEach((name, response) -> {
            if (response.status() >= 500) failures.add(name + ": " + response.status());
        });
        // CHAR: a name made only of a NUL is not blank to @NotBlank and is stored (201), a lone surrogate is accepted and stored
        // as '?' by the MySQL driver, and a NUL inside a name is kept — confirm with Mateo.
        // Since #76 the cleaner removes NULs and lone surrogates before validation: "only " is trimmed to "only" (still 201),
        // and the stored names no longer carry a NUL or a '?'.
        assertEquals(201, sent.get("only \\u0000").status());
        assertEquals("only", jdbc.queryForObject("SELECT name FROM sites WHERE id=?", String.class, sent.get("only \\u0000").id().toString()));
        assertEquals(201, sent.get("lone \\ud800 high").status(), sent.get("lone \\ud800 high").raw());
        assertEquals("lone  high", jdbc.queryForObject("SELECT name FROM sites WHERE id=?", String.class, sent.get("lone \\ud800 high").id().toString()));
        assertEquals(201, sent.get("nul\\u0000inside").status());
        assertEquals("nulinside", jdbc.queryForObject("SELECT name FROM sites WHERE id=?", String.class, sent.get("nul\\u0000inside").id().toString()));

        for (String hex : List.of("c328", "eda080", "c080", "ff", "f4908080")) {
            int status = postBytes("/api/v1/session", "{\"dni\":\"20000001\",\"password\":\"x\u0001\"}", hex);
            if (status < 400 || status >= 500) failures.add("invalid UTF-8 " + hex + ": " + status);
        }
        assertEquals(List.of(), failures);
    }

    // CHAR: a site name that differs from another only by a zero-width character is a duplicate (409 CONFLICT), because
    // utf8mb4_0900_ai_ci ignores it; the unique key, not a cleaner, is what stops this look-alike — confirm with Mateo.
    // Since #76 the cleaner also removes the zero-width space, so the name is stored as "Centro" and the unique key still answers 409.
    @Test
    void s22AZeroWidthLookAlikeSiteNameIsADuplicate() {
        Fixture.Company company = fixture.company("Gemelas");
        fixture.site(company, "Centro", BA);
        ApiClient.Response twin = company.admin().post("/api/v1/sites", Map.of("name", "Cen\u200Btro", "timeZone", BA));
        assertEquals(409, twin.status(), twin.raw());
        assertEquals("CONFLICT", twin.code());
    }

    @Test
    void s22EveryTextTheAdminSeesIsCleaned() {
        Submitted submitted = submitHostileEverywhere();
        Map<String, String> seen = adminView(submitted);
        List<String> dirty = new ArrayList<>();
        for (Sent value : submitted.sent()) {
            String shown = seen.get(value.field());
            List<String> forbidden = forbidden(shown == null ? "" : shown, value.multiline());
            if (!forbidden.isEmpty()) dirty.add(value.field() + " keeps " + forbidden);
        }
        // Once cleaned, a name made only of invisible characters is blank and must be refused like any blank name.
        ApiClient.Response invisible = submitted.admin().post("/api/v1/sites", Map.of("name", "\u200B\u200D\uFEFF", "timeZone", BA));
        if (invisible.status() != 422) dirty.add("invisible-only site name answered " + invisible.status());
        assertEquals(List.of(), dirty);
    }

    // ---------------------------------------------------------------- helpers

    /** Writes a hostile value, padded to its cap, into every text the ADMIN reads; each write must succeed. */
    private Submitted submitHostileEverywhere() {
        Fixture.Company company = fixture.company("Hostil");
        List<Sent> sent = new ArrayList<>();
        String siteName = hostile("siteName", 120);
        UUID site = fixture.site(company, siteName, BA);
        String displayName = hostile("displayName", 160);
        Fixture.Employee ana = fixture.employee(company, displayName, List.of(site), 10);
        String templateName = hostile("templateName", 120);
        UUID template = fixture.template(company, site, templateName, List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        UUID jornada = fixture.declare(company, ana.id(), site, DAY, template);
        UUID tomorrow = fixture.declare(company, ana.id(), site, DAY.plusDays(1), template);
        ApiClient admin = company.admin();

        clock.set(Instant.parse("2027-03-01T12:11:00Z"));
        scheduler.createDueAbsences();
        clock.set(Instant.parse("2027-03-01T12:20:00Z"));
        String forgottenReason = hostile("forgottenReason", 2000);
        UUID ingreso = admin.post("/api/v1/admin/jornadas/" + jornada + "/forgotten-marks",
                Map.of("action", "INGRESO", "occurredAt", "2027-03-01T12:05:00Z", "auditReason", forgottenReason)).expect(201).id();
        clock.set(Instant.parse("2027-03-01T12:21:00Z"));
        String correctionReason = hostile("correctionReason", 2000);
        admin.post("/api/v1/admin/marks/" + ingreso + "/correction", Map.of("correctedAction", "INGRESO",
                "correctedOccurredAt", "2027-03-01T12:19:00Z", "auditReason", correctionReason)).expect(200);
        clock.set(Instant.parse("2027-03-01T12:22:00Z"));
        String voidReason = hostile("voidReason", 2000);
        admin.post("/api/v1/admin/marks/" + ingreso + "/void", Map.of("reason", voidReason)).expect(200);

        // The void brought SIN_INGRESO back without motive: the employee explains it, the ADMIN classifies and corrects.
        UUID deviation = UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND active=TRUE",
                String.class, jornada.toString()));
        String motive = hostile("motive", 4000);
        ana.client().put("/api/v1/deviations/" + deviation + "/motive", Map.of("category", "OTRA", "text", motive)).expect(200);
        admin.put("/api/v1/admin/deviations/" + deviation + "/classification", Map.of("classification", "JUSTIFICADO")).expect(200);
        String classificationReason = hostile("classificationReason", 2000);
        admin.put("/api/v1/admin/deviations/" + deviation + "/classification",
                Map.of("classification", "NO_JUSTIFICADO", "correctionReason", classificationReason)).expect(200);
        String cancelReason = hostile("cancelReason", 2000);
        admin.post("/api/v1/admin/jornadas/" + tomorrow + "/cancellation", Map.of("reason", cancelReason)).expect(200);

        sent.add(new Sent("motive", motive, true));
        sent.add(new Sent("displayName", displayName, false));
        sent.add(new Sent("siteName", siteName, false));
        sent.add(new Sent("templateName", templateName, false));
        sent.add(new Sent("forgottenReason", forgottenReason, true));
        sent.add(new Sent("correctionReason", correctionReason, true));
        sent.add(new Sent("voidReason", voidReason, true));
        sent.add(new Sent("classificationReason", classificationReason, true));
        sent.add(new Sent("cancelReason", cancelReason, true));
        return new Submitted(sent, admin, List.of(jornada, tomorrow));
    }

    /** Field -> the value as the ADMIN reads it back from every screen that shows it, found by its leading tag. */
    private static Map<String, String> adminView(Submitted submitted) {
        ApiClient admin = submitted.admin();
        List<JsonNode> screens = new ArrayList<>(List.of(admin.get("/api/v1/sites").expect(200).body(),
                admin.get("/api/v1/employees").expect(200).body(), admin.get("/api/v1/templates").expect(200).body(),
                admin.get("/api/v1/deviations").expect(200).body()));
        for (UUID jornada : submitted.jornadas()) {
            screens.add(admin.get("/api/v1/jornadas/" + jornada).expect(200).body());
            screens.add(admin.get("/api/v1/admin/jornadas/" + jornada + "/audit").expect(200).body());
        }
        Map<String, String> seen = new LinkedHashMap<>();
        for (Sent value : submitted.sent()) {
            String tag = "[" + value.field() + "]";
            for (JsonNode screen : screens) {
                String found = findText(screen, tag);
                if (found != null) {
                    seen.put(value.field(), found);
                    break;
                }
            }
        }
        return seen;
    }

    private static String findText(JsonNode node, String tag) {
        if (node.isTextual()) return node.asText().startsWith(tag) ? node.asText() : null;
        for (JsonNode child : node) {
            String found = findText(child, tag);
            if (found != null) return found;
        }
        return null;
    }

    private static String hostile(String field, int cap) {
        String start = "[" + field + "]" + CORE;
        return start + "x".repeat(cap - start.length());
    }

    private static List<String> forbidden(String text, boolean multiline) {
        List<String> found = new ArrayList<>();
        text.codePoints().forEach(point -> {
            boolean control = point <= 0x1F && !(multiline && point == '\n');
            boolean c1 = point >= 0x7F && point <= 0x9F;
            boolean bidi = (point >= 0x202A && point <= 0x202E) || (point >= 0x2066 && point <= 0x2069);
            boolean zeroWidth = (point >= 0x200B && point <= 0x200D) || point == 0xFEFF;
            if (control || c1 || bidi || zeroWidth) found.add(String.format("U+%04X", point));
        });
        return found;
    }

    /** Posts a JSON body in which {@code \u0001} is replaced by the given raw bytes, with a valid CSRF token. */
    private int postBytes(String path, String template, String hex) throws Exception {
        HttpClient http = HttpClient.newBuilder().cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL)).build();
        String ip = Fixture.nextIp();
        HttpResponse<String> csrf = http.send(HttpRequest.newBuilder(URI.create(baseUrl() + "/api/v1/csrf")).header("X-Forwarded-For", ip)
                .GET().build(), HttpResponse.BodyHandlers.ofString());
        String token = json.readTree(csrf.body()).get("token").asText();
        String[] parts = template.split("\u0001", -1);
        byte[] before = parts[0].getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] middle = HexFormat.of().parseHex(hex);
        byte[] after = parts[1].getBytes(java.nio.charset.StandardCharsets.UTF_8);
        byte[] body = new byte[before.length + middle.length + after.length];
        System.arraycopy(before, 0, body, 0, before.length);
        System.arraycopy(middle, 0, body, before.length, middle.length);
        System.arraycopy(after, 0, body, before.length + middle.length, after.length);
        HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create(baseUrl() + path)).header("X-Forwarded-For", ip)
                .header("Content-Type", JSON).header("X-CSRF-TOKEN", token).POST(HttpRequest.BodyPublishers.ofByteArray(body)).build(),
                HttpResponse.BodyHandlers.ofString());
        return response.statusCode();
    }
}
