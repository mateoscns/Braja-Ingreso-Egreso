package com.braja.fichaje.security;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public record BrajaUserDetails(UUID accountId, String dni, String password, boolean active) implements UserDetails {
    @Override public Collection<? extends GrantedAuthority> getAuthorities() { return List.of(); }
    @Override public String getPassword() { return password; }
    @Override public String getUsername() { return dni; }
    @Override public boolean isAccountNonExpired() { return true; }
    @Override public boolean isAccountNonLocked() { return true; }
    @Override public boolean isCredentialsNonExpired() { return true; }
    @Override public boolean isEnabled() { return active; }
}
