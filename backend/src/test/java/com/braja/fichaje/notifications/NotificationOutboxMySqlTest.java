package com.braja.fichaje.notifications;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.braja.fichaje.config.BrajaProperties;
import com.braja.fichaje.deviations.DeviationService;
import com.braja.fichaje.security.CurrentActor;
import com.braja.fichaje.security.EncryptionService;
import com.braja.fichaje.security.ScopeService;
import com.braja.fichaje.timekeeping.MarkAction;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class NotificationOutboxMySqlTest {

    @Container
    private static final MySQLContainer<?> MYSQL = new MySQLContainer<>("mysql:8.4")
            .withDatabaseName("braja_notifications")
            .withUsername("braja")
            .withPassword("braja");

    private static JdbcTemplate jdbc;
    private static TransactionTemplate transactions;

    @BeforeAll
    static void migrateSchema() {
        String baseUrl = MYSQL.getJdbcUrl();
        String separator = baseUrl.contains("?") ? "&" : "?";
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                baseUrl + separator + "connectionTimeZone=UTC&forceConnectionTimeZoneToSession=true",
                MYSQL.getUsername(), MYSQL.getPassword());
        Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate();
        jdbc = new JdbcTemplate(dataSource);
        transactions = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
    }

    @Test
    void groupsByFirstEventForFiveMinutesAndReplacementKeepsOneOutboxEvent() {
        Fixture fixture = createFixture();
        BrajaProperties properties = enabledPushProperties();
        DeviationNotificationPort port = new JdbcDeviationNotificationOutbox(jdbc, properties,
                new NotificationWindowPolicy());
        Instant first = Instant.parse("2026-10-16T12:02:17.123456Z");
        UUID firstDeviation = createDeviation(fixture, fixture.siteOne(), fixture.employeeOne(), "SIN_INGRESO");
        UUID secondDeviation = createDeviation(fixture, fixture.siteTwo(), fixture.employeeTwo(), "LLEGADA_TARDE");

        inTransaction(() -> port.enqueue(fixture.company(), fixture.siteOne(), firstDeviation,
                "SIN_INGRESO", first));
        inTransaction(() -> port.enqueue(fixture.company(), fixture.siteTwo(), secondDeviation,
                "LLEGADA_TARDE", first.plusSeconds(299)));

        assertEquals(2, count("SELECT COUNT(*) FROM notification_outbox_events WHERE company_id = ?",
                fixture.company()));
        assertEquals(1, count("SELECT COUNT(DISTINCT window_id) FROM notification_outbox_events WHERE company_id = ?",
                fixture.company()));
        assertEquals(1, count("SELECT COUNT(*) FROM notification_windows WHERE company_id = ?",
                fixture.company()));

        jdbc.update("UPDATE deviations SET type = 'LLEGADA_TARDE' WHERE id = ?", firstDeviation.toString());
        inTransaction(() -> port.enqueue(fixture.company(), fixture.siteOne(), firstDeviation,
                "LLEGADA_TARDE", first.plusSeconds(300)));

        assertEquals(2, count("SELECT COUNT(*) FROM notification_outbox_events WHERE company_id = ?",
                fixture.company()));
        assertEquals(1, count("SELECT COUNT(*) FROM notification_windows WHERE company_id = ?",
                fixture.company()));
        assertEquals(1, count("""
                SELECT COUNT(*) FROM notification_outbox_events
                WHERE deviation_id = ? AND deviation_type = 'LLEGADA_TARDE'
                """, firstDeviation));
    }

    @Test
    void missingEgressDeviationNeverEntersTheOutboxOrOpensAWindow() {
        Fixture fixture = createFixture();
        DeviationNotificationPort port = new JdbcDeviationNotificationOutbox(jdbc,
                enabledPushProperties(), new NotificationWindowPolicy());
        UUID deviation = createDeviation(fixture, fixture.siteOne(), fixture.employeeOne(), "MARCA_FALTANTE");

        inTransaction(() -> port.enqueue(fixture.company(), fixture.siteOne(), deviation,
                "MARCA_FALTANTE", Instant.parse("2026-10-16T20:30:00Z")));

        assertEquals(0, count("SELECT COUNT(*) FROM notification_outbox_events WHERE company_id = ?", fixture.company()));
        assertEquals(0, count("SELECT COUNT(*) FROM notification_windows WHERE company_id = ?", fixture.company()));
    }

    @Test
    void concurrentEventsForOneCompanyShareTheFirstOpenWindow() throws Exception {
        Fixture fixture = createFixture();
        DeviationNotificationPort port = new JdbcDeviationNotificationOutbox(jdbc,
                enabledPushProperties(), new NotificationWindowPolicy());
        UUID firstDeviation = createDeviation(fixture, fixture.siteOne(), fixture.employeeOne(), "SIN_INGRESO");
        UUID secondDeviation = createDeviation(fixture, fixture.siteTwo(), fixture.employeeTwo(), "LLEGADA_TARDE");
        Instant occurredAt = Instant.parse("2026-10-16T13:04:00Z");
        CountDownLatch start = new CountDownLatch(1);

        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                await(start);
                inTransaction(() -> port.enqueue(fixture.company(), fixture.siteOne(), firstDeviation,
                        "SIN_INGRESO", occurredAt));
            });
            var second = executor.submit(() -> {
                await(start);
                inTransaction(() -> port.enqueue(fixture.company(), fixture.siteTwo(), secondDeviation,
                        "LLEGADA_TARDE", occurredAt));
            });
            start.countDown();
            first.get(15, TimeUnit.SECONDS);
            second.get(15, TimeUnit.SECONDS);
        }

        assertEquals(1, count("SELECT COUNT(DISTINCT window_id) FROM notification_outbox_events WHERE company_id = ?",
                fixture.company()));
        assertEquals(1, count("SELECT COUNT(*) FROM notification_windows WHERE company_id = ?",
                fixture.company()));
    }

    @Test
    void replacingAbsenceUpdatesOneOutboxEventAndDispatchCountsOnlyActiveDeviationsBySiteName() throws Exception {
        Fixture fixture = createFixture();
        BrajaProperties properties = pushPropertiesWithEncryptionKeys();
        DeviationNotificationPort port = new JdbcDeviationNotificationOutbox(jdbc, properties,
                new NotificationWindowPolicy());
        DeviationService deviations = new DeviationService(jdbc,
                new ScopeService(jdbc, new CurrentActor()), new EncryptionService(properties), port);
        UUID seedDeviation = createDeviation(fixture, fixture.siteOne(), fixture.employeeOne(), "SIN_INGRESO");
        UUID jornada = UUID.fromString(jdbc.queryForObject("SELECT jornada_id FROM deviations WHERE id=?", String.class, seedDeviation.toString()));
        jdbc.update("DELETE FROM deviations WHERE id=?", seedDeviation.toString());
        Instant scheduledStart = Instant.parse("2026-10-16T08:00:00Z");
        Instant scheduledEnd = Instant.parse("2026-10-16T16:00:00Z");
        Instant absenceDue = scheduledStart.plusSeconds(5 * 60L);
        deviations.reconcile(fixture.company(), jornada, fixture.siteOne(), fixture.employeeOne(), scheduledStart,
                scheduledEnd, 5, 15, 30, java.util.List.of(), absenceDue.plusSeconds(1));

        UUID deviation = UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND active=TRUE", String.class, jornada.toString()));
        Instant lateAt = absenceDue.plusSeconds(60);
        deviations.reconcile(fixture.company(), jornada, fixture.siteOne(), fixture.employeeOne(), scheduledStart,
                scheduledEnd, 5, 15, 30,
                java.util.List.of(new DeviationService.MarkFact(null, MarkAction.INGRESO, lateAt)), lateAt);

        assertEquals(1, count("SELECT COUNT(*) FROM notification_outbox_events WHERE deviation_id = ?", deviation));
        assertEquals("LLEGADA_TARDE", jdbc.queryForObject("SELECT deviation_type FROM notification_outbox_events WHERE deviation_id=?", String.class, deviation.toString()));
        String windowId = jdbc.queryForObject("SELECT window_id FROM notification_outbox_events WHERE deviation_id=?", String.class, deviation.toString());
        Instant windowStartedAt = Instant.parse(jdbc.queryForObject("SELECT window_started_at FROM notification_windows WHERE id=?", String.class, windowId).replace(' ', 'T') + "Z");
        NotificationWindowLease lease = new NotificationWindowLease(UUID.fromString(windowId), fixture.company(),
                windowStartedAt, UUID.randomUUID(), 1);
        NotificationWindowRepository repository = new NotificationWindowRepository(jdbc);
        String siteCounts = new ObjectMapper().writeValueAsString(repository.loadSiteCounts(lease));
        assertTrue(siteCounts.contains("\"siteName\":\"Sede 1\""));
        assertTrue(siteCounts.contains("\"count\":1"));

        jdbc.update("UPDATE deviations SET active=FALSE WHERE id=?", deviation.toString());
        assertTrue(repository.loadSiteCounts(lease).isEmpty());
    }

    @Test
    void delayedDetectionAfterSentWindowStartsNewPendingWindowAndKeepsHistoricalOccurredAt() {
        Fixture fixture = createFixture();
        DeviationNotificationPort port = new JdbcDeviationNotificationOutbox(jdbc,
                enabledPushProperties(), new NotificationWindowPolicy());
        UUID originalDeviation = createDeviation(fixture, fixture.siteOne(), fixture.employeeOne(), "SIN_INGRESO");
        UUID delayedDeviation = createDeviation(fixture, fixture.siteTwo(), fixture.employeeTwo(), "SIN_INGRESO");
        Instant historicalOccurredAt = Instant.now().minusSeconds(10 * 60L).truncatedTo(ChronoUnit.MICROS);
        inTransaction(() -> port.enqueue(fixture.company(), fixture.siteOne(), originalDeviation,
                "SIN_INGRESO", historicalOccurredAt));

        String sentWindowId = jdbc.queryForObject("SELECT window_id FROM notification_outbox_events WHERE deviation_id=?",
                String.class, originalDeviation.toString());
        Instant historicalWindowEnd = historicalOccurredAt.plusSeconds(5 * 60L);
        jdbc.update("UPDATE notification_windows SET window_started_at=?,window_ends_at=?,status='SENT',delivered_at=?,lease_token=NULL,lease_until=NULL WHERE id=?",
                sqlTime(historicalOccurredAt), sqlTime(historicalWindowEnd), sqlTime(Instant.now()), sentWindowId);
        Instant persistedWindowEnd = jdbc.queryForObject("SELECT window_ends_at FROM notification_windows WHERE id=?",
                java.time.LocalDateTime.class, sentWindowId).toInstant(ZoneOffset.UTC);
        assertTrue(Instant.now().isAfter(persistedWindowEnd),
                () -> "Test setup must place the sent window in the past; end=" + persistedWindowEnd);
        assertEquals(sentWindowId, jdbc.queryForObject("SELECT active_window_id FROM notification_company_state WHERE company_id=?",
                String.class, fixture.company().toString()));
        inTransaction(() -> port.enqueue(fixture.company(), fixture.siteTwo(), delayedDeviation,
                "SIN_INGRESO", historicalOccurredAt.plusSeconds(60)));

        String delayedWindowId = jdbc.queryForObject("SELECT window_id FROM notification_outbox_events WHERE deviation_id=?",
                String.class, delayedDeviation.toString());
        assertFalse(sentWindowId.equals(delayedWindowId),
                () -> "Delayed event reused sent window " + sentWindowId + " although server now is " + Instant.now());
        assertEquals("SENT", jdbc.queryForObject("SELECT status FROM notification_windows WHERE id=?", String.class, sentWindowId));
        assertEquals("PENDING", jdbc.queryForObject("SELECT status FROM notification_windows WHERE id=?", String.class, delayedWindowId));
        assertEquals(historicalOccurredAt.plusSeconds(60), jdbc.queryForObject(
                "SELECT occurred_at FROM notification_outbox_events WHERE deviation_id=?", java.time.LocalDateTime.class,
                delayedDeviation.toString()).toInstant(ZoneOffset.UTC));
    }

    @Test
    void partialDeliverySchedulesRetryWithStableTagAndTopic() throws Exception {
        Fixture fixture = createFixture();
        BrajaProperties properties = pushPropertiesWithEncryptionKeys();
        DeviationNotificationPort port = new JdbcDeviationNotificationOutbox(jdbc, properties,
                new NotificationWindowPolicy());
        UUID deviation = createDeviation(fixture, fixture.siteOne(), fixture.employeeOne(), "SIN_INGRESO");
        Instant occurredAt = Instant.now().minusSeconds(60);
        inTransaction(() -> port.enqueue(fixture.company(), fixture.siteOne(), deviation, "SIN_INGRESO", occurredAt));
        String windowId = jdbc.queryForObject("SELECT window_id FROM notification_outbox_events WHERE deviation_id=?",
                String.class, deviation.toString());
        Instant startedAt = Instant.now().minusSeconds(6 * 60L);
        Instant endedAt = startedAt.plusSeconds(5 * 60L);
        jdbc.update("UPDATE notification_windows SET window_started_at=?,window_ends_at=?,next_attempt_at=?,status='PENDING',attempt_count=0,delivered_at=NULL WHERE id=?",
                sqlTime(startedAt), sqlTime(endedAt), sqlTime(endedAt), windowId);

        PushSubscriptionCipher cipher = new PushSubscriptionCipher(properties);
        insertSubscription(cipher, fixture, UUID.fromString("10000000-0000-0000-0000-000000000001"), "a".repeat(64), "one");
        insertSubscription(cipher, fixture, UUID.fromString("10000000-0000-0000-0000-000000000002"), "b".repeat(64), "two");
        List<String> tags = new ArrayList<>();
        List<String> topics = new ArrayList<>();
        AtomicInteger sendAttempts = new AtomicInteger();
        ObjectMapper mapper = new ObjectMapper();
        WebPushGateway gateway = (subscription, payload, topic) -> {
            try {
                tags.add(mapper.readTree(payload).get("tag").asText());
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
            topics.add(topic);
            return sendAttempts.incrementAndGet() == 2 ? 503 : 201;
        };
        NotificationOutboxDispatcher dispatcher = new NotificationOutboxDispatcher(properties,
                new NotificationWindowRepository(jdbc), cipher, new SafePushPayloadFactory(mapper), gateway);

        inTransaction(dispatcher::dispatchDueWindows);

        assertEquals(2, sendAttempts.get());
        assertEquals("RETRY", jdbc.queryForObject("SELECT status FROM notification_windows WHERE id=?", String.class, windowId));
        assertEquals(1, jdbc.queryForObject("SELECT attempt_count FROM notification_windows WHERE id=?", Integer.class, windowId));
        assertTrue(jdbc.queryForObject("SELECT next_attempt_at>? FROM notification_windows WHERE id=?", Boolean.class,
                sqlTime(Instant.now()), windowId));
        jdbc.update("UPDATE notification_windows SET next_attempt_at=? WHERE id=?", sqlTime(Instant.now().minusSeconds(1)), windowId);

        inTransaction(dispatcher::dispatchDueWindows);

        assertEquals(4, sendAttempts.get());
        assertEquals("SENT", jdbc.queryForObject("SELECT status FROM notification_windows WHERE id=?", String.class, windowId));
        assertEquals(2, jdbc.queryForObject("SELECT attempt_count FROM notification_windows WHERE id=?", Integer.class, windowId));
        assertEquals(1, tags.stream().distinct().count());
        assertEquals(1, topics.stream().distinct().count());
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("Timed out waiting to start concurrent outbox calls.");
            }
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while waiting to start concurrent outbox calls.", ex);
        }
    }

    private static void inTransaction(Runnable action) {
        transactions.executeWithoutResult(status -> action.run());
    }

    private static int count(String sql, UUID value) {
        Integer count = jdbc.queryForObject(sql, Integer.class, value.toString());
        return count == null ? 0 : count;
    }

    private static void insertSubscription(PushSubscriptionCipher cipher, Fixture fixture, UUID subscriptionId,
                                           String endpointHash, String label) {
        UUID accountId = fixture.admin();
        EncryptedPushSecret secret = cipher.encrypt(fixture.company(), accountId, endpointHash,
                new PushSubscriptionMaterial("https://push.example/" + label, "public-key-" + label, "auth-" + label));
        java.sql.Timestamp now = sqlTime(Instant.now());
        jdbc.update("INSERT INTO push_subscriptions(id,company_id,account_id,endpoint_hash,secret_ciphertext,secret_iv,active,created_at,updated_at) VALUES(?,?,?,?,?,?,TRUE,?,?)",
                subscriptionId.toString(), fixture.company().toString(), accountId.toString(), endpointHash,
                secret.ciphertext(), secret.iv(), now, now);
    }

    private static java.sql.Timestamp sqlTime(Instant instant) {
        return java.sql.Timestamp.from(instant);
    }

    private static BrajaProperties enabledPushProperties() {
        BrajaProperties properties = new BrajaProperties();
        properties.setVapidPublicKey("public");
        properties.setVapidPrivateKey("private");
        properties.setVapidSubject("mailto:admin@braja.example");
        return properties;
    }

    private static BrajaProperties pushPropertiesWithEncryptionKeys() {
        BrajaProperties properties = enabledPushProperties();
        String key = java.util.Base64.getEncoder().encodeToString(new byte[32]);
        properties.setHealthEncryptionKeyBase64(key);
        properties.setPushSubscriptionEncryptionKeyBase64(key);
        return properties;
    }

    private static Fixture createFixture() {
        UUID company = UUID.randomUUID();
        UUID siteOne = UUID.randomUUID();
        UUID siteTwo = UUID.randomUUID();
        UUID admin = UUID.randomUUID();
        UUID employeeOneAccount = UUID.randomUUID();
        UUID employeeTwoAccount = UUID.randomUUID();
        UUID templateOne = UUID.randomUUID();
        UUID templateTwo = UUID.randomUUID();
        var now = java.sql.Timestamp.from(Instant.now());

        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)",
                company.toString(), "Braja test " + company, now);
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)",
                siteOne.toString(), company.toString(), "Sede 1", "America/Argentina/Tucuman", now);
        jdbc.update("INSERT INTO sites(id,company_id,name,time_zone,created_at) VALUES(?,?,?,?,?)",
                siteTwo.toString(), company.toString(), "Sede 2", "America/Argentina/Tucuman", now);
        insertAccount(admin, now);
        insertAccount(employeeOneAccount, now);
        insertAccount(employeeTwoAccount, now);
        insertMembership(company, admin, "ADMIN", now);
        insertMembership(company, employeeOneAccount, "EMPLOYEE", now);
        insertMembership(company, employeeTwoAccount, "EMPLOYEE", now);
        UUID employeeOne = insertEmployee(company, employeeOneAccount, now);
        UUID employeeTwo = insertEmployee(company, employeeTwoAccount, now);
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)",
                company.toString(), employeeOne.toString(), siteOne.toString(), now);
        jdbc.update("INSERT INTO employee_sites(company_id,employee_id,site_id,created_at) VALUES(?,?,?,?)",
                company.toString(), employeeTwo.toString(), siteTwo.toString(), now);
        insertTemplate(templateOne, company, siteOne, now);
        insertTemplate(templateTwo, company, siteTwo, now);
        return new Fixture(company, siteOne, siteTwo, admin, employeeOne, employeeTwo, templateOne, templateTwo);
    }

    private static UUID createDeviation(Fixture fixture, UUID siteId, UUID employeeId, String type) {
        UUID templateId = siteId.equals(fixture.siteOne()) ? fixture.templateOne() : fixture.templateTwo();
        UUID jornadaId = UUID.randomUUID();
        LocalDate localDate = LocalDate.of(2026, 10, 16);
        var now = java.sql.Timestamp.from(Instant.now());
        jdbc.update("""
                INSERT INTO jornadas (
                    id, company_id, employee_id, site_id, template_id, local_date, time_zone,
                    schedule_snapshot, tolerance_minutes, scheduled_start_at, scheduled_end_at,
                    state, next_sequence, created_by, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'America/Argentina/Tucuman', JSON_OBJECT(), 5,
                          '2026-10-16 08:00:00', '2026-10-16 16:00:00', 'NO_INGRESO', 1, ?, ?)
                """, jornadaId.toString(), fixture.company().toString(), employeeId.toString(),
                siteId.toString(), templateId.toString(), localDate, fixture.admin().toString(), now);
        UUID deviationId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO deviations (
                    id, company_id, jornada_id, source_mark_id, site_id, employee_id, type,
                    motive_category, motive_text, motive_ciphertext, motive_iv, motive_cipher_key_id,
                    motive_author_account_id, motive_created_at, motive_purged_at, classification,
                    created_at, updated_at
                ) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?)
                """, deviationId.toString(), fixture.company().toString(), jornadaId.toString(),
                siteId.toString(), employeeId.toString(), type, now, now);
        return deviationId;
    }

    private static void insertAccount(UUID accountId, java.sql.Timestamp now) {
        jdbc.update("""
                INSERT INTO accounts(id,dni_normalized,dni_display,password_hash,must_change_password,active,created_at,updated_at)
                VALUES(?,?,?,'test-hash',FALSE,TRUE,?,?)
                """, accountId.toString(), "D" + accountId.toString().replace("-", "").substring(0, 11),
                "D" + accountId.toString().replace("-", "").substring(0, 11), now, now);
    }

    private static void insertMembership(UUID company, UUID account, String role, java.sql.Timestamp now) {
        jdbc.update("""
                INSERT INTO company_memberships(id,company_id,account_id,role,active,created_at)
                VALUES(?,?,?,?,TRUE,?)
                """, UUID.randomUUID().toString(), company.toString(), account.toString(), role, now);
    }

    private static UUID insertEmployee(UUID company, UUID account, java.sql.Timestamp now) {
        UUID employeeId = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO employees(id,company_id,account_id,display_name,tolerance_minutes,active,created_at,updated_at)
                VALUES(?,?,?,?,5,TRUE,?,?)
                """, employeeId.toString(), company.toString(), account.toString(), "Empleado", now, now);
        return employeeId;
    }

    private static void insertTemplate(UUID template, UUID company, UUID site, java.sql.Timestamp now) {
        jdbc.update("""
                INSERT INTO schedule_templates(
                    id,company_id,site_id,name,breakfast_limit_minutes,lunch_limit_minutes,active,created_at,updated_at
                ) VALUES(?,?,?,'Base',15,30,TRUE,?,?)
                """, template.toString(), company.toString(), site.toString(), now, now);
    }

    private record Fixture(UUID company, UUID siteOne, UUID siteTwo, UUID admin,
                           UUID employeeOne, UUID employeeTwo, UUID templateOne, UUID templateTwo) {
    }
}
