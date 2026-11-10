Objective: fix every finding of the 2026-10-27 read-only audit of main 47320bb (5 agents); product decisions are asked to the owner one at a time.
Branches: one issue + one branch + one PR per unit (fix/<unit>), merged with the standing merge approval. Delivery: separate PRs to main. Runner: backend `.\mvnw.cmd verify` (Testcontainers MySQL 8.4; never two backend suites at once); frontend `npm run lint && npm run typecheck && npm test && npm run build && npm audit --omit=dev`.

## Specs
- S1 (login, verified). `AccountService.login` is `@Transactional` and holds a pool connection while `SecurityConfiguration.userDetailsService` opens a second raw `dataSource.getConnection()`; pool is 12. 12 concurrent logins starve the pool ~30 s. A DB failure (`AuthenticationServiceException`) is counted as a wrong password in the DNI and IP throttles.
- S2 (security hardening). CSRF token is not rotated at login (custom `SessionAuthenticationStrategy`). `ClientAddressResolver` accepts hex-letter hostnames as numeric and resolves them with DNS. `0.0.0.0/0` is accepted as trusted proxy. `PUT /session/password` has no attempt limit on the current password. Concurrent wrong logins pass the 5-failure DNI check before failures are stored. After session expiry a mutation gets 403 FORBIDDEN (CSRF) instead of 401.
- S3 (frontend errors, verified). `client.ts:37` maps every 409 incl. `RETRYABLE_TRANSACTION_CONFLICT` to "La información cambió o la acción ya fue procesada. Actualizá la vista." Other findings: no refresh after a failed mark; no timeout on the mark request; wrong current password shows "Tu sesión venció"; generic messages for every 409/422 code; jornada picker and company selector enabled during a mark; unsaved employee edits look saved (incl. deactivation); SW update never prompted; notification click may do nothing; mark button glyphs read aloud; forgotten-mark form uses the device time zone when sites fail to load.
- S4 (retention, verified). `PrivacyRetentionScheduler` purges motives of every category at 90 days; D-20261016-04 and ESPECIFICACION.md only purge `SALUD` text. After a purge the employee can submit a new motive on an already classified deviation.
- S5 (audit, verified). `mark_correction_audits`, `forgotten_mark_audits`, `deviation_audits` are insert-only; ESPECIFICACION.md and openapi.yaml:585 promise original value, corrected value, author and reason "remain available to authorized reviewers".
- S6 (template offset, verified). `OrganizationService.validateTemplate` accepts a first block with `startDayOffset=1`; openapi.yaml:901 says "The first block must start on day offset 0." The jornada keeps `local_date` = input date.
- S7 (timekeeping/org bounds). Location body fields are primitive doubles without `@NotNull` (`{}` stores 0,0). `localDate` unbounded on declare. `EmptyResultDataAccessException` and `DataIntegrityViolationException` (template site change with jornadas) give 500. Null block times / null siteIds give NPE 500. `DateRanges` allows 367 days inclusive. Employee marks are appended without a chronology check while ADMIN paths reject non-monotonic history. Idempotency replay returns the frozen original body after an ADMIN correction.
- S8 (deviations). `GET /deviations` ignores the documented `status` filter and has no bound/limit. Employee UI only loads today's deviations (overnight and previous-day pending motives hidden). Reconcile keeps classification when the type changes. A motive submitted after classification is not flagged. Inbox pages on mutable `updated_at`.
- S9 (notifications). Event committed at the window boundary can be missed by the claim/count. Any 4xx except 429 deletes the subscription and marks the window delivered, silently; 5xx and DEAD are not logged. Re-activated/replaced deviation after SENT never notifies. Push auto-subscribes on company switch; sign-out keeps the server subscription.
- S10 (docs). CLAUDE.md §5/§7 stale (IP throttle, password-change revocation, CA8 test, distinct burst, V13 retry, getDate). ESPECIFICACION.md run guide misses the `local` profile and the third key, says branch `feat/v1-implementation`, CA boxes unticked.
- S11 (product, needs owner decision, one question at a time). Cancel a declared jornada / delete a wrong mark; bulk declaration by date range; ADMIN password reset; D-20261015-02 template assignment with start date; employee motive correction (spec row "Completar o corregir motivo" vs 409); per-IP throttle behind shared NAT.

## Tasks
- T1 | S1-S2 | delegated writer | merged PR #44 (1cdc655); verifier 8/8 + fixes; native review granted, approved and acknowledged (review-d5955f42b2fda282); advisories -> T10 | issue #41
- T2 | S3 | delegated writer + parent seam | merged PR #45 (a5523ff); independent read: no blockers (advisories A1 CSRF fetch outside deadline, A2 stale-mark text on ADMIN forms, A6 test gap -> T14) | issue #42
- T3 | S4 | merged into T6 (same files: purge + motive rules)
- T4 | S5 | delegated writer | merged PR #63 (ef1ef49); privacy verifier no blockers | issue #60
- T5 | S6-S7 | delegated writer + parent fixes | merged PR #50 (1066fb0); native review approved + acknowledged (review-ab2f661115028eee; one capture failed in preflight with a tool error, review still completed); follow-up action-only correction fix 46844f0 | issue #46
- T6 | S4+S8 | delegated writer + parent correction | merged PR #49 (d72d762); verifier B1+A1 fixed; native review granted, approved, acknowledged (review-40ae69a97ef741ed) | issue #43, D-20261027-01..03, V16
- T7 | S9 + L9 + L24 | delegated writer | merged PR #51 (f3042d7); native review approved + acknowledged | issue #47
- T8 | S10 | delegated writer | merged PR #68 (925e2a9); parent spot-checked counts and cited tests | issue #64
- T11 | S11 (L11, L21, L26, L28) | delegated writer + parent fixes | merged PR #57 (841d50a); native review (4 lenses) approved + acknowledged; retry-as-done and shared label fixes | issue #53, V19-V21, D-20261027-07/-08
- T13 | S11 (L15) | delegated writer | merged PR #58; native review approved + acknowledged (suggestions only) | issue #54, V22, D-20261027-09
- T12 | S11 (L14, L18) | delegated writer + parent fix | merged PR #65 (f3c9635); verifier no blockers; native review approved; bound STATUS timed out twice (operation_timeout) -> owner chose report and continue: occurrence comment on gentle-ai #5422, captured decline run once (declined_this_candidate), re-entered STATUS, then acknowledged | issue #59, V23, D-20261027-11
- T16 | site location check (L33) | owned by Enrique: issue #67 commented with the approved design, status:approved, assigned to EnriqueMartinez26 (owner: "Sí, comentar y aprobar") | not ours
- T4 | S5 | pending after T11: audit read API + ADMIN view (incl. void/cancel audits)
- T9 | S11 | owner answered all (L11, L14, L15, L18, L19, L21); to implement: cancel jornada, bulk declaration, ADMIN password reset, template assignment D-20261015-02, void mark
- T10 | T1 advisories + L19 | delegated writer + parent fix | merged PR #52 (7aca78e); native review approved + acknowledged; review finding R4-001/002 (TransactionException -> 503) fixed | issue #48
- T15 | CI | parent inline | merged PR #56 (2afce0a); verifier B1 fixed; native review approved + acknowledged | issue #55
- T14 | frontend follow-ups + L30 | delegated writer | merged PR #62 (9128e42); assess medium under_budget; parent read the non-test diff | issue #61

## Log
- L1 (2026-10-27, owner): "Corregi todo. exitos"
- L2 (2026-10-27, owner): "toda duda que tengas me la vas consultando"
- L3: Audit findings verified by me: S1, S3 (409 message), S4, S5, S6. Others reported by agents with file:line evidence.
- L4: Deferred as low value unless owner asks: unlimited anonymous session rows from GET /csrf; bootstrap left enabled crash-loops (fails closed).
- L5 (2026-10-27, owner answer): classified deviation whose type changes -> "Vuelve a revisión (Recommended)": classification cleared, motive kept, audited.
- L6 (owner answer): employee motive correction -> "Hasta que se clasifique (Recommended)": editable while unclassified, then fixed; each change audited.
- L7 (owner answer): motive arriving after classification -> "Vuelve a revisión (Recommended)": ADMIN may classify without motive; a later motive clears the classification.
- L8 (owner answer): inbox order -> "Por hora del hecho (Recommended)": order by occurredAt desc, stable cursor; also stop no-op updated_at bumps.
- L9 (owner answer): push for multi-company ADMIN -> "Por empresa, siguen al salir": subscribe only in the company where the ADMIN enables it; sign-out does NOT remove the subscription.
- L10: T1 and T2 writers done (backend verify 129/129; frontend 146 tests). Seam fixed by parent: CSRF rejection without session answers 401 `SESSION_EXPIRED` (not UNAUTHORIZED); login retries once on it; on PUT /session/password only `CURRENT_PASSWORD_INVALID` means wrong current password. Frontend after seam: 148 tests green.
- L11 (owner answer): cancel declared jornada -> "Solo sin marcas, con motivo (Recommended)": state CANCELADA with author, time and reason; closes its SIN_INGRESO; with marks use corrections.
- L12: Enrique PR #40 (assign issue rule in CLAUDE.md §1) reviewed: correct; date says 2026-10-27 (approved 2026-10-26) and lacks "if someone else is assigned, do not start".
- L13: PR #40 adjusted (date 2026-10-26, assigned-to-other rule) and merged bcb1325.
- L14 (owner answer): bulk declaration -> "Sí, con días de semana (Recommended)": employees + site + template + range <= 31 days + weekdays; created once, no stored rule; existing ones skipped and reported.
- L15 (owner answer): ADMIN password reset -> "Solo empleados de una empresa (Recommended)": temporary password shown once, forced change, closes sessions, audited; only EMPLEADO accounts with memberships only in that company.
- L16 (owner answer): native review of PR #44 -> "Revisar este cambio" (granted).
- L17: T6 open questions for owner: keep previous non-SALUD motive text in audit on correction? (writer chose categories only); employee pending list capped at 100.
- L18 (owner answer): implement D-20261015-02 template assignment -> "Sí, como está escrita (Recommended)": per-employee template with start date and history; declaration uses the one in force; ADMIN may pick another for a given day.
- L19 (owner answer): shared-IP lockout -> "Subir a 100 fallos (Recommended)": 100 failures per IP in 15 min, configurable; DNI lock (5) unchanged.
- L20 (owner answer): motive correction audit -> "No, solo categorías (Recommended)": previous text not kept.
- L21 (owner answer): void a wrong mark -> "Sí, anulada y auditada (Recommended)": reason required; mark stays visible as voided, stops counting; only if the remaining history is valid.
- L22: T6 verifier: 6/8 met, B1 (reactivation kept motive, unrequested) fixed by restoring baseline clearing; A1 (audit FK lock inversion) fixed by locking the account first in saveMotive; A3 decision counts -> T8. Focused DeviationRulesMySqlTest 15/15.
- L23: Native review of T6 granted by owner ("Revisar este cambio"), approved; advisories on legacy purged rows and pre-change cursors not applicable (no production data or deploy).
- L24 (owner answer): announced SIN_INGRESO replaced by LLEGADA_TARDE -> "No, solo la bandeja (Recommended)": no second push (D-20261027-06).
- L25 (owner answers): native review of PR #50 and PR #51 -> "Revisar este cambio".
- L26 (owner answer): after cancelling a jornada, the same employee/site/date can be declared again -> "Sí (Recommended)".
- L27 (owner answer): npm audit deepmerge advisory -> "Excepción puntual (Recommended)" (D-20261027-10).
- L28 (owner answer): a jornada whose marks are all voided can be cancelled -> "Sí (Recommended)".
- L29: Demo running locally on main 7aca78e (MySQL container braja-ingreso-egreso-mysql-1, backend :8080 profile local, Vite :5173) as the owner asked: "levanta el sistema asi lo voy probando mientras".
- L30 (owner answer): free-text ADMIN reasons on cancel/void -> "Aviso en el campo (Recommended)": kept as audit; the form warns not to write health data.
- L31 (owner answers): native review of PR #52, #56, #57, #58 -> "Revisar este cambio".
- L32: Estimate given to owner: about 2 hours for #59, #60, #61 and docs.
- L33 (owner answer, 2026-10-27): location vs site -> "indicador sin bloquear, pero de ultima que sea un poco exigente", then approved "Sí, tal cual": site stores latitude, longitude and radius (default 100 m, ADMIN 50-500); a mark is "en la sede" only if distance + GPS accuracy <= radius; outside, imprecise or without location -> new deviation FUERA_DE_SEDE requiring a motive, no push; the mark is never blocked. Needs a new decision row (changes "no se usa como geocerca").
- L34 (owner, 2026-10-27): "aun no hagas codigo igual, creo que enrique esta avanzando con algo pero seguro lo haga asi nomas".
- L35 (owner answer): pause only the location feature ("Solo ubicación"); finish #65 and docs.
- L36: Enrique issue #66 (checkbox fix, focus outline CSS) has no status:approved label; his CSS change is only in his local copy, not in the demo.
- L37 (owner answer): Gentle AI STATUS timeout on #65 -> "Reportar el defecto y seguir".
- L38: Advisories left open (documented in T8): bulk lot holds locks for large lots; persistent 4xx push subscriptions retried not evicted; no pushsubscriptionchange resync; rule 25 hostile text not stripped; location check is issue #67 (Enrique).
- L39: Feature complete 2026-10-28: all audit units merged (#44, #45, #49, #50, #51, #52, #56, #57, #58, #62, #63, #65, #68); main CI green on 925e2a9. Remaining open issues are Enrique: #66 (checkbox, no status:approved) and #67 (site location, approved design). Open advisories documented in CLAUDE.md section 7.
- L40 (owner, 2026-10-28): "sisi" -> demo restarted on main 925e2a9: old backend/Vite processes (ours, verified by command line) stopped; MySQL container had received a SHUTDOWN signal at 2026-10-28 00:03 local (not a crash), restarted with data intact (33 jornadas); V19-V23 applied; backend :8080, Vite :5173.
