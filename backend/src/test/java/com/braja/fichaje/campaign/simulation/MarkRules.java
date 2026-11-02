package com.braja.fichaje.campaign.simulation;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

/**
 * The mark rules of docs/ESPECIFICACION.md "Marcas y orden", written from the text and independent of the production
 * MarkTransitionPolicy and MarkState: INGRESO first and once; at most one cycle of each pause, in any order; one pause
 * open at a time (the state model has a single PAUSA_ABIERTA); no EGRESO with a pause open; nothing after EGRESO.
 * INGRESO is accepted from 30 minutes before the scheduled start, every other action from the start.
 */
final class MarkRules {
    static final List<String> ACTIONS = List.of("INGRESO", "SALIDA_DESAYUNO", "VUELTA_DESAYUNO", "SALIDA_ALMUERZO",
            "VUELTA_ALMUERZO", "EGRESO");
    static final Duration EARLY_INGRESO = Duration.ofMinutes(30);

    private MarkRules() { }

    static boolean allowed(List<String> history, String next) {
        if (!ACTIONS.contains(next)) return false;
        if (history.contains("EGRESO")) return false;
        String open = openPause(history);
        if (open != null) return next.equals("VUELTA_" + open);
        if (!history.contains("INGRESO")) return next.equals("INGRESO");
        return switch (next) {
            case "INGRESO", "VUELTA_DESAYUNO", "VUELTA_ALMUERZO" -> false;
            case "SALIDA_DESAYUNO", "SALIDA_ALMUERZO" -> !history.contains(next);
            default -> true; // EGRESO with no pause open
        };
    }

    static boolean validHistory(List<String> history) {
        for (int i = 0; i < history.size(); i++) {
            if (!allowed(history.subList(0, i), history.get(i))) return false;
        }
        return true;
    }

    /** NO_INGRESO, EN_CURSO, PAUSA_ABIERTA or EGRESADA, from the marks that count, in timeline order. */
    static String state(List<String> history) {
        if (history.isEmpty()) return "NO_INGRESO";
        if (history.contains("EGRESO")) return "EGRESADA";
        return openPause(history) != null ? "PAUSA_ABIERTA" : "EN_CURSO";
    }

    static Instant earliest(String action, Instant scheduledStart) {
        return "INGRESO".equals(action) ? scheduledStart.minus(EARLY_INGRESO) : scheduledStart;
    }

    /** DESAYUNO or ALMUERZO when the last mark opened that pause, otherwise null. */
    static String openPause(List<String> history) {
        if (history.isEmpty()) return null;
        String last = history.getLast();
        return last.startsWith("SALIDA_") ? last.substring("SALIDA_".length()) : null;
    }
}
