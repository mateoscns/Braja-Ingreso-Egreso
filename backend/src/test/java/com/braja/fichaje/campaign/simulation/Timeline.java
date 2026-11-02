package com.braja.fichaje.campaign.simulation;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.PriorityQueue;

/**
 * The event-driven timeline: every persona action, ADMIN action and job instant, in instant order and, for equal
 * instants, in the order they were scheduled (which is deterministic because scheduling is single-threaded).
 * Instants are microsecond-precise, like the DATETIME(6) columns, so what the server stores is what was scheduled.
 */
final class Timeline {
    record Event(Instant at, long order, String actor, String label, Runnable action) { }

    private final PriorityQueue<Event> queue = new PriorityQueue<>(Comparator.comparing(Event::at).thenComparingLong(Event::order));
    private long scheduled;

    void at(Instant at, String actor, String label, Runnable action) {
        if (!at.truncatedTo(ChronoUnit.MICROS).equals(at)) throw new IllegalArgumentException("sub-microsecond instant " + at + " for " + label);
        queue.add(new Event(at, scheduled++, actor, label, action));
    }

    /** The next event at or before {@code limit}, removed from the queue, or null. */
    Event pollUntil(Instant limit) {
        Event head = queue.peek();
        if (head == null || head.at().isAfter(limit)) return null;
        return queue.poll();
    }

    boolean isEmpty() {
        return queue.isEmpty();
    }

    Instant last() {
        return queue.stream().map(Event::at).max(Comparator.naturalOrder()).orElse(null);
    }

    long scheduledCount() {
        return scheduled;
    }
}
