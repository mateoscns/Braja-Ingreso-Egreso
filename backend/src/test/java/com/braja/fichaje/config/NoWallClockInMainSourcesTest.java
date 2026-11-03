package com.braja.fichaje.config;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * CLAUDE.md rule 28: server time comes only from the {@link TimeConfiguration} Clock bean, so tests can drive it.
 * 2026-11-01: 33 Instant.now() calls in 15 files made a 90-day simulation impossible; they now read the injected Clock.
 */
class NoWallClockInMainSourcesTest {
    private static final Path MAIN_SOURCES = Path.of("src", "main", "java");
    private static final List<String> WALL_CLOCK_CALLS = List.of(
            "Instant.now(", "Clock.system", "LocalDate.now(", "LocalTime.now(", "LocalDateTime.now(", "ZonedDateTime.now(",
            "OffsetDateTime.now(", "Year.now(", "YearMonth.now(", "System.currentTimeMillis(", "new Date()", "new java.util.Date()");
    private static final String ALLOWED_FILE = "TimeConfiguration.java";

    @Test
    void mainSourcesReadTimeOnlyFromTheClockBean() throws IOException {
        assertTrue(Files.isDirectory(MAIN_SOURCES), "run from the backend module: " + MAIN_SOURCES.toAbsolutePath());
        List<String> offenders = new ArrayList<>();
        try (Stream<Path> files = Files.walk(MAIN_SOURCES)) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
                if (file.getFileName().toString().equals(ALLOWED_FILE)) continue;
                List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
                for (int index = 0; index < lines.size(); index++) {
                    String line = lines.get(index);
                    for (String call : WALL_CLOCK_CALLS) {
                        if (line.contains(call)) offenders.add(MAIN_SOURCES.relativize(file) + ":" + (index + 1) + " " + line.strip());
                    }
                }
            }
        }
        assertEquals(List.of(), offenders, "read the injected java.time.Clock instead of the system clock");
    }
}
