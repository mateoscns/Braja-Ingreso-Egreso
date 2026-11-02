package com.braja.fichaje.campaign.simulation;

import java.nio.file.Path;
import java.time.LocalDate;

/**
 * Run parameters: {@code -Dsim.seed} (default 20270301) and the number of days, read from the property the test names
 * ({@code -Dsim.spec.days} for the 7-day SimulationSpecTest, {@code -Dsim.days} for Simulation90DaysTest), at most 90:
 * the window is 2027-03-01 to 2027-05-29, which includes Chile's fall-back on 2027-04-04. Each test writes to its own
 * directory under target/simulation, so neither erases the other's summary.txt and day logs.
 */
record SimSettings(long seed, int days, Path outputDir) {
    static final LocalDate FIRST_DAY = LocalDate.parse("2027-03-01");
    static final int MAX_DAYS = 90;
    static final long DEFAULT_SEED = 20270301L;

    SimSettings {
        if (days < 1 || days > MAX_DAYS) throw new IllegalArgumentException("the number of days must be 1 to " + MAX_DAYS + ", got " + days);
    }

    static SimSettings fromSystemProperties(String daysProperty, int defaultDays, String outputSubdir) {
        long seed = Long.getLong("sim.seed", DEFAULT_SEED);
        int days = Integer.getInteger(daysProperty, defaultDays);
        if (days < 1 || days > MAX_DAYS) throw new IllegalArgumentException(daysProperty + " must be 1 to " + MAX_DAYS + ", got " + days);
        Path base = Path.of("target", "simulation");
        return new SimSettings(seed, days, outputSubdir == null ? base : base.resolve(outputSubdir));
    }

    SimSettings withOutput(String subdir) {
        return new SimSettings(seed, days, Path.of("target", "simulation").resolve(subdir));
    }

    LocalDate date(int dayIndex) {
        return FIRST_DAY.plusDays(dayIndex);
    }
}
