package com.braja.fichaje.campaign.simulation;

import java.util.SplittableRandom;

/**
 * Every random choice of the simulation comes from a generator keyed by the run seed and a stable description of the
 * choice (persona, day, deviation...), never from a shared sequence or from thread timing. So the same seed gives the
 * same choices whatever order the server returns rows in, and S8 (same seed, same summary) holds.
 */
final class Seeds {
    private Seeds() { }

    /** SplitMix64 finalizer: a fixed, JVM-independent 64-bit mix. */
    static long mix(long z) {
        z = (z ^ (z >>> 30)) * 0xbf58476d1ce4e5b9L;
        z = (z ^ (z >>> 27)) * 0x94d049bb133111ebL;
        return z ^ (z >>> 31);
    }

    static long key(long seed, Object... parts) {
        long h = mix(seed);
        for (Object part : parts) {
            String text = String.valueOf(part);
            for (int i = 0; i < text.length(); i++) h = mix(h ^ text.charAt(i));
            h = mix(h ^ 0x9E3779B97F4A7C15L);
        }
        return h;
    }

    static SplittableRandom random(long seed, Object... parts) {
        return new SplittableRandom(key(seed, parts));
    }

    static boolean chance(long seed, double probability, Object... parts) {
        return random(seed, parts).nextDouble() < probability;
    }

    /** Uniform integer in [from, to] inclusive. */
    static int between(SplittableRandom random, int from, int to) {
        return from + random.nextInt(to - from + 1);
    }
}
