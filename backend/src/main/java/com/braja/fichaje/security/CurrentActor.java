package com.braja.fichaje.security;

import com.braja.fichaje.api.ApiException;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;

import java.util.UUID;

@Component
public class CurrentActor {
    public static final String ACTIVE_COMPANY_SESSION_KEY = "braja.activeCompanyId";

    public UUID accountId(Authentication authentication) {
        if (authentication == null || !(authentication.getPrincipal() instanceof BrajaUserDetails user)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Authentication required");
        }
        return user.accountId();
    }

    public UUID activeCompany(HttpSession session) {
        Object value = session.getAttribute(ACTIVE_COMPANY_SESSION_KEY);
        if (!(value instanceof UUID id)) throw ApiException.forbidden();
        return id;
    }
}
