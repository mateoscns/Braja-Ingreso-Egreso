package com.braja.fichaje.notifications;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

class SafePushPayloadFactoryTest {

    private final SafePushPayloadFactory factory = new SafePushPayloadFactory(new ObjectMapper());

    @Test
    void payloadContainsOnlyStableNavigationAndAggregatedCounts() throws Exception {
        UUID companyId = UUID.fromString("10000000-0000-0000-0000-000000000001");
        UUID siteId = UUID.fromString("20000000-0000-0000-0000-000000000002");
        Instant windowStart = Instant.parse("2026-10-16T12:00:00Z");

        SafePushPayload payload = factory.create(companyId, windowStart, List.of(new SiteCount(siteId, "Centro", 2)));
        String json = new ObjectMapper().writeValueAsString(payload);

        assertEquals(2, payload.totalCount());
        assertEquals("/admin/desvios", payload.navigation());
        assertEquals(1, payload.siteCounts().size());
        assertEquals("Centro", payload.siteCounts().getFirst().siteName());
        assertFalse(json.toLowerCase().contains("motive"));
        assertFalse(json.toLowerCase().contains("health"));
        assertFalse(json.toLowerCase().contains("location"));
        assertFalse(json.contains(companyId.toString()));
        assertFalse(json.contains("employee"));
    }

    @Test
    void stableKeyAndPushTopicRemainIdenticalForTheSameCompanyWindow() {
        UUID companyId = UUID.fromString("10000000-0000-0000-0000-000000000001");
        Instant windowStart = Instant.parse("2026-10-16T12:00:00Z");

        String first = factory.notificationKey(companyId, windowStart);
        String second = factory.notificationKey(companyId, windowStart);

        assertEquals(first, second);
        assertEquals(32, factory.pushTopic(companyId, windowStart).length());
        assertFalse(first.contains(companyId.toString()));
    }

    @Test
    void omitsPerSiteBreakdownWhenTheWebPushPayloadWouldBeTooLarge() {
        UUID companyId = UUID.fromString("10000000-0000-0000-0000-000000000001");
        List<SiteCount> counts = IntStream.range(0, 120)
                .mapToObj(index -> new SiteCount(UUID.randomUUID(), "Sede " + index, index + 1L))
                .toList();

        SafePushPayload payload = factory.create(companyId, Instant.parse("2026-10-16T12:00:00Z"), counts);

        assertEquals(0, payload.siteCounts().size());
        assertEquals(counts.stream().mapToLong(SiteCount::count).sum(), payload.totalCount());
    }
}
