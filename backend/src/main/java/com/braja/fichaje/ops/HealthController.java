package com.braja.fichaje.ops;

import com.braja.fichaje.api.ApiException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Health gate for {@code deploy/deploy.sh} and the container healthchecks (CLAUDE.md rule 32), without actuator or any new
 * dependency. Anonymous and data-free: it answers only whether this process can run a query on MySQL. A database
 * failure is 503 {@code DATABASE_UNAVAILABLE} through {@link ApiException}, so the problem body keeps the API format.
 */
@RestController
public class HealthController {
    static final String DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE";
    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/api/v1/health")
    public ResponseEntity<Map<String, String>> health() {
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
        } catch (DataAccessException ex) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, DATABASE_UNAVAILABLE, "Database unavailable");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("status", "UP"));
    }
}
