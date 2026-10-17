package com.braja.fichaje.api;

import org.springframework.http.HttpStatus;

public class ApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final Long retryAfterSeconds;

    public ApiException(HttpStatus status, String code, String detail) {
        this(status, code, detail, null);
    }

    private ApiException(HttpStatus status, String code, String detail, Long retryAfterSeconds) {
        super(detail);
        this.status = status;
        this.code = code;
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }
    public Long retryAfterSeconds() { return retryAfterSeconds; }

    public static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Resource not found"); }
    public static ApiException forbidden() { return new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "You are not authorized for this action"); }
    public static ApiException conflict(String code, String detail) { return new ApiException(HttpStatus.CONFLICT, code, detail); }
    public static ApiException invalid(String detail) { return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", detail); }
    public static ApiException tooManyRequests(long seconds) {
        return new ApiException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS", "Authentication temporarily limited", Math.max(1, seconds));
    }
}
