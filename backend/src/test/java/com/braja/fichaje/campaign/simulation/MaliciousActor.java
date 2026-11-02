package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.ApiClient;
import com.braja.fichaje.campaign.HttpLog;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * The malicious employee (a valid Braja session poking at what is not theirs) and a brute-force attacker on Ana's DNI.
 * Every probe has a coded answer except the two known defects it also sends once a week: a malformed JSON body (S23)
 * and a mark without Idempotency-Key (S28), both 400 without code; {@link #knownUncoded} recognises exactly those.
 */
final class MaliciousActor {
    private final SimContext ctx;
    private final EmployeeActor insider;
    private final ApiClient attacker;

    MaliciousActor(SimContext ctx, EmployeeActor insider) {
        this.ctx = ctx;
        this.insider = insider;
        this.attacker = ctx.client("attacker:brute-force");
    }

    /** One probe a day from the insider's own session, rotating through foreign ids, ADMIN routes and missing CSRF. */
    void probe(int day, LocalDate date) {
        SimWorld world = ctx.world;
        SimWorld.Employee me = insider.employee;
        SimWorld.Employee ana = world.employees.get(WorldSetup.VICTIM);
        SimWorld.Site ba = world.site("BA");
        SimWorld.Jornada own = world.live(me, ba, date);
        SimWorld.Jornada anas = world.live(ana, ba, date);
        SimWorld.Jornada foreign = world.liveOn(date).stream().filter(j -> j.site.company != ba.company).findFirst().orElse(null);
        String tag = insider.tag();
        ApiClient browser = me.browser();
        switch (day % 8) {
            case 0 -> { if (foreign != null) expect(tag, "probe foreign jornada", browser.get("/api/v1/jornadas/" + foreign.id), "404 NOT_FOUND"); }
            case 1 -> { if (anas != null) expect(tag, "probe mark on a colleague's jornada", browser.mark(anas.id, "INGRESO", UUID.randomUUID()), "404 NOT_FOUND"); }
            case 2 -> expect(tag, "probe ADMIN employee list", browser.get("/api/v1/employees"), "403 FORBIDDEN");
            case 3 -> expect(tag, "probe classify", browser.put("/api/v1/admin/deviations/" + UUID.randomUUID() + "/classification",
                    Map.of("classification", "JUSTIFICADO", "correctionReason", "self-service")), "403 FORBIDDEN");
            case 4 -> { if (own != null) expect(tag, "probe mark without CSRF", browser.raw("POST", "/api/v1/jornadas/" + own.id + "/marks",
                    "application/json", "{\"action\":\"INGRESO\"}", Map.of("Idempotency-Key", UUID.randomUUID().toString())), "403 FORBIDDEN"); }
            case 5 -> expect(tag, "probe switch to a foreign company", browser.put("/api/v1/companies/active",
                    Map.of("companyId", world.companies.get(1).id())), "404 NOT_FOUND");
            case 6 -> {
                String mark = anas == null ? null : ctx.jdbc.query("SELECT id FROM mark_events WHERE jornada_id=? ORDER BY sequence_number LIMIT 1",
                        rs -> rs.next() ? rs.getString(1) : null, anas.id.toString());
                if (mark != null) expect(tag, "probe a colleague's location", browser.post("/api/v1/marks/" + mark + "/location",
                        Map.of("latitude", -34.6, "longitude", -58.38, "accuracyMeters", 5.0)), "404 NOT_FOUND");
            }
            default -> expect(tag, "probe a colleague's inbox", browser.get("/api/v1/inbox?employeeId=" + ana.membership(ba).employeeId), "403 FORBIDDEN");
        }
        if (day % 7 == 6 && own != null) {
            ApiClient.Response malformed = browser.send("POST", "/api/v1/jornadas/" + own.id + "/marks", "{\"action\":",
                    Map.of("Idempotency-Key", UUID.randomUUID().toString()));
            status(tag, "probe malformed JSON (S23)", malformed, 400);
            ApiClient.Response keyless = browser.post("/api/v1/jornadas/" + own.id + "/marks", Map.of("action", "INGRESO"));
            status(tag, "probe mark without Idempotency-Key (S28)", keyless, 400);
        }
    }

    /** 03:00: five wrong passwords lock Ana's DNI for 15 minutes; the sixth try is already refused. */
    void bruteForce() {
        String dni = ctx.world.employees.get(WorldSetup.VICTIM).dni;
        for (int attempt = 1; attempt <= 6; attempt++) {
            ApiClient.Response response = attacker.login(dni, "guess-" + attempt + "-wrong-password");
            expect("attacker", "brute-force login " + (attempt <= 5 ? "1-5" : "6"), response, attempt <= 5 ? "401 UNAUTHORIZED" : "429 TOO_MANY_REQUESTS");
        }
    }

    /** 03:05 on a locked night Ana opens the tablet: refused (CHAR: whoever knows a DNI can lock it); 03:20 it works. */
    void victimLogsIn(boolean whileLocked) {
        SimWorld.Employee ana = ctx.world.employees.get(WorldSetup.VICTIM);
        ApiClient tablet = ana.browsers.get(1);
        ApiClient.Response response = tablet.login(ana.dni, ana.password);
        expect(ana.tag() + "/tablet", whileLocked ? "victim login while locked (CHAR)" : "victim login after the lock", response,
                whileLocked ? "429 TOO_MANY_REQUESTS" : "200");
    }

    /** The two known uncoded answers above, and nothing else. */
    static boolean knownUncoded(HttpLog.Exchange exchange, String insiderTag) {
        return exchange.status() == 400 && exchange.actor().startsWith(insiderTag) && exchange.method().equals("POST")
                && exchange.path().matches("/api/v1/jornadas/[0-9a-f-]+/marks");
    }

    private void expect(String tag, String kind, ApiClient.Response response, String token) {
        ctx.ledger.expect(tag, kind, response, token);
    }

    private void status(String tag, String kind, ApiClient.Response response, int status) {
        ctx.ledger.count(kind + " " + DayLedger.token(response));
        if (response.status() != status) ctx.ledger.violation(tag, kind + ": expected HTTP " + status + " but got " + DayLedger.token(response));
        if (response.code() != null) ctx.ledger.note(tag, kind + " now carries code " + response.code() + ": the known defect may be fixed");
    }
}
