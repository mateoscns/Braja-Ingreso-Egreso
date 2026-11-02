package com.braja.fichaje.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.RequestDispatcher;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.servlet.NoHandlerFoundException;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ApiExceptionHandlerTest {
    private static final String SECRET = "secret-from-the-request-12345678";
    private static final MediaType PROBLEM = MediaType.valueOf("application/problem+json");

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void lockAcquisitionFailureIsRetryableConflict() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute("traceId", "test-trace");

        var response = handler.lockConflict(new CannotAcquireLockException("deadlock"), request);

        assertEquals(409, response.getStatusCode().value());
        assertEquals("1", response.getHeaders().getFirst("Retry-After"));
        assertEquals("RETRYABLE_TRANSACTION_CONFLICT", response.getBody().code());
        assertEquals("test-trace", response.getBody().traceId());
    }

    /** 2026-11-02, #73: a mark without Idempotency-Key answered Spring Boot's 400 body without code. */
    @Test
    void missingIdempotencyKeyIsA400ProblemWithItsOwnCode() throws Exception {
        assertEquals("IDEMPOTENCY_KEY_REQUIRED", problem(new MissingRequestHeaderException("Idempotency-Key", parameter()), 400).code());
    }

    /** 2026-11-02, #73: these fell through to Spring Boot's /error body, without problem+json, code or traceId. */
    @Test
    void frameworkErrorsKeepTheirStatusAndGetAStableCodeWithoutLeakingTheExceptionMessage() {
        assertEquals("MALFORMED_REQUEST", problem(new HttpMessageNotReadableException(SECRET, new MockHttpInputMessage(new byte[0])), 400).code());
        assertEquals("MISSING_PARAMETER", problem(new MissingServletRequestParameterException("from", "LocalDate"), 400).code());
        assertEquals("METHOD_NOT_ALLOWED", problem(new HttpRequestMethodNotSupportedException("DELETE", List.of("GET", "POST")), 405).code());
        assertEquals("UNSUPPORTED_MEDIA_TYPE", problem(new HttpMediaTypeNotSupportedException(SECRET), 415).code());
        assertEquals("NOT_FOUND", problem(new NoHandlerFoundException("GET", "/api/v1/" + SECRET, new HttpHeaders()), 404).code());
    }

    @Test
    void wrongMethodKeepsTheAllowHeader() {
        ResponseEntity<Object> response = handle(new HttpRequestMethodNotSupportedException("DELETE", List.of("GET", "POST")));
        assertEquals(Set.of(HttpMethod.GET, HttpMethod.POST), response.getHeaders().getAllow());
        assertEquals(PROBLEM, response.getHeaders().getContentType());
    }

    /** Body validation answered 422 VALIDATION_ERROR before #73 moved the handler onto ResponseEntityExceptionHandler. */
    @Test
    void invalidBodyStillAnswers422ValidationError() throws Exception {
        var invalid = new MethodArgumentNotValidException(parameter(), new BeanPropertyBindingResult(new Object(), "input"));
        assertEquals("VALIDATION_ERROR", problem(invalid, 422).code());
    }

    @Test
    void anythingThatReachesTheErrorPathIsAProblemWithTheCodeOfItsStatus() {
        for (int status : new int[]{400, 401, 403, 404, 405, 415, 500, 503}) {
            MockHttpServletRequest request = new MockHttpServletRequest();
            request.setAttribute(RequestDispatcher.ERROR_STATUS_CODE, status);
            request.setAttribute(RequestDispatcher.ERROR_MESSAGE, SECRET);
            ResponseEntity<Problem> response = new ProblemErrorController().error(request);
            assertEquals(status, response.getStatusCode().value());
            assertEquals(PROBLEM, response.getHeaders().getContentType());
            assertEquals(ProblemCodes.forStatus(status), response.getBody().code());
            assertNotNull(response.getBody().traceId());
            assertFalse(response.getBody().detail().contains(SECRET));
        }
        assertEquals("MALFORMED_REQUEST", ProblemCodes.forStatus(400));
        assertEquals("UNAUTHORIZED", ProblemCodes.forStatus(401));
        assertEquals("INTERNAL_ERROR", ProblemCodes.forStatus(500));
        assertEquals(500, new ProblemErrorController().error(new MockHttpServletRequest()).getStatusCode().value());
    }

    /** 2026-11-02, #73: the security filter wrote its problems by hand, without traceId. */
    @Test
    void problemsWrittenOutsideSpringMvcCarryATraceId() throws Exception {
        MockHttpServletResponse response = new MockHttpServletResponse();
        Problem.write(new MockHttpServletRequest(), response, 401, "SESSION_EXPIRED", "Session expired");
        assertEquals(401, response.getStatus());
        assertTrue(response.getContentType().startsWith("application/problem+json"), response.getContentType());
        JsonNode body = new ObjectMapper().readTree(response.getContentAsString());
        assertEquals("SESSION_EXPIRED", body.get("code").asText());
        assertEquals("Unauthorized", body.get("title").asText());
        assertEquals("about:blank", body.get("type").asText());
        assertFalse(body.get("traceId").asText().isBlank());
    }

    private Problem problem(Exception ex, int status) {
        ResponseEntity<Object> response = handle(ex);
        assertEquals(status, response.getStatusCode().value());
        assertEquals(PROBLEM, response.getHeaders().getContentType());
        Problem problem = assertInstanceOf(Problem.class, response.getBody());
        assertEquals(status, problem.status());
        assertNotNull(problem.traceId());
        assertFalse(problem.detail().contains(SECRET), problem.detail());
        return problem;
    }

    private ResponseEntity<Object> handle(Exception ex) {
        try {
            return handler.handleException(ex, new ServletWebRequest(new MockHttpServletRequest(), new MockHttpServletResponse()));
        } catch (Exception unexpected) {
            throw new AssertionError(unexpected);
        }
    }

    private static MethodParameter parameter() throws NoSuchMethodException {
        return new MethodParameter(Object.class.getMethod("equals", Object.class), 0);
    }
}
