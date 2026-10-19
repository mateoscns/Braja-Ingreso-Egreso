package com.braja.fichaje.notifications;

import java.util.List;

public record SafePushPayload(
        String tag,
        String title,
        String body,
        String navigation,
        long totalCount,
        List<SiteCount> siteCounts) {
}
