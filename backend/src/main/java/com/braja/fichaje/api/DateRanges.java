package com.braja.fichaje.api;

import java.time.LocalDate;

/** Shared validation of local dates and local-date query ranges (rule 15: bounded on both sides). */
public final class DateRanges {
    private static final int MIN_YEAR = 2000;
    private static final int MAX_YEAR = 2100;
    private static final int MAX_SPAN_DAYS = 366;

    private DateRanges() { }

    /** Rejects implausible years (which would overflow date arithmetic), inverted ranges and spans over 366 days inclusive; either end may be null. */
    public static void validate(LocalDate from, LocalDate to) {
        if (outOfBounds(from) || outOfBounds(to)) throw yearsOutOfBounds();
        if (from != null && to != null && (to.isBefore(from) || to.isAfter(from.plusDays(MAX_SPAN_DAYS - 1)))) {
            throw ApiException.invalid("Date range must be ordered and no longer than 366 days");
        }
    }

    /** Rejects a single local date outside the years 2000-2100; null is left to the caller's required-field check. */
    public static void validateDate(LocalDate date) {
        if (outOfBounds(date)) throw yearsOutOfBounds();
    }

    private static ApiException yearsOutOfBounds() { return ApiException.invalid("Dates must be between years " + MIN_YEAR + " and " + MAX_YEAR); }

    private static boolean outOfBounds(LocalDate date) { return date != null && (date.getYear() < MIN_YEAR || date.getYear() > MAX_YEAR); }
}
