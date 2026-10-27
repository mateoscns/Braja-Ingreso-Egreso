package com.braja.fichaje.notifications;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.braja.fichaje.config.BrajaProperties;
import com.braja.fichaje.deviations.DeviationService;
import com.braja.fichaje.security.CurrentActor;
import com.braja.fichaje.security.EncryptionService;
import com.braja.fichaje.security.ScopeService;
import com.braja.fichaje.timekeeping.MarkAction;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
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
        org.springframework.mock.env.MockEnvironment localEnvironment = new org.springframework.mock.env.MockEnvironment();
        localEnvironment.setActiveProfiles("local");
        DeviationService deviations = new DeviationService(jdbc,
                new ScopeService(jdbc, new CurrentActor()), new EncryptionService(properties, localEnvironment), port);
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

    // 2026-10-27 (issue #47): an event committed after the dispatcher claimed its window at the boundary
    // landed in that window and was never sent, because the window was already SENT.
    @Test
    void eventEnqueuedAfterItsWindowWasClaimedIsDeliveredInANewWindow() {
        Fixture fixture = createFixture();
        BrajaProperties properties = pushPropertiesWithEncryptionKeys();
        DeviationNotificationPort port = new JdbcDeviationNotificationOutbox(jdbc, properties,
                new NotificationWindowPolicy());
        NotificationWindowRepository repository = new NotificationWindowRepository(jdbc);
        UUID first = createDeviation(fixture, fixture.siteOne(), fixture.employeeOne(), "SIN_INGRESO");
        UUID late = createDeviation(fixture, fixture.siteTwo(), fixture.employeeTwo(), "SIN_INGRESO");
        inTransaction(() -> port.enqueue(fixture.company(), fixture.siteOne(), first, "SIN_INGRESO", Instant.now()));
        String claimedWindow = windowOf(first);
        NotificationWindowLease lease = claim(repository, claimedWindow);
        repository.markDelivered(lease, Instant.now());

        inTransaction(() -> port.enqueue(fixture.company(), fixture.siteTwo(), late, "SIN_INGRESO", Instant.now()));

        String lateWindow = windowOf(late);
        assertNotEquals(claimedWindow, lateWindow, "the late event joined a window that was already claimed");
        assertEquals("PENDING", statusOf(lateWindow));
        makeDue(lateWindow);
        PushSubscriptionCipher cipher = new PushSubscriptionCipher(properties);
        insertSubscriptionFor(cipher, fixture, "late");
        List<JsonNode> sent = new ArrayList<>();
        dispatcher(properties, cipher, recordingGateway(fixture, sent, endpoint -> 201)).dispatchDueWindows();

        assertEquals(1, sent.size());
        assertEquals(1, sent.get(0).get("totalCount").asLong());
        assertEquals("Sede 2", sent.get(0).get("siteCounts").get(0).get("siteName").asText());
        assertEquals("SENT", statusOf(lateWindow));
    }

    @Test
    void claimSkipsAWindowWhileAnEnqueueIntoItIsUncommittedAndThenCountsTheEvent() throws Exception {
        Fixture fixture = createFixture();
        DeviationNotificationPort port = new JdbcDeviationNotificationOutbox(jdbc, enabledPushProperties(),
                new NotificationWindowPolicy());
        NotificationWindowRepository repository = new NotificationWindowRepository(jdbc);
        UUID first = createDeviation(fixture, fixture.siteOne(), fixture.employeeOne(), "SIN_INGRESO");
        UUID second = createDeviation(fixture, fixture.siteTwo(), fixture.employeeTwo(), "LLEGADA_TARDE");
        inTransaction(() -> port.enqueue(fixture.company(), fixture.siteOne(), first, "SIN_INGRESO", Instant.now()));
        String windowId = windowOf(first);
        CountDownLatch enqueued = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);

        try (var executor = Executors.newSingleThreadExecutor()) {
            var pending = executor.submit(() -> inTransaction(() -> {
                port.enqueue(fixture.company(), fixture.siteTwo(), second, "LLEGADA_TARDE", Instant.now());
                enqueued.countDown();
                await(release);
            }));
            await(enqueued);
            boolean claimedWhileOpen = claimDue(repository).stream().anyMatch(l -> l.id().toString().equals(windowId));
            release.countDown();
            pending.get(15, TimeUnit.SECONDS);
            assertFalse(claimedWhileOpen, "a window was claimed while an enqueue into it was uncommitted");
        }

        NotificationWindowLease lease = claim(repository, windowId);
        assertEquals(2, repository.loadSiteCounts(lease).stream().mapToLong(SiteCount::count).sum());
    }

    // 2026-10-27 (issue #47): any 4xx other than 429 deleted the subscription and marked the window SENT.
    @Test
    void rejectedSubscriptionsAreKeptAndRetriedWhileGoneSubscriptionsAreRemoved() {
        Fixture fixture = createFixture();
        BrajaProperties properties = pushPropertiesWithEncryptionKeys();
        PushSubscriptionCipher cipher = new PushSubscriptionCipher(properties);
        String windowId = dueWindowWithOneEvent(fixture, properties);
        for (String label : List.of("s404", "s410", "s400", "s401", "s403", "s413")) {
            insertSubscriptionFor(cipher, fixture, label);
        }
        List<JsonNode> sent = new ArrayList<>();
        ListAppender<ILoggingEvent> logs = captureDispatcherLogs();
        try {
            dispatcher(properties, cipher, recordingGateway(fixture, sent,
                    endpoint -> Integer.parseInt(endpoint.substring(endpoint.lastIndexOf("-s") + 2)))).dispatchDueWindows();
        } finally {
            releaseDispatcherLogs(logs);
        }

        assertEquals(6, sent.size());
        assertEquals(4, count("SELECT COUNT(*) FROM push_subscriptions WHERE company_id = ?", fixture.company()));
        assertEquals(0, count("""
                SELECT COUNT(*) FROM push_subscriptions WHERE company_id = ? AND endpoint_hash IN (?, ?)
                """, fixture.company(), hash(fixture, "s404"), hash(fixture, "s410")));
        assertEquals("RETRY", statusOf(windowId));
        assertEquals(1, jdbc.queryForObject("SELECT attempt_count FROM notification_windows WHERE id=?", Integer.class, windowId));
        for (String status : List.of("400", "401", "403", "413")) {
            assertTrue(logs.list.stream().anyMatch(event -> event.getLevel() == Level.WARN
                            && event.getFormattedMessage().contains("status=" + status)
                            && event.getFormattedMessage().contains("host=fcm.googleapis.com")),
                    () -> "missing WARN for status " + status + ": " + messages(logs));
        }
        assertTrue(logs.list.stream().noneMatch(event -> event.getFormattedMessage().contains("/fcm/send/")),
                () -> "a log line exposed the endpoint path: " + messages(logs));
    }

    @Test
    void windowThatExhaustsItsAttemptsBecomesDeadAndIsLoggedOnce() {
        Fixture fixture = createFixture();
        BrajaProperties properties = pushPropertiesWithEncryptionKeys();
        PushSubscriptionCipher cipher = new PushSubscriptionCipher(properties);
        String windowId = dueWindowWithOneEvent(fixture, properties);
        jdbc.update("UPDATE notification_windows SET attempt_count = ? WHERE id = ?",
                NotificationRetryPolicy.MAX_ATTEMPTS - 1, windowId);
        insertSubscriptionFor(cipher, fixture, "dead");
        List<JsonNode> sent = new ArrayList<>();
        NotificationOutboxDispatcher dispatcher = dispatcher(properties, cipher, recordingGateway(fixture, sent, endpoint -> 503));
        ListAppender<ILoggingEvent> logs = captureDispatcherLogs();
        try {
            dispatcher.dispatchDueWindows();
            jdbc.update("UPDATE notification_windows SET next_attempt_at = ? WHERE id = ?",
                    sqlTime(Instant.now().minusSeconds(1)), windowId);
            dispatcher.dispatchDueWindows();
        } finally {
            releaseDispatcherLogs(logs);
        }

        assertEquals(1, sent.size());
        assertEquals("DEAD", statusOf(windowId));
        assertEquals(NotificationRetryPolicy.MAX_ATTEMPTS,
                jdbc.queryForObject("SELECT attempt_count FROM notification_windows WHERE id=?", Integer.class, windowId));
        List<ILoggingEvent> errors = logs.list.stream().filter(event -> event.getLevel() == Level.ERROR).toList();
        assertEquals(1, errors.size(), () -> messages(logs));
        assertTrue(errors.get(0).getFormattedMessage().contains(fixture.company().toString()));
        assertTrue(errors.get(0).getFormattedMessage().contains(windowId));
        assertTrue(logs.list.stream().anyMatch(event -> event.getLevel() == Level.WARN
                && event.getFormattedMessage().contains("status=503")), () -> messages(logs));
    }

    // 2026-10-27 (issue #47): a deviation retracted and later re-activated never notified again.
    @Test
    void reactivatedDeviationAfterSentWindowNotifiesAgainButReplacementDoesNot() {
        Fixture fixture = createFixture();
        BrajaProperties properties = pushPropertiesWithEncryptionKeys();
        DeviationNotificationPort port = new JdbcDeviationNotificationOutbox(jdbc, properties,
                new NotificationWindowPolicy());
        org.springframework.mock.env.MockEnvironment localEnvironment = new org.springframework.mock.env.MockEnvironment();
        localEnvironment.setActiveProfiles("local");
        DeviationService deviations = new DeviationService(jdbc,
                new ScopeService(jdbc, new CurrentActor()), new EncryptionService(properties, localEnvironment), port);
        UUID seedDeviation = createDeviation(fixture, fixture.siteOne(), fixture.employeeOne(), "SIN_INGRESO");
        UUID jornada = UUID.fromString(jdbc.queryForObject("SELECT jornada_id FROM deviations WHERE id=?", String.class, seedDeviation.toString()));
        jdbc.update("DELETE FROM deviations WHERE id=?", seedDeviation.toString());
        Instant scheduledStart = Instant.parse("2026-10-16T08:00:00Z");
        Instant scheduledEnd = Instant.parse("2026-10-16T16:00:00Z");
        Instant absenceDue = scheduledStart.plusSeconds(5 * 60L);
        Instant lateAt = absenceDue.plusSeconds(60);
        List<DeviationService.MarkFact> lateIngress = List.of(new DeviationService.MarkFact(null, MarkAction.INGRESO, lateAt));
        List<DeviationService.MarkFact> onTimeIngress = List.of(new DeviationService.MarkFact(null, MarkAction.INGRESO, scheduledStart));
        deviations.reconcile(fixture.company(), jornada, fixture.siteOne(), fixture.employeeOne(), scheduledStart,
                scheduledEnd, 5, 15, 30, List.of(), absenceDue.plusSeconds(1));
        UUID deviation = UUID.fromString(jdbc.queryForObject("SELECT id FROM deviations WHERE jornada_id=? AND active=TRUE", String.class, jornada.toString()));
        String sentWindow = windowOf(deviation);
        NotificationWindowRepository repository = new NotificationWindowRepository(jdbc);
        repository.markDelivered(claim(repository, sentWindow), Instant.now());

        deviations.reconcile(fixture.company(), jornada, fixture.siteOne(), fixture.employeeOne(), scheduledStart,
                scheduledEnd, 5, 15, 30, lateIngress, lateAt);
        assertEquals(sentWindow, windowOf(deviation), "replacing SIN_INGRESO with LLEGADA_TARDE must not notify again");
        assertEquals(1, count("SELECT COUNT(*) FROM notification_windows WHERE company_id = ?", fixture.company()));

        deviations.reconcile(fixture.company(), jornada, fixture.siteOne(), fixture.employeeOne(), scheduledStart,
                scheduledEnd, 5, 15, 30, onTimeIngress, lateAt.plusSeconds(60));
        deviations.reconcile(fixture.company(), jornada, fixture.siteOne(), fixture.employeeOne(), scheduledStart,
                scheduledEnd, 5, 15, 30, lateIngress, lateAt.plusSeconds(120));

        String reactivatedWindow = windowOf(deviation);
        assertNotEquals(sentWindow, reactivatedWindow, "the re-activated deviation stayed in the sent window");
        assertEquals("PENDING", statusOf(reactivatedWindow));
        assertEquals(1, count("SELECT COUNT(*) FROM notification_outbox_events WHERE deviation_id = ?", deviation));
        NotificationWindowLease lease = claim(repository, reactivatedWindow);
        assertEquals(1, repository.loadSiteCounts(lease).stream().mapToLong(SiteCount::count).sum());
    }

    @Test
    void subscriptionLookupIsScopedToTheActiveCompanyAndRequiresAnAdmin() {
        Fixture fixture = createFixture();
        BrajaProperties properties = pushPropertiesWithEncryptionKeys();
        UUID otherCompany = UUID.randomUUID();
        java.sql.Timestamp now = sqlTime(Instant.now());
        jdbc.update("INSERT INTO companies(id,name,created_at) VALUES(?,?,?)",
                otherCompany.toString(), "Braja otra " + otherCompany, now);
        insertMembership(otherCompany, fixture.admin(), "ADMIN", now);
        AdminPushSubscriptionService service = new AdminPushSubscriptionService(
                new JdbcPushSubscriptionRepository(jdbc), new PushSubscriptionCipher(properties),
                new PushEndpointValidator(), properties);
        String endpoint = endpointFor(fixture, "lookup");
        byte[] publicKey = new byte[65];
        publicKey[0] = 0x04;
        java.util.Base64.Encoder base64 = java.util.Base64.getUrlEncoder().withoutPadding();
        UUID id = service.register(fixture.company(), fixture.admin(), new PushSubscriptionRequest(endpoint,
                new PushSubscriptionRequest.Keys(base64.encodeToString(publicKey), base64.encodeToString(new byte[16]))));

        assertEquals(Optional.of(id), service.findSubscription(fixture.company(), fixture.admin(), endpoint));
        assertEquals(Optional.empty(), service.findSubscription(otherCompany, fixture.admin(), endpoint));
        assertEquals(Optional.empty(), service.findSubscription(fixture.company(), fixture.admin(), endpoint + "x"));
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> service.findSubscription(fixture.company(), UUID.randomUUID(), endpoint));
    }

    private static String dueWindowWithOneEvent(Fixture fixture, BrajaProperties properties) {
        DeviationNotificationPort port = new JdbcDeviationNotificationOutbox(jdbc, properties, new NotificationWindowPolicy());
        UUID deviation = createDeviation(fixture, fixture.siteOne(), fixture.employeeOne(), "SIN_INGRESO");
        inTransaction(() -> port.enqueue(fixture.company(), fixture.siteOne(), deviation, "SIN_INGRESO", Instant.now()));
        String windowId = windowOf(deviation);
        makeDue(windowId);
        return windowId;
    }

    private static NotificationOutboxDispatcher dispatcher(BrajaProperties properties, PushSubscriptionCipher cipher,
                                                           WebPushGateway gateway) {
        return new NotificationOutboxDispatcher(properties, new NotificationWindowRepository(jdbc), cipher,
                new SafePushPayloadFactory(new ObjectMapper()), gateway);
    }

    /** Records payloads sent to this fixture's endpoints; other companies' leftover windows get a 201. */
    private static WebPushGateway recordingGateway(Fixture fixture, List<JsonNode> sent,
                                                   java.util.function.ToIntFunction<String> statusForEndpoint) {
        ObjectMapper mapper = new ObjectMapper();
        return (subscription, payload, topic) -> {
            if (!subscription.endpoint().contains(fixture.company().toString())) {
                return 201;
            }
            try {
                sent.add(mapper.readTree(payload));
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
            return statusForEndpoint.applyAsInt(subscription.endpoint());
        };
    }

    private static ListAppender<ILoggingEvent> captureDispatcherLogs() {
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        ((ch.qos.logback.classic.Logger) LoggerFactory.getLogger(NotificationOutboxDispatcher.class)).addAppender(appender);
        return appender;
    }

    private static void releaseDispatcherLogs(ListAppender<ILoggingEvent> appender) {
        ((ch.qos.logback.classic.Logger) LoggerFactory.getLogger(NotificationOutboxDispatcher.class)).detachAppender(appender);
    }

    private static String messages(ListAppender<ILoggingEvent> appender) {
        return appender.list.stream().map(event -> event.getLevel() + " " + event.getFormattedMessage()).toList().toString();
    }

    private static NotificationWindowLease claim(NotificationWindowRepository repository, String windowId) {
        return claimDue(repository).stream().filter(l -> l.id().toString().equals(windowId)).findFirst()
                .orElseThrow(() -> new AssertionError("window " + windowId + " was not claimable"));
    }

    /** Claims as the dispatcher would at a later tick, once every open window has ended. */
    private static List<NotificationWindowLease> claimDue(NotificationWindowRepository repository) {
        return repository.claimDueWindows(Instant.now().plus(Duration.ofMinutes(10)), 100);
    }

    private static void makeDue(String windowId) {
        Instant startedAt = Instant.now().minusSeconds(6 * 60L);
        Instant endedAt = startedAt.plusSeconds(5 * 60L);
        jdbc.update("UPDATE notification_windows SET window_started_at=?,window_ends_at=?,next_attempt_at=? WHERE id=?",
                sqlTime(startedAt), sqlTime(endedAt), sqlTime(endedAt), windowId);
    }

    private static String windowOf(UUID deviationId) {
        return jdbc.queryForObject("SELECT window_id FROM notification_outbox_events WHERE deviation_id=?",
                String.class, deviationId.toString());
    }

    private static String statusOf(String windowId) {
        return jdbc.queryForObject("SELECT status FROM notification_windows WHERE id=?", String.class, windowId);
    }

    private static void insertSubscriptionFor(PushSubscriptionCipher cipher, Fixture fixture, String label) {
        String endpointHash = hash(fixture, label);
        EncryptedPushSecret secret = cipher.encrypt(fixture.company(), fixture.admin(), endpointHash,
                new PushSubscriptionMaterial(endpointFor(fixture, label), "public-key-" + label, "auth-" + label));
        java.sql.Timestamp now = sqlTime(Instant.now());
        jdbc.update("INSERT INTO push_subscriptions(id,company_id,account_id,endpoint_hash,secret_ciphertext,secret_iv,active,created_at,updated_at) VALUES(?,?,?,?,?,?,TRUE,?,?)",
                UUID.randomUUID().toString(), fixture.company().toString(), fixture.admin().toString(), endpointHash,
                secret.ciphertext(), secret.iv(), now, now);
    }

    private static String endpointFor(Fixture fixture, String label) {
        return "https://fcm.googleapis.com/fcm/send/" + fixture.company() + "-" + label;
    }

    private static String hash(Fixture fixture, String label) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256").digest(
                    endpointFor(fixture, label).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static int count(String sql, UUID value, String first, String second) {
        Integer count = jdbc.queryForObject(sql, Integer.class, value.toString(), first, second);
        return count == null ? 0 : count;
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
        byte[] healthKey = new byte[32];
        byte[] pushKey = new byte[32];
        pushKey[0] = 1;
        String throttleKey = java.util.Base64.getEncoder().encodeToString(
                "0123456789abcdef0123456789abcdef".getBytes(java.nio.charset.StandardCharsets.US_ASCII));
        properties.setHealthEncryptionKeyBase64(java.util.Base64.getEncoder().encodeToString(healthKey));
        properties.setLoginIpThrottleKeyBase64(throttleKey);
        properties.setPushSubscriptionEncryptionKeyBase64(java.util.Base64.getEncoder().encodeToString(pushKey));
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
