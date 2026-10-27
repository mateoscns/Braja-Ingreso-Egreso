package com.braja.fichaje.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.authentication.AuthenticationTrustResolver;
import org.springframework.security.authentication.AuthenticationTrustResolverImpl;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;

import java.util.List;
import java.util.UUID;

@Configuration
public class SecurityConfiguration {
    private static final AuthenticationTrustResolver TRUST_RESOLVER = new AuthenticationTrustResolverImpl();

    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    /**
     * Uses {@link JdbcTemplate}, which joins the caller's transaction or otherwise borrows one pooled connection only
     * for the query (2026-10-27: a raw {@code dataSource.getConnection()} inside the login transaction starved the pool).
     */
    @Bean
    UserDetailsService userDetailsService(JdbcTemplate jdbc) {
        return username -> {
            String dni = DniNormalizer.normalize(username);
            List<BrajaUserDetails> accounts;
            try {
                accounts = jdbc.query("SELECT id, dni_display, password_hash, active FROM accounts WHERE dni_normalized = ?",
                        (rows, index) -> new BrajaUserDetails(UUID.fromString(rows.getString("id")), rows.getString("dni_display"),
                                rows.getString("password_hash"), rows.getBoolean("active")), dni);
            } catch (DataAccessException ex) {
                throw new AuthenticationServiceException("Authentication unavailable", ex);
            }
            if (accounts.isEmpty()) throw new UsernameNotFoundException("Invalid credentials");
            return accounts.getFirst();
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

    /** Login changes the session id and discards the pre-login CSRF token (2026-10-27: the token survived login). */
    @Bean
    SessionAuthenticationStrategy sessionAuthenticationStrategy(CsrfTokenRepository csrfRepository) {
        var csrfRotation = new CsrfAuthenticationStrategy(csrfRepository);
        csrfRotation.setRequestHandler(new CsrfTokenRequestAttributeHandler());
        return new CompositeSessionAuthenticationStrategy(List.of(new ChangeSessionIdAuthenticationStrategy(), csrfRotation));
    }

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
                        .accessDeniedHandler(SecurityConfiguration::denied))
                .formLogin(AbstractHttpConfigurer::disable)
                .httpBasic(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults());
        return http.build();
    }

    /**
     * A CSRF rejection without an authenticated session means the session expired or never existed, so the client must
     * sign in again: 401 (2026-10-27: it answered 403 FORBIDDEN after the session expired). A CSRF mismatch on a live
     * authenticated session, and every other denial, stays 403.
     */
    private static void denied(HttpServletRequest request, HttpServletResponse response, AccessDeniedException ex) throws java.io.IOException {
        boolean authenticated = TRUST_RESOLVER.isAuthenticated(SecurityContextHolder.getContext().getAuthentication());
        if (ex instanceof CsrfException && !authenticated) writeProblem(response, 401, "SESSION_EXPIRED", "Session expired; fetch a new CSRF token and sign in again");
        else writeProblem(response, 403, "FORBIDDEN", "Request rejected");
    }

    private static void writeProblem(HttpServletResponse response, int status, String code, String detail) throws java.io.IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.getWriter().write("{\"type\":\"about:blank\",\"title\":\"Request rejected\",\"status\":" + status + ",\"detail\":\"" + detail + "\",\"code\":\"" + code + "\"}");
    }
}
