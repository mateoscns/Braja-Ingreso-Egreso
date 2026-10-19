package com.braja.fichaje.notifications;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public final class SafePushPayloadFactory {

    private static final String NAVIGATION = "/admin/desvios";
    private static final int MAX_PAYLOAD_BYTES = 3000;
    private final ObjectMapper objectMapper;

    public SafePushPayloadFactory(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public SafePushPayload create(UUID companyId, Instant windowStart, List<SiteCount> siteCounts) {
        long totalCount = siteCounts.stream().mapToLong(SiteCount::count).sum();
        String body = totalCount == 1 ? "Hay 1 desvío nuevo para revisar."
                : "Hay " + totalCount + " desvíos nuevos para revisar.";
        SafePushPayload payload = new SafePushPayload(notificationKey(companyId, windowStart),
                "Desvíos de fichaje", body, NAVIGATION, totalCount, List.copyOf(siteCounts));
        if (serializedSize(payload) > MAX_PAYLOAD_BYTES) {
            return new SafePushPayload(payload.tag(), payload.title(), payload.body(), payload.navigation(),
                    totalCount, List.of());
        }
        return payload;
    }

    public String toJson(SafePushPayload payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("No se pudo generar el contenido seguro de la notificación.", ex);
        }
    }

    public String notificationKey(UUID companyId, Instant windowStart) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String input = companyId + ":" + windowStart.toString();
            return Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(digest.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 no está disponible.", ex);
        }
    }

    public String pushTopic(UUID companyId, Instant windowStart) {
        return notificationKey(companyId, windowStart).substring(0, 32);
    }

    private int serializedSize(SafePushPayload payload) {
        try {
            return objectMapper.writeValueAsBytes(payload).length;
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("No se pudo generar el contenido seguro de la notificación.", ex);
        }
    }
}
