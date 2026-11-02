package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.CampaignTestBase;
import com.braja.fichaje.notifications.NotificationOutboxDispatcher;
import com.braja.fichaje.security.PrivacyRetentionScheduler;
import com.braja.fichaje.timekeeping.MarkScheduler;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S6, S7, S77 over the whole window (90 days, 2027-03-01 to 2027-05-29; -Dsim.days, -Dsim.seed; output in
 * target/simulation/) and S8 (same seed, same summary; -Dsim.s8.days, output in target/simulation/s8-first and s8-second).
 * Tagged {@code simulation}: excluded from the normal build, run with {@code ./mvnw -B verify -P simulation}.
 * S8 compares the deterministic part of every day's summary; the counts that depend on which thread wins a burst
 * (retried RETRYABLE conflicts) are kept after "|| timing:" in summary.txt and are not compared.
 */
@Tag("simulation")
class Simulation90DaysTest extends CampaignTestBase {
    /**
     * Accepted INGRESO (201) a simulated day must have. Every one of the twenty people in the roster has a jornada every
     * day of the week (WorldSetup.ROSTER: EVERY_DAY, or two sites whose weekdays cover the week), and DayPlanner skips a
     * jornada only with the persona's absentRate (at most 0.25): about 18 per day; 10 is a conservative floor
     * (the default seed's minimum over 90 days was 17), so a day below it did not really run.
     */
    static final int MIN_ACCEPTED_INGRESOS_PER_DAY = 10;

    @Autowired private MarkScheduler marks;
    @Autowired private NotificationOutboxDispatcher dispatcher;
    @Autowired private PrivacyRetentionScheduler privacy;
    @Autowired private PasswordEncoder passwords;

    @Test
    void s6s7s77NinetyDaysKeepEveryInvariantMatchTheOracleAndPinTheReactivationBacklog() {
        SimSettings settings = SimSettings.fromSystemProperties("sim.days", SimSettings.MAX_DAYS, null);
        SimulationDriver.Result result = SimulationHarness.run(settings, handles());

        assertEquals(settings.days() + 2, result.summaries().size());
        for (int day = 1; day <= settings.days(); day++) {
            String line = result.summaries().get(day);
            long ingresos = acceptedIngresos(line);
            assertTrue(ingresos >= MIN_ACCEPTED_INGRESOS_PER_DAY, "seed " + settings.seed() + " day " + day + " (" + settings.date(day - 1)
                    + "): " + ingresos + " INGRESO accepted, expected at least " + MIN_ACCEPTED_INGRESOS_PER_DAY + ": " + line);
        }
        if (settings.days() > AdminChaos.REACTIVATION_DAY) {
            assertTrue(result.s77().startsWith("S77 CHAR: reactivation"), result.s77());
            assertTrue(result.totals().getOrDefault("S77 reactivation backlog", 0L) > 0, result.s77());
        }
        if (settings.days() > AdminChaos.PAST_DECLARATION_DAY) assertTrue(result.s54().startsWith("S54 CHAR"), result.s54());
    }

    @Test
    void s8TheSameSeedGivesTheSameDailySummary() {
        int days = Integer.getInteger("sim.s8.days", 14);
        long seed = Long.getLong("sim.seed", SimSettings.DEFAULT_SEED);
        SimulationHarness.Handles handles = handles();
        List<String> first = SimulationHarness.run(new SimSettings(seed, days, java.nio.file.Path.of("target", "simulation", "s8-first")), handles).summaries();
        SimulationHarness.reset(handles);
        List<String> second = SimulationHarness.run(new SimSettings(seed, days, java.nio.file.Path.of("target", "simulation", "s8-second")), handles).summaries();

        for (int i = 0; i < Math.min(first.size(), second.size()); i++) {
            assertEquals(first.get(i), second.get(i), "seed " + seed + ": summary line " + i + " differs between two runs");
        }
        assertEquals(first.size(), second.size());
    }

    /** Sum of the day's "&lt;kind&gt; INGRESO 201" counts plus the burst double taps that created one ("burst pair [200, 201]"). */
    static long acceptedIngresos(String summaryLine) {
        String[] parts = summaryLine.split(" \\| ");
        long sum = 0;
        for (int i = 1; i < parts.length; i++) {
            int eq = parts[i].lastIndexOf('=');
            if (eq < 0) continue;
            String key = parts[i].substring(0, eq);
            if (key.endsWith(" INGRESO 201") || key.equals("burst pair [200, 201]")) sum += Long.parseLong(parts[i].substring(eq + 1).trim());
        }
        return sum;
    }

    private SimulationHarness.Handles handles() {
        return new SimulationHarness.Handles(jdbc, clock, json, fixture, httpLog, push, passwords, baseUrl(),
                new SimContext.JobBeans(marks, dispatcher, privacy));
    }
}
