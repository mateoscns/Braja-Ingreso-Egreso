package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.ApiClient;
import com.braja.fichaje.campaign.HttpLog;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/**
 * What happened on a simulated day: counts (the deterministic summary of S8), counts that depend on thread timing
 * (kept apart), the violations, and the day's log. Every expectation goes through {@link #expect}, which compares the
 * server's answer with the answer the model predicted and records a violation with seed, day and persona otherwise.
 */
final class DayLedger {
    private final long seed;
    private final Path dir;
    private final Supplier<Instant> clock;
    private final Map<String, Long> counts = new ConcurrentHashMap<>();
    private final Map<String, Long> timingCounts = new ConcurrentHashMap<>();
    private final Map<String, Long> totals = new TreeMap<>();
    private final List<String> violations = java.util.Collections.synchronizedList(new ArrayList<>());
    private final List<String> notes = java.util.Collections.synchronizedList(new ArrayList<>());
    private final List<String> summaries = new ArrayList<>();
    private final Map<String, long[]> profile = new TreeMap<>();
    private int dayIndex = -1;
    private LocalDate date;

    DayLedger(long seed, Path dir, Supplier<Instant> clock) {
        this.seed = seed;
        this.dir = dir;
        this.clock = clock;
        try {
            Files.createDirectories(dir);
            Files.deleteIfExists(dir.resolve("summary.txt"));
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    void beginDay(int index, LocalDate day) {
        dayIndex = index;
        date = day;
        counts.clear();
        timingCounts.clear();
        notes.clear();
    }

    int dayIndex() { return dayIndex; }

    LocalDate date() { return date; }

    static String token(ApiClient.Response response) {
        return response.status() < 300 || response.code() == null ? Integer.toString(response.status()) : response.status() + " " + response.code();
    }

    /** Compares the answer with the predicted tokens; counts it as "kind token". */
    String expect(String actor, String kind, ApiClient.Response response, String... allowed) {
        String token = token(response);
        count(kind + " " + token);
        if (!Arrays.asList(allowed).contains(token)) {
            violation(actor, kind + ": expected " + String.join(" or ", allowed) + " but got " + token + " " + abbreviate(response.raw()));
        }
        return token;
    }

    void count(String key) { count(key, 1); }

    void count(String key, long n) {
        counts.merge(key, n, Long::sum);
        synchronized (totals) { totals.merge(key, n, Long::sum); }
    }

    /** Counts that depend on which thread won a race (bursts): reported, never compared for S8. */
    void timing(String key) { timing(key, 1); }

    void timing(String key, long n) {
        timingCounts.merge(key, n, Long::sum);
        synchronized (totals) { totals.merge("timing " + key, n, Long::sum); }
    }

    /**
     * Today's 409 RETRYABLE_TRANSACTION_CONFLICT answers that a client retried with the same key: one per retried
     * answer, counted by {@link EmployeeActor#send} ("retryable &lt;kind&gt;") and {@link Burst} ("burst retryable").
     */
    long retriedConflicts() {
        long sum = 0;
        for (Map.Entry<String, Long> entry : timingCounts.entrySet()) {
            if (entry.getKey().equals("burst retryable") || entry.getKey().startsWith("retryable ")) sum += entry.getValue();
        }
        return sum;
    }

    /** Wall time spent per kind of event, for the day log only (never part of any summary). */
    void profile(String kind, long nanos) {
        profile.computeIfAbsent(kind, k -> new long[2]);
        long[] slot = profile.get(kind);
        slot[0] += nanos;
        slot[1]++;
    }

    void note(String actor, String line) {
        notes.add(clock.get() + " " + actor + " " + line);
    }

    void violation(String actor, String what) {
        String line = "seed=" + seed + " day=" + (dayIndex + 1) + " (" + date + ") persona=" + actor + " at " + clock.get() + ": " + what;
        violations.add(line);
        notes.add("VIOLATION " + line);
    }

    List<String> violations() { return List.copyOf(violations); }

    long total(String key) {
        synchronized (totals) { return totals.getOrDefault(key, 0L); }
    }

    Map<String, Long> totals() {
        synchronized (totals) { return new TreeMap<>(totals); }
    }

    List<String> summaries() { return List.copyOf(summaries); }

    /** day-NN.log with the driver notes and every HTTP exchange of the day; summary.txt gets one line. */
    String closeDay(HttpLog http, Map<String, Object> database) {
        StringBuilder line = new StringBuilder(String.format("day %02d %s", dayIndex + 1, date));
        database.forEach((key, value) -> line.append(' ').append(key).append('=').append(value));
        new TreeMap<>(counts).forEach((key, value) -> line.append(" | ").append(key).append('=').append(value));
        String deterministic = line.toString();
        StringBuilder full = new StringBuilder(deterministic).append(" || timing:");
        new TreeMap<>(timingCounts).forEach((key, value) -> full.append(' ').append(key).append('=').append(value));
        summaries.add(deterministic);
        List<String> log = new ArrayList<>();
        log.add(full.toString());
        StringBuilder spent = new StringBuilder("wall time:");
        profile.forEach((kind, slot) -> spent.append(' ').append(kind).append('=').append(slot[0] / 1_000_000).append("ms/").append(slot[1]));
        log.add(spent.toString());
        profile.clear();
        log.addAll(notes);
        log.add("---- HTTP exchanges (" + http.all().size() + ")");
        for (HttpLog.Exchange exchange : http.all()) log.add(exchange + " " + abbreviate(exchange.body()));
        try {
            Files.write(dir.resolve(String.format("day-%02d.log", dayIndex + 1)), log, StandardCharsets.UTF_8);
            Files.writeString(dir.resolve("summary.txt"), full + System.lineSeparator(), StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
        return full.toString();
    }

    void writeExtra(String name, List<String> lines) {
        try {
            Files.write(dir.resolve(name), lines, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    Path dir() { return dir; }

    private static String abbreviate(String raw) {
        if (raw == null) return "";
        String flat = raw.replace('\n', ' ');
        return flat.length() > 300 ? flat.substring(0, 300) + "..." : flat;
    }
}
