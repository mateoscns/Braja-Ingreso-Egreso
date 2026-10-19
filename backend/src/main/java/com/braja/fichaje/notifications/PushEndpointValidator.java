package com.braja.fichaje.notifications;

import java.net.IDN;
import java.net.URI;
import java.util.Base64;
import java.util.Locale;
import org.springframework.stereotype.Component;

@Component
public final class PushEndpointValidator {

    private static final int MAX_ENDPOINT_LENGTH = 2048;
    private static final int MAX_KEY_LENGTH = 256;

    public void validate(PushSubscriptionRequest request) {
        if (request == null || request.keys() == null) {
            throw new InvalidPushSubscriptionException();
        }
        validateEndpoint(request.endpoint());
        validatePublicKey(request.keys().p256dh());
        validateAuthSecret(request.keys().auth());
    }

    private void validateEndpoint(String endpoint) {
        if (endpoint == null || endpoint.isBlank() || endpoint.length() > MAX_ENDPOINT_LENGTH) {
            throw new InvalidPushSubscriptionException();
        }
        try {
            URI uri = URI.create(endpoint);
            if (!uri.isAbsolute() || !"https".equalsIgnoreCase(uri.getScheme())
                    || uri.getHost() == null || uri.getRawUserInfo() != null || uri.getFragment() != null
                    || (uri.getPort() != -1 && uri.getPort() != 443) || uri.getRawPath() == null
                    || uri.getRawPath().isBlank()) {
                throw new InvalidPushSubscriptionException();
            }
            String host = IDN.toASCII(uri.getHost()).toLowerCase(Locale.ROOT);
            if (!isSupportedPublicPushHost(host)) {
                throw new InvalidPushSubscriptionException();
            }
        } catch (IllegalArgumentException ex) {
            throw new InvalidPushSubscriptionException();
        }
    }

    private boolean isSupportedPublicPushHost(String host) {
        return host.equals("fcm.googleapis.com")
                || host.equals("web.push.apple.com")
                || host.equals("push.services.mozilla.com")
                || host.endsWith(".push.services.mozilla.com")
                || host.endsWith(".notify.windows.com");
    }

    private void validatePublicKey(String encoded) {
        byte[] decoded = decode(encoded, MAX_KEY_LENGTH);
        if (decoded.length != 65 || decoded[0] != 0x04) {
            throw new InvalidPushSubscriptionException();
        }
    }

    private void validateAuthSecret(String encoded) {
        byte[] decoded = decode(encoded, MAX_KEY_LENGTH);
        if (decoded.length < 16 || decoded.length > 64) {
            throw new InvalidPushSubscriptionException();
        }
    }

    private byte[] decode(String encoded, int maxLength) {
        if (encoded == null || encoded.isBlank() || encoded.length() > maxLength) {
            throw new InvalidPushSubscriptionException();
        }
        try {
            return Base64.getUrlDecoder().decode(encoded);
        } catch (IllegalArgumentException ex) {
            throw new InvalidPushSubscriptionException();
        }
    }
}
