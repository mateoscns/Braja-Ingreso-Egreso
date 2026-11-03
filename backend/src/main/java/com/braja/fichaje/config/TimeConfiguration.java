package com.braja.fichaje.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * The single source of server time (CLAUDE.md rule 28). Every service, controller and job reads the instant from this bean,
 * so tests can replace it with a controllable clock and simulate days or months. Production uses UTC system time, the same
 * value {@code Instant.now()} returned before. Spring Session's idle timeout is the one exception: it uses its own clock.
 */
@Configuration(proxyBeanMethods = false)
public class TimeConfiguration {
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
