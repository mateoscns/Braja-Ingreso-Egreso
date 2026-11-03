package com.braja.fichaje.campaign;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

/**
 * The server clock the campaign drives. Every server-written time reads the Clock bean (CLAUDE.md rule 28),
 * so moving this clock moves the whole backend. Spring Session expiry is the documented exception (S5).
 */
public final class MutableClock extends Clock {
    /** Monday 2027-03-01 06:00 in Buenos Aires: the first simulated day. */
    public static final Instant DEFAULT_START = Instant.parse("2027-03-01T09:00:00Z");

    private final AtomicReference<Instant> now = new AtomicReference<>(DEFAULT_START);

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        throw new UnsupportedOperationException("the backend reads UTC instants only");
    }

    @Override
    public Instant instant() {
        return now.get();
    }

    public void set(Instant instant) {
        now.set(instant);
    }

    public Instant advance(Duration duration) {
        if (duration.isNegative()) throw new IllegalArgumentException("use set() to move the clock back on purpose");
        return now.updateAndGet(current -> current.plus(duration));
    }

    public void reset() {
        now.set(DEFAULT_START);
    }
}
