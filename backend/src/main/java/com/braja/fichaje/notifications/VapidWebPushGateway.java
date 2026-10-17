package com.braja.fichaje.notifications;

import com.braja.fichaje.config.BrajaProperties;
import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.Security;
import jakarta.annotation.PreDestroy;
import nl.martijndwars.webpush.Encoding;
import nl.martijndwars.webpush.Notification;
import nl.martijndwars.webpush.PushService;
import nl.martijndwars.webpush.Urgency;
import org.apache.http.client.config.RequestConfig;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;
import org.bouncycastle.jce.provider.BouncyCastleProvider;
import org.jose4j.lang.JoseException;
import org.springframework.stereotype.Component;

@Component
public final class VapidWebPushGateway implements WebPushGateway {
    private final BrajaProperties properties;
    private final PushEndpointValidator endpointValidator;
    private final CloseableHttpClient httpClient;
    private final PushService pushService;

    public VapidWebPushGateway(BrajaProperties properties, PushEndpointValidator endpointValidator) {
        this.properties = properties;
        this.endpointValidator = endpointValidator;
        this.httpClient = HttpClients.custom()
                .disableRedirectHandling()
                .setDefaultRequestConfig(RequestConfig.custom()
                        .setConnectTimeout(5000)
                        .setConnectionRequestTimeout(5000)
                        .setSocketTimeout(5000)
                        .build())
                .build();

        if (!properties.isPushEnabled()) {
            this.pushService = null;
            return;
        }
        if (Security.getProvider(BouncyCastleProvider.PROVIDER_NAME) == null) {
            Security.addProvider(new BouncyCastleProvider());
        }
        try {
            this.pushService = new PushService(properties.getVapidPublicKey(),
                    properties.getVapidPrivateKey(), properties.getVapidSubject());
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("La configuración VAPID no es válida.", ex);
        }
    }

    @Override
    public int send(PushSubscriptionMaterial subscription, String payload, String topic) {
        if (pushService == null) {
            throw new PushFeatureDisabledException();
        }
        endpointValidator.validate(new PushSubscriptionRequest(subscription.endpoint(),
                new PushSubscriptionRequest.Keys(subscription.p256dh(), subscription.auth())));
        try {
            Notification notification = Notification.builder()
                    .endpoint(subscription.endpoint())
                    .userPublicKey(subscription.p256dh())
                    .userAuth(subscription.auth())
                    .payload(payload)
                    .ttl(3600)
                    .urgency(Urgency.NORMAL)
                    .topic(topic)
                    .build();
            HttpPost post = pushService.preparePost(notification, Encoding.AES128GCM);
            try (CloseableHttpResponse response = httpClient.execute(post)) {
                return response.getStatusLine().getStatusCode();
            }
        } catch (GeneralSecurityException | IOException | JoseException ex) {
            throw new WebPushDeliveryException("WEB_PUSH_FAILURE", ex);
        }
    }

    @PreDestroy
    public void close() throws IOException {
        httpClient.close();
    }
}
