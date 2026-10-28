package com.braja.fichaje.timekeeping;

import com.braja.fichaje.security.ScopeService;
import jakarta.servlet.http.HttpSession;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

/** Issue #60 (CLAUDE.md rule 6): read path of the jornada audits; ADMIN of the jornada's company only (404 for another company). */
@RestController
@RequestMapping("/api/v1/admin/jornadas")
public class JornadaAuditController {
    private final JornadaAuditService audits;
    private final ScopeService scopes;

    public JornadaAuditController(JornadaAuditService audits, ScopeService scopes) {
        this.audits = audits;
        this.scopes = scopes;
    }

    @GetMapping("/{jornadaId}/audit")
    public JornadaAuditService.JornadaAudit audit(Authentication auth, HttpSession session, @PathVariable UUID jornadaId) {
        return audits.forJornada(scopes.requireAdmin(auth, session), jornadaId);
    }
}
