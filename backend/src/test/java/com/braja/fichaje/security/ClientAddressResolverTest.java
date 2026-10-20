package com.braja.fichaje.security;

import com.braja.fichaje.config.BrajaProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ClientAddressResolverTest {
    @Test
    void walksForwardedChainFromTheTrustedProxyAndIgnoresSpoofedLeftmostValues() {
        BrajaProperties properties = new BrajaProperties();
        properties.setTrustedProxyCidrs(List.of("10.0.0.0/8"));
        ClientAddressResolver resolver = new ClientAddressResolver(properties);
        MockHttpServletRequest request = request("10.0.0.1", "198.51.100.99, 203.0.113.8, 10.0.0.2");

        assertEquals("203.0.113.8", resolver.resolve(request));
    }

    private MockHttpServletRequest request(String remoteAddress, String forwardedFor) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddress);
        request.addHeader("X-Forwarded-For", forwardedFor);
        return request;
    }
}
