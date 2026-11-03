package com.braja.fichaje.api;

import java.text.Normalizer;
import java.util.EnumSet;
import java.util.Set;

/**
 * Cleans free text that another person reads: names, motives and the ADMIN's reasons (CLAUDE.md rule 25, issue #76).
 * The cleaning is deterministic and idempotent, so it runs in the request records before Bean Validation and the
 * length caps count the cleaned text; a value left blank is refused by the field's existing {@code @NotBlank}.
 *
 * <ul>
 *   <li>Line breaks (CR LF, CR, LF, NEL U+0085, U+2028, U+2029) become one LF in multiline text and a space in a
 *       single-line value; tab, VT, FF and every space separator (NBSP and the like) become U+0020.</li>
 *   <li>Every other C0 or C1 control, DEL, lone surrogate and noncharacter is removed.</li>
 *   <li>Every Unicode default-ignorable code point is removed: bidi marks, embeddings, overrides and isolates
 *       (U+200E, U+200F, U+061C, U+202A-U+202E, U+2066-U+2069), zero-width space, word joiner and BOM (U+200B,
 *       U+2060, U+FEFF), soft hyphen, fillers and tag characters, with three exceptions that keep legitimate text:
 *       <ul>
 *         <li>U+200D ZERO WIDTH JOINER stays only inside an emoji sequence: after a pictograph, a skin-tone modifier or
 *             VS16, and before a pictograph.</li>
 *         <li>U+200C ZERO WIDTH NON-JOINER stays only between two characters of a script that needs it (Persian,
 *             Arabic, Syriac and the Indic scripts).</li>
 *         <li>A variation selector stays only where it shows: U+FE0E/U+FE0F after an emoji base and U+E0100-U+E01EF
 *             after a Han character, never a second one in a row, so selectors cannot smuggle hidden bytes. Tag
 *             characters stay only in a complete subdivision flag (U+1F3F4, tags, U+E007F). U+FFF9-U+FFFC are
 *             removed.</li>
 *       </ul></li>
 *   <li>The result is normalized to NFC; a single-line value is also stripped of leading and trailing spaces.</li>
 * </ul>
 * Stored rows written before this cleaner existed are not migrated.
 */
public final class HostileText {
    private static final int ZWJ = 0x200D;
    private static final int ZWNJ = 0x200C;
    private static final int VS16 = 0xFE0F;
    private static final int BLACK_FLAG = 0x1F3F4;
    private static final int CANCEL_TAG = 0xE007F;
    private static final Set<Character.UnicodeScript> NON_JOINER_SCRIPTS = EnumSet.of(Character.UnicodeScript.ARABIC,
            Character.UnicodeScript.SYRIAC, Character.UnicodeScript.DEVANAGARI, Character.UnicodeScript.BENGALI,
            Character.UnicodeScript.GURMUKHI, Character.UnicodeScript.GUJARATI, Character.UnicodeScript.ORIYA,
            Character.UnicodeScript.TAMIL, Character.UnicodeScript.TELUGU, Character.UnicodeScript.KANNADA,
            Character.UnicodeScript.MALAYALAM, Character.UnicodeScript.SINHALA);

    private HostileText() { }

    /** For names: no line breaks, trimmed. Null stays null. */
    public static String singleLine(String text) {
        return text == null ? null : clean(text, false).strip();
    }

    /** For motives and reasons, which the PWA edits in a text area: line feeds stay. Null stays null. */
    public static String multiline(String text) {
        return text == null ? null : clean(text, true);
    }

    private static String clean(String text, boolean multiline) {
        int[] points = text.codePoints().toArray();
        int[] kept = new int[points.length];
        int size = 0;
        for (int i = 0; i < points.length; i++) {
            int point = points[i];
            if (point == '\r' || point == '\n' || point == 0x0085 || point == 0x2028 || point == 0x2029) {
                if (point == '\r' && i + 1 < points.length && points[i + 1] == '\n') i++;
                kept[size++] = multiline ? '\n' : ' ';
            } else if (point == '\t' || point == 0x0B || point == 0x0C || Character.getType(point) == Character.SPACE_SEPARATOR) {
                kept[size++] = ' ';
            } else if (point == BLACK_FLAG) {
                int end = tagSequenceEnd(points, i);
                for (int j = i; j <= end; j++) kept[size++] = points[j];
                i = end;
            } else if (isVariationSelector(point)) {
                if (size > 0 && selectorFits(kept[size - 1], point)) kept[size++] = point;
            } else if (point == ZWJ || point == ZWNJ || !isRemoved(point)) {
                kept[size++] = point;
            }
        }
        StringBuilder out = new StringBuilder(size);
        for (int i = 0; i < size; i++) {
            int point = kept[i];
            int before = i > 0 ? kept[i - 1] : -1;
            int after = i + 1 < size ? kept[i + 1] : -1;
            if (point == ZWJ && !(joinsEmojiBefore(before) && after >= 0 && Character.isExtendedPictographic(after))) continue;
            if (point == ZWNJ && !splitsJoiningScript(before, after)) continue;
            out.appendCodePoint(point);
        }
        return Normalizer.normalize(out, Normalizer.Form.NFC);
    }

    /** The index of the cancel tag closing a subdivision flag that starts at {@code start}, or {@code start} alone. */
    private static int tagSequenceEnd(int[] points, int start) {
        int j = start + 1;
        while (j < points.length && points[j] >= 0xE0020 && points[j] <= 0xE007E) j++;
        return j > start + 1 && j < points.length && points[j] == CANCEL_TAG ? j : start;
    }

    private static boolean isRemoved(int point) {
        return point <= 0x1F || (point >= 0x7F && point <= 0x9F)
                || (point >= 0xD800 && point <= 0xDFFF)
                || (point >= 0xFDD0 && point <= 0xFDEF) || (point & 0xFFFE) == 0xFFFE
                || (point >= 0xFFF9 && point <= 0xFFFC) // interlinear annotation anchors and the object replacement character
                || isDefaultIgnorable(point);
    }

    /** Unicode DerivedCoreProperties Default_Ignorable_Code_Point. */
    private static boolean isDefaultIgnorable(int point) {
        return point == 0x00AD || point == 0x034F || point == 0x061C || point == 0x115F || point == 0x1160
                || point == 0x17B4 || point == 0x17B5 || (point >= 0x180B && point <= 0x180F)
                || (point >= 0x200B && point <= 0x200F) || (point >= 0x202A && point <= 0x202E)
                || (point >= 0x2060 && point <= 0x206F) || point == 0x3164 || (point >= 0xFE00 && point <= 0xFE0F)
                || point == 0xFEFF || point == 0xFFA0 || (point >= 0xFFF0 && point <= 0xFFF8)
                || (point >= 0x1BCA0 && point <= 0x1BCA3) || (point >= 0x1D173 && point <= 0x1D17A)
                || (point >= 0xE0000 && point <= 0xE0FFF);
    }

    private static boolean isVariationSelector(int point) {
        return (point >= 0xFE00 && point <= 0xFE0F) || (point >= 0xE0100 && point <= 0xE01EF);
    }

    /**
     * A selector stays only where it has a visible effect, so it cannot carry hidden bytes (one selector after every letter
     * would carry a byte per letter): U+FE0E/U+FE0F after an emoji base (text or emoji presentation, keycaps included), and an
     * ideographic variation selector (U+E0100-U+E01EF) after a Han character. Anything else, including a second selector, goes.
     */
    private static boolean selectorFits(int base, int selector) {
        if (selector == 0xFE0E || selector == VS16) return Character.isEmoji(base);
        if (selector >= 0xE0100 && selector <= 0xE01EF) return Character.UnicodeScript.of(base) == Character.UnicodeScript.HAN;
        return false;
    }

    private static boolean joinsEmojiBefore(int point) {
        return point >= 0 && (Character.isExtendedPictographic(point) || Character.isEmojiModifier(point) || point == VS16);
    }

    private static boolean splitsJoiningScript(int before, int after) {
        if (before < 0 || after < 0) return false;
        Character.UnicodeScript script = Character.UnicodeScript.of(before);
        return NON_JOINER_SCRIPTS.contains(script) && Character.UnicodeScript.of(after) == script;
    }
}
