package com.braja.fichaje.notifications;

import com.braja.fichaje.config.BrajaProperties;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class NotificationOutboxDispatcher {
    private static final Logger LOGGER = LoggerFactory.getLogger(NotificationOutboxDispatcher.class);
    private static final int CLAIM_BATCH_SIZE = 20;

    private final BrajaProperties properties;
    private final NotificationWindowRepository repository;
    private final PushSubscriptionCipher cipher;
    private final SafePushPayloadFactory payloadFactory;
    private final WebPushGateway webPushGateway;
    private final NotificationRetryPolicy retryPolicy = new NotificationRetryPolicy();

    public NotificationOutboxDispatcher(BrajaProperties properties,
                                        NotificationWindowRepository repository,
                                        PushSubscriptionCipher cipher,
                                        SafePushPayloadFactory payloadFactory,
                                        WebPushGateway webPushGateway) {
        this.properties = properties;
        this.repository = repository;
        this.cipher = cipher;
        this.payloadFactory = payloadFactory;
        this.webPushGateway = webPushGateway;
    }

    @Scheduled(fixedDelayString = "${braja.notifications.dispatch-delay-ms:5000}")
    public void dispatchDueWindows() {
        if (!properties.isPushEnabled()) {
            return;
        }
        Instant now = Instant.now();
        List<NotificationWindowLease> leases = repository.claimDueWindows(now, CLAIM_BATCH_SIZE);
        for (NotificationWindowLease lease : leases) {
            dispatch(lease);
        }
    }

    private void dispatch(NotificationWindowLease lease) {
        Instant now = Instant.now();
        try {
            List<SiteCount> counts = repository.loadSiteCounts(lease);
            if (counts.isEmpty()) {
                repository.markDelivered(lease, now);
                return;
            }
            List<StoredPushSubscription> subscriptions = repository.findActiveAdminSubscriptions(lease.companyId());
            if (subscriptions.isEmpty()) {
                repository.markDelivered(lease, now);
                return;
            }

            SafePushPayload payload = payloadFactory.create(lease.companyId(), lease.windowStartedAt(), counts);
            String json = payloadFactory.toJson(payload);
            String topic = payloadFactory.pushTopic(lease.companyId(), lease.windowStartedAt());
            String failureCode = null;
            for (StoredPushSubscription subscription : subscriptions) {
                try {
                    PushSubscriptionMaterial material = cipher.decrypt(subscription.companyId(),
                            subscription.accountId(), subscription.endpointHash(), subscription.secret());
                    int status = webPushGateway.send(material, json, topic);
                    if (status >= 200 && status < 300) {
                        continue;
                    }
                    if (status == 404 || status == 410 || (status >= 400 && status < 500 && status != 429)) {
                        repository.removeExpiredSubscription(lease.companyId(), subscription.id());
                        continue;
                    }
                    failureCode = "HTTP_" + status;
                } catch (PushSubscriptionEncryptionException | InvalidPushSubscriptionException ex) {
                    repository.removeExpiredSubscription(lease.companyId(), subscription.id());
                } catch (WebPushDeliveryException ex) {
                    failureCode = ex.errorCode();
                }
            }

            if (failureCode == null) {
                repository.markDelivered(lease, Instant.now());
            } else {
                retry(lease, failureCode);
            }
        } catch (RuntimeException ex) {
            String code = ex instanceof WebPushDeliveryException deliveryException
                    ? deliveryException.errorCode() : ex.getClass().getSimpleName().toUpperCase();
            LOGGER.warn("No se pudo procesar una ventana de avisos; code={}", code);
            retry(lease, code);
        }
    }

    private void retry(NotificationWindowLease lease, String errorCode) {
        Instant now = Instant.now();
        Instant nextAttemptAt = now.plus(retryPolicy.delayForAttempt(lease.attemptCount()));
        repository.scheduleRetry(lease, now, nextAttemptAt, errorCode);
    }
}
