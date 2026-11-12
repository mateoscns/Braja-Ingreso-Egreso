# Fichaje Braja: visual directions (task T5, spec S7)

Date: 2026-11-10. Branch read: `feat/ux-ui-refactor-114`. Nothing in the repository was created or changed; everything is in this folder.

Three directions were built as static prototypes of the same screens, plus a fourth folder with the recommended hybrid. Each
direction answers a different question about hierarchy, density, navigation and personality, not a different palette.

| | A · Planilla | B · Mostrador | C · Tablero |
|---|---|---|---|
| Idea | The shop's time sheet | Being served at the counter | The control board of the day |
| Hierarchy | Type size and ruled lines; one filled element per screen | One block per task; the biggest thing is the next decision | Fixed slots: state always first, action always last |
| Density | Medium | Low | High on desktop, medium on phones |
| Navigation, phone | «Menú» button that opens a page of words | Four bottom tabs, always visible | Two always-visible levels at the top |
| Navigation, desktop | Light rail of words | Wide sidebar: icon, name and what each section is for | Dark compact sidebar |
| Employee screen | The day as a sheet of four fixed rows | A «now» block: state, big button, schedule | Dark state band on top, action dock at the thumb |
| Personality | Sober, typographic, paper | Warm, large, rounded | Dense, strong brand (green and lime) |

## How to look at it

- Side by side, the same screen in the three directions: `comparar/<screen>--<width>.png` (16 sheets). Start with
  `comparar/emp-medio--390.png`, `comparar/admin-bandeja--390.png` and `comparar/admin-bandeja--1366.png`.
- Per direction: `<slug>/<screen>.html` (open in a browser and resize; each file is responsive) and
  `<slug>/shots/<screen>--<width>.png` (whole page) or `<screen>--<width>-pantalla.png` (first screenful of a 320×640, 390×844 or
  768×1024 device).
- Screens in every direction: `emp-antes` (before the first mark), `emp-medio` (mid-morning, a pause available, a motive
  pending), `emp-enviando` (the mark is travelling; nothing says it was registered), `emp-confirmacion` (accepted by the server,
  location sent), `emp-confirmacion-sin-ubicacion` (accepted, location missing), `admin-bandeja`, `admin-nav` (the seven sections
  with «Primeros pasos» as content; in Planilla the phone widths show the menu open and `admin-pasos` shows the page itself),
  `admin-form` (Horarios → «Cambiar horario Mañana» with an invalid value).
- Tools, in `_tools/`: `build-<slug>.mjs` generate the HTML from one content file (`content.mjs`, the real wording of the app);
  `shoot.mjs` renders with headless Chrome; `contrast.mjs` computes the contrast tables; `measure.mjs` measures overflow and
  touch targets. Run with `node`.

Prototypes are static HTML with one stylesheet per direction: no script, no inline style, no network resource, icons as inline
SVG. They respect the production constraints (same-origin CSP, plain CSS, no new dependency).

## What is real and what is a proposal

All visible text comes from the current code (`employeeDay.ts`, `EmployeeViews.tsx`, `AdminViewsRender.tsx`, `FirstSteps.tsx`,
`setupStatus.ts`, `ScheduleEditor.tsx`, `AdminPushControl.tsx`), with the ADMIN vocabulary as it is today («Sin ingreso»,
«Egreso sin marcar», «Fuera de sede»: the vocabulary is decided separately, assumption A1). No feature, section or data field was
added. These points are not in the app today and are **proposals** that need a decision:

| Proposal | Where | Why |
|---|---|---|
| The fixed bar «Alertas en este dispositivo» stops being fixed: it moves to the end of the menu or sidebar (A, C desktop), to a status line in Bandeja (B, C phone) | all | A bar fixed over every ADMIN screen takes 64 to 98 px for a setting that is changed once; it also cannot coexist with bottom tabs or an action bar. Same feature, same text |
| Navigation: «Menú» page with one line per section (A); bottom tabs «Bandeja · Jornadas · Historial · Configurar», with Sedes, Horarios, Empleados and Primeros pasos under «Configurar» (B); two groups «Día a día» and «Configuración» (C) | ADMIN | The seven sections and their two groups already exist in `AdminApp.tsx`; only the container changes. The information architecture is decided separately |
| One-line description of each section in the menu (A) or sidebar (B): the current page subtitles; two were shortened («Primeros pasos»: «Lo que falta para que tu equipo pueda marcar.»; «Empleados»: «Altas, locales donde trabaja cada persona y su horario.») | ADMIN | Recognition instead of recall |
| New short labels: «Menú», «Estás acá», «Configurar», «Día a día», «Todos los días», column heads «Caso», «Empleado», «Desvío», the screen-reader text «sin marcar», and in C «Tolerancia para entrar: 10 minutos» (today: «Tenés 10 minutos de tolerancia para entrar.») | several | Needed by the layout; all need copy review |
| The day as four fixed rows «Entrada, Desayuno, Almuerzo, Salida» (A and the hybrid) | employee | The app allows at most one entry, one breakfast, one lunch and one exit per day (`allowedActions`), so the sheet is accurate. Voided marks and marks added by the ADMIN need a rule (extra struck row) |
| «Para explicar» goes above «Tus marcas de hoy» when there is something to explain; sections with nothing to do become one line each | employee | A pending task is an action; an empty section is not |
| The uppercase eyebrows («CENTRO DE CONTROL», «ORGANIZACIÓN», «PARA EMPEZAR»…) are dropped | ADMIN | They do not say where the user is; the title does |
| Person first in a case («Lucía Pérez», then «Llegada tarde · fecha») in B, C and the hybrid | Bandeja | An owner looks for people; A keeps the current order |

Not shown because the app does not have it: a live clock (the time of a mark is the server's, rule 1), counts of cases per state
(the inbox is paginated with a cursor, so a count of what is loaded would mislead), any offline state.

---

## A · Planilla (`planilla/`)

**Concept.** The product is the shop's time sheet, so the screen looks like a well-set printed sheet: ruled rows, no cards, no
shadows, and times in large tabular figures. On every screen exactly one element is filled with the brand colour: the thing to do
next. Words carry the navigation and the states; icons only accompany them.

**Tokens.**

| Group | Token | Value | Role |
|---|---|---|---|
| Colour | `--paper` | `#ffffff` | Page and controls |
| | `--tint` | `#f4f3ee` | Bands: who-am-I strip, menu rail, notices |
| | `--ink` | `#14201a` | Text, section rules, focus outline |
| | `--ink-2` | `#47524b` | Secondary text, hints, placeholders |
| | `--rule` | `#d9dbd5` | Hairlines between rows (decorative) |
| | `--edge` | `#6f7a73` | Borders of controls and tags |
| | `--brand` / `--brand-press` | `#12372a` / `#0b261c` | Primary button, current section, links |
| | `--lime` | `#d8f078` | Only inside the brand mark |
| | `--ok` / `--ok-bg` | `#1c6638` / `#e9f3ea` | Confirmed, «Justificado», «Listo» |
| | `--warn` / `--warn-bg` | `#7d5200` / `#fbf0d5` | «A revisar», «Falta explicar», missing location |
| | `--bad` / `--bad-bg` | `#a0261b` / `#fbe9e6` | Errors, «No justificado» |
| Type | family | system stack (`system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', …`) | No font file |
| | scale | 14 · 15 · 17 (body) · 20 · 26 (32 on desktop) px | Weights 400, 600, 700; `tabular-nums` on times and dates |
| Space | scale | 4 · 8 · 12 · 16 · 24 · 32 · 48 px | Gutter 20 px (16 px under 360, 32 px on desktop) |
| Radius | `--radius` | 3 px | Everything; the confirmation icon is the only circle |
| Elevation | | none | Layers are made with rules and the tint |
| Motion | | 120 ms colour change on hover; spinner while sending | Off with `prefers-reduced-motion` |
| Targets | `--tap` | 48 px (44 px on desktop); primary 72 px, secondary 56 px | Measured minimum: 44 px |

**State without colour.** Every state is an icon with its own shape plus its word in a bordered tag: speech bubble + dashed
border «Falta motivo»; eye «A revisar»; check «Justificado»/«Listo»; cross «No justificado». The current section has a bar, bold
weight and the words «Estás acá» (plus `aria-current`). An invalid field gets a thicker border, a rule on the left, a warning
icon and the message; the summary repeats it. A mark being sent disables the button and shows a spinner with «Enviando tu marca…
esperá un momento.»; the confirmation is a separate bordered block with a check, the sentence and the time.

**At 320 px.** One column; the word «Braja» of the brand hides; the state sentence drops to 24 px and the main button label to
18 px; «Minutos para desayunar/almorzar» stack. No horizontal overflow on any screen (measured). The menu stays one tap away.

**Dark mode.** Cheap: every colour is a token and there is no shadow or image; it needs a second set of 14 values and a check of
the three tinted backgrounds. Not needed now.

**Font.** System stack; no bundled font recommended for this direction.

**Contrast (computed, `_tools/contrast.mjs`).**

| Foreground | Background | Ratio | Requirement (WCAG 2.2 AA) | Result | Used for |
|---|---|---|---|---|---|
| ink #14201a | paper #ffffff | 16.78:1 | text ≥ 4.5:1 | pass | Body text, headings, outline buttons |
| ink #14201a | tint #f4f3ee | 15.11:1 | text ≥ 4.5:1 | pass | Menu rows, notices, tramo block |
| ink-2 #47524b | paper #ffffff | 8.15:1 | text ≥ 4.5:1 | pass | Hints, notes, secondary lines, placeholders |
| ink-2 #47524b | tint #f4f3ee | 7.34:1 | text ≥ 4.5:1 | pass | Company/name strip, menu captions, disabled button label |
| brand #12372a | paper #ffffff | 13.08:1 | text ≥ 4.5:1 | pass | Text buttons and links |
| brand #12372a | tint #f4f3ee | 11.77:1 | text ≥ 4.5:1 | pass | «Estás acá» marker, links inside notices |
| #ffffff #ffffff | brand #12372a | 13.08:1 | text ≥ 4.5:1 | pass | Primary button label |
| #ffffff #ffffff | brand-press #0b261c | 16.05:1 | text ≥ 4.5:1 | pass | Primary button, pressed/hover |
| ink #14201a | ok-bg #e9f3ea | 14.76:1 | text ≥ 4.5:1 | pass | Confirmation text |
| ok #1c6638 | ok-bg #e9f3ea | 6.14:1 | text ≥ 4.5:1 | pass | «Ubicación enviada», «Justificado»/«Listo» tags |
| #ffffff #ffffff | ok #1c6638 | 6.98:1 | ui ≥ 3:1 | pass | Check icon of the confirmation |
| warn #7d5200 | warn-bg #fbf0d5 | 6.02:1 | text ≥ 4.5:1 | pass | «A revisar» / «Falta explicar» tags |
| warn #7d5200 | paper #ffffff | 6.82:1 | text ≥ 4.5:1 | pass | Step detail «Falta para…» |
| warn #7d5200 | ok-bg #e9f3ea | 6.00:1 | ui ≥ 3:1 | pass | Warning icon inside the confirmation |
| bad #a0261b | bad-bg #fbe9e6 | 6.42:1 | text ≥ 4.5:1 | pass | Error summary, «No justificado» tag |
| bad #a0261b | paper #ffffff | 7.53:1 | text ≥ 4.5:1 | pass | Field error message |
| edge #6f7a73 | paper #ffffff | 4.46:1 | ui ≥ 3:1 | pass | Borders of inputs, outline buttons and tags |
| edge #6f7a73 | tint #f4f3ee | 4.02:1 | ui ≥ 3:1 | pass | Disabled button border; notice bar |
| brand #12372a | paper #ffffff | 13.08:1 | ui ≥ 3:1 | pass | Current-section bar, progress segments, editor rule |
| ink #14201a | paper #ffffff | 16.78:1 | ui ≥ 3:1 | pass | Focus outline; section rules |
| warn #7d5200 | paper #ffffff | 6.82:1 | ui ≥ 3:1 | pass | Rule of the pending motive |
| bad #a0261b | paper #ffffff | 7.53:1 | ui ≥ 3:1 | pass | Error border and rule |
| ok #1c6638 | paper #ffffff | 6.98:1 | ui ≥ 3:1 | pass | Confirmation border |
| rule #d9dbd5 | paper #ffffff | 1.40:1 | decorative | not required | Hairlines between rows (spacing also separates them) |

**Weaknesses.**
- The least identity of the three: it can read as a government form («limpia» but close to «vacía»). The brand appears only in
  the mark and the primary button.
- On phones the navigation is hidden behind «Menú»: two taps to change section and nothing on screen reminds the owner that
  the other sections exist.
- Sections look alike (same rule, same heading); on long pages the eye has few landmarks.
- Desktop inbox: about 130 px per case, about two cases in the first screenful at 1366×768.

---

## B · Mostrador (`mostrador/`)

**Concept.** Like being helped at a counter: each screen says in a sentence where you are, puts one decision in one block, and
uses large type and large buttons so nothing has to be hunted. Passive information stays flat on a warm page; only tasks get a
block, and a finished step folds to one line. It trades density for confidence.

**Tokens.**

| Group | Token | Value | Role |
|---|---|---|---|
| Colour | `--bg` | `#f6f1e7` | Page (warm) |
| | `--surface` | `#ffffff` | Blocks and controls |
| | `--ink` / `--ink-2` | `#1f2924` / `#4c574f` | Text / secondary text |
| | `--line` | `#d8cfbd` | Block outline (decorative) |
| | `--edge` | `#7a7363` | Borders of controls, chips, tab bar |
| | `--brand` / `--brand-press` | `#12372a` / `#0b261c` | Primary button, «now» block, current tab |
| | `--brand-soft` | `#e3efe5` | Soft buttons, current tab, selected option, schedule chips |
| | `--ok` / `--ok-bg` | `#1b6537` / `#e2f1e4` | Confirmed, done |
| | `--honey` / `--honey-edge` / `--honey-ink` | `#fcefc7` / `#8a6410` / `#6a4700` | The task that is waiting for the user |
| | `--bad` / `--bad-bg` | `#9e2a1c` / `#fbe5e0` | Errors, «No justificado» |
| Type | family | system stack | Optional bundled font below |
| | scale | 16 · 18 (body) · 21 · 26 · 30 px; main button 24 px | Weights 400, 600, 700, 800 |
| Space | scale | 4 · 8 · 12 · 16 · 20 · 28 · 40 px | Gutter 16 px (12 px under 360, 24 px from 600) |
| Radius | | 14 px controls · 20 px blocks · pill for chips and tabs | |
| Elevation | | none | Blocks differ from the page by fill and outline |
| Motion | | 160 ms colour and a 2 % press on buttons; spinner | Off with `prefers-reduced-motion` |
| Targets | `--tap` | 56 px; main button 84 px (76 px under 360); decisions 64 px; tabs 72 px | Measured minimum: 44 px |

**State without colour.** Same rule as A with pill chips (icon + word). The current tab has a bar on top, a filled background
and heavier weight; the current pill is filled. The waiting task has a thicker border and the chip «Falta explicar»/«Falta». The
selected option has a thicker border plus the radio. Sending replaces the button with a dashed box and a spinner: the button is
not there to be read as done.

**At 320 px.** Type steps down one notch (26 → 23 px, 30 → 26 px), block padding shrinks, «Justificado / No justificado» stack,
tab labels go to 13 px, the company name hides from the header. No horizontal overflow (measured). The first case of the inbox
falls below the first screenful.

**Dark mode.** Not cheap: the warm page is the identity, and the honey and soft-green fills need a redesigned set, not an
inversion.

**Font.** Works with the system stack (what the screenshots show: Segoe UI on this machine, Roboto on Android). Optional: bundle
**Atkinson Hyperlegible Next** (Braille Institute, SIL Open Font License 1.1), one variable `woff2` Latin subset, because it
separates 1/l/I and 0/O, which matters for DNI and times. File weight was not measured here (no network was used); set a budget
of about 100 KB and stay on the system stack if it does not fit. **Needs the owner's dependency check.** `vite.config.ts`
already precaches `woff2`, and a self-hosted file passes the same-origin CSP.

**Contrast (computed).**

| Foreground | Background | Ratio | Requirement (WCAG 2.2 AA) | Result | Used for |
|---|---|---|---|---|---|
| ink #1f2924 | bg #f6f1e7 | 13.32:1 | text ≥ 4.5:1 | pass | Body text on the page |
| ink #1f2924 | surface #ffffff | 14.99:1 | text ≥ 4.5:1 | pass | Text inside blocks |
| ink-2 #4c574f | bg #f6f1e7 | 6.70:1 | text ≥ 4.5:1 | pass | Lead paragraphs, quiet list, hints on the page |
| ink-2 #4c574f | surface #ffffff | 7.54:1 | text ≥ 4.5:1 | pass | Hints and secondary text in blocks; inactive tab; placeholders |
| brand #12372a | bg #f6f1e7 | 11.62:1 | text ≥ 4.5:1 | pass | Brand name, links on the page |
| brand #12372a | surface #ffffff | 13.08:1 | text ≥ 4.5:1 | pass | Outline button label, links |
| brand #12372a | brand-soft #e3efe5 | 11.05:1 | text ≥ 4.5:1 | pass | Soft button label, current tab label |
| ink #1f2924 | brand-soft #e3efe5 | 12.67:1 | text ≥ 4.5:1 | pass | Schedule chips, info note, selected option title |
| ink-2 #4c574f | brand-soft #e3efe5 | 6.37:1 | text ≥ 4.5:1 | pass | Help text of the selected option |
| #ffffff #ffffff | brand #12372a | 13.08:1 | text ≥ 4.5:1 | pass | Primary button, current pill |
| #ffffff #ffffff | brand-press #0b261c | 16.05:1 | text ≥ 4.5:1 | pass | Primary button, pressed/hover |
| ink #1f2924 | ok-bg #e2f1e4 | 12.80:1 | text ≥ 4.5:1 | pass | Confirmation text |
| ok #1b6537 | ok-bg #e2f1e4 | 6.05:1 | text ≥ 4.5:1 | pass | «Justificado» / «Listo» chip |
| ok #1b6537 | surface #ffffff | 7.09:1 | text ≥ 4.5:1 | pass | «Ubicación enviada» line |
| #ffffff #ffffff | ok #1b6537 | 7.09:1 | ui ≥ 3:1 | pass | Check icons (confirmation, done steps) |
| honey-ink #6a4700 | honey #fcefc7 | 7.28:1 | text ≥ 4.5:1 | pass | «A revisar» / «Falta explicar» chips, step detail in the next step |
| ink #1f2924 | honey #fcefc7 | 13.07:1 | text ≥ 4.5:1 | pass | Text of the to-do block and the location warning |
| ink-2 #4c574f | honey #fcefc7 | 6.58:1 | text ≥ 4.5:1 | pass | Step explanation inside the highlighted next step |
| honey-ink #6a4700 | surface #ffffff | 8.35:1 | text ≥ 4.5:1 | pass | Step detail «Falta en…» on a white step |
| honey-ink #6a4700 | bg #f6f1e7 | 7.42:1 | ui ≥ 3:1 | pass | Warning icon in the quiet list |
| bad #9e2a1c | bad-bg #fbe5e0 | 6.21:1 | text ≥ 4.5:1 | pass | Field error, error summary, «No justificado» chip |
| edge #7a7363 | surface #ffffff | 4.71:1 | ui ≥ 3:1 | pass | Borders of inputs, option tiles, chips |
| edge #7a7363 | bg #f6f1e7 | 4.18:1 | ui ≥ 3:1 | pass | Borders that touch the page: filters fold, pills, tab bar edge |
| brand #12372a | bg #f6f1e7 | 11.62:1 | ui ≥ 3:1 | pass | Border of the «now» block, focus outline on the page |
| brand #12372a | surface #ffffff | 13.08:1 | ui ≥ 3:1 | pass | Outline button border, selected option border, focus outline |
| honey-edge #8a6410 | honey #fcefc7 | 4.68:1 | ui ≥ 3:1 | pass | Border of the to-do block and chips (inner edge) |
| honey-edge #8a6410 | bg #f6f1e7 | 4.77:1 | ui ≥ 3:1 | pass | Border of the to-do block (outer edge) |
| ok #1b6537 | bg #f6f1e7 | 6.30:1 | ui ≥ 3:1 | pass | Border of the confirmation block |
| bad #9e2a1c | surface #ffffff | 7.50:1 | ui ≥ 3:1 | pass | Error border of an input |
| line #d8cfbd | bg #f6f1e7 | 1.37:1 | decorative | not required | Block outline (blocks also differ by their white fill and by spacing) |

**Weaknesses.**
- Slow for an owner with many cases: about 390 px per case on a phone and about 300 px on desktop, so one to two cases per
  screenful; the whole inbox of five is 2,341 px tall at 1366 px wide against 1,018 px in C.
- It is the direction closest to «exceso de tarjetas»: it needs discipline to keep blocks for tasks only.
- 18 px body and 56 px controls do not fit the existing tables (Jornadas, Empleados): every table has to become a list.
- Bottom tabs hold four destinations, so the three configuration sections and «Primeros pasos» move one level down.
- A fixed tab bar must never cover the focused control (WCAG 2.2, 2.4.11) and takes 72 px of a 640 px screen.

---

## C · Tablero (`tablero/`)

**Concept.** A control board for the shop's day: dark brand-green chrome frames a bright work surface, and every row puts state
in the same first slot and actions in the same last slot, so ten cases can be scanned at once. On the employee's phone the dark
band on top always says how the day is, and a dock at the thumb always holds the next mark. Two workspaces, «Día a día» and
«Configuración», keep every section label visible at two levels with no hidden menu.

**Tokens.**

| Group | Token | Value | Role |
|---|---|---|---|
| Colour | `--chrome` / `--chrome-2` | `#12372a` / `#1d513c` | Band, sidebar, dock / current item on them |
| | `--on-chrome` / `--on-chrome-2` | `#ffffff` / `#c4d6cb` | Text on chrome / secondary |
| | `--lime` / `--lime-press` | `#d8f078` / `#c5e056` | The main mark button, current-section marker, highlighted time |
| | `--page` / `--surface` | `#f1f3f2` / `#ffffff` | Page / panels and rows |
| | `--ink` / `--ink-2` | `#15211b` / `#4a5750` | Text / secondary |
| | `--line` / `--edge` | `#dde2de` / `#75817a` | Row separators (decorative) / control borders |
| | `--ok` / `--ok-bg` | `#1b6b3a` / `#e3f3e6` | Confirmed, «Justificado» |
| | `--warn` / `--warn-bg` | `#855000` / `#fff1d6` | «A revisar», next step, missing location |
| | `--bad` / `--bad-bg` | `#a3271c` / `#fce8e4` | Errors, «No justificado» |
| | `--wait-bg` | `#eceeed` | Neutral tags and chips |
| Type | family | system stack | No font file |
| | scale | 14 · 15 · 16 (body; 15 on desktop) · 19 · 24 · 28 px; main button 20 px | Weights 400, 600, 700, 800; `tabular-nums` |
| Space | scale | 4 · 8 · 12 · 16 · 24 · 32 px | Gutter 16 px (12 px under 360, 24 px from 600) |
| Radius | | 4 px tags · 8 px controls · 10 px panels | Tags are rectangles, not pills |
| Elevation | | one: `0 -2px 12px rgba(18,55,42,.14)` on the two fixed bars (dock, form actions) | Nothing else has a shadow |
| Motion | | 120 ms colour change; spinner | Off with `prefers-reduced-motion` |
| Targets | `--tap` | 44 px; main mark 60 px; dock secondaries 48 px; tabs 56 px | Measured minimum: 44 px |

**State without colour.** Rectangular tag with icon + word, always first in the row; the coloured bar on the row edge repeats it
for scanning («Falta motivo» is dotted, so it differs in shape too). Current workspace and section: bar, weight and background.
Sending replaces the dock button with a dashed box and a spinner. The confirmation is a white block with a green edge, a check
and the time in heavier figures.

**At 320 px.** The dock keeps the main mark at 60 px and drops the icons of the two secondary marks so the labels fit in one
line; the company tag hides; the classification pair takes the full row. No horizontal overflow (measured). Chrome cost: about
150 px of header plus two levels of tabs before the content, and about 140 px of dock on the employee screen.

**Dark mode.** Half there: the chrome is already dark; the work surface needs a second token set (10 values). Cheap to moderate.

**Font.** System stack. The 14 px size is used for dates and tags only; do not go below it.

**Contrast (computed).**

| Foreground | Background | Ratio | Requirement (WCAG 2.2 AA) | Result | Used for |
|---|---|---|---|---|---|
| on-chrome #ffffff | chrome #12372a | 13.08:1 | text ≥ 4.5:1 | pass | Text on the dark band, sidebar and dock |
| on-chrome-2 #c4d6cb | chrome #12372a | 8.61:1 | text ≥ 4.5:1 | pass | Secondary text on the dark chrome, inactive nav |
| lime #d8f078 | chrome #12372a | 10.37:1 | text ≥ 4.5:1 | pass | Highlighted time in the band |
| chrome #12372a | lime #d8f078 | 10.37:1 | text ≥ 4.5:1 | pass | Label of the main mark button |
| chrome #12372a | lime-press #c5e056 | 8.83:1 | text ≥ 4.5:1 | pass | Main mark button, pressed/hover |
| on-chrome #ffffff | chrome-2 #1d513c | 9.15:1 | text ≥ 4.5:1 | pass | Current nav item, company tag |
| lime #d8f078 | chrome #12372a | 10.37:1 | ui ≥ 3:1 | pass | Current-section marker, focus outline on chrome |
| lime #d8f078 | chrome-2 #1d513c | 7.26:1 | ui ≥ 3:1 | pass | Icon of the current nav item |
| on-chrome-2 #c4d6cb | chrome #12372a | 8.61:1 | ui ≥ 3:1 | pass | Border of ghost buttons on chrome |
| ink #15211b | page #f1f3f2 | 14.89:1 | text ≥ 4.5:1 | pass | Text on the page background |
| ink #15211b | surface #ffffff | 16.60:1 | text ≥ 4.5:1 | pass | Text in panels and rows |
| ink-2 #4a5750 | page #f1f3f2 | 6.80:1 | text ≥ 4.5:1 | pass | Lead, column headers |
| ink-2 #4a5750 | surface #ffffff | 7.58:1 | text ≥ 4.5:1 | pass | Hints, dates, secondary text, inactive tab; placeholders |
| chrome #12372a | surface #ffffff | 13.08:1 | text ≥ 4.5:1 | pass | Links and quiet buttons |
| chrome #12372a | page #f1f3f2 | 11.74:1 | text ≥ 4.5:1 | pass | Links on the page background («Cancelar» in a correction) |
| #ffffff #ffffff | chrome #12372a | 13.08:1 | text ≥ 4.5:1 | pass | Primary button label |
| #ffffff #ffffff | chrome-2 #1d513c | 9.15:1 | text ≥ 4.5:1 | pass | Primary button, hover |
| ink #15211b | wait-bg #eceeed | 14.24:1 | text ≥ 4.5:1 | pass | Neutral tags and schedule chips |
| ink-2 #4a5750 | wait-bg #eceeed | 6.50:1 | text ≥ 4.5:1 | pass | «Falta motivo» tag |
| warn #855000 | warn-bg #fff1d6 | 5.98:1 | text ≥ 4.5:1 | pass | «A revisar» tag, step detail in the highlighted step |
| ink #15211b | warn-bg #fff1d6 | 14.86:1 | text ≥ 4.5:1 | pass | Location warning, highlighted step title |
| ink-2 #4a5750 | warn-bg #fff1d6 | 6.79:1 | text ≥ 4.5:1 | pass | Step explanation in the highlighted step |
| warn #855000 | surface #ffffff | 6.68:1 | text ≥ 4.5:1 | pass | Step detail on white |
| ok #1b6b3a | ok-bg #e3f3e6 | 5.68:1 | text ≥ 4.5:1 | pass | «Justificado» / «Listo» tag |
| chrome #12372a | ok-bg #e3f3e6 | 11.35:1 | text ≥ 4.5:1 | pass | Current tab label |
| ink #15211b | ok-bg #e3f3e6 | 14.41:1 | text ≥ 4.5:1 | pass | Selected option title |
| ink-2 #4a5750 | ok-bg #e3f3e6 | 6.58:1 | text ≥ 4.5:1 | pass | Selected option help |
| ok #1b6b3a | surface #ffffff | 6.54:1 | text ≥ 4.5:1 | pass | «Ubicación enviada» line |
| #ffffff #ffffff | ok #1b6b3a | 6.54:1 | ui ≥ 3:1 | pass | Check icons |
| bad #a3271c | bad-bg #fce8e4 | 6.22:1 | text ≥ 4.5:1 | pass | Error summary, «No justificado» tag |
| bad #a3271c | surface #ffffff | 7.33:1 | text ≥ 4.5:1 | pass | Field error message |
| ink #15211b | bad-bg #fce8e4 | 14.07:1 | text ≥ 4.5:1 | pass | Value typed in an invalid field |
| edge #75817a | surface #ffffff | 4.06:1 | ui ≥ 3:1 | pass | Borders of inputs and outline buttons |
| edge #75817a | page #f1f3f2 | 3.64:1 | ui ≥ 3:1 | pass | Borders that touch the page |
| edge #75817a | wait-bg #eceeed | 3.48:1 | ui ≥ 3:1 | pass | Outline of the «Falta motivo» tag |
| warn #855000 | surface #ffffff | 6.68:1 | ui ≥ 3:1 | pass | State bar «A revisar» |
| ok #1b6b3a | surface #ffffff | 6.54:1 | ui ≥ 3:1 | pass | State bar «Justificado», confirmation border |
| bad #a3271c | surface #ffffff | 7.33:1 | ui ≥ 3:1 | pass | State bar «No justificado», error border |
| chrome #12372a | surface #ffffff | 13.08:1 | ui ≥ 3:1 | pass | Focus outline, current tab bar, editor border |
| line #dde2de | surface #ffffff | 1.31:1 | decorative | not required | Row separators (rows are also separated by spacing) |

**Weaknesses.**
- The hardest to learn: two levels of navigation and column-shaped rows ask the owner to understand a structure first.
- Two fixed regions on the employee phone (band scrolls away, dock does not) and a fixed action bar in forms: each must be kept
  clear of the focused control and of the on-screen keyboard, and at 200 % zoom they eat the viewport. More behaviour to test.
- The dock moves the mark buttons out of the reading order of the page; the question «¿Terminás tu día ahora?» and the location
  notice have to open in or above the dock.
- Lime on dark green is the strongest identity but also the furthest from «colores moderados»: it must stay limited to the one
  main action and the current-place marker.
- Desktop rows and phone cards are two render paths for the same data (the app already has both for Jornadas and Empleados).

---

## Comparison (1 = weak, 5 = strong; the reason matters more than the number)

| Criterion | A · Planilla | B · Mostrador | C · Tablero |
|---|---|---|---|
| Claridad | **4** One filled element per screen and the day sheet show the whole day; sections look alike | **5** One decision per block, person first, largest text; the waiting task cannot be missed | **4** State and action always in the same slot; more to read at once |
| Facilidad de aprendizaje | **4** The menu explains every section in words; costs two taps on phones | **5** Bottom tabs with words are always in sight; done steps fold away | **3** Two navigation levels and columns must be understood first |
| Accesibilidad | **5** Highest contrasts (lowest required pair 4.02:1), 48 px targets, no fixed bar, simplest reading order | **4** 18 px body and 56 px targets; long pages and a fixed tab bar to keep off the focus | **3** Passes AA (lowest required pair 3.48:1, a tag outline); 14 px secondary text and up to two fixed bars |
| Eficiencia operativa | **3** About 2 cases in the first desktop screenful; classify buttons next to each case | **2** 1 to 2 cases per screenful on any device; much scrolling | **5** The five cases with a correction open fit in 1,018 px at 1366; mark dock at the thumb |
| Coherencia | **5** Three primitives (rule, tag, button) cover every screen | **4** Blocks, quiet lists, chips, pills and tabs: more pieces to keep consistent | **4** Strict slots; rows on desktop and cards on phones are two shapes |
| Calidad visual | **3** Clean and sober, little character of its own | **4** Warm and distinctive; risks looking soft or card-heavy | **5** The existing green and lime become a recognisable product |
| Viabilidad técnica | **5** Maps onto the current markup (Panel → ruled section); smallest stylesheet (18.3 KB) | **3** Tabs with a second level and the relocated alerts bar touch `AdminApp`; tables must become lists | **3** Dock and fixed action bar need focus and keyboard handling; two-level navigation state; largest stylesheet (22.1 KB) |
| Adaptabilidad móvil | **4** Fluid single column, nothing fixed, intact at 320 px | **5** Built from the phone up: thumb-reach tabs, big targets | **4** Best employee idea (dock); the ADMIN chrome takes 150 px at 320×640 |
| Sum | 33 | 32 | 31 |

The sums are within two points, so the sum does not decide. The order of priorities of the brief does (S15): comprehension
first, then preserving features, speed in daily tasks, error prevention, accessibility, coherence, and only then aesthetics.

## Recommendation: a hybrid, «Planilla» as the base (`hibrido/`)

A sketch of it is built in `hibrido/` (three employee screens and the inbox; its stylesheet is Planilla's plus
`_tools/hibrido.overrides.css`, a short override file). Look at `hibrido/shots/emp-medio--390.png`,
`hibrido/shots/admin-bandeja--390-pantalla.png` and `hibrido/shots/admin-bandeja--1366.png`.

| Element | Comes from | Why |
|---|---|---|
| Flat ruled sections, no shadows, one filled element per screen, the token names, the field order label → hint → control → error | A | Fewest components to build and keep consistent; it restyles the existing `Panel`, `FormField` and buttons instead of creating a parallel system (S10); best contrast margins |
| The day as a sheet of four rows | A | It teaches what a day consists of before the first mark; proposal, see above |
| Employee scale (18 px body, 84 px main button) and the «now» block that joins the state sentence, the next mark and the schedule | B | Priority 1 for the user who uses the app least like software; state and action stop being two separate boxes |
| Options of the motive as large tiles; the pending task marked as a block of its own | B | The motive is the only form an employee fills; it must be the easiest thing on the screen |
| Done steps of «Primeros pasos» folded to one line | B | Progressive disclosure with data the app already has |
| Brand header: dark green band with the lime mark | C | The one place where the identity lives; it costs nothing in comprehension |
| State bar on the edge of each case, the joined pair «Justificado \| No justificado», person first, aligned columns on desktop | C | Scanning speed for the owner (priority 3) without B's height |
| Bottom tabs on phones, light rail of words on desktop | B (phone), A (desktop) | Always-visible labelled navigation on the device where the owner works between other tasks. It depends on the information architecture decision and on relocating the alerts bar |
| Not taken now: the employee dock and the fixed form action bar | C | The best phone idea of the three, and the one with the most ways to fail (focus hidden behind a fixed bar, on-screen keyboard, the confirmation questions). Worth a second iteration with real devices, not the first |
| Not taken: the warm page colour | B | White is the safer background for bright shops and cheap screens; the warmth comes from the tint and the scale |

Hybrid tokens: Planilla's set with `--radius: 8px` (tags 4 px), plus `--on-brand-2: #c4d6cb` and `--brand-soft: #e3efe5`; lime
only in the mark and the focus outline on the header. Its 32 pairings pass (lowest required 4.02:1); measured minimum target
44 px; no overflow from 320 to 1366 px.

**Known weaknesses of the recommendation.**
- A hybrid can drift into three styles at once. The sketch covers four screens; the rule that keeps it together («flat and
  ruled by default; a bordered block only for the next mark and for a pending task; dark only in the header») has to be written
  in the guide (S9) and checked in review.
- The desktop inbox of the sketch shows two to three cases per screenful: better than A and B, still behind C, where the five cases fit in little more than one screenful. If the
  owner's daily volume is high, take C's row height too.
- Jornadas, Historial, Sedes and Empleados were not prototyped in any direction: the densest screens (mark tables, the site map)
  are only covered by the shared primitives.
- The bottom tabs and the day sheet are proposals outside a pure restyle; without them the hybrid still works with the rail
  collapsed behind «Menú» as in A.

## Limits of this exploration

- Rendering was done with headless Chrome 157 on Windows: the system stack resolves to Segoe UI. On the target Android phones it
  resolves to Roboto, which is slightly wider; widths were kept with slack but were not rendered with Roboto.
- Chrome's headless window cannot be narrower than 500 px on Windows, so each page was rendered inside an iframe of the exact
  width (320, 390, 768, 1366): media queries and layout are exact; browser chrome and the on-screen keyboard are not simulated.
- No bundled font was rendered (no network use, none installed): the font recommendation in B is unverified in pixels and in
  file weight.
- Contrast was computed for the pairings listed, from the tokens. Native controls (date and time pickers, select arrows) use
  the browser's own colours and were not measured. Focus, zoom at 200 %, screen-reader order and `forced-colors` were designed
  for but not tested; that belongs to the accessibility review.
- The user profile (45 to 65 years old, WhatsApp-level familiarity, cheap Android phones in bright shops) is a design
  hypothesis from the brief, not research. Nobody from the target group has seen these screens.
- Scores are one designer's judgement with the reason stated, not a measurement.
