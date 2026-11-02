package com.braja.fichaje.api;

/**
 * The code of a problem that no handler named more precisely: the security filter's {@code /error} dispatches, a
 * {@code sendError} and framework exceptions without a mapping of their own. Existing codes are reused per status
 * (2026-11-02, #73: these responses had no code and Spring Boot's error body instead of problem+json).
 */
public final class ProblemCodes {
    private ProblemCodes() { }

    public static String forStatus(int status) {
        return switch (status) {
            case 401 -> "UNAUTHORIZED";
            case 403 -> "FORBIDDEN";
            case 404 -> "NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            case 406 -> "NOT_ACCEPTABLE";
            case 409 -> "CONFLICT";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            case 422 -> "VALIDATION_ERROR";
            case 429 -> "TOO_MANY_REQUESTS";
            case 503 -> "SERVICE_UNAVAILABLE";
            default -> status >= 400 && status < 500 ? "MALFORMED_REQUEST" : "INTERNAL_ERROR";
        };
    }

    /** A neutral detail per status: never an exception message, a stack trace or request data. */
    public static String detailFor(int status) {
        return switch (status) {
            case 401 -> "Authentication required";
            case 403 -> "You are not authorized for this action";
            case 404 -> "Resource not found";
            case 405 -> "The HTTP method is not supported for this route";
            case 406 -> "The requested representation is not available; accept application/json";
            case 409 -> "The request conflicts with the current state";
            case 415 -> "The request Content-Type is not supported; send application/json";
            case 422 -> "Request validation failed";
            case 429 -> "Too many requests";
            case 503 -> "The service is temporarily unavailable";
            default -> status >= 400 && status < 500 ? "The request is malformed" : "The request could not be processed";
        };
    }
}
