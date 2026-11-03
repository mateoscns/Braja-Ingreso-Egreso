package com.braja.fichaje.campaign;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** S1, S4, S5: every server-written time follows the Clock bean; the clock going back cannot reorder marks. */
class ClockSpecTest extends CampaignTestBase {
    private static final LocalDate DAY = LocalDate.parse("2027-03-01");
    /** 09:00 in Buenos Aires. */
    private static final Instant START = Instant.parse("2027-03-01T12:00:00Z");

    private Fixture.Company company;
    private UUID site;
    private Fixture.Employee employee;
    private UUID template;

    @BeforeEach
    void company() {
        company = fixture.company("Reloj");
        site = fixture.site(company, "Centro", "America/Argentina/Buenos_Aires");
        employee = fixture.employee(company, "Ana", List.of(site), 10);
        template = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
    }

    @Test
    void s1AdminWritesCarryTheCampaignClock() {
        Instant declaredAt = Instant.parse("2027-02-27T15:04:05.123456Z");
        clock.set(declaredAt);
        UUID jornada = fixture.declare(company, employee.id(), site, DAY, template);
        assertEquals(Timestamp.from(declaredAt),
                jdbc.queryForObject("SELECT created_at FROM jornadas WHERE id = ?", Timestamp.class, jornada.toString()));

        Instant movedAt = Instant.parse("2027-02-28T10:00:00Z");
        clock.set(movedAt);
        fixture.siteCenter(company, site, -34.6037, -58.3816, 100);
        ApiClient.Response audit = company.admin().get("/api/v1/sites/" + site + "/location-audit").expect(200);
        assertEquals(movedAt, Instant.parse(audit.body().get("entries").get(0).get("changedAt").asText()));
    }

    @Test
    void s4AClockThatGoesBackBehindTheLastMarkIsRejectedAndStoresNothing() {
        UUID jornada = fixture.declare(company, employee.id(), site, DAY, template);
        clock.set(START.plus(Duration.ofMinutes(30)));
        employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);

        clock.set(START.plus(Duration.ofMinutes(10)));
        ApiClient.Response egreso = employee.client().mark(jornada, "EGRESO", UUID.randomUUID());

        assertEquals(409, egreso.status());
        assertEquals("INVALID_MARK_ORDER", egreso.code());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mark_events WHERE jornada_id = ?", Integer.class, jornada.toString()));
        assertEquals("EN_CURSO", jdbc.queryForObject("SELECT state FROM jornadas WHERE id = ?", String.class, jornada.toString()));
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
    }

    @Test
    void s4TheSameMarkIsAcceptedOnceTheClockCatchesUp() {
        UUID jornada = fixture.declare(company, employee.id(), site, DAY, template);
        clock.set(START.plus(Duration.ofMinutes(30)));
        employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);
        clock.set(START.plus(Duration.ofMinutes(10)));
        UUID key = UUID.randomUUID();
        assertEquals("INVALID_MARK_ORDER", employee.client().mark(jornada, "EGRESO", key).code());

        clock.set(START.plus(Duration.ofHours(8)));
        ApiClient.Response retry = employee.client().mark(jornada, "EGRESO", key).expect(201);

        assertEquals(START.plus(Duration.ofHours(8)), Instant.parse(retry.body().get("acceptedAt").asText()));
    }

    /** S5, documented exception: Spring Session expires on the real clock, so simulated days never log anyone out. */
    @Test
    void s5SessionExpiryIgnoresTheCampaignClock() {
        clock.advance(Duration.ofMinutes(31));
        employee.client().get("/api/v1/session").expect(200);
        clock.advance(Duration.ofDays(90));
        employee.client().get("/api/v1/session").expect(200);
        company.admin().put("/api/v1/companies/active", Map.of("companyId", company.id())).expect(200);
    }
}
