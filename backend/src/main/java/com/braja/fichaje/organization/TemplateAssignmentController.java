package com.braja.fichaje.organization;

import com.braja.fichaje.organization.TemplateAssignmentService.AssignmentInput;
import com.braja.fichaje.organization.TemplateAssignmentService.AssignmentView;
import com.braja.fichaje.security.ScopeService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

/** ADMIN only: template assignment history of an employee (D-20261015-02). */
@RestController
@RequestMapping("/api/v1/employees/{employeeId}/template-assignments")
public class TemplateAssignmentController {
    private final ScopeService scopes;
    private final TemplateAssignmentService assignments;

    public TemplateAssignmentController(ScopeService scopes, TemplateAssignmentService assignments) {
        this.scopes = scopes;
        this.assignments = assignments;
    }

    @GetMapping
    public List<AssignmentView> list(Authentication auth, HttpSession session, @PathVariable UUID employeeId) {
        return assignments.list(scopes.requireAdmin(auth, session).companyId(), employeeId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public AssignmentView create(Authentication auth, HttpSession session, @PathVariable UUID employeeId, @Valid @RequestBody AssignmentInput input) {
        var scope = scopes.requireAdmin(auth, session);
        return assignments.create(scope.companyId(), scope.accountId(), employeeId, input);
    }
}
