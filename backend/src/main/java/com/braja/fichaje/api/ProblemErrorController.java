package com.braja.fichaje.api;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Replaces Spring Boot's BasicErrorController: whatever reaches {@code /error} (an exception thrown outside Spring MVC,
 * a {@code sendError}, a filter failure) answers a Problem with the code of its status instead of Boot's
 * timestamp/error/path body (2026-11-02, #73). It never echoes the exception, its message or the original path.
 */
@RestController
public class ProblemErrorController implements ErrorController {
    @RequestMapping("${server.error.path:${error.path:/error}}")
    ResponseEntity<Problem> error(HttpServletRequest request) {
        int status = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE) instanceof Integer code && code >= 400 && code <= 599 ? code : 500;
        return ResponseEntity.status(status).contentType(Problem.MEDIA_TYPE)
                .body(Problem.of(status, ProblemCodes.forStatus(status), ProblemCodes.detailFor(status), request));
    }
}
