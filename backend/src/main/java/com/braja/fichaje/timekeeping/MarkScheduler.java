package com.braja.fichaje.timekeeping;

import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

@Component
public class MarkScheduler {
    private final MarkService marks;

    public MarkScheduler(MarkService marks) { this.marks = marks; }

    @Scheduled(fixedDelayString = "PT15S")
    public void createDueAbsences() { marks.createDueAbsences(Instant.now(), 200); }

    @Scheduled(fixedDelayString = "PT5S")
    public void resolveLocationTimeouts() { marks.resolveLocationTimeouts(Instant.now()); }
}
