package com.braja.fichaje.api;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.lang.Nullable;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Every error of a request that reaches Spring MVC answers application/problem+json with a stable code and a traceId.
 * Spring MVC's own exceptions (unreadable body, missing header or parameter, wrong method, media type, unknown route)
 * come through {@link ResponseEntityExceptionHandler} with their standard status (2026-11-02, #73: they fell through to
 * Spring Boot's /error body without code). Details are fixed text: never an exception message or request data.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger LOGGER = LoggerFactory.getLogger(ApiExceptionHandler.class);
    private static final String IDEMPOTENCY_KEY = "Idempotency-Key";

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Problem> handle(ApiException ex, HttpServletRequest request) {
        ResponseEntity<Problem> response = response(ex.status(), ex.code(), ex.getMessage(), request);
        if (ex.retryAfterSeconds() == null) return response;
        return ResponseEntity.status(ex.status()).header("Retry-After", Long.toString(ex.retryAfterSeconds()))
                .contentType(Problem.MEDIA_TYPE)
                .body(problem(ex.status(), ex.code(), ex.getMessage(), request));
    }

    @ExceptionHandler({IllegalArgumentException.class, MethodArgumentTypeMismatchException.class})
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
                .contentType(Problem.MEDIA_TYPE)
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

    /** Bean validation of a request body keeps the API's 422 VALIDATION_ERROR (it was an explicit handler before #73). */
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex, HttpHeaders headers,
                                                                  HttpStatusCode status, WebRequest request) {
        HttpStatus unprocessable = HttpStatus.UNPROCESSABLE_ENTITY;
        return handleExceptionInternal(ex, problem(unprocessable, "VALIDATION_ERROR", "Request validation failed", servletRequest(request)),
                new HttpHeaders(), unprocessable, request);
    }

    /** Every Spring MVC exception ends here: its status and headers (Allow, Accept) are kept, its body becomes our Problem. */
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, @Nullable Object body, HttpHeaders headers,
                                                             HttpStatusCode statusCode, WebRequest request) {
        Problem problem = body instanceof Problem own ? own : frameworkProblem(ex, statusCode, servletRequest(request));
        if (statusCode.is5xxServerError()) LOGGER.error("Request failed with {} {}", statusCode.value(), ex.getClass().getName(), ex);
        HttpHeaders problemHeaders = new HttpHeaders();
        problemHeaders.putAll(headers);
        problemHeaders.setContentType(Problem.MEDIA_TYPE);
        return super.handleExceptionInternal(ex, problem, problemHeaders, statusCode, request);
    }

    private Problem frameworkProblem(Exception ex, HttpStatusCode status, HttpServletRequest request) {
        if (ex instanceof MissingRequestHeaderException missing && IDEMPOTENCY_KEY.equalsIgnoreCase(missing.getHeaderName())) {
            return problem(status, "IDEMPOTENCY_KEY_REQUIRED", "The Idempotency-Key header is required", request);
        }
        if (ex instanceof HttpMessageNotReadableException) {
            return problem(status, "MALFORMED_REQUEST", "The request body is missing or is not valid JSON for this operation", request);
        }
        if (ex instanceof MissingServletRequestParameterException missing) {
            // The parameter name comes from the controller declaration, never from the request.
            return problem(status, "MISSING_PARAMETER", "The query parameter " + missing.getParameterName() + " is required", request);
        }
        if (ex instanceof HttpRequestMethodNotSupportedException) {
            return problem(status, "METHOD_NOT_ALLOWED", ProblemCodes.detailFor(405), request);
        }
        if (ex instanceof HttpMediaTypeNotSupportedException) {
            return problem(status, "UNSUPPORTED_MEDIA_TYPE", ProblemCodes.detailFor(415), request);
        }
        if (ex instanceof HttpMediaTypeNotAcceptableException) {
            return problem(status, "NOT_ACCEPTABLE", ProblemCodes.detailFor(406), request);
        }
        if (ex instanceof NoResourceFoundException || ex instanceof NoHandlerFoundException) {
            return problem(status, "NOT_FOUND", ProblemCodes.detailFor(404), request);
        }
        return problem(status, ProblemCodes.forStatus(status.value()), ProblemCodes.detailFor(status.value()), request);
    }

    private static HttpServletRequest servletRequest(WebRequest request) {
        return request instanceof ServletWebRequest servlet ? servlet.getRequest() : null;
    }

    private ResponseEntity<Problem> response(HttpStatus status, String code, String detail, HttpServletRequest request) {
        return ResponseEntity.status(status).contentType(Problem.MEDIA_TYPE).body(problem(status, code, detail, request));
    }

    private Problem problem(HttpStatusCode status, String code, String detail, HttpServletRequest request) {
        return Problem.of(status.value(), code, detail, request);
    }
}
