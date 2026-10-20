package com.braja.fichaje.security;

import java.util.Arrays;

import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
public class SessionCookieSecurityConfiguration {
    @Bean
    SmartInitializingSingleton requireSecureSessionCookieOutsideLocal(Environment environment) {
        return () -> {
            boolean localOnly = Arrays.equals(environment.getActiveProfiles(), new String[] {"local"});
            boolean sessionCookieSecure = environment.getProperty(
                    "server.servlet.session.cookie.secure", Boolean.class, true);
            boolean brajaSessionCookieSecure = environment.getProperty(
                    "braja.session-cookie-secure", Boolean.class, true);
            if (!localOnly && (!sessionCookieSecure || !brajaSessionCookieSecure)) {
                throw new IllegalStateException(
                        "server.servlet.session.cookie.secure and braja.session-cookie-secure must be true "
                                + "unless the local profile is active by itself");
            }
        };
    }
}
