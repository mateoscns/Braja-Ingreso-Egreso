package com.braja.fichaje.notifications;

import java.time.Duration;
import java.time.Instant;
import java.util.Objects;
import org.springframework.stereotype.Component;

@Component
public final class NotificationWindowPolicy {

    public static final Duration WINDOW_LENGTH = Duration.ofMinutes(5);

    public Instant endAt(Instant windowStart) {
        return Objects.requireNonNull(windowStart, "windowStart").plus(WINDOW_LENGTH);
    }

    public Instant startForEvent(Instant activeWindowStart, Instant occurredAt) {
        Objects.requireNonNull(occurredAt, "occurredAt");
        if (activeWindowStart == null || !occurredAt.isBefore(endAt(activeWindowStart))) {
            return occurredAt;
        }
        return activeWindowStart;
    }
}
