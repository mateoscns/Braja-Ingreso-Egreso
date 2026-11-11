Objective: integral UX/UI refactor of the Fichaje Braja frontend so that people without technical training understand every screen; features, API contracts and business rules stay as they are.
Branch: feat/ux-ui-refactor-114 (issue #114). Delivery: `ask-on-risk`; the forecast is far above 400 authored lines, so the chain strategy is chosen before the first code commit.
Runner: `cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run audit:prod` (no pipes). Backend untouched.

## Specs

Every quoted fragment is the owner's brief, verbatim (Log L1 holds it whole).

- S1. Goal. "que cualquier persona, incluso sin experiencia utilizando sistemas administrativos, comprenda intuitivamente qué puede hacer, cómo debe hacerlo, qué está ocurriendo y cuáles son las consecuencias de cada acción." On every screen four questions are clear: "¿Dónde estoy?", "¿Qué información estoy viendo?", "¿Qué puedo hacer?", "¿Qué sucede cuando realizo una acción?". "La interfaz debe enseñar su funcionamiento mediante su propia organización, lenguaje, jerarquía y comportamiento." "Primero hay que eliminar la confusión mediante el diseño."
- S2. What must not change. "debés preservar las funcionalidades, los contratos y las reglas de negocio aprobadas." "No cambies reglas de negocio para simplificar una implementación visual." "Respetá especialmente las reglas existentes de geolocalización, horarios, idempotencia, clasificación de desvíos, auditoría y ausencia de cola offline." "No introduzcas cambios de backend o base de datos salvo que sean estrictamente necesarios, estén autorizados y se justifiquen por separado."
- S3. Multi-agent work. Eight roles: UX Research & Evidence; UX Auditor & Information Architect; Visual Exploration & Creative Direction; Design Systems Architect; Frontend Architecture & Refactoring; Accessibility & Cognitive Usability; Nontechnical User Advocate; QA, Regression & Adversarial Review. "La delegación es obligatoria para los análisis independientes, la exploración creativa y la revisión crítica". "Si no hay soporte para crear subagentes reales, declaralo expresamente. No simules haberlos ejecutado." "No permitas que varios agentes editen simultáneamente los mismos archivos." "Cada agente debe entregar hallazgos verificables, no opiniones genéricas."
- S4. Audit. Read `CLAUDE.md`, `README.md`, `docs/DECISIONES.md`, `docs/ESPECIFICACION.md`, `docs/ARQUITECTURA.md`, `openapi.yaml` and the frontend code and tests. "Inspeccioná cada pestaña de la aplicación, tanto para empleados como administradores." "Tomá capturas de las vistas actuales para establecer una línea base." "No inventes pestañas ni funcionalidades que no existan." Per screen, a diagnosis over: Claridad del propósito, Navegación, Jerarquía, Terminología, Acciones, Feedback, Errores, Accesibilidad, Responsive, Consistencia. "Priorizá problemas según frecuencia de uso, impacto, gravedad y esfuerzo de corrección."
- S5. Research. Nielsen Norman Group and its 10 heuristics, WCAG 2.2 (AA), Material Design, GOV.UK Design System, US Web Design System, research on cognitive load, recognition over recall, error prevention, forms, navigation, cognitive accessibility, progressive disclosure. Deliver "Referencias verificables" and "Diferenciación entre estándares, evidencia empírica y preferencias estéticas." "No conviertas recomendaciones generales en reglas absolutas sin justificación."
- S6. Rethink the information architecture. Consider renaming, reorganizing, regrouping, separating, simplifying, fewer steps, visible frequent actions, progressive disclosure, orientation, brief contextual help. "No agregues pantallas, pasos ni confirmaciones únicamente para que la interfaz parezca más completa." "Si cambiás una denominación visible, no es necesario cambiar automáticamente nombres internos, modelos de dominio o contratos de API."
- S7. Visual direction. "al menos **tres propuestas visuales conceptualmente distintas**", compared by Claridad, Facilidad de aprendizaje, Accesibilidad, Eficiencia operativa, Coherencia, Calidad visual, Viabilidad técnica, Adaptabilidad móvil; one chosen with reasons. Wanted: "Sobria y moderna", "Limpia, pero no vacía", "Profesional, pero no intimidante", "Amigable, pero no infantil", "Con jerarquía visual marcada", "Con colores moderados y funcionales", "Con tipografía especialmente legible", "Con componentes consistentes", "Con una identidad propia". Avoid "gradientes innecesarios, sombras exageradas, exceso de tarjetas, insignias decorativas y componentes sin propósito funcional". "No confundas creatividad con decoración." Every important decision improves at least one of: Comprensión, Eficiencia, Accesibilidad, Prevención de errores, Consistencia, Satisfacción de uso.
- S8. Flows. Each flow has: "Acción principal visible", "Contexto suficiente", "Estados comprensibles", "Feedback inequívoco: nunca indicar que una marca fue registrada si el servidor todavía no confirmó su aceptación.", "Prevención de errores", "Recuperación", "Simplicidad".
- S9. Rules and guide. Audit the current visual rules; create or update `docs/UX_UI_GUIDELINES.md` with verifiable obligations on Navegación, Jerarquía, Lenguaje ("Español natural y comprensible para usuarios de Argentina."), Accesibilidad ("Contrastes conforme a WCAG 2.2 AA.", "procurar áreas de interacción de aproximadamente 44 × 44 píxeles cuando el diseño lo permita"), Componentes ("Tokens centralizados.", states `loading`, `disabled`, `error`, `success` and empty) and Responsive ("Priorizar el uso móvil en flujos de fichaje."). Governance: "No sobrescribas las reglas duras de negocio, las decisiones aprobadas ni la autoridad del responsable del producto." "Cualquier modificación que cambie el alcance funcional o contradiga decisiones vigentes debe quedar identificada como propuesta pendiente de aprobación." "No atribuyas aprobaciones inexistentes."
- S10. Implementation. "No quiero únicamente un documento de recomendaciones. Quiero código refactorizado y una aplicación efectivamente mejorada." Order: fundamentals of the visual system; reusable components; navigation and shared layouts; most used screens; complex admin screens; states, messages and interaction details; responsive and accessibility; removal of obsolete styles and components. "No crees un segundo sistema de componentes paralelo cuando sea posible consolidar el existente." "No agregues dependencias sin comprobar su necesidad y cumplir las reglas del repositorio." "Trabajá en una rama aislada y seguí el flujo de issues, asignaciones, aprobaciones y PR establecido por el proyecto." "No realices merge a producción ni cambios irreversibles sin la autorización correspondiente."
- S11. Validation. Screens checked at "Celular pequeño: 320 px", "Celular habitual: 375–390 px", "Tablet: 768 px", "Escritorio: 1366 px o superior": no overlaps, cut text, overflow, unreachable controls, dialogs that cannot be closed, low contrast, incoherent states or hard forms. Lint, typecheck, frontend tests, build, tests of affected components and critical flows, automated accessibility tests where possible, the repository's audit. "No afirmes que una prueba pasó sin contar con su resultado real." An independent usability agent evaluates concrete tasks without the designer's explanations; simulations are labelled as simulations. "No inventes métricas de éxito."
- S12. Adversarial review. UX, accessibility and QA agents review "sin defender las decisiones originales"; findings grouped by severity; "Corregí los problemas críticos y altos dentro del alcance autorizado."; re-evaluate what changed. "No declares que el resultado es óptimo únicamente porque los propios agentes coinciden."
- S13. Deliverables: A. Diagnóstico inicial; B. Investigación; C. Exploración creativa; D. Implementación (screens modified; components created, refactored and removed; navigation, forms, accessibility and responsive improvements); E. Documentación; F. Validación (with before/after captures where possible); G. Riesgos y pendientes; H. Resultado final. "No reemplaces evidencia por afirmaciones subjetivas."
- S14. Acceptance criteria, verbatim: "Todas las pantallas relevantes hayan sido auditadas." "La navegación tenga una estructura comprensible." "Las pestañas comuniquen claramente su propósito." "Las acciones frecuentes sean fáciles de localizar." "La terminología visible sea coherente y comprensible." "Los formularios indiquen qué información necesitan." "Los estados del sistema sean inequívocos." "Los errores indiquen cómo recuperarse." "El diseño funcione correctamente en dispositivos móviles." "Los componentes compartan un sistema visual consistente." "Las funcionalidades existentes se conserven." "Los controles técnicos exigidos hayan sido ejecutados y sus resultados documentados." "Los cambios estén reflejados en la documentación." "Las mejoras estén realmente implementadas y no solamente propuestas."
- S15. Priorities, in this order: "1. Comprensión inmediata para usuarios no técnicos. 2. Preservación de funcionalidades y reglas de negocio. 3. Facilidad y rapidez en tareas cotidianas. 4. Prevención y recuperación de errores. 5. Accesibilidad. 6. Coherencia visual. 7. Calidad estética y personalidad del producto. 8. Mantenibilidad de la implementación."

Repository constraints that bound the work (CLAUDE.md, not new requirements):

- §1: small, explicit slices; each file changed is read whole before the diff is accepted; no AI attribution in commits or PRs (D-20261014-01); new dependencies only after checking who publishes them and since when.
- Closed product scope (D-20261014-03): a visual and wording refactor adds no feature.
- Rule 22: the production CSP is same-origin only (plus two OpenStreetMap hosts): no external fonts, CDNs, inline scripts or inline styles.
- Rule 27: no `localStorage`, `sessionStorage` or IndexedDB. Rule 37: every API call goes through `shared/api/client.ts`. Rule 36: render components get data and callbacks by props; remote state lives in containers. Rule 3: location is captured only when marking. No offline queue.
- Enrique holds #66 and #70 (responsive coverage) on the same frontend files; code slices are coordinated with him through Mateo.

Assumption A1: changing the words the user sees for "jornada" and "desvío" was left as an owner decision on 2026-11-09 (ux-phase1.md, S4). This brief asks to evaluate them (S6), so the evaluation is done and the proposal goes to Mateo before any screen changes its vocabulary.

## Tasks

| ID | Task | Specs | Route | Status | Evidence |
|---|---|---|---|---|---|
| T1 | UX research with verifiable sources | S5 | delegated (read-only, parallel wave 1) | done | 105 sources opened, 17 listed but not used as evidence; 15 principles classed STANDARD / EVIDENCE / PREFERENCE; report in scratchpad `ux/research/research.md`. Quotes came through a fetch tool: spot-check before copying into the guidelines |
| T2 | Screen inventory, per-screen diagnosis and information architecture | S4, S6 | delegated (read-only, parallel wave 1) | done (from code; rendering claims to confirm on T3 shots) | 4 entry screens, 1 employee screen with 8 sections, 7 ADMIN sections with 32 panels; no router; 12 items need an owner decision (O-1 to O-12); report in scratchpad `ux/audit/audit.md` |
| T3 | Baseline screenshots of every screen at 320, 390, 768 and 1366 px on a disposable local stack | S4, S11 | delegated (scratch only, parallel wave 1) | done | 594 PNG, 120 screen states, no page-level horizontal overflow; 10 states not capturable (listed in scratchpad `ux/baseline/index.md`); found two defects in main: blank app on a site location history with entries, and the employee day showing the stored time instead of the real time of marks the ADMIN loaded |
| T4 | Accessibility and cognitive baseline of the current frontend | S9, S11 | delegated (read-only, parallel wave 1) | done (static reading only, no rendered check) | 39 findings: 0 critical, 7 high, 16 medium, 16 low; 9 of 106 contrast pairs fail, all state indicators or default placeholders; report in scratchpad `ux/a11y/baseline.md` |
| T5 | Three visual directions as static prototypes, compared | S7 | delegated (scratch only, parallel wave 1) | done | Planilla, Mostrador, Tablero plus a sketched hybrid; 126 contrast pairings pass AA, no overflow at 320 to 1366, smallest target 44 px; scores 33 / 32 / 31, too close to decide by sum; files in scratchpad `ux/directions/` |
| T6 | Non-technical advocate walks the baseline screenshots through concrete tasks | S11 | delegated (read-only, after T3) | in progress (stopped once by a usage limit, resumed 2026-11-11) | |
| T7 | Synthesis: target information architecture, chosen direction, vocabulary proposal (A1), slice plan and chain strategy | S6, S7, S10 | inline + Mateo | pending | |
| T8 | Design system: tokens and shared components on the existing frontend | S9, S10 | spec and slice plan delegated (scratch only); implementation routes defined in T7 | spec in progress | |
| T9 | Implementation slices, screen by screen | S8, S10 | defined in T7 | pending | |
| T10 | `docs/UX_UI_GUIDELINES.md` and related docs | S9, S13 | defined in T7 | pending | |
| T11 | Validation at four widths, technical gate, independent comprehension tasks | S11 | delegated | pending | |
| T12 | Adversarial review and one correction batch | S12 | delegated | pending | |
| T13 | Final deliverables A to H | S13, S14 | inline | pending | |

Route evidence: T1 to T5 are independent analyses with no shared edit surface (nothing in the repository is written), launched together; the brief (S3) makes delegation mandatory for independent analysis, creative exploration and critical review.

## Log

- L1 (2026-11-10): the owner's request, verbatim.

````markdown
# PROMPT MAESTRO — REFACTORIZACIÓN UX/UI INTEGRAL DE FICHAJE BRAJA

## 1. ROL Y MISIÓN

Actuá como **Principal Product Designer, Senior UX Researcher, Design Systems Architect y Staff Frontend Engineer**, con más de 15 años de experiencia diseñando aplicaciones empresariales utilizadas por personas sin formación tecnológica.

Estás trabajando con **Claude Fable 5.2** como modelo principal y orquestador de un equipo multidisciplinario de subagentes.

Tu misión es ejecutar una **refactorización integral de la experiencia de usuario (UX) y la interfaz visual (UI) de Fichaje Braja**, desde la comprensión de cada pantalla hasta su implementación definitiva.

Repositorio de referencia:

https://github.com/mateoscns/Braja-Ingreso-Egreso

El objetivo no es simplemente hacer que la aplicación se vea moderna.

**El objetivo es que cualquier persona, incluso sin experiencia utilizando sistemas administrativos, comprenda intuitivamente qué puede hacer, cómo debe hacerlo, qué está ocurriendo y cuáles son las consecuencias de cada acción.**

Queremos una aplicación visualmente profesional, fácil de aprender, eficiente para el uso cotidiano, coherente y agradable.

Tenés libertad creativa para replantear profundamente la interfaz, la distribución de información, la navegación y los componentes visuales.

No estás obligado a conservar la organización visual existente cuando haya una alternativa demostrablemente mejor.

Sin embargo, debés preservar las funcionalidades, los contratos y las reglas de negocio aprobadas.

---

## 2. PRINCIPIO FUNDAMENTAL

**Diseñá para personas comunes, no para desarrolladores.**

Imaginá distintos perfiles:

- Empleado que utiliza principalmente WhatsApp y aplicaciones móviles básicas.
- Trabajador de 45 a 65 años con poca familiaridad con sistemas informáticos.
- Administrador que necesita gestionar empleados, horarios, incidencias y registros mientras atiende otras responsabilidades.
- Usuario que abre la aplicación por primera vez.
- Usuario habitual que necesita completar una tarea rápidamente.
- Persona que utiliza un celular económico, una pantalla pequeña o una conexión inestable.

Estos perfiles son hipótesis de diseño, no resultados de investigación con usuarios reales.

La aplicación debe minimizar la necesidad de capacitación.

Un usuario no debería necesitar que alguien le explique constantemente para qué sirve una pestaña, qué significa una etiqueta o qué botón debe presionar.

En cada pantalla deben quedar claras cuatro preguntas:

1. ¿Dónde estoy?
2. ¿Qué información estoy viendo?
3. ¿Qué puedo hacer?
4. ¿Qué sucede cuando realizo una acción?

### Criterio rector

**La interfaz debe enseñar su funcionamiento mediante su propia organización, lenguaje, jerarquía y comportamiento.**

No queremos resolver una interfaz confusa incorporando instrucciones interminables.

Primero hay que eliminar la confusión mediante el diseño.

---

## 3. ORQUESTACIÓN MULTIAGENTE OBLIGATORIA

No quiero que un único agente diseñe, implemente y apruebe todas sus propias decisiones.

Actuá como orquestador principal y utilizá subagentes reales cuando el entorno permita delegación.

**La delegación es obligatoria para los análisis independientes, la exploración creativa y la revisión crítica, siempre que existan herramientas de subagentes disponibles.**

Si no hay soporte para crear subagentes reales, declaralo expresamente. No simules haberlos ejecutado.

Distribuí el trabajo en las siguientes especialidades, utilizando ejecución paralela cuando las dependencias lo permitan.

### AGENTE 1 — UX Research & Evidence

Responsabilidad: investigar principios de usabilidad aplicables a sistemas administrativos y de control horario.

Investigá en fuentes reconocidas, incluyendo:

- Nielsen Norman Group y las 10 heurísticas de usabilidad.
- WCAG 2.2, especialmente nivel AA.
- Material Design.
- GOV.UK Design System.
- US Web Design System.
- Investigaciones sobre carga cognitiva, reconocimiento frente a recuerdo y prevención de errores.
- Buenas prácticas de formularios, navegación, accesibilidad cognitiva y divulgación progresiva.

No te limites a estas fuentes cuando encuentres otras más relevantes.

Buscá evidencia sobre interfaces utilizadas por usuarios poco familiarizados con la tecnología.

Entregables:

- Principios aplicables específicamente a Braja.
- Problemas que estos principios permiten evitar.
- Recomendaciones concretas por tipo de pantalla.
- Referencias verificables.
- Diferenciación entre estándares, evidencia empírica y preferencias estéticas.

No conviertas recomendaciones generales en reglas absolutas sin justificación.

### AGENTE 2 — UX Auditor & Information Architect

Responsabilidad: comprender la aplicación existente y detectar problemas de organización.

Inspeccioná completamente:

- Rutas y pestañas.
- Navegación principal y secundaria.
- Pantallas de empleados.
- Pantallas administrativas.
- Formularios y modales.
- Estados de información.
- Flujos de trabajo.
- Mensajes de error y confirmación.
- Jerarquía visual y distribución del contenido.

Construí un inventario real del producto a partir del código.

Para cada pantalla documentá:

- Objetivo de la pantalla.
- Perfil que la utiliza.
- Información esencial.
- Acciones principales y secundarias.
- Problemas de comprensión.
- Información redundante.
- Posibles mejoras en la navegación.

Prestá especial atención a nombres técnicos, acciones poco visibles y componentes que requieren conocimientos previos para interpretarse.

No inventes pestañas ni funcionalidades que no existan.

### AGENTE 3 — Visual Exploration & Creative Direction

Responsabilidad: explorar direcciones de diseño antes de elegir una.

Desarrollá al menos **tres propuestas visuales conceptualmente distintas**.

Por ejemplo:

1. Una interfaz administrativa minimalista, clara y orientada a tareas.
2. Una interfaz cálida y accesible, con componentes grandes y orientación contextual.
3. Una interfaz operativa contemporánea, con alta densidad informativa controlada y jerarquías muy marcadas.

Estas son posibilidades, no soluciones preseleccionadas.

Tenés libertad para encontrar alternativas superiores.

Compará las propuestas según:

- Claridad.
- Facilidad de aprendizaje.
- Accesibilidad.
- Eficiencia operativa.
- Coherencia.
- Calidad visual.
- Viabilidad técnica.
- Adaptabilidad móvil.

Elegí una dirección fundamentada, combinando elementos cuando aporte valor.

**No confundas creatividad con decoración.**

El resultado debe mostrar personalidad visual sin introducir complejidad innecesaria.

### AGENTE 4 — Design Systems Architect

Responsabilidad: transformar la dirección seleccionada en un sistema visual consistente y reutilizable.

Definí:

- Paleta de colores y tokens semánticos.
- Escala tipográfica.
- Espaciado.
- Grillas.
- Componentes interactivos.
- Estados visuales.
- Tablas y listas.
- Formularios.
- Botones.
- Navegación.
- Modales y diálogos.
- Indicadores de estado.
- Diseño responsive.
- Comportamientos accesibles.

Revisá la identidad visual existente de Braja.

Podés conservar, evolucionar o replantear sus reglas estéticas cuando eso mejore la experiencia.

Preferí una identidad sobria, profesional, reconocible y sin colores estridentes.

No fuerces una estética predeterminada.

### AGENTE 5 — Frontend Architecture & Refactoring

Responsabilidad: implementar las mejoras en el frontend real.

Analizá el stack, los componentes existentes, los estilos y los patrones de arquitectura.

Identificá:

- Componentes reutilizables.
- Código visual duplicado.
- Inconsistencias de estilos.
- Componentes excesivamente complejos.
- Dependencias innecesarias.
- Patrones de composición mejorables.
- Problemas de mantenibilidad.
- Riesgos de regresión.

Implementá una refactorización técnica que acompañe el nuevo diseño.

No crees un segundo sistema de componentes paralelo cuando sea posible consolidar el existente.

Sos responsable del código frontend afectado: podés modificar, sustituir, fusionar o eliminar componentes obsoletos cuando hayas verificado sus usos y su impacto.

No cambies reglas de negocio para simplificar una implementación visual.

### AGENTE 6 — Accessibility & Cognitive Usability

Responsabilidad: evaluar que la aplicación pueda utilizarse sin experiencia técnica previa y con distintas necesidades de accesibilidad.

Revisá:

- Contraste de colores.
- Legibilidad.
- Tamaños de objetivos táctiles.
- Navegación por teclado.
- Indicadores de foco.
- Etiquetas y descripciones.
- Comprensión del lenguaje.
- Prevención de errores.
- Mensajes de recuperación.
- Dependencia del color.
- Orden de lectura.
- Compatibilidad con lectores de pantalla.
- Comportamientos en dispositivos móviles.

Buscá conformidad con WCAG 2.2 AA para los componentes y flujos intervenidos.

Detectá barreras cognitivas que no necesariamente aparecen en una auditoría automática de accesibilidad.

### AGENTE 7 — Nontechnical User Advocate

Responsabilidad: cuestionar todas las decisiones desde la perspectiva de usuarios no técnicos.

Este agente debe actuar de forma independiente del equipo de diseño.

Su función es detectar situaciones como:

- "No entiendo qué significa esto".
- "No sé qué botón corresponde".
- "No sé si la acción se guardó".
- "No entiendo qué diferencia hay entre estas opciones".
- "Tengo miedo de tocar algo y equivocarme".
- "No sé cómo volver atrás".
- "No entiendo por qué aparece este aviso".

Debe proponer mejoras concretas y cuestionar especialmente las soluciones que resulten visualmente atractivas pero poco comprensibles.

No presentes sus evaluaciones simuladas como si fueran pruebas reales con participantes humanos.

### AGENTE 8 — QA, Regression & Adversarial Review

Responsabilidad: verificar la implementación y encontrar problemas que el equipo creador haya pasado por alto.

Debe comprobar:

- Que se conservan las funcionalidades existentes.
- Que no se rompen flujos entre pantallas.
- Que los estados de carga y error son correctos.
- Que los permisos se respetan.
- Que las interfaces funcionan en diferentes resoluciones.
- Que los cambios visuales no alteraron contratos.
- Que no aparecieron regresiones de accesibilidad.
- Que la documentación corresponde al código implementado.

Debe realizar una revisión crítica independiente, no limitarse a aprobar el trabajo del agente implementador.

### Coordinación

El orquestador debe definir responsables, dependencias, criterios de entrega e interfaces de trabajo.

Paralelizá investigación, auditorías y exploración creativa.

No permitas que varios agentes editen simultáneamente los mismos archivos.

Cada agente debe entregar hallazgos verificables, no opiniones genéricas.

---

## 4. FASE I — AUDITORÍA COMPLETA DEL PROYECTO

Antes de modificar la interfaz, comprendé el funcionamiento del sistema.

Leé los archivos relevantes, especialmente:

- `CLAUDE.md`
- `README.md`
- `docs/DECISIONES.md`
- `docs/ESPECIFICACION.md`
- `docs/ARQUITECTURA.md`
- `openapi.yaml`
- Código y pruebas del frontend.

Investigá las reglas existentes antes de proponer modificaciones.

El proyecto contiene decisiones funcionales aprobadas que deben respetarse.

No confundas reglas de diseño con reglas de negocio.

Inspeccioná cada pestaña de la aplicación, tanto para empleados como administradores.

Cuando existan herramientas de navegador, ejecutá la aplicación y explorá los flujos reales con datos de prueba seguros.

Tomá capturas de las vistas actuales para establecer una línea base.

No te conformes con leer componentes aislados.

**Necesito una comprensión integral de la experiencia real de uso.**

### Auditoría por pantalla

Para cada pantalla construí un diagnóstico con:

| Dimensión | Evaluación |
|---|---|
| Claridad del propósito | ¿Se comprende para qué existe? |
| Navegación | ¿Es fácil encontrarla y salir de ella? |
| Jerarquía | ¿Destaca la información importante? |
| Terminología | ¿Es comprensible para un usuario común? |
| Acciones | ¿Se identifica fácilmente qué hacer? |
| Feedback | ¿Se entiende el resultado de una acción? |
| Errores | ¿Es posible prevenirlos y corregirlos? |
| Accesibilidad | ¿Existen barreras de uso? |
| Responsive | ¿Funciona correctamente en celular? |
| Consistencia | ¿Respeta un patrón común? |

Priorizá problemas según frecuencia de uso, impacto, gravedad y esfuerzo de corrección.

---

## 5. FASE II — REPLANTEO DE LA EXPERIENCIA

Una vez completada la auditoría, revisá críticamente la arquitectura de información.

No asumas que las pestañas actuales tienen la mejor organización posible.

Investigá si corresponde:

- Renombrar secciones.
- Reorganizar contenido.
- Reagrupar opciones relacionadas.
- Separar información que compite visualmente.
- Simplificar recorridos.
- Reducir pasos innecesarios.
- Hacer visibles acciones frecuentes.
- Ocultar progresivamente opciones avanzadas.
- Mejorar la orientación del usuario.
- Incorporar explicaciones contextuales breves.

No agregues pantallas, pasos ni confirmaciones únicamente para que la interfaz parezca más completa.

Evitá aumentar la cantidad de interacciones cuando no existe un beneficio claro.

### Ejemplo de razonamiento esperado

Si encontrás una pestaña denominada "Desvíos", no asumas automáticamente que ese término es comprensible para todos.

Investigá si expresiones como "Situaciones para revisar", "Incidencias" u otra denominación describen mejor su contenido.

Evaluá cada alternativa según el vocabulario real del trabajo, su precisión funcional y su consistencia con el resto del sistema.

Si cambiás una denominación visible, no es necesario cambiar automáticamente nombres internos, modelos de dominio o contratos de API.

**El lenguaje de la interfaz puede ser sencillo sin empobrecer el modelo técnico.**

---

## 6. FASE III — DIRECCIÓN VISUAL Y CREATIVIDAD

Quiero que explores el potencial creativo de Fable 5.2.

No te limites a reorganizar el mismo diseño con nuevos márgenes y colores.

Investigá formas de transformar el producto en una herramienta profesional y visualmente atractiva.

Podés replantear:

- Diseño general de las pantallas.
- Layouts.
- Barras de navegación.
- Distribución de formularios.
- Presentación de datos.
- Tablas frente a tarjetas.
- Componentes de acciones.
- Sistemas de estados.
- Microinteracciones.
- Representación de información importante.
- Comportamiento entre escritorio y móvil.

### Preferencias visuales

Buscá una estética:

- Sobria y moderna.
- Limpia, pero no vacía.
- Profesional, pero no intimidante.
- Amigable, pero no infantil.
- Con jerarquía visual marcada.
- Con colores moderados y funcionales.
- Con tipografía especialmente legible.
- Con componentes consistentes.
- Con una identidad propia.

Evitá los patrones genéricos de interfaces creadas automáticamente, como gradientes innecesarios, sombras exageradas, exceso de tarjetas, insignias decorativas y componentes sin propósito funcional.

El resultado debe sentirse como un producto cuidadosamente diseñado para su contexto real.

### Libertad creativa condicionada por resultados

No conserves un componente solo porque ya existe.

No agregues un componente solo porque visualmente resulta atractivo.

Toda decisión importante debe mejorar al menos uno de estos aspectos:

1. Comprensión.
2. Eficiencia.
3. Accesibilidad.
4. Prevención de errores.
5. Consistencia.
6. Satisfacción de uso.

---

## 7. FASE IV — SIMPLIFICACIÓN DE CADA FLUJO

Evaluá los flujos existentes, especialmente aquellos relacionados con fichaje y administración.

Para empleados, inspeccioná las acciones que efectivamente estén implementadas, como registrar ingreso, egreso, desayuno, almuerzo, consultar registros y completar motivos pendientes.

Para administradores, investigá la gestión de empleados, sedes, plantillas, jornadas, revisiones, avisos e historiales conforme a las funciones reales del repositorio.

No presupongas que todo lo mencionado corresponde a una pestaña independiente.

### Requisitos para cada flujo

**Acción principal visible:** el usuario debe reconocer fácilmente qué tiene que hacer.

**Contexto suficiente:** mostrar la información necesaria para tomar decisiones sin obligarlo a buscarla en otras pantallas.

**Estados comprensibles:** distinguir claramente entre pendiente, procesando, completado, rechazado o cualquier estado real existente.

**Feedback inequívoco:** nunca indicar que una marca fue registrada si el servidor todavía no confirmó su aceptación.

**Prevención de errores:** evitar acciones accidentales, confusiones y envíos duplicados.

**Recuperación:** explicar cómo continuar después de un error, sin recurrir a mensajes técnicos.

**Simplicidad:** minimizar elementos secundarios que compitan con la tarea principal.

Respetá especialmente las reglas existentes de geolocalización, horarios, idempotencia, clasificación de desvíos, auditoría y ausencia de cola offline.

La simplificación visual no puede cambiar su significado funcional.

---

## 8. FASE V — NUEVAS REGLAS Y OBLIGACIONES VISUALES

Auditá todas las reglas visuales actuales, estén documentadas formalmente o dispersas en componentes y estilos.

Identificá:

- Reglas contradictorias.
- Restricciones estéticas injustificadas.
- Convenciones duplicadas.
- Patrones inconsistentes.
- Reglas demasiado vagas para ser verificadas.
- Recomendaciones antiguas que dificulten el nuevo diseño.

Cuando corresponda, proponé sustituirlas por un sistema visual coherente.

Creá o actualizá una guía como:

`docs/UX_UI_GUIDELINES.md`

La guía debe especificar principios y obligaciones verificables, incluyendo:

### Navegación

- Los nombres de secciones deben describir sus funciones.
- La ubicación actual debe ser reconocible.
- La navegación principal debe mantener patrones consistentes.
- No deben depender de íconos ambiguos sin etiquetas accesibles.

### Jerarquía

- Cada pantalla debe presentar un propósito reconocible.
- Las acciones principales deben distinguirse de las secundarias.
- La información crítica debe aparecer antes que la complementaria.

### Lenguaje

- Español natural y comprensible para usuarios de Argentina.
- Evitar tecnicismos cuando exista una alternativa precisa.
- Explicar errores en términos de acciones y soluciones.
- Utilizar denominaciones consistentes en todo el sistema.

### Accesibilidad

- Contrastes conforme a WCAG 2.2 AA.
- Estados de foco visibles.
- Etiquetas programáticas.
- Operación por teclado.
- Controles táctiles cómodos; procurar áreas de interacción de aproximadamente 44 × 44 píxeles cuando el diseño lo permita.
- Información que no dependa exclusivamente del color.
- Compatibilidad con ampliación y tamaños de pantalla reducidos.

### Componentes

- Tokens centralizados.
- Variantes semánticas consistentes.
- Estados `loading`, `disabled`, `error`, `success` y vacíos cuando correspondan.
- Formularios con validación comprensible.
- Patrones uniformes de confirmación y recuperación.

### Responsive

- Priorizar el uso móvil en flujos de fichaje.
- Garantizar legibilidad y operación en pantallas pequeñas.
- Adaptar tablas y contenido denso sin eliminar información necesaria.
- Evitar desbordamientos y controles difíciles de alcanzar.

### Gobernanza documental

Revisá también `CLAUDE.md` y los documentos relacionados.

Podés mejorar su organización, precisión y claridad, y proponer obligaciones visuales adicionales.

**No sobrescribas las reglas duras de negocio, las decisiones aprobadas ni la autoridad del responsable del producto.**

Cualquier modificación que cambie el alcance funcional o contradiga decisiones vigentes debe quedar identificada como propuesta pendiente de aprobación.

No la implementes como decisión definitiva.

No atribuyas aprobaciones inexistentes.

---

## 9. FASE VI — IMPLEMENTACIÓN REAL

Una vez seleccionada la dirección visual, implementá el nuevo sistema.

**No quiero únicamente un documento de recomendaciones. Quiero código refactorizado y una aplicación efectivamente mejorada.**

Trabajá sobre el frontend existente.

Priorizá:

1. Fundamentos del sistema visual.
2. Componentes reutilizables.
3. Navegación y layouts compartidos.
4. Pantallas de uso más frecuente.
5. Pantallas administrativas complejas.
6. Estados, mensajes y detalles de interacción.
7. Responsive y accesibilidad.
8. Eliminación de estilos y componentes obsoletos.

Evitá duplicar componentes y crear abstracciones innecesarias.

Respetá los límites arquitectónicos, permisos y contratos existentes.

No agregues dependencias sin comprobar su necesidad y cumplir las reglas del repositorio.

No introduzcas cambios de backend o base de datos salvo que sean estrictamente necesarios, estén autorizados y se justifiquen por separado.

### Control del alcance

Trabajá en una rama aislada y seguí el flujo de issues, asignaciones, aprobaciones y PR establecido por el proyecto.

Podés avanzar autónomamente con investigación, propuestas, prototipos, implementación visual permitida, pruebas y documentación.

No solicites confirmaciones innecesarias para decisiones de bajo riesgo que ya estén autorizadas.

Cuando una regla explícita del repositorio exija aprobación, respetala.

No realices merge a producción ni cambios irreversibles sin la autorización correspondiente.

---

## 10. FASE VII — VALIDACIÓN VISUAL Y FUNCIONAL

Después de implementar, no consideres el trabajo finalizado únicamente porque compile.

### Validación visual

Utilizá navegador y capturas cuando estén disponibles.

Compará el diseño anterior y el nuevo.

Inspeccioná, como mínimo, resoluciones representativas de:

- Celular pequeño: 320 px.
- Celular habitual: 375–390 px.
- Tablet: 768 px.
- Escritorio: 1366 px o superior.

Verificá que no existan:

- Elementos superpuestos.
- Textos cortados.
- Desbordamientos.
- Controles inaccesibles.
- Diálogos que no puedan cerrarse.
- Contrastes insuficientes.
- Estados incoherentes.
- Formularios difíciles de completar.

### Validación funcional

Ejecutá los controles que correspondan al proyecto:

- Lint.
- Typecheck.
- Tests del frontend.
- Build.
- Pruebas de componentes afectados.
- Pruebas de flujos críticos.
- Pruebas de accesibilidad automatizadas, cuando sea posible.
- Pruebas de integración necesarias si un cambio puede afectar contratos.

Ejecutá también los controles de seguridad o auditoría exigidos por el repositorio.

No afirmes que una prueba pasó sin contar con su resultado real.

### Validación de comprensión

El agente independiente de usabilidad debe evaluar tareas concretas sin apoyarse en explicaciones del diseñador.

Ejemplos:

- Encontrar dónde registrar el ingreso.
- Identificar si el fichaje fue aceptado.
- Encontrar un motivo pendiente.
- Localizar el historial de una jornada.
- Identificar una situación que necesita revisión.
- Corregir un error cuando el flujo lo permite.

Registrá las dificultades detectadas y corregí los problemas críticos.

Si hay acceso a participantes reales, proponé pruebas de tareas y medí finalización, errores, tiempo y necesidad de ayuda.

Si solo hay simulaciones con agentes, identificá explícitamente esa limitación.

No inventes métricas de éxito.

---

## 11. FASE VIII — REVISIÓN ADVERSARIAL Y REFINAMIENTO

Una vez terminada la primera implementación, iniciá una revisión independiente.

Pedí a los agentes de UX, accesibilidad y QA que evalúen el resultado **sin defender las decisiones originales**.

Necesito que busquen activamente:

- Pantallas todavía difíciles de comprender.
- Pasos innecesarios.
- Problemas de nomenclatura.
- Densidad de información excesiva.
- Controles visualmente inconsistentes.
- Interacciones ambiguas.
- Accesibilidad insuficiente.
- Regresiones funcionales.
- Decisiones estéticas que hayan perjudicado la comprensión.

Agrupá los hallazgos por gravedad.

Corregí los problemas críticos y altos dentro del alcance autorizado.

Repetí la evaluación sobre los componentes modificados.

No declares que el resultado es óptimo únicamente porque los propios agentes coinciden.

---

## 12. ENTREGABLES

Al finalizar, entregá:

### A. Diagnóstico inicial

Resumen de los problemas UX/UI más relevantes encontrados realmente en el proyecto.

### B. Investigación

Principios y evidencia que fundamentaron las decisiones de diseño, con fuentes verificables.

### C. Exploración creativa

Las direcciones visuales consideradas, sus diferencias y el motivo de la selección final.

### D. Implementación

Listado concreto de:

- Pantallas modificadas.
- Componentes creados.
- Componentes refactorizados.
- Componentes eliminados.
- Mejoras en navegación.
- Mejoras en formularios.
- Mejoras de accesibilidad.
- Cambios responsive.

### E. Documentación

Guía visual actualizada y cualquier cambio documental necesario, indicando las propuestas que requieren aprobación.

### F. Validación

Resultados verificables de pruebas técnicas, funcionales y de accesibilidad.

Incluí capturas comparativas cuando sea posible.

### G. Riesgos y pendientes

Problemas que no se hayan podido resolver, motivos y acciones recomendadas.

### H. Resultado final

Explicá concretamente por qué la aplicación es ahora más fácil de utilizar para personas ajenas al sector tecnológico.

No reemplaces evidencia por afirmaciones subjetivas.

---

## 13. CRITERIOS DE ACEPTACIÓN

La refactorización se considerará satisfactoria cuando:

- Todas las pantallas relevantes hayan sido auditadas.
- La navegación tenga una estructura comprensible.
- Las pestañas comuniquen claramente su propósito.
- Las acciones frecuentes sean fáciles de localizar.
- La terminología visible sea coherente y comprensible.
- Los formularios indiquen qué información necesitan.
- Los estados del sistema sean inequívocos.
- Los errores indiquen cómo recuperarse.
- El diseño funcione correctamente en dispositivos móviles.
- Los componentes compartan un sistema visual consistente.
- Las funcionalidades existentes se conserven.
- Los controles técnicos exigidos hayan sido ejecutados y sus resultados documentados.
- Los cambios estén reflejados en la documentación.
- Las mejoras estén realmente implementadas y no solamente propuestas.

El cumplimiento de estos puntos debe demostrarse mediante revisión, pruebas y evidencia disponible, no mediante declaraciones del modelo.

---

## 14. INSTRUCCIÓN FINAL AL ORQUESTADOR

**No hagas un simple lavado de cara del proyecto.**

Quiero que cuestiones de forma profesional la estructura actual de Braja y descubras oportunidades de mejora que posiblemente no haya identificado.

Utilizá Fable 5.2 para investigar, explorar, comparar, diseñar, implementar, criticar y refinar.

Fomentá la creatividad y las alternativas no evidentes, pero exigí justificación y utilidad para cada cambio importante.

No restrinjas la investigación a mis ideas iniciales.

No conviertas mis ejemplos en soluciones obligatorias.

La misión es encontrar la mejor experiencia posible dentro de las necesidades reales del sistema y las restricciones aprobadas.

Trabajá de manera autónoma en todo lo autorizado, sin detenerte después del diagnóstico ni conformarte con entregar un plan.

Mantené actualizaciones breves entre etapas importantes y documentá hallazgos, decisiones y pruebas.

Cuando encuentres bloqueos reales de autorización, documentá la propuesta y continuá con las tareas independientes permitidas.

**Prioridades, en este orden:**

1. Comprensión inmediata para usuarios no técnicos.
2. Preservación de funcionalidades y reglas de negocio.
3. Facilidad y rapidez en tareas cotidianas.
4. Prevención y recuperación de errores.
5. Accesibilidad.
6. Coherencia visual.
7. Calidad estética y personalidad del producto.
8. Mantenibilidad de la implementación.

El resultado deseado es una transformación tangible: que Braja pase de ser una aplicación funcional a convertirse en un producto intuitivo, consistente y profesional.

**Empezá auditando el repositorio, delegá las investigaciones y revisiones independientes, y avanzá hasta la implementación y validación conforme a las autorizaciones vigentes.**
````

- L2 (2026-11-10): wave 1 results. T4: 39 accessibility findings, none critical; every declared text pair passes contrast, the failures are selected/pressed/current indicators and default placeholders. T1: 15 principles; the brief's "about 44 × 44" is AAA, AA asks for 24 px (the guidelines state both and a larger size for the clocking button); no typeface is "especially legible" by itself, size and contrast are. T2: no router, two vocabularies (employee and ADMIN), Jornadas stacks the monthly form over the daily list, twelve items for the owner (O-1 to O-12). T3: 594 screenshots; stack `braja-ux` left stopped with its volume and images.
- L3 (2026-11-10): the capture found two defects already in main, confirmed in the code: the app goes blank on the location history of a site with entries, and the employee's day shows the stored time of marks the ADMIN loaded. Reported to Mateo with the recommendation to fix them in their own PR.
- L4 (2026-11-11): directions shown to Mateo (private artifact page) with the recommendation of the hybrid on a Planilla base and the note that the work would go on with it unless he preferred another. Mateo answered "Continua". Taken as: go on with the hybrid and fix the two defects. Issue #115, PR #116 (fix/location-history-and-mark-time-115, 9e3b97e): four regression tests RED then GREEN, gate 548 tests, lint, typecheck, build and audit exit 0; native assessment medium, review not due (under budget).
- L5 (2026-11-11): design system spec, token file, slice plan and guidelines outline delegated (scratch only) while T6 finishes. Next: T7 checkpoint with Mateo on vocabulary (A1, O-1, O-2), navigation (O-12), the alerts bar (O-11) and the chain strategy.
