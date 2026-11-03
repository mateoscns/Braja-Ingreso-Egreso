package com.braja.fichaje.api;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** RFC 9457 problem body: every 4xx and 5xx of the API carries a stable {@code code} and a {@code traceId} (#73). */
public record Problem(URI type, String title, int status, String detail, String code, String traceId) {
    public static final MediaType MEDIA_TYPE = MediaType.valueOf("application/problem+json");
    private static final URI BLANK = URI.create("about:blank");
    private static final ObjectMapper JSON = new ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL);

    /** The traceId is a random UUID unless the request already carries one; it never correlates with personal data. */
    public static Problem of(int status, String code, String detail, HttpServletRequest request) {
        HttpStatus known = HttpStatus.resolve(status);
        String title = known == null ? "Error" : known.getReasonPhrase();
        Object traceId = request == null ? null : request.getAttribute("traceId");
        return new Problem(BLANK, title, status, detail, code, traceId instanceof String id ? id : UUID.randomUUID().toString());
    }

    /**
     * Writes the problem outside Spring MVC, for the security filter chain (2026-11-02, #73: its problems were written
     * by hand and carried no traceId).
     */
    public static void write(HttpServletRequest request, HttpServletResponse response, int status, String code, String detail) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType(MEDIA_TYPE.toString());
        response.getWriter().write(JSON.writeValueAsString(of(status, code, detail, request)));
    }
}
