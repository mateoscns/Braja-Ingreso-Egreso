Objective: admin filters, per-employee history, display name in session and deviation fact time, ready for the client demo.
Branches: feat/api-history-filters (T1, issue #31) then feat/frontend-history-filters (T2, issue #32). Delivery: two sequential PRs to main (backend first). Runner: backend `./mvnw verify` (Testcontainers MySQL 8.4); frontend `npm run lint && npm run typecheck && npm test && npm run build`.

## Specs
- S1. From the owner's original prompt: el ADMIN "Ve todas las marcas y desvíos; filtra por empleado, sede y fecha." Inbox gets optional filters employeeId, siteId, from, to (local jornada dates), range ≤ 366 days, cursor pagination consistent with filters, company-scoped.
- S2. History: the ADMIN can see the jornadas of one employee (or site) over a date range, with their marks and deviations; bounded range; company-scoped.
- S3. Owner (2026-10-22): "Si la API suma el nombre para el saludo y la hora real de la llegada tarde. Si que lo haga." Session exposes the person's display name for the active company; the greeting uses it.
- S4. Same quote as S3: Deviation exposes occurredAt = the fact time (source mark time; due time for SIN_INGRESO / MARCA_FALTANTE); the UI shows it instead of createdAt.
- S5. All API changes are additive (optional params/fields); openapi.yaml updated in the same commit; integration tests prove filters never cross companies.
- S6. Owner (2026-10-23): "prefiero tenerlo listo para la demo" — demo seed data (a realistic week) and a short demo script, kept outside the repo.

## Tasks
- T1 | S1-S5 (backend) | delegated writer (context backstop: long parent session) | done: verify 113/113, independent verifier no leaks, 1 correction batch | commit: 16c72fd (PR #33)
- T2 | S1-S4 (frontend) | delegated writer (context backstop) | done: lint/typecheck/102 tests/build green; history lacks scheduled time (not in JornadaSummary) | commit: 13eb5cd (PR #34)
- T3 | S6 | delegated (seed + browser screenshots) | done: week seeded on running demo (main 10f144b), screenshots checked; seed script in scratchpad/demo-seed | commit: none (outside repo)

Feature complete: PR #33 (10b42a1) + PR #34 (10f144b) merged with green main CI.

## Log
- L1 (2026-10-22, owner): "Si la API suma el nombre para el saludo y la hora real de la llegada tarde. Si que lo haga."
- L2 (2026-10-23, owner): "prefiero tenerlo listo para la demo" (filters/history before the demo, not after client feedback).
- L3: Gap found 2026-10-23: GET /inbox only accepts limit/cursor (openapi); Jornadas queries a single date; Session has no display name; Deviation has only createdAt/updatedAt.
