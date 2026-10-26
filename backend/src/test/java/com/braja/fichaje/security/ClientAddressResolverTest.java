package com.braja.fichaje.security;

import com.braja.fichaje.config.BrajaProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ClientAddressResolverTest {
    @Test
    void walksForwardedChainFromTheTrustedProxyAndIgnoresSpoofedLeftmostValues() {
        BrajaProperties properties = new BrajaProperties();
        properties.setTrustedProxyCidrs(List.of("10.0.0.0/8"));
        ClientAddressResolver resolver = new ClientAddressResolver(properties);
        MockHttpServletRequest request = request("10.0.0.1", "198.51.100.99, 203.0.113.8, 10.0.0.2");

        assertEquals("203.0.113.8", resolver.resolve(request));
    }

    @Test
    void groupsIpv6ClientsByTheirNetworkPrefix() {
        ClientAddressResolver resolver = new ClientAddressResolver(new BrajaProperties());
        String first = resolver.resolve(request("2001:db8:1234:5678:1111:2222:3333:4444", null));
        String sameNetwork = resolver.resolve(request("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd", null));
        String otherNetwork = resolver.resolve(request("2001:db8:1234:5679:1111:2222:3333:4444", null));

        assertEquals(first, sameNetwork);
        org.junit.jupiter.api.Assertions.assertNotEquals(first, otherNetwork);
    }

    @Test
    void rejectsMissingOrMalformedForwardedAddressesFromTrustedProxies() {
        BrajaProperties properties = new BrajaProperties();
        properties.setTrustedProxyCidrs(List.of("10.0.0.0/8"));
        ClientAddressResolver resolver = new ClientAddressResolver(properties);

        assertThrows(com.braja.fichaje.api.ApiException.class,
                () -> resolver.resolve(request("10.0.0.1", null)));
        assertThrows(com.braja.fichaje.api.ApiException.class,
                () -> resolver.resolve(request("10.0.0.1", "203.0.113.4, not-an-ip")));
        assertThrows(com.braja.fichaje.api.ApiException.class,
                () -> resolver.resolve(request("10.0.0.1", "203.0.113.4,")));
    }

    private MockHttpServletRequest request(String remoteAddress, String forwardedFor) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddress);
        if (forwardedFor != null) request.addHeader("X-Forwarded-For", forwardedFor);
        return request;
    }
}
