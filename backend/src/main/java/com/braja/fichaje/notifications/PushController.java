package com.braja.fichaje.notifications;

import com.braja.fichaje.security.ScopeService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/push/subscriptions")
public class PushController {
    private final AdminPushSubscriptionService subscriptions;
    private final ScopeService scopes;

    public PushController(AdminPushSubscriptionService subscriptions, ScopeService scopes) {
        this.subscriptions = subscriptions;
        this.scopes = scopes;
    }

    @PutMapping
    public SubscriptionView register(Authentication auth, HttpSession session, @Valid @RequestBody SubscriptionInput input) {
        var scope = scopes.requireAdmin(auth, session);
        PushSubscriptionRequest request = new PushSubscriptionRequest(input.endpoint(),
                new PushSubscriptionRequest.Keys(input.keys().p256dh(), input.keys().auth()));
        return new SubscriptionView(subscriptions.register(scope.companyId(), scope.accountId(), request));
    }

    /** POST so the endpoint (a capability URL) never travels in a URL or an access log. */
    @PostMapping("/current")
    public CurrentSubscriptionView current(Authentication auth, HttpSession session,
                                           @Valid @RequestBody EndpointInput input) {
        var scope = scopes.requireAdmin(auth, session);
        return subscriptions.findSubscription(scope.companyId(), scope.accountId(), input.endpoint())
                .map(id -> new CurrentSubscriptionView(true, id))
                .orElseGet(() -> new CurrentSubscriptionView(false, null));
    }

    @DeleteMapping("/{subscriptionId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(Authentication auth, HttpSession session, @PathVariable UUID subscriptionId) {
        var scope = scopes.requireAdmin(auth, session);
        subscriptions.remove(scope.companyId(), scope.accountId(), subscriptionId);
    }

    public record SubscriptionInput(@NotBlank @Size(max=2048) String endpoint, @NotNull @Valid KeysInput keys) { }
    public record KeysInput(@NotBlank @Size(max=256) String p256dh, @NotBlank @Size(max=128) String auth) { }
    public record SubscriptionView(UUID id) { }
    public record EndpointInput(@NotBlank @Size(max=2048) String endpoint) { }
    public record CurrentSubscriptionView(boolean subscribed, UUID id) { }
}
