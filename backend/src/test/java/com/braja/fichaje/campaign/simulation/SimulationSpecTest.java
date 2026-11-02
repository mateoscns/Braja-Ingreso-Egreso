package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.CampaignTestBase;
import com.braja.fichaje.notifications.NotificationOutboxDispatcher;
import com.braja.fichaje.security.PrivacyRetentionScheduler;
import com.braja.fichaje.timekeeping.MarkScheduler;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * S6-S7 in the normal build: seven simulated days (-Dsim.spec.days, -Dsim.seed) of twenty employees at three sites in two
 * companies, with every persona, the ADMIN chaos of those days, one 20-thread burst and the epilogue purge. Each day
 * ends with every invariant, the independent oracle and the HTTP checks; the day logs go to target/simulation/spec/
 * (Simulation90DaysTest has its own -Dsim.days and writes to target/simulation/).
 */
class SimulationSpecTest extends CampaignTestBase {
    @Autowired private MarkScheduler marks;
    @Autowired private NotificationOutboxDispatcher dispatcher;
    @Autowired private PrivacyRetentionScheduler privacy;
    @Autowired private PasswordEncoder passwords;

    @Test
    void s6s7SevenDaysOfTwentyEmployeesKeepEveryInvariantAndTheDeviationsMatchTheOracle() {
        SimSettings settings = SimSettings.fromSystemProperties("sim.spec.days", 7, "spec");
        SimulationDriver.Result result = SimulationHarness.run(settings, handles());

        assertEquals(settings.days() + 2, result.summaries().size(), "setup, every day and the tail each close with a checkpoint");
        assertTrue(result.totals().getOrDefault("mark.normal INGRESO 201", 0L) > 10 * settings.days(), "people actually worked: " + result.totals());
        assertTrue(result.totals().keySet().stream().anyMatch(key -> key.startsWith("burst INGRESO") || key.startsWith("burst pair")) || settings.days() < 3,
                "the weekly burst ran");
    }

    private SimulationHarness.Handles handles() {
        return new SimulationHarness.Handles(jdbc, clock, json, fixture, httpLog, push, passwords, baseUrl(),
                new SimContext.JobBeans(marks, dispatcher, privacy));
    }
}
