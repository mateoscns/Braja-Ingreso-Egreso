# Fichaje Braja — UX research and evidence base (T1, spec S5)

Date: 2026-11-10. Scope: evidence for the redesign of the Fichaje Braja PWA (`odd/tasks/ux-ui-refactor.md`, S5; supports S1, S7, S8, S9, S15). Read-only on the repository.

## 0. How to read this report

### 0.1 Classes used

Every principle and recommendation carries one class:

| Class | Meaning | Sub-grade used here |
|---|---|---|
| `STANDARD` | Normative text: a WCAG 2.2 success criterion (number and level given), or published platform / design-system guidance (Apple HIG, Android/Material, GOV.UK Design System, USWDS). | "WCAG" = conformance requirement. "platform" = vendor or government design-system guidance; it is authoritative for that platform, not a legal or conformance requirement for Braja. |
| `EVIDENCE` | Empirical research. | **A** = a study whose method and numbers I could read this session. **B** = guidance from an organisation that states it rests on its own user research, but the page gives no method or data (most NN/g how-to articles, most GOV.UK pattern pages). B is weaker than A and is labelled as such. |
| `PREFERENCE` | Convention, aesthetics or expert opinion with no research basis that I could verify. | — |

A recommendation is never stronger than its weakest necessary link. Where a "best practice" is repeated everywhere but I found no study behind it, it is listed in section 6.

### 0.2 Limits of this evidence (read before relying on it)

1. **No research with Braja users exists.** The user profiles in the brief (employees who mostly use WhatsApp, workers aged 45 to 65, owners doing admin between tasks, cheap phones, unstable connections) are design hypotheses. Nothing here validates them.
2. **The studies on older adults used people older than Braja's hypothesised users.** NN/g's studies are with people 65+ [N5]; the only touch-target experiment with older adults I could read in full used people aged 65 to 95, mean 76.9 [R12]. Applying those numbers to 45-to-65-year-olds is an extrapolation in the conservative direction, not a measured fact.
3. **No independent usability research on time-clock or shift apps was found.** One search returned only vendor marketing. Recommendations for the clocking screen are derived from general evidence (single primary action, feedback, touch targets), not from studies of clocking apps.
4. **How sources were opened.** Pages were opened with a fetch tool that returns text extracted by a small model, with quotes limited to about 125 characters. I did not see the raw HTML. Quoted fragments below are those extracts. Before any quote is copied into `docs/UX_UI_GUIDELINES.md`, spot-check it against the URL. Two PDFs ([R12], [R18]) were read directly with `pdftotext`.
5. **Unreadable sources are not used as evidence.** `m3.material.io` and the rendered Apple HIG pages are JavaScript applications and returned only a title. For Apple I read the HIG's own JSON data endpoint instead; for Material I read Google's Android developer and Material Components documentation. ACM, PubMed and one PMC article blocked the fetch. Section 7 marks each one.
6. **Repository facts** cited here come from a skim of the six files named in the brief plus a few targeted greps (`styles.css`, `index.html`, `employeeMessages.ts`, `markFlow.ts`). They were read in source, not rendered. The auditor (T2) and the accessibility baseline (T4) are the authority on the current state; where I mention a current-state fact it is to tailor the research, not to audit.

### 0.3 Physical size conversion used below

Google states "A touch target of 48x48dp results in a physical size of about 9mm, regardless of screen size" [P3]. Taking 1 CSS px ≈ 1 dp on Android Chrome (an assumption; real devices vary), 1 px ≈ 0.19 mm. Derived values (my arithmetic, not from a source):

| CSS px | ≈ mm | Reference |
|---|---|---|
| 24 | 4.5 | WCAG 2.5.8 AA minimum |
| 44 | 8.3 | WCAG 2.5.5 AAA; Apple default control size |
| 48 | 9.0 | Android / Material recommendation |
| 53 | 10.0 | NN/g minimum, 1 cm × 1 cm [N14] |
| 56 | 10.5 | Lower bound of "acceptable" for adults 65 to 95 [R12] |
| 75 | 14.0 | Size from which accuracy stopped improving for adults 65 to 95 [R12] |

---

## 1. Principles that apply to Braja specifically

Each row: the principle, the concrete problem it prevents in this product, class, sources.

| # | Principle | Problem it prevents in Braja | Class | Sources |
|---|---|---|---|---|
| P1 | **Say the result of every action, and never say "registered" before the server confirms.** Three outcomes must look different: confirmed, not registered, unknown. | An employee leaves believing they clocked in when the request never arrived, or taps five times because nothing happened. The mark is a labour record; a false "ok" is worse than a slow "ok". | `EVIDENCE` B (heuristic 1; "Whenever users interact with a system, they need to know whether the interaction was successful") + `STANDARD` WCAG 4.1.3 AA for announcing it + COGA 4.5.10. No controlled study on optimistic UI was found on either side (section 6). | [N1] [N22] [W13] [W17] [R14] |
| P2 | **One primary action per screen, visually dominant; everything else quieter.** | On "my day" the employee must not have to choose among equal-looking buttons at 7:58 with the phone in one hand. For the ADMIN, each section needs one obvious "next thing". | `STANDARD` platform (GOV.UK: "Avoid using multiple default buttons on a single page"; USWDS: "Give an important action a distinctive style") + `EVIDENCE` B (COGA 4.3.1, 4.6.3). | [G11] [U5] [W17] |
| P3 | **Recognition over recall: show options, state, and history; do not make people remember.** | The ADMIN returning after a week should not need to remember which step of setup was left, which days are already loaded, or what "MOTIVO_PENDIENTE" meant. Employees should see today's marks, not recall them. | `EVIDENCE` B. The NN/g article rests on memory theory (cue-based retrieval), not on a cited experiment. | [N1] [N2] |
| P4 | **Use the words the users use; one word per concept everywhere.** | "Jornada", "desvío", "plantilla", "sede", "bandeja", "tolerancia" are system words. If the nav says "Horarios" and a form says "plantilla", the user sees two things. | `EVIDENCE` A for plain language improving success for all literacy levels (success 46% → 82% for lower-literacy users and 68% → 93% for higher-literacy users after a rewrite, n = 50) [N11]; `STANDARD` WCAG 3.2.4 AA for consistent identification; COGA 4.4.1. Which specific words Braja's users understand is **unknown** (hypothesis; owner decision A1). | [N11] [N26] [N1] [W1] [W17] [G19] |
| P5 | **Text labels on every control; icons only as a redundant aid.** | The current nav uses Unicode glyphs (◷ ▦ ☰ ⌖ ▤ ♙) next to labels. Without the label none of them is recognisable. | `EVIDENCE` B: "a text label must be present alongside an icon to clarify its meaning"; only home, print and the search magnifier are named as widely recognised. Two test anecdotes, no dataset. | [N12] [N2] [P1] |
| P6 | **Prevent slips with constraints, defaults and distance; confirm only what is serious and hard to undo; prefer undo where the rules allow it.** | "Anular marca", "Cancelar jornada", deactivating an employee and overwriting a schedule are consequential and audited. A dialog on every save would train people to tap through. | `EVIDENCE` B (NN/g: reserve confirmations for "actions with serious consequences"; overuse means "people will stop paying attention to the question"); `STANDARD` WCAG 3.3.4 AA where data is modified or deleted; `PREFERENCE` for "undo beats confirm" as a general law (expert opinion, no data) [R2]. | [N8] [N30] [N31] [W15] [R2] |
| P7 | **Errors say what happened and what to do, in plain words, next to the problem, without blame, and keep what the user typed.** | "No se pudo completar la operación" leaves a 60-year-old employee not knowing whether to retry, wait or call the owner. Older users tend to blame themselves [N5]. | `STANDARD` WCAG 3.3.1 A, 3.3.3 AA + `EVIDENCE` B (NN/g error guidelines; GOV.UK says messages written to its guidance "have been tested with all types of users in live services"). | [N4] [N9] [G2] [W1] [N5] |
| P8 | **Navigation stays visible and labelled; hide only what is rarely used.** | Seven ADMIN sections do not fit a phone bar. Hiding all of them behind a menu hurts discovery; showing all seven in a scrolling strip hides the last ones. | `EVIDENCE` A: hidden navigation was used in 57% of mobile cases vs 86% for a combination of visible and hidden links, tasks were 15% slower on mobile, content discoverability dropped "more than 20%" (n = 179, 6 sites) [N6]. `STANDARD` platform: 3 to 5 destinations in a bottom bar [P4] [P5]; WCAG 3.2.3 AA consistent order. | [N6] [N13] [P1] [P4] [P5] [W1] |
| P9 | **Progressive disclosure: show the frequent, defer the rare, at most two levels, with a label that predicts what is behind it.** | Jornadas mixes declare, bulk-load, correct marks and audit history. Showing all four at once overloads; hiding the wrong one makes the daily task slower. | `EVIDENCE` B (Nielsen: designs with more than two disclosure levels "typically have low usability"; the feature split and an obvious way to progress are the two conditions). GOV.UK reports "evidence that some users avoid clicking the link to show more details". | [N3] [G14] [N34] |
| P10 | **Touch targets: 24 px is the conformance floor, 44 to 48 px the working size, and the clocking button should be much larger.** | Missed taps and wrong-button taps on small, cheap phones, with tremor, on a bus or with one hand. | `STANDARD` WCAG 2.5.8 AA (24 × 24 CSS px with exceptions) and platform (Apple 44 × 44 pt default; Android 48 × 48 dp). `EVIDENCE` A for bigger: adults 65 to 95 were significantly less accurate below 14 mm and stayed "within acceptable levels for targets larger than 10.5 mm square"; spacing had no significant effect (n = 40) [R12]. See section 3.2. | [W2] [W3] [P2] [P3] [N14] [R10] [R12] |
| P11 | **Legible by default: body text at 16 px or more, contrast at or above 4.5:1, text that survives zoom and larger system fonts.** | Most text in the current stylesheet is 14 px (34 declarations at `.875rem`), with 13 px and 12 px captions. Presbyopia starts in the 40s; phones are read outdoors. | `STANDARD` WCAG 1.4.3, 1.4.4, 1.4.10, 1.4.12 AA; platform (USWDS "at least an effective size of 16px"; GOV.UK body 19 px on all screens; Apple default 17 pt). `EVIDENCE` A that larger text reads better up to a point, on desktop screens only [R13]. WCAG sets **no** minimum font size. See section 4. | [W11] [W1] [W10] [W14] [U1] [G10] [P2] [R13] |
| P12 | **Forms: a visible label above each field, hints outside the field, validate on submit, one column, mark what is optional.** | Placeholders used as examples ("Calle y número", "Ej.: Mañana, Turno noche") vanish on typing; premature errors frighten hesitant users; unclear required fields cause failed submissions. | `STANDARD` WCAG 3.3.2 A, 1.3.5 AA; platform (GOV.UK, USWDS). `EVIDENCE` A for labels above fields (eye-tracking, small and artificial) [R3] and for marking required/optional explicitly (32% of test users hit a validation error when only optional fields were marked, in e-commerce checkouts) [R5]. Validation timing is contested (section 6). | [W1] [G9] [G4] [N10] [R3] [R5] [U2] |
| P13 | **Teach in context, not with a tour; a checklist for setup is fine.** | A first-run ADMIN must create a site, a schedule and employees before anything works. A slideshow would be skipped; a checklist that links to each step and shows what is done is the pattern with support. | `EVIDENCE` B (NN/g: "avoid creating app onboarding whenever possible"; "tutorials didn't improve task performance"). `STANDARD` platform (GOV.UK task list for work done over several sessions). | [N18] [G6] [G7] [N17] |
| P14 | **Do not let a session end or a connection drop destroy work, and say so when it happens.** | An ADMIN types a 30-day bulk load, the 30-minute session expires, the form is lost. An employee's mark is cut by an expired session. | `STANDARD` WCAG 2.2.1 A (time limits), 3.3.7 A; COGA 4.5.9 "Avoid timeouts and let the user save their work as they go"; `EVIDENCE` B (NN/g "Preserve the user's input"). | [W16] [W7] [W17] [N4] |
| P15 | **Keep help in the same place and offer a human.** | The realistic recovery path for a forgotten password or a wrong mark is "ask the owner". That sentence should be findable in the same spot wherever it appears. | `STANDARD` WCAG 3.2.6 A (applies only if help is repeated across screens; it does not oblige you to provide help). COGA 4.8.1. | [W6] [W17] |
| P16 | **Low extraneous load: remove what does not help the task; five or fewer main choices per screen is a useful target, not a law.** | Eyebrows, decorative chips, a "Conexión protegida" footer and several panels compete with the one thing the user came to do. | `EVIDENCE` B (NN/g cognitive load, heuristic 8); COGA 4.6.3 "five or less main choices on each screen" is a Working Group Note, supplemental and not required for conformance; I found no study behind the number five. | [N35] [N1] [W17] |

---

## 2. Recommendations per screen type

Format: recommendation — class — sources. Proposed UI copy is in Spanish and is a proposal; vocabulary changes are the owner's decision (assumption A1 in the spec).

### 2.1 Mobile screen with one primary action (clocking)

1. **One dominant button whose label is the action in the user's words** ("Marcar entrada", "Marcar salida a almorzar"), full width, at least 56 px tall and preferably 64 to 72 px. — `EVIDENCE` A for size with older adults [R12], `STANDARD` platform for the 44/48 floor [P2] [P3]; the exact height is a design choice. The 2.5.8 floor (24 px) is already met by a wide margin.
2. **Secondary marks below it, visibly quieter but still at least 48 px tall, and "salida" separated from the others by space.** The current code already isolates the exit button and asks "Sí, marcar salida / No, seguir trabajando". Keep both: distance between consequential and benign options is recommended [N31], and action-labelled confirmation buttons are recommended over Yes/No [N8]. — `EVIDENCE` B.
3. **Do not move the primary button to "the thumb zone" on the strength of reach charts.** The author of the widely copied charts withdrew them in 2017 and reported that people touch the centre of the screen more, faster and more accurately than the corners or edges [R7] [R8]. Put the action in the central band of the first screen, not pinned to an edge. — `EVIDENCE` A (observational, 1,333 + 651 observations) for holding; `PREFERENCE` for any exact placement.
4. **Three explicit result states, each with different words, icon and colour, announced to assistive technology:**
   - confirmed (server answered): "Entrada registrada a las 8:02."
   - not registered (no connection): the app already says "No hay internet. Tu marca no se registró. Cuando vuelva la conexión, tocá el mismo botón otra vez."
   - unknown (timeout): say that it is not known and that retrying is safe, since the code reuses the same idempotency key (`employeeMessages.ts`, `markFlow.ts`): "No sabemos si tu marca llegó. Tocá el mismo botón otra vez: se registra una sola vez."
   — `STANDARD` WCAG 4.1.3 AA, 1.4.1 A; `EVIDENCE` B [N22] [R14]; brief S8.
5. **While sending, keep the button's label visible and add a status line; do not rely on a greyed button alone.** GOV.UK: "Disabled buttons have poor contrast and can confuse some users, so avoid them if possible"; USWDS: "Explain why an action is unavailable and how to make it available." Double submission is already safe server-side (idempotency), which is the protection GOV.UK asks for. The mark timeout in code is 15 s, so the wait can exceed the 10 s attention limit: say what is happening ("Enviando tu marca… esperá un momento", already present) and, past about 10 s, say that it is taking longer than normal. — `STANDARD` platform [G11] [U5]; `EVIDENCE` B for the 1 s / 10 s limits, which come from 1968 and 1991 sources [N15] [N16].
6. **The confirmation stays on screen until the user moves on; it is not a toast.** A toast "would be a bad way to implement an error message"; NN/g reports a user who waited five minutes because an error "quickly faded away after 5 seconds" [N29]. A timed message is also a time limit under WCAG 2.2.1. — `EVIDENCE` B; `STANDARD` WCAG 2.2.1 A.
7. **Location: say in one short line what happened ("Ubicación enviada" / "No pudimos obtener tu ubicación; tu marca quedó registrada igual"), after the mark result, never before it.** The business rule is that location never blocks a mark; the copy must not make it look like a failure of the mark. — derives from P1; `PREFERENCE` for wording.
8. **Today's marks as a short chronological list under the action** (recognition, P3), with times in large numerals. — `EVIDENCE` B [N2].

### 2.2 Triage / inbox list (deviations to review)

1. **A homogeneous vertical list, one row per deviation, same field in the same position on every row**: who, what happened in a sentence, when, state. Lists beat free-form cards for scanning and comparing: "Card layouts are less scannable than lists"; cards are "a poor choice when users need to compare between multiple options" [N25]. — `EVIDENCE` B.
2. **At most one or two actions inline per row** ("Justificar", "No justificar"); anything else behind "Ver detalle". Inline actions work with only "one or two actions" [N32]. Keep the consequential action away from the benign one [N31]. — `EVIDENCE` B.
3. **State in words plus colour, never colour alone**, in sentence case. GOV.UK changed task-list statuses to sentence case "to make them easier to read" and found that "some users currently try to select task statuses, thinking they are buttons or links" — a chip must not look like a button. — `STANDARD` WCAG 1.4.1 A; platform [G7].
4. **Filters collapsed on phones behind a summary that states what is applied** (the code already does this with `<details>`); show active filters; announce the result count with `role="status"` ("18 results returned" is the W3C example). — `EVIDENCE` B [N32]; `STANDARD` WCAG 4.1.3 AA [W13].
5. **Empty inbox is a success state with a next step**: "No hay nada para revisar." plus, when relevant, the coverage notice. See 2.9. — `EVIDENCE` B [N17].
6. **Count on the nav item only if it is a number the ADMIN can act on** (pending reviews). An indicator is a passive cue [N29]; decorative badges are excluded by the brief (S7). — `EVIDENCE` B; `PREFERENCE` for style.

### 2.3 Dense records on phones (tables vs cards vs lists)

No empirical comparison of tables, stacked rows and cards on phones was found. NN/g's mobile-tables article is an expert review of examples, describes no study, and does not cover stacked layouts [N7]. What can be said:

1. **Under about 600 px, turn each record into a stacked row with the label next to each value** (USWDS "stacked table": "collapses at narrow widths for better readability on small screens"; each cell carries its column name). Keep the same field order as the desktop table. — `STANDARD` platform [U4]; `EVIDENCE` B for consistency [N25].
2. **Use a real table from tablet width up**, first column a "human-readable record identifier" (the employee's name), header row frozen if the table is taller than the screen. — `EVIDENCE` B [N32] [N7].
3. **If a table must stay a table on a phone** (the marks of one day are a candidate: 4 to 6 rows, 3 short columns), put it in its own scroll container, make the cut-off column visibly cut, and keep the first column fixed. A table that scrolls inside its container passes WCAG 1.4.10; the failure is when the whole page scrolls in two directions [W10]. NN/g: "it must be apparent that there is more data beyond the horizontal fold" [N7]. — `STANDARD` WCAG 1.4.10 AA; `EVIDENCE` B.
4. **Do not use cards for homogeneous records.** Cards "work best for collections of heterogeneous items" and "take more space" [N25]. The brief also asks to avoid "exceso de tarjetas". — `EVIDENCE` B.
5. **Row editing: prefer an in-place expansion or a separate screen to a modal on phones.** NN/g discourages modals for deep editing because they cover adjacent records [N32]. On a 320 px phone a modal is the whole screen anyway; a full screen with a back link is simpler and has no focus-obscuring risk (WCAG 2.4.11). — `EVIDENCE` B; `PREFERENCE` between the two.

### 2.4 Forms

| Topic | Recommendation | Class | Sources |
|---|---|---|---|
| Labels | Visible label above every field, sentence case, no colon. "All text inputs must have labels, and in most cases the label should be visible." Labels above fields gave the shortest eye movement (about 50 ms vs about 500 ms for left-aligned labels) in a small, unstyled eye-tracking test. | `STANDARD` WCAG 3.3.2 A, 2.4.6 AA, 2.5.3 A; `EVIDENCE` A (weak, artificial) | [W1] [W21] [G9] [R3] |
| Hints and examples | Outside the field, under the label, linked with `aria-describedby`. "Do not use placeholder text in place of a label, or for hints or examples." Placeholders disappear, are read as pre-filled data, and "often fail contrast". WCAG 1.4.3 applies to placeholder text. Move "Calle y número", "Ej.: Mañana, Turno noche", "Por ejemplo: hubo paro de colectivos." to hint text. | `STANDARD` platform + WCAG 1.4.3 AA; `EVIDENCE` B | [G9] [N10] [W11] |
| Validation timing | Validate on submit; show an error summary at the top that links to each field, and the same message next to the field; move focus to the summary; keep everything typed. Do not validate on blur or while typing, except live feedback that helps before submitting (the existing password length counter "Llevás 7 de 12." is that case). | `STANDARD` platform (GOV.UK); contested by NN/g and Baymard, see section 6 | [G4] [G3] [N9] [R1] [R4] |
| Error messages | Instruction for an empty field ("Escribí tu DNI."), description for a wrong one ("La contraseña tiene que tener al menos 12 caracteres."). No "inválido", no error codes, no blame. Same words in summary and field. Red plus an icon or the word "Error", never colour alone. | `STANDARD` WCAG 3.3.1 A, 3.3.3 AA, 1.4.1 A; platform | [G2] [N4] [W1] |
| Required / optional | Braja's forms are short and almost every field is required. Mark the few optional ones "(opcional)" in the label, as GOV.UK and USWDS both say; do not rely on a sentence at the top. Whether to add an asterisk to required fields is contested (section 6). | `STANDARD` platform; `EVIDENCE` A partly (checkout forms) | [G1] [U2] [N19] [R5] |
| Grouping | Related controls in a `fieldset` with one `legend` (the motive category radios already do this); single column; controls in DOM order. | `STANDARD` WCAG 1.3.1 A; platform | [U2] [W1] |
| One thing per page vs long form | Use one thing per screen where the user is a novice doing something once or rarely: forced password change, creating the first site, first employee. Use a single compact form for what the ADMIN repeats (declare a day, correct a mark). GOV.UK's own exception is an internal service whose users "need to repeat and switch between tasks quickly"; NN/g: "Use wizards for novice users or infrequent processes", they "can quickly become annoying" when repeated. The service-manual page cites no data. | `STANDARD` platform; `EVIDENCE` B | [G8] [G1] [N27] |
| Progress indicator in steps | Not needed by default. GOV.UK: "Start by testing your form without a progress indicator"; removing a 12-step indicator had "no effect on completion rates or times". | `EVIDENCE` B (one reported case) | [G1] |
| Input types | `inputmode="numeric"` for DNI (present), not `type="number"`; `autocomplete` on login fields (present); never block paste (not blocked); `font-size` of inputs at least 16 px so iOS does not zoom the page on focus (present: `1rem`). | `STANDARD` WCAG 1.3.5 AA, 3.3.8 AA; platform | [G9] [G13] [W8] [R16] |
| Dates | Native date picker is appropriate for dates near today ("within less than a year"), which is every date in Braja; also let people type. Avoid three dropdowns. GOV.UK's three-field input is for dates people already know, such as a birth date. | `EVIDENCE` B; `STANDARD` platform | [N33] [G12] |
| Password | "Mostrar contraseña" toggle (present), hidden by default. GOV.UK considers a "repeat password" field unnecessary when there is a show toggle, but says it wants "real life examples" to support that. WCAG 3.3.7 exempts password confirmation. Removing the repeat field is an option to test, not a finding. | `STANDARD` platform (weak); WCAG 3.3.7 A | [G13] [W7] |
| Accepting input | Accept DNI with dots or spaces and strip them (the backend normalises to digits). NN/g observed older users being penalised for typos and for typing hyphens or parentheses in numbers. | `EVIDENCE` B; COGA 4.5.4 | [N5] [N30] [W17] |

### 2.5 Navigation for seven ADMIN sections

Sections today: Primeros pasos, Bandeja, Jornadas, Historial | Sedes, Horarios, Empleados. In CSS, below 760 px the sidebar becomes a horizontally scrolling strip, and below 520 px the seven links wrap into several rows that are not sticky.

1. **Phone: a persistent bar with 3 or 4 daily destinations plus "Más" that opens the configuration group.** Limits: Android "Three to five destinations of equal importance" [P5]; "Navigation bars can have three to five destinations" [P4]; NN/g: with more than five options "it's hard to fit them in a tab or navigation bar", and with more than 4 top-level links hiding some is "the only reasonable solution" [N13] [N6]. A combination of visible and hidden links performed close to fully visible navigation and far better than fully hidden [N6]. — `STANDARD` platform; `EVIDENCE` A.
2. **What goes behind "Más" is what is rare after setup** (Sedes, Horarios, Empleados, Primeros pasos once complete). This is the progressive-disclosure condition "get the right split between initial and secondary features" [N3]. Apple warns that an overflow tab "makes it harder for people to reach and notice content on tabs that are hidden" [P1], so the split must follow frequency, and frequency in Braja is an assumption until measured. During first-run the configuration sections are the main task: the "Primeros pasos" checklist then acts as the hub that links to each of them (the "navigation hub" pattern, which "can work well in task-based websites and apps" [N13]). — `EVIDENCE` B.
3. **Do not use a horizontally scrolling strip of seven.** Carousel bars "may work but they are not always appropriate"; "Out of sight is out of mind" [N13]. — `EVIDENCE` B.
4. **Every item has a text label, one or two words; icons optional.** Apple: "Include tab labels to help with navigation"; NN/g: labels are "a recommended best practice in most cases" [P1] [N13] [N12]. Do not use Material's "selected only" label mode. — `STANDARD` platform; `EVIDENCE` B.
5. **Mark the current section with at least two cues** (for example weight plus a bar or background), not colour alone; set `aria-current="page"` (present). — `EVIDENCE` B [N21]; `STANDARD` WCAG 1.4.1 A.
6. **Desktop (1366 px): keep the grouped vertical sidebar.** Visible navigation was used in 48% of desktop cases against 27% for hidden, and hidden navigation was "at least 39% slower" [N6]. Group captions should be sentence case and not 12 px (section 4). — `EVIDENCE` A.
7. **Tablet (768 px):** the sidebar still fits; a navigation rail is the Material answer but I could not read that guidance (m3 unreadable). Keep one pattern for tablet and desktop. — `PREFERENCE`.
8. **Bottom or top on phones?** I found no comparative study. Bottom is the iOS and Android convention [P1] [P4]; NN/g describes tab bars as sitting at the top or the bottom without ranking the two [N13]. Choose bottom for consistency with the platforms the users already know, and state it as convention. Keep the bar clear of the fixed "Alertas en este dispositivo" bar and of the iOS home indicator (safe-area insets), and respect WCAG 2.4.11. — `PREFERENCE` (platform convention); `STANDARD` WCAG 2.4.11 AA.
9. **Same order on every screen and every width where possible.** — `STANDARD` WCAG 3.2.3 AA.
10. **In-page tabs** (inside Jornadas, for example) only for clearly separate content that is not compared and not sequential; 1 or 2 words; one row; "Tabs hide content from users and not everyone will notice them or understand how they work"; GOV.UK's tabs component "has not yet been tried in research with users". For a phone, headings on one page or an accordion are safer. — `EVIDENCE` B [N21]; `STANDARD` platform (untested, by its own statement) [G15].
11. **Employee app:** it has one screen; it needs no navigation bar. "Ver otros días" is progressive disclosure, correctly secondary. — follows P2, P9.

### 2.6 Confirmation and destructive actions

1. **Confirm only what is serious and cannot be easily undone**: anular una marca, cancelar una jornada, dar de baja a un empleado, cambiar la ubicación de una sede. Not: guardar, filtrar, enviar un motivo. — `EVIDENCE` B [N8]; brief S6 ("No agregues … confirmaciones únicamente para que la interfaz parezca más completa").
2. **The confirmation names the thing and the consequence, and the buttons name the actions**: "¿Anular la entrada de Marta Gómez de las 8:02? Va a quedar tachada en el historial." Buttons: "Anular la marca" / "No anular". Never "Sí / No" or "Aceptar / Cancelar". — `EVIDENCE` B [N8]; COGA 4.8.3 "clearly explain the benefits, risks and consequences of each option" [W17].
3. **Where the action needs a written reason (correction, cancellation, classification change), the reason field is the confirmation step.** Do not add a second dialog on top. — derives from [N8]; `PREFERENCE`.
4. **Red styling is not enough**: "Do not only rely on the red colour of a warning button to communicate the serious nature of the action"; GOV.UK puts the warning button on the final confirmation step, not on the first click. — `STANDARD` platform [G11].
5. **Undo instead of confirm** is only available where the business rules already allow reversal (an employee can correct a motive until it is classified; an ADMIN can re-classify with a reason). Do not invent undo where an audit row is written; a visual refactor adds no feature. "Undo is better than a warning" as a general rule is expert opinion without data [R2]; NN/g supports undo but as a complement [N8] [N31]. — `PREFERENCE` as a rule; `STANDARD` WCAG 3.3.4 AA is satisfied by any of reversible, checked or confirmed.
6. **Keep destructive controls physically apart from routine ones and visually different by more than colour.** — `EVIDENCE` B [N31].

### 2.7 Feedback and system status

| Situation | Recommendation | Class | Sources |
|---|---|---|---|
| Under 1 s | No indicator; show the result. | `EVIDENCE` B (old sources) | [N15] [N28] |
| 1 to 10 s | Looping indicator plus text saying what is happening ("Cargando las jornadas…"). A static "loading" message without motion is discouraged. | `EVIDENCE` B; one cited experiment: people with a progress animation waited about 3 times longer | [N16] |
| Over 10 s | Say it is taking longer and what the user can do. Braja has no long batch that reports percentage; do not fake one. | `EVIDENCE` B | [N15] [N16] |
| Full-screen first load | A spinner with text is enough. Skeleton screens are recommended by NN/g for full-page loads, but the evidence that they feel faster is one cited paper whose method the article does not describe. Treat as optional polish. | `PREFERENCE` (weak evidence) | [N28] |
| Success after a save | Inline message next to what changed, persistent until the next action, `role="status"`. Remove a success message when the user moves to another screen. | `STANDARD` WCAG 4.1.3 AA; platform | [W13] [G17] |
| Failure | Inline, next to the action, `role="alert"` only when it is important and time-sensitive (W3C lists overuse of `alert` as a failure). Say whether the data was saved: GOV.UK's wording pattern is "We have not saved your answers." Braja already does this ("Tu marca no se registró", "Lo que escribiste sigue acá"). | `STANDARD` WCAG 4.1.3 AA, 3.3.1 A; platform | [W13] [G18] |
| Server-confirmed vs optimistic | Server-confirmed for every write. See P1 and section 6. | brief S8; `EVIDENCE` B | [N22] [R14] |
| Banners | Sparingly: "evidence that people often miss them". The setup coverage notice is the legitimate use (a deadline the user must know about). | `STANDARD` platform | [G17] |
| Service problem | Plain page or message: what happened, whether work was saved, what to do; no codes such as "500"; no red text used as a warning. | `STANDARD` platform (tested with five users) | [G18] |

### 2.8 Onboarding, first-run guide and contextual help

1. **Keep "Primeros pasos" as a task list, not a tour.** GOV.UK: use a task list when users "do not want to, or cannot, complete all the tasks in one sitting"; group steps, name them with verbs ("Cargá tu primer local"), show a status per step. — `STANDARD` platform [G6] [G7].
2. **Status wording**: few statuses, adjectives, sentence case; "Completed" plain so that what remains stands out; "Cannot start yet" for a step that depends on another. Proposed: "Listo", "Falta", "Todavía no se puede". GOV.UK says its own status wording still needs testing. — `STANDARD` platform (untested, by its own statement) [G6] [G7].
3. **The whole row is the link**, because users tried to tap the status chip [G7]. — `EVIDENCE` B.
4. **No slideshow or coach marks.** "tutorials didn't improve task performance"; instructions should be "brief, optional". — `EVIDENCE` B [N18].
5. **Contextual help where the question arises**: one sentence under the field (why the app asks for the site's location; what "tolerancia" does to a late arrival). Use a collapsed "¿Qué es esto?" only for what a minority needs, knowing that some users will not open it [G14]. — `EVIDENCE` B [N18] [N2] [G9].
6. **Empty states carry the teaching** (2.9). — `EVIDENCE` B [N17].
7. **Help in a consistent place**, and name the human: "¿Algo no coincide? Avisale a tu encargado." — `STANDARD` WCAG 3.2.6 A if repeated; COGA 4.8.1 [W6] [W17].

### 2.9 Empty states

Three jobs, from NN/g's guidelines (examples-based article, no study): communicate system status, teach, and give a direct path [N17]. Class for all: `EVIDENCE` B.

1. **Distinguish four cases with different words**: still loading; loaded and nothing exists yet; loaded and the filter matches nothing; failed to load (with "Reintentar"). The current code already separates failed from empty in several panels.
2. **Nothing exists yet → say what will appear here and offer the action**: "Todavía no cargaste ningún local. Cargá el primero para que tus empleados puedan marcar." + button.
3. **Nothing to do → say it is fine**: "No tenés nada para explicar." (present). For the employee with no shift today: say what to do ("Hoy no tenés un turno cargado. Si creés que es un error, avisale a tu encargado.").
4. **Filter matches nothing → say so and offer to clear the filter**; announce with `role="status"` [W13].
5. **Do not hide a disabled section**: "If a section is empty, explain why its content is unavailable" [P1].

### 2.10 Plain language and terminology for low tech-literacy users

1. **Short sentences, common words, active voice, the main point first.** A rewrite along these lines raised task success for lower- and higher-literacy users alike, and cut time by more than half (n = 50, one pharmaceutical site, 2005) [N11]. Experts also prefer it [N26]; GOV.UK cites a study in which 80% preferred clear sentences, more so with more education [G19, secondary]. — `EVIDENCE` A (one old study on a content site; transfer to app microcopy is an inference).
2. **Lower-literacy readers do not scan; they read word by word, skip dense blocks, and lose their place when scrolling** [N11]. Consequences for Braja: one column, the main action and its result on the first screen, no paragraph over two or three lines on a phone, no information carried only by a side note. — `EVIDENCE` A (same study).
3. **Sentence length**: GOV.UK says split sentences over 25 words [G19]. For buttons and labels aim for 1 to 4 words; for help text one sentence. — `STANDARD` platform; the number is a convention.
4. **Rioplatense voseo, consistently** ("Ingresá", "Tocá", "Elegí"), already used. I found no research on voseo vs "usted" for older Argentine users; it is the brief's requirement ("Español natural y comprensible para usuarios de Argentina") and matches the WhatsApp register the hypothesis assumes. One inconsistency seen in source: "Bienvenido" (gendered) on login. — `PREFERENCE`.
5. **Argentine plain-language guidance exists but is institutional, not empirical.** A judicial guide hosted by the Buenos Aires City judiciary recommends: "Utilizar vocabulario corriente y evitar tecnicismos cuando estos son innecesarios", "Utilizar oraciones cortas", "Evitar el uso excesivo de la voz pasiva; primero indicar al sujeto, luego el verbo y por último el objeto" [R18]. The City's Programa Lenguaje Claro (Ley 6.367) has the same aim for administrative texts [R19]. — `PREFERENCE` (institutional guidance; written for legal texts).
6. **Terms to test before deciding** (hypotheses, not findings): "jornada" (día de trabajo / turno), "desvío" (the code already says "Para explicar" to the employee and "Falta explicar" for the state), "plantilla" (already shown as "Horarios" in the nav; forms should match), "sede" vs "local" (both appear: nav "Sedes", fallback text "Local", table header "Locales"), "bandeja", "tolerancia", "egreso" vs "salida" (employee copy says "salida", ADMIN copy says "Egreso"). Having two words for one thing is the part that is supported by a standard (WCAG 3.2.4 AA, heuristic 4) regardless of which word wins. — `STANDARD` for consistency; choice of word unknown.
7. **Literal language, no metaphors or system states in capitals** ("PENDIENTE_REVISION" must never reach the screen; it does not today). COGA 4.4.4 "Use literal and concrete language". — `EVIDENCE` B [W17].
8. **Times and dates in the local everyday form** ("8:02", "lunes 9 de noviembre"), not ISO. COGA "Use Familiar Metrics and Units". — `EVIDENCE` B [W17].

### 2.11 Older adults (vision, motor, anxiety about breaking things)

Caveat: the cited populations are 65+; Braja's hypothesis is 45 to 65.

1. **Vision.** Contrast sensitivity starts to decline from about 40 and near focus worsens [W19, a 2008 W3C draft literature review, partly built on secondary sources]; NN/g reports that people in their 40s already need somewhat larger fonts and that mobile text was often too small and lightly coloured [N5]. → section 4. — `EVIDENCE` B.
2. **Motor.** NN/g reports that buttons, dropdowns and links are often too small for older users to tap; a participant: "I fat-fingered that one" [N5]. Measured: accuracy fell significantly below 14 mm for people 65 to 95, was acceptable above 10.5 mm, and spacing between targets made no significant difference [R12]. → large primary targets; do not shrink targets and add gaps instead. — `EVIDENCE` A.
3. **Fear of breaking things.** Reported by coaches of older learners: "Fear of making a mistake", worry about "breaking something" [W19]; NN/g reports that older users commonly blame themselves for errors [N5]. NN/g also notes that today's older users are more confident than in 2001. Design consequences: always a visible way back ("Volver", "Cancelar" that changes nothing and says so), consequences stated before the action (2.6), errors that blame the system, never the person, nothing that happens on a timer. — `EVIDENCE` B.
4. **Forgiving input and no time pressure.** Accept more than one format [N5]; no auto-dismissing messages (2.2.1). — `EVIDENCE` B; `STANDARD` WCAG 2.2.1 A.
5. **Stability.** Controls do not move between visits or states; a button does not change place when it changes label (COGA 4.5.1 "Ensure Controls and Content Do Not Move Unexpectedly"; Apple: "Don't disable or hide tab bar buttons"). — `EVIDENCE` B [W17]; `STANDARD` platform [P1].
6. **Age slows reading and makes a poor font choice cost more**, but there is no single best font [N23]. → section 4. — `EVIDENCE` A.
7. **Dragging.** Any drag (the map) needs a tap alternative. — `STANDARD` WCAG 2.5.7 AA [W5].

### 2.12 Unstable connections

No research was found; web.dev's guidance is practitioner advice with no study cited [R14]. Class for the list: `PREFERENCE` unless stated.

1. **State the connection problem in the user's terms and say what happened to their action.** "Clearly inform the user when a change in state occurs"; "Tell the user what state their data is in"; avoid terms "non-technical users probably won't know" [R14]. Braja already has distinct messages for no network, timeout and server restart.
2. **No offline queue is a hard rule of the product.** So the UI must never suggest that a mark will "be sent later". The correct message is the existing one: not registered, try again when the connection returns.
3. **Retry is a visible button next to the message**, not an automatic silent loop the user cannot see; the same button retries safely (idempotency key reused). — `EVIDENCE` B for reducing error-correction effort [N4].
4. **Never lose typed text on a failed request** (motive text, bulk-load form). — `EVIDENCE` B [N4]; COGA 4.5.9 [W17].
5. **Slow is not broken**: immediate acknowledgement of the tap, then the status line (2.7). "An unstable connection makes your app feel untrustworthy" [R14].
6. **The app shell loads without network** (it is a PWA with Workbox), so an offline open should show the screen with a clear "Sin conexión" state and the action explained, not a browser error. Whether the current service worker does this is for T2/T4 to confirm.
7. **Weight**: system fonts only (the CSP forbids external fonts anyway), no heavy imagery; the map is already a separate chunk.

---

## 3. WCAG 2.2 AA checklist for this app

### 3.1 Criteria new in WCAG 2.2

WCAG 2.2 added nine criteria and removed 4.1.1 Parsing [W9]. Six are A or AA and apply here.

| SC | Level | What it requires (normative text, extracts) | Where it bites in Braja | How to check |
|---|---|---|---|---|
| **2.4.11 Focus Not Obscured (Minimum)** | AA | "When a user interface component receives keyboard focus, the component is not entirely hidden due to author-created content." | Sticky top bar; the fixed "Alertas en este dispositivo" bar; a new bottom navigation bar; the install prompt. `styles.css` already sets `scroll-padding` for the first two (technique C43). A new bottom bar must be added to that padding. | Tab through every screen at 320 px and 1366 px; no focused control fully covered. |
| **2.5.7 Dragging Movements** | AA | "All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging, unless dragging is essential or the functionality is determined by the user agent and not modified by the author." A keyboard alternative alone does not satisfy it; a text input can. | The site map picker. Placing the point is a tap; panning is a drag. Alternatives that already exist: address search, zoom buttons, manual latitude/longitude. Confirm that the point can be set and the view moved without any drag. | Operate the map with single taps only. |
| **2.5.8 Target Size (Minimum)** | AA | See 3.2. | Inline text links, checkboxes in tables (`td input[type=checkbox] { min-height: 24px }`), close icons, chips that act as buttons, map controls. | Measure every target under 44 px; under 24 px needs spacing or an exception. |
| **3.2.6 Consistent Help** | A | If a help mechanism (human contact details, human contact mechanism, self-help option, automated contact) is "repeated on multiple web pages", it occurs "in the same order relative to other page content". "It is not the intent of this success criterion to require authors to provide help". A different position in a smaller viewport is allowed. | Today the only help line is on login ("¿Te olvidaste la clave? Pedile al encargado una nueva."). If the redesign adds "avisale a tu encargado" or a help link on several screens, it must sit in the same relative place on all of them. | Compare the DOM order of help across screens at the same width. |
| **3.3.7 Redundant Entry** | A | Information "previously entered by or provided to the user that is required to be entered again in the same process" is auto-populated or selectable, except when essential, for security, or no longer valid. Not across sessions. Password confirmation is covered by the security exception. | Multi-step ADMIN flows: after creating a site, the schedule form should already have that site selected; bulk-load should keep employee and range between steps. Forced password change asks again for the password just typed at login: this falls under the security exception, but it is a usability cost for hesitant users. | Walk each multi-step flow; nothing typed twice. |
| **3.3.8 Accessible Authentication (Minimum)** | AA | "A cognitive function test (such as remembering a password or solving a puzzle) is not required for any step" unless there is an alternative or "A mechanism is available to assist the user". Password managers and paste are such mechanisms; blocking paste fails. | Login with DNI and password. `autocomplete="username"` / `current-password` / `new-password` are set, paste is not blocked, a show-password toggle exists. Passes by mechanism as long as none of that is removed. No CAPTCHA may be added. | Sign in with a password manager and with paste. |

Not in scope for AA but worth knowing: 2.4.13 Focus Appearance (AAA) and 2.5.5 Target Size (Enhanced) (AAA).

### 3.2 What 2.5.8 requires, and where "44 × 44" comes from

- **2.5.8 Target Size (Minimum), Level AA**: "The size of the target for pointer inputs is at least 24 by 24 CSS pixels, except when:"
  - **Spacing**: undersized targets are positioned so that "if a 24 CSS pixel diameter circle is centered on the bounding box of each, the circles do not intersect another target or the circle for another undersized target". Example from W3C: 20 px buttons with a 4 px gap pass; the same buttons with no gap fail.
  - **Equivalent**: "The function can be achieved through a different control on the same page that meets this criterion".
  - **Inline**: "The target is in a sentence or its size is otherwise constrained by the line-height of non-target text".
  - **User agent control**: size "determined by the user agent and is not modified by the author" (an unstyled native checkbox, for example).
  - **Essential**: a particular presentation "is essential or is legally required". [W2]
- **2.5.5 Target Size (Enhanced), Level AAA**: "The size of the target for pointer inputs is at least 44 by 44 CSS pixels except when" equivalent, inline, user agent control or essential. Note it has **no spacing exception**. The W3C page gives no research basis for the number 44. [W3]
- **Apple HIG**: default control size 44 × 44 pt on iOS, with a stated minimum of 28 × 28 pt, and "about 12 points of padding around elements that include a bezel" [P2].
- **Android**: "Consider making sure these elements have a width and height of at least 48dp", about 9 mm [P3].
- **NN/g**: 1 cm × 1 cm, expressed physically on purpose [N14].

**Consequence for `docs/UX_UI_GUIDELINES.md`:** the brief's "procurar áreas de interacción de aproximadamente 44 × 44 píxeles cuando el diseño lo permita" is a sound working target, but it must not be written as "WCAG 2.2 AA requires 44". The accurate wording is: AA requires 24 × 24 CSS px (with the exceptions above); 44 × 44 is the AAA value and the Apple default; Braja adopts 44 as its own minimum and a larger size for the clocking actions. The existing token `--tap-target: 44px` already encodes that choice. Evidence for going above 44 on the primary action is in [R12] and [N14]; 44 px is roughly 8 mm, below both.

### 3.3 Classic criteria that matter here

| SC | Level | Requirement (extract) | Where it bites in Braja |
|---|---|---|---|
| 1.3.1 Info and Relationships | A | Structure conveyed visually is programmatically determinable. | One `h1` per screen, real headings for panels, `th scope` in tables, `fieldset`/`legend`, lists for lists. Stacked rows on phones must keep label-value association. |
| 1.3.4 Orientation | AA | Content "does not restrict its view and operation to a single display orientation". | Do not lock the PWA manifest to portrait. |
| 1.3.5 Identify Input Purpose | AA | "The purpose of each input field collecting information about the user can be programmatically determined". | Login and password change (`autocomplete` present). It concerns data about the user, not the employee data an ADMIN types about others. |
| 1.4.1 Use of Color | A | "Color is not used as the only visual means of conveying information". | Status chips, error fields, the active nav item, the "anulada" mark (already struck through and labelled). |
| 1.4.3 Contrast (Minimum) | AA | Text 4.5:1; large text 3:1. Large = "at least 18 point or 14 point bold", about 24 px, or 18.5 px bold. Applies to placeholder text. Inactive components and logotypes are exempt. | Almost all Braja text is below the large-text threshold, so 4.5:1 applies nearly everywhere, including muted and tertiary text, chips, hints, and text over tinted backgrounds. Disabled buttons (`opacity: .68`) are exempt, which is exactly why they can be unreadable. |
| 1.4.4 Resize Text | AA | Text "can be resized without assistive technology up to 200 percent without loss of content or functionality". | Sizes are in `rem` (good); fixed heights such as `--topbar-height: 70px` and `--alerts-bar-clearance: 124px` need checking at 200%. The viewport meta does not block zoom (good). |
| 1.4.10 Reflow | AA | No loss of information or functionality and no two-dimensional scrolling at "a width equivalent to 320 CSS pixels", "Except for parts of the content which require two-dimensional layout for usage or meaning". Data tables and maps are excepted as a whole; each cell still has to reflow; a table in its own scroll container passes while the surrounding content must reflow. | Tables in `.table-scroll` are acceptable; the page around them must not scroll sideways. The map is excepted. Long unbroken strings (company names, DNI lists) must wrap. `body { min-width: 320px }` is consistent with the criterion. |
| 1.4.11 Non-text Contrast | AA | 3:1 against adjacent colours for "Visual information required to identify user interface components and states" and for meaningful graphics. W3C example: an input border of `#AAA` on white fails, `#767676` passes. | Input borders, checkbox and radio outlines, the focus ring, the active-tab indicator, icons that carry meaning, the timeline points. Inputs use `--text-tertiary` for their border (to be measured by T4); the light lines (`--line #e4e9e5`, `#e5ebe6`) are fine as decoration but would fail as the only boundary of a control. |
| 1.4.12 Text Spacing | AA | No loss of content or functionality when the user sets line height 1.5, paragraph spacing 2×, letter spacing 0.12×, word spacing 0.16× the font size. | Buttons and chips with fixed heights, single-line nav items, table cells. Authors do not have to use these values, only tolerate them. |
| 1.4.13 Content on Hover or Focus | AA | Extra content shown on hover or focus is dismissible, hoverable and persistent. | Avoid tooltips; none should carry needed information on touch anyway. |
| 2.1.1 Keyboard | A | All functionality operable by keyboard. | Map picker, `<details>` folds, custom radio cards, journey picker. |
| 2.2.1 Timing Adjustable | A | For each time limit set by the content, the user can turn it off, adjust it, or is warned and can extend it with at least 20 seconds to respond, unless real-time, essential, or "The time limit is longer than 20 hours". A security timeout still counts as set by the content. | The employee session (30 idle days) is over 20 hours: exempt. **The ADMIN session (30 idle minutes) is not exempt.** Without a warning and a way to extend, it is a likely Level A gap, and it can destroy a long form. Changing the duration is a backend decision (D-20261109-02) and out of scope; a front-end warning with "Seguir conectado" would be new behaviour and therefore a proposal for the owner, not part of the refactor. Auto-dismissing messages are also time limits. To be confirmed by T4. |
| 2.4.3 Focus Order | A | Focus order preserves meaning and operability. | After a mark, focus goes to the result (the code moves it to the feedback region); after opening a form from a list, focus goes into the form; after closing, back to the trigger. |
| 2.4.6 Headings and Labels | AA | "Headings and labels describe topic or purpose." | Screen titles that answer "¿Dónde estoy?" (S1). Eyebrows such as "CUENTA COMPARTIDA" are not headings and add little. |
| 2.4.7 Focus Visible | AA | "Any keyboard operable user interface has a mode of operation where the keyboard focus indicator is visible." | The stylesheet removes the native outline on inputs but defines a global `:focus-visible` outline (3 px, `--focus`). Every new component (bottom bar items, stacked rows that act as links, custom radio cards) must keep it, and it must meet 1.4.11. |
| 2.5.2 Pointer Cancellation | A | No action on the down-event unless it can be aborted or undone. | The clocking button must fire on release (`click`), never on `pointerdown`. |
| 2.5.3 Label in Name | A | For components with visible text labels, "the name contains the text that is presented visually". | Icon-plus-text nav items; do not override visible text with a different `aria-label`. |
| 3.1.1 Language of Page | A | "The default human language of each web page can be programmatically determined." | `index.html` has `lang="es-AR"` (pass). |
| 3.2.2 On Input | A | Changing a control's setting does not cause a change of context unless the user was told. | The company switcher and the date field in "Ver otros días" change content on selection: acceptable if it is not a change of context, or if announced. |
| 3.2.3 Consistent Navigation | AA | Repeated navigation occurs "in the same relative order each time". | "Primeros pasos" moves from first to last in the nav when setup completes. A move triggered by state, not by the user, is a risk for this criterion and for stability (2.11.5). Consider a fixed position. |
| 3.2.4 Consistent Identification | AA | "Components that have the same functionality within a set of web pages are identified consistently." | "Reintentar" vs "Actualizar"; "Sede" vs "Local"; "Egreso" vs "Salida"; "Falta motivo" (ADMIN) vs "Falta explicar" (employee) for the same state. |
| 3.3.1 Error Identification | A | "If an input error is automatically detected, the item that is in error is identified and the error is described to the user in text." | Auth screens show one message at the top of the card and do not mark which field is wrong. |
| 3.3.2 Labels or Instructions | A | "Labels or instructions are provided when content requires user input." | Format expectations (12-character password, DNI digits) stated before the user types. |
| 3.3.3 Error Suggestion | AA | If suggestions for correction are known, they are provided, unless that would jeopardise security. | "Las contraseñas nuevas no coinciden." should say what to do. Login errors stay neutral by design (security exception). |
| 3.3.4 Error Prevention (Legal, Financial, Data) | AA | For pages "that modify or delete user-controllable data in data storage systems", at least one of: "Submissions are reversible", data is checked and the user can correct it, or "A mechanism is available for reviewing, confirming, and correcting information before finalizing the submission." The intent is serious or mass data loss, not every save. | Marks are labour records: arguably in scope. Voiding a mark, cancelling a day, bulk-loading up to 200 employees × 31 days. The bulk-load preview and the exit confirmation are the "confirmed" route. |
| 4.1.2 Name, Role, Value | A | Name and role programmatically determinable; states settable; changes notified. | `aria-pressed` on the journey picker and password toggle, `aria-current` on nav, `aria-invalid` on fields, `<details>` state. |
| 4.1.3 Status Messages | AA | "status messages can be programmatically determined through role or properties such that they can be presented to the user by assistive technologies without receiving focus." Success and result counts: `role="status"`; errors: `role="alert"`. Using `alert` for unimportant content is a listed failure. | The code already uses `role="status"` and `role="alert"` widely. Any new inline success or result-count message needs the same; do not turn everything into `alert`. |

---

## 4. Typography and colour for legibility

Each claim is classified. Phones here are assumed to be small Android devices; StatCounter's most common mobile viewports for Argentina in October 2026 are 384 × 832 (8.23%), 412 × 915, 385 × 854, 414 × 896 and 360 × 800 [R17] — all 360 px wide or more, so 320 px is a conformance and worst-case width (WCAG 1.4.10), not the typical one.

### 4.1 Size

| Claim | Class | Sources and limits |
|---|---|---|
| WCAG 2.2 AA sets no minimum font size. It requires that text can be enlarged to 200% (1.4.4), reflow at 320 px (1.4.10) and tolerate spacing changes (1.4.12). | `STANDARD` WCAG | [W1] [W10] [W14]. None of the criteria read sets a size. |
| Body text at 16 px or more. | `STANDARD` platform | USWDS: "For most text, including body copy, use at least an effective size of 16px" [U1]. GOV.UK: body 19 px on small and large screens; 16 px is its smallest style [G10]. Apple: default 17 pt, minimum 11 pt for iOS system styles [P2]. |
| Larger text is read faster and understood better, up to about 18 pt. | `EVIDENCE` A, **limited transfer** | Rello, Pielot and Marcos: 104 participants aged 14 to 54, eye tracking, six sizes from 10 to 26 pt, Wikipedia articles on a desktop screen: "Up to a font size of 18 points, subjective and objective readability as well as comprehension improved continuously" [R13, read through a secondary summary; the ACM page was blocked]. Desktop viewing distance, no older adults, long-form reading. It supports "do not go small", not a specific phone size. |
| Older adults read better online with larger sans-serif type (12 vs 14 pt). | `EVIDENCE` B (secondary) | Bernard, Liao and Mills, as reported in the W3C draft review [W19]; primary not opened. Desktop, early 2000s. |
| More than a fifth of mobile users enlarge the system font. | `EVIDENCE` A (thin) | Appt, Netherlands: "more than a fifth of users normally increase the text size on iOS and on Android"; the page gives no sample size [R15]. Whether a given browser applies the system font scale to a PWA must be tested on real devices; I did not verify it. |
| Input text under 16 px makes iOS Safari zoom the page on focus. | implementation fact | [R16]. Braja's inputs are `1rem` (fine). |

**Applied to Braja.** The stylesheet has 34 `font-size: .875rem` (14 px) declarations, 8 at 13 px and 2 at 12 px, against 9 at 16 px. That is below every platform value above for body text. Recommended scale (design choice within the guidance): body and controls 16 px minimum, preferably 17 to 18 px in the employee app; secondary text 16 px with lower emphasis through colour or weight that still meets 4.5:1, not through size; nothing below 14 px, and 14 px only for non-essential metadata; times and the primary action label 20 px or more. All in `rem`.

### 4.2 Line length, line height, alignment

| Claim | Class | Sources and limits |
|---|---|---|
| 45 to 90 characters per line; about 66 for long text. | `STANDARD` platform / `PREFERENCE` | USWDS [U1]. Baymard traces 50 to 60 to the typographer Emil Ruder and reports only qualitative observations for "100+ characters" [R6]. WCAG 1.4.8 (AAA, not required) caps at 80 and cites a study only for CJK width [W20]. This is typographic convention with thin empirical backing. |
| Body line height at least 1.5; headings 1 to 1.35. | `STANDARD` platform | USWDS [U1]. WCAG 1.4.12 requires tolerating 1.5, not using it. In the one study read, line spacing mattered much less than size [R13]. |
| Left-aligned, not justified. | `STANDARD` platform | USWDS "Set type flush left" [U1]; WCAG 1.4.8 AAA. |

**Applied.** On phones lines are naturally short; the risk is the opposite on the 1366 px ADMIN layout, where help text and panels can run past 100 characters. Cap text blocks at about 70 to 75 characters (`max-width` in `ch`).

### 4.3 Typeface, weight, case

| Claim | Class | Sources and limits |
|---|---|---|
| There is no single most legible font; differences between individuals are large and people cannot pick their own fastest font. | `EVIDENCE` A | Wallace et al. 2022, 352 participants, 16 fonts: 35% difference between each person's fastest and slowest font; reading speed fell about 1.5 words per minute per year of age; people read 14% faster in their fastest font than in their preferred one [N23, secondary]. So "tipografía especialmente legible" (S7) cannot be met by choosing a magic typeface. Size, contrast, spacing and a plain, familiar design matter more. |
| Use the system font stack. | `PREFERENCE` + constraint | The CSP forbids external fonts; system fonts are what users read all day in WhatsApp; zero download. No evidence that a custom font would be better. |
| Avoid thin weights; avoid long runs of bold or italic. | `STANDARD` platform (no data cited) | Apple: with a thin weight "aim for larger than the recommended sizes" [P2]; USWDS: "Both italic and bold text can degrade readability" [U1]. One small eye-tracking test found bold labels slightly slower, and its author doubted the result [R3]. Use regular (400) for body, semibold for labels and buttons, bold sparingly. |
| ALL CAPS is harder to read. | **contested** | USWDS: "Uppercase text has a serious negative effect on readability" (no citation) [U1]; NN/g advises against all-caps tab labels [N21]. But Arditi and Cho (2007) found the opposite for legibility: "upper-case is more legible than the other case styles, especially for visually-impaired readers", with reading speed higher for upper case at small sizes and no difference at larger sizes [R9]. Conclusion: do not justify sentence case with "caps are illegible". Justify it with consistency, tone ("amigable, pero no infantil") and the design-system convention [G7] [G11] [U5]. The real problem with the current eyebrows and sidebar captions is that they are 12 px, letter-spaced, low-emphasis text that adds little, not that they are capitals. |
| Numerals for times should be unambiguous and aligned. | `PREFERENCE` | No source opened. Tabular figures (`font-variant-numeric: tabular-nums`) in the marks list is a low-cost choice. |

### 4.4 Colour and contrast

| Claim | Class | Sources and limits |
|---|---|---|
| Text contrast at least 4.5:1 (3:1 only from about 24 px, or 18.5 px bold). | `STANDARD` WCAG 1.4.3 AA | [W11]. The 4.5:1 value was chosen to compensate for the contrast-sensitivity loss of roughly 20/40 vision, "commonly reported as typical visual acuity of elders at roughly age 80". |
| Controls and meaningful graphics at least 3:1 against adjacent colours. | `STANDARD` WCAG 1.4.11 AA | [W12]. |
| Never colour alone for state. | `STANDARD` WCAG 1.4.1 A | [W1]. Red/green for justified/not justified needs words (present) and ideally an icon. |
| Low-contrast text hurts legibility, discoverability and confidence, and is worst in glare. | `EVIDENCE` B | NN/g [N20], no study cited. Phones are used at shop entrances and outdoors. |
| Aim above the minimum for body text (7:1 is the AAA value). | `STANDARD` WCAG 1.4.6 AAA (optional) / `PREFERENCE` | Mentioned in [W18]. For a product read by people over 45 in daylight, dark text near `#18241f` on white or near-white is cheap insurance. Not required. |
| Disabled controls are exempt from contrast, which makes them hard to read; both government design systems say to avoid them. | `STANDARD` WCAG (exemption) + platform | [W11] [W12] [G11] [U2] [U5]. |
| A moderate, functional palette: one brand colour for primary actions and current location, one colour each for success, warning and error, neutrals for everything else. | `PREFERENCE` | Matches S7 ("colores moderados y funcionales"). GOV.UK reports that a green start button improved click-through [G11], which says a distinct primary colour helps, not which colour. |
| The WCAG 2 contrast formula has known perceptual limits. | not assessed | Widely discussed; I opened no source on it. WCAG 2.2 AA with the 2.x formula is the conformance target in the brief. |

Current tokens seen in source (not measured here; T4 owns the numbers): `--text-primary #18241f`, `--text-secondary #53645a`, `--text-tertiary #5c6d62`, `--line #e4e9e5`, `--red #a33e35`, primary `#12372a`, accent `--lime #d8f078`. The combinations to measure first: tertiary text on the tinted page background `#f4f7f5`, any text on `--green-3` or lime, and any light line (`--line`) that ends up as the only boundary of a control.

---

## 5. Where the brief and the evidence meet, and where they pull apart

| Brief | What the evidence says | Verdict |
|---|---|---|
| S8: "nunca indicar que una marca fue registrada si el servidor todavía no confirmó su aceptación." | Consistent with heuristic 1, COGA 4.5.10 and offline-UX guidance. No study supports optimistic UI for consequential actions; none was found against it either. | Supported; keep. |
| S9: "procurar áreas de interacción de aproximadamente 44 × 44 píxeles cuando el diseño lo permita", listed under accessibility next to "WCAG 2.2 AA". | AA requires 24 × 24. 44 is AAA and the Apple default. For the main clocking action, the evidence with older adults points well above 44 px. | Not a contradiction, but the guideline must separate the three numbers, and "when the design allows" should not apply to the clocking button. |
| S9: component states include `disabled`. | GOV.UK and USWDS advise avoiding disabled controls; WCAG exempts them from contrast. | Tension. Define the state, restrict its use, and always pair it with a visible reason (the stylesheet already has a "says why the button next to it is disabled" rule). |
| S7: "Con tipografía especialmente legible". | No typeface is best for everyone. Legibility comes from size, contrast and spacing. Current sizes are the issue. | Reframe as a size-and-contrast requirement. |
| S6: "ayudas contextuales breves"; S1: the interface teaches by its own organisation. | Matches NN/g (avoid tutorials, teach in context) and GOV.UK (hint text only when most users need it). | Supported. |
| S6: "No agregues pantallas, pasos ni confirmaciones…" | Matches NN/g on confirmation overuse and wizards. It conflicts with a naive reading of GOV.UK "one thing per page", which GOV.UK itself limits to unfamiliar, infrequent transactions. | Supported; apply one-thing-per-page only to first-run steps. |
| S14: "Las pestañas comuniquen claramente su propósito." | Seven destinations cannot all be visible on a phone under any platform guidance. | Requires a split into visible and "Más"; the split depends on usage frequency, which is assumed, not measured. |
| S11: usability evaluation by an agent, labelled as simulation. | USWDS and GOV.UK both make testing with real users the first principle. No amount of desk research replaces five real employees and one real owner. | The brief's labelling rule is right; the residual risk belongs in deliverable G. |
| S15 priority order (comprehension first, aesthetics seventh). | Consistent with the weight of evidence: the strongest findings here are about language, visible navigation, feedback and target size, none about visual style. | Supported. |

---

## 6. Common "best practices" that are not well supported

1. **"Put primary actions in the thumb zone."** The reach charts were withdrawn by their author; people prefer and are more accurate at the centre of the screen [R7] [R8].
2. **"44 px is the accessible touch size."** It is AAA and an Apple default with no research cited by W3C [W3]. AA is 24 px. The one experiment with older adults supports about 10.5 to 14 mm [R12]; an earlier study with general users supports 9.2 to 9.6 mm [R10].
3. **"Bigger gaps compensate for smaller targets."** Spacing had no significant effect on older adults' accuracy [R12]. WCAG's spacing exception is a conformance device, not a usability finding.
4. **"ALL CAPS is harder to read."** Contradicted for legibility by [R9]; asserted without citation by [U1].
5. **"Lines of 45 to 75 characters are optimal."** Convention from print typography [R6]; WCAG's 80 is AAA and uncited for Latin scripts [W20].
6. **"Font X is the most legible."** No single best font [N23].
7. **"Inline validation is always better."** Wroblewski's often-quoted figures (22% more success, 42% faster) come from 22 participants on one registration form, and the same study found validating before or while typing harmful [R1]. NN/g recommends inline validation on leaving the field [N9]; Baymard agrees and adds positive checkmarks, from e-commerce checkout tests [R4]. GOV.UK says "Do not validate when the user moves away from a field" because it hurts "users who type more slowly" [G4]. USWDS is retiring its live-validation component and reports that screen-reader and magnifier users "did not notice when the validation status changed" [U3]. For Braja's users (slow typists, anxious about errors), the GOV.UK position is the safer default; the question is open, not settled.
8. **"Mark required fields with a red asterisk."** NN/g and USWDS say yes [N19] [U2]; GOV.UK says never, mark optional instead [G1]; Baymard says mark both, from checkout studies [R5]. None of these tested low tech-literacy users on short forms.
9. **"Always add a confirm-password field" / "never add one."** GOV.UK drops it but admits it lacks supporting examples [G13].
10. **"Skeleton screens feel faster."** One cited paper, method not described in the article [N28].
11. **"Optimistic UI improves the experience."** Only practitioner anecdotes were found; no controlled study.
12. **"Onboarding tours help."** NN/g's own research found tutorials did not improve task performance [N18].
13. **"Show a progress bar in multi-step forms."** GOV.UK removed a 12-step indicator with no effect [G1].
14. **"Undo is always better than a confirmation."** Opinion [R2]; NN/g treats them as complementary [N8].
15. **"No more than five (or 7 ± 2) options."** COGA's "five or less main choices" is non-normative and uncited in what I read [W17]; platform bars cap at five for physical width, not for memory [P4] [P5].
16. **"Bottom navigation is better than top."** No comparative study found; it is platform convention.
17. **"Write for a reading age of 9."** Often attributed to GOV.UK. The current GOV.UK clear-language page that I opened does not state it [G19]; NN/g recommends about 6th-grade level for key pages and 8th elsewhere, for English [N11] [N24]. No equivalent for Rioplatense Spanish was found.
18. **"Cards are the mobile-friendly way to show records."** No comparison study found; NN/g says cards scan worse than lists for homogeneous items [N25].
19. **The 0.1 s / 1 s / 10 s response limits** are reasonable and widely used, but rest on sources from 1968 and 1991 [N15].
20. **"Older adults" findings** come from people 65 and over, often 70 and over [N5] [R12].

---

## 7. References

Status key: **VERIFIED** = opened this session and the content used here was read from it. **VERIFIED (partial)** = opened, but only part was readable or only an abstract. **SECONDARY** = not opened; known only through a verified source, which is named. **UNVERIFIED (snippet only)** = only a search-result snippet. **UNREADABLE** = opened but no usable content returned; not used as evidence.

### Nielsen Norman Group

- [N1] Nielsen, J. "10 Usability Heuristics for User Interface Design" (1994, updated 2020). https://www.nngroup.com/articles/ten-usability-heuristics/ — VERIFIED
- [N2] Budiu, R. "Memory Recognition and Recall in User Interfaces" (2024). https://www.nngroup.com/articles/recognition-and-recall/ — VERIFIED
- [N3] Nielsen, J. "Progressive Disclosure" (2006). https://www.nngroup.com/articles/progressive-disclosure/ — VERIFIED
- [N4] Neusesser, T., Sunwall, E. "Error-Message Guidelines" (2023). https://www.nngroup.com/articles/error-message-guidelines/ — VERIFIED
- [N5] Kane, L. "Usability for Older Adults: Challenges and Changes" (2019). https://www.nngroup.com/articles/usability-for-senior-citizens/ — VERIFIED
- [N6] Pernice, K., Budiu, R. "Hamburger Menus and Hidden Navigation Hurt UX Metrics" (2016). https://www.nngroup.com/articles/hamburger-menus/ — VERIFIED
- [N7] Schade, A. "Mobile Tables: Comparisons and Other Data Tables" (2017). https://www.nngroup.com/articles/mobile-tables/ — VERIFIED
- [N8] Nielsen, J. "Confirmation Dialogs Can Prevent User Errors — If Not Overused" (2018). https://www.nngroup.com/articles/confirmation-dialog/ — VERIFIED
- [N9] Krause, R. "How to Report Errors in Forms: 10 Design Guidelines" (2019). https://www.nngroup.com/articles/errors-forms-design-guidelines/ — VERIFIED
- [N10] Sherwin, K. "Placeholders in Form Fields Are Harmful" (2014). https://www.nngroup.com/articles/form-design-placeholders/ — VERIFIED
- [N11] Nielsen, J. "Lower-Literacy Users: Writing for a Broad Consumer Audience" (2005). https://www.nngroup.com/articles/writing-for-lower-literacy-users/ — VERIFIED
- [N12] Harley, A. "Icon Usability" (2014). https://www.nngroup.com/articles/icon-usability/ — VERIFIED
- [N13] Budiu, R. "Basic Patterns for Mobile Navigation: A Primer" (2015). https://www.nngroup.com/articles/mobile-navigation-patterns/ — VERIFIED
- [N14] Harley, A. "Touch Targets on Touchscreens" (2019). https://www.nngroup.com/articles/touch-target-size/ — VERIFIED
- [N15] Nielsen, J. "Response Times: The 3 Important Limits" (1993). https://www.nngroup.com/articles/response-times-3-important-limits/ — VERIFIED
- [N16] Sherwin, K. "Progress Indicators Make a Slow System Less Insufferable" (2014). https://www.nngroup.com/articles/progress-indicators/ — VERIFIED
- [N17] Kaplan, K. "Designing Empty States in Complex Applications: 3 Guidelines" (2021). https://www.nngroup.com/articles/empty-state-interface-design/ — VERIFIED
- [N18] Kendrick, A. "Mobile-App Onboarding: An Analysis of Components and Techniques" (2020). https://www.nngroup.com/articles/mobile-app-onboarding/ — VERIFIED
- [N19] Budiu, R. "Marking Required Fields in Forms" (2019). https://www.nngroup.com/articles/required-fields/ — VERIFIED
- [N20] Sherwin, K. "Low-Contrast Text Is Not the Answer" (2015). https://www.nngroup.com/articles/low-contrast/ — VERIFIED
- [N21] Sunwall, E. "Tabs, Used Right" (2024). https://www.nngroup.com/articles/tabs-used-right/ — VERIFIED
- [N22] Harley, A. "Visibility of System Status (Usability Heuristic #1)" (2018). https://www.nngroup.com/articles/visibility-system-status/ — VERIFIED
- [N23] Nielsen, J. "Best Font for Online Reading: No Single Answer" (2022). https://www.nngroup.com/articles/best-font-for-online-reading/ — VERIFIED (secondary account of Wallace et al. 2022)
- [N24] Nielsen, J. "Legibility, Readability, and Comprehension" (2015). https://www.nngroup.com/articles/legibility-readability-comprehension/ — VERIFIED
- [N25] Laubheimer, P. "Cards: UI-Component Definition" (2016). https://www.nngroup.com/articles/cards-component/ — VERIFIED
- [N26] Loranger, H. "Plain Language Is for Everyone, Even Experts" (2017). https://www.nngroup.com/articles/plain-language-experts/ — VERIFIED
- [N27] Budiu, R. "Wizards: Definition and Design Recommendations" (2017). https://www.nngroup.com/articles/wizards/ — VERIFIED
- [N28] Tankala, S. "Skeleton Screens 101" (2023). https://www.nngroup.com/articles/skeleton-screens/ — VERIFIED
- [N29] Flaherty, K. "Indicators, Validations, and Notifications" (2024). https://www.nngroup.com/articles/indicators-validations-notifications/ — VERIFIED
- [N30] Laubheimer, P. "Preventing User Errors: Avoiding Unconscious Slips" (2015). https://www.nngroup.com/articles/slips/ — VERIFIED
- [N31] Laubheimer, P. "Dangerous UX: Consequential Options Close to Benign Options" (2021). https://www.nngroup.com/articles/proximity-consequential-options/ — VERIFIED
- [N32] Laubheimer, P. "Data Tables: Four Major User Tasks" (2022). https://www.nngroup.com/articles/data-tables/ — VERIFIED
- [N33] Li, A. "Date-Input Form Fields: UX Design Guidelines" (2017). https://www.nngroup.com/articles/date-input/ — VERIFIED
- [N34] Budiu, R. "Accordions on Mobile" (2015). https://www.nngroup.com/articles/mobile-accordions/ — VERIFIED
- [N35] Whitenton, K. "Minimize Cognitive Load to Maximize Usability" (2013). https://www.nngroup.com/articles/minimize-cognitive-load/ — VERIFIED

### W3C

- [W1] Web Content Accessibility Guidelines (WCAG) 2.2, W3C Recommendation. https://www.w3.org/TR/WCAG22/ — VERIFIED (partial: characters 0 to 200,000 of about 270,000; the text of 1.3.1, 1.3.4, 1.3.5, 1.4.1, 1.4.4, 1.4.13, 2.1.1, 2.4.3 and 2.5.2 was returned as truncated fragments and is paraphrased above)
- [W2] Understanding SC 2.5.8 Target Size (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html — VERIFIED
- [W3] Understanding SC 2.5.5 Target Size (Enhanced). https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html — VERIFIED
- [W4] Understanding SC 2.4.11 Focus Not Obscured (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html — VERIFIED
- [W5] Understanding SC 2.5.7 Dragging Movements. https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html — VERIFIED
- [W6] Understanding SC 3.2.6 Consistent Help. https://www.w3.org/WAI/WCAG22/Understanding/consistent-help.html — VERIFIED
- [W7] Understanding SC 3.3.7 Redundant Entry. https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html — VERIFIED
- [W8] Understanding SC 3.3.8 Accessible Authentication (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html — VERIFIED
- [W9] What's New in WCAG 2.2. https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ — VERIFIED
- [W10] Understanding SC 1.4.10 Reflow. https://www.w3.org/WAI/WCAG22/Understanding/reflow.html — VERIFIED
- [W11] Understanding SC 1.4.3 Contrast (Minimum). https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html — VERIFIED
- [W12] Understanding SC 1.4.11 Non-text Contrast. https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html — VERIFIED
- [W13] Understanding SC 4.1.3 Status Messages. https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html — VERIFIED
- [W14] Understanding SC 1.4.12 Text Spacing. https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html — VERIFIED
- [W15] Understanding SC 3.3.4 Error Prevention (Legal, Financial, Data). https://www.w3.org/WAI/WCAG22/Understanding/error-prevention-legal-financial-data.html — VERIFIED
- [W16] Understanding SC 2.2.1 Timing Adjustable. https://www.w3.org/WAI/WCAG22/Understanding/timing-adjustable.html — VERIFIED
- [W17] Making Content Usable for People with Cognitive and Learning Disabilities, W3C Working Group Note, 29 April 2021 (supplemental, not required for conformance). https://www.w3.org/TR/coga-usable/ — VERIFIED (partial: characters 0 to 300,000 of about 470,000; pattern names and their one-line descriptions)
- [W18] Developing Websites for Older People: How WCAG 2.0 Applies. https://www.w3.org/WAI/older-users/developing/ — VERIFIED
- [W19] Arch, A. "Web Accessibility for Older Users: A Literature Review", W3C First Public Working Draft, 14 May 2008 (incomplete by its own statement; partly based on non-peer-reviewed sources). https://www.w3.org/TR/wai-age-literature/ — VERIFIED (partial: first 100,000 of about 155,000 characters)
- [W20] Understanding SC 1.4.8 Visual Presentation (AAA). https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html — VERIFIED
- [W21] Understanding SC 2.5.3 Label in Name. https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html — VERIFIED

### GOV.UK

- [G1] Design System, pattern "Question pages". https://design-system.service.gov.uk/patterns/question-pages/ — VERIFIED
- [G2] Design System, component "Error message". https://design-system.service.gov.uk/components/error-message/ — VERIFIED
- [G3] Design System, component "Error summary". https://design-system.service.gov.uk/components/error-summary/ — VERIFIED
- [G4] Design System, pattern "Recover from validation errors". https://design-system.service.gov.uk/patterns/validation/ — VERIFIED
- [G5] Design System, pattern "Confirmation pages". https://design-system.service.gov.uk/patterns/confirmation-pages/ — VERIFIED
- [G6] Design System, pattern "Complete multiple tasks". https://design-system.service.gov.uk/patterns/complete-multiple-tasks/ — VERIFIED
- [G7] Design System, component "Task list". https://design-system.service.gov.uk/components/task-list/ — VERIFIED
- [G8] Service Manual, "Structuring forms". https://www.gov.uk/service-manual/design/form-structure — VERIFIED
- [G9] Design System, component "Text input". https://design-system.service.gov.uk/components/text-input/ — VERIFIED
- [G10] Design System, styles "Type scale". https://design-system.service.gov.uk/styles/type-scale/ — VERIFIED
- [G11] Design System, component "Button". https://design-system.service.gov.uk/components/button/ — VERIFIED
- [G12] Design System, component "Date input". https://design-system.service.gov.uk/components/date-input/ — VERIFIED
- [G13] Design System, component "Password input". https://design-system.service.gov.uk/components/password-input/ — VERIFIED
- [G14] Design System, component "Details". https://design-system.service.gov.uk/components/details/ — VERIFIED
- [G15] Design System, component "Tabs". https://design-system.service.gov.uk/components/tabs/ — VERIFIED
- [G16] Design System, pattern "Check answers". https://design-system.service.gov.uk/patterns/check-answers/ — VERIFIED
- [G17] Design System, component "Notification banner". https://design-system.service.gov.uk/components/notification-banner/ — VERIFIED
- [G18] Design System, pattern "There is a problem with the service pages". https://design-system.service.gov.uk/patterns/problem-with-the-service-pages/ — VERIFIED
- [G19] GOV.UK publishing guidance, "Use clear language". https://guidance.publishing.service.gov.uk/writing-to-gov-uk-standards/writing-guidelines/clear-language/ — VERIFIED. (The older URL https://www.gov.uk/guidance/content-design/writing-for-gov-uk now redirects; the "reading age 9" statement was not on the page opened.)

### U.S. Web Design System

- [U1] Typography. https://designsystem.digital.gov/components/typography/ — VERIFIED
- [U2] Form. https://designsystem.digital.gov/components/form/ — VERIFIED
- [U3] Validation. https://designsystem.digital.gov/components/validation/ — VERIFIED
- [U4] Table. https://designsystem.digital.gov/components/table/ — VERIFIED (partial: first 100,000 of about 118,000 characters)
- [U5] Button. https://designsystem.digital.gov/components/button/ — VERIFIED
- [U6] Design principles. https://designsystem.digital.gov/design-principles/ — VERIFIED

### Platform guidance (Apple, Google)

- [P1] Apple Human Interface Guidelines, "Tab bars". Page: https://developer.apple.com/design/human-interface-guidelines/tab-bars (rendered page UNREADABLE). Content read from the page's own data endpoint: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/tab-bars.json — VERIFIED
- [P2] Apple Human Interface Guidelines, "Accessibility". Page: https://developer.apple.com/design/human-interface-guidelines/accessibility (rendered page UNREADABLE). Content read from: https://developer.apple.com/tutorials/data/design/human-interface-guidelines/accessibility.json — VERIFIED
- [P3] Google, Android Accessibility Help, "Touch target size". https://support.google.com/accessibility/android/answer/7101858 — VERIFIED
- [P4] Material Components for Android, "Navigation bar (BottomNavigation)". https://github.com/material-components/material-components-android/blob/master/docs/components/BottomNavigation.md — VERIFIED
- [P5] Android Developers, "Navigation bar" (Compose). https://developer.android.com/develop/ui/compose/components/navigation-bar — VERIFIED
- [P6] Material Design 3, "Navigation bar – guidelines". https://m3.material.io/components/navigation-bar/guidelines — UNREADABLE (JavaScript application; only the title was returned). Not used; [P4] and [P5] carry the 3-to-5 figure.
- [P7] Material Design 3, "Accessibility designing / structure". https://m3.material.io/foundations/designing/structure — UNREADABLE. Not used; [P3] carries the 48 dp figure. The often-quoted "8 dp between targets" was not verified.
- [P8] Material Design 2, "Bottom navigation". https://m2.material.io/components/bottom-navigation — UNREADABLE. Not used.

### Research papers and other sources

- [R1] Wroblewski, L. "Inline Validation in Web Forms", A List Apart (2009). https://alistapart.com/article/inline-validation-in-web-forms/ — VERIFIED
- [R2] Raskin, A. "Never Use a Warning When you Mean Undo", A List Apart (2007). https://alistapart.com/article/neveruseawarning/ — VERIFIED (opinion piece)
- [R3] Penzo, M. "Label Placement in Forms", UXmatters (2006). https://www.uxmatters.com/mt/archives/2006/07/label-placement-in-forms.php — VERIFIED
- [R4] Scott, E. "Usability Testing of Inline Form Validation", Baymard Institute (2024). https://baymard.com/blog/inline-form-validation — VERIFIED
- [R5] Scott, E. "E-Commerce Checkouts Need to Mark Both Required and Optional Fields Explicitly", Baymard Institute (2018). https://baymard.com/blog/required-optional-form-fields — VERIFIED
- [R6] Scott, E. "Readability: The Optimal Line Length", Baymard Institute (2022). https://baymard.com/blog/line-length-readability — VERIFIED
- [R7] Hoober, S. "How Do Users Really Hold Mobile Devices?", UXmatters (2013). https://www.uxmatters.com/mt/archives/2013/02/how-do-users-really-hold-mobile-devices.php — VERIFIED (carries the author's own 2017 retraction of the reach charts)
- [R8] Hoober, S. "Design for Fingers, Touch, and People, Part 1", UXmatters (2017). https://www.uxmatters.com/mt/archives/2017/03/design-for-fingers-touch-and-people-part-1.php — VERIFIED
- [R9] Arditi, A., Cho, J. "Letter case and text legibility in normal and low vision", Vision Research 47(19), 2499–2505 (2007). https://pmc.ncbi.nlm.nih.gov/articles/PMC2016788/ — VERIFIED (abstract). The PubMed record https://pubmed.ncbi.nlm.nih.gov/17675131/ was UNREADABLE.
- [R10] Parhi, P., Karlson, A., Bederson, B. "Target Size Study for One-Handed Thumb Use on Small Touchscreen Devices", MobileHCI 2006. https://www.microsoft.com/en-us/research/publication/target-size-study-for-one-handed-thumb-use-on-small-touchscreen-devices/ — VERIFIED (partial: abstract; participant count not on the page)
- [R11] Jin, Z. X., Plocher, T., Kiff, L. "Touch Screen User Interfaces for Older Adults: Button Size and Spacing", Universal Access in HCI, Springer (2007). https://www.springerprofessional.de/en/touch-screen-user-interfaces-for-older-adults-button-size-and-sp/2824982 — VERIFIED (partial: abstract only; its numeric recommendations were not readable and are not cited)
- [R12] Leitão, R., Silva, P. A. "Target and Spacing Sizes for Smartphone User Interfaces for Older Adults: Design Patterns Based on an Evaluation with Users", 19th Conference on Pattern Languages of Programs (2012). Record: https://mural.maynoothuniversity.ie/id/eprint/6045/ ; full text: https://mural.maynoothuniversity.ie/6045/1/PS-Target-Spacing.pdf — VERIFIED (full text read: 40 participants aged 65 to 95, mean 76.88, Porto; Samsung Nexus S; targets 7, 10.5, 14, 17.5 and 21 mm)
- [R13] Rello, L., Pielot, M., Marcos, M.-C. "Make It Big! The Effect of Font Size and Line Spacing on Online Readability", CHI 2016. Primary: https://dl.acm.org/doi/10.1145/2858036.2858204 — UNREADABLE (HTTP 403). Read through a secondary summary: https://editingresearch.byu.edu/?p=10398 — VERIFIED (secondary only)
- [R14] Steiner, T., Kurtuldu, M. "Offline UX design guidelines", web.dev (2016). https://web.dev/articles/offline-ux-design-guidelines — VERIFIED (practitioner guidance, no research cited)
- [R15] Appt, "Font size" statistics (Netherlands). https://appt.org/en/stats/font-size — VERIFIED (no sample size on the page)
- [R16] Coyier, C. "16px or Larger Text Prevents iOS Form Zoom", CSS-Tricks (2021). https://css-tricks.com/16px-or-larger-text-prevents-ios-form-zoom/ — VERIFIED
- [R17] StatCounter Global Stats, mobile screen resolutions, Argentina, October 2026. https://gs.statcounter.com/screen-resolution-stats/mobile/argentina — VERIFIED
- [R18] "Guía de Lenguaje Claro en el Poder Judicial de Formosa" (Anexo I, Acta 3058), hosted by the Buenos Aires City judiciary. https://lenguajeclaro.jusbaires.gob.ar/app/uploads/2022/09/2020-guia-lenguaje-claro.pdf — VERIFIED (PDF text read; a guide for judicial writing)
- [R19] Gobierno de la Ciudad de Buenos Aires, "Programa Lenguaje Claro". https://buenosaires.gob.ar/que-es-lenguaje-claro/programa-lenguaje-claro — VERIFIED (programme description; no writing rules on the page)

### Not opened: known only through other sources or search snippets

- Wallace, S. et al. (2022) "Towards Individuated Reading Experiences", ACM TOCHI — SECONDARY via [N23].
- Bernard, M., Liao, C., Mills, M. (2001), font size and type for older adults — SECONDARY via [W19].
- Mejtoft, T., Långström, A., Söderström, U. (2018) "The effect of skeleton screens", ECCE — SECONDARY via [N28].
- Miller, R. B. (1968); Card, Robertson, Mackinlay (1991), response-time limits — SECONDARY via [N15].
- University of Nebraska-Lincoln progress-indicator study; Nah (2004) — SECONDARY via [N16].
- Dandekar, Raju, Srinivasan (2003), fingertip dimensions — SECONDARY via [N14] and [R12].
- Kobayashi et al. (2011), older users and mobile touchscreens — SECONDARY via [R12].
- Legal-language preference study (linked by GOV.UK at papers.ssrn.com, abstract 1843415) — SECONDARY via [G19].
- Legge, G., Bigelow, C. (2011) "Does print size matter for reading?", Journal of Vision. https://jov.arvojournals.org/article.aspx?articleid=2191906 and https://pmc.ncbi.nlm.nih.gov/articles/PMC3428264/ — UNREADABLE (HTTP 403 and a browser check). Not used.
- Gobierno de la Ciudad de Buenos Aires, "Guía de Lenguaje Claro" (2022). https://lenguajeclaro.jusbaires.gob.ar/app/uploads/2022/11/GUIA_DE_LENGUAJE_CLARO-Gobierno-CABA.pdf — UNVERIFIED (snippet only; the download failed). Not used.
- INDEC "Dosier estadístico de personas mayores 2025" (about 88 of 100 older people use a mobile phone) and the Encuesta Nacional de Consumos Culturales figure of 72% WhatsApp use among people over 75 — UNVERIFIED (snippet only, no URL opened). Not used as evidence; mentioned only because they bear on the "mostly WhatsApp" hypothesis and are worth opening.
- Time-clock and shift-app usability research — none found; one search returned vendor material only.

### Count

- Sources opened and used: **105** (35 NN/g, 21 W3C, 19 GOV.UK, 6 USWDS, 5 platform, 19 research and other). Of these, 7 are partial (long documents read in part, or abstract only: [W1], [W17], [W19], [U4], [R9], [R10], [R11]) and 2 are secondary accounts of a primary paper that could not be opened ([N23] for Wallace et al.; [R13]).
- Sources attempted and unreadable, or known only by snippet or citation, and therefore not used as evidence: **17** (3 Material pages, 1 PubMed record, 1 ACM page, Legge and Bigelow, the GCBA guide, 2 Argentine statistics, 8 secondary citations).
