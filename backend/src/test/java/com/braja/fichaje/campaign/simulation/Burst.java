package com.braja.fichaje.campaign.simulation;

import com.braja.fichaje.campaign.ApiClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

/**
 * Once a week, with the clock still: every person's INGRESO at the same instant (a train strike morning), five of them
 * twice with the same key from the same phone, plus the absence job and the dispatcher, all released together.
 * Expectations are computed before the release from the persisted state (each person has their own jornada, so they do
 * not depend on each other). A 409 RETRYABLE_TRANSACTION_CONFLICT (S64) is retried with the same key afterwards, as the
 * PWA does; only the outcome after retries is compared, and how many conflicts there were goes to the timing counts.
 */
final class Burst {
    record Entry(EmployeeActor actor, SimWorld.Jornada jornada, DayPlanner.Tap tap) { }

    private record Shot(Entry entry, UUID key, String expected, boolean twin) { }

    private final SimContext ctx;

    Burst(SimContext ctx) {
        this.ctx = ctx;
    }

    void run(List<Entry> entries) {
        if (entries.isEmpty()) return;
        // Warm every session and CSRF token first: two threads of one browser must not fetch a token at the same time.
        for (Entry entry : entries) {
            entry.actor().ensureCompany(entry.jornada().site.company);
            ApiClient.Response warm = entry.actor().withSession(() -> entry.actor().employee.browser().put("/api/v1/companies/active",
                    Map.of("companyId", entry.jornada().site.company.id())));
            String[] allowed = entry.actor().employee.membership(entry.jornada().site).active ? new String[] {"200"}
                    : new String[] {"403 FORBIDDEN", "404 NOT_FOUND"};
            ctx.ledger.expect(entry.actor().tag(), "burst warm-up", warm, allowed);
        }
        List<Shot> shots = new ArrayList<>();
        for (Entry entry : entries) {
            UUID key = UUID.randomUUID();
            String expected = entry.actor().expectMark(entry.jornada(), entry.tap().action(), key);
            shots.add(new Shot(entry, key, expected, false));
            boolean twin = Seeds.chance(ctx.seed(), 5.0 / 20, "burst-twin", entry.actor().employee.index, ctx.ledger.date());
            if (twin) shots.add(new Shot(entry, key, "201".equals(expected) ? "200" : expected, true));
        }
        List<Callable<ApiClient.Response>> tasks = new ArrayList<>();
        for (Shot shot : shots) tasks.add(() -> shot.entry().actor().employee.browser().mark(shot.entry().jornada().id, shot.entry().tap().action(), shot.key()));
        tasks.add(() -> { ctx.jobs.absencesOnce(); return null; });
        tasks.add(() -> { ctx.jobs.dispatch(); return null; });
        List<ApiClient.Response> answers = together(tasks);

        List<String> firstTry = new ArrayList<>();
        for (int i = 0; i < shots.size(); i++) {
            Shot shot = shots.get(i);
            ApiClient.Response response = answers.get(i);
            firstTry.add(DayLedger.token(response));
            for (int retry = 0; retry < 5 && "409 RETRYABLE_TRANSACTION_CONFLICT".equals(DayLedger.token(response)); retry++) {
                ctx.ledger.timing("burst retryable");
                response = shot.entry().actor().employee.browser().mark(shot.entry().jornada().id, shot.entry().tap().action(), shot.key());
            }
            answers.set(i, response);
        }
        ctx.ledger.note("burst", shots.size() + " requests, first try " + tally(firstTry));
        // A pair of twins answers {201, 200} in either order: compare the pair as a whole.
        for (int i = 0; i < shots.size(); i++) {
            Shot shot = shots.get(i);
            if (shot.twin()) continue;
            boolean hasTwin = i + 1 < shots.size() && shots.get(i + 1).twin();
            String mine = DayLedger.token(answers.get(i));
            String twinToken = hasTwin ? DayLedger.token(answers.get(i + 1)) : null;
            boolean created = mine.equals("201") || "201".equals(twinToken);
            if (hasTwin && "201".equals(shot.expected())) {
                List<String> pair = new ArrayList<>(List.of(mine, twinToken));
                pair.sort(null);
                ctx.ledger.count("burst pair " + pair);
                if (!pair.equals(List.of("200", "201"))) ctx.ledger.violation(shot.entry().actor().tag(), "burst double tap answered " + pair + ", expected [200, 201]");
            } else {
                ctx.ledger.expect(shot.entry().actor().tag(), "burst " + shot.entry().tap().action(), answers.get(i), shot.expected());
                if (hasTwin) ctx.ledger.expect(shot.entry().actor().tag(), "burst twin " + shot.entry().tap().action(), answers.get(i + 1), shot.expected());
            }
            if (created && "201".equals(shot.expected())) {
                ApiClient.Response winner = mine.equals("201") ? answers.get(i) : answers.get(i + 1);
                UUID id = shot.entry().actor().settle(shot.entry().jornada(), shot.entry().tap().action(), shot.key(), winner, "201");
                if (hasTwin && !answers.get(i).id().equals(answers.get(i + 1).id())) {
                    ctx.ledger.violation(shot.entry().actor().tag(), "burst double tap returned two different marks");
                }
                shot.entry().actor().accepted(shot.entry().jornada(), id, ctx.now(), shot.entry().tap());
            }
        }
    }

    private static String tally(List<String> tokens) {
        java.util.TreeMap<String, Integer> counts = new java.util.TreeMap<>();
        tokens.forEach(token -> counts.merge(token, 1, Integer::sum));
        return counts.toString();
    }

    private static <T> List<T> together(List<Callable<T>> tasks) {
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        CountDownLatch ready = new CountDownLatch(tasks.size()), go = new CountDownLatch(1);
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (Callable<T> task : tasks) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    if (!go.await(30, TimeUnit.SECONDS)) throw new IllegalStateException("burst never released");
                    return task.call();
                }));
            }
            if (!ready.await(30, TimeUnit.SECONDS)) throw new IllegalStateException("burst threads not ready");
            go.countDown();
            List<T> results = new ArrayList<>();
            for (Future<T> future : futures) results.add(future.get(90, TimeUnit.SECONDS));
            return results;
        } catch (Exception ex) {
            throw new IllegalStateException("burst failed", ex);
        } finally {
            go.countDown();
            pool.shutdownNow();
        }
    }
}
