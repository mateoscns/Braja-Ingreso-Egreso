package com.braja.fichaje.api;

import org.junit.jupiter.api.Test;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.mock.web.MockHttpServletRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ApiExceptionHandlerTest {
    @Test
    void lockAcquisitionFailureIsRetryableConflict() {
        ApiExceptionHandler handler = new ApiExceptionHandler();
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setAttribute("traceId", "test-trace");

        var response = handler.lockConflict(new CannotAcquireLockException("deadlock"), request);

        assertEquals(409, response.getStatusCode().value());
        assertEquals("1", response.getHeaders().getFirst("Retry-After"));
        assertEquals("RETRYABLE_TRANSACTION_CONFLICT", response.getBody().code());
        assertEquals("test-trace", response.getBody().traceId());
    }
}
