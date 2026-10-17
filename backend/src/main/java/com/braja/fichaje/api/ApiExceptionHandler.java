package com.braja.fichaje.api;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.net.URI;
import java.util.UUID;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<Problem> handle(ApiException ex, HttpServletRequest request) {
        ResponseEntity<Problem> response = response(ex.status(), ex.code(), ex.getMessage(), request);
        if (ex.retryAfterSeconds() == null) return response;
        return ResponseEntity.status(ex.status()).header("Retry-After", Long.toString(ex.retryAfterSeconds()))
                .contentType(MediaType.valueOf("application/problem+json"))
                .body(problem(ex.status(), ex.code(), ex.getMessage(), request));
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, IllegalArgumentException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<Problem> invalid(Exception ex, HttpServletRequest request) {
        return response(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", "Request validation failed", request);
    }

    @ExceptionHandler(DuplicateKeyException.class)
    ResponseEntity<Problem> duplicate(DuplicateKeyException ex, HttpServletRequest request) {
        return response(HttpStatus.CONFLICT, "CONFLICT", "The requested resource conflicts with an existing record", request);
    }

    @ExceptionHandler(PessimisticLockingFailureException.class)
    ResponseEntity<Problem> lockConflict(PessimisticLockingFailureException ex, HttpServletRequest request) {
        HttpStatus status = HttpStatus.CONFLICT;
        return ResponseEntity.status(status).header("Retry-After", "1")
                .contentType(MediaType.valueOf("application/problem+json"))
                .body(problem(status, "RETRYABLE_TRANSACTION_CONFLICT",
                        "The operation conflicted with another transaction; retry the request", request));
    }

    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<Problem> denied(Exception ex, HttpServletRequest request) {
        return response(HttpStatus.FORBIDDEN, "FORBIDDEN", "You are not authorized for this action", request);
    }

    @ExceptionHandler({
            com.braja.fichaje.notifications.InvalidPushSubscriptionException.class,
            com.braja.fichaje.notifications.PushFeatureDisabledException.class
    })
    ResponseEntity<Problem> pushValidation(Exception ex, HttpServletRequest request) {
        return response(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", ex.getMessage(), request);
    }

    private ResponseEntity<Problem> response(HttpStatus status, String code, String detail, HttpServletRequest request) {
        return ResponseEntity.status(status).contentType(MediaType.valueOf("application/problem+json")).body(problem(status, code, detail, request));
    }

    private Problem problem(HttpStatus status, String code, String detail, HttpServletRequest request) {
        return new Problem(URI.create("about:blank"), status.getReasonPhrase(), status.value(), detail, code,
                request.getAttribute("traceId") instanceof String id ? id : UUID.randomUUID().toString());
    }
}
