package com.braja.fichaje.timekeeping;

import com.braja.fichaje.security.ScopeService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class MarkController {
    private final ScopeService scopes;
    private final MarkService marks;

    public MarkController(ScopeService scopes, MarkService marks) {
        this.scopes = scopes;
        this.marks = marks;
    }

    @PostMapping("/jornadas/{jornadaId}/marks")
    public ResponseEntity<JornadaController.MarkView> record(Authentication auth, HttpSession session, @PathVariable UUID jornadaId,
            @RequestHeader("Idempotency-Key") UUID idempotencyKey, @Valid @RequestBody MarkInput input) {
        // The service reads the server clock once the account, membership and jornada locks are held (rule 1, D-20261015-06).
        var result = marks.recordEmployeeMark(scopes.require(auth, session), jornadaId, MarkAction.valueOf(input.action()), idempotencyKey, Clock.systemUTC());
        return ResponseEntity.status(result.replay() ? HttpStatus.OK : HttpStatus.CREATED).body(result.mark());
    }

    @GetMapping("/marks/{markId}")
    public JornadaController.MarkView get(Authentication auth, HttpSession session, @PathVariable UUID markId) {
        return marks.getMark(scopes.require(auth, session), markId);
    }

    @PostMapping("/marks/{markId}/location")
    public ResponseEntity<MarkService.LocationResult> location(Authentication auth, HttpSession session, @PathVariable UUID markId,
            @Valid @RequestBody LocationInput input) {
        Instant receivedAt = Instant.now();
        var result = marks.attachLocation(scopes.require(auth, session), markId, input.latitude(), input.longitude(), input.accuracyMeters(), receivedAt);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(result);
    }

    @PostMapping("/admin/jornadas/{jornadaId}/forgotten-marks")
    @ResponseStatus(HttpStatus.CREATED)
    public JornadaController.MarkView forgotten(Authentication auth, HttpSession session, @PathVariable UUID jornadaId,
            @Valid @RequestBody ForgottenMarkInput input) {
        var scope = scopes.requireAdmin(auth, session);
        return marks.forgottenMark(scope, jornadaId, MarkAction.valueOf(input.action()), input.occurredAt(), input.auditReason());
    }

    @PostMapping("/admin/marks/{markId}/correction")
    public JornadaController.MarkView correct(Authentication auth, HttpSession session, @PathVariable UUID markId,
            @Valid @RequestBody CorrectionInput input) {
        var scope = scopes.requireAdmin(auth, session);
        return marks.correctMark(scope, markId, MarkAction.valueOf(input.correctedAction()), input.correctedOccurredAt(), input.auditReason());
    }

    public record MarkInput(@NotBlank String action) { }
    public record LocationInput(@NotNull @DecimalMin("-90.0") @DecimalMax("90.0") Double latitude,
                                @NotNull @DecimalMin("-180.0") @DecimalMax("180.0") Double longitude,
                                @NotNull @DecimalMin("0.0") @DecimalMax("100000.0") Double accuracyMeters) { }
    public record ForgottenMarkInput(@NotBlank String action, @NotNull Instant occurredAt, @NotBlank @Size(max=2000) String auditReason) { }
    public record CorrectionInput(@NotBlank String correctedAction, @NotNull Instant correctedOccurredAt, @NotBlank @Size(max=2000) String auditReason) { }
}
