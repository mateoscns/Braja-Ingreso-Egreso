# Fichaje Braja: implementation slices of the UX/UI refactor

Task T7/T8/T9 of `odd/tasks/ux-ui-refactor.md` (spec S10). Date: 2026-11-11. Plans the work of `design-system.md` on the existing frontend.
Decided and planned for directly: **D-20261111-01** (visible vocabulary) and **D-20261111-02** (four destinations, in two steps).

**Conventions**

- Paths are relative to `frontend/src/`; `path:line` at `dfcf9e8`. "CSS" is `styles.css`, "CSS tests" is `app/styles.test.tsx`.
- Size = authored changed lines, additions plus deletions, tests included: an estimate for planning (about 400 is the heuristic, not a cap). "Moved" lines are counted apart.
- "Verify" names the baseline captures to compare with, in `ux/baseline/shots/<role>/<name>--<width>.png` (`--390-viewport` is the first screenful of a phone). Every slice also runs the gate of the task file: `npm run lint && npm run typecheck && npm test && npm run build && npm run audit:prod`.
- The eleven tests of `app/styles.test.tsx` are numbered by their order in the file:
  T1 field and mark-button borders (`:46`), T2 primary mark button green (`:54`), T3 `color-scheme` (`:61`), T4 phone menu without sideways scroll (`:65`), T5 narrow top bar in one row (`:72`), T6 help line under «Ingresar» (`:81`), T7 alerts button on one line (`:86`), T8 small buttons 44 px (`:91`), T9 one extra action full row and the schedule card wrapping (`:96`), T10 room for the fixed alerts bar (`:101`), T11 short status of the alerts bar (`:116`).
- Each rule keeps its class name when the component survives (design system, section 4), so most slices restyle in place and their result is visible at once. A slice that introduces a class names what it replaces and removes the old rule and its uses in the same slice whenever the uses are in files it owns; what is left is counted by a ceiling test that only goes down, and slice H1 ends at zero.

---

## 1. Order at a glance

| # | Slice | Size | Owner decision | Shares a file with Enrique's #66 / #70 | Depends on |
|---|---|---|---|---|---|
| A1 | Tokens and stylesheet guards | 260 | none | CSS (top block only), CSS tests | |
| A2 | Base type, links, focus, placeholder | 150 | none | CSS | A1 |
| B1 | Icon set | 200 | none | no | A2 |
| B2 | Buttons | 220 | none | CSS, CSS tests | A2 |
| B3 | Fields, checks, option tiles, form layout | 300 | none | CSS, CSS tests; overlaps the fix of #66 | B2 |
| B4 | Messages, status tag, panel, fold, empty, loading | 330 | none | CSS | B1, B3 |
| B5 | Record list, table, one breakpoint hook | 220 | none | CSS; `AdminViews.tsx` (3 lines) | B4 |
| W1 | One module for labels (no wording change) | 220 | none | `AdminViewsRender.tsx` (8 lines) | |
| W2 | Vocabulary: marks, cases, states | 260 | open words of 7.2 (assumptions stated) | no | W1 |
| C1 | Shell: top bar, context strip, brand, update banner, install help | 380 | none | CSS, CSS tests | B4 |
| C2 | Alerts control split in hook and render (no visual change) | 280 (190 moved) | none | no | |
| N1 | Step 1: an address per section | 220 | none | no | |
| M1 | Split `AdminViewsRender.tsx` per section (mechanical) | 60 (+480 moved) | none | **yes: the whole file** | #66, #70 merged, or agreed |
| M2 | Split `AdminViews.tsx` per section (mechanical, two commits) | 90 (+950 moved) | none | **yes: the whole file** | M1 |
| W3a | Vocabulary: employee, auth, messages, push text | 280 | none | no | W2 |
| W3b | Vocabulary: ADMIN screens, titles, glossary test | 420 | none | yes (render files) | W2, M1 |
| N2 | Step 1: the day list with its detail in place | 400 | none | yes | M2, B5 |
| D1 | Employee: "now" block, clocking buttons, mark confirmation | 380 | none | CSS, CSS tests | B4, W3a |
| D2 | Employee: day sheet | 320 | confirm the proposal; copy of one note | CSS | D1 |
| D3 | Employee: «Para explicar» as one task | 380 | confirm the order of sections | CSS | D2 |
| D4 | Auth screens | 280 | eyebrows (yes/no) | CSS, CSS tests | C1, B3 |
| N3a | Step 2: «Hoy» and «Días de trabajo» as two sections | 380 | none (decided) | yes | N2, W3b |
| N3b | Step 2: the search of earlier days inside «Hoy» | 320 | none (decided) | yes | N3a |
| N4 | Step 2: navigation (bar and rail), «Configuración» page, avisos control moved | 420 | reading of "the same list" on the rail | CSS, CSS tests | N1, N3b, C1, C2, B1 |
| E1 | «Para revisar»: case rows and the pair | 400 | person first (confirm) | yes | N4, B5 |
| E2 | «Hoy»: marks, inline forms, change list | 400 | none | yes | N4 |
| E3 | «Días de trabajo»: the load form | 280 | none | CSS | N4 |
| E4 | «Locales»: list, location form, map frame | 400 | none | yes | N4 |
| E5 | «Horarios» | 320 | none | CSS, CSS tests | N4 |
| E6 | «Equipo» | 380 | none | yes; overlaps #66 | N4 |
| E7 | «Primeros pasos» | 180 | none | CSS | B4, W3b |
| F1 | Focus and page titles | 280 | none | yes (containers) | E1 to E6 |
| F2a | One validation style: auth and employee | 250 | none | no | D4, D3 |
| F2b | One validation style: ADMIN forms | 400 | none | yes | E1 to E6 |
| F3 | Transient status and failed-load pieces | 180 | none | no | B4 |
| G1 | Breakpoints, short viewport, forced colours, skip link | 320 | copy of the skip link | **yes: the media blocks #70 works on** | all E |
| G2 | Verification pass at four widths, zoom and keyboard | 200 (budget) | none | depends on findings | G1 |
| H1 | Removal of legacy tokens, classes, rules and barrels | 350 (mostly deletions) | none | CSS, CSS tests | all |

About 11,000 authored lines in 38 slices, plus about 1,620 moved lines (C2, M1, M2). The first seven (A1 to B5) plus W1, W2, C1, C2 and N1 need no owner decision and no file split; they are the part that can start now.

### Two tracks

`styles.css` is shared by almost every visual slice, and the task forbids two agents on one file (S3). So the plan has two tracks that never share a file and can run at the same time, one slice of each:

- **Style track** (each touches `styles.css`, strictly one after another): A1 → A2 → B2 → B3 → B4 → B5 → C1 → D1 → D2 → D3 → D4 → …
- **Logic track** (TypeScript and tests only): B1, W1 → W2 → W3a, C2, N1, M1 → M2.

From N2 on, slices touch both a section's files and `styles.css`: one at a time.

---

## 2. Coordination with the other developer's open work

Enrique holds #66 («corregir checkbox de sedes en asignación de empleados») and #70 («ampliar la cobertura responsive») on `features/admin/AdminViews.tsx`, `AdminViewsRender.tsx` and `styles.css`. Everything here goes through Mateo.

| File | Slices that touch it | How to sequence |
|---|---|---|
| `AdminViewsRender.tsx` (477 lines) | W1 (8 lines at `:12`, `:473-477`), M1 (all), then through the split files: W3b, N2, N3a, N3b, E1, E2, E4, F1, F2b | W1 is small enough to rebase over. **M1 waits until #66 and #70 are merged, or Enrique agrees to rebase**: a file split cannot be rebased over cleanly by either side |
| `AdminViews.tsx` (948 lines) | B5 (3 call sites of the hooks), M2 (all), then N2, N3a, N3b, E1, E2, E4, E6, F1, F2b | Same as M1 |
| `EmployeesViewRender.tsx`, the employees container (`AdminViews.tsx:610-736`) | E6 | #66 is on these lines: E6 after #66 |
| `styles.css` | every visual slice | A1 only replaces lines 1 to 31. B and C slices edit the rules of the component they own. **#70 works on the media blocks (`:329-425`)**: slices N4 and G1 rewrite those blocks and go after #70. Slice B3 changes `.field input` (`:97-102`) and removes the checkbox patches (`:216`, `:322`): it fixes the cause of #66 (finding F-17), so either #66 lands first and B3 removes its patch, or B3 closes #66; decide with Enrique |
| `app/styles.test.tsx` | A1, B2, B3, C1, D1, D4, E5, N4, H1 | #70 will add or change assertions here: rebase the slice in progress, never both at once |

**Should the split of `AdminViews.tsx` and `AdminViewsRender.tsx` be its own early mechanical slice? Yes**, as M1 and M2, with no visual and no behaviour change:

- Every later ADMIN slice then touches one section's file of 100 to 400 lines instead of two files of 477 and 948 lines with lines of up to 3,000 characters, and reviewing "each changed file read whole" (CLAUDE.md §1) becomes possible.
- The conflict with #66 and #70 happens once, at a moment chosen with Enrique, instead of in ten slices.
- The decided regrouping (N3a, N3b) splits `JourneysView` anyway; doing it on a 948-line file mixes a move with a change.
- "Early" means before W3b and N2, not first: phases A, B and the logic track do not need it.

---

## 3. Slices

### Phase A: fundamentals of the visual system

**A1. Tokens and stylesheet guards**
- Goal: the token block of `tokens.css` becomes the top of the stylesheet, next to the old names, and tests start counting what is left.
- Files: `styles.css` (lines 1 to 31 replaced by the new block, then a block marked `/* legacy tokens, removed in H1 */` with the 17 old names and their current values, then the `:root` text properties; region banners added as comments), `app/styles.test.tsx`.
- Must not touch: any rule below line 32 (no visual change), any `.tsx` component, `index.html`.
- Tests: adds (1) the contrast table of `contrast.mjs` (55 pairings) reading the tokens; (2) four ceilings that only go down: colour literals outside the token block (start: the count of the test's own pattern, 144 with `rgba()` and `white`), `font-size` declarations that are not a token (start 82, in 23 distinct values), `box-shadow` declarations (16), uses of a legacy token (`var(--green`, `var(--text-primary` …); (3) `:root` still declares `color-scheme: light`. T1 to T11 untouched: the legacy names keep their literal values, which T2 and T10 read (`tokens.get('--green')`, `--alerts-bar-clearance`).
- Size: 260.
- Verify: nothing changes on screen: any five baseline captures at 390 and 1366 px are identical.
- Depends on: nothing. Parallel: with the logic track.

**A2. Base type, links, focus, placeholder**
- Goal: one font stack, a line height on `body`, the heading scale, underlined links, the focus ring and the placeholder colour from tokens.
- Files: `styles.css` (`:root` text properties `:2-7`, `:37-49`, `:107-119`, new `::placeholder`, `.icon`, `.visually-hidden`), `app/styles.test.tsx`.
- Must not touch: component rules; breakpoints; `.eyebrow` text (restyled only: 14 px, 700, no letter-spacing).
- Tests: adds: `body` has `line-height`; `h1` uses `--font-size-display`; a `::placeholder` rule with `--text-muted` and `opacity: 1`; no `outline: none` without a `:focus-visible` rule; `a` is underlined. Lowers the font-size ceiling.
- Size: 150.
- Verify: every screen gets taller (line height): check no overflow at 320 px on `auth/login--empty`, `employee/dia--en-curso-sin-pendientes`, `admin/bandeja--con-casos-y-aviso-de-dias`, `admin/jornadas--detalle-dia-completo`, `admin/sedes--agregar-mapa-abierto`; focus ring with the keyboard on login; placeholder colour on `admin/sedes--lista`.
- Depends on: A1. Parallel: with the logic track.

### Phase B: reusable components

**B1. Icon set**
- Goal: `Icon` and `BrandMark` exist, with tests; nothing uses them yet.
- Files: `app/icons.tsx` (new), `app/icons.test.tsx` (new).
- Must not touch: any other file (the `.icon` rule came in A2).
- Tests: every name renders an `svg` with `aria-hidden="true"` and `focusable="false"`; an unknown name fails the type check; `BrandMark` has no accessible name.
- Size: 200.
- Verify: unit tests only.
- Depends on: A2. Parallel: **yes**, with any style-track slice (new files only).

**B2. Buttons**
- Goal: every button takes the new look; `.button-secondary`, `.button-link`, `.button-danger`, `.button-large`, `.button-clock`, `.button-block`, `.button-pair` exist.
- Files: `styles.css` (`:38-40`, `:121-135`, `:452`), `app/styles.test.tsx`.
- Must not touch: `.tsx` files. Old class names keep working through shared selectors (`.button-secondary, .button-outline, .button-quiet { … }`, `.button-danger, .button-danger-outline`, `.button-block, .button-wide`), which H1 removes.
- Tests: **T8 rewritten**: `.button` has `min-height: var(--target)` and `.button-link` has `min-width: var(--target)`; adds: `.button:disabled` sets no `opacity`; `.button-primary` uses `--brand` and `--on-brand`; `.button[aria-pressed="true"]` uses `--brand` for its edge. T2 stays (the dead rule is removed in D1).
- Size: 220.
- Verify: buttons are everywhere: at 320 and 390 px `auth/login--empty`, `employee/marcar--entrada-confirmada-en-curso`, `admin/bandeja--con-casos-y-aviso-de-dias`, `admin/empleados--lista`, `admin/jornadas--detalle-de-hoy-con-ubicaciones`; the top bar still fits one row at 320 px (T5); a disabled button is legible on `admin/empleados--alta-formulario-completo`.
- Depends on: A2. Parallel: with the logic track.

**B3. Fields, checks, option tiles, form layout**
- Goal: label, hint, control, error in that order; checkboxes stop inheriting the text box; one selected style for every option.
- Files: `app/ui.tsx` (`FormField`, `:75-92`: order and `.field-error`, `.field-invalid`), `app/ui.test.tsx`, `styles.css` (`:64-69`, `:97-105`, `:205-208`, `:216`, `:237`, `:298-301`, `:319-324`, `:443`), `app/styles.test.tsx`.
- Must not touch: the forms themselves (which fields, which validation); placeholders' text (moving examples to hints is done per screen).
- Tests: **T1 rewritten** (field half): the rule `.field :is(input:not([type=checkbox], [type=radio]), select, textarea)` uses `var(--border)`; adds: `.choice:has(input:checked)` and `.button[aria-pressed="true"]` share the `--brand` edge; `input[type=checkbox]` is `var(--target-floor)`. `app/ui.test.tsx:46` (`field-hint field-hint-error`) becomes `field-error`; adds: the hint comes before the control in the DOM.
- Size: 300.
- Verify: `auth/cambio-de-clave--error-clave-nueva-corta`, `employee/motivo--error-falta-elegir-tipo`, `employee/motivo--completo-antes-de-enviar`, `admin/horarios--crear-con-errores`, `admin/jornadas--cargar-dias-elegir-fechas-y-otro-horario` (weekday checkboxes, quick choices), `admin/empleados--editando-una-persona`, `employee/dia--dos-turnos-uno-cancelado-y-ausente` (shift picker) at 320, 390 and 1366 px.
- Depends on: B2. Collides with #66 (see section 2). Parallel: with the logic track.

**B4. Messages, status tag, panel, fold, empty, loading**
- Goal: four kinds of message with bar and icon; a tag with shape and word; flat sections.
- Files: `app/ui.tsx` (`PageMessage` gains `kind="warning"` and its icon; new `StatusTag`; `LoadFailure` and `PageHeading` move here from `AdminViewsRender.tsx:462-469` with a re-export left behind), `app/ui.test.tsx`, `styles.css` (`:52-54`, `:137-142`, `:181-184`, `:245-254`, `:447-451`, `:466-467`).
- Must not touch: call sites of `status-chip` (the ten old classes get the new tones through shared selectors: `.status-ok, .status-justificado { … }`; each screen slice moves its call sites to `StatusTag`); the text of any message.
- Tests: `app/ui.test.tsx`: each kind has its role and an `aria-hidden` icon; `StatusTag` renders icon and word and no button role; `.spinner` assertion (`:68`) kept. CSS tests: `.message` uses `border-left`, not a shadow; no rule sets `box-shadow` except the two inset edges (ceiling lowered).
- Size: 330.
- Verify: `admin/bandeja--clasificacion-guardada`, `admin/bandeja--no-se-pudo-cargar-sin-internet`, `admin/bandeja--empty-fresh-install`, `admin/jornadas--cargar-dias-resultado-con-omitidos`, `employee/marcar--error-sin-internet`, `employee/otro-dia--desvios-a-revisar-y-no-justificado` (tags), `admin/bandeja--filtros-abiertos-en-celular` (fold) at 320, 390 and 1366 px.
- Depends on: B1, B3.

**B5. Record list, table, one breakpoint hook**
- Goal: rows separated by hairlines instead of cards; tables in the sheet style; one hook for the table switch at 768 px.
- Files: `styles.css` (`:191-204`, `:209-221`, `:234-236`), `app/useBreakpoint.ts` (new), `app/useBreakpoint.test.ts` (new), `features/admin/useNarrowScreen.ts` and `useMediaQuery.ts` (deleted), `features/admin/AdminViews.tsx` (`:108`, `:622`, `:753`: the three imports and calls).
- Must not touch: the markup of the lists (class names `history-*`, `simple-*`, `template-*` restyled in place; renamed to `record-*` per screen slice).
- Tests: the hook follows `matchMedia('(min-width: 768px)')` and is false without `matchMedia`; existing view tests that mock the narrow query (`AdminViews.test.tsx`, `EmployeesView.test.tsx`) update their query string.
- Size: 220.
- Verify: `admin/empleados--lista` at 390 (list), 768 (table, whole, no cut columns: today it is cut) and 1366 px; `admin/jornadas--hoy`, `admin/historial--resultados-de-una-persona`, `admin/sedes--lista`, `admin/horarios--lista-y-crear-corrido`.
- Depends on: B4.

### Vocabulary (D-20261111-01)

Three text-only slices, so that a word never has two versions on screen for long, plus the titles that change with the menu (in N3a, N4). They change strings and the tests that read them, not layout.

**W1. One module for labels (no wording change)**
- Goal: every name of a mark, a case, a state and a category comes from `shared/labels.ts`.
- Files: `shared/labels.ts` (new), `shared/labels.test.ts` (new), `features/admin/AdminViewsRender.tsx` (`:12`, `:473-477`: the five functions become imports), `features/employee/employeeDay.ts` (`:4-20`, `:160-163`), `features/employee/EmployeeViews.tsx` (`:18-27`), `shared/format.ts` (`:3-13`).
- Must not touch: any string (the module keeps both vocabularies for now: `forAdmin` and `forEmployee`); `employeeMessages.ts`.
- Tests: the new test pins today's words; no existing test changes.
- Size: 220.
- Verify: tests only; no screen changes.
- Depends on: nothing. Parallel: **yes**, with the style track.

**W2. Vocabulary: marks, cases, states**
- Goal: the module carries one vocabulary for both roles: «Entrada», «Salida», the eight case names, «Todavía no explicó».
- Files: `shared/labels.ts`, `shared/labels.test.ts`, and the tests that assert those words: `features/admin/AdminViews.test.tsx`, `AdminHistory.test.tsx`, `JornadaAudit.test.tsx`, `AccessibilityBase.test.tsx`, `features/employee/EmployeeApp.test.tsx`, `EmployeeViews.test.tsx`, `employeeDay.test.ts`, `shared/format.test.ts`.
- Must not touch: sentences built around the words (`describeDeviation`, `employeeDay.ts:179`), screen titles, API values.
- Tests: the words of section 7.2 of the design system, one assertion per value and role.
- Size: 260.
- Verify: `admin/bandeja--con-casos-y-aviso-de-dias`, `admin/jornadas--detalle-con-marca-anulada-e-historial-de-cambios`, `admin/historial--resultados-de-una-persona`, `employee/otro-dia--desvios-a-revisar-y-no-justificado` at 390 px: new words, same layout; the longest tag («Todavía no explicó») does not overflow a row at 320 px.
- Depends on: W1. Owner: the open words of 7.2 (break marks for the ADMIN, states of a day, the employee's «Falta explicar») are implemented as assumed there; a later answer changes one module.

**W3a. Vocabulary: employee, auth, messages, push text**
- Goal: «contraseña» only, «local», «día de trabajo», «avisos» on the employee and auth side and in shared messages.
- Files: `features/auth/AuthScreens.tsx` (`:38`), `shared/password.ts`, `shared/api/client.ts` (message strings only, `:44-89`), `features/employee/EmployeeViews.tsx` (titles `:36`, `:156`, `:165`), `features/employee/employeeDay.ts` and `employeeMessages.ts` (strings), `device/push/safeNotification.ts` (`:51-60`: the fixed title becomes «Para revisar»; still counts only, D-20261014-15), `device/pwa/InstallControl.tsx` (`:29`), and their tests.
- Must not touch: status codes and code-to-message mapping in `client.ts`; the payload contract of the notification.
- Tests: updated strings; `safeNotification` test asserts the new title and that it holds no name.
- Size: 280.
- Verify: `auth/login--empty`, `auth/cambio-de-clave--vacio`, `employee/dia--hoy-sin-turno-cargado`, `employee/dia--terminado-con-dos-motivos-pendientes`.
- Depends on: W2. Parallel: yes, with a style-track slice that does not touch these files.

**W3b. Vocabulary: ADMIN screens, titles, glossary test**
- Goal: every static string of the ADMIN uses the glossary; titles equal menu words («Para revisar», «Locales», «Equipo»); a test keeps retired words out.
- Files: the render files of the split (`AdminInboxRender.tsx`, `SitesViewRender.tsx`, `JourneysViewRender.tsx`, `AdminHistoryRender.tsx`), `EmployeesViewRender.tsx`, `ScheduleEditor.tsx`, `WorkDaysForm.tsx`, `FirstSteps.tsx`, `setupStatus.ts` (step texts and section labels), `AdminApp.tsx` (`:13-20`, labels only), `device/push/AdminPushControl.tsx` (strings), message strings in the containers, their tests, and `app/glossary.test.ts` (new).
- Must not touch: layout, class names, `AdminSection` ids, addresses.
- Tests: `app/glossary.test.ts` reads the sources (as `styles.test.tsx:5-7` reads the stylesheet) and fails when a retired word of 7.2 is inside a string literal or JSX text of a non-test file; identifiers, comments and API values are exempt by construction (it looks at literals only), and an explicit short list holds the exceptions (the address `#/historial`, for instance).
- Size: 420 (strings and the assertions that read them).
- Verify: every ADMIN capture at 390 px for wording; at 320 px that «Avisos en este dispositivo» and the longer titles do not overflow.
- Depends on: W2, M1.

### Phase C: navigation and shared layouts

**C1. Shell: top bar, context strip, brand, update banner, install help**
- Goal: the dark top bar with the context strip under it; nothing floats; one brand component.
- Files: `app/ui.tsx` (`AppHeader` `:29-37`, `CompanySwitcher` `:39-69`, new `Brand`), `app/ui.test.tsx`, `device/pwa/InstallControl.tsx` and its test, `device/pwa/ServiceWorkerUpdate.tsx` and its test, `features/auth/AuthScreens.tsx` (the three brand lockups `:28`, `:50`, `:84` only), `styles.css` (`:35`, `:56-59`, `:152-164`, `:332-340`, `:362-366`, `:393-399`, `:422-424`, `:444`), `app/styles.test.tsx`, `frontend/vite.config.ts` (`background_color` → `#ffffff`).
- Must not touch: what the company switch does on change (finding F-20 stays a proposal); the ADMIN menu; the alerts bar; `index.html`.
- Tests: **T5 rewritten**: `.topbar` is a grid with the areas `brand`, `context`, `out`, has no fixed `height`, and no rule sets `position: sticky` on it; adds: `.update-banner` and `.install-help` are not `position: fixed` or `absolute`. `InstallControl.test.tsx`: the help closes with Escape and returns focus. `ui.test.tsx`: the brand has a space between its words and is a link only for the ADMIN.
- Size: 380.
- Verify: `employee/dia--sin-empezar`, `employee/instalar--ayuda-abierta`, `admin/instalar--ayuda-abierta`, `admin/bandeja--con-casos-y-aviso-de-dias`, `auth/login--empty` at 320, 390, 768 and 1366 px; a long company name wraps in the strip; with two companies the select has a visible label; installed on an iPhone the status bar is legible (manual, finding F-15).
- Depends on: B4. The fixed alerts bar still exists here and still has its clearance (T10 holds).

**C2. Alerts control split in hook and render (no visual change)**
- Goal: `AdminPushControl` becomes `useAdminPush()` plus a render component that takes props, so it can be placed in a page.
- Files: `device/push/AdminPushControl.tsx`, `device/push/useAdminPush.ts` (new), `device/push/AdminPushControl.test.tsx`.
- Must not touch: the API calls, the service worker, where the control is mounted (`AdminApp.tsx:110`), its CSS.
- Tests: the 13 existing tests pass unchanged; adds render-only tests with fixed props.
- Size: 280 (190 moved).
- Verify: `admin/avisos--bloqueados-en-el-navegador`, `admin/avisos--error-al-activar` identical.
- Depends on: nothing. Parallel: **yes**.

**N1. Step 1 of D-20261111-02: an address per section**
- Goal: reload and Back keep the place.
- Files: `features/admin/useAdminSection.ts` (new), `useAdminSection.test.ts` (new), `features/admin/AdminApp.tsx` (`:27`, `:45`, `:49`, `:58-63`, `:80`), `features/admin/AdminViews.test.tsx` (navigation helpers), `app/ui.tsx` (brand link target for the ADMIN).
- Must not touch: `sw.ts`, `device/push/*`, the Caddyfile, the start-section rule without a hash, any section's content.
- Tests: each address shows its section; an unknown address shows the start section; choosing a section sets the address; `hashchange` (Back) shows the previous section; with no hash and a missing step the app still opens on «Primeros pasos».
- Size: 220.
- Verify: by hand in a browser: open each section, reload, press Back; on Android installed app Back goes to the previous section before leaving.
- Depends on: nothing. Parallel: **yes**.

**M1. Split `AdminViewsRender.tsx` per section (mechanical)**
- Goal: one render file per section, no visual and no behaviour change.
- Files: `features/admin/AdminInboxRender.tsx` (from `:37-126`), `SitesViewRender.tsx` (`:20-35`, `:128-275`), `JourneysViewRender.tsx` (`:277-424`), `AdminHistoryRender.tsx` (`:426-460`), and `AdminViewsRender.tsx` reduced to re-exports so that no import changes (`AdminApp`, `EmployeesViewRender.tsx:6`, `ScheduleEditor.tsx:4`, `setupStatus.ts:2`, four test files).
- Must not touch: one character inside the moved code.
- Tests: none added; the suite passes unchanged.
- Size: 60 authored, about 480 moved.
- Verify: `git diff --stat` shows moves; any ADMIN capture identical.
- Depends on: #66 and #70 merged, or agreed with Enrique (section 2).

**M2. Split `AdminViews.tsx` per section (mechanical, two commits)**
- Goal: one container file per section.
- Files: `features/admin/AdminInbox.tsx` (`:89-177`), `AdminHistory.tsx` (`:179-216`), `EmployeesView.tsx` (`:610-736`), then in a second commit `SitesView.tsx` (`:218-608`) and `JourneysView.tsx` (`:744-948`); shared helpers (`:1-88`) to `features/admin/adminShared.ts`; `AdminViews.tsx` reduced to re-exports.
- Must not touch: state, effects, handlers.
- Size: 90 authored, about 950 moved.
- Verify: the suite passes unchanged.
- Depends on: M1.

**N2. Step 1 of D-20261111-02: the day list with its detail in place**
- Goal: on the days screen the list of the date comes first and a day opens under its own row, with each form under the mark it changes.
- Files: `features/admin/JourneysViewRender.tsx`, `JourneysView.tsx` (order of blocks; where the detail and the forms render; the scroll target `'jornada-detail'`), `features/admin/AdminViews.test.tsx` and `JornadaAudit.test.tsx`, `styles.css` (the `.inline-form` rule, replacing `.correction-form` and `.forgotten-mark-form` `:266-267`).
- Must not touch: the requests, the states of the forms, what each form sends; the load form (still on this screen until N3a, now under the list).
- Tests: after «Ver marcas» the detail is inside the row's list item or table row; after «Corregir» the form is within the mark's row and its first field has focus; after «Volver» focus is back on the button (findings F-03, P-01).
- Size: 400.
- Verify: `admin/jornadas--hoy`, `admin/jornadas--detalle-de-hoy-con-ubicaciones`, `admin/jornadas--corregir-marca-formulario`, `admin/jornadas--anular-marca-formulario`, `admin/jornadas--cancelar-formulario`, `admin/jornadas--abierta-desde-bandeja-egreso-sin-marcar` at 390 and 1366 px: the list is in the first screenful and the opened form is on screen without scrolling.
- Depends on: M2, B5.

**N3a. Step 2: «Hoy» and «Días de trabajo» as two sections**
- Goal: the days screen becomes two destinations: the day list with its detail, and the monthly load with the single day and the notice of days loaded.
- Files: `features/admin/JourneysView.tsx` and `JourneysViewRender.tsx` (the day part stays), `features/admin/WorkDaysView.tsx` (new container for `WorkDaysPanel`, the single-day form and the coverage notice, taken from `JourneysView`), `WorkDaysPanel.tsx`, `setupStatus.ts` (`AdminSection` gains the new section; the step that points to the load), `AdminApp.tsx` (two menu entries, their titles «Hoy» and «Días de trabajo», `showWorkDaysForm` `:70-74` becomes navigation), `useAdminSection.ts` (`#/dias-de-trabajo`), tests.
- Must not touch: what either part does; the old menu markup (it gets the two entries; the new navigation is N4).
- Tests: each address shows its part; «Cargar días» in the notice goes to «Días de trabajo»; a load result still offers «Asignar horario» and «Revisar horarios».
- Size: 380.
- Verify: `admin/jornadas--cargar-dias-resultado-ok`, `admin/jornadas--un-solo-dia-formulario`, `admin/bandeja--aviso-hay-dias-cargados` at 390 and 1366 px.
- Depends on: N2, W3b.

**N3b. Step 2: the search of earlier days inside «Hoy»**
- Goal: «Historial» stops being a section: its search by person, local and range is a fold of «Hoy», and each result opens the same detail.
- Files: `features/admin/AdminHistory.tsx`, `AdminHistoryRender.tsx`, `JourneysView.tsx`, `JourneysViewRender.tsx`, `AdminApp.tsx` (menu entry removed), `useAdminSection.ts` (`#/historial` shows «Hoy»), `AdminHistory.test.tsx`, `AdminViews.test.tsx`.
- Must not touch: the request of the search and its limits (D-20261023-01 stays satisfied).
- Tests: the search is reachable from «Hoy»; a result opens its day with the same actions; the old address still lands on «Hoy».
- Size: 320.
- Verify: `admin/historial--initial`, `admin/historial--resultados-de-una-persona`, `admin/historial--no-results`, `admin/historial--error-rango-de-fechas` against the new fold at 390 and 1366 px.
- Depends on: N3a.

**N4. Step 2: navigation, «Configuración» page, avisos control moved**
- Goal: four fixed bottom tabs on phones and the same list on the left on a computer; the avisos control lives in «Configuración»; nothing is fixed except the bar.
- Files: `features/admin/AdminNav.tsx` (new), `AdminNav.test.tsx` (new), `features/admin/ConfigurationPage.tsx` (new, render only), `AdminApp.tsx` (`:78-96`, `:110`), `useAdminSection.ts` (`#/configuracion`), `device/push/AdminPushControl.tsx` (render as `.setting-row`), `AdminPushControl.test.tsx`, `styles.css` (`:16-18`, `:36`, `:165-177`, `:342-349`, `:356-375`, `:400-403`, `:413`, `:462`), `app/styles.test.tsx`, `features/admin/AdminViews.test.tsx` (`:77`), `AccessibilityBase.test.tsx`.
- Must not touch: section contents; the hook of C2.
- Tests: **T4, T7, T10, T11 replaced**: `.nav` is `position: fixed` under 1024 px and static from it; `.main-content` and `html:has(.nav)` reserve `var(--bottom-nav-height)` plus the safe area; no other rule in the file is `position: fixed`; `--alerts-bar-clearance` is gone. `AdminNav.test.tsx`: one navigation landmark, four links in the decided order, `aria-current` on the right one, «Configuración» current while one of its parts is shown, the order identical with the setup complete or not. `AdminPushControl.test.tsx:94-113`: the `.push-*` selectors become role and text queries. The «Conexión protegida» foot (`AdminApp.tsx:96`) is removed if the owner agrees; otherwise it moves to the «Configuración» page.
- Size: 420.
- Verify: `admin/navegacion--fila-que-se-desliza`, `admin/bandeja--con-casos-y-aviso-de-dias`, `admin/avisos--bloqueados-en-el-navegador`, `admin/avisos--error-al-activar`, `admin/primeros-pasos--faltan-pasos` at 320 (the four labels whole, «Configuración» included), 390, 768 (bar) and 1366 px (rail); Tab through a page at 320 px: no focused control under the bar; a phone lying down (640 × 360): the bar is not fixed.
- Depends on: N1, N3b, C1, C2, B1; after #70 (media blocks).
- Owner: whether the rail lists the parts of «Configuración» (design system 5.2); one rule either way.

### Phase D: the most used screens (the employee's day first)

**D1. Employee: "now" block, clocking buttons, mark confirmation**
- Goal: the state of the day, the next mark and the schedule in one block; a confirmation that cannot be mistaken for anything else.
- Files: `features/employee/EmployeeViews.tsx` (`DayHeading` `:29-31`, `MarkFeedback` `:42-54`, `MarkPanel` `:56-76`, the schedule lines `:80-82`), `features/employee/EmployeeApp.tsx` (`:273-296`, wrappers only), `styles.css` (`:269-277`, `:283-294`, `:303-316`, `:376`, `:380-381`, `:409-410`), `app/styles.test.tsx`, `features/employee/EmployeeApp.test.tsx` and `EmployeeViews.test.tsx`.
- Must not touch: `markFlow.ts`, `markOptions`, `exitConfirmation`, `daySentence`, the order in which the request, the confirmation and the focus move happen (48 tests guard it); the texts.
- Tests: **T2 replaced** (the dead `.mark-action-primary` goes): `.button-clock` has `min-height: var(--target-clock)`; **T9 first half replaced**: `.now-actions` is one column; **T1 second half removed** with `.mark-action`. `EmployeeApp.test.tsx:175` (`button-primary`, `button-wide`) → `button-primary`, `button-clock`; `:182` (`.employee-exit`) → `.now-apart`; `:212`, `:266` unchanged. Adds: no element says «registrada» while the request is pending; the missing-location line is inside the confirmation and is not a success line.
- Size: 380.
- Verify: `employee/dia--sin-empezar`, `employee/marcar--entrada-confirmada-en-curso`, `employee/marcar--pausa-desayuno-abierta`, `employee/marcar--confirmar-salida-antes-de-hora`, `employee/marcar--aviso-de-ubicacion`, `employee/marcar--error-sin-internet`, `employee/dia--terminado-salida-confirmada`, `employee/dia--turno-cancelado-elegido` at 320 and 390 px (`-viewport`: the next mark is in the first screenful before a mark); 768 px for the column width.
- Depends on: B4, W3a.

**D2. Employee: day sheet**
- Goal: the day as four fixed rows, with the rules for voided marks and for marks the encargado loaded.
- Files: `features/employee/employeeDay.ts` (new pure `daySlots`), `employeeDay.test.ts`, `features/employee/EmployeeViews.tsx` (`DayMarksPanel` `:78-92`), `EmployeeViews.test.tsx`, `styles.css` (`:278-282`, `:317`, `:411-412`).
- Must not touch: `markInstant` (`employeeDay.ts:66`), what the API returns.
- Tests: `daySlots`: four rows always; a break shows one time while out and a range once back; a voided mark never fills a row and is listed struck under it; a mark with `recordedAt` shows its declared time; two marks of one kind are both listed. Render: the table has a caption and row headers; an empty row has hidden text.
- Size: 320.
- Verify: `employee/otro-dia--dia-completo-con-pausas`, `employee/dia--en-curso-pausas-usadas`, `employee/dia--sin-empezar` at 320 and 390 px.
- Depends on: D1. First step: check that the employee's response carries `recordedAt`; if not, the note is dropped.
- Owner: confirm the sheet (a proposal of the directions report) and the note «Cargada por tu encargado».

**D3. Employee: «Para explicar» as one task**
- Goal: what is pending and what was sent in one section; the form opens where the button is; the options are large tiles.
- Files: `features/employee/EmployeeViews.tsx` (`MotivePanel`, `MotiveCard`, `DeviationsPanel` `:107-166`, `OtherDayPanel` `:168-173`), `features/employee/EmployeeApp.tsx` (`:258-262`, `:267`, `:289-294`: where the edit form renders and the order of sections), `styles.css` (`:256-265`, `:295-296`, `:318-325`), tests in `EmployeeApp.test.tsx`.
- Must not touch: `saveMotive`, the validation messages, what is kept after a failed send.
- Tests: «Corregir motivo» opens its form in the same item and moves focus into it; closing returns focus; the example is a hint tied to the textarea, not a placeholder; with nothing pending the section is one sentence.
- Size: 380.
- Verify: `employee/motivo--completo-antes-de-enviar`, `employee/motivo--corrigiendo-uno-enviado`, `employee/motivo--enviado`, `employee/motivo--error-falta-el-texto`, `employee/dia--terminado-con-dos-motivos-pendientes`, `employee/otro-dia--desvio-justificado` at 320 and 390 px.
- Depends on: D2.
- Owner: confirm «Para explicar» above the marks when something is pending.

**D4. Auth screens**
- Goal: login, password change and company chooser on the flat sheet.
- Files: `features/auth/AuthScreens.tsx`, `AuthScreens.test.tsx`, `styles.css` (`:56-63`, `:103`, `:144-150`, `:326-328`, `:387-392`), `app/styles.test.tsx`.
- Must not touch: the fields, `autocomplete`, the counter, the four validations, the session calls (O-5 is not part of this).
- Tests: **T6 replaced**: the rule it guarded (`.auth-card > .muted`) is gone, so the test becomes "the help line has `margin-top: var(--space-5)`"; `AuthScreens.test.tsx:153-170` (password toggle) unchanged.
- Size: 280.
- Verify: `auth/login--empty`, `auth/login--error-wrong-credentials`, `auth/login--bloqueado-por-muchos-intentos`, `auth/cambio-de-clave--completo-antes-de-guardar` (the save button in the first screenful at 320 × 640), `auth/cambio-de-clave--error-no-coinciden` at 320, 390 and 1366 px.
- Depends on: C1, B3.
- Owner: yes or no to dropping the three eyebrows («INGRESO AL SISTEMA», «CUENTA COMPARTIDA», «PRIMER INGRESO»); without an answer they stay, restyled.

### Phase E: the ADMIN screens

Each restyles one section with the components, moves its `status-chip` call sites to `StatusTag`, its lists to `record-*`, its examples from placeholders to hints, and removes the old rules it stops using. All after N4; one at a time (they share `styles.css`).

| Slice | Files | Must not touch | Tests | Size | Verify (390 and 1366 px unless noted) |
|---|---|---|---|---|---|
| **E1 «Para revisar»** | `AdminInboxRender.tsx`, `AdminInbox.tsx` (where a failed decision shows its message), `styles.css` (`:186-190`, `:256-266`), tests in `AdminViews.test.tsx`, `AccessibilityBase.test.tsx:52` | the requests, the cursor, the order of cases (D-20261027-03) | the pair is a named group; a failed decision shows its message inside the row; no `.button-primary` in a row at rest; `.deviation-symbol` assertion replaced by the tag's icon | 400 | `bandeja--con-casos-y-aviso-de-dias`, `--corregir-clasificacion-formulario`, `--filtrada-por-empleado`, `--filtro-sin-resultados`, `--abierta-desde-una-notificacion`; 320 px: the pair stacked; 768 px: stacked rows with the pair side by side |
| **E2 «Hoy»** | `JourneysViewRender.tsx`, `styles.css` (`:463`) | N2's structure; requests | a voided mark has the tag «Anulada» in both forms; the table is named by its section | 400 | `jornadas--detalle-dia-completo`, `--detalle-con-marca-anulada-e-historial-de-cambios`, `--cancelada`, `--marca-agregada`, `--agregar-marca-rechazada` |
| **E3 «Días de trabajo»** | `WorkDaysForm.tsx`, `WorkDaysPanel.tsx`, `WorkDaysView.tsx`, `FirstSteps.tsx` (`CoverageNoticeRender` `:35-40`), `styles.css` (`:453-456`, `:461`, `:468`) | `workDays.ts`, the preview sentence, the request | the preview is an `info` message present from the start; quick choices show the selected state with a check; `FirstSteps.test.tsx:118-119` (`.message-error`) kept | 280 | `jornadas--cargar-dias-elegir-fechas-y-otro-horario`, `--cargar-dias-error-fechas`, `--cargar-dias-resultado-con-omitidos`, `--un-solo-dia-ya-cargado` |
| **E4 «Locales»** | `SitesViewRender.tsx`, `SiteMapPanel.tsx`, `SiteMapPicker.tsx` (class only), `SiteZoneField.tsx`, `SitesView.tsx` (message placement), `styles.css` (`:70-96`), `SitesViewRender.test.tsx`, `AccessibilityBase.test.tsx:58` | `siteLocation.ts`, `siteMap.ts`, the geocode call, the two forms' state shapes | results and errors inside the form that caused them; the confirmation checkbox is a `.check` of the working size; `.row-avatar` assertion replaced | 400 | `sedes--lista`, `--agregar-mapa-abierto`, `--agregar-mapa-punto-elegido`, `--agregar-captura-sin-permiso`, `--cambiar-ubicacion-formulario`, `--historial-de-ubicacion-sin-cambios`, plus a local with history entries (the state PR #116 fixed); 320 px: the map and its confirm button in one screenful |
| **E5 «Horarios»** | `ScheduleEditor.tsx`, `SchedulesView.tsx`, `styles.css` (`:218-236`, `:241-244`, `:415-417`), `SchedulesView.test.tsx`, `app/styles.test.tsx` | `scheduleDraft.ts`, `scheduleTramos.ts` | **T9 second half replaced**: a `.record` wraps its actions by default; the type of schedule is a named group of option tiles | 320 | `horarios--lista-y-crear-corrido`, `--crear-cortado`, `--crear-con-errores`, `--cambiar-un-horario`, `--creado-paso-asignar-personas` |
| **E6 «Equipo»** | `EmployeesViewRender.tsx`, `EmployeesView.tsx` (message placement), `styles.css` (`:238-240`, `:469`), `EmployeesView.test.tsx` (`:70` `issued-password-code` kept) | `temporaryPassword.ts`, the reset flow, the requests | editing opens an inline form under the record in both forms; results inside the form; the provisional password uses `--font-mono` | 380 | `empleados--lista` (also 768 px: no cut column), `--editando-una-persona`, `--alta-formulario-completo`, `--alta-con-dni-repetido`, `--restablecer-clave-confirmar`, `--restablecer-clave-resultado`, `--horarios-de-una-persona` |
| **E7 «Primeros pasos»** | `FirstSteps.tsx` (`:10-29`), `styles.css` (`:457-460`), `FirstSteps.test.tsx` | `setupStatus.ts` | `:84-85` (`button-primary` on the next step only) kept; a done step renders no explanation; tags come from `StatusTag` | 180 | `primeros-pasos--faltan-pasos`, `--fresh-install`, `--todo-listo` at 320, 390, 1366 px. Depends only on B4 and W3b: it can go before N4 |

Order inside the phase: E1 and E2 first (daily), then E3, E6, E4, E5. After #66 for E6; after M2 for all but E3, E5, E7.

### Phase F: states, messages and interaction details

**F1. Focus and page titles**
- Goal: a section change names itself and takes focus; an inline form that closes gives focus back.
- Files: `app/revealAndFocus.ts` (new: one helper for "scroll into view and focus" replacing five hand-written ones, `AdminApp.tsx:70-74`, `AdminViews.tsx:141`, `:656`, `:716`, `:822`), `AdminApp.tsx` (`document.title`, focus on the `h1` after navigation), the section containers, `app/App.tsx` (titles of the entry screens), tests.
- Must not touch: when a request is made.
- Tests: `document.title` per section («Hoy · Fichaje Braja»); `toHaveFocus()` on the `h1` after navigating from inside the content; on the trigger after closing each inline form (findings F-19, F-27).
- Size: 280. Depends on: E1 to E6.

**F2a / F2b. One validation style** (auth and employee; then ADMIN forms)
- Goal: every form validates on submit with a message per field; no browser bubble; a submit button is disabled only while sending or with a visible reason.
- Files: F2a: `features/auth/AuthScreens.tsx` (`:32`), `features/employee/EmployeeViews.tsx`, tests. F2b: the forms of `AdminInboxRender.tsx`, `SitesViewRender.tsx`, `JourneysViewRender.tsx`, `EmployeesViewRender.tsx` and their containers' validation, tests.
- Must not touch: the rules themselves (lengths, ranges) or `shared/api/client.ts`; the neutral login error.
- Tests: an empty submit shows an error tied to its field (`toHaveAccessibleDescription`, `aria-invalid`); the result is inside the form (`within(form).getByRole('alert')`); the buttons listed in finding F-09 are enabled or have a described reason.
- Size: 250 and 400. Depends on: D4 and D3; E1 to E6.

**F3. Transient status and failed-load pieces**
- Goal: every "sending…" line is a status region that exists before its text; every failed load uses `LoadFailure`.
- Files: `app/ui.tsx` (a `Status` helper on the pattern of `PageMessage`), its callers (`AuthScreens.tsx:31`, `:53`, `:87`; `EmployeeViews.tsx:73`, `:148`; `app/ui.tsx:66`), the five hand-written retry blocks (`FirstSteps.tsx:18`, `EmployeeApp.tsx:284`, `EmployeeViews.tsx:111-112` and the two in the ADMIN renders).
- Tests: the region is in the document before the text (the pattern of `app/ui.test.tsx`).
- Size: 180. Depends on: B4.

### Phase G: responsive and accessibility

**G1. Breakpoints, short viewport, forced colours, skip link**
- Goal: the four breakpoints of the design system and nothing else; the last accessibility structure gaps.
- Files: `styles.css` (the remaining `max-width` blocks `:79`, `:92-96`, `:241-244`, `:329-333`, `:351-425`; the `forced-colors` block `:436-441` extended to the selected, pressed and current states; `@media (max-height: 480px)`), `app/styles.test.tsx`, `app/ui.tsx` and `app/App.tsx` (skip link, `main#contenido`), `.table-scroll` wrappers (`role="region"`, `tabindex`, name).
- Tests: the stylesheet has no `@media (max-width:` other than `359px` and no `min-width` other than 600, 768 and 1024 px; `media()` helper of the test file updated to `min-width`; the forced-colours block names the three state selectors; the first focusable element of each app is the skip link.
- Size: 320. Depends on: all E slices; after #70.
- Owner: the words of the skip link.

**G2. Verification pass**
- Goal: the manual checks of the guidelines at 320, 390, 768 and 1366 px, at 200 % and 400 % zoom, with the keyboard, in forced colours, and on one Android phone; fixes for what they find.
- Files: whatever the findings name; a budget of 200 lines, and a finding that needs more becomes its own slice.
- Depends on: G1.

### Phase H: removal

**H1. Legacy tokens, classes, rules and barrels**
- Goal: one system left.
- Files: `styles.css` (the legacy token block; shared selectors of old class names; dead rules `.employee-title` `:270-271`, `:407-408`, `.nav-dot` `:173`, `.timeline-title` `:279`, `.mark-action small` `:288`, `.page-title-row > .field` `:180`, `:378`; `.eyebrow` if approved), every `.tsx` that still writes an old class name (`button-outline`, `button-quiet`, `button-small`, `button-wide`, `button-danger-outline`: about 150 uses, a mechanical rename), `AdminViews.tsx` and `AdminViewsRender.tsx` (the re-export files, deleted; imports updated), `app/styles.test.tsx`.
- Tests: the four ceilings become equalities with zero; adds: no class used in a `.tsx` file lacks a rule, and no rule names a class that no `.tsx` file uses (the check that would have caught `mark-voided` and `.mark-action-primary`); no Unicode glyph of finding F-22 in a `.tsx` file.
- Size: 350, mostly deletions. Depends on: everything.

---

## 4. What needs the owner, in one list

| Item | Slices it holds | Without an answer |
|---|---|---|
| Open words of the glossary (design system 7.2): break marks for the ADMIN, states of a day, the employee's «Falta explicar», «Ver el día», «Cancelar el día» | W2, W3b | implemented as assumed there; one module to change later |
| Copy of new short strings: column heads, «sin marcar», «(opcional)», «Empresa», «Ir al contenido», hours and minutes | E1, D2, B3, C1, G1, W3a | implemented as written; listed in the PR |
| The day sheet, «Para explicar» above the marks, person first in a case (proposals of the directions report, taken as approved with the direction) | D2, D3, E1 | D2 and D3 keep today's order and list; E1 keeps the case name first |
| The note «Cargada por tu encargado» | D2 | no note; the time rule stands |
| Dropping the eyebrows and «Conexión protegida» | D4, N4, W3b | they stay, restyled |
| Whether the rail lists the parts of «Configuración» | N4 | listed |
| A bundled font; an accessibility test library; the avisos notice on «Para revisar» while off; the session warning; the company switch with a button | none | not done |

Not the owner's but Mateo's to arrange: the moment of M1 and M2 with Enrique; B3 against #66; N4 and G1 after #70.
