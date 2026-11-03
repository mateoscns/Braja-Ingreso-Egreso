package com.braja.fichaje.api;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/** CLAUDE.md rule 25, issue #76: every invisible character below is written as a code point, never raw. */
class HostileTextTest {
    /** Builds a string from code points so no invisible character lives in this source. */
    private static String of(int... points) {
        return new String(points, 0, points.length);
    }

    @Test
    void legitimateTextIsKeptUnchanged() {
        List<String> legitimate = List.of(
                "Peña Muñoz, José Ángel",
                "Camión de las 7:00 — llegó 15' tarde (¡otra vez!)",
                "Ana " + of(0x1F600),                                  // grinning face
                of(0x1F469, 0x200D, 0x1F4BB),                          // woman technologist: ZWJ between pictographs
                of(0x1F469, 0x1F3FD, 0x200D, 0x1F4BB),                 // with a skin tone before the ZWJ
                of(0x1F468, 0x200D, 0x1F469, 0x200D, 0x1F467),         // family
                of(0x2764, 0xFE0F, 0x200D, 0x1F525),                   // heart on fire: VS16 before the ZWJ
                of(0x1F3F3, 0xFE0F, 0x200D, 0x1F308),                  // rainbow flag
                of(0x1F3F4, 0xE0067, 0xE0062, 0xE0065, 0xE006E, 0xE0067, 0xE007F), // England: a complete tag sequence
                of('1', 0xFE0F, 0x20E3),                               // keycap one
                of(0x0645, 0x06CC, 0x200C, 0x062E, 0x0648, 0x0627, 0x0647, 0x0645)); // Persian ZWNJ between letters
        for (String text : legitimate) {
            assertEquals(text, HostileText.singleLine(text), text);
            assertEquals(text, HostileText.multiline(text), text);
        }
    }

    @Test
    void controlCharactersAreRemovedAndWhitespaceControlsBecomeSpaces() {
        assertEquals("nulbelansi", HostileText.singleLine(of(0x0000, 'n', 'u', 'l', 0x0007, 'b', 'e', 'l', 0x001B) + "ansi"));
        assertEquals("deladc1", HostileText.singleLine("del" + of(0x007F) + "a" + of(0x0090) + "d" + of(0x009F) + "c1"));
        assertEquals("a b c d", HostileText.singleLine("a" + of(0x0009) + "b" + of(0x000B) + "c" + of(0x000C) + "d"));
        assertEquals("a b", HostileText.singleLine("a" + of(0x00A0) + "b"));
    }

    @Test
    void lineBreaksStayAsLineFeedsOnlyInMultilineText() {
        String text = "uno" + of(0x000D, 0x000A) + "dos" + of(0x000D) + "tres" + of(0x0085) + "cuatro" + of(0x2028) + "cinco" + of(0x000A) + "seis";
        assertEquals("uno\ndos\ntres\ncuatro\ncinco\nseis", HostileText.multiline(text));
        assertEquals("uno dos tres cuatro cinco seis", HostileText.singleLine(text));
        assertEquals("Ana", HostileText.singleLine(of(0x000A) + " Ana " + of(0x000D, 0x000A)));
    }

    @Test
    void bidiCharactersAreRemoved() {
        int[] bidi = {0x200E, 0x200F, 0x061C, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069};
        for (int point : bidi) {
            assertEquals("abc", HostileText.singleLine("a" + of(point) + "bc"), Integer.toHexString(point));
            assertEquals("abc", HostileText.multiline("a" + of(point) + "bc"), Integer.toHexString(point));
        }
        // The classic file-name spoof: "invoice[RLO]fdp.exe".
        assertEquals("invoicefdp.exe", HostileText.singleLine("invoice" + of(0x202E) + "fdp.exe"));
    }

    @Test
    void zeroWidthAndOtherInvisibleCharactersAreRemoved() {
        int[] invisible = {0x200B, 0x2060, 0xFEFF, 0x00AD, 0x034F, 0x180E, 0x2061, 0x3164, 0xFFA0, 0x1D173};
        for (int point : invisible) {
            assertEquals("Centro", HostileText.singleLine("Cen" + of(point) + "tro"), Integer.toHexString(point));
        }
        assertEquals("Centro", HostileText.singleLine("Cen" + of(0x200C) + "tro"));  // ZWNJ between Latin letters
        assertEquals("Centro", HostileText.singleLine("Cen" + of(0x200D) + "tro"));  // ZWJ between letters
        assertEquals(of(0x1F600) + "a", HostileText.singleLine(of(0x1F600, 0x200D) + "a")); // ZWJ not before a pictograph
        assertEquals("a" + of(0x1F600), HostileText.singleLine("a" + of(0x200D, 0x1F600))); // ZWJ not after a pictograph
        assertEquals(of(0x1F600, 0x1F600), HostileText.singleLine(of(0x1F600, 0x200D, 0x200D, 0x1F600)));
    }

    @Test
    void hiddenPayloadsInTagsAndVariationSelectorsAreRemoved() {
        // ASCII smuggling: tag characters that spell "hi" after visible text.
        assertEquals("hola", HostileText.singleLine("hola" + of(0xE0068, 0xE0069)));
        // A black flag followed by tags without the closing cancel tag is not a flag.
        assertEquals(of(0x1F3F4), HostileText.singleLine(of(0x1F3F4, 0xE0067, 0xE0062)));
        // Bytes hidden in a run of variation selectors keep at most the first presentation selector.
        assertEquals(of(0x1F600, 0xFE0F), HostileText.singleLine(of(0x1F600, 0xFE0F, 0xFE01, 0xE0100, 0xE01EF)));
        assertEquals(of(0x1F600), HostileText.singleLine(of(0x1F600, 0xFE00, 0xFE01)));
        // A variation selector with no visible character before it is dropped.
        assertEquals("a", HostileText.singleLine(of(0xFE0F) + "a"));
        // One selector after each letter would still carry a byte per letter: selectors only follow emoji (FE0E/FE0F)
        // or a CJK ideograph (E0100-E01EF), never a Latin letter.
        assertEquals("abc", HostileText.singleLine("a" + of(0xE0100) + "b" + of(0xE0101) + "c" + of(0xFE0F)));
        assertEquals("abc", HostileText.multiline("a" + of(0xFE00) + "b" + of(0xFE0E) + "c"));
        assertEquals(of(0x2764, 0xFE0E), HostileText.singleLine(of(0x2764, 0xFE0E)));   // text presentation of an emoji
        assertEquals(of(0x845B, 0xE0100), HostileText.singleLine(of(0x845B, 0xE0100))); // ideographic variant of a CJK character
        assertEquals(of(0x845B), HostileText.singleLine(of(0x845B, 0xFE0F)));
    }

    @Test
    void interlinearAnnotationAndObjectReplacementCharactersAreRemoved() {
        for (int point : new int[]{0xFFF9, 0xFFFA, 0xFFFB, 0xFFFC}) {
            assertEquals("abc", HostileText.singleLine("a" + of(point) + "bc"), Integer.toHexString(point));
            assertEquals("abc", HostileText.multiline("a" + of(point) + "bc"), Integer.toHexString(point));
        }
    }

    @Test
    void loneSurrogatesAndNoncharactersAreRemoved() {
        assertEquals("ab", HostileText.singleLine("a\uD800b"));
        assertEquals("ab", HostileText.singleLine("a\uDC00b"));
        assertEquals("ab", HostileText.singleLine("a\uDC00\uD800b"));
        assertEquals("ab", HostileText.singleLine("a" + of(0xFFFE, 0xFDD0, 0x1FFFF) + "b"));
    }

    @Test
    void resultIsNfcEvenWhenAnInvisibleCharacterSplitTheSequence() {
        assertEquals("José", HostileText.singleLine("Jose" + of(0x0301)));
        assertEquals("José", HostileText.singleLine("Jose" + of(0x200B, 0x0301)));
        assertEquals("Ñandú", HostileText.multiline("N" + of(0x0303) + "andu" + of(0x0301)));
    }

    @Test
    void invisibleOnlyTextBecomesBlankAndNullStaysNull() {
        assertEquals("", HostileText.singleLine(of(0x200B, 0x200D, 0xFEFF)));
        assertEquals("", HostileText.singleLine(of(0x0000, 0x00A0, 0x3000, 0x202E)));
        assertEquals("", HostileText.multiline(of(0x200B, 0x2066, 0x2069)));
        assertNull(HostileText.singleLine(null));
        assertNull(HostileText.multiline(null));
    }

    @Test
    void cleaningIsIdempotent() {
        List<String> samples = List.of(
                of(0x0000) + "nul" + of(0x0007, 0x001B) + "[31m" + of(0x0009, 0x000D, 0x007F, 0x0085, 0x202E) + "rlo" + of(0x202C, 0x2066)
                        + "iso" + of(0x2069, 0x200B) + "zw" + of(0x200C, 0x200D, 0xFEFF) + "bom" + of(0x000A) + "line",
                of(0x1F600, 0x200B, 0x200D, 0x1F600, 0xFE0F, 0xFE0F, 0x200D, 0x200C, 0x1F4BB),
                of(0x0645, 0x200C, 0x200C, 0x062E, 0x200D, 0x062E),
                "e" + of(0x200B, 0x0301, 0xFE00, 0x0301) + " " + of(0x1F3F4, 0xE0067, 0xE007F, 0xE0067));
        for (String sample : samples) {
            String single = HostileText.singleLine(sample);
            String multi = HostileText.multiline(sample);
            assertEquals(single, HostileText.singleLine(single));
            assertEquals(multi, HostileText.multiline(multi));
        }
    }
}
