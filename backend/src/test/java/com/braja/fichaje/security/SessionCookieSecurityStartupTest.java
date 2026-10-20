package com.braja.fichaje.security;

import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SessionCookieSecurityStartupTest {
    @Test
    void defaultConfigurationStartsWithSecureSessionCookie() {
        try (ConfigurableApplicationContext context = start()) {
            assertEquals(0, context.getEnvironment().getActiveProfiles().length);
            assertTrue(context.getEnvironment().getProperty(
                    "server.servlet.session.cookie.secure", Boolean.class, false));
        }
    }

    @Test
    void insecureSessionCookieFailsStartupWhenLocalIsNotExplicit() {
        assertThrows(IllegalStateException.class,
                () -> start("--server.servlet.session.cookie.secure=false"));
    }

    @Test
    void explicitLocalProfileAllowsHttpDevelopmentCookie() {
        try (ConfigurableApplicationContext context = start("--spring.profiles.active=local")) {
            assertFalse(context.getEnvironment().getProperty(
                    "server.servlet.session.cookie.secure", Boolean.class, true));
        }
    }

    private ConfigurableApplicationContext start(String... arguments) {
        return new SpringApplicationBuilder(SessionCookieSecurityConfiguration.class)
                .web(WebApplicationType.NONE)
                .run(arguments);
    }
}
