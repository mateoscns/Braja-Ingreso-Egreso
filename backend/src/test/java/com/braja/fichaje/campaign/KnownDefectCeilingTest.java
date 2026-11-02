package com.braja.fichaje.campaign;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** A ceiling that only goes down (CLAUDE.md §3): a new known defect needs its issue and a raised number in review. */
class KnownDefectCeilingTest {
    /** Known defects open on 2026-11-02 (S28 missing Idempotency-Key code, S23 malformed JSON code, S42 re-anchor on rounded accuracy, S67 N+1 in /employees, /templates and /jornadas/mine, S22 hostile text not cleaned, S73 MVC errors without problem code, S10 undocumented 404, S11 security problems without traceId, S11 framework errors without code, S64 first-mark gap deadlock, S63 bulk mixed template snapshot). Lower it when one is fixed; raise it only with the defect's issue. */
    private static final int CEILING = 13;
    /** The extension's own test annotates a sample method; it is not a defect. */
    private static final String SELF_TEST = "KnownDefectExtensionTest.java";
    private static final Pattern USE = Pattern.compile("^\\s*@KnownDefect\\(", Pattern.MULTILINE);

    @Test
    void knownDefectsNeverGrowPastTheCeiling() throws IOException {
        int count = 0;
        try (Stream<Path> files = Files.walk(Path.of("src", "test", "java"))) {
            for (Path file : files.filter(path -> path.toString().endsWith(".java"))
                    .filter(path -> !path.getFileName().toString().equals(SELF_TEST)).toList()) {
                Matcher matcher = USE.matcher(Files.readString(file, StandardCharsets.UTF_8));
                while (matcher.find()) count++;
            }
        }
        assertTrue(count <= CEILING, count + " @KnownDefect tests exceed the ceiling of " + CEILING
                + ": a new known defect needs its issue and a reviewed raise");
        assertEquals(CEILING, count, "a known defect was fixed: lower CEILING to " + count);
    }
}
