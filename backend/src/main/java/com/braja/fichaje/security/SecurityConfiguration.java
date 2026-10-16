package com.braja.fichaje.security;

import com.braja.fichaje.config.BrajaProperties;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;

import javax.sql.DataSource;

@Configuration
public class SecurityConfiguration {
    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    @Bean
    UserDetailsService userDetailsService(DataSource dataSource) {
        return username -> {
            String dni = DniNormalizer.normalize(username);
            try (var connection = dataSource.getConnection();
                 var statement = connection.prepareStatement("SELECT id, dni_display, password_hash, active FROM accounts WHERE dni_normalized = ?")) {
                statement.setString(1, dni);
                try (var rows = statement.executeQuery()) {
                    if (!rows.next()) throw new org.springframework.security.core.userdetails.UsernameNotFoundException("Invalid credentials");
                    return new BrajaUserDetails(java.util.UUID.fromString(rows.getString("id")), rows.getString("dni_display"), rows.getString("password_hash"), rows.getBoolean("active"));
                }
            } catch (java.sql.SQLException ex) {
                throw new org.springframework.security.authentication.AuthenticationServiceException("Authentication unavailable", ex);
            }
        };
    }

    @Bean
    DaoAuthenticationProvider authenticationProvider(UserDetailsService userDetailsService, PasswordEncoder passwordEncoder) {
        var provider = new DaoAuthenticationProvider(userDetailsService);
        provider.setPasswordEncoder(passwordEncoder);
        return provider;
    }

    @Bean
    AuthenticationManager authenticationManager(AuthenticationConfiguration configuration) throws Exception { return configuration.getAuthenticationManager(); }

    @Bean
    SecurityContextRepository securityContextRepository() { return new HttpSessionSecurityContextRepository(); }

    @Bean
    SessionAuthenticationStrategy sessionAuthenticationStrategy() { return new ChangeSessionIdAuthenticationStrategy(); }

    @Bean
    CsrfTokenRepository csrfTokenRepository() {
        var repository = new HttpSessionCsrfTokenRepository();
        repository.setHeaderName("X-CSRF-TOKEN");
        return repository;
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, CsrfTokenRepository csrfRepository,
                                            SecurityContextRepository contextRepository) throws Exception {
        var handler = new CsrfTokenRequestAttributeHandler();
        http
                .csrf(csrf -> csrf.csrfTokenRepository(csrfRepository).csrfTokenRequestHandler(handler))
                .securityContext(context -> context.securityContextRepository(contextRepository))
                .sessionManagement(session -> session.sessionFixation(fixation -> fixation.changeSessionId()))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/api/v1/public-config", "/api/v1/csrf", "/error").permitAll()
                        .requestMatchers("/api/v1/session").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, ex) -> writeProblem(response, 401, "UNAUTHORIZED", "Authentication required"))
                        .accessDeniedHandler((request, response, ex) -> writeProblem(response, 403, "FORBIDDEN", "Request rejected")))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults());
        return http.build();
    }

    private static void writeProblem(HttpServletResponse response, int status, String code, String detail) throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Request rejected\",\"status\":" + status + ",\"detail\":\"" + detail + "\",\"code\":\"" + code + "\"}");
    }
}
