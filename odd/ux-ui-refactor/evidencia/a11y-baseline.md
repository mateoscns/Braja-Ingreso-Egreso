# Fichaje Braja: accessibility and cognitive usability baseline

- Scope: the frontend on branch `feat/ux-ui-refactor-114` as it is today (before the redesign). Task T4 of `odd/tasks/ux-ui-refactor.md` (S3 "AGENTE 6", S9, S11).
- Standard: WCAG 2.2, levels A and AA. Cognitive frame: W3C "Making Content Usable for People with Cognitive and Learning Disabilities" (COGA), which is guidance, not a conformance requirement.
- Date: 2026-11-10. Method: static reading of the source. Nothing was rendered, built, installed or run except a plain `node` script for contrast maths.
- Paths are relative to `frontend/` unless they start with another folder. `styles.css` means `frontend/src/styles.css`.

## How to read this document

**What static analysis can and cannot say.** Every finding below comes from reading CSS and JSX. Colour ratios are exact for the declared values. Sizes, wrapping, overflow, what a screen reader announces and what a browser paints for native controls are **inferred**. Each finding carries one of two marks:

- `[code]`: the defect is visible in the source and does not depend on rendering (a missing attribute, a string, a declared colour pair, the order of elements).
- `[render]`: the source makes it likely, and a rendered check has to confirm it (section 10 lists those checks).

Nothing in this document is a statement of conformance. A criterion with no finding means "no defect found by reading the code", not "passes".

**Normative or not.** Each finding names its basis:

- `WCAG x.y.z (A|AA)`: a success criterion of WCAG 2.2 at the level this project targets.
- `COGA`: a pattern from "Making Content Usable". Not required for AA.
- `best practice`: neither; a convention with a reason given.

**Severity** is by impact on the people in the brief (employees who mostly use WhatsApp, workers aged 45 to 65, owners doing admin between other tasks, cheap small phones, unstable connections), not by conformance level:

- critical: someone cannot complete a core task at all.
- high: a core task is likely to go wrong or be abandoned, or a wrong result goes unnoticed.
- medium: the task completes with confusion, extra effort or a workaround.
- low: a detail that costs little today and is cheap to fix during the redesign.

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 7 |
| Medium | 16 |
| Low | 16 |
| Total | 39 |

No critical blocker was found by reading the code: every function has a native control, a label and a text state. That is a statement about the code, not about a rendered screen with a screen reader.

Colour: 122 pairs extracted, 106 judged, 97 pass, 9 fail. **Every declared text pair passes 1.4.3.** The failures are two inferred placeholder colours and seven selected, pressed, current or target state indicators (1.4.11). Three pairs pass with less than 0.5 of margin.

The seven high findings, in one line each:

| ID | Finding | Basis |
|---|---|---|
| F-01 | The selected shift, the pressed quick choice and the current section are shown by a fill of 1.08 to 1.09:1 and a border of 2.27:1 | WCAG 1.4.11 (AA) |
| F-02 | ADMIN errors and confirmations appear at the top of the page, away from the form or card that caused them, with no scroll and no focus move | WCAG 3.3.1 (A) in spirit, COGA |
| F-03 | Forms open away from the button that opens them: the employee's "Corregir motivo" opens a form in the panel above and the button disappears; the ADMIN's "Corregir" and "Anular" open a form under the list | WCAG 2.4.3 (A), COGA |
| F-04 | The ADMIN session ends after 30 idle minutes with no warning and no way to extend it, and what was typed is lost | WCAG 2.2.1 (A) |
| F-05 | A server validation error says only "Revisá los datos ingresados." | WCAG 3.3.1 (A), 3.3.3 (AA) |
| F-06 | The same thing has two or three names, and the employee and the ADMIN see different names for it | COGA, partly WCAG 3.2.4 (AA) |
| F-07 | A first login asks for about 62 characters of password typing on a phone | COGA |

---

## 1. Colour and contrast

### 1.1 Tokens

All in `src/styles.css`, `:root`, lines 10 to 30.

| Token | Value | Line | Use |
|---|---|---|---|
| `--text-primary` | `#18241f` | 10 | body text, input text |
| `--text-secondary` | `#53645a` | 11 | `.muted`, hints, nav, small text |
| `--text-tertiary` | `#5c6d62` | 12 | `.eyebrow`, `th`, input and `.mark-action` borders, `.nav-icon` |
| `--page` | `#f4f7f5` | 13 | page background |
| `--focus` | `#1d513c` | 14 | focus ring |
| `--green` | `#12372a` | 22 | primary button, brand |
| `--green-2` | `#1d513c` | 23 | `summary` text, checkbox accent, spinner |
| `--green-3` | `#e7f1e9` | 24 | pressed fill, map canvas background |
| `--lime` | `#d8f078` | 25 | the "B" of the brand mark only |
| `--muted` | `var(--text-secondary)` | 26 | alias |
| `--line` | `#e4e9e5` | 27 | light borders |
| `--surface` | `#ffffff` | 28 | panels |
| `--red` | `#a33e35` | 29 | field errors |
| `--shadow` | `0 18px 55px rgba(24,45,34,.06)` | 30 | popovers |
| `--tap-target` | `44px` | 19 | minimum control height |

There are **also 138 colour literals outside the token block, 96 distinct values** (counted with `grep` over lines 32 to 470; for example `#495950` at line 67, `#54655a` at 125, `#8e3931` at 141, every status chip at 246 to 254, `#97b39d` at 299, 323 and 452). A redesign with "Tokens centralizados" (S9) has to absorb them; today a contrast test can only reach them by selector, as `src/app/styles.test.tsx:21-33` does.

The manifest uses `theme_color: '#12372a'` and `background_color: '#f5f7f4'` (`vite.config.ts:22-23`); the page background is `#f4f7f5` (`styles.css:13`). The two differ by one step per channel, which nobody will see, but they are meant to be the same value.

### 1.2 Method

Script: `SCR/a11y/contrast.mjs`. Its full output is appendix A and also `SCR/a11y/contrast-output.md`.

- WCAG 2.x relative luminance, the same formula as `src/app/styles.test.tsx:10-18`.
- Translucent surfaces are composited first: `.auth-card` at 92 % over the top of the auth gradient gives `#fdfefd`; `.topbar` at 95 % over the page gives `#feffff`; `.push-control` at 96 % gives `#ffffff`.
- Disabled buttons are composited at `opacity: .68` (`styles.css:40`) over white. Disabled controls are exempt from 1.4.3 and 1.4.11; they are reported, not judged.
- Thresholds: 4.5:1 for text (no text in the app is both large and near a threshold, so 3:1 was never needed), 3:1 for component boundaries, states and focus indicators.
- "Same-hue alternative" keeps hue and saturation and moves lightness until the ratio is met.

Not covered by the script: colours the browser paints on its own (native date and time pickers, the unchecked checkbox border, `select` arrows, autofill background), Leaflet's own stylesheet, and the map tiles. Those need a rendered check.

### 1.3 Failing pairs

| ID | Pair | FG | BG | Ratio | Needs | Where | Mark |
|---|---|---|---|---|---|---|---|
| U10 | Pressed quick choice: fill against the unpressed fill | `#e7f1e9` | `#f7f9f7` | 1.09:1 | 3:1 | `styles.css:452` and `:125` | `[code]` |
| U11 | Pressed quick choice: border against the white panel | `#97b39d` | `#ffffff` | 2.27:1 | 3:1 | `styles.css:452` | `[code]` |
| U12 | Selected `.journey-option-active`: border against white | `#97b39d` | `#ffffff` | 2.27:1 | 3:1 | `styles.css:299` | `[code]` |
| U13 | Selected `.journey-option-active`: fill against the unselected fill | `#f3f8f3` | `#ffffff` | 1.08:1 | 3:1 | `styles.css:298-299` | `[code]` |
| U14 | Current `.nav-link-active`: fill against the sidebar | `#eaf2ec` | `#f8faf8` | 1.09:1 | 3:1 | `styles.css:171` and `:166` | `[code]` |
| U16 | `.deviation-target`: border against white | `#c5d990` | `#ffffff` | 1.53:1 | 3:1 | `styles.css:257` | `[code]` |
| U17 | `.deviation-target`: fill against white | `#fbfff0` | `#ffffff` | 1.02:1 | 3:1 | `styles.css:257` | `[code]` |
| T24 | Placeholder in Firefox (text at 54 % opacity) | `#828986` | `#ffffff` | 3.58:1 | 4.5:1 | no `::placeholder` rule in `styles.css` | `[render]` |
| T25 | Placeholder in Safari (`darkgray`) | `#a9a9a9` | `#ffffff` | 2.35:1 | 4.5:1 | no `::placeholder` rule in `styles.css` | `[render]` |

**Fixes, with computed ratios** (`extra.mjs` in the same folder):

- U10 to U13 (F-01). A lighter or darker fill cannot carry the state: the script's same-hue fill that reaches 3:1 is a mid green (`#5c9d69`), which would then fail as a background for the label. Carry the state on the border and on a non-colour cue: `border: 2px solid #1d513c` (`--green-2`), which is 9.15:1 on white, 7.91:1 on the pressed fill `#e7f1e9`, 8.65:1 on the unpressed fill `#f7f9f7` and 8.51:1 on `#f3f8f3`, plus a "✓" before the label (hidden from assistive technology, since `aria-pressed` already carries the state). If only the border colour changes, the minimum same-hue value is `#789c80` (3.06:1), which leaves no margin.
- U14 (F-01). Add a bar the reader cannot miss: `box-shadow: inset 3px 0 0 #12372a` on wide screens and `inset 0 -3px 0 #12372a` when the menu is a row; `#12372a` is 12.47:1 on the sidebar and 11.47:1 on the active fill.
- U16, U17 (F-39). Reuse the same selected border (`2px solid #1d513c`). Minimum same-hue border: `#819e36` (3.05:1).
- T24, T25 (F-08). Add `::placeholder { color: var(--text-tertiary); opacity: 1; }`: `#5c6d62` is 5.50:1 on white.

### 1.4 Passing with little margin

| ID | Pair | Ratio | Where | Suggestion |
|---|---|---|---|---|
| T23 | Placeholder in Chrome (`#757575`, inferred) | 4.61:1 | browser default | Covered by the `::placeholder` rule above |
| H03 | `.user-label` `#68766e` on the top bar | 4.76:1 | `styles.css:157` | Use `--text-secondary`: 6.28:1 |
| C07 | `.status-no_ingreso` `#94612d` on `#fff4e2` | 4.81:1 | `styles.css:250` | Use `#835520` (the colour of `.status-motivo_pendiente`): 5.87:1 |

### 1.5 Reported, not judged

- **Disabled buttons** (exempt). `.button-quiet` disabled is 2.95:1 and `.button-danger-outline` disabled is 3.23:1; `.button-primary` and `.button-outline` disabled are 4.84:1. The only signal that a button is disabled is 32 % less opacity (`styles.css:40`). See F-09 for the cognitive side.
- **Button boundaries.** `.button-quiet` is a fill of 1.06:1 and a border of 1.21:1 against a white panel (`styles.css:125`); `.button-outline` and `.button-danger-outline` borders are 1.46:1 (`:127`, `:129`). WCAG 1.4.11 does not require a visible boundary when the text label identifies the control, so these do not fail. They are in F-21 as a COGA finding: a "quiet" button on a white panel reads as plain text.
- **Focus ring on the primary button.** The ring (`#1d513c`) against the button fill (`#12372a`) is 1.43:1, but `styles.css:119` puts a 3 px white halo between them, so the ring is judged against white (9.15:1). Keep the halo.
- **Map.** The point (`#12372a` stroke, `#2f8f5b` fill) and the radius circle (`#2f8f5b`, 2 px) are drawn in `src/features/admin/SiteMapPicker.tsx:51-53`. Against an OpenStreetMap land tile of about `#f2efe9` they are 11.40:1 and 3.52:1; against a park, water or a main road the circle may drop under 3:1. `[render]`
- **Decorative.** `.deviation-symbol` (4.53:1, `aria-hidden`), `.timeline-point` (2.93:1), `.live-dot` (2.68:1), spinner.

### 1.6 Contrast findings

**F-01. Selected, pressed and current states are told apart by a fill and a border that are almost invisible.** WCAG 1.4.11 Non-text Contrast (AA). Severity: **high**. `[code]`
- Where: employee shift picker `src/features/employee/EmployeeViews.tsx:36-39` with `styles.css:298-299`; ADMIN quick choices for weekdays and period `src/features/admin/WorkDaysForm.tsx:46` and `:51` with `styles.css:452`; schedule type cards `src/features/admin/ScheduleEditor.tsx:50-52`; ADMIN menu `src/features/admin/AdminApp.tsx:80` with `styles.css:171`.
- Why it matters: an employee with two shifts on the same day marks on the selected one. The selected card differs from the other by a border of 2.27:1 and a fill of 1.08:1. The states are exposed correctly to assistive technology (`aria-pressed`, `aria-current`); the failure is visual. In the menu the only other cue is weight 700 against 600.
- Fix: section 1.3. One "selected" style for every choice in the system: a 2 px `--green-2` border and a check mark.

**F-08. Placeholders have no declared colour, and they carry the examples.** WCAG 1.4.3 Contrast (Minimum) (AA). Severity: **medium**. `[render]`
- Where: `src/features/admin/AdminViewsRender.tsx:198` ("Ej. Local Centro"), `src/features/admin/SiteMapPanel.tsx:27` ("Calle y número"), `src/features/admin/ScheduleEditor.tsx:56` ("Ej.: Mañana, Turno noche"), `src/features/employee/EmployeeViews.tsx:141` ("Por ejemplo: hubo paro de colectivos.").
- Fix: the `::placeholder` rule of section 1.3. Better: move each example into the field's hint (`FormField` already supports `hint`, `src/app/ui.tsx:75-92`), because a placeholder disappears when the person starts typing (COGA: do not rely on memory).

---

## 2. Text and layout

### 2.1 Facts

| Topic | State | Where |
|---|---|---|
| Base size | Not set, so the browser default (16 px) applies and every font size is in `rem`. Text follows the user's default font size. | `styles.css:1-31` |
| Sizes in use | 12 px (`.75rem`): `.eyebrow` `:49`, `.sidebar-caption` `:167`. 13 px (`.8125rem`): `th` `:211`, `.status-chip` `:245`, `.timeline-title` `:279`, `.mark-row-location` `:317`, `.push-copy span` `:346`, `.mark-coordinates` `:463`, `.block-fields .field-label` `:227`, map `:89`. 13.1 px: `.brand` at 520 px or less `:394`. 13.6 px: `.deviation-title strong` `:262`. **14 px (`.875rem`) is the working size**: buttons `:121`, labels `:67`, hints `:68`, menu `:169`, list details. 16 px: inputs `:98`, messages `:137`, mark rows `:280`. | `styles.css` |
| Line height | Not set on `body`, so `normal` (about 1.2). Set only where declared: `.muted` 1.55 `:47`, hints 1.45 `:68`, messages 1.5 `:137`. Plain `<p>`, `td`, labels, list rows and multi-line buttons use `normal`. | `styles.css` |
| Units | Fonts in `rem`; spacing, heights and widths in `px`. Control heights are `min-height`, so text can grow. | `styles.css` |
| Fixed heights | `.topbar` has `height: calc(var(--topbar-height) + …)` (70 px, 60 px at 760 px or less) above 400 px wide; `auto` only at 400 px or less (`:153`, `:337`, `:422`). | `styles.css` |
| Uppercase | `text-transform: uppercase` on `th` `:211` and `.timeline-title` `:279`. Hard-coded capitals in the strings of every `.eyebrow` ("CENTRO DE CONTROL", "INGRESO AL SISTEMA") and sidebar caption ("ADMINISTRACIÓN", "CONFIGURACIÓN"). | `src/features/admin/AdminApp.tsx:90,93`, `AdminViewsRender.tsx:81` |
| Truncation | `.company-pill` is cut with an ellipsis at 135 px at 760 px or less and hidden at 520 px or less (`:365`, `:399`). `.company-switch` is cut at 135 px and 108 px (`:366`, `:398`). `white-space: nowrap` on `th`, `.status-chip`, the alerts button. | `styles.css` |
| Zoom | `<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />`. No `user-scalable=no`, no `maximum-scale`. | `index.html:5` |
| Orientation | Not locked in the manifest. | `vite.config.ts:18-30` |
| Reduced motion | Global rule cuts animations and transitions; the three smooth scrolls check `prefers-reduced-motion` in JavaScript. | `styles.css:427-434`, `src/features/admin/AdminViews.tsx:143-144, 655-656, 823-824` |
| Colour scheme | One light theme, declared on purpose with `color-scheme: light` so native controls do not turn dark. No dark theme. Not a WCAG requirement. | `styles.css:8-9` |
| Forced colours | Partial: focus ring, status chip border and spinner. | `styles.css:436-441` |
| Minimum width | `body { min-width: 320px }`. Under 320 CSS px the page scrolls sideways, which WCAG 1.4.10 allows. | `styles.css:37` |
| Tables | Wrapped in `.table-scroll` (`overflow-x: auto`); at 520 px or less the employees table, the day list and the marks table become cards. | `styles.css:209`, `src/features/admin/useNarrowScreen.ts:4`, `useMediaQuery.ts:4` |

### 2.2 Findings

**F-10. Fixed and sticky bars leave little or no room on a short viewport.** WCAG 1.4.10 Reflow (AA) and 2.4.11 Focus Not Obscured (Minimum) (AA). Severity: **medium**. `[render]`
- Where: `.topbar` sticky `styles.css:153`; `.sidebar` sticky between 521 and 760 px `:368`; `.push-control` fixed in every ADMIN screen `:342`; `.update-banner` fixed `:444`.
- Arithmetic from the CSS and from the measurements written in `src/app/styles.test.tsx:106-108`: at 760 px wide or less the top bar is 60 px and the alerts bar 68 px plus 18 px; between 521 and 760 px the section bar adds about 60 px. A phone in landscape (about 640 by 360 CSS px) keeps roughly 206 px of fixed chrome and 154 px for the content. A desktop at 400 % zoom (1280 by 720 becomes 320 by 180 CSS px) keeps the top bar (60 px) and the alerts bar (64 px plus 9 px): about 133 px of 180.
- `scroll-padding` already protects focus from the bars (`styles.css:35-36`, `:375`, `:403`), so 2.4.11 is probably met in portrait; the failure mode is reflow.
- Fix: stop pinning the alerts bar. It is a setting used once per device and company, not something that must be visible on every screen; put it in the page (for example in Bandeja or in a settings place) and keep `aria-label="Avisos de la aplicación"`. Unpin the bars when the viewport is short: `@media (max-height: 480px) { .topbar, .sidebar { position: static } }`.

**F-11. Popovers with a fixed width anchored to the right can leave the screen, and the ADMIN top bar does not wrap between 401 and 520 px.** WCAG 1.4.10 Reflow (AA). Severity: **medium**. `[render]`
- `.install-help` is 260 px wide, absolute, `right: 0` of its button (`styles.css:164`). Only the employee header makes it fixed and full width (`:332`); in the ADMIN header at 520 px or less it can extend past the left edge, where it cannot be scrolled into view.
- `.company-switch-status` and `.company-switch-error` are up to `min(300px, 80vw)` wide with `right: 0` (`:161-162`): same risk when the select is not at the right edge.
- Between 401 and 520 px the top bar is one row with a fixed height and no wrap (`:153`). An ADMIN with two companies and the app not installed has the brand, "Cómo instalar", a 108 px select and "Cerrar sesión" in that row.
- Fix: apply the `:332` rule to every header, not only `.employee-frame`; let the top bar wrap at any width (`height: auto; min-height`), as `:422` already does at 400 px or less.

**F-12. Most of the interface is set at 14 px, with labels and table headers at 12 and 13 px, and body text has no line height.** Best practice (WCAG has no minimum size; 1.4.4 and 1.4.12 are about not breaking when the user changes it). Severity: **medium**. `[code]`
- For readers aged 45 to 65 on small, cheap screens: body, labels and buttons at 16 px (1rem); 14 px as the floor for secondary text; nothing at 12 or 13 px. `body { line-height: 1.5 }`.
- Replace capital letters in strings by sentence case (if a caps style is wanted, apply it in CSS so screen readers and translation tools get real words), and drop the negative letter spacing of `h1` (`styles.css:45`).
- Keep `rem` and keep inputs at 16 px: under 16 px iOS zooms the page when a field takes focus.

**F-13. A long company name is cut or missing on a phone.** COGA (orientation: "¿Dónde estoy?"). Severity: **low**. `[code]`
- `styles.css:365-366`, `:398-399`. At 520 px or less a person with one company sees no company name anywhere; with several, the select shows about 10 characters. Text that cannot wrap can also overflow: a motive of up to 4000 characters in `.reason-line` has no `overflow-wrap` (`styles.css:264`, `src/features/admin/AdminViewsRender.tsx:110`).
- Fix: show the company name in the page heading, where it can wrap; add `overflow-wrap: anywhere` to free text written by people.

**F-14. In forced-colours mode the selected, pressed and current states disappear.** Best practice (and WCAG 1.4.11 when the state has no other cue). Severity: **low**. `[render]`
- `styles.css:436-441` covers focus, chips and the spinner. Backgrounds are dropped in that mode, and F-01's states are backgrounds. The border and check mark proposed in F-01 fix this too.

**F-15. The iOS status bar may be unreadable in the installed app.** Best practice. Severity: **low**. `[render]`
- `index.html:9` sets `apple-mobile-web-app-status-bar-style` to `black-translucent`: iOS draws the clock and battery in white over the page. The page there is a white bar (`styles.css:153`) or a pale gradient (`:56`). Check on an iPhone with the app installed; `default` keeps dark text on a light bar.

**No defect found by reading the code** in: zoom blocking (1.4.4), orientation lock (1.3.4), images of text (1.4.5), motion (2.3.x, 2.2.2: the spinner is the only animation), text in `rem`.

---

## 3. Targets

Sizes below come from the CSS; none was measured on a screen. `[render]` for all of section 3.

| Control | Declared size | Where | 2.5.8 (24 px, AA) | 44 px goal (S9) |
|---|---|---|---|---|
| `.button` | min-height 44; width by content | `styles.css:121` | meets | meets |
| `.button-small` | min 44 by 44 | `styles.css:131` (tested at `src/app/styles.test.tsx:91-94`) | meets | meets |
| `.button-wide`, `.employee-next-action` | 48 and 56 high | `styles.css:132`, `:306` | meets | meets |
| Text inputs, selects, date and time inputs | min-height 44; 48 in the auth card | `styles.css:98`, `:103` | meets | meets |
| `.nav-link` | min-height 44 | `styles.css:169`, `:371` | meets | meets |
| Checkbox in `.check-grid` and `.inline-checks` | box 24 by 24 inside a label of min-height 44 | `styles.css:206-207` | meets | meets (the label is the target) |
| Radio in `.employee-category-option` | 22 by 22 inside a label of min-height 44 | `styles.css:320-322` | meets | meets |
| `summary` of `.fold` and `.site-location-manual` | min-height 44 | `styles.css:82`, `:447` | meets | meets |
| `.company-choice`, `.journey-option`, `.mark-action` | padding plus two lines; 44 or more | `styles.css:145`, `:298`, `:310` | meets | meets |
| Map zoom buttons | 44 by 44 (overrides Leaflet's 30) | `styles.css:90` | meets | meets |
| **"Confirmo que este punto corresponde a la sede." checkbox** | box 18 by 18; label with no min-height (one line is about 21 px) | `styles.css:77-78`, `src/features/admin/AdminViewsRender.tsx:182, 217` | by the spacing exception only | **misses** |
| **"Activo" checkbox in the employees table** | box 24 by 24; label with no min-height | `styles.css:216`, `src/features/admin/EmployeesViewRender.tsx:65` | meets at exactly 24 | **misses** |
| **Brand link** | 34 high; 30 at 520 px or less | `styles.css:155`, `:395`, `src/app/ui.tsx:33` | meets | **misses** |
| **Link "Revisar este punto en el mapa"** | one line of 14 px text, about 20 px | `src/features/admin/AdminViewsRender.tsx:178, 213` | by the spacing exception only | **misses** |
| Leaflet attribution links | inline in a sentence | Leaflet stylesheet | exempt (inline) | not applicable |

**Spacing between neighbours**: `.button-row` 9 px (`styles.css:133`); `.deviation-actions` 6 px (`:265`); `.topbar-actions` 6 to 12 px (`:156`, `:363`, `:396`); `.sidebar nav` 4 to 5 px (`:168`, `:370`); `.check-grid` 9 by 15 px (`:205`).

**F-16. Four targets are under 44 px.** WCAG 2.5.8 Target Size (Minimum) (AA) is met by size or by the spacing exception as far as the CSS shows; the 44 px goal of S9 is not. Severity: **low**. `[render]`
- Fix: give `.site-location-confirmation` `min-height: var(--tap-target)` and a 24 px box like every other checkbox; wrap the table's "Activo" in `.inline-checks`; make the link a `.button button-quiet`; give the brand link `min-height: var(--tap-target)`.

**F-17. Checkboxes inside a `fieldset.field` inherit the text field's box.** Best practice. Severity: **low**. `[render]`
- `.field input` (`styles.css:97-98`) sets `width: 100%`, `min-height: 44px`, a border and `padding: 9px 12px` on **every** input in a `.field`, checkboxes included. `input[type=checkbox]` (`:207`) comes later with the same specificity and resets width and height, but `min-height`, padding and border stay. The radios were patched one by one (`:322`: `min-height: 0; padding: 0`) and so were table checkboxes (`:216`). Still affected: weekdays and people in `src/features/admin/WorkDaysForm.tsx:47, 60-61`, "Locales donde trabaja" in `EmployeesViewRender.tsx:76, 107`, and `ScheduleEditor.tsx:120`.
- Fix: scope the rule to text-like controls (`.field :is(input:not([type=checkbox], [type=radio]), select, textarea)`) and delete the two patches.

**F-18. Opposite actions sit 6 px apart and act on one tap.** COGA (prevent errors); WCAG 3.3.4 is met because the action can be reversed. Severity: counted in F-24.
- "Justificado" and "No justificado" in `src/features/admin/AdminViewsRender.tsx:116-117` with `styles.css:265`.

---

## 4. Keyboard and focus

### 4.1 Facts

- **Everything interactive is a native control**: `button`, `a`, `input`, `select`, `textarea`, `summary`. No `onClick` on a `div` or `span` was found. The two `tabIndex={-1}` containers are focus destinations, not controls (`src/features/employee/EmployeeViews.tsx:46, 61`; `src/features/admin/EmployeesViewRender.tsx:21`).
- **Focus is visible**: `:focus-visible { outline: 3px solid var(--focus); outline-offset: 3px }` for everything (`styles.css:107-113`), 2 px with 1 px offset on fields (`:114-118`), and a white halo on the primary button (`:119`). Ratios in section 1 (8.49:1 to 9.15:1). `outline: 0` at `:98` is replaced by those rules; `.mark-feedback:focus { outline: none }` (`:442`) only affects the two programmatic destinations.
- **There are no modal dialogs.** Every confirmation and every form is inline. So there is no focus trap to get wrong and no dialog that cannot be closed (S11).
- **Tab order follows the source order**, which matches the visual order, except for the two fixed elements in F-36.
- **No skip link** (F-25). **The page title never changes** (F-19).

### 4.2 Findings

**F-03. Forms open away from the button that opens them, and focus does not follow.** WCAG 2.4.3 Focus Order (A); COGA (make it clear what happened). Severity: **high**. `[code]` for the order and the missing focus move, `[render]` for "off screen".
- **Employee, "Corregir motivo" and "Agregar motivo"** (`src/features/employee/EmployeeViews.tsx:162-163`). The buttons are in the panel "Desvíos del día". The form they open is rendered in the panel **above**, "Para explicar" (`src/features/employee/EmployeeApp.tsx:267` builds the list, `:290-293` renders `MotivePanel` before `DeviationsPanel`). `startMotiveEdit` (`:258-262`) neither scrolls nor moves focus, and the button that was tapped is removed (`EmployeeViews.tsx:162`: `!editingIds.includes(item.id)`). On a phone the person taps the button, it vanishes, and the form is somewhere above the screen. Keyboard focus is lost with the button.
- **ADMIN, "Corregir" and "Anular" on a mark** (`src/features/admin/AdminViewsRender.tsx:300`). The forms are rendered after the whole list or table of marks (`:353-362`), with no scroll and no focus move (`src/features/admin/AdminViews.tsx:870, 886`). With six marks on a phone the form opens below the screen.
- Fix: render each form in place, next to its trigger (the pattern "Cambiar ubicación" already uses, `AdminViewsRender.tsx:164-165`, and the pattern of the schedule card slot, `ScheduleEditor.tsx:155-156`), and move focus to the form's first field. When a form closes, return focus to the button that opened it.

**F-19. Changing section or screen changes neither the page title nor the focus.** WCAG 2.4.2 Page Titled (A) and 2.4.3 Focus Order (A). Severity: **medium**. `[code]`
- The title is always "Fichaje Braja" (`index.html:12`); no code sets `document.title`.
- `navigate()` swaps the content of `<main>` (`src/features/admin/AdminApp.tsx:59-64`). From the menu, focus stays on the menu button, which is acceptable. From inside the content it is lost, because the button that was pressed is unmounted: "Ir" in the setup guide (`src/features/admin/FirstSteps.tsx:25`), "Ver jornada" in a case (`AdminViewsRender.tsx:113`), "Cargar días" in the notice on Bandeja (`AdminApp.tsx:101`), "Asignar horario" and "Revisar horarios" in a load result (`WorkDaysForm.tsx:82, 84`). The same happens on every whole-screen swap in `src/app/App.tsx:18-23`: after login, after the password change, after choosing a company, and when the session ends.
- One place does it right: "Cargar días" on Jornadas focuses the first control of the form (`AdminApp.tsx:71-75`).
- Fix: on every section or screen change, set `document.title` ("Bandeja · Fichaje Braja") and move focus to the `h1` (give it `tabIndex={-1}`); a screen reader then reads the new heading.

**F-20. Choosing a company in the select switches the whole application at once.** WCAG 3.2.2 On Input (A). Severity: **medium**. `[code]`
- `src/app/ui.tsx:63`: `onChange` calls `activateCompany`; `src/app/App.tsx:23` remounts the application by `key`. With a keyboard on Windows, each arrow key on a closed select changes its value, so moving through the list switches company at every step; any unsaved form is discarded without a question.
- Fix: a select plus a "Cambiar" button, or the list of buttons the "Elegí una empresa" screen already uses (`src/features/auth/AuthScreens.tsx:54-56`).

**F-27. Focus is lost when an inline step closes.** WCAG 2.4.3 (A). Severity: **low**. `[code]`
- "No, seguir trabajando" and "Volver" unmount the step with `setStep(null)` and focus goes to the page (`src/features/employee/EmployeeApp.tsx:287`). After "Crear horario" the form is replaced by the assignment step (`src/features/admin/SchedulesView.tsx:86, 146`). After "Cancelar" in any ADMIN inline form.
- Fix: return focus to the control that opened the step, or to the heading of what replaced it.

**F-25. There is no skip link.** Best practice; WCAG 2.4.1 Bypass Blocks (A) is plausibly met by the landmarks (section 5). Severity: **low**. `[code]`
- An ADMIN using a keyboard passes the brand link, "Cómo instalar", the company select, "Cerrar sesión" and seven menu buttons before the content (`src/app/ui.tsx:32-36`, `AdminApp.tsx:91-97`).
- Fix: a first link "Ir al contenido" to `<main id="contenido" tabindex="-1">`, visible on focus.

**F-23 (part). The map cannot be operated fully without a pointer or without dragging.** WCAG 2.1.1 Keyboard (A) is met through alternatives; 2.5.7 Dragging Movements (AA) needs a rendered check. Severity: **medium**. `[render]`
- `src/features/admin/SiteMapPicker.tsx:27`: the point is placed by a click on the map. Leaflet's keyboard support pans and zooms but cannot place a point. Alternatives exist in the same panel: choosing a search result places the point (`src/features/admin/SiteMapPanel.tsx:34-36`) and "Escribir las coordenadas a mano" (`AdminViewsRender.tsx:184-190`). Moving the map with one finger is a drag; the alternatives without dragging are the search and the zoom buttons.
- `role="application"` on the map (`SiteMapPicker.tsx:56`) turns off a screen reader's reading keys inside it.
- Fix: keep both alternatives and say so next to the map ("Si no podés tocar el mapa, buscá la dirección y elegí un resultado"); try `role="group"` or `role="region"` with the same label and test with TalkBack and NVDA.

**F-26. The install help has no keyboard way to close other than its button.** Best practice. Severity: **low**. `[code]`
- `src/device/pwa/InstallControl.tsx:27-30`: no Escape, no close on outside tap; it covers content under the header.

---

## 5. Names, roles, states

### 5.1 Facts

- `lang="es-AR"` (`index.html:2`); the manifest too (`vite.config.ts:25`).
- **Labels**: every field goes through `FormField` (`src/app/ui.tsx:75-92`), which ties `<label for>` to the control and links hint and error with `aria-describedby`; the error also sets `aria-invalid`. Fields edited inside table cells carry an `aria-label` that starts with the visible words (`src/features/admin/EmployeesViewRender.tsx:62-65`), so voice control works (2.5.3). Groups use `fieldset` and `legend` throughout.
- **Buttons with a short visible name carry a longer accessible one that starts with it**: "Ir" is "Ir a Sedes: Tu local" (`FirstSteps.tsx:25`), "Corregir" is "Corregir marca Ingreso de …" (`AdminViewsRender.tsx:300`), "Editar", "Horarios", "Ver marcas", "Ver jornada".
- **No button is named by a glyph alone.** Every glyph is `aria-hidden` (`AdminApp.tsx:81`, `EmployeeViews.tsx:50, 70, 80`, `AuthScreens.tsx:55`, `InstallControl.tsx:30`), tested in `src/features/admin/AccessibilityBase.test.tsx:46-68`.
- **Headings**: one `h1` per screen. Auth: "Bienvenido", "Elegí una empresa", "Cambiá tu contraseña". Employee: "Hola, {nombre}" then `h2` per panel. ADMIN: "Bandeja de desvíos", "Jornadas", "Historial", "Sedes", "Horarios", "Empleados", "Primeros pasos", then `h2` per panel and `h3` inside. No level is skipped. While the ADMIN start section is being decided there is no `h1` (`AdminApp.tsx:98`).
- **Landmarks**: `header` (banner), `nav aria-label="Navegación principal"` inside an `aside`, `main`, `aside aria-label="Avisos de la aplicación"`. Every `Panel` is a `section` named by its `h2` (`ui.tsx:20-23`).
- **States**: `aria-current="page"` on the menu (`AdminApp.tsx:80`); `aria-pressed` on the show-password button, the shift picker, the schedule types and the quick choices; `aria-expanded` with `aria-controls` on the two history buttons (`AdminViewsRender.tsx:164, 381`) and `aria-expanded` on "Cómo instalar"; native `details`.
- **Status messages**: `PageMessage` is `role="alert"` for errors and a pre-mounted `role="status"` for the rest (`ui.tsx:9-14`); `Loading` is `role="status"` (`ui.tsx:16-18`); busy forms set `aria-busy`.
- **Input purpose**: `autoComplete="username"` with `inputMode="numeric"` on the DNI, `current-password` and `new-password` on the passwords (`AuthScreens.tsx:33-34, 89-91`).

### 5.2 Findings

**F-22. Icons are Unicode characters.** COGA (use clear, familiar symbols); robustness. Severity: **medium**. `[render]`
- Menu: `'✓' '◷' '▦' '☰' '⌖' '▤' '♙'` (`src/features/admin/AdminApp.tsx:13-20`). Employee: `'◷'` for the schedule and for every secondary mark (`EmployeeViews.tsx:70, 80`). Also `'!'`, `'↗'`, `'⌖'`, `'→'`, `'✔'`, `'▸'`, `'▾'`.
- Two problems. They are drawn with whatever font the phone has, so a cheap Android may show an empty box or a coloured emoji. And several mean something else: "☰" is the universal "menu" icon and here it labels "Historial"; "♙" is a chess pawn for "Empleados"; "◷" labels both "Bandeja" and the clock.
- They are hidden from assistive technology and every one sits next to a word, so nothing is lost if they are removed.
- Fix: inline SVG icons in the bundle (the content security policy allows same-origin only) or no icons; never an icon that contradicts its word.

**F-28. The brand link goes nowhere and its text is read as one word.** WCAG 2.4.4 Link Purpose (In Context) (A). Severity: **low**. `[code]`
- `src/app/ui.tsx:33`: `href="#inicio"` and `aria-label="Fichaje Braja, inicio"`. No element has `id="inicio"`; activating it only changes the address. On the auth screens the brand is "B" plus "Fichaje" plus "Braja" with no space between the spans (`AuthScreens.tsx:28, 50, 84`), read as "BFichajeBraja".
- Fix: make it a button or link that really goes to the start (Bandeja, or today for the employee), or plain text. Hide the "B" mark and put a real space between the words.

**F-29. "Primeros pasos" moves from the top of the menu to the bottom when the setup is complete.** WCAG 3.2.3 Consistent Navigation (AA). Severity: **low**. `[code]`
- `src/features/admin/AdminApp.tsx:92` and `:96`. The change is not started by the user.
- Fix: one fixed position. If it should stop being prominent, change its emphasis, not its place.

**F-30. Small structure gaps.** WCAG 1.3.1 Info and Relationships (A) and 4.1.2 Name, Role, Value (A). Severity: **low**. `[code]`, effect on assistive technology `[render]`
- An `h2` inside a `summary` (`AdminViewsRender.tsx:311`): some screen readers treat `summary` as a button and drop the heading.
- Lists with `list-style: none` (`styles.css:86, 194, 233, 457`): Safari with VoiceOver stops announcing them as lists unless `role="list"` is set.
- Tables have no name (`AdminViewsRender.tsx:332, 350`; `EmployeesViewRender.tsx:58`): add `aria-labelledby` pointing at the panel heading. Header cells are in `thead`, which is enough for these simple tables.
- Each motive card is an unnamed `form` (`EmployeeViews.tsx:128`); with several pending there are several identical forms. Name each one by its title.
- The menu is a `nav` of buttons with two caption `div`s between them (`AdminApp.tsx:90-96`): a list would give the count; the captions are not headings.
- The scrolling table wrapper is not focusable (`styles.css:209`): add `tabindex="0"`, `role="region"` and a name when it can scroll.

**F-31. Some status messages may not be announced, and one may be announced twice.** WCAG 4.1.3 Status Messages (AA). Severity: **low**. `[render]`
- A `role="status"` that is inserted already holding its text is not announced reliably; `PageMessage` knows it (`ui.tsx:4-8`) and mounts empty first. These do not: `Loading` (`ui.tsx:17`), "Entrando, esperá un momento…" (`AuthScreens.tsx:31`), "Guardando tu contraseña…" (`:87`), "Enviando tu marca… esperá un momento." (`EmployeeViews.tsx:73`), "Enviando lo que escribiste…" (`:148`), the company switch status (`ui.tsx:66`).
- After a mark, focus moves to a container that holds a live region (`EmployeeViews.tsx:46-52`): a screen reader may read the result twice.
- Fix: one helper for transient status that follows the `PageMessage` pattern; test with TalkBack and NVDA.

**F-32. A date error on Jornadas is shown as an ordinary hint.** WCAG 3.3.1 Error Identification (A) is met in text; best practice for the visual part. Severity: **low**. `[code]`
- `AdminViewsRender.tsx:324`: `hint={dateError || undefined}` with `aria-invalid`. It is grey like a hint. Use `FormField`'s `error` prop.

---

## 6. Forms and errors

### 6.1 Facts

| Topic | State | Where |
|---|---|---|
| Required indicator | None is visible. `required` is set on many inputs; no asterisk, no "(obligatorio)". "Opcional." appears once, in a hint. | `AdminViewsRender.tsx:207` |
| When validation happens | On submit everywhere. No error appears while typing. | all forms |
| Two validation systems | Custom messages (forms with `noValidate`): password change, motive, schedule editor, work days, filters. Browser bubbles (no `noValidate`): login, create site, edit location, create employee, single day, assign schedule, added mark, mark correction, cancel, void, classification correction. | `AuthScreens.tsx:32, 88`; `AdminViewsRender.tsx:119, 165, 197, 313, 340, 353, 357, 363`; `EmployeesViewRender.tsx:99, 126` |
| Errors tied to fields | Motive card (`EmployeeViews.tsx:131-142`), schedule editor (`ScheduleEditor.tsx:55-71`), work days dates (`WorkDaysForm.tsx:53-54, 72`). Everywhere else one message for the whole form. | as listed |
| Error summary | The schedule editor adds "Revisá lo que está marcado debajo de cada campo." above its buttons. | `ScheduleEditor.tsx:88` |
| Confirmation of consequential actions | Early exit asks first (`src/features/employee/employeeDay.ts:100-104`). Cancel a day, void a mark and reset a password are two steps, and the first two ask for a reason (`AdminViewsRender.tsx:340-343, 353-356`; `EmployeesViewRender.tsx:47-50`). Classifying is one tap and can be corrected with a reason (`AdminViewsRender.tsx:114-122`). | as listed |
| What typed text survives a failure | A motive that fails to send stays in the card (`EmployeeApp.tsx:251-253`). A site form keeps its values. | as listed |
| Authentication (3.3.8) | No cognitive test. Paste is not blocked (no `onPaste` in the source). `autocomplete` is set, so password managers work. A show-password button exists. | `AuthScreens.tsx:9-11, 33-35` |
| Double submission | Buttons are disabled while busy; a mark retry reuses its idempotency key and the message says so ("no se marca dos veces"). | `src/features/employee/employeeMessages.ts:7` |

### 6.2 Findings

**F-02. ADMIN errors and confirmations appear at the top of the page, not where the person is.** WCAG 3.3.1 Error Identification (A): the error is in text and is announced, so the criterion is arguably met for a screen reader user; a sighted person does not see it. COGA (feedback next to the action). Severity: **high**. `[code]` for the position, `[render]` for "off screen".
- Empleados: messages at the top (`src/features/admin/EmployeesViewRender.tsx:94-95`); the form "Dar de alta un empleado" is the last panel, under the whole list (`:99-110`). A failed "Crear empleado" shows its error above the list (`src/features/admin/AdminViews.tsx:685`).
- Sedes: messages at the top (`AdminViewsRender.tsx:160-161`); "Agregar sede" is the second column, under the list on a phone (`:197-232`). Nine validation messages of the two location forms go to that top slot (`AdminViews.tsx:517-534, 557-578`).
- Bandeja: the result of classifying goes to the top (`AdminViewsRender.tsx:82-83`; `AdminViews.tsx:155-156`). On success the card itself changes; on failure the button returns from "Guardando…" to its label and nothing else changes where the person is looking.
- Jornadas: with a day open, messages go to the top of its panel (`AdminViewsRender.tsx:336`); "Agregar una marca que faltó" is at the bottom of that panel (`:363-369`).
- Fix: show each form's result inside the form, next to its submit button; show each card's result inside the card. Keep the live region (the announcement is already right). A page-level message is for page-level events only (load failed).

**F-04. The ADMIN session ends without warning and the work in progress is lost.** WCAG 2.2.1 Timing Adjustable (A). Severity: **high**. `[code]`
- The server ends an ADMIN session after 30 idle minutes (root `CLAUDE.md`, rule 23; a fixed rule, not to be changed here). The frontend learns of it only on the next request: a 401 clears the session (`src/app/session.tsx:41-44`) and `src/app/App.tsx:19` replaces the whole application by the login screen with "Tu sesión venció. Iniciá sesión nuevamente." Everything typed is in component state and is discarded.
- This is the user in the brief: an owner who starts a schedule or a reason, serves customers for half an hour, comes back and presses "Guardar".
- 2.2.1 asks that the person be warned before the limit and can extend it with a simple action, unless the limit is essential or longer than 20 hours. Nothing warns and nothing extends. Whether a 30 minute security timeout counts as "essential" is a judgement for the product owner; the loss of data is avoidable either way.
- Fix, frontend only, no storage (rule 27) and no change to the server rule: (1) keep the time of the last successful request in memory and, at about 25 minutes, show an inline notice with a "Seguir conectado" button that makes one cheap request (`GET /session`); (2) when a 401 arrives, do not unmount the application: show the login over it and, after a successful login as the same account, return to the same screen with the form intact; (3) say what happened to the unsaved action, as the employee flow already does for a mark ("Tu marca todavía no se guardó.", `src/features/auth/interruptedMark.ts:7`).
- The employee session lasts 30 days and an interrupted mark is already explained, so the employee side is not affected.

**F-05. A server validation error does not say which field or what to do.** WCAG 3.3.1 Error Identification (A) and 3.3.3 Error Suggestion (AA). Severity: **high**. `[code]`
- `src/shared/api/client.ts:81`: every 422 without one of three known codes becomes "Revisá los datos ingresados.". The API returns a `code` and no field (the client reads only `status` and `code`, `client.ts:229-235`), so the screen cannot point at a field.
- Reachable from: create employee (the DNI field checks only its length, `EmployeesViewRender.tsx:101`, so letters reach the server; a name the server cleans to nothing), edit employee (the edit row has no client validation at all: `EmployeesViewRender.tsx:62-64`), create site, single day, added and corrected marks.
- Fix inside the frontend's authority: validate on the client everything the server validates, with a message per field (the rules are known: DNI of 7 to 12 digits, tolerance 0 to 240, name up to 160, radius 50 to 500, password 12 to 72), so the generic message becomes a last resort; when it does appear, write it per form ("No pudimos guardar el empleado. Revisá el DNI (solo números, 7 a 12) y el nombre.").
- A field-level error from the server would be an API change: outside this task (S2); record it as a proposal if wanted.

**F-09. Required fields are not marked, two validation styles coexist, and several submit buttons are disabled without saying why.** WCAG 3.3.2 Labels or Instructions (A) for the missing indication; COGA for the rest. Severity: **medium**. `[code]`
- Required but unmarked: every `required` input listed in 6.1.
- Browser validation bubbles are written by the browser in its own language and wording, disappear after a few seconds, are styled differently from the rest of the application, and sit beside custom messages in other forms of the same screen.
- Disabled with no reason given: "Guardar corrección" until a reason is typed (`AdminViewsRender.tsx:121`), "Confirmar cancelación" (`:342`), "Confirmar anulación" (`:355`), "Guardar corrección de marca" (`:361`), "Agregar marca" (`:368`), "Asignar horario" (`EmployeesViewRender.tsx:129`), "Asignar" (`ScheduleEditor.tsx:124`), "Cargar este día" (`AdminViewsRender.tsx:320`), "Confirmar ubicación" (`SiteMapPanel.tsx:45`), "Guardar" in an employee row with no site ticked (`EmployeesViewRender.tsx:55`). A disabled button gives no error, is skipped by the keyboard, and is 32 % paler (section 1.5). The validation messages written for the empty reason can never appear (`AdminViews.tsx:863, 879, 890, 910`).
- The right pattern exists twice: "Crear empleado" and "Restablecer contraseña" explain why they are disabled with `aria-describedby` and visible text (`EmployeesViewRender.tsx:53-54, 108-109`).
- Fix: one validation system (`noValidate` plus `FormField` errors) for every form; mark the few optional fields "(opcional)" instead of marking the many required ones; keep submit buttons enabled and answer a press with the field's message, or keep them disabled only with the visible reason next to them.

**F-07. A first login asks for about 62 characters of password typing.** COGA (do not rely on memory or transcription). WCAG 3.3.7 Redundant Entry (A) is probably met through its security exception. Severity: **high**. `[code]`
- The provisional password is four groups of four characters with dashes, 19 characters, mixed case (`src/features/admin/temporaryPassword.ts:1-22`). The employee types it on the login screen, then again as "Contraseña que te dieron" on the next screen (`src/features/auth/AuthScreens.tsx:89`), then a new one of at least 12 characters twice (`:90-91`). 19 + 19 + 12 + 12 = 62, on a phone keyboard, switching case.
- The 12 character minimum is a rule (D-20261102-04) and stays. What already helps: the alphabet avoids look-alike characters, "Puede ser una frase." (`src/shared/password.ts:10`), the counter "Llevás 5 de 12." (`AuthScreens.tsx:62-64`), the show button.
- Proposals, **pending the owner's approval** because they touch credentials: (a) carry the provisional password from the login step to the change step in memory, so it is typed once (the API still receives `currentPassword`; nothing is stored); (b) replace "Repetí la nueva contraseña" by the password shown by default on this screen, since a confirmation field exists to catch typing errors the person cannot see; (c) accept the provisional password without dashes and in any case, which would be a server change and therefore outside this task.

**F-21. Controls that do not look like controls.** COGA (clearly identify controls). Severity: **medium**. `[code]`
- The link "Revisar este punto en el mapa" (`AdminViewsRender.tsx:178, 213`) has the colour and weight of the text around it and no underline, because of `a { color: inherit; text-decoration: none }` (`styles.css:42`). It also opens a new tab without saying so.
- `.button-quiet` on a white panel: fill 1.06:1, border 1.21:1 (section 1.5). "Corregir motivo", "Ver jornada", "Editar", "Horarios", "Reintentar" look like grey text.
- Fix: links underlined; a secondary button with a border of at least 3:1 (the input border `#5c6d62` is 5.50:1 and would make buttons and fields look alike, so choose with the design system); say "(se abre en otra pestaña)".

**F-24. Consequences that are unclear, or expensive to undo.** COGA (prevent errors, make consequences clear). WCAG 3.3.4 Error Prevention (AA) is met where the action is reversible or confirmed. Severity: **medium**. `[code]`
- "Cerrar sesión" is always in the header, 6 to 12 px from its neighbour, and acts at once (`src/app/ui.tsx:35`). For an employee, coming back costs the DNI and a password of 12 or more characters. Move it away from frequent controls (the end of the page, or behind the person's name). This does not need a confirmation step (S6).
- The "Activo" checkbox in an employee row (`EmployeesViewRender.tsx:65, 78`) removes access on "Guardar" with no word about what it does. One line next to it: "Si lo desmarcás, no puede entrar ni marcar. Su historial se conserva."
- "Cargar días" creates up to 31 days for every person selected with one press (`WorkDaysForm.tsx:73`). The preview sentence is the right safeguard ("Vas a cargar 22 días (lunes a sábado, del 10 al 30 de noviembre) para 4 personas.", `src/features/admin/workDays.ts:134`). Undoing a mistake is one day at a time ("abrilo en la lista de abajo, cancelalo y cargalo de nuevo", `AdminViewsRender.tsx:312`). Say it before the button, not only in another panel.
- "Justificado" and "No justificado" are 6 px apart and act on one tap (F-18). Reversible, with a reason. More room between them is enough.
- The employee cannot undo a mark, and no message says who can. After a mark, one line: "¿Marcaste por error? Avisale a tu encargado."

**F-33. Messages that do not say what to do next, or point the wrong way.** WCAG 3.3.3 Error Suggestion (AA); COGA. Severity: **medium**. `[code]`
- `src/shared/api/client.ts:89`: every unmapped status, including a server error, says "No se pudo completar la operación. Revisá tu conexión y reintentá." The connection worked.
- `:79`: "La información cambió o la acción ya fue procesada. Actualizá la vista." There is no control called "Actualizá la vista"; the button is "Actualizar" and not every screen has one.
- `:77`: "No tenés permiso para realizar esta acción." No next step.
- `:56`: "Esta persona también tiene acceso en otra empresa o como ADMIN; su contraseña la restablece el operador." "ADMIN" and "el operador" are not words the owner knows; who is the operator?
- `:44`: "El estado de la jornada cambió y esa marca ya no corresponde. Revisá el estado actualizado." The employee version of the same event is clearer: "Tu día cambió y esa marca ya no corresponde. Te mostramos cómo está ahora." (`src/features/employee/employeeMessages.ts:16`).
- `AdminViewsRender.tsx:84`: "No se pudieron cargar las zonas horarias de las sedes: … Las horas se muestran en la zona horaria de este dispositivo."
- The employee messages are the model to copy: each says what happened, whether the mark was saved, and what to tap (`employeeMessages.ts:7-33`).

**No defect found by reading the code** in 3.3.8 Accessible Authentication (Minimum) (AA): no puzzle, no blocked paste, password managers supported, show-password present. 3.2.6 Consistent Help (A): the only help is "¿Te olvidaste la clave? Pedile al encargado una nueva." on the login screen (`AuthScreens.tsx:38`), so nothing can be inconsistent; it does not tell an owner what to do.

---

## 7. Colour-only and sensory

| Item | Colour only? | Where | Note |
|---|---|---|---|
| Status chips | No: each has a word ("Falta motivo", "A revisar", "Justificado", "No justificado", "Sin ingreso", "En curso", "En pausa", "Finalizada", "Cancelada", "Inactivo") | `styles.css:245-254`; `src/shared/format.ts:3-9`; `AdminViewsRender.tsx:472` | Keep the word in every chip |
| Setup step state | No: "Listo", "Falta", "Revisalo" | `FirstSteps.tsx:24` | The step chips reuse `status-justificado` and `status-motivo_pendiente`, the deviation classes; give them their own |
| Voided marks | No: struck through and labelled "Anulada" | `EmployeeViews.tsx:86-87`; `AdminViewsRender.tsx:346-351` | |
| Field errors | No: text; red and weight 650 only reinforce it | `styles.css:69, 324` | Add a prefix ("Error:") or an icon so the message differs from a hint in more than colour |
| Messages (info, error, success) | Almost: the text says what happened, but the three kinds differ only in tint; only the employee success adds "✔" | `styles.css:140-142`; `EmployeeViews.tsx:50, 110` | Give each kind a visible mark |
| Selected, pressed, current | **Yes, and under 3:1** | F-01 | |
| The case opened from a notification | **Yes, and under 3:1** | F-39 below | |
| Required fields | Not indicated at all | F-09 | |
| Links | No cue at all | F-21 | |
| Map point and radius | Shape and position; the hint says it in words ("Punto marcado. El círculo muestra los 100 m permitidos para marcar.") | `SiteMapPanel.tsx:38-40` | Coordinates are also printed as text |
| "Conexión protegida" dot | Decorative, next to its text | `AdminApp.tsx:96` | |

No instruction relies on shape, position or sound alone (1.3.3). "abrilo en la lista de abajo" (`AdminViewsRender.tsx:312`) uses position together with a name.

**F-39. The case opened from a notification is marked only by a pale tint, and focus does not go to it.** WCAG 1.4.11 (AA) and 1.4.1 Use of Color (A). Severity: **low**, because the path looks dormant: the notification always opens `/admin` with no `deviation` parameter (`src/device/push/safeNotification.ts:57`), while the screen reads `?deviation=` (`src/features/admin/AdminViews.tsx:107`). `[code]`
- `styles.css:257`: border 1.53:1, fill 1.02:1. The message "Abriste el desvío indicado por la notificación." (`AdminViewsRender.tsx:85`) does not say which one.
- Fix: if the path is kept, use the selected style of F-01, a visible label on the card, and move focus to it.

---

## 8. Cognitive barriers

All COGA unless a criterion is named. These are what automated checks do not see. The vocabulary proposal itself belongs to the information architecture work (T2, assumption A1 in the task file); this section records the evidence.

**F-06. One thing, several names; and two glossaries, one per role.** COGA (use clear words, be consistent). Partly WCAG 3.2.4 Consistent Identification (AA) where the same function has different labels. Severity: **high**. `[code]`

| Concept | Names on screen | Where |
|---|---|---|
| The shop | "Sedes", "sede", "Local", "local", "Nombre de la sede" next to "¿Dónde queda el local?" in the same form | `AdminApp.tsx:19`; `AdminViewsRender.tsx:198-200, 314` |
| A working day | "Jornadas", "día", "días de trabajo", "turno" ("Elegí tu turno", "No hay turno cargado ese día"), "Ver jornada" next to "Cargar días" | `AdminApp.tsx:16`; `AdminViewsRender.tsx:305`; `EmployeeViews.tsx:36`; `EmployeeApp.tsx:270` |
| The marks | Employee: "Entrada", "Salida", "Salida a desayunar". ADMIN: "Ingreso", "Egreso", "Salida desayuno" | `src/features/employee/employeeDay.ts:9-12`; `AdminViewsRender.tsx:470` |
| What went wrong | Employee: "Faltó la entrada", "Faltó la salida", "Desayuno largo", "Fuera del local". ADMIN: "Sin ingreso", "Egreso sin marcar", "Exceso de desayuno", "Fuera de sede" | `employeeDay.ts:152-155`; `AdminViewsRender.tsx:471` |
| Its state | Employee: "Falta explicar". ADMIN: "Falta motivo" | `EmployeeViews.tsx:25-27`; `AdminViewsRender.tsx:472` |
| The thing reviewed | "desvíos", "casos" ("Bandeja de desvíos", "Casos recientes", "resolvé cada caso") | `AdminViewsRender.tsx:81, 88` |
| Notices | "Alertas en este dispositivo", "Activar avisos", "avisos push", "notificaciones" | `src/device/push/AdminPushControl.tsx:154, 166`; `src/device/pwa/InstallControl.tsx:29`; `AdminViewsRender.tsx:81` |
| The password | "contraseña", "clave" on the same screen ("Cambiá tu contraseña" and "Elegí una clave de al menos 12 letras o números.") | `AuthScreens.tsx:85`; `src/shared/password.ts:10-12` |
| The schedule | "Horarios" on screen, `plantillas` inside; "tramo" for a block of hours | `AdminApp.tsx:19`; `ScheduleEditor.tsx:58, 62` |
| Try again | "Reintentar", "Reintentar datos", "Reintentar datos de la jornada", "Reintentar consulta", "Actualizar" | `AdminViewsRender.tsx:307, 434, 460`; `AdminPushControl.tsx:165` |
| Close or go back | "Cancelar", "Volver", "Cerrar", "Cerrar mapa", "Ahora no", "Listo" | `AdminViewsRender.tsx:342`; `ScheduleEditor.tsx:125`; `EmployeesViewRender.tsx:121` |

- The employee also sees the ADMIN word: the chip in "Tus marcas de hoy" says "Sin ingreso" (`EmployeeViews.tsx:79` uses `jornadaStateLabel`, `src/shared/format.ts:4`) right under "Todavía no marcaste tu entrada.".
- When an owner and an employee talk about a case, each reads a different name for it.
- Fix: one glossary, written down in `docs/UX_UI_GUIDELINES.md`, with one word per concept for both roles, and a test that fails when a banned synonym appears in the source (section 10).

**F-34. Technical words in the site and location flow.** Severity: **medium**. `[code]`
- "Capturar ubicación del dispositivo", "Capturar otra ubicación" (`AdminViewsRender.tsx:170, 203`); "Precisión informada por el dispositivo: ±12.0 m (estimación; no garantiza exactitud)." (`:180, 215`); "Latitud", "Longitud", "centro", "radio" ("Podés crear la sede sin centro.", `AdminViews.tsx:338`; "Centro anterior: … · radio: …", `AdminViewsRender.tsx:267-268`).
- Error titles: "Geolocalización no disponible", "Conexión no segura", "Precisión insuficiente", "Datos de ubicación inválidos" (`AdminViewsRender.tsx:151-157`). Error bodies: "Este navegador no ofrece geolocalización. Usá un navegador compatible en un contexto seguro o creá la sede sin centro." (`src/features/admin/siteLocation.ts:37`); "El navegador bloquea la ubicación en este origen HTTP. Abrí Braja por HTTPS (o localhost durante desarrollo) …" (`:105`).
- "Esta sede todavía no tiene cambios de ubicación auditados." (`AdminViewsRender.tsx:260`); "Marca olvidada incorporada" (`:403`); "Ubicación depurada", "No aplica" (`:474`); "Automático del sistema" (`:386`); "identificador interno" (`EmployeesViewRender.tsx:10`); "Escribila como en la lista mundial de zonas, por ejemplo America/Santiago" (`SiteZoneField.tsx:26`).
- The newer copy shows the target register: "Distancia permitida para marcar (metros)" (`AdminViewsRender.tsx:14`), "Hora del local" with a list of provinces (`SiteZoneField.tsx:16`), "Tocá en el mapa la puerta del local." (`SiteMapPanel.tsx:40`).

**F-35. What the location messages say and what happens do not match.** Severity: **medium**. `[code]`
- "Para marcar necesitamos saber que estás en el local. Solo se mira en el momento de marcar." (`src/features/employee/locationNotice.ts:7`). The location never blocks a mark (root `CLAUDE.md`, rule 2). A person who refuses the permission, or whose phone has no signal, may believe they cannot mark.
- "Enviando ubicación… no cierres la app." (`employeeDay.ts:146`): an order with no duration; the wait can be 25 to 30 seconds (`src/features/employee/markFlow.ts:9-10`).
- "No llegó tu ubicación: puede figurar como fuera del local. Revisá que el celular tenga la ubicación activada." (`employeeDay.ts:149`): arrives after the mark, when nothing can be retried, and does not say what follows.
- Fix (copy only, no rule changes): say that the mark is saved either way and what happens next ("Tu marca quedó registrada. No pudimos ver dónde estabas; si te lo piden, explicalo en «Para explicar».").

**F-36. Screens with many things competing.** Severity: **medium**. `[code]`, density `[render]`
- Jornadas (`AdminViewsRender.tsx:304-372`): a notice, "Cargar días de trabajo" (four groups and a folded option), "Cargar o cambiar un solo día" (folded), the list for a date with its own date field, and the open day with up to four forms (cancel, void, correct, add a mark) and a history. Three date fields on one screen, each for something else ("Primer día"/"Último día", "Día", "Fecha").
- Where a site is: three buttons, a map, a hint of three sentences, a folded manual entry, a confirmation checkbox, a radius field (`AdminViewsRender.tsx:199-229`). Buttons of equal visual rank: "Elegir en el mapa", "Capturar ubicación del dispositivo", "Quitar ubicación".
- A case in Bandeja: "Ver jornada", "Justificado", "No justificado" with nearly the same weight (`:113-117`).
- Fixed layers that sit over content: the alerts bar's own messages float above it (`styles.css:343`) and the "Hay una versión nueva" banner is fixed at the bottom centre, over the alerts bar (`:444`). The banner is first in the source and last on screen, so it is the first tab stop (WCAG 2.4.3, low).
- Every heading has a capitals line above it that adds a second label for the same screen: "CENTRO DE CONTROL" over "Bandeja de desvíos", "ORGANIZACIÓN" over "Sedes", "CONSULTA" over "Historial", "CUENTA COMPARTIDA" over "Elegí una empresa".

**F-37. Things the person has to remember or copy by hand.** Severity: **medium**. `[code]`
- The provisional password is shown once ("No se vuelve a mostrar.", `EmployeesViewRender.tsx:24`), 19 characters, with no "Copiar" button; the owner dictates it or writes it down. A copy button uses the clipboard, not browser storage, so rule 27 allows it.
- The setup guide sends the owner to another section with "Ir" (`FirstSteps.tsx:25`); the section does not say which step it belongs to or how to return, and the guide's menu entry later moves (F-29).
- Examples live in placeholders that disappear on typing (F-08).

**F-38. The screen can change under the finger, and it offers marks on a day that is not today.** Severity: **low**. `[code]`; the second point needs a product check.
- Every 30 seconds the suggested mark is recomputed (`EmployeeApp.tsx:76-79`). Thirty minutes before the end of the shift the large button changes from a pause to "Marcar salida" (`employeeDay.ts:94-96`). The early-exit question covers a wrong tap before the end of the shift.
- With another day chosen in "Ver otros días", the "Marcar" panel is still rendered for that day's shift (`EmployeeApp.tsx:286`), under "Estás viendo el 9 nov 2026.". Whether a mark there is accepted is a server rule; the screen should not offer it if it cannot succeed.

**F-40. Small things.** Severity: **low**. `[code]`
- "Conexión protegida" with a green dot (`AdminApp.tsx:96`) is shown whenever the page is on HTTPS: information the owner cannot act on.
- The notification title is "Fichaje Braja · Desvíos pendientes" (`src/device/push/safeNotification.ts:60`): the word "desvíos" again (F-06).
- The alerts bar message "Consultando la configuración de avisos…" appears on every ADMIN load (`AdminPushControl.tsx:158`).
- The DNI field has no hint about dots or spaces (`AuthScreens.tsx:33`); the server keeps digits only, so "30.111.222" works, but the person does not know.
- An owner who forgets the password has no path on the login screen (`AuthScreens.tsx:38` speaks to employees).

---

## 9. What is already good and must be preserved

Each of these is a decision someone made on purpose; several have a test. The redesign should move them into the design system, not rewrite them.

| # | Pattern | Where | Guarded by |
|---|---|---|---|
| 1 | `lang="es-AR"`; zoom never blocked; orientation free | `index.html:2, 5`; `vite.config.ts:18-30` | nothing (add a test, section 10) |
| 2 | All font sizes in `rem`; inputs at 16 px (no zoom on focus in iOS) | `styles.css:98` | nothing |
| 3 | One focus style for everything, 3 px, 8.5:1 or more, with a halo on dark buttons | `styles.css:107-119` | nothing |
| 4 | `--tap-target: 44px` used by every control | `styles.css:19, 98, 121, 131, 169, 206` | `src/app/styles.test.tsx:91-94` |
| 5 | Field and mark-button borders at 5.50:1 | `styles.css:98, 284` | `src/app/styles.test.tsx:46-52` |
| 6 | `prefers-reduced-motion` in CSS and in the three scripted scrolls | `styles.css:427-434`; `AdminViews.tsx:143, 655, 823` | nothing |
| 7 | `scroll-padding` so focus is not hidden by the top bar or the alerts bar | `styles.css:34-36, 375, 403` | `src/app/styles.test.tsx:101-114` |
| 8 | `color-scheme: light` so native pickers match the theme | `styles.css:8-9` | `src/app/styles.test.tsx:61-63` |
| 9 | `PageMessage`: errors are alerts; other messages use a status region mounted before its text | `src/app/ui.tsx:4-14` | `src/app/ui.test.tsx` |
| 10 | `FormField`: label, hint and error tied to the control; `aria-invalid` with the error | `src/app/ui.tsx:71-92` | `src/app/ui.test.tsx` |
| 11 | `Panel`: a region named by its heading | `src/app/ui.tsx:20-23` | used by role in most tests |
| 12 | Every decorative glyph is `aria-hidden`; no control is named by a glyph | `AdminApp.tsx:81`; `EmployeeViews.tsx:50, 70, 80` | `src/features/admin/AccessibilityBase.test.tsx:46-68` |
| 13 | Short buttons carry a longer accessible name that starts with the visible words | `FirstSteps.tsx:25`; `AdminViewsRender.tsx:113, 300, 330`; `EmployeesViewRender.tsx:51-53` | several view tests |
| 14 | A disabled button that says why, in visible text tied with `aria-describedby` | `EmployeesViewRender.tsx:53-54, 108-109` | `AccessibilityBase.test.tsx:29-44` |
| 15 | Show-password as a toggle button with a constant name and `aria-pressed` | `AuthScreens.tsx:9-11` | `src/features/auth/AuthScreens.test.tsx:153-170` |
| 16 | `autocomplete` and `inputMode` on DNI and passwords; paste allowed | `AuthScreens.tsx:33-34, 89-91` | nothing (no test names `autocomplete`) |
| 17 | The mark flow: buttons disabled while sending, "Enviando tu marca… esperá un momento.", focus moved to the result, and **no confirmation before the server answers** (S8) | `EmployeeApp.tsx:70, 164-202`; `EmployeeViews.tsx:46-53, 73` | `src/features/employee/EmployeeApp.test.tsx:298` (focus), and the rest of that file |
| 18 | Employee error messages that say what happened, whether it was saved and what to tap | `src/features/employee/employeeMessages.ts:7-33`; `src/features/auth/interruptedMark.ts:7` | `EmployeeApp.test.tsx` |
| 19 | One sentence that states the day ("Estás trabajando desde las 08:02.", "Estás almorzando: volvé antes de las 13:45.") | `src/features/employee/employeeDay.ts:107-130` | `src/features/employee/employeeDay.test.ts` |
| 20 | One large suggested action, the others smaller, the exit apart, and a question before an early exit | `employeeDay.ts:88-104`; `EmployeeViews.tsx:68-72` | `employeeDay.test.ts` |
| 21 | Motive categories as radio buttons with a plain explanation each; errors tied to the group and to the text | `EmployeeViews.tsx:18-23, 131-142` | `EmployeeApp.test.tsx` |
| 22 | What the person typed survives a failed send | `EmployeeApp.tsx:251-253` | `EmployeeApp.test.tsx` |
| 23 | The preview sentence before a bulk load, in a live region that exists from the start | `WorkDaysForm.tsx:68-71`; `src/features/admin/workDays.ts:127-135` | `src/features/admin/workDays.test.ts` |
| 24 | Tables become cards on a phone; the menu wraps instead of scrolling sideways | `useNarrowScreen.ts`; `useMediaQuery.ts`; `styles.css:401-402` | `src/app/styles.test.tsx:65-70` |
| 25 | Voided marks stay visible, struck through and labelled | `EmployeeViews.tsx:86-87`; `AdminViewsRender.tsx:346-351` | `src/features/admin/AdminViews.test.tsx` |
| 26 | Two-step destructive actions that state the consequence in the hint | `AdminViewsRender.tsx:341, 354`; `EmployeesViewRender.tsx:48` | `AdminViews.test.tsx` |
| 27 | Arrival notices are a polite status, not an alert, so they do not interrupt on every page load | `FirstSteps.tsx:31-40` | nothing (no test asserts the role) |
| 33 | Focus moved to the provisional password when it is issued | `src/features/admin/AdminViews.tsx:714-719`; `EmployeesViewRender.tsx:21` | `src/features/admin/EmployeesView.test.tsx:71` |
| 28 | `aria-current`, `aria-pressed`, `aria-expanded` with `aria-controls`, `aria-busy` | section 5.1 | several view tests |
| 29 | The fold marker uses the CSS alternative-text syntax so it is not read | `styles.css:449-450` | nothing |
| 30 | The map has text alternatives: search results that place the point, typed coordinates, the coordinates printed | `SiteMapPanel.tsx:34-40`; `AdminViewsRender.tsx:177, 184-190` | `src/features/admin/SitesViewRender.test.tsx` |
| 31 | The time zone asked as a province, not as an identifier | `SiteZoneField.tsx:16-24` | `src/features/admin/siteZone.test.ts` |
| 32 | Forced-colours support for focus, chips and spinner | `styles.css:436-441` | nothing |

---

## 10. Verification plan for the redesigned result

### 10.1 Automatable with what the repository already has

vitest 5, Testing Library (`@testing-library/react`, `user-event`, `jest-dom` 6.9, which has `toHaveAccessibleName`, `toHaveAccessibleDescription`, `toHaveAccessibleErrorMessage`, `toHaveFocus`) and jsdom. jsdom does not lay out or paint: it cannot check contrast as rendered, sizes, overflow or what is on screen.

| Check | How | Covers |
|---|---|---|
| Contrast of every declared pair | Extend `src/app/styles.test.tsx` (it already has `luminance`, `contrast`, `rule`, `colorOf`): a table of foreground and background tokens with the required ratio, ported from `contrast.mjs`. With centralised tokens the table is short. | 1.4.3, 1.4.11; F-01, F-08, F-39 |
| Selected, pressed and current styles | Assert that the rule for each state sets a border of the selected token and that the token is 3:1 or more on every surface token. | 1.4.11; F-01 |
| A `::placeholder` rule exists and passes | Same file. | F-08 |
| No colour literal outside the token block | Read `styles.css` and fail on a `#rrggbb` outside `:root`. | S9 "Tokens centralizados" |
| Zoom and language | Extend `src/app/indexHtml.test.ts`: `lang="es-AR"`, the viewport has no `user-scalable` or `maximum-scale`. | 1.4.4, 3.1.1 |
| Minimum sizes declared | Same pattern as `styles.test.tsx:91-94` for every control class; no font size under the agreed floor; `body` has a line height. | 2.5.8 as declared, F-12, F-16 |
| Reduced motion block present; no `outline: none` without a `:focus-visible` rule | Same file. | 2.3.3, 2.4.7 |
| One `h1` per screen, no skipped level | A helper over `getAllByRole('heading')` run on each screen's render. | 1.3.1, 2.4.6 |
| Landmarks | `getByRole('banner')`, `('navigation', { name })`, `('main')`. | 1.3.1, 2.4.1 |
| Every control has a name; visible text is contained in it | A helper that walks buttons, links and fields and uses `toHaveAccessibleName`; compare with `textContent`. | 4.1.2, 2.5.3 |
| Every field has a label; required and optional are stated | `getByLabelText`; assert "(opcional)" where it applies. | 1.3.1, 3.3.2; F-09 |
| Errors are tied to their field | Submit empty, then `toHaveAccessibleErrorMessage` or `toHaveAccessibleDescription` and `aria-invalid`. | 3.3.1, 3.3.3; F-05, F-09 |
| A form's result is inside the form | After a failed submit, `within(form).getByRole('alert')`. | F-02 |
| Focus after each action | `user-event`, then `toHaveFocus()`: after opening an inline form, after closing it, after changing section (the `h1`), after a mark. Today only two tests look at focus, through `document.activeElement` (`EmployeeApp.test.tsx:298`, `EmployeesView.test.tsx:71`). | 2.4.3; F-03, F-19, F-27 |
| Page title per section | Assert `document.title` after navigation. | 2.4.2; F-19 |
| Tab order | `userEvent.tab()` through a screen and compare with the expected list. | 2.4.3 |
| States | `aria-current`, `aria-pressed`, `aria-expanded` after interaction. | 4.1.2 |
| Status regions exist before their text | The pattern of `src/app/ui.test.tsx` for every transient status. | 4.1.3; F-31 |
| Company switch needs an explicit action | Changing the select alone does not call `onSelect`. | 3.2.2; F-20 |
| Session warning and preserved form | Fake timers: the notice appears, "Seguir conectado" makes a request; a 401 keeps the typed values after login. | 2.2.1; F-04 |
| Glossary | A test that reads the source (as `styles.test.tsx:5-7` reads the stylesheet) and fails on a banned synonym in a user-facing string. | F-06 |
| No Unicode glyph used as an icon | Same technique with a list of the characters in F-22. | F-22 |
| Decorative marks stay hidden | Already in `AccessibilityBase.test.tsx:46-68`; extend to the new icons. | 1.1.1 |

### 10.2 Proposals that need a new dependency (not adopted here)

The repository adds a dependency only after a person verifies the package (root `CLAUDE.md`, section 1, "Dependencias nuevas solo con verificación humana"). These are **proposals for the owner**, not part of the plan above:

- `axe-core` run inside vitest (directly or through a wrapper such as `vitest-axe`). In jsdom it finds structural defects (missing names, invalid ARIA, duplicate ids, list and table structure); it cannot judge contrast or anything that depends on layout. It would replace several hand-written helpers of 10.1, not add coverage that is impossible today.
- `eslint-plugin-jsx-a11y`: static rules on JSX in the existing lint step (labels, roles, handlers on non-interactive elements).
- A browser runner (for example Playwright with `@axe-core/playwright`): the only way to automate rendered contrast, target sizes, reflow at 320 px and focus not obscured. It is the largest addition; the screenshot work of T3 and T11 may already use a browser outside the repository's dependencies, and the same harness could run these checks from a scratch folder without touching `package.json`.

Automated tools find a minority of accessibility defects. None of the above replaces 10.3.

### 10.3 Manual checks

| Check | How | Confirms |
|---|---|---|
| Rendered contrast | Browser tools on each state: placeholder, disabled, hover, focus, selected, error; Chrome, Safari on iPhone, Firefox | Section 1; F-01, F-08 |
| Native controls | Date, time and date-time pickers, selects, checkboxes inside groups | F-17; section 1.2 |
| Reflow | 320, 375 to 390, 768 and 1366 px wide (S11); then 200 % and 400 % zoom on a desktop; then a phone in landscape | 1.4.10; F-10, F-11, F-13 |
| Larger text | Android font size at its largest; browser default font at 24 px; the text-spacing values of 1.4.12 | 1.4.4, 1.4.12; F-12 |
| Target sizes | Measure the boxes in section 3 with browser tools | 2.5.8; F-16 |
| Keyboard | Each flow from login to the result with Tab, Shift+Tab, Enter, Space, arrows and Escape; focus always visible and never under a bar | 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11; F-03, F-19, F-23 |
| Screen readers | TalkBack with Chrome (the employees' setup), VoiceOver with Safari on iPhone, NVDA with Chrome or Firefox for the ADMIN: login, mark, explain a case, classify, load days, create a site with the map | 4.1.2, 4.1.3; F-23, F-30, F-31 |
| Forced colours and Windows contrast themes | Every selected and pressed state still visible | F-14 |
| Session expiry | Leave a form half filled for 30 minutes, then submit | 2.2.1; F-04 |
| Icons on a cheap Android | Whatever replaces the glyphs draws the same everywhere | F-22 |
| Installed app on iPhone | Status bar legible; safe areas; install help | F-15 |
| Bad connection | Throttled and offline: each message says what happened and what to do | S8; F-33 |
| Map | Place a point with the search only; with typed coordinates only; with one finger and no drag | 2.1.1, 2.5.7; F-23 |
| Comprehension | The task walk-through of T6 and T11 by someone who has not seen the design, labelled as a simulation when no real user is involved (S11) | Section 8 |

### 10.4 What a later audit should compare against this baseline

- The nine failing pairs of section 1.3 and the three near-threshold pairs of 1.4.
- Each finding ID (F-01 to F-40) with its location: fixed, still present, or moved.
- The 33 patterns of section 9: each still present.
- Any `[render]` item confirmed or dismissed by the checks of 10.3.

---

## Findings index

| ID | Severity | Basis | Mark | Short name | Section |
|---|---|---|---|---|---|
| F-01 | high | WCAG 1.4.11 (AA) | code | Selected, pressed, current states under 3:1 | 1.6 |
| F-02 | high | WCAG 3.3.1 (A) in spirit; COGA | code, render | ADMIN messages far from the action | 6.2 |
| F-03 | high | WCAG 2.4.3 (A); COGA | code, render | Forms open away from their trigger | 4.2 |
| F-04 | high | WCAG 2.2.1 (A) | code | Session ends without warning; data lost | 6.2 |
| F-05 | high | WCAG 3.3.1 (A), 3.3.3 (AA) | code | "Revisá los datos ingresados." | 6.2 |
| F-06 | high | COGA; partly WCAG 3.2.4 (AA) | code | Several names for one thing; two glossaries | 8 |
| F-07 | high | COGA | code | About 62 characters of password on first login | 6.2 |
| F-08 | medium | WCAG 1.4.3 (AA) | render | Placeholder colour; examples in placeholders | 1.6 |
| F-09 | medium | WCAG 3.3.2 (A); COGA | code | Required not marked; two validation styles; silent disabled buttons | 6.2 |
| F-10 | medium | WCAG 1.4.10 (AA), 2.4.11 (AA) | render | Fixed bars on short viewports | 2.2 |
| F-11 | medium | WCAG 1.4.10 (AA) | render | Popovers and top bar may overflow | 2.2 |
| F-12 | medium | best practice | code | 12 to 14 px text; no base line height | 2.2 |
| F-19 | medium | WCAG 2.4.2 (A), 2.4.3 (A) | code | No page title or focus on section change | 4.2 |
| F-20 | medium | WCAG 3.2.2 (A) | code | Company select switches at once | 4.2 |
| F-21 | medium | COGA | code | Link and quiet button do not look like controls | 6.2 |
| F-22 | medium | COGA; robustness | render | Unicode glyphs as icons | 5.2 |
| F-23 | medium | WCAG 2.1.1 (A) met by alternatives; 2.5.7 (AA) to check | render | Map needs a pointer and dragging | 4.2 |
| F-24 | medium | COGA; WCAG 3.3.4 (AA) met | code | Unclear or costly consequences | 6.2 |
| F-33 | medium | WCAG 3.3.3 (AA); COGA | code | Messages without a next step | 6.2 |
| F-34 | medium | COGA | code | Technical words in sites and location | 8 |
| F-35 | medium | COGA | code | Location messages do not match what happens | 8 |
| F-36 | medium | COGA | code, render | Dense screens, floating layers | 8 |
| F-37 | medium | COGA | code | Things to remember or copy by hand | 8 |
| F-13 | low | COGA | code | Company name cut or missing; long text | 2.2 |
| F-14 | low | best practice | render | States lost in forced colours | 2.2 |
| F-15 | low | best practice | render | iOS status bar | 2.2 |
| F-16 | low | WCAG 2.5.8 (AA) met; 44 px goal missed | render | Four targets under 44 px | 3 |
| F-17 | low | best practice | render | Checkboxes inherit the text field box | 3 |
| F-25 | low | best practice | code | No skip link | 4.2 |
| F-26 | low | best practice | code | Install help has no Escape | 4.2 |
| F-27 | low | WCAG 2.4.3 (A) | code | Focus lost when an inline step closes | 4.2 |
| F-28 | low | WCAG 2.4.4 (A) | code | Brand link goes nowhere | 5.2 |
| F-29 | low | WCAG 3.2.3 (AA) | code | Menu entry changes position | 5.2 |
| F-30 | low | WCAG 1.3.1 (A), 4.1.2 (A) | code, render | Small structure gaps | 5.2 |
| F-31 | low | WCAG 4.1.3 (AA) | render | Status announcements | 5.2 |
| F-32 | low | best practice | code | Date error styled as a hint | 5.2 |
| F-38 | low | COGA | code | Screen changes on a timer; marks on another day | 8 |
| F-39 | low | WCAG 1.4.11 (AA), 1.4.1 (A) | code | Notification target tint | 7 |
| F-40 | low | COGA | code | Small copy issues | 8 |
| F-18 | (in F-24) | COGA | code | Opposite actions 6 px apart | 3 |

F-18 is counted inside F-24. Totals: 0 critical, 7 high, 16 medium, 16 low: 39 findings.

---

## Appendix A. Contrast script output

Produced by `node contrast.mjs` in `SCR/a11y/`. "styles.css line" is the line in `frontend/src/styles.css` unless another file is named. "n/a" rows are reported and not judged (disabled, decorative, or a boundary that a text label makes unnecessary).

| ID | Pair | FG | BG | Ratio | Needs | SC | styles.css line | Verdict | Same-hue alternative |
|---|---|---|---|---|---|---|---|---|---|
| T01 | Body text on page | #18241f | #f4f7f5 | 14.85:1 | 4.5:1 | 1.4.3 | 10,13 | pass |  |
| T02 | Body text on panel | #18241f | #ffffff | 16.02:1 | 4.5:1 | 1.4.3 | 10,181 | pass |  |
| T03 | .muted / --text-secondary on page | #53645a | #f4f7f5 | 5.83:1 | 4.5:1 | 1.4.3 | 11,47,179 | pass |  |
| T04 | .muted / --text-secondary on white panel | #53645a | #ffffff | 6.29:1 | 4.5:1 | 1.4.3 | 11,47 | pass |  |
| T05 | .muted on auth card (composite) | #53645a | #fdfefd | 6.22:1 | 4.5:1 | 1.4.3 | 60,62 | pass |  |
| T06 | .eyebrow (12 px bold caps) on page | #5c6d62 | #f4f7f5 | 5.10:1 | 4.5:1 | 1.4.3 | 49 | pass |  |
| T07 | .eyebrow on auth card | #5c6d62 | #fdfefd | 5.44:1 | 4.5:1 | 1.4.3 | 49,60 | pass |  |
| T08 | .loading text on page | #53645a | #f4f7f5 | 5.83:1 | 4.5:1 | 1.4.3 | 52 | pass |  |
| T09 | .auth-brand on top of auth gradient | #12372a | #e8f1e8 | 11.32:1 | 4.5:1 | 1.4.3 | 56,57 | pass |  |
| T10 | .brand-light on top of auth gradient | #53645a | #e8f1e8 | 5.45:1 | 4.5:1 | 1.4.3 | 56,58 | pass |  |
| T11 | .brand-mark "B" lime on green | #d8f078 | #12372a | 10.37:1 | 4.5:1 | 1.4.3 | 59 | pass |  |
| T12 | .auth-footnote on page | #53645a | #f4f7f5 | 5.83:1 | 4.5:1 | 1.4.3 | 63 | pass |  |
| T13 | .field-label on white | #495950 | #ffffff | 7.43:1 | 4.5:1 | 1.4.3 | 67 | pass |  |
| T14 | .field-label on #f8faf8 box | #495950 | #f8faf8 | 7.08:1 | 4.5:1 | 1.4.3 | 67,84 | pass |  |
| T15 | .field-hint on white | #53645a | #ffffff | 6.29:1 | 4.5:1 | 1.4.3 | 68 | pass |  |
| T16 | .field-hint on #f8faf8 box | #53645a | #f8faf8 | 6.00:1 | 4.5:1 | 1.4.3 | 68,76,84,453 | pass |  |
| T17 | .field-hint-error / .employee-field-error on white | #a33e35 | #ffffff | 6.37:1 | 4.5:1 | 1.4.3 | 69,237,324 | pass |  |
| T18 | .field-hint-error / .site-location-message-error on #f8faf8 | #a33e35 | #f8faf8 | 6.07:1 | 4.5:1 | 1.4.3 | 69,74,84 | pass |  |
| T19 | .site-location-coordinates on #f8faf8 | #3d5f47 | #f8faf8 | 6.84:1 | 4.5:1 | 1.4.3 | 75,76 | pass |  |
| T20 | summary (.fold, .site-location-manual) on white | #1d513c | #ffffff | 9.15:1 | 4.5:1 | 1.4.3 | 82,447 | pass |  |
| T21 | summary .filter-fold on page | #1d513c | #f4f7f5 | 8.49:1 | 4.5:1 | 1.4.3 | 447,466 | pass |  |
| T22 | Input text on white | #18241f | #ffffff | 16.02:1 | 4.5:1 | 1.4.3 | 41,98 | pass |  |
| T23 | Placeholder, Chrome default #757575 (no ::placeholder rule; inferred) | #757575 | #ffffff | 4.61:1 | 4.5:1 | 1.4.3 | none | pass |  |
| T24 | Placeholder, Firefox default = text at 54% opacity (inferred) | #828986 | #ffffff | 3.58:1 | 4.5:1 | 1.4.3 | none | FAIL | #717774 (4.57:1) |
| T25 | Placeholder, Safari default darkgray #a9a9a9 (inferred) | #a9a9a9 | #ffffff | 2.35:1 | 4.5:1 | 1.4.3 | none | FAIL | #757575 (4.61:1) |
| B01 | .button-primary text | #ffffff | #12372a | 13.08:1 | 4.5:1 | 1.4.3 | 123 | pass |  |
| B02 | .button-primary hover | #ffffff | #1b4935 | 10.24:1 | 4.5:1 | 1.4.3 | 124 | pass |  |
| B03 | .button-quiet text | #54655a | #f7f9f7 | 5.86:1 | 4.5:1 | 1.4.3 | 125 | pass |  |
| B04 | .button-quiet hover | #12372a | #edf3ee | 11.62:1 | 4.5:1 | 1.4.3 | 126 | pass |  |
| B05 | .button-outline text | #12372a | #ffffff | 13.08:1 | 4.5:1 | 1.4.3 | 127 | pass |  |
| B06 | .button-danger-outline text | #9c443a | #ffffff | 6.36:1 | 4.5:1 | 1.4.3 | 129 | pass |  |
| B07 | .button-danger-outline hover | #9c443a | #fff5f3 | 5.94:1 | 4.5:1 | 1.4.3 | 130 | pass |  |
| B08 | Pressed quick choice text ([aria-pressed=true]) | #12372a | #e7f1e9 | 11.31:1 | 4.5:1 | 1.4.3 | 452 | pass |  |
| B09 | .mark-action text | #34483a | #fbfdfb | 9.63:1 | 4.5:1 | 1.4.3 | 284 | pass |  |
| B10 | .mark-action small | #53645a | #fbfdfb | 6.15:1 | 4.5:1 | 1.4.3 | 288 | pass |  |
| B11 | .mark-action-primary small (class not used in JSX today) | #e7f1e9 | #12372a | 11.31:1 | 4.5:1 | 1.4.3 | 293 | pass |  |
| B12 | .company-choice name | #1c2d23 | #ffffff | 14.49:1 | 4.5:1 | 1.4.3 | 145 | pass |  |
| B13 | .company-choice small (role) | #53645a | #ffffff | 6.29:1 | 4.5:1 | 1.4.3 | 149 | pass |  |
| B14 | .journey-option small | #53645a | #ffffff | 6.29:1 | 4.5:1 | 1.4.3 | 301 | pass |  |
| B15 | .journey-option-active small | #53645a | #f3f8f3 | 5.85:1 | 4.5:1 | 1.4.3 | 299,301 | pass |  |
| B16 | .employee-category-option text | #53645a | #ffffff | 6.29:1 | 4.5:1 | 1.4.3 | 320 | pass |  |
| B17 | .employee-category-option checked text | #53645a | #f3f8f3 | 5.85:1 | 4.5:1 | 1.4.3 | 323 | pass |  |
| B18 | .check-grid label text | #53645a | #ffffff | 6.29:1 | 4.5:1 | 1.4.3 | 206 | pass |  |
| X01 | DISABLED .button-primary (opacity .68 on white) | #ffffff | #5e776e | 4.84:1 | - | exempt | 40,123 | n/a |  |
| X02 | DISABLED .button-quiet (opacity .68 on white) | #8b968f | #fafbfa | 2.95:1 | - | exempt | 40,125 | n/a |  |
| X03 | DISABLED .button-outline (opacity .68 on white) | #5e776e | #ffffff | 4.84:1 | - | exempt | 40,127 | n/a |  |
| X04 | DISABLED .button-danger-outline (opacity .68 on white) | #bc8079 | #ffffff | 3.23:1 | - | exempt | 40,129 | n/a |  |
| M01 | .message-info text | #496252 | #f3f8f4 | 6.20:1 | 4.5:1 | 1.4.3 | 140 | pass |  |
| M02 | .message-error text | #8e3931 | #fff7f5 | 7.15:1 | 4.5:1 | 1.4.3 | 141 | pass |  |
| M03 | .message-success text | #2a6740 | #f0f8f1 | 6.23:1 | 4.5:1 | 1.4.3 | 142 | pass |  |
| M04 | .employee-step-text inside .message-info | #18241f | #f3f8f4 | 14.91:1 | 4.5:1 | 1.4.3 | 140,314 | pass |  |
| M05 | .company-switch-status | #335541 | #f3f8f4 | 7.77:1 | 4.5:1 | 1.4.3 | 161 | pass |  |
| M06 | .company-switch-error | #8e3931 | #fff7f5 | 7.15:1 | 4.5:1 | 1.4.3 | 162 | pass |  |
| M07 | .install-help text | #59675e | #ffffff | 5.95:1 | 4.5:1 | 1.4.3 | 164 | pass |  |
| M08 | .update-banner text | #12372a | #ffffff | 13.08:1 | 4.5:1 | 1.4.3 | 444 | pass |  |
| M09 | .empty-state text | #53645a | #fbfdfb | 6.15:1 | 4.5:1 | 1.4.3 | 184 | pass |  |
| H01 | .brand on top bar (composite) | #12372a | #feffff | 13.06:1 | 4.5:1 | 1.4.3 | 153,154 | pass |  |
| H02 | .brand-light on top bar | #53645a | #feffff | 6.28:1 | 4.5:1 | 1.4.3 | 58,153 | pass |  |
| H03 | .user-label on top bar | #68766e | #feffff | 4.76:1 | 4.5:1 | 1.4.3 | 157 | pass |  |
| H04 | .company-pill | #335541 | #f3f8f4 | 7.77:1 | 4.5:1 | 1.4.3 | 158 | pass |  |
| N01 | .sidebar-caption (12 px bold caps) | #53645a | #f8faf8 | 6.00:1 | 4.5:1 | 1.4.3 | 166,167 | pass |  |
| N02 | .nav-link | #53645a | #f8faf8 | 6.00:1 | 4.5:1 | 1.4.3 | 169 | pass |  |
| N03 | .nav-link hover | #12372a | #edf3ee | 11.62:1 | 4.5:1 | 1.4.3 | 170 | pass |  |
| N04 | .nav-link-active | #12372a | #eaf2ec | 11.47:1 | 4.5:1 | 1.4.3 | 171 | pass |  |
| N05 | .sidebar-footer | #53645a | #f8faf8 | 6.00:1 | 4.5:1 | 1.4.3 | 174 | pass |  |
| L01 | th (13 px caps) | #5c6d62 | #ffffff | 5.50:1 | 4.5:1 | 1.4.3 | 211 | pass |  |
| L02 | td | #56645b | #ffffff | 6.23:1 | 4.5:1 | 1.4.3 | 212 | pass |  |
| L03 | td strong | #25362b | #ffffff | 12.80:1 | 4.5:1 | 1.4.3 | 214 | pass |  |
| L04 | .simple-row small / .history-items small | #53645a | #ffffff | 6.29:1 | 4.5:1 | 1.4.3 | 196,203 | pass |  |
| L05 | .template-card p, small | #53645a | #fcfdfc | 6.17:1 | 4.5:1 | 1.4.3 | 218,219,220 | pass |  |
| L06 | .schedule-block chip | #516259 | #fbfdfb | 6.34:1 | 4.5:1 | 1.4.3 | 276 | pass |  |
| L07 | .form-subhead / .block-editor legend | #53645a | #ffffff | 6.29:1 | 4.5:1 | 1.4.3 | 222,225 | pass |  |
| L08 | .deviation-title strong | #2b3c31 | #ffffff | 11.71:1 | 4.5:1 | 1.4.3 | 262 | pass |  |
| L09 | .deviation-main p | #53645a | #ffffff | 6.29:1 | 4.5:1 | 1.4.3 | 263 | pass |  |
| L10 | .deviation-main p on .deviation-target | #53645a | #fbfff0 | 6.19:1 | 4.5:1 | 1.4.3 | 257,263 | pass |  |
| L11 | .reason-line | #58675e | #f8faf7 | 5.69:1 | 4.5:1 | 1.4.3 | 264 | pass |  |
| L12 | .row-avatar (step number in Primeros pasos) | #477253 | #eff6ef | 5.03:1 | 4.5:1 | 1.4.3 | 204 | pass |  |
| L13 | .choice-icon | #12372a | #ebf3ed | 11.57:1 | 4.5:1 | 1.4.3 | 147 | pass |  |
| L14 | .deviation-symbol (decorative, aria-hidden) | #996530 | #fff4e3 | 4.53:1 | - | decorative | 259 | n/a |  |
| E01 | .employee-day-state (18.4 px, weight 650) on page | #12372a | #f4f7f5 | 12.13:1 | 4.5:1 | 1.4.3 | 305 | pass |  |
| E02 | .schedule-summary strong | #263c2d | #ffffff | 11.89:1 | 4.5:1 | 1.4.3 | 274 | pass |  |
| E03 | .schedule-summary small / .mark-row time / .mark-row-location / .timeline-title | #53645a | #ffffff | 6.29:1 | 4.5:1 | 1.4.3 | 277,279,282,317 | pass |  |
| E04 | .mark-row text | #44564b | #ffffff | 7.84:1 | 4.5:1 | 1.4.3 | 280 | pass |  |
| E05 | .push-copy strong on alerts bar (composite) | #304838 | #ffffff | 9.95:1 | 4.5:1 | 1.4.3 | 342,345 | pass |  |
| E06 | .push-copy span (13 px) | #53645a | #ffffff | 6.29:1 | 4.5:1 | 1.4.3 | 346 | pass |  |
| C01 | .status-chip default (also "Anulada") | #53645a | #f0f3f0 | 5.63:1 | 4.5:1 | 1.4.3 | 245 | pass |  |
| C02 | .status-egresada / cancelada / inactivo | #53645a | #eff2ef | 5.58:1 | 4.5:1 | 1.4.3 | 253,254 | pass |  |
| C03 | .status-motivo_pendiente | #835520 | #fff4df | 5.86:1 | 4.5:1 | 1.4.3 | 246 | pass |  |
| C04 | .status-pendiente_revision | #795d21 | #fff6d9 | 5.72:1 | 4.5:1 | 1.4.3 | 247 | pass |  |
| C05 | .status-justificado | #2c7044 | #e8f5e9 | 5.32:1 | 4.5:1 | 1.4.3 | 248 | pass |  |
| C06 | .status-no_justificado | #9b4438 | #fff0ec | 5.77:1 | 4.5:1 | 1.4.3 | 249 | pass |  |
| C07 | .status-no_ingreso | #94612d | #fff4e2 | 4.81:1 | 4.5:1 | 1.4.3 | 250 | pass |  |
| C08 | .status-en_curso | #326b47 | #e8f4e9 | 5.57:1 | 4.5:1 | 1.4.3 | 251 | pass |  |
| C09 | .status-pausa_abierta | #786323 | #fff8dc | 5.46:1 | 4.5:1 | 1.4.3 | 252 | pass |  |
| U01 | Input border vs white field and white panel | #5c6d62 | #ffffff | 5.50:1 | 3:1 | 1.4.11 | 98 | pass |  |
| U02 | Input border vs #f8faf8 box | #5c6d62 | #f8faf8 | 5.24:1 | 3:1 | 1.4.11 | 84,98 | pass |  |
| U03 | .mark-action border vs white panel | #5c6d62 | #ffffff | 5.50:1 | 3:1 | 1.4.11 | 284 | pass |  |
| U04 | Focus ring vs white | #1d513c | #ffffff | 9.15:1 | 3:1 | 1.4.11 / 2.4.7 | 14,107 | pass |  |
| U05 | Focus ring vs page | #1d513c | #f4f7f5 | 8.49:1 | 3:1 | 1.4.11 / 2.4.7 | 14,107 | pass |  |
| U06 | Focus ring vs sidebar | #1d513c | #f8faf8 | 8.73:1 | 3:1 | 1.4.11 / 2.4.7 | 14,166 | pass |  |
| U07 | Focus ring vs info message | #1d513c | #f3f8f4 | 8.52:1 | 3:1 | 1.4.11 / 2.4.7 | 14,140 | pass |  |
| U08 | Focus ring vs .button-primary fill (separated by a 3 px white halo, line 119) | #1d513c | #12372a | 1.43:1 | - | info | 119 | n/a |  |
| U09 | Checked checkbox/radio accent vs white | #1d513c | #ffffff | 9.15:1 | 3:1 | 1.4.11 | 78,207,322 | pass |  |
| U10 | PRESSED quick choice: fill vs unpressed fill | #e7f1e9 | #f7f9f7 | 1.09:1 | 3:1 | 1.4.11 (state) | 125,452 | FAIL | #5c9d69 (3.06:1) |
| U11 | PRESSED quick choice: border vs white panel | #97b39d | #ffffff | 2.27:1 | 3:1 | 1.4.11 (state) | 452 | FAIL | #789c80 (3.06:1) |
| U12 | SELECTED .journey-option-active: border vs white | #97b39d | #ffffff | 2.27:1 | 3:1 | 1.4.11 (state) | 299 | FAIL | #789c80 (3.06:1) |
| U13 | SELECTED .journey-option-active: fill vs unselected fill | #f3f8f3 | #ffffff | 1.08:1 | 3:1 | 1.4.11 (state) | 298,299 | FAIL | #60a260 (3.07:1) |
| U14 | CURRENT .nav-link-active: fill vs sidebar | #eaf2ec | #f8faf8 | 1.09:1 | 3:1 | 1.4.11 (state) | 166,171 | FAIL | #619c70 (3.08:1) |
| U15 | CURRENT .nav-link-active text vs other nav text (the only other cue is weight 700 vs 600) | #12372a | #53645a | 2.08:1 | - | info | 169,171 | n/a |  |
| U16 | TARGET .deviation-target: border vs white | #c5d990 | #ffffff | 1.53:1 | 3:1 | 1.4.11 (state) | 257 | FAIL | #819e36 (3.05:1) |
| U17 | TARGET .deviation-target: fill vs white | #fbfff0 | #ffffff | 1.02:1 | 3:1 | 1.4.11 (state) | 257 | FAIL | #76a100 (3.06:1) |
| U18 | .button-quiet: fill vs white panel (boundary; text label present, so not required) | #f7f9f7 | #ffffff | 1.06:1 | - | info | 125 | n/a |  |
| U19 | .button-quiet: border vs white panel (same) | #e6ebe7 | #ffffff | 1.21:1 | - | info | 125 | n/a |  |
| U20 | .button-outline: border vs white panel (same) | #cbd9ce | #ffffff | 1.46:1 | - | info | 127 | n/a |  |
| U21 | .button-danger-outline: border vs white panel (same) | #edcfca | #ffffff | 1.46:1 | - | info | 129 | n/a |  |
| U22 | .company-choice / .journey-option / .employee-category-option border vs white (same) | #e4e9e5 | #ffffff | 1.23:1 | - | info | 27,145,298,320 | n/a |  |
| U23 | .panel border vs page (decorative grouping) | #e5ebe6 | #f4f7f5 | 1.12:1 | - | info | 181 | n/a |  |
| U24 | Spinner arc vs track (text label present) | #1d513c | #d7e1d9 | 6.83:1 | - | info | 53 | n/a |  |
| U25 | Map: point stroke vs OSM land tile ~#f2efe9 (inferred) | #12372a | #f2efe9 | 11.40:1 | 3:1 | 1.4.11 | SiteMapPicker.tsx:53 | pass |  |
| U26 | Map: radius circle stroke vs OSM land tile ~#f2efe9 (inferred) | #2f8f5b | #f2efe9 | 3.52:1 | 3:1 | 1.4.11 | SiteMapPicker.tsx:51 | pass |  |
| U27 | .timeline-point ring vs white (decorative) | #74a181 | #ffffff | 2.93:1 | - | decorative | 281 | n/a |  |
| U28 | .live-dot vs sidebar (decorative, unlabelled) | #5eaa72 | #f8faf8 | 2.68:1 | - | decorative | 175 | n/a |  |

Pairs: 122. Judged: 106. Fail: 9. Pass: 97.
Passing with less than 0.5 of margin: T23 4.61, H03 4.76, C07 4.81
Composites: auth card #fdfefd, top bar #feffff, alerts bar #ffffff.

## Appendix B. Ratios of the proposed replacement values

Produced by `node extra.mjs` in the same folder.

```
proposed selected border #1d513c vs white: 9.15:1
proposed selected border #1d513c vs pressed fill #e7f1e9: 7.91:1
proposed selected border #1d513c vs unpressed fill #f7f9f7: 8.65:1
proposed selected border #1d513c vs #f3f8f3: 8.51:1
proposed nav current bar #12372a vs sidebar #f8faf8: 12.47:1
proposed nav current bar #12372a vs active fill #eaf2ec: 11.47:1
proposed placeholder #5c6d62 vs white: 5.50:1
proposed .status-no_ingreso text #835520 on #fff4e2: 5.87:1
proposed .user-label #53645a on top bar #feffff: 6.28:1
unselected control border #e4e9e5 vs proposed selected border #1d513c: 7.45:1
```
