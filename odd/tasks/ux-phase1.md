# UX phase 1: a friendly app for non-technical and older users

Objective: make the ADMIN setup and the employee daily use understandable for shop owners and employees without technical studies, frontend only, reusing the existing styles and responsive (phones first). Branches `feat/ux-*` from `main` after #101; one PR per unit, merge commit pinned to the verified head. Runner: frontend `npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run audit:prod`.

## Specs

- S1. Mateo (2026-11-09): "Che manda un agente a analizar el front y la estructura de configuracion, siento que no es muy facil de entender para el usuario, creo que va a ser demasiado confuso [...] gente sin estudios, o gente mayor, o empleados que quiza no estan muy familiarizados con todo, porque desde el punto de vista del admin es configurable pero tampoco es muy facil de entender la verdad".
- S2. Mateo (2026-11-09): "configurar plantillas, jornadas y demas no parece muy friendly, recorda siemrpe respetar los estilos ya existentes y que sea responsive".
- S3. Mateo (2026-11-09): "¿Viste esas páginas que te dan una guía básica en orden de que, cómo configuras todo? O sea, eso debería existir [...] la idea es que sea más sencillo para que no le genere mucho desgaste configurar todo. O sea, siento que configurar esto te lleva 30 minutos." and "vos declarás la jornada, tenés desde hasta, y después tenés días de la semana. No sé por qué existen las dos opciones." and "las plantillas no se entiende nada".
- S4. Phase 1 approved by Mateo on 2026-11-09 ("si") as presented: frontend only, no product decision, existing styles, responsive. Phase 2 decisions (longer employee session, full vocabulary jornada/desvío, weekly schedule per employee, apply an edited schedule to not-started days, simpler temporary password) are NOT part of this phase.
- S5. No backend, API, openapi or data change. Every visible text in plain Rioplatense Spanish (voseo) for a non-technical reader; no codes, bytes, IANA, coordinates, "servidor", "secuencia" shown to users.

## Phase 1 glossary (UI only; codes, API and spec terms unchanged)

| Today | Phase 1 UI |
|---|---|
| Plantilla / plantilla horaria | Horario |
| Bloque | Tramo |
| Declarar (jornada) / Declarar por lote | Cargar / Cargar días de trabajo |
| Registrar ingreso / egreso | Marcar entrada / Marcar salida |
| Salir a desayuno / Volver de desayuno | Me voy a desayunar / Volví del desayuno (same for almuerzo) |
| Salir (header) | Cerrar sesión |
| Motivos pendientes (employee) | Para explicar |
| Límite desayuno/almuerzo (min) | Minutos para desayunar / para almorzar |
| Tolerancia | Minutos de tolerancia (with a one-line explanation) |
| Jornada (ADMIN menu), Desvío (Bandeja) | unchanged in phase 1 (phase 2 decision) |

## Tasks

| ID | Unit | Specs | Route | Status | Issue / PR |
|---|---|---|---|---|---|
| U1 | Employee experience: state sentence, one big next action, clear confirmation with action and time, location status per mark, pause limit ("volvé antes de las 10:20"), breakfast before lunch, exit separated with confirmation when early, "Cerrar sesión", date picker at the end with "Volver a hoy", motive form feedback and no preselected category, plain error texts, first-access password help (show/counter/hint) | S1, S4, S5 | delegated (parallel) | done | #102, PR #107 |
| U2 | ADMIN Horarios: rename, site as first field, type cards (Corrido/Cortado/De noche), tramos "Entra a las / Sale a las" with the next-day offset computed (advanced selects only for legacy data), live preview, pause help, per-tramo errors, edit in place, warning that loaded days keep the old schedule, "¿Quién trabaja con este horario?" assignment after saving; Employees: "Generar contraseña" on creation, assignment panel reachable on phones, "Minutos de tolerancia" help; employees table as cards on phones | S2, S3, S4, S5 | delegated (parallel) | done | #103, PR #107 |
| U3 | ADMIN days of work and setup guide: one "Cargar días de trabajo" form (days of the week + quick periods "Esta semana / Próximas 2 semanas / Lo que queda del mes / Mes que viene / Elegir fechas", live preview count, result grouped by reason), single day as a folded exception with the assigned schedule as default and site before employee; "Primeros pasos" page with 5 ordered steps and status; menu ordered by setup (configuration group); coverage warning when tomorrow has no days loaded; "Ver jornada" from a deviation; marks table as cards on phones; time inputs without seconds | S2, S3, S4, S5 | delegated (parallel) | done | #104, PR #107 |
| U4 | Accessibility and responsive base: input and mark-button borders with enough contrast (WCAG 1.4.11), larger small texts, FormField error prop with aria-invalid/aria-describedby, ADMIN menu wraps on phones, sticky bars not covering focus, aria-hidden on decorative glyphs, table header labels, status chips colored everywhere, color-scheme light | S1, S4 | delegated (parallel) | done | #105, PR #106 |

## Log

- L1 (2026-11-09): three read-only audits (ADMIN setup, employee journey, copy and accessibility) found: 30 min session forces a login per mark (phase 2); without loaded days nobody can mark and nothing warns; templates expose day offsets (12 fields, 5 concepts); two stacked declaration forms; technical copy; mark button below the fold; lunch before breakfast; input borders 1.27:1; ADMIN menu hides sections on phones. Mateo approved phase 1 ("si"). Units share AdminViews.tsx/AdminViewsRender.tsx: U2 and U3 put new UI in new files and keep edits in the big files minimal; U4 owns global CSS changes; the parent reconciles at merge.
- L2 (2026-11-09): U4 merged as PR #106 (a850ae0). U1-U3 integrated on feat/ux-phase1 (conflicts in AdminViewsRender.tsx rebuilt from the U3 version plus U2 removals and U4 edits re-applied; client messages kept per owner; CSS guard joins every max-width block), 491 tests. An integrated headless check at 360x640 and 1280x800 found 12 defects (fixed bars 36% of an ADMIN phone screen, jornadas list cut, inbox filters pushing cases down, small "Ir" buttons, lone employee action at half width, small temporary password, "IANA", "servidor"/"bytes" texts...); all fixed in 44b1555 (bars 19%, 517 tests). PR #107 merged as e731c78 (closes #102-#104). Demo rebuilt with phase 1, same URL.
