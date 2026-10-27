package com.braja.fichaje.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.mock.env.MockEnvironment;

import java.util.Base64;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BrajaPropertiesValidationTest {
    private static final String HEALTH_KEY = Base64.getEncoder().encodeToString(new byte[32]);
    private static final byte[] THROTTLE_KEY_BYTES = new byte[32];

    static {
        THROTTLE_KEY_BYTES[0] = 1;
    }

    private static final String THROTTLE_KEY = Base64.getEncoder().encodeToString(THROTTLE_KEY_BYTES);

    @Test
    void trustedProxyIsRequiredOutsideTheLocalOnlyProfile() {
        BrajaProperties properties = validProperties();

        MockEnvironment noProfile = new MockEnvironment();
        MockEnvironment mixedProfiles = new MockEnvironment();
        mixedProfiles.setActiveProfiles("local", "production");
        MockEnvironment localProfile = new MockEnvironment();
        localProfile.setActiveProfiles("local");
        assertThrows(IllegalStateException.class, () -> properties.validate(noProfile));
        assertThrows(IllegalStateException.class, () -> properties.validate(mixedProfiles));
        assertDoesNotThrow(() -> properties.validate(localProfile));

        properties.setTrustedProxyCidrs(List.of("192.0.2.10/32"));
        MockEnvironment productionProfile = new MockEnvironment();
        productionProfile.setActiveProfiles("production");
        assertDoesNotThrow(() -> properties.validate(productionProfile));
    }

    /** 2026-10-27: 0.0.0.0/0 was accepted, trusting X-Forwarded-For from every peer and voiding the IP throttle. */
    @Test
    void trustedProxyCidrsWithAZeroPrefixAreRejected() {
        for (String everything : List.of("0.0.0.0/0", "::/0", " 10.0.0.0/0 ", "192.0.2.0/00")) {
            BrajaProperties properties = validProperties();
            properties.setTrustedProxyCidrs(List.of("192.0.2.10/32", everything));
            assertThrows(IllegalStateException.class, properties::validate, everything);
        }
        BrajaProperties properties = validProperties();
        properties.setTrustedProxyCidrs(List.of("10.0.0.0/8", "192.0.2.10", "fd00::/8"));
        assertDoesNotThrow(() -> properties.validate());
    }

    @Test
    void loginIpThrottleKeyMustBeConfiguredSeparatelyFromHealthEncryptionKey() {
        BrajaProperties properties = validProperties();
        properties.setLoginIpThrottleKeyBase64(HEALTH_KEY);

        assertThrows(IllegalStateException.class, properties::validate);
    }

    @Test
    void applicationStartupFailsWithoutTrustedProxyOutsideLocal() {
        RuntimeException failure = assertThrows(RuntimeException.class,
                () -> start("--spring.profiles.active=production"));
        assertTrue(rootCause(failure).getMessage().contains("BRAJA_TRUSTED_PROXY_CIDRS"));

        try (ConfigurableApplicationContext ignored = start("--spring.profiles.active=local")) {
            // The local-only profile permits direct development traffic.
        }
        try (ConfigurableApplicationContext ignored = start("--spring.profiles.active=production",
                "--braja.trusted-proxy-cidrs=192.0.2.10/32")) {
            // A non-local deployment starts when its trusted proxy range is configured.
        }
    }

    private BrajaProperties validProperties() {
        BrajaProperties properties = new BrajaProperties();
        properties.setHealthEncryptionKeyBase64(HEALTH_KEY);
        properties.setLoginIpThrottleKeyBase64(THROTTLE_KEY);
        return properties;
    }

    private ConfigurableApplicationContext start(String... arguments) {
        String[] startupArguments = new String[arguments.length + 2];
        startupArguments[0] = "--braja.health-encryption-key-base64=" + HEALTH_KEY;
        startupArguments[1] = "--braja.login-ip-throttle-key-base64=" + THROTTLE_KEY;
        System.arraycopy(arguments, 0, startupArguments, 2, arguments.length);
        return new SpringApplicationBuilder(ValidationConfiguration.class)
                .web(WebApplicationType.NONE)
                .run(startupArguments);
    }

    private Throwable rootCause(Throwable failure) {
        Throwable cause = failure;
        while (cause.getCause() != null) cause = cause.getCause();
        return cause;
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(BrajaProperties.class)
    @Import(com.braja.fichaje.security.EncryptionService.class)
    static class ValidationConfiguration { }
}
