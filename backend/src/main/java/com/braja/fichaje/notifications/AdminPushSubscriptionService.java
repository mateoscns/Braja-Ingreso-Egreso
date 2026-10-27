package com.braja.fichaje.notifications;

import com.braja.fichaje.config.BrajaProperties;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminPushSubscriptionService {
    private final JdbcPushSubscriptionRepository repository;
    private final PushSubscriptionCipher cipher;
    private final PushEndpointValidator endpointValidator;
    private final BrajaProperties properties;

    public AdminPushSubscriptionService(JdbcPushSubscriptionRepository repository,
                                        PushSubscriptionCipher cipher,
                                        PushEndpointValidator endpointValidator,
                                        BrajaProperties properties) {
        this.repository = repository;
        this.cipher = cipher;
        this.endpointValidator = endpointValidator;
        this.properties = properties;
    }

    @Transactional
    public UUID register(UUID companyId, UUID adminAccountId, PushSubscriptionRequest request) {
        requireActiveAdmin(companyId, adminAccountId);
        if (!properties.isPushEnabled()) {
            throw new PushFeatureDisabledException();
        }
        endpointValidator.validate(request);
        PushSubscriptionMaterial material = new PushSubscriptionMaterial(
                request.endpoint(), request.keys().p256dh(), request.keys().auth());
        return repository.upsert(companyId, adminAccountId, material, cipher, Instant.now());
    }

    @Transactional
    public void remove(UUID companyId, UUID adminAccountId, UUID subscriptionId) {
        requireActiveAdmin(companyId, adminAccountId);
        repository.removeOwned(companyId, adminAccountId, subscriptionId);
    }

    /** The subscription this ADMIN registered for this device endpoint in this company, if any (D-20261027-04). */
    @Transactional(readOnly = true)
    public Optional<UUID> findSubscription(UUID companyId, UUID adminAccountId, String endpoint) {
        requireActiveAdmin(companyId, adminAccountId);
        if (endpoint == null || endpoint.isBlank()) {
            return Optional.empty();
        }
        return repository.findOwnedActive(companyId, adminAccountId, endpoint);
    }

    private void requireActiveAdmin(UUID companyId, UUID accountId) {
        if (companyId == null || accountId == null || !repository.isActiveAdmin(companyId, accountId)) {
            throw new AccessDeniedException("Se requiere una membresía ADMIN activa.");
        }
    }
}
