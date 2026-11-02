package com.braja.fichaje.campaign;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Builds a company the way Braja would: only the company and its first ADMIN are seeded in SQL
 * (no endpoint creates companies); sites, employees, templates, assignments and jornadas go through
 * the ADMIN API, so the campaign exercises those endpoints too.
 */
public final class Fixture {
    public static final String PASSWORD = "campaign-password-1234";
    private static final AtomicInteger NEXT_DNI = new AtomicInteger(20_000_000);
    private static final AtomicInteger NEXT_IP = new AtomicInteger(1);

    public record Block(int startDayOffset, LocalTime start, LocalTime end, int endDayOffset) {
        public static Block sameDay(String start, String end) {
            return new Block(0, LocalTime.parse(start), LocalTime.parse(end), 0);
        }

        public static Block overnight(String start, String end) {
            return new Block(0, LocalTime.parse(start), LocalTime.parse(end), 1);
        }
    }

    public record Company(UUID id, String name, UUID adminAccountId, String adminDni, ApiClient admin) { }

    public record Employee(UUID id, UUID accountId, String dni, String displayName, ApiClient client) { }

    private final String baseUrl;
    private final ObjectMapper json;
    private final JdbcTemplate jdbc;
    private final PasswordEncoder passwords;
    private final MutableClock clock;
    private final HttpLog log;

    public Fixture(String baseUrl, ObjectMapper json, JdbcTemplate jdbc, PasswordEncoder passwords, MutableClock clock, HttpLog log) {
        this.baseUrl = baseUrl;
        this.json = json;
        this.jdbc = jdbc;
        this.passwords = passwords;
        this.clock = clock;
        this.log = log;
    }

    public static String nextDni() {
        return Integer.toString(NEXT_DNI.getAndIncrement());
    }

    /** A distinct documentation-range IPv4 address (RFC 5737) per simulated browser. */
    public static String nextIp() {
        int n = NEXT_IP.getAndIncrement();
        return "198.51." + ((n / 250) % 250) + "." + (n % 250 + 1);
    }

    public ApiClient client(String actor) {
        return new ApiClient(baseUrl, json, log, actor, nextIp());
    }

    public Company company(String name) {
        UUID companyId = UUID.randomUUID();
        UUID adminAccountId = UUID.randomUUID();
        String adminDni = nextDni();
        Timestamp now = Timestamp.from(clock.instant());
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)", companyId.toString(), name, now);
        jdbc.update("INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at)"
                        + " VALUES(?,?,?,?,FALSE,TRUE,?,?)",
                adminAccountId.toString(), adminDni, adminDni, passwords.encode(PASSWORD), now, now);
        jdbc.update("INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at,display_name)"
                        + " VALUES(?,?,?,'ADMIN',TRUE,?,?)",
                UUID.randomUUID().toString(), companyId.toString(), adminAccountId.toString(), now, "Admin " + name);
        ApiClient admin = client("admin:" + name);
        admin.login(adminDni, PASSWORD).expect(200);
        return new Company(companyId, name, adminAccountId, adminDni, admin);
    }

    public UUID site(Company company, String name, String timeZone) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("name", name);
        body.put("timeZone", timeZone);
        return company.admin().post("/api/v1/sites", body).expect(201).id();
    }

    public void siteCenter(Company company, UUID siteId, double latitude, double longitude, int radiusMeters) {
        company.admin().put("/api/v1/sites/" + siteId + "/location", Map.of("latitude", latitude, "longitude", longitude,
                "geofenceRadiusMeters", radiusMeters, "locationSource", "MANUAL")).expect(200);
    }

    /** Creates the employee with a temporary password, logs in and changes it, like a first day at work. */
    public Employee employee(Company company, String displayName, List<UUID> siteIds, int toleranceMinutes) {
        String dni = nextDni();
        String temporary = "temporary-pass-" + dni;
        ApiClient.Response created = company.admin().post("/api/v1/employees", Map.of("dni", dni, "displayName", displayName,
                "siteIds", siteIds, "toleranceMinutes", toleranceMinutes, "temporaryPassword", temporary)).expect(201);
        ApiClient client = client("employee:" + displayName);
        client.login(dni, temporary).expect(200);
        client.put("/api/v1/session/password", Map.of("currentPassword", temporary, "newPassword", PASSWORD)).expect(204);
        UUID accountId = UUID.fromString(jdbc.queryForObject(
                "SELECT id FROM accounts WHERE dni_normalized = ?", String.class, dni));
        return new Employee(created.id(), accountId, dni, displayName, client);
    }

    public UUID template(Company company, UUID siteId, String name, List<Block> blocks, int breakfastLimit, int lunchLimit) {
        List<Map<String, Object>> blockBodies = new ArrayList<>();
        for (Block block : blocks) {
            blockBodies.add(Map.of("startDayOffset", block.startDayOffset(), "start", block.start().toString(),
                    "end", block.end().toString(), "endDayOffset", block.endDayOffset()));
        }
        return company.admin().post("/api/v1/templates", Map.of("siteId", siteId, "name", name, "blocks", blockBodies,
                "breakfastLimitMinutes", breakfastLimit, "lunchLimitMinutes", lunchLimit)).expect(201).id();
    }

    public UUID assign(Company company, UUID employeeId, UUID templateId, LocalDate validFrom) {
        return company.admin().post("/api/v1/employees/" + employeeId + "/template-assignments",
                Map.of("templateId", templateId, "validFrom", validFrom.toString())).expect(201).id();
    }

    public UUID declare(Company company, UUID employeeId, UUID siteId, LocalDate localDate, UUID templateId) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("employeeId", employeeId);
        body.put("siteId", siteId);
        body.put("localDate", localDate.toString());
        if (templateId != null) body.put("templateId", templateId);
        return company.admin().post("/api/v1/jornadas", body).expect(201).id();
    }
}
