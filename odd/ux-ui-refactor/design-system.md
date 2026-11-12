# Fichaje Braja: design system ("Planilla" hybrid)

Task T8 of `odd/tasks/ux-ui-refactor.md` (specs S7, S9, S10, S15). Date: 2026-11-11. Branch `feat/ux-ui-refactor-114` at `d69f368`; line numbers are those of `dfcf9e8` (PR #116 merged; the commits after it only touch `docs/` and `odd/`).
Nothing in the repository was created or changed. This is a specification: values, selectors and file names are exact; no production code is included.

**How to read it**

- Paths are relative to `frontend/src/` unless they start with `frontend/`, `docs/` or `deploy/`. `path:line` is the line at `dfcf9e8`.
- Companion files in this folder: `tokens.css` (the token block), `contrast.mjs` and `contrast-output.md` (55 required pairings, 0 failing), `literals.mjs` and `literal-map.md` (how today's colour literals collapse), `slice-plan.md`, `guidelines-outline.md`.
- `specimen/` is a static **test page**, not production code: `specimen.css` applies `tokens.css` to the class names given here; `shots/` has it rendered at 320, 390, 768 and 1366 px; `measure.md` has overflow and target sizes. Where a value below differs from the prototype in `ux/directions/hibrido/`, it was looked at there first.
- UI copy is quoted in Spanish between « ». The visible vocabulary is the one adopted in **D-20261111-01** and the menu the one of **D-20261111-02** (`docs/DECISIONES.md`); the glossary is in section 7. A string marked **(copy)** is in neither the app nor that decision and needs copy review.
- "Phone layout" means under 1024 px (bottom bar); "wide layout" means 1024 px and up (rail).

---

## 1. Principles

1. **Flat and ruled.** Content sits on white and is separated by lines: a hairline (`--rule`) between rows, a 2 px ink rule under a section title. No shadow, no gradient, no translucency.
2. **A border belongs to something you can operate or that states something**: a control (button, field, option, fold, tag), the employee's "now" block, and the confirmation of a mark. Nothing else gets a box.
3. **A card is never used for records.** Records are rows of a list, and of a table from 768 px. The only two boxed blocks of content in the product are the "now" block and the mark confirmation.
4. **Fill is information.** Brand-green fill means "the next action": at most one filled button per region (a form, a row, a page header), none inside a list of records except the next step of «Primeros pasos», and none on a filter. Tinted fills are only for messages, tags, the selected option, the current place and the bands of the frame.
5. **Dark exists in one place: the top bar.** Lime exists in two: the brand mark and the focus ring on the top bar.
6. **A state is a shape, a word and a colour, in that order of importance.** An open form, a pending task and a case get a bar on their left edge; the bar repeats the tag, it never replaces it.
7. **Colour says whose turn it is.** Amber: it waits for the person looking at the screen. Dashed grey: it waits for someone else. Green: confirmed or decided in favour. Red: an error or decided against. The state of a day (in progress, on a break, finished) is neutral.
8. **One size of text to work with (16 px; 18 px for the employee), one family, two weights that carry meaning (400 and 700).** 14 px exists for four named roles only.
9. **Everything interactive is at least 44 px; touch layouts use 48 px; the clocking button is 80 px.**
10. **Nothing floats.** One fixed element on phones (the bottom bar), none on wide screens. Help, messages, forms and results open in the flow, next to what caused them.

How drift is caught: rules 1, 2, 5, 8 and 9 are assertions on `styles.css` (see `guidelines-outline.md`, Jerarquía and Componentes); rule 4 is a render test per screen; rules 3, 6, 7 and 10 are review items with a named check.

---

## 2. Tokens

Final values are in `tokens.css`; this section explains them and maps them to what exists.

### 2.1 Colour

| Token | Value | Role | Today |
|---|---|---|---|
| `--surface` | `#ffffff` | Page and every control | **kept** (same name and value, `styles.css:28`) |
| `--surface-tint` | `#f4f3ee` | Bands: rail, context strip, info notices, disabled fill, pointer-over of a secondary button | **new**; absorbs `--page` `#f4f7f5` (`:13`, dropped: the page is white) and 7 pale literals |
| `--surface-tint-strong` | `#eae9e2` | Pointer-over of a rail item, pressed secondary button | **new** |
| `--surface-selected` | `#e3efe5` | Fill of the selected option and of the current tab | **renamed** from `--green-3` `#e7f1e9` (`:24`) |
| `--text` | `#14201a` | All primary text | **renamed** from `--text-primary` `#18241f` (`:10`); absorbs 19 dark literals |
| `--text-muted` | `#47524b` | Hints, secondary lines, placeholders | **renamed** from `--text-secondary` `#53645a` (`:11`); `--muted` (`:26`) and `--text-tertiary` as text (`:12`) are **dropped** into it |
| `--rule` | `#d9dbd5` | Hairline between rows (decorative, 1.40:1) | **renamed** from `--line` `#e4e9e5` (`:27`); absorbs 9 literals |
| `--border` | `#6f7a73` | Edge of every control and tag, 4.46:1 | **new**; replaces `--text-tertiary` `#5c6d62` used as border (`:98`, `:284`) and 7 literals |
| `--brand` | `#12372a` | Next action, selected border, current marker, top bar, links | **renamed** from `--green` (`:22`) |
| `--brand-pressed` | `#0b261c` | Primary under the pointer or pressed | **new**; replaces literal `#1b4935` (`:124`) |
| `--on-brand` | `#ffffff` | Text on brand | **new** (was literal `#fff`, `:123`) |
| `--on-brand-muted` | `#c4d6cb` | Secondary text on the top bar | **new** |
| `--lime` | `#d8f078` | Brand mark; focus ring on the top bar | **kept** (`:25`) |
| `--focus-ring` | `#14201a` | Focus ring everywhere else | **renamed** from `--focus` `#1d513c` (`:14`); `--green-2` (`:23`) is **dropped** (its other uses become `--brand`) |
| `--ok` / `--ok-surface` | `#1c6638` / `#e9f3ea` | Confirmed by the server, «Justificado», «Listo» | **new**; absorb 4 literals |
| `--warn` / `--warn-surface` | `#7d5200` / `#fbf0d5` | Waiting for the reader: «A revisar» (ADMIN), «Falta explicar» (employee), «Falta» (setup); warnings | **new**; absorb 2 literals |
| `--bad` / `--bad-surface` | `#a0261b` / `#fbe9e6` | Errors, «No justificado», destructive buttons | `--bad` **renamed** from `--red` `#a33e35` (`:29`); absorb 9 literals |
| (none) | | `--shadow` (`:30`) is **dropped**: there is no elevation | |

Semantic sets for the real states of the product:

| State | Where it occurs | Foreground | Fill | Shape |
|---|---|---|---|---|
| Waiting for someone else | ADMIN sees `MOTIVO_PENDIENTE`; employee sees `PENDIENTE_REVISION`; inactive schedule or person | `--text-muted` | `--surface` | dashed `--border`; dotted state bar |
| Needs you | ADMIN sees `PENDIENTE_REVISION`; employee sees `MOTIVO_PENDIENTE`; a missing setup step; a warning | `--warn` | `--warn-surface` | solid border; solid bar |
| Justified / done / confirmed | `JUSTIFICADO`; a done step; the server accepted a mark; a save | `--ok` | `--ok-surface` | solid; check |
| Not justified / error | `NO_JUSTIFICADO`; any failure; an invalid field | `--bad` | `--bad-surface` | solid; cross (tag), circled cross (message), triangle (field) |
| Info | arrival notices, a step in progress | `--text` | `--surface-tint` | bar `--border`; circled i |
| State of a day | `NO_INGRESO`, `EN_CURSO`, `PAUSA_ABIERTA`, `EGRESADA`, `CANCELADA`; «Anulada»; «Activo» | `--text` | `--surface` | solid `--border`; one icon each (section 6) |
| Selected (option, pressed choice, case opened from a notification) | `aria-pressed="true"`, `:has(input:checked)` | text unchanged | `--surface-selected` | 2 px `--brand` edge plus the native radio or a check |
| Current place | `aria-current="page"` | `--brand` (bar), `--text` (rail) | `--surface-selected` (bar), `--surface` (rail) | 4 px `--brand` bar plus weight 700 |
| Pressed (transient) | `:active` | unchanged | `--brand-pressed` or `--surface-tint-strong` | none needed |
| Disabled | `:disabled` | `--text-muted` (7.34:1, no opacity) | `--surface-tint` | `--border`; always with a visible reason |

**Contrast.** `node contrast.mjs` reads `tokens.css` and checks 55 required pairings (text 4.5:1; borders, state indicators, icons and focus 3:1): **all pass**. Smallest margin: `--border` on `--bad-surface`, 3.80:1 for a 3:1 requirement (the border of a secondary button inside an error message). Six more pairings are reported without a requirement and each says why (the hairline, the selected fill against the unselected one, the band against the page, two transient states, and the focus ring against the primary fill, which is read against the 2 px gap). Full table: `contrast-output.md`. The formula and its threshold are those of `app/styles.test.tsx:10-18`, so the table ports into that test unchanged (slice A1). Not covered by any script: what the browser paints by itself (date and time pickers, the unchecked checkbox, select arrows, autofill), Leaflet's stylesheet and the map tiles: those are manual checks.

**How the literals collapse.** `node literals.mjs frontend/src/styles.css` finds 144 colour literals outside the token block, 100 distinct (hex, `rgba()` and the keyword `white`; the accessibility baseline counted 138 hex uses with a narrower pattern). 97 uses map onto 18 tokens and 47 disappear with their rule (cards that become ruled rows, 16 shadows, glyph boxes, dead rules). The per-literal table is `literal-map.md`. Summary: 20 uses → `--text`; 16 → `--surface`; 14 → `--rule`; 10 → `--surface-tint`; 7 → `--border`; 5 → `--brand`; 5 → `--bad`; 4 → `--surface-selected`; 4 → `--bad-surface`; the rest 1 or 2 each.

**Migration rule for names.** No token keeps its old name with a new value. Old and new names coexist until the last slice, so a half-migrated stylesheet is never ambiguous; the old ones (`--text-primary`, `--text-secondary`, `--text-tertiary`, `--page`, `--focus`, `--green`, `--green-2`, `--green-3`, `--muted`, `--line`, `--red`, `--shadow`, `--tap-target`, `--radius-control`, `--radius-panel`, `--topbar-height`, `--alerts-bar-clearance`) sit in a block marked "legacy" and a test counts their uses down to zero.

### 2.2 Type

| Token | Value | For | Not for |
|---|---|---|---|
| `--font-size-meta` | `.875rem` (14 px) | Tag text, bottom-bar labels, table column heads, timestamps of change lists | anything else: 14 px is the floor, and these four roles are the whole list |
| `--font-size-body` | `1rem` (16 px) | Text, labels, hints, buttons, fields, row details | |
| `--font-size-body-lg` | `1.125rem` (18 px) | Base size of the employee screen (`.employee-frame`); leads; the name in a row; 56 px buttons | |
| `--font-size-title` | `1.25rem` (20 px) | `h2`; times in the day sheet; the confirmation sentence | |
| `--font-size-display` | `1.5rem` (24 px); `2rem` (32 px) from 1024 px | `h1`; the state sentence of the day; the clocking button label | |

- Weights: `--font-weight-regular: 400`, `--font-weight-strong: 600` (labels, buttons), `--font-weight-heavy: 700` (headings, times, tags, current place). **No state is told apart by 600 against 700**: an Android whose Roboto has no 600 face draws it as 700 (not verified on a device; listed in section 9).
- Line heights: `--line-height-body: 1.5` on `body` (today none is set, `styles.css:37`); `--line-height-heading: 1.25`; `--line-height-tight: 1.2` for one-line controls and the display size. Controls use `min-height`, never `height`, so 1.4.12 text spacing does not clip them.
- `--measure: 65ch` caps running text (leads, hints, messages) on wide screens.
- Times, dates and DNI use `font-variant-numeric: tabular-nums` (`time`, `.num`).
- Sentence case everywhere; no `text-transform`, no letter-spacing (today: `styles.css:45`, `:49`, `:167`, `:211`, `:279`).
- Today's 23 distinct font sizes (`.75rem` to `clamp(1.7rem, 2.3vw, 2.18rem)`, 34 of them `.875rem`) and 6 weights (500 to 800) collapse into the 5 sizes and 3 weights above.

### 2.3 Space, shape, elevation, motion

| Group | Tokens | Notes |
|---|---|---|
| Space | `--space-1` to `--space-7`: 4, 8, 12, 16, 24, 32, 48 px | In px on purpose (today's practice): text grows with the user's font size, gaps do not |
| Gutter | `--gutter`: 16 px; 24 px from 600 px; 32 px from 1024 px | Page side padding |
| Radius | `--radius-tag: 4px`, `--radius: 8px` (every control), `--radius-block: 12px` ("now" block, mark confirmation) | Replace 10 radii in use (6, 8, 9, 10, 11, 12, 13, 14, 18, 22 px and two 99 px pills). `50%` stays for the spinner and the confirmation icon. `--radius-control` 9 px → `--radius`; `--radius-panel` 14 px dropped |
| Border | `--border-width: 1px`, `--border-width-strong: 2px` | A selected or invalid control gets 2 px without moving layout: 1 px border plus `box-shadow: inset 0 0 0 1px` of the same colour (the only use of `box-shadow`) |
| Bars | `--bar-width: 4px` (message, inline form, current place), `--state-bar-width: 6px` (case) | Always a real `border-left` or `border-top`, so they survive forced colours |
| Elevation | **none** | 16 `box-shadow`, 2 `backdrop-filter` and 1 gradient exist today; all go. Layers are made with lines and the tint |
| Motion | `--motion-fast: 120ms` on `background-color` and `border-color`; the spinner (`.9s linear infinite`) is the only animation | No `transform` on press (today `styles.css:122`). The global `prefers-reduced-motion` block (`styles.css:427-434`) is kept as it is; every wait has text next to the spinner, so nothing is lost when it stops |
| Layout | `--bottom-nav-height: 4.5rem`, `--rail-width: 15rem`, `--content-max: 68.75rem` | The employee column is `max-width: 40rem` |

### 2.4 Breakpoints

Today: `max-width` 1050, 760, 640, 520 and 400 px, the 760 and 520 blocks each split in two or three places, and 520 repeated in two hooks. **They change** to four, mobile first:

| Query | What changes |
|---|---|
| `max-width: 359px` | «Braja» of the brand hides; nothing else (the layout is fluid down to 320 px) |
| `min-width: 600px` | Forms may use two columns (`.form-grid`); option tiles two columns; the day sheet puts the note beside the time |
| `min-width: 768px` | Lists of records switch to their table form (the render switch, one hook) |
| `min-width: 1024px` | Rail instead of bottom bar; top bar in one row; `--target: 2.75rem`; `--gutter: 32px`; display size 32 px |

- Why 768 and 1024: with a 240 px rail and 32 px gutters the content is 720 px wide at 1024 px, the same as at 768 px with a bottom bar, so a table never gets less than 720 px. Today the employees table at 768 px is cut after four columns (`ux/baseline/shots/admin/empleados--lista--768.png`).
- The case list of «Para revisar» switches to columns by **its own width** (`@container (min-width: 56rem)` on `.case-list`), because its four columns need 896 px, which a 1024 px screen with a rail does not have. A browser without container queries (Safari 15 and older) keeps the stacked form, which is complete.
- One hook, `app/useBreakpoint.ts` (`useWideTable()` → `(min-width: 768px)`), replaces `features/admin/useNarrowScreen.ts` and `features/admin/useMediaQuery.ts` (both 520 px, `AdminViews.tsx:108`, `:622`, `:753`).
- A short viewport (`max-height: 480px`, a phone lying down) makes the bottom bar `position: static`.

### 2.5 Targets

Three separate figures, never merged into one rule:

| Figure | Token | Meaning |
|---|---|---|
| 24 px | `--target-floor: 1.5rem` | What WCAG 2.2 AA asks (2.5.8). In this system only the box of a checkbox or radio is this small, and it always sits inside a label of the working size |
| 44 px | `--target: 2.75rem` from 1024 px; `3rem` (48 px) under it | The product's working minimum for every control (44 px is the AAA value and the Apple default; 48 px is Android's) |
| 80 px | `--target-clock: 5rem` | The next mark. `--target-large: 3.5rem` (56 px) for the employee's other marks |

In rem, so targets grow with the user's text size. Measured on the specimen (`specimen/measure.md`): no target under 44 px on a side at any of the four widths. `--tap-target: 44px` (`styles.css:19`) is renamed `--target`.

---

## 3. Typography decision

**Recommendation: the system font stack. No bundled font.**

```
--font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Helvetica Neue', Arial, sans-serif;
--font-mono: ui-monospace, 'Cascadia Mono', 'Roboto Mono', Menlo, Consolas, monospace;
```

`--font-mono` is used in one place: the provisional password (`.issued-password-code`, `EmployeesViewRender.tsx:22`), where telling characters apart matters most. Today's stack (`styles.css:2`) names Segoe first and adds a second family for headings (`:44`): both go.

Why: the research found no typeface that is more legible for everyone, and that size, contrast and spacing matter more (research 4.3, `EVIDENCE` A); this system raises all three. A system font is what these users read all day, costs no download on weak connections and needs no dependency check.

What is lost: (1) identical rendering across devices: Roboto, San Francisco and Segoe have different widths, so every tight layout needs slack and a look on a real Android (the specimen was rendered with Segoe; allow about 8 % more width for Roboto); (2) a typographic identity of its own: the identity rests on the top bar, the ruled sheet and the large tabular times; (3) control over which weights exist (the 600 note in 2.2) and over the shape of 1/l/I and 0/O in DNI and times.

The alternative, **a proposal that needs the owner's dependency check**: bundle Atkinson Hyperlegible Next (Braille Institute, SIL OFL 1.1), one variable `woff2`, Latin subset, as a file in `frontend/public/` (not an npm package). `frontend/vite.config.ts:33` already precaches `woff2` and a same-origin file passes the CSP. It was not rendered or weighed here (no network use). It is one line in `--font-sans`, so it can be decided later without touching anything else.

---

## 4. Components

Each entry: purpose; anatomy; variants and sizes; states; accessibility contract; mapping to the code. "Restyles" keeps the class or component; "merges" names every piece that folds into it; "new" says why nothing existing can serve. Class names are final. **A class keeps its name when the component survives; it is renamed only when several merge.**

Common to all: `:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: 2px }` (on the top bar `outline-color: var(--lime)`); pointer-over styles only inside `@media (hover: hover)`; hover never carries information.

### 4.1 Button `.button`

- **Purpose.** Do something. **Anatomy:** optional icon (1.25em), label; `inline-flex`, gap 8 px, `min-height: var(--target)`, padding `4px 16px`, `--radius`, 1 px border, 16 px / 600, `line-height: 1.2`, text may wrap.
- **Variants.**

| Variant | Look | Use | Mapping |
|---|---|---|---|
| `.button-primary` | `--brand` fill and border, `--on-brand` label, 700 | The next action; one per region (principle 4) | restyles `.button-primary` (`styles.css:123-124`) |
| `.button-secondary` | `--surface`, 1 px `--border`, `--text` | Every other action that changes something | **merges** `.button-outline` (`:127-128`) and `.button-quiet` (`:125-126`), whose edge is 1.21:1 today |
| `.button-link` | no border, `--brand`, underlined, `min-height` and `min-width: var(--target)`, padding `0 4px` | Navigating or backing out: «Ver el día» **(copy)**, «Cancelar», «Volver», «Cerrar sesión», «Cargar días» in a notice, «Ir» of a done step | **new variant**: today these are `.button-quiet`, which reads as grey text |
| `.button-danger` | `--surface`, 1 px `--bad`, `--bad` label | «Anular», «Cancelar el día» **(copy)**, «Quitar ubicación» and their confirm step | renames `.button-danger-outline` (`:129-130`). «No justificado» and «Corregir a no justificado» stop using it: classifying is not destructive |
| `.button-large` | `min-height: var(--target-large)`, 18 px | The employee's other marks, with an icon | **merges** `.mark-action` (`:284-288`, `EmployeeViews.tsx:70`) |
| `.button-clock` | `min-height: var(--target-clock)`, display size, gap 12 px; always with `.button-primary` and `.button-block` | The next mark | **merges** `.employee-next-action` (`:306`) and the dead `.mark-action-primary` (`:290-294`) |
| `.button-block` | `display: flex; width: 100%` | Full-width buttons on the employee and auth screens | renames `.button-wide` (`:132`) |
| (removed) | | | `.button-small` (`:131`): the base already has its size; 74 uses lose the class |

- **States.** Hover: primary → `--brand-pressed`; secondary → `--surface-tint`. Pressed (`:active`): primary → `--brand-pressed`; secondary → `--surface-tint-strong`. Selected (`aria-pressed="true"`, toggle buttons only): `--surface-selected`, 2 px `--brand` edge, and a check icon before the label. Disabled: `--surface-tint`, `--border`, `--text-muted`, `cursor: not-allowed`, **no opacity** (today `.68`, `styles.css:40`), and a `.field-hint` next to it tied with `aria-describedby` that says why (the pattern of `EmployeesViewRender.tsx:53-54`, `:108-109`); a submit button is disabled only while its request runs or with that reason. Loading: the label becomes its gerund («Guardando…») and the form has `aria-busy`; the button does not change size. Error and success belong to the message next to the button (4.8), not to the button.
- **Accessibility.** Native `button` (or `a` when it navigates to an address). Name = the visible label, or starts with it (`aria-label="Ver el día de Lucía Pérez"`). Fires on `click`, never on pointer down. `type="button"` unless it submits.
- **Row of buttons** `.button-row`: `flex`, wrap, gap 12 px (today 9 px, `:133`); the primary first, the way out last as `.button-link`.

### 4.2 Decision pair `.button-pair`

- **Purpose.** Two opposite decisions of equal weight on one row: «Justificado» / «No justificado» (both words kept by D-20261111-01).
- **Anatomy.** `display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); gap: var(--space-3)`; two `.button-secondary`, each with its icon (check, cross). Side by side when the row is at least 332 px wide (viewports from about 384 px); stacked below that and whenever the user's text is larger.
- **States.** As secondary buttons; while one saves, both are disabled and the pressed one says «Guardando…».
- **Accessibility.** `role="group"` with `aria-label="Decidir el caso de {persona}"` **(copy)**.
- **Mapping.** **New**: replaces the layout of `.deviation-actions` (`styles.css:265`, `AdminViewsRender.tsx:113-119`), where the two sit 6 px apart. **Differs from the prototype** (halves fused with no gap): see section 9.

### 4.3 Field `FormField`, `.field`

- **Purpose.** One labelled control. **Anatomy and order:** label (`.field-label`, 16 px / 600) → hint (`.field-hint`, `--text-muted`) → control → error (`.field-error`: triangle icon, `--bad`, 600). Gap 4 px. The order changes from today's label → control → hint → error (`app/ui.tsx:89-91`), so a hint is read before typing and is not covered by the keyboard.
- **Controls.** `.field :is(input:not([type=checkbox], [type=radio]), select, textarea)`: `min-height: var(--target)`, padding `8px 12px`, 1 px `--border`, `--radius`, `--surface`, **16 px** (kept: under 16 px iOS zooms on focus). `textarea`: `min-height: 5.5rem`, vertical resize. Text, number, time, date, datetime-local and select use the same box; native pickers keep the browser's own parts. Scoping the selector removes the two patches of `styles.css:216` and `:322` (finding F-17).
- **States.** Focus: the common ring (2 px offset). Invalid: `.field-invalid` on the wrapper (`padding-left: 12px; border-left: 4px solid var(--bad)`), control with 2 px `--bad` edge, error text under it. Disabled: `--surface-tint`, `--text-muted`. Read-only values are text, not disabled fields. Placeholder: `::placeholder { color: var(--text-muted); opacity: 1 }` (8.15:1); an example goes in the hint, never only in the placeholder (today `AdminViewsRender.tsx:199`, `SiteMapPanel.tsx:27`, `ScheduleEditor.tsx:56`, `EmployeeViews.tsx:141`).
- **Required and optional.** Nothing marks a required field; the few optional ones say «(opcional)» **(copy)** in the label.
- **Accessibility.** As today and kept: `label for`, `aria-describedby` for hint and error, `aria-invalid` with the error (`app/ui.tsx:71-92`). The error is announced because the form's summary or message is the live region; a field error is not its own `alert`.
- **Mapping.** Restyles `FormField` and `.field*` (`styles.css:66-69`, `:97-102`); **merges** `.field-hint-error` (declared twice, `:69`, `:237`), `.employee-field-error` (`:324`) and `.site-location-message-error` (`:74`) into `.field-error`; `td input` and `.company-switch` leave the field selector.

### 4.4 Checkbox and radio `.check`

- **Anatomy.** `label.check`: native input (`width` and `height: var(--target-floor)`, `accent-color: var(--brand)`), text; `inline-flex`, gap 8 px, `min-height: var(--target)`. A group is a `fieldset` with a `legend` styled as a label, items in `.check-list` (`flex`, wrap, gap `4px 16px`).
- **States.** Native checked and focus (ring on the input); disabled as the browser draws it plus `--text-muted` text.
- **Mapping.** **Merges** `.check-grid label` and `.inline-checks label` (`styles.css:205-208`), `.site-location-confirmation` (`:77-78`, an 18 px box in a label with no height) and the bare «Activo» of the employees table (`EmployeesViewRender.tsx:65`).

### 4.5 Option tile `.choice`

- **Purpose.** Pick one of a few options that need a line of explanation.
- **Anatomy.** Bordered control, `min-height: var(--target-large)`, padding `8px 12px`, gap 12 px: native radio (24 px) or, for a toggle button, no input; title (`strong`, `--text`) and a help line (`--text-muted`). In `.choice-list`: one column, two from 600 px.
- **States.** Selected: `:has(input:checked)` or `[aria-pressed="true"]` → 2 px `--brand` edge and `--surface-selected` (the native radio, or a check icon on a toggle button, is the non-colour cue). Focus: the ring on the tile (`:has(input:focus-visible)`). Disabled: as a disabled button.
- **Accessibility.** Radios in a `fieldset` with `legend`, arrow keys as native; toggle buttons in `role="group"` with a name and `aria-pressed`.
- **Mapping.** **Merges** `.employee-category-option` (`styles.css:320-323`, `EmployeeViews.tsx:134`), `.journey-option` and `.journey-option-active` (`:298-301`; the employee's shift picker `EmployeeViews.tsx:37` and the schedule types `ScheduleEditor.tsx:50`), and the pressed quick choices `.choice-row .button[aria-pressed="true"]` (`:452`, `WorkDaysForm.tsx:46`, `:51`), which stay ordinary toggle buttons with the selected state of 4.1. Fixes F-01 (selected border 2.27:1, fill 1.08:1 today).

### 4.6 Password with show toggle

- **Anatomy.** A field, and under it a `.button-link` «Mostrar contraseña» with `aria-pressed` and a constant name. The counter «Llevás 5 de 12.» is the field's hint.
- **Mapping.** Restyles `PasswordToggle` (`features/auth/AuthScreens.tsx:9-11`, `.password-toggle` `styles.css:326`). Behaviour, `autocomplete` and paste are untouched (good patterns 15 and 16 of the baseline).

### 4.7 Form layout, field group, error summary

- `.form-stack`: one column, gap 16 px (kept, `styles.css:64`). `.form-grid`: one column; two from 600 px; `.field-wide` spans both (kept, `:65`, `:104`). On the employee and auth screens forms are always one column.
- **Field group** `.field-group`: a `fieldset` with `legend` (16 px / 700) for fields that belong together («Tramo 1», «¿Dónde queda el local?»); no box; groups are separated by a hairline. **Merges** `.block-editor` (`:224-225`), `.fieldset-plain` (`:443`), `fieldset.field` (`:105`), `.site-location-field` (`:70`).
- **Inline form** `.inline-form`: a form that opens in place, under the row or button that opened it: `display: grid; gap: 16px; padding-left: 16px; border-left: 4px solid var(--border)`; `.inline-form-todo` uses `--warn` for a pending task (the employee's motive). Focus moves to its first field on open and back to the trigger on close. **Merges** `.correction-form` (`:266`), `.forgotten-mark-form` (`:267`), `.motive-card` (`:295-296`), `.template-card-slot` (`:235-236`), `.employee-detail .panel` (`:239-240`).
- **Where errors go.** Next to the field (4.3). The result of a submit, failure or success, is a message **inside the form, directly above its button row** (finding F-02), never at the top of the page.
- **Summary, only where warranted:** a form with three or more fields that can fail together and taller than a phone screen (schedule editor, load days, add employee, add local). It is one `.message-error` above the button row with the existing sentence «Revisá lo que está marcado debajo de cada campo.» (`ScheduleEditor.tsx:88`), `role="alert"`, and focus moves to the first invalid field. Short forms need no summary.
- **Validation** runs on submit; one system (`noValidate` plus field errors) for every form. Live feedback only where it helps before submitting (the password counter).

### 4.8 Message `PageMessage`, `.message`

- **Purpose.** Tell what happened, whether it was saved and what to do. Persistent: it stays until the next action; nothing disappears on a timer.
- **Anatomy.** `display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px; border-left: 4px solid; background`: icon, body (`flex: 1 1 12rem`), optional action (a `.button-link` or `.button-secondary` that wraps under the text as a whole). Text is always `--text`.

| Kind | Bar and icon | Fill | Icon | Role |
|---|---|---|---|---|
| `info` | `--border` | `--surface-tint` | `info` | `status` |
| `success` | `--ok` | `--ok-surface` | `check` | `status` |
| `warning` (**new kind**) | `--warn` | `--warn-surface` | `alert` | `status` |
| `error` | `--bad` | `--bad-surface` | `error` | `alert` |

- **Placement.** Inline: inside the form or the row that caused it. Page level: only for a failed load (with «Reintentar») and for notices shown on arrival (days loaded, which stay a polite `status` even when they are an error: `features/admin/FirstSteps.tsx:31-40`).
- **Accessibility.** Kept from `app/ui.tsx:4-14`: errors are `alert`; other kinds mount their `status` region empty and write the text right after. The icon is `aria-hidden`; the words carry the kind.
- **Mapping.** Restyles `PageMessage` and `.message*` (`styles.css:137-142`) and adds `kind="warning"` (today a missing location is shown green: `EmployeeViews.tsx:49-52`). **Merges** `.site-location-message` (`:73`), `.site-location-selection` (`:76`), `.work-days-preview` (`:453-455`), `.coverage-notice` (`:461`), `.company-switch-status` and `-error` (`:161-162`) and the text-only statuses «Enviando tu marca…» (`EmployeeViews.tsx:73`), «Entrando…» (`AuthScreens.tsx:31`), which become `info` messages with a spinner in place of the icon.

### 4.9 Mark confirmation `.receipt`

- **Purpose.** The persistent result of a mark. It appears only after the server accepted it and holds the server's time.
- **Anatomy.** A boxed block: 2 px `--ok` border, `--radius-block`, `--ok-surface`, padding 16 px; a 36 px round `--ok` icon with a white check; the sentence in title size / 700 with the time in tabular figures («Listo: tu entrada quedó registrada a las 07:56.»); then one location line:

| Location | Line |
|---|---|
| pending | spinner + «Enviando ubicación… no cierres la app.» |
| sent | `pin` icon + «Ubicación enviada», `--ok`, 600 |
| missing | a hairline of `--ok`, then `alert` icon in `--warn` + the existing sentence in `--text`. The block stays green: the mark was saved; only this line is a warning |

- **States of the same slot** (it sits above the "now" block and receives focus after a mark, as today): sending → an `info` message with spinner («Enviando tu marca… esperá un momento.») while the buttons are disabled; not registered or unknown → an `error` message with «Actualizar»; registered → the receipt. The three never look alike.
- **Accessibility.** The container keeps `tabIndex={-1}` and the focus move (`EmployeeViews.tsx:46`); the receipt is `role="status"`.
- **Mapping.** **New** class on the existing `MarkFeedback` (`EmployeeViews.tsx:42-54`); replaces `.employee-confirmation`, `.employee-location-note` (`styles.css:315-316`) and the two «✔» glyphs (`:50-51`).

### 4.10 Status tag `StatusTag`, `.status-chip`

- **Purpose.** Say the state of a thing in a word. Never a button: no hover, no pointer cursor, 4 px corners (controls have 8 px).
- **Anatomy.** Icon (1.15em) + word; `inline-flex`, gap 4 px, padding `2px 8px`, 1 px border, `--radius-tag`, 14 px / 700, `white-space: nowrap`.
- **Tones** (the class says the tone, not the API value): `.status-neutral` (`--text` on `--surface`, `--border`), `.status-wait` (dashed `--border`, `--text-muted`), `.status-todo` (`--warn` on `--warn-surface`), `.status-ok`, `.status-bad`.

| Value | Word | Tone for ADMIN | Tone for the employee | Icon |
|---|---|---|---|---|
| `MOTIVO_PENDIENTE` | «Todavía no explicó» (ADMIN) / «Falta explicar» (employee) | wait | todo | `bubble` |
| `PENDIENTE_REVISION` | «A revisar» | todo | wait | `eye` |
| `JUSTIFICADO` | «Justificado» | ok | ok | `check` |
| `NO_JUSTIFICADO` | «No justificado» | bad | bad | `x` |
| `NO_INGRESO` | «Sin ingreso» (open, see 7.2) | neutral | neutral | `waiting` |
| `EN_CURSO` | «En curso» | neutral | neutral | `clock` |
| `PAUSA_ABIERTA` | «En pausa» | neutral | neutral | `pause` |
| `EGRESADA` | «Finalizada» | neutral | neutral | `check` |
| `CANCELADA`, a voided mark | «Cancelada», «Anulada» | neutral | neutral | `ban` |
| setup step | «Listo» / «Falta» / «Revisalo» | ok / todo / todo | | `check` / `alert` / `eye` |
| person, schedule | «Activo» / «Inactivo» | neutral / wait | | `check` / `ban` |

- **Accessibility.** Plain text; the icon is `aria-hidden`. In forced colours the border remains.
- **Mapping.** Restyles `.status-chip` (`styles.css:245`) and **merges** the ten classes built from API values, `.status-motivo_pendiente` to `.status-inactivo` (`:246-254`, built at `AdminViewsRender.tsx:108`, `:332`, `:335`, `:453`, `:455`, `EmployeeViews.tsx:79`, `:159`), into five tones behind one component in `app/ui.tsx`: `<StatusTag tone icon>{word}</StatusTag>`. Two maps (deviation status per role, day state) live with the labels. The chip used as a timestamp (`EmployeeViews.tsx:129`) becomes plain text; setup steps stop borrowing deviation classes (`FirstSteps.tsx:24`).

### 4.11 Case row `.case` in `.case-list`

- **Purpose.** One deviation to decide, scannable in a list.
- **Anatomy, stacked (default).** `li.case`: left state bar (6 px), padding `16px 0 16px 12px`, hairline below. In order: tag; person (18 px / 700); the name of the case and when («**Llegada tarde** · 10 nov 2026, 08:18»); «Marca: Entrada» in `--text-muted`; the motive with a 3 px hairline on its left («**Motivo:** Transporte · …», `overflow-wrap: anywhere`); actions (the pair, or one «Corregir a …» secondary button); «Ver el día» **(copy)** as a link button at the top right of the row. An open correction is an `.inline-form` inside the row; its result is a message inside the row.
- **Columns** (`@container (min-width: 56rem)`): `11rem | 1fr | 1.2fr | 21.5rem` = state, case, motive, actions (11 rem holds the longest tag, «Todavía no explicó»), under a line of column heads «Estado», «Caso», «Motivo», «Acciones» **(copy)** that is `aria-hidden` (the list stays a list; each row is complete without the heads). An empty motive shows «—» with hidden text.
- **Variants = states.** `.case-wait` (dotted `--border` bar), `.case-todo` (`--warn`), `.case-ok` (`--ok`), `.case-bad` (`--bad`). Busy: the row's buttons disabled, the pressed one «Guardando…». Selected (opened from a notification): `--surface-selected` fill, focus moved to the row (`tabIndex={-1}`). Error: a `.message-error` inside the row.
- **Accessibility.** `ul > li`; the person's name is the row's label (`aria-labelledby`); the group label of 4.2 carries the person for the two decision buttons.
- **Mapping.** **Merges** `.deviation-card`, `.deviation-target`, `.deviation-symbol`, `.deviation-main`, `.deviation-title`, `.deviation-actions`, `.reason-line`, `.load-more` (`styles.css:256-266`; `AdminViewsRender.tsx:99-126`). Person first is a proposal of the direction (section 9).

### 4.12 Record list `.record-list` and its table form `.record-table`

- **Purpose.** Every homogeneous list of records: the days of a date, the marks of a day, the team, locals, schedules, the results of the search of earlier days, change lists, companies to choose.
- **List form (under 768 px, and always for lists that never become tables).** `ul.record-list > li.record`: `display: grid; gap: 4px; padding: 12px 0; border-bottom: 1px solid var(--rule)`. Lines: `.record-title` (the identifier in 700, then its tag), `.record-meta` lines in `--text-muted` with the label written out («DNI 31000001», «Locales: Sede Centro»), `.record-actions` (link buttons, wrapping, gap `0 16px`). No border around the row, no avatar.
- **Table form (from 768 px, by `useWideTable()`).** A real `table.record-table` inside `.table-scroll` (`role="region"`, `tabindex="0"` and a name when it can scroll): column heads 14 px / 700 `--text-muted`, sentence case, 1 px `--border` under them; cells `8px 12px 8px 0`, hairline below; the first column is the identifier in 700; the last column holds link buttons, which may wrap. Same field order as the list form. An edit opens as an `.inline-form` in a full-width row under the record, in both forms, instead of turning cells into inputs.
- **States.** Loading and empty replace the list (4.15); a voided mark is a struck row with the tag «Anulada» (today struck only, classes `mark-voided` and `mark-row-voided` have no rule).
- **Accessibility.** List: each `li` named by its identifier. Table: `th scope="col"`, the table named by its section title (`aria-labelledby`).
- **Mapping.** **Merges** five families: `.history-list`, `.history-card`, `.history-head`, `.history-items` (`styles.css:191-196`; days, history results, people, marks, change lists), `.simple-list`, `.simple-row`, `.row-avatar` (`:198-204`; locals, steps, assignments), `.template-list`, `.template-card*` (`:218-221`, `:234-236`), the employee's `.deviation-list` and `.deviation-card` (`EmployeeViews.tsx:156-158`), and `.company-list`, `.company-choice*` (`:144-150`, where each row is one full-width link with a chevron). Restyles `table`, `th`, `td` (`:210-217`).

### 4.13 The employee's "now" block `.now`

- **Purpose.** One place that says how the day is and holds the next mark.
- **Anatomy.** A boxed block: 2 px `--brand` border, `--radius-block`, padding `16px 12px`, `display: grid; gap: 12px`. In order: `.now-state`, the sentence of the day in display size / 700 («Estás trabajando desde las 07:56.»); `.now-actions`: the next mark (`.button-clock`), the other allowed marks (`.button-large`, secondary, each with its icon), and, after a hairline (`.now-apart`), the exit unless it is the next mark; `.now-context`: `clock` icon, «Tu horario: 08:00 a 16:00» in 18 px / 700, then «{local} · Tenés {n} minutos de tolerancia para entrar.» in 16 px `--text-muted`.
- **States.** No mark allowed (day finished or cancelled, or no shift): the sentence and the schedule line, no buttons. Sending: every button disabled plus the `info` message of 4.9 above the block. Step question (early exit, location notice): the buttons are replaced, inside the block, by the question in 18 px and two buttons, the answer that goes on as primary and the way back as link («Sí, marcar salida» / «No, seguir trabajando»); focus moves to the question, and back to the mark button when it closes. Another day shown: the sentence names the date.
- **Accessibility.** `section` named «Marcar» (the current panel title, kept as the accessible name); `aria-busy` while sending; the greeting stays the page's `h1` («Hola, {nombre}») drawn at 18 px / 400 `--text-muted`, so the sentence is the largest text.
- **Mapping.** **New**: no existing piece joins state, action and schedule. Replaces the panel «Marcar» and its layout (`MarkPanel`, `EmployeeViews.tsx:56-76`; `.mark-actions`, `.employee-more-actions`, `.employee-exit`, `.employee-sending`, `.employee-step-text`, `styles.css:283`, `:307-314`), `.employee-day-state` (`:305`) and the schedule summary that today sits in the marks panel (`EmployeeViews.tsx:80-82`; `.schedule-summary`, `.schedule-icon`, `.schedule-block`, `:272-277`). `markOptions`, `exitConfirmation` and `daySentence` (`employeeDay.ts:96`, `:108`, `:115`) are used as they are.

### 4.14 Day sheet `.day-sheet`

- **Purpose.** Show what a day consists of before the first mark, and what was marked.
- **Anatomy.** A `table` with a hidden caption «Marcas del día» **(copy)** and **four fixed rows**: `th scope="row"` «Entrada», «Desayuno», «Almuerzo», «Salida» (32 % wide, 600); one cell with `.day-sheet-time` (title size / 700, tabular) and `.day-sheet-note` (16 px `--text-muted`, with `pin` or `pinoff` icon), the note under the time and beside it from 600 px. Hairlines above each row and under the last.
- **What each row shows.** Only marks that count (not voided), in sequence order. The time is `markInstant(mark)` (`employeeDay.ts:66`: the declared time of a mark the ADMIN loaded or corrected, else the server's).

| Row | Marks | Time cell |
|---|---|---|
| Entrada | `INGRESO` | `07:56` |
| Desayuno | `SALIDA_DESAYUNO`, `VUELTA_DESAYUNO` | `09:30` while out; `09:30 a 09:48` once back |
| Almuerzo | `SALIDA_ALMUERZO`, `VUELTA_ALMUERZO` | same |
| Salida | `EGRESO` | `16:05` |
| any row with no mark | | «—» (`aria-hidden`) plus hidden text «sin marcar» **(copy)** |

- **Note of a row.** One line, from the marks of the row: any `PENDIENTE` → «Enviando ubicación…»; else any `SIN_UBICACION` → «Sin ubicación»; else all `RECIBIDA` → «Ubicación enviada»; else nothing (the words of `markLocationLabel`, `employeeDay.ts:145`). It is deliberately one line per row: which of two marks lacks a location is in the ADMIN's detail, and the employee cannot act on it.
- **Rule for marks the ADMIN loaded or corrected** (left open by the directions report): a mark with `recordedAt` set shows its declared time and the note «Cargada por tu encargado» **(copy)** instead of a location line (those marks have no location). If the two marks of a break differ, the note of the ADMIN's one wins.
- **Rule for voided marks** (left open by the directions report): a voided mark never fills a row. It is listed as an extra row directly under the row of its kind: empty header cell (the row name repeated as hidden text), its time struck through in 16 px `--text-muted`, and the tag «Anulada». So a day with a voided entry and a valid one shows both, and a day whose only entry was voided shows «—» and the struck line.
- **States.** A cancelled day keeps the four rows empty under the sentence «Tu encargado canceló este día…» (existing). The section's tag is the state of the day (4.10).
- **Mapping.** **New**: replaces the timeline (`DayMarksPanel`, `EmployeeViews.tsx:78-92`; `.mark-timeline`, `.mark-row`, `.timeline-point`, `.mark-row-location`, `.timeline-title`, `styles.css:278-282`, `:317`). The grouping is a pure function `daySlots(jornada)` in `features/employee/employeeDay.ts` with its tests. The app allows at most one entry, one of each break and one exit per day (`allowedActions`, `employeeDay.ts:75`), so four rows are accurate; an ADMIN can add a mark of a kind that already exists, in which case the row lists both times on two lines.

### 4.15 Panel, disclosure, empty, loading

- **Panel** `Panel`, `.panel`: a `section` named by its `h2` (kept, `app/ui.tsx:20-23`). `margin-top: 32px`; `.panel-heading` is the title (20 px / 700), an optional tag or button on the right, `padding-bottom: 8px; border-bottom: 2px solid var(--text)`. No border, radius, fill or shadow (today `styles.css:181`).
- **Disclosure** `.fold` (`details` / `summary`): a control, so it is bordered (1 px `--border`, `--radius`); `summary` is `min-height: var(--target)`, 600, with an optional icon and a chevron drawn in CSS at the right (two borders rotated; no glyph, so the alternative-text syntax of `styles.css:449-450` is no longer needed); the body has `padding: 0 12px 12px`. A heading is never placed inside `summary` (finding F-30; today `AdminViewsRender.tsx:314`): the summary text is the name. **Merges** `.site-location-manual` (`:82-83`), `.filter-fold` (`:466-467`) and `.fold` (`:447-451`).
- **Empty** `Empty`, `.empty-state`: one or two sentences in `--text-muted`, left aligned, no box (today a dashed box, `:184`), optionally followed by the button that fills it. Four cases, four wordings: loading; nothing yet (say what will appear and offer the action); the filter matches nothing (offer «Limpiar»); failed to load (an `error` message with «Reintentar»: `LoadFailure`, `AdminViewsRender.tsx:462`, moved to `app/ui.tsx`).
- **Loading** `Loading`, `.loading`: spinner (20 px, 3 px `--rule` ring with a `--brand` arc, `aria-hidden`) + text, left aligned, `role="status"` (kept, `app/ui.tsx:16-18`). The whole-app boot screen centres it.

### 4.16 Page header `PageHeading`, `.page-title-row`

- **Anatomy.** `h1` (display size) and a lead (`--text-muted`, `--measure`); an optional action on the right that wraps under the title on phones. The title is the same word as the navigation item. Under it, messages of the page level, then the content.
- **Mapping.** Restyles `PageHeading` (`AdminViewsRender.tsx:467-469`), moved to `app/ui.tsx` with an `action` prop so the two hand-written copies use it (`AdminViewsRender.tsx:82`, `FirstSteps.tsx:17`). The `eyebrow` prop and `.eyebrow` (`styles.css:49`; six strings in capitals) are **removed**: a proposal of the direction that deletes visible text, so it waits for the owner's yes (section 9).

### 4.17 Top bar `AppHeader`, `.topbar`

- **Anatomy.** A grid with three named areas. `brand`: the mark (the clock of `frontend/public/icon.svg` as an inline SVG in `--lime`, 34 px) and «Fichaje Braja» (700; «Braja» in 400 `--on-brand-muted`, hidden under 360 px); `out`: «Cerrar sesión» as a link button in `--on-brand`, alone at the right edge; `context`: company and person («Braja · Lucía Pérez», wrapping, never cut), the company switcher when the account has two or more companies (a select with the visible label «Empresa» **(copy)**), and the install control.
- **Layouts.** Phone: `"brand out" / "context context"`: a dark row (`min-height: 3.5rem`) and under it the context as a tint strip (`--surface-tint`, `--text-muted`, hairline below). Wide: one dark row `"brand context out"`, the context right-aligned in `--on-brand-muted`. `position: static` at every width: it scrolls away.
- **States.** Company switch busy or failed: an `info` or `error` message in the flow under the strip (today two floating bubbles). Focus: lime ring.
- **Accessibility.** `header` (banner). The brand is a link only where it leads somewhere (ADMIN: `#/para-revisar`); elsewhere it is text, with a real space between the words (finding F-28). First element of the page: a skip link «Ir al contenido» **(copy)**, visible on focus, to `main#contenido`.
- **Mapping.** Restyles `AppHeader` (`app/ui.tsx:29-37`) and `CompanySwitcher` (`:39-69`); **merges** the four copies of the brand lockup (`app/ui.tsx:33`, `features/auth/AuthScreens.tsx:28`, `:50`, `:84`) into one `Brand` component, and `.company-pill` and `.user-label` (`styles.css:157-158`) into the context. The auth screens use the same bar with the brand only. `--topbar-height` and the three `scroll-padding-top` rules (`styles.css:35`, `:375`, `:403`) go with the sticky bar.

### 4.18 Navigation, alerts control, update banner, install help

Navigation is section 5. The other three stop floating:

- **Avisos on this device** `.setting-row`: title «Avisos en este dispositivo» (700; today «Alertas en este dispositivo»), the status sentence that exists today with «avisos» as its only word (`device/push/AdminPushControl.tsx:147-151`, `:161`), and one button («Activar avisos» as secondary, «Desactivar» as link, «Reintentar consulta» as secondary). Its messages are ordinary messages under the row. It lives on the «Configuración» page (5.3). Restyles `AdminPushControl`, split into a hook and a render component (rule 36 does not hold there today); the fixed bar `.push-control` and its copy variants `.push-title`, `.push-detail`, `.push-status-short` (`styles.css:342-349`, `:360-361`, `:413`) are **removed** with `--alerts-bar-clearance`.
- **Update banner** `.update-banner`: an `info` message as the first thing in the page, above the top bar, full width, with «Actualizar» as a secondary button; `role="status"`. In the flow, so it is first in the source and first on screen (today it is fixed at the bottom over the alerts bar and first in the tab order: `device/pwa/ServiceWorkerUpdate.tsx:22-28`, `styles.css:444`).
- **Install help**: «Instalar app» or «Cómo instalar» is a link button in the context area with `aria-expanded`; the help opens as an `info` message in the flow under the top bar, full width, and closes with the same button or Escape. Restyles `device/pwa/InstallControl.tsx:24-31`; `.install-help` as a 260 px popover (`styles.css:164`, `:332`) is removed.

### 4.19 Step list of «Primeros pasos» `.step`

A part of «Configuración», listed there only while a step is missing (D-20261111-02).

- **Anatomy.** `ol > li.step`: a 40 px numbered box (2 px `--text` border, `--radius`, 700); the title («2. Tus horarios», 700), the explanation (`--text-muted`) and the detail of what is missing (`--warn`, 600); at the foot (beside the text from 600 px) the tag and the button «Ir».
- **Variants.** Done (`.step-done`): the box holds a check in `--ok`, **the explanation folds away**, one line remains: title, tag «Listo», «Ir» as a link. Next (`.step-next`, the first missing one): a 4 px `--warn` bar on the left, tag «Falta», «Ir» as **the** primary button of the page. Other missing steps: tag «Falta», «Ir» as secondary. Unknown: tag «Revisalo».
- **States.** Loading and error as today (`FirstSteps.tsx:18-20`). All done: the existing success message above the list.
- **Accessibility.** Kept: the list is named, «Ir» is «Ir a Locales: Tu local».
- **Mapping.** Restyles `FirstStepsRender` (`features/admin/FirstSteps.tsx:10-29`; `.first-steps`, `.first-step*`, `styles.css:457-460`). No progress meter: the section title already says «2 de 5 pasos listos».

### 4.20 Map picker frame

- **Anatomy.** A field group in the flow: search field with «Buscar» (secondary); results as a `record-list` of full-width secondary buttons; the map `.site-map-canvas` (1 px `--border`, `--radius`, height `clamp(12.5rem, 45dvh, 22.5rem)`, from 768 px `clamp(16rem, 50dvh, 27.5rem)`); the hint under it; «Confirmar ubicación» (primary while the map is open) and «Cerrar mapa» (link). One sentence says the alternatives («Si no podés tocar el mapa, buscá la dirección y elegí un resultado» **(copy)**).
- **States.** Loading the map, searching, no results, search error: messages in the flow. Point chosen: the existing hint sentence; the chosen coordinates are text.
- **Accessibility.** Kept: 44 px zoom buttons (`styles.css:90`), the focus ring on the map (`:91`), search results and typed coordinates as non-pointer and non-drag alternatives. `role="application"` on the map (`features/admin/SiteMapPicker.tsx:56`) is to be re-tested with a screen reader, not changed blind.
- **Mapping.** Restyles `SiteMapPanel` (`features/admin/SiteMapPanel.tsx:23-48`) and `.site-map-*` (`styles.css:84-96`): the tinted box goes, the height no longer depends on `--topbar-height`. The point and circle colours are literals in TypeScript (`SiteMapPicker.tsx:51-53`); they stay, since a map layer cannot read a CSS token, and are listed as the one colour outside the token block.

---

## 5. Navigation

Decided: **D-20261111-02** (`docs/DECISIONES.md`). The ADMIN menu is four destinations by task, with no screen added and no function removed; four fixed bottom tabs with icon and name on phones, the same list in the left column on a computer; the alerts control leaves the fixed bar for «Configuración». It is done in two steps: first an address per section and the day list with its detail in place, then the regrouping.

### 5.1 The destinations

| Destination | Icon | Address | Holds (all of it exists today) | Today |
|---|---|---|---|---|
| «Para revisar» | `inbox` | `#/para-revisar` | The cases, undecided first; filters; deciding and correcting a decision | Bandeja (`AdminInbox`) |
| «Hoy» | `today` | `#/hoy` | The list of the day with its detail in place (correct, void, add a mark, cancel the day, changes); the search of earlier days by person, local and range | the day list and detail of Jornadas (`JourneysView`) plus Historial (`AdminHistory`) |
| «Días de trabajo» | `month` | `#/dias-de-trabajo` | The monthly load, the single day, and until when days are loaded | «Cargar días de trabajo», the single-day fold and the coverage notice of Jornadas |
| «Configuración» | `config` | `#/configuracion` | Its parts, below | Sedes, Horarios, Empleados, the alerts bar, Primeros pasos |

Parts of «Configuración», in this order: «Primeros pasos» (`steps`, `#/configuracion/primeros-pasos`, **listed only while a step is missing**), «Locales» (`store`, `#/configuracion/locales`), «Horarios» (`schedule`, `#/configuracion/horarios`), «Equipo» (`people`, `#/configuracion/equipo`), «Avisos en este dispositivo» (`bell`, the control itself, on the «Configuración» page).

The order of the four never changes and none is ever hidden or disabled. While a setup step is missing the app still opens on «Primeros pasos» (`AdminApp.tsx:45`), with «Configuración» as the current destination.

### 5.2 Component

One component, `features/admin/AdminNav.tsx` (**new**: `AdminApp.tsx:78-96` builds the menu inline and no existing piece can be a bottom bar). It renders **one** `nav aria-label="Navegación principal"` with one list of four links; the parts of «Configuración» are a nested list inside its item. CSS turns the same markup into a bar or a rail. It receives the items, the current address and nothing else (rule 36); `AdminApp` owns the state.

| | Bottom bar (under 1024 px) | Rail (from 1024 px) |
|---|---|---|
| Position | `position: fixed; bottom: 0`, full width, 1 px `--border` on top, `--surface`, `padding-bottom: env(safe-area-inset-bottom)` | `position: static`, first column of the frame (`--rail-width`), `--surface-tint`, hairline on the right |
| Shows | the four destinations; the nested list is `display: none` | the four destinations and, under «Configuración», its parts indented by 2 rem |
| Item | column: icon 24 px over the name, 14 px / 600, up to two lines («Para / revisar», «Días de / trabajo»), `min-height: var(--bottom-nav-height)` | row: icon 20 px and name 16 px, `min-height: var(--target)` |
| Widths | `.nav-list { display: flex }`, each item `flex: 1 1 0; min-width: min-content`: equal shares, but an item never gets less than its longest word, so «Configuración» is whole at 320 px (measured on the specimen; with equal columns it was clipped) | full width of the rail |
| Current | `aria-current="page"` on the link of the place shown; `aria-current="true"` on «Configuración» while one of its parts is shown. Bar: 4 px `--brand` bar on top, `--surface-selected`, `--brand`, 700 | 4 px `--brand` bar on the left and `--surface` on the `page` item; 700 only on the `true` item |
| Other states | pressed: `--surface-tint` | hover: `--surface-tint-strong`; focus: the ring |
| Room for it | `.main-content { padding-bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom) + 24px) }` and `html:has(.nav) { scroll-padding-bottom: calc(var(--bottom-nav-height) + env(safe-area-inset-bottom)) }` (WCAG 2.4.11); `position: static` when `max-height: 480px` | none needed |

- Items are links (`a href="#/…"`), not buttons as today (`AdminApp.tsx:80`).
- **The «Configuración» page** (`#/configuracion`) is ordinary content in `main`: `h1` «Configuración»; a `record-list` of links to its parts, each with icon, name (18 px / 700), one line that says what it is for and a chevron, `min-height: 4rem`; then the alerts control as a `.setting-row` (4.18). On a phone it is the only way to the parts; on a computer the rail also lists them, and the page is the same.
- Showing the parts on the rail is this document's reading of "the same list in the left column": the four are the same and in the same order, and the second level is visible because a computer has the room (visible navigation was used far more than hidden on desktop: research 2.5, `EVIDENCE` A). If the owner wants the four only, it is one rule (`.nav-sub { display: none }` at every width).
- The employee has one screen and no navigation.

### 5.3 The alerts control

It lives on the «Configuración» page at every width: same feature, same sentences, with «avisos» as the only word (D-20261111-01): title «Avisos en este dispositivo». The fixed bar, its three copy variants and `--alerts-bar-clearance` are removed.

A setting that moves out of sight may never be found by an owner who has it off. **Proposal, not adopted** (the second half of the audit's O-11): while the avisos are off, blocked or failed on this device, show one `info` message at the top of «Para revisar» with the short status and the button. The plan does not include it.

### 5.4 Addresses

Step 1 of the decision. Without a routing library: one hook, `features/admin/useAdminSection.ts` (about 60 lines), reads `location.hash`, listens to `hashchange`, maps the address to the section and navigates by setting the hash. `AdminApp` reads the section from it instead of `useState` (`AdminApp.tsx:27`); with no hash the start section is decided as today, so a first visit does not change. A hash never reaches the server: `sw.ts`, the Caddyfile and the API are untouched, and nothing is stored (rule 27).

| Step | Addresses |
|---|---|
| 1 (seven sections still) | `#/para-revisar` (Bandeja), `#/hoy` (Jornadas, whole), `#/historial`, `#/configuracion/locales`, `#/configuracion/horarios`, `#/configuracion/equipo`, `#/configuracion/primeros-pasos` |
| 2 (regrouping) | adds `#/dias-de-trabajo` and `#/configuracion`; `#/historial` now shows «Hoy» |

The final addresses are used from step 1, so they change once. An unknown address shows the start section. What Back does: from a part of «Configuración» to the «Configuración» page (or wherever the person came from), then to the previous destination, and out of the app only from the first one.

Not included: addresses for the open day, the date or the filters (they stay in component state); path routes; what a notification opens (`device/push/safeNotification.ts:57` opens `/admin`, which shows «Primeros pasos» while a step is missing: the audit's P-13, a small behaviour change to decide separately).

"The day list with its detail in place" (also step 1) is not navigation; it is in `slice-plan.md`, slice N2.

---

## 6. Icons

- **Set.** Inline SVG, one file `app/icons.tsx` (**new**, no dependency): `<Icon name="check" />` renders `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">` with `fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round`. The 32 paths are in `specimen/build.mjs` (`ICONS`), drawn at the bottom of `specimen/shots/emp--390.png`; 25 come from the prototype and 7 are new (`pause`, `ban`, `info`, `error`, `external`, `today`, `month`).
- **Size.** `.icon { width: 1.25em; height: 1.25em }` (it follows the text); 1.15em in a tag; 24 px in the bottom bar; 20 px on the rail.
- **Rule.** An icon is always next to visible text and always `aria-hidden`. No control is named by an icon; no icon contradicts its word. The same thing has the same icon everywhere.

| Group | Icons (name: where) |
|---|---|
| States | `check`: justified, done, finished, active, selected choice · `x`: not justified · `eye`: to review · `bubble`: motive missing · `waiting`: not started · `pause`: on a break · `ban`: cancelled, voided, inactive |
| Messages | `info`, `check`, `alert` (warning, field error, missing step), `error` |
| Marks and the day | `enter`, `exit`, `coffee`, `lunch`, `clock` (schedule, day in progress), `pin`, `pinoff` |
| Navigation | `inbox` Para revisar · `today` Hoy · `month` Días de trabajo · `config` Configuración · `steps` Primeros pasos · `store` Locales · `schedule` Horarios · `people` Equipo · `bell` Avisos · `calendar` the notice of days loaded |
| Actions | `refresh` Actualizar, Reintentar · `filter` Filtros · `plus` add · `right` row that leads somewhere · `external` opens another tab |

- **Replaces** the Unicode glyphs (finding F-22): the menu `'✓' '◷' '▦' '☰' '⌖' '▤' '♙'` (`AdminApp.tsx:13-19`; «☰» labels Historial and «◷» both Bandeja and the clock), `'◷'` in `EmployeeViews.tsx:70`, `:80`, `'✔'` in `:50`, `:51`, `:110`, `'!'` in `:158`, `'!'` / `'↗'` in `AdminViewsRender.tsx:107`, `'⌖'` in `:164`, `'✓'` in `FirstSteps.tsx:22`, `'→'` in `AuthScreens.tsx:55`, `'▸'` / `'▾'` in `styles.css:449-450`. The glyph boxes `.row-avatar`, `.deviation-symbol`, `.choice-icon`, `.schedule-icon`, `.nav-icon`, `.mark-action > span` go with them. «⋮» inside the install instructions (`InstallControl.tsx:30`) stays: it shows the user what Chrome's button looks like.
- **Brand mark.** `BrandMark` in the same file: the clock path of `frontend/public/icon.svg` with `fill="currentColor"`, drawn in `--lime` on the top bar. It replaces the letter «B» in a box (`.brand-mark`, `styles.css:59`).

---

## 7. Content rules the system needs

These hold the system together. The words themselves are decided in D-20261111-01; 7.2 is that glossary as the system uses it.

### 7.1 Rules

1. **Sentence case.** No capitals for emphasis in strings or in CSS: titles, labels, buttons, tags, captions.
2. **One name per thing, the same for both roles and in every place**: the navigation item, the page title, the step of the guide, the tag, the message and the push notification use the word of 7.2. Every label of a mark, a case, a state and a category comes from one module (`shared/labels.ts`, **new**: today three copies, `AdminViewsRender.tsx:473-477`, `features/employee/employeeDay.ts:4-20` and `:160-163`, `shared/format.ts:3-9`), and a test fails when a retired word of 7.2 appears in a user-facing string.
3. **A button says what it does** in one to four words; the button that backs out of a form never uses the word of a domain action (today «Cancelar» closes a form and «Cancelar jornada» cancels a day).
4. **Dates and times are formatted in one place**: `shared/format.ts` (`formatClock`, `formatBlock`, `formatLocalDate`, `formatDateTime`) and `formatTime` (`features/employee/employeeDay.ts:27`, to move there). No component calls `Intl.DateTimeFormat` or `toLocale…` itself (today `AdminViewsRender.tsx:46`). Clock times are 24-hour `HH:MM` in the local's zone; a range is «08:00 a 16:00». A time is always inside a `time` element or `.num`.
5. **A duration over 60 minutes is shown as hours and minutes** by one helper in `shared/format.ts` (`formatMinutes`, **new**): 45 → «45 minutos», 60 → «1 hora», 90 → «1 hora y 30 minutos», 240 → «4 horas» **(copy)**. Today the employee reads «Tenés 240 minutos de tolerancia para entrar.» (`EmployeeViews.tsx:82`).
6. **A message has up to three parts in this order**: what happened; whether it was saved; what to do. No codes, no blame, no «inválido». The employee messages are the model (`features/employee/employeeMessages.ts`).
7. **Nothing says «registrada» before the server answered**, and nothing suggests a mark will be sent later.
8. **An example lives in the hint; a placeholder is never the only place of an instruction.**
9. **Text written by people** (motives, reasons, names) wraps anywhere (`overflow-wrap: anywhere`) and is never cut with an ellipsis.
10. **State words are short enough for a tag** (up to three short words; the longest is «Todavía no explicó») and are never the only content of a button.

### 7.2 Glossary (D-20261111-01)

Visible words only: internal names, the API, the database and the terms of `docs/ESPECIFICACION.md` do not change.

| Thing | Word on screen | Retired on screen | Where it is today |
|---|---|---|---|
| `jornada` | «día de trabajo» (short: «día») | «jornada», «turno» as its name | `AdminApp.tsx:16`, `AdminViewsRender.tsx:42-47`, `:308`; `EmployeeViews.tsx:36` |
| the inbox | «Para revisar» | «Bandeja», «Bandeja de desvíos» | `AdminApp.tsx:16`, `AdminViewsRender.tsx:82` |
| a deviation, for the ADMIN | «caso» | «desvío» | `AdminViewsRender.tsx:104-105`, `:413-422` |
| a deviation, for the employee | no noun: the section is «Para explicar» | «Desvíos del día» | `EmployeeViews.tsx:156`, `:165` |
| `sede` | «local» | «sede» | `AdminApp.tsx:19`, `AdminViewsRender.tsx:75`, `:162`, `:199` |
| `INGRESO`, `EGRESO` | «Entrada», «Salida» | «Ingreso», «Egreso» | `AdminViewsRender.tsx:473` |
| `SIN_INGRESO` | «No marcó la entrada» | «Sin ingreso», «Faltó la entrada» | `AdminViewsRender.tsx:474`, `employeeDay.ts:160-163` |
| `LLEGADA_TARDE` | «Llegada tarde» | | same |
| `EGRESO_TEMPRANO` | «Salió antes» | «Egreso temprano», «Salida temprana» | same |
| `EGRESO_TARDIO` | «Salió después de hora» | «Egreso tardío», «Salida tarde» | same |
| `MARCA_FALTANTE` | «No marcó la salida» | «Egreso sin marcar», «Faltó la salida» | same |
| `EXCESO_DESAYUNO`, `EXCESO_ALMUERZO` | «Desayuno largo», «Almuerzo largo» | «Exceso de desayuno», «Exceso de almuerzo» | same |
| `FUERA_DE_SEDE` | «Fuera del local» | «Fuera de sede» | same |
| `MOTIVO_PENDIENTE`, for the ADMIN | «Todavía no explicó» | «Falta motivo» | `AdminViewsRender.tsx:475` |
| push, alerts, notifications | «avisos» | «alertas», «avisos push», «notificaciones» | `device/push/AdminPushControl.tsx:154`, `device/pwa/InstallControl.tsx:29`, `AdminViewsRender.tsx:82`, `device/push/safeNotification.ts:60` (the fixed text of the notification becomes «Para revisar») |
| the password | «contraseña» | «clave» | `features/auth/AuthScreens.tsx:38`, `shared/password.ts:10-12` |
| kept | «Justificado», «No justificado», «marca», «tolerancia», «tramo» | | |

The destinations of D-20261111-02 add: «Hoy», «Días de trabajo», «Configuración», «Locales», «Horarios», «Equipo» (today «Empleados»), «Avisos en este dispositivo», «Primeros pasos».

**Not covered by the decision, so still open** (the system needs one word for each; none is chosen here):

- The names of the four break marks for the ADMIN («Salida desayuno», «Vuelta desayuno», …, `AdminViewsRender.tsx:473`). The plan assumes the employee's existing names for both roles («Salida a desayunar», «Vuelta del desayuno», «Salida a almorzar», «Vuelta del almuerzo», `employeeDay.ts:9-12`), since the decision asks for one vocabulary.
- The states of a day, where «Sin ingreso» uses a retired word (`shared/format.ts:3-9`: «Sin ingreso», «En curso», «En pausa», «Finalizada», «Cancelada»).
- The employee's tag for `MOTIVO_PENDIENTE` («Falta explicar», `EmployeeViews.tsx:26`): assumed kept, as the second-person side of «Todavía no explicó».
- «Empleado» as the label of a person in filters and tables next to «Equipo» as the name of the section.
- «Cancelar jornada», «Ver jornada», «Jornadas del {fecha}»: the plan writes «Cancelar el día», «Ver el día» and the date alone, all marked **(copy)**.

---

## 8. What is deliberately not in the system

| Left out | Why |
|---|---|
| The fixed action dock and the fixed form action bar of direction C | The most ways to fail: focus hidden behind a fixed bar, the on-screen keyboard, the confirmation questions out of the reading order. One fixed element on phones is the limit. Worth a second iteration with real devices |
| Dark mode | Not asked for, and a second set of 20 values to keep passing AA. `color-scheme: light` stays declared. The tokens make it possible later |
| A bundled font | Section 3: a proposal, not adopted |
| Shadows, gradients, translucent bars | Principle 1; layers are lines and the tint |
| Cards for records, avatars, initials | Principle 3; decoration without a function (S7) |
| Modal dialogs | The app has none and needs none: every confirmation is an inline form. No focus trap to get wrong |
| Toasts and messages on a timer | A timed message is a time limit (WCAG 2.2.1) and gets missed |
| Tooltips | Nothing may depend on hover on a phone |
| A filled destructive button | One danger style, outlined; the confirm step is already a form with a reason |
| The warm page colour of direction B, pills, lime as an action colour | White is safer on bright shops and cheap screens; pills read as buttons; lime stays in the mark |
| A progress meter for the setup, counts on navigation items | The title says the count; the list of cases is paginated, so a count of what is loaded would mislead |
| Skeleton screens, an offline state, a live clock | Weak evidence; no offline queue exists; the time of a mark is the server's |
| A routing library, addresses for filters or the open day | One hook covers what the navigation needs |
| An accessibility test library (axe-core, `eslint-plugin-jsx-a11y`, a browser runner) | New dependencies: proposals for the owner (accessibility baseline 10.2). Every check in `guidelines-outline.md` uses what the repository has |
| A session-expiry warning, a company switch with an explicit button, a copy button for the provisional password | New behaviour, not visual: findings F-04, F-20 and F-37 stay as proposals |

---

## 9. Differences from the prototype, assumptions, counts

### 9.1 Decisions that differ from `ux/directions/hibrido/`

| Prototype | System | Why |
|---|---|---|
| 15 px for buttons, labels and hints; 17 px body | 16 px for all of them; 18 px on the employee screen | The research and the baseline both put 16 px as the working size (P11, F-12); one size fewer |
| The pair «Justificado \| No justificado» fused, no gap | Two halves 12 px apart, stacked under about 384 px | Finding F-18 flags these two at 6 px apart as an error risk. A gap turns a slip on the seam into a miss instead of the wrong decision, and correcting a decision costs a written reason. Priority 4 (error prevention) is above 6 (visual coherence) |
| Borders of 1.5 px and 2.5 px | 1 px and 2 px | Fractions round differently per screen density; the prototype's screenshots already show 1 px |
| Five radii (3, 4, 8, 12, 14 px) plus 9 px on the mark | 4, 8, 12 px | Three roles, three values |
| Main button 84 px (76 px under 360 px), 60 px and 56 px seconds | 80 px and 56 px, in rem, no special case at 320 px | One figure above the 75 px where accuracy stopped improving in the one study read (research 0.3) |
| Gutter 20 px (16 px under 360 px) | 16 px, 24 px from 600 px, 32 px from 1024 px | All on the spacing scale |
| Layout switch at 900 px for rail, tables and case columns | 768 px tables, 1024 px rail, case columns by container width | Section 2.4: a table never gets less than 720 px |
| Token names `--paper`, `--ink`, `--edge`, `--tint`, `--t-md`, `--s-4`, `--tap` | Names by role | So that a rule reads as intent; and none collides with a current name |
| Weight 800 on the current tab | 700 | Three weights |
| Error message text in red, 700 | Text in `--text`; bar, icon and fill carry the kind | Maximum contrast for the sentence the person most needs to read |
| «Aplicar» of the filters as a primary button | Secondary | «Para revisar» at rest has no filled button; the one that appears is the open correction |
| Done step with a brand-filled box; a five-segment meter | Check in `--ok`; no meter | Brand fill means "next action" only |
| «Falta» with the speech-bubble icon | `alert` | The bubble means "an explanation is missing" |
| Alerts as a notice at the end of the Bandeja and at the foot of the rail | On the «Configuración» page only | D-20261111-02 |
| Four equal tab columns | Equal shares that never go under the longest word of a label | «Configuración» was clipped at 320 px |

### 9.2 Assumptions

1. The orchestrator's choice of the hybrid includes these proposals of the directions report: the day sheet of four rows, «Para explicar» above the marks when something is pending, empty sections reduced to one line, the person first in a case, and dropping the eyebrows. Each is marked where it appears; the eyebrows and the «Conexión protegida» line delete visible text and wait for the owner's yes.
2. The menu and the vocabulary are decided (D-20261111-02, D-20261111-01). Two readings of them are this document's and are marked where they appear: the parts of «Configuración» listed on the rail (5.2), and the open words of 7.2.
3. Every string marked **(copy)** is a placeholder for copy review: «Empresa», «Estado», «Caso», «Motivo», «Acciones», «Marcas del día», «sin marcar», «Cargada por tu encargado», «(opcional)», «Ir al contenido», «Decidir el caso de {persona}», «Ver el día», «Cancelar el día», the map sentence, and the wording of hours and minutes.
4. The employee's API response carries `occurredAt` and `recordedAt` for marks an ADMIN loaded (`openapi.yaml:1598-1599` restricts neither to the ADMIN; PR #116 relies on `occurredAt`). `recordedAt` for the employee was not exercised: slice D2 checks it first, and without it the note «Cargada por tu encargado» is dropped and the time rule stands.
5. The user profile (45 to 65 years old, WhatsApp-level familiarity, small Android phones) is the brief's hypothesis. Sizes follow the conservative reading of studies made with older people.
6. Rendering was checked with headless Chrome on Windows (Segoe UI). Roboto and San Francisco were not rendered; nor were native pickers, 200 % zoom, forced colours or a screen reader. Those are the manual steps of `guidelines-outline.md`.
7. The 600-as-700 behaviour of Roboto is from the font's known faces, not from a device.

### 9.3 Count of components

| Kind | Count | Which |
|---|---|---|
| Restyled in place (same class or component) | 12 | Button (primary, danger), Field, Password toggle, Form layout, Panel, Empty, Loading, Page header, Step list, Map picker frame, Update banner, Install help |
| Merged (several current pieces become one) | 11 | Secondary button (outline + quiet + small), Clocking and large button (next action + mark action), Checkbox and radio (3), Option tile (3), Field group and Inline form (9), Message (PageMessage + 6 ad-hoc blocks), Status tag (10 classes), Fold (3), Record list and table (5 families), Case row (8 classes), Top bar (header + 4 brand lockups + pill + user label) |
| New (nothing existing can serve) | 8 | Icon and BrandMark, Link button variant, Decision pair, Mark confirmation, "Now" block, Day sheet, Navigation (bar, rail, «Configuración» page), Avisos setting row |
| Removed with no successor | 10 | Eyebrow (pending), «Conexión protegida» foot and its dot (pending), the fixed alerts bar and its clearance, the install popover, glyph boxes (5 classes), timeline points, the auth card box, every shadow, `--page` and the page gradient, dead rules (`.employee-title`, `.mark-action-primary`, `.nav-dot`, `.timeline-title`, `.mark-action small`, `.page-title-row > .field`) |

About 160 class selectors today become about 75.
