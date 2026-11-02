package com.braja.fichaje.campaign;

import org.testcontainers.containers.MySQLContainer;

/**
 * One MySQL 8.4 container per JVM for every campaign suite, so the suites share a Spring context
 * instead of paying ~20 s per class. Testcontainers' Ryuk removes it when the JVM exits.
 */
final class SharedMySql {
    static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja")
            .withUsername("braja_test")
            .withPassword("braja_test_password")
            .withCommand("--default-time-zone=+00:00");

    static {
        MYSQL.start();
    }

    private SharedMySql() { }

    static String jdbcUrl() {
        return MYSQL.getJdbcUrl() + "?connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true";
    }
}
