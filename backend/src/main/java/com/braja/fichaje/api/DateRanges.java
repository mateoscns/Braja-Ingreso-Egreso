package com.braja.fichaje.api;

import java.time.LocalDate;

/** Shared validation of local-date query ranges (rule 15: bounded on both sides). */
public final class DateRanges {
    private static final int MIN_YEAR = 2000;
    private static final int MAX_YEAR = 2100;
    private static final int MAX_SPAN_DAYS = 366;

    private DateRanges() { }

    /** Rejects implausible years (which would overflow date arithmetic), inverted ranges and spans over 366 days; either end may be null. */
    public static void validate(LocalDate from, LocalDate to) {
        if (outOfBounds(from) || outOfBounds(to)) throw ApiException.invalid("Dates must be between years " + MIN_YEAR + " and " + MAX_YEAR);
        if (from != null && to != null && (to.isBefore(from) || to.isAfter(from.plusDays(MAX_SPAN_DAYS)))) {
            throw ApiException.invalid("Date range must be ordered and no longer than 366 days");
        }
    }

    private static boolean outOfBounds(LocalDate date) { return date != null && (date.getYear() < MIN_YEAR || date.getYear() > MAX_YEAR); }
}
