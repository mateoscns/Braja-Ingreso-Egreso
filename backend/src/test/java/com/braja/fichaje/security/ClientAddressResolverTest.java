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

    /** 2026-10-27: hex-letter hostnames matched the "numeric" pattern and were resolved with DNS (dead.beef.cafe resolves). */
    @Test
    void ignoresHostnamesThatLookHexadecimalInsteadOfResolvingThem() {
        BrajaProperties properties = new BrajaProperties();
        properties.setTrustedProxyCidrs(List.of("10.0.0.0/8"));
        ClientAddressResolver resolver = new ClientAddressResolver(properties);

        assertThrows(com.braja.fichaje.api.ApiException.class,
                () -> resolver.resolve(request("10.0.0.1", "dead.beef.cafe")));
        assertThrows(com.braja.fichaje.api.ApiException.class,
                () -> resolver.resolve(request("10.0.0.1", "203.0.113.4, dead.beef.cafe")));
        assertThrows(com.braja.fichaje.api.ApiException.class,
                () -> resolver.resolve(request("dead.beef.cafe", null)));
        BrajaProperties hostnameProxy = new BrajaProperties();
        hostnameProxy.setTrustedProxyCidrs(List.of("dead.beef.cafe/32"));
        assertThrows(IllegalStateException.class, () -> new ClientAddressResolver(hostnameProxy));
    }

    @Test
    void acceptsOnlyLiteralIpv4AndIpv6Addresses() {
        BrajaProperties properties = new BrajaProperties();
        properties.setTrustedProxyCidrs(List.of("10.0.0.0/8", "fd00::/8"));
        ClientAddressResolver resolver = new ClientAddressResolver(properties);

        assertEquals("203.0.113.9", resolver.resolve(request("10.0.0.1", "203.0.113.9:4431")));
        assertEquals("203.0.113.9", resolver.resolve(request("10.0.0.1", "::ffff:203.0.113.9")));
        assertEquals("2001:db8:0:0:0:0:0:0", resolver.resolve(request("fd00::1", "[2001:db8::1]:443")));
        assertEquals("2001:db8:1:2:0:0:0:0", resolver.resolve(request("10.0.0.1", "2001:db8:1:2:3:4:5:6")));
        assertEquals("203.0.113.9", resolver.resolve(request("203.0.113.9", null)));
        for (String invalid : List.of("256.0.0.1", "1.2.3", "1.2.3.4.5", "01.2.3.4", "2001:db8:::1", "1:2:3:4:5:6:7:8:9",
                "2001:db8::1::2", "12345::1", "::ffff:1.2.3", "cafe", "")) {
            assertThrows(com.braja.fichaje.api.ApiException.class,
                    () -> resolver.resolve(request("10.0.0.1", "203.0.113.4, " + invalid)), invalid);
        }
    }

    /** 2026-10-27: only a literal /0 was rejected, so 0.0.0.0/1 plus 128.0.0.0/1 still trusted every peer. */
    @Test
    void rejectsTrustedProxyRangesThatTogetherCoverAWholeAddressFamily() {
        for (List<String> covering : List.of(
                List.of("0.0.0.0/1", "128.0.0.0/1"),
                List.of("192.0.0.0/2", "10.0.0.0/8", "0.0.0.0/1", "128.0.0.0/2"),
                List.of("10.0.0.0/8", "::/1", "8000::/1"),
                List.of("0.0.0.0/0"))) {
            BrajaProperties properties = new BrajaProperties();
            properties.setTrustedProxyCidrs(covering);
            assertThrows(IllegalStateException.class, () -> new ClientAddressResolver(properties), covering.toString());
        }
        BrajaProperties partial = new BrajaProperties();
        partial.setTrustedProxyCidrs(List.of("0.0.0.0/1", "128.0.0.0/2", "::/1", "10.0.0.0/8"));
        org.junit.jupiter.api.Assertions.assertDoesNotThrow(() -> new ClientAddressResolver(partial));
    }

    private MockHttpServletRequest request(String remoteAddress, String forwardedFor) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr(remoteAddress);
        if (forwardedFor != null) request.addHeader("X-Forwarded-For", forwardedFor);
        return request;
    }
}
