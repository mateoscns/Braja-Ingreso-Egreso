package com.braja.fichaje.campaign;

import org.junit.jupiter.api.extension.ExtendWith;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * The test asserts the correct behaviour and is expected to fail until {@link #issue()} is fixed.
 * A failing assertion counts as passed; a pass fails with "remove @KnownDefect", so a fix never goes unnoticed.
 * Only assertion failures are tolerated: any other exception means the test itself broke.
 * {@link KnownDefectCeilingTest} keeps the number of these from growing (CLAUDE.md §3).
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.METHOD)
@ExtendWith(KnownDefectExtension.class)
public @interface KnownDefect {
    /** GitHub issue that tracks the fix, e.g. "#80". */
    String issue();

    /** What is wrong today, in one sentence. */
    String reason();
}
