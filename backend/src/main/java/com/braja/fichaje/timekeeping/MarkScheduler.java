package com.braja.fichaje.timekeeping;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;

@Component
public class MarkScheduler {
    private final MarkService marks;

    private final Clock clock;

    public MarkScheduler(MarkService marks, Clock clock) {
        this.marks = marks;
        this.clock = clock;
    }

    @Scheduled(fixedDelayString = "PT15S")
    public void createDueAbsences() { marks.createDueAbsences(clock.instant(), 200); }

    @Scheduled(fixedDelayString = "PT5S")
    public void resolveLocationTimeouts() { marks.resolveLocationTimeouts(clock.instant()); }
}
