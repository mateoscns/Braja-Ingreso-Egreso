package com.braja.fichaje.notifications;

import java.util.UUID;

public record SiteCount(UUID siteId, String siteName, long count) {
}
