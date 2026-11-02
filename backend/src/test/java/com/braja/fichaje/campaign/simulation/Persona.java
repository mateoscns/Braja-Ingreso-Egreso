package com.braja.fichaje.campaign.simulation;

/**
 * How a simulated person uses the PWA. Probabilities are per jornada (or per tap where noted); every draw is keyed by
 * seed, person and day (see {@link Seeds}). The night shift is a template, not a persona: it changes the hours only.
 */
enum Persona {
    PUNCTUAL(0.02, 0.05, 1, 12, 0.02, Gps.NORMAL),
    LATE(0.03, 0.60, 5, 60, 0.02, Gps.NORMAL),
    ABSENT(0.25, 0.10, 1, 20, 0.02, Gps.NORMAL),
    /** No EGRESO most days; the ADMIN adds the forgotten mark the next morning. */
    FORGETFUL(0.02, 0.08, 1, 15, 0.60, Gps.NORMAL),
    /** 3 to 10 taps per action: replays, the same action again and wrong actions. */
    SPAMMER(0.02, 0.08, 1, 15, 0.02, Gps.NORMAL),
    /** Every action twice with the same Idempotency-Key. */
    DOUBLE_TAP(0.02, 0.08, 1, 15, 0.02, Gps.NORMAL),
    /** Loses the response of 30% of its marks and retries with the same key 15-25 s later. */
    OFFLINE_RETRY(0.02, 0.08, 1, 15, 0.02, Gps.NORMAL),
    NO_GPS(0.02, 0.08, 1, 15, 0.02, Gps.NONE),
    /** 300 m away or 150 m of accuracy half the time. */
    OUTSIDE(0.02, 0.08, 1, 15, 0.02, Gps.OUTSIDE),
    /** Location 31 s after the mark, after the window closed, half the time. */
    LATE_LOCATION(0.02, 0.08, 1, 15, 0.02, Gps.LATE),
    /** Breaks over their limit and EGRESO tried with the lunch still open. */
    BREAK_ABUSER(0.02, 0.10, 1, 15, 0.02, Gps.NORMAL),
    /** Taps EGRESO by mistake two hours in, a quarter of the days; the ADMIN voids it 40 minutes later. */
    EARLY_EGRESS(0.02, 0.08, 1, 15, 0.02, Gps.NORMAL),
    /** Foreign ids, ADMIN routes, no CSRF and hostile text from a valid employee session. */
    MALICIOUS(0.02, 0.08, 1, 15, 0.02, Gps.NORMAL),
    /** Works at two sites of one company. */
    MULTI_SITE(0.02, 0.08, 1, 15, 0.02, Gps.NORMAL),
    /** One account with an employee row in two companies; switches the active company before marking. */
    MULTI_COMPANY(0.02, 0.08, 1, 15, 0.02, Gps.NORMAL),
    NIGHT_SHIFT(0.02, 0.08, 1, 15, 0.02, Gps.LATE);

    enum Gps { NORMAL, NONE, OUTSIDE, LATE }

    final double absentRate;
    final double lateRate;
    final int lateMinMinutes, lateMaxMinutes;
    final double forgetEgressRate;
    final Gps gps;

    Persona(double absentRate, double lateRate, int lateMinMinutes, int lateMaxMinutes, double forgetEgressRate, Gps gps) {
        this.absentRate = absentRate;
        this.lateRate = lateRate;
        this.lateMinMinutes = lateMinMinutes;
        this.lateMaxMinutes = lateMaxMinutes;
        this.forgetEgressRate = forgetEgressRate;
        this.gps = gps;
    }
}
