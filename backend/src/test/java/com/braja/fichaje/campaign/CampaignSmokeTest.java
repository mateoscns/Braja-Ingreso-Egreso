package com.braja.fichaje.campaign;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The campaign base works: one controllable Clock, push enabled with generated keys, a clean database. */
class CampaignSmokeTest extends CampaignTestBase {
    @Autowired ApplicationContext context;

    @Test
    void theServerReadsTheCampaignClock() {
        assertSame(clock, context.getBean(Clock.class));
        clock.set(Instant.parse("2027-04-03T12:00:00Z"));
        assertEquals(Instant.parse("2027-04-03T12:00:01Z"), clock.advance(Duration.ofSeconds(1)));
    }

    @Test
    void pushIsEnabledWithTheGeneratedVapidKey() throws Exception {
        HttpResponse<String> response = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create(baseUrl() + "/api/v1/public-config")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        JsonNode body = json.readTree(response.body());
        assertTrue(body.get("pushEnabled").asBoolean());
        assertEquals(TestKeys.VAPID_PUBLIC, body.get("vapidPublicKey").asText());
    }

    @Test
    void aCompanyBuiltThroughTheAdminApiRecordsAMarkAtTheCampaignClock() {
        Fixture.Company company = fixture.company("Smoke");
        UUID site = fixture.site(company, "Centro", "America/Argentina/Buenos_Aires");
        Fixture.Employee employee = fixture.employee(company, "Ana", List.of(site), 10);
        UUID template = fixture.template(company, site, "Mañana", List.of(Fixture.Block.sameDay("09:00", "17:00")), 20, 30);
        fixture.assign(company, employee.id(), template, LocalDate.parse("2027-03-01"));
        UUID jornada = fixture.declare(company, employee.id(), site, LocalDate.parse("2027-03-01"), null);

        clock.set(Instant.parse("2027-03-01T12:00:00Z"));
        ApiClient.Response mark = employee.client().mark(jornada, "INGRESO", UUID.randomUUID()).expect(201);

        assertEquals(Instant.parse("2027-03-01T12:00:00Z"), Instant.parse(mark.body().get("acceptedAt").asText()));
        assertEquals(Timestamp.from(Instant.parse("2027-03-01T12:00:00Z")),
                jdbc.queryForObject("SELECT recorded_at FROM mark_events WHERE jornada_id = ?", Timestamp.class, jornada.toString()));
        assertEquals(List.of(), httpLog.serverErrors());
        assertEquals(List.of(), new InvariantChecker(jdbc).always());
    }

    @Test
    void everyTestStartsFromAnEmptyDatabaseWithTheSchemaInPlace() {
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM companies", Integer.class));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM accounts", Integer.class));
        assertTrue(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE success = TRUE", Integer.class) > 20);
    }
}
