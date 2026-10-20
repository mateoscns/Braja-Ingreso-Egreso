package com.braja.fichaje.security;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.config.BrajaProperties;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class SessionController {
    private final AccountService accounts;
    private final CurrentActor actor;
    private final JdbcTemplate jdbc;
    private final CsrfTokenRepository csrfRepository;
    private final BrajaProperties properties;

    public SessionController(AccountService accounts, CurrentActor actor, JdbcTemplate jdbc, CsrfTokenRepository csrfRepository, BrajaProperties properties) {
        this.accounts = accounts;
        this.actor = actor;
        this.jdbc = jdbc;
        this.csrfRepository = csrfRepository;
        this.properties = properties;
    }

    @GetMapping("/public-config")
    public PublicConfig publicConfig() {
        return new PublicConfig(properties.isPushEnabled(), properties.isPushEnabled() ? properties.getVapidPublicKey() : null);
    }

    @GetMapping("/csrf")
    public Map<String, String> csrf(CsrfToken token, HttpServletRequest request, HttpServletResponse response) {
        String value = token.getToken();
        response.addHeader("Set-Cookie", "BRAJA_CSRF=" + value + "; Path=/; SameSite=Lax" + (properties.isSessionCookieSecure() ? "; Secure" : ""));
        return Map.of("token", value);
    }

    @GetMapping("/session")
    public AccountService.SessionView getSession(Authentication authentication, HttpServletRequest request) {
        return accounts.session(actor.accountId(authentication), request);
    }

    @PostMapping("/session")
    public AccountService.SessionView login(@Valid @RequestBody LoginInput input, HttpServletRequest request, HttpServletResponse response) {
        return accounts.login(input.dni(), input.password(), request, response);
    }

    @PutMapping("/session/password")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void changePassword(Authentication authentication, HttpSession session, @Valid @RequestBody ChangePasswordInput input) {
        accounts.changePassword(actor.accountId(authentication), input.currentPassword(), input.newPassword(), session.getId());
    }

    @DeleteMapping("/session")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(HttpServletRequest request, HttpServletResponse response) { accounts.invalidateSession(request, response); }

    @GetMapping("/companies")
    public java.util.List<AccountService.MembershipView> companies(Authentication authentication) {
        return accounts.memberships(actor.accountId(authentication));
    }

    @PutMapping("/companies/active")
    public AccountService.SessionView selectCompany(Authentication authentication, HttpSession session, HttpServletRequest request,
                                                     @Valid @RequestBody ActiveCompanyInput input) {
        UUID accountId = actor.accountId(authentication);
        if (accounts.memberships(accountId).stream().noneMatch(m -> m.companyId().equals(input.companyId()))) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Membership not found");
        }
        session.setAttribute(CurrentActor.ACTIVE_COMPANY_SESSION_KEY, input.companyId());
        return accounts.session(accountId, request);
    }

    public record LoginInput(@NotBlank @Size(min = 7, max = 12) String dni, @NotBlank @Size(max = 256) String password) { }
    public record ChangePasswordInput(@NotBlank String currentPassword, @NotBlank @Size(min = 12, max = 256) String newPassword) { }
    public record ActiveCompanyInput(UUID companyId) { }
    public record PublicConfig(boolean pushEnabled, String vapidPublicKey) { }
}
