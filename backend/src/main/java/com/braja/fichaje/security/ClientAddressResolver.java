package com.braja.fichaje.security;

import com.braja.fichaje.api.ApiException;
import com.braja.fichaje.config.BrajaProperties;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.math.BigInteger;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.regex.Pattern;

@Component
public final class ClientAddressResolver {
    private static final Pattern DECIMAL_OCTET = Pattern.compile("[0-9]{1,3}");
    private static final Pattern HEX_GROUP = Pattern.compile("[0-9a-fA-F]{1,4}");
    private final List<Network> trustedProxies;

    public ClientAddressResolver(BrajaProperties properties) {
        this.trustedProxies = properties.getTrustedProxyCidrs().stream()
                .filter(value -> value != null && !value.isBlank())
                .map(Network::parse)
                .toList();
        rejectRangesCoveringEveryAddress(trustedProxies);
    }

    /**
     * 2026-10-27: only a literal {@code /0} was rejected, so {@code 0.0.0.0/1} plus {@code 128.0.0.0/1} still trusted
     * every peer and let any client choose its throttled address. Merges the ranges of each family, sorted by start.
     */
    private static void rejectRangesCoveringEveryAddress(List<Network> networks) {
        for (int bits : new int[] {32, 128}) {
            List<BigInteger[]> ranges = networks.stream().filter(network -> network.address().length * 8 == bits)
                    .map(Network::range).sorted(Comparator.comparing(range -> range[0])).toList();
            BigInteger firstUncovered = BigInteger.ZERO;
            for (BigInteger[] range : ranges) {
                if (range[0].compareTo(firstUncovered) > 0) break;
                firstUncovered = firstUncovered.max(range[1].add(BigInteger.ONE));
            }
            if (firstUncovered.equals(BigInteger.ONE.shiftLeft(bits))) {
                throw new IllegalStateException("BRAJA_TRUSTED_PROXY_CIDRS must not trust every address, even across several ranges");
            }
        }
    }

    public String resolve(HttpServletRequest request) {
        String remoteAddress = request.getRemoteAddr();
        InetAddress peer = parseAddress(remoteAddress);
        if (peer == null) throw ApiException.invalid("Unable to determine client address");
        if (!isTrusted(peer)) return throttleAddress(peer);

        String forwardedFor = request.getHeader("X-Forwarded-For");
        if (forwardedFor == null || forwardedFor.isBlank()) {
            throw ApiException.invalid("Trusted proxy did not provide a valid client address");
        }
        List<InetAddress> chain = parseForwardedFor(forwardedFor);
        if (chain.isEmpty()) throw ApiException.invalid("Trusted proxy did not provide a valid client address");
        InetAddress current = peer;
        for (int index = chain.size() - 1; index >= 0; index--) {
            if (!isTrusted(current)) break;
            current = chain.get(index);
        }
        return throttleAddress(current);
    }

    private List<InetAddress> parseForwardedFor(String header) {
        if (header == null || header.isBlank()) return List.of();
        List<InetAddress> addresses = new ArrayList<>();
        for (String element : header.split(",", -1)) {
            InetAddress address = parseAddress(element.trim());
            if (address == null) return List.of();
            addresses.add(address);
        }
        return addresses;
    }

    private boolean isTrusted(InetAddress address) {
        return trustedProxies.stream().anyMatch(network -> network.contains(address));
    }

    private static String throttleAddress(InetAddress address) {
        byte[] bytes = address.getAddress();
        if (bytes.length == 16) {
            java.util.Arrays.fill(bytes, 8, bytes.length, (byte) 0);
            try {
                return InetAddress.getByAddress(bytes).getHostAddress();
            } catch (UnknownHostException impossible) {
                throw new IllegalStateException("Unable to normalize client address", impossible);
            }
        }
        return address.getHostAddress();
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
        byte[] bytes = value.indexOf(':') >= 0 ? parseIpv6(value) : parseIpv4(value);
        if (bytes == null) return null;
        try {
            return normalize(InetAddress.getByAddress(bytes));
        } catch (UnknownHostException impossible) {
            return null;
        }
    }

    /**
     * Literal parsing only: {@code InetAddress.getByName} resolves anything that is not a literal with DNS
     * (2026-10-27: "dead.beef.cafe" matched the old hex pattern and was resolved). Leading zeros are rejected
     * because they are ambiguous (octal in some parsers).
     */
    private static byte[] parseIpv4(String value) {
        String[] parts = value.split("\\.", -1);
        if (parts.length != 4) return null;
        byte[] bytes = new byte[4];
        for (int index = 0; index < 4; index++) {
            String part = parts[index];
            if (!DECIMAL_OCTET.matcher(part).matches() || (part.length() > 1 && part.charAt(0) == '0')) return null;
            int octet = Integer.parseInt(part);
            if (octet > 255) return null;
            bytes[index] = (byte) octet;
        }
        return bytes;
    }

    private static byte[] parseIpv6(String value) {
        String hex = value;
        int lastColon = value.lastIndexOf(':');
        if (value.indexOf('.', lastColon) >= 0) {
            byte[] ipv4 = parseIpv4(value.substring(lastColon + 1));
            if (ipv4 == null) return null;
            hex = value.substring(0, lastColon + 1) + Integer.toHexString(((ipv4[0] & 0xff) << 8) | (ipv4[1] & 0xff))
                    + ":" + Integer.toHexString(((ipv4[2] & 0xff) << 8) | (ipv4[3] & 0xff));
        }
        int compressed = hex.indexOf("::");
        if (compressed >= 0 && hex.indexOf("::", compressed + 1) >= 0) return null;
        List<String> head = groups(compressed >= 0 ? hex.substring(0, compressed) : hex);
        List<String> tail = compressed >= 0 ? groups(hex.substring(compressed + 2)) : List.of();
        if (head == null || tail == null) return null;
        int groupCount = head.size() + tail.size();
        if (compressed >= 0 ? groupCount > 7 : groupCount != 8) return null;
        byte[] bytes = new byte[16];
        for (int index = 0; index < head.size(); index++) putGroup(bytes, index, head.get(index));
        for (int index = 0; index < tail.size(); index++) putGroup(bytes, 8 - tail.size() + index, tail.get(index));
        return bytes;
    }

    private static List<String> groups(String value) {
        if (value.isEmpty()) return List.of();
        List<String> groups = List.of(value.split(":", -1));
        return groups.stream().allMatch(group -> HEX_GROUP.matcher(group).matches()) ? groups : null;
    }

    private static void putGroup(byte[] bytes, int group, String hex) {
        int value = Integer.parseInt(hex, 16);
        bytes[group * 2] = (byte) (value >> 8);
        bytes[group * 2 + 1] = (byte) value;
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

        /** First and last address of the network as unsigned integers. */
        private BigInteger[] range() {
            int hostBits = address.length * 8 - prefixLength;
            BigInteger first = new BigInteger(1, address).shiftRight(hostBits).shiftLeft(hostBits);
            return new BigInteger[] {first, first.add(BigInteger.ONE.shiftLeft(hostBits)).subtract(BigInteger.ONE)};
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
