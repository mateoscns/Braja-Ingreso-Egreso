package com.braja.fichaje.security;

import com.braja.fichaje.config.BrajaProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

@Component
public final class ClientAddressResolver {
    private static final Pattern NUMERIC_ADDRESS = Pattern.compile("[0-9a-fA-F:.]+");
    private final List<Network> trustedProxies;

    public ClientAddressResolver(BrajaProperties properties) {
        this.trustedProxies = properties.getTrustedProxyCidrs().stream()
                .filter(value -> value != null && !value.isBlank())
                .map(Network::parse)
                .toList();
    }

    public String resolve(HttpServletRequest request) {
        String remoteAddress = request.getRemoteAddr();
        InetAddress peer = parseAddress(remoteAddress);
        if (peer == null || !isTrusted(peer)) return peer == null ? remoteAddress : peer.getHostAddress();

        List<InetAddress> chain = parseForwardedFor(request.getHeader("X-Forwarded-For"));
        InetAddress current = peer;
        for (int index = chain.size() - 1; index >= 0; index--) {
            if (!isTrusted(current)) break;
            current = chain.get(index);
        }
        return current.getHostAddress();
    }

    private List<InetAddress> parseForwardedFor(String header) {
        if (header == null || header.isBlank()) return List.of();
        List<InetAddress> addresses = new ArrayList<>();
        for (String element : header.split(",")) {
            InetAddress address = parseAddress(element.trim());
            if (address == null) return List.of();
            addresses.add(address);
        }
        return addresses;
    }

    private boolean isTrusted(InetAddress address) {
        return trustedProxies.stream().anyMatch(network -> network.contains(address));
    }

    private static InetAddress parseAddress(String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        if (value.startsWith("[")) {
            int closingBracket = value.indexOf(']');
            if (closingBracket < 0 || (closingBracket + 1 < value.length()
                    && !value.substring(closingBracket + 1).matches(":\\d+"))) return null;
            value = value.substring(1, closingBracket);
        } else if (value.matches("\\d{1,3}(\\.\\d{1,3}){3}:\\d+")) {
            value = value.substring(0, value.lastIndexOf(':'));
        }
        int zone = value.indexOf('%');
        if (zone >= 0) value = value.substring(0, zone);
        if (!NUMERIC_ADDRESS.matcher(value).matches()) return null;
        try {
            return normalize(InetAddress.getByName(value));
        } catch (UnknownHostException ex) {
            return null;
        }
    }

    private static InetAddress normalize(InetAddress address) throws UnknownHostException {
        byte[] bytes = address.getAddress();
        if (bytes.length == 16) {
            boolean mappedIpv4 = true;
            for (int index = 0; index < 10; index++) mappedIpv4 &= bytes[index] == 0;
            mappedIpv4 &= bytes[10] == (byte) 0xff && bytes[11] == (byte) 0xff;
            if (mappedIpv4) return InetAddress.getByAddress(java.util.Arrays.copyOfRange(bytes, 12, 16));
        }
        return address;
    }

    private record Network(byte[] address, int prefixLength) {
        private static Network parse(String value) {
            String[] pieces = value.trim().split("/", -1);
            if (pieces.length > 2) throw new IllegalStateException("Invalid trusted proxy CIDR");
            InetAddress address = parseAddress(pieces[0]);
            if (address == null) throw new IllegalStateException("Invalid trusted proxy CIDR");
            int bitLength = address.getAddress().length * 8;
            int prefix = pieces.length == 1 ? bitLength : Integer.parseInt(pieces[1]);
            if (prefix < 0 || prefix > bitLength) throw new IllegalStateException("Invalid trusted proxy CIDR prefix");
            return new Network(address.getAddress(), prefix);
        }

        private boolean contains(InetAddress candidate) {
            byte[] candidateAddress = candidate.getAddress();
            if (candidateAddress.length != address.length) return false;
            int fullBytes = prefixLength / 8;
            int remainingBits = prefixLength % 8;
            for (int index = 0; index < fullBytes; index++) {
                if (address[index] != candidateAddress[index]) return false;
            }
            if (remainingBits == 0) return true;
            int mask = 0xff << (8 - remainingBits);
            return (address[fullBytes] & mask) == (candidateAddress[fullBytes] & mask);
        }
    }
}
