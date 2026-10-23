package com.braja.fichaje.deviations;

import com.braja.fichaje.security.ScopeService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class DeviationController {
    private final DeviationService deviations;
    private final ScopeService scopes;

    public DeviationController(DeviationService deviations, ScopeService scopes) {
        this.deviations = deviations;
        this.scopes = scopes;
    }

    @GetMapping("/deviations")
    public List<DeviationService.DeviationView> list(Authentication authentication, HttpSession session,
            @RequestParam(required=false) LocalDate from, @RequestParam(required=false) LocalDate to,
            @RequestParam(required=false) UUID siteId) {
        var scope = scopes.require(authentication, session);
        return deviations.list(authentication, scope, from, to, siteId);
    }

    @PutMapping("/deviations/{deviationId}/motive")
    public DeviationService.DeviationView motive(Authentication authentication, HttpSession session, @PathVariable UUID deviationId,
                                                  @Valid @RequestBody MotiveInput input) {
        var scope = scopes.require(authentication, session);
        return deviations.saveMotive(authentication, scope, deviationId, input.category(), input.text());
    }

    @PutMapping("/admin/deviations/{deviationId}/classification")
    public DeviationService.DeviationView classify(Authentication authentication, HttpSession session, @PathVariable UUID deviationId,
                                                    @Valid @RequestBody ClassificationInput input) {
        var scope = scopes.requireAdmin(authentication, session);
        return deviations.classify(scope, deviationId, input.classification(), input.correctionReason());
    }

    @GetMapping("/inbox")
    public DeviationService.InboxPage inbox(Authentication authentication, HttpSession session,
                                             @RequestParam(required=false) String cursor, @RequestParam(defaultValue="50") int limit,
                                             @RequestParam(required=false) UUID employeeId, @RequestParam(required=false) UUID siteId,
                                             @RequestParam(required=false) LocalDate from, @RequestParam(required=false) LocalDate to) {
        return deviations.inbox(scopes.require(authentication, session), cursor, limit, new DeviationService.InboxFilter(employeeId, siteId, from, to));
    }

    public record MotiveInput(@NotBlank String category, @NotBlank @Size(max=4000) String text) { }
    public record ClassificationInput(@NotBlank String classification, @Size(max=2000) String correctionReason) { }
}
