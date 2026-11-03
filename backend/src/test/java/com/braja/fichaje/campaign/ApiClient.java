package com.braja.fichaje.campaign;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.MissingNode;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * One browser: its own cookie jar (BRAJA_SESSION), CSRF token in memory like the PWA, and its own client IP
 * through X-Forwarded-For (the campaign trusts 127.0.0.1 as the proxy). Every exchange goes to the HttpLog.
 */
public final class ApiClient {
    public record Response(int status, JsonNode body, String raw, String code, Map<String, List<String>> headers) {
        public Response expect(int expected) {
            if (status != expected) throw new AssertionError("expected HTTP " + expected + " but got " + status + ": " + raw);
            return this;
        }

        /** First value of a response header, case-insensitive, or null. */
        public String header(String name) {
            for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
                if (entry.getKey().equalsIgnoreCase(name) && !entry.getValue().isEmpty()) return entry.getValue().getFirst();
            }
            return null;
        }

        public UUID id() {
            return UUID.fromString(body.get("id").asText());
        }
    }

    private static final Duration TIMEOUT = Duration.ofSeconds(30);

    private final String baseUrl;
    private final ObjectMapper json;
    private final HttpLog log;
    private final String actor;
    private final String clientIp;
    private final HttpClient http;
    private String csrfToken;

    public ApiClient(String baseUrl, ObjectMapper json, HttpLog log, String actor, String clientIp) {
        this.baseUrl = baseUrl;
        this.json = json;
        this.log = log;
        this.actor = actor;
        this.clientIp = clientIp;
        this.http = HttpClient.newBuilder()
                .cookieHandler(new CookieManager(null, CookiePolicy.ACCEPT_ALL))
                .connectTimeout(TIMEOUT)
                .build();
    }

    public String actor() {
        return actor;
    }

    /** Logs in and refreshes the CSRF token, which the login rotates (rule 24). */
    public Response login(String dni, String password) {
        Response response = post("/api/v1/session", Map.of("dni", dni, "password", password));
        csrfToken = null;
        return response;
    }

    public Response get(String path) {
        return send("GET", path, null, Map.of());
    }

    public Response post(String path, Object body) {
        return send("POST", path, body, Map.of());
    }

    public Response put(String path, Object body) {
        return send("PUT", path, body, Map.of());
    }

    public Response patch(String path, Object body) {
        return send("PATCH", path, body, Map.of());
    }

    public Response delete(String path) {
        return send("DELETE", path, null, Map.of());
    }

    public Response mark(UUID jornadaId, String action, UUID idempotencyKey) {
        return send("POST", "/api/v1/jornadas/" + jornadaId + "/marks", Map.of("action", action),
                Map.of("Idempotency-Key", idempotencyKey.toString()));
    }

    /** Sends exactly what it is given: no CSRF unless the headers carry it. For abuse tests. */
    public Response raw(String method, String path, String contentType, String body, Map<String, String> headers) {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(baseUrl + path)).timeout(TIMEOUT)
                .header("X-Forwarded-For", clientIp)
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (contentType != null) request.header("Content-Type", contentType);
        headers.forEach(request::header);
        return execute(method, path, request.build());
    }

    public Response send(String method, String path, Object body, Map<String, String> headers) {
        Map<String, String> all = new LinkedHashMap<>(headers);
        if (!method.equals("GET")) all.putIfAbsent("X-CSRF-TOKEN", csrf());
        String payload = body == null ? null : write(body);
        return raw(method, path, payload == null ? null : "application/json", payload, all);
    }

    private String csrf() {
        if (csrfToken == null) {
            Response response = get("/api/v1/csrf").expect(200);
            csrfToken = response.body().get("token").asText();
        }
        return csrfToken;
    }

    private Response execute(String method, String path, HttpRequest request) {
        try {
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            String raw = response.body();
            JsonNode body = raw == null || raw.isBlank() ? MissingNode.getInstance() : parse(raw);
            String code = body.hasNonNull("code") ? body.get("code").asText() : null;
            log.record(new HttpLog.Exchange(actor, method, path, response.statusCode(), code, raw));
            return new Response(response.statusCode(), body, raw, code, response.headers().map());
        } catch (IOException ex) {
            throw new UncheckedIOException(actor + " " + method + " " + path, ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(ex);
        }
    }

    private JsonNode parse(String raw) {
        try {
            return json.readTree(raw);
        } catch (IOException ex) {
            return MissingNode.getInstance();
        }
    }

    private String write(Object body) {
        try {
            return body instanceof String text ? text : json.writeValueAsString(body);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }
}
