package com.braja.fichaje.api;

import java.net.URI;

public record Problem(URI type, String title, int status, String detail, String code, String traceId) { }
