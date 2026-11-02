package com.braja.fichaje.campaign;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** Every HTTP exchange of a test or a simulated day, so invariant I11 can check all of them at once. */
public final class HttpLog {
    public record Exchange(String actor, String method, String path, int status, String code, String body) {
        boolean isServerError() { return status >= 500; }
        boolean isProblemWithoutCode() { return status >= 400 && status < 500 && (code == null || code.isBlank()); }

        @Override
        public String toString() {
            return actor + " " + method + " " + path + " -> " + status + (code != null ? " " + code : "");
        }
    }

    private final List<Exchange> exchanges = new CopyOnWriteArrayList<>();

    void record(Exchange exchange) {
        exchanges.add(exchange);
    }

    public List<Exchange> all() {
        return List.copyOf(exchanges);
    }

    public List<Exchange> serverErrors() {
        return exchanges.stream().filter(Exchange::isServerError).toList();
    }

    public List<Exchange> problemsWithoutCode() {
        return exchanges.stream().filter(Exchange::isProblemWithoutCode).toList();
    }

    public void clear() {
        exchanges.clear();
    }
}
