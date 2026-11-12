# Informe final: refactorización UX/UI de Fichaje Braja (#114)

Fecha: 2026-11-12. Rama de integración `feat/ux-ui-refactor-114`, más el PR #166 abierto sobre ella. Tarea T13, especificación S13 de `odd/tasks/ux-ui-refactor.md`.

## Resumen

La refactorización está implementada, no solo propuesta. Entraron a la rama de integración los 39 cortes del plan (registro L37) en 43 PRs hijos, más la documentación (PR #163) y las correcciones de la revisión adversaria (PRs #164 y #165). El PR #166 cierra el último hallazgo y está abierto.

- **Qué cambió para la persona que usa la aplicación:** un vocabulario único y llano (D-20261111-01), el menú del `ADMIN` en cuatro destinos con barra fija abajo en el celular (D-20261111-02), resultados y errores junto a la acción que los produjo, validación por campo, y un aviso antes de que se cierre la sesión del `ADMIN` (D-20261112-02).
- **Qué no cambió:** backend, base de datos, `openapi.yaml` y reglas de negocio. Ningún archivo fuera de `frontend/`, `docs/`, `odd/` y `CLAUDE.md` difiere de `main` (`git diff --name-only origin/main...HEAD`). La revisión de QA no encontró rutas, métodos ni cuerpos de pedido distintos de `main` (L39).
- **Controles:** 1162 tests del frontend pasan en el PR #166; lint, tipos, build y `audit:prod` en verde (sección F).
- **Qué falta para el release:** la decisión de Mateo sobre el PR #117 a `main`, la fusión del #166 y las pruebas en dispositivos reales que exige `CLAUDE.md` regla 38 (sección G).

### Cómo leer este informe

Cada afirmación cita su evidencia: PR (#N), commit, test, archivo, entrada del registro (Lnn) o archivo de trabajo. Los archivos de trabajo están en la carpeta temporal de la sesión de trabajo, en la computadora donde se hizo, que llamaremos `SCR`; no están en el repositorio y se pierden si esa carpeta se limpia. Los cinco informes de diagnóstico, investigación y direcciones se copiaron a `odd/ux-ui-refactor/evidencia/`; las capturas (unos 115 MB) quedaron solo en `SCR`.

**Ninguna persona real usó la aplicación durante este trabajo.** Las evaluaciones de uso son simulaciones de un agente sobre capturas, y así se las nombra.

---

## A. Diagnóstico inicial

Cuatro análisis independientes, en paralelo y sin escribir en el repositorio (tareas T2, T3, T4 y T6; registro L2).

| Análisis | Qué encontró | Fuente |
|---|---|---|
| Inventario y arquitectura de información (T2) | 4 pantallas de entrada, 1 pantalla de empleado con 8 secciones, 7 secciones de `ADMIN` con 32 paneles; sin router ni dirección por sección. 32 problemas priorizados (P-01 a P-32): 1 crítico, 7 altos. 12 temas para el dueño (O-1 a O-12) | `odd/ux-ui-refactor/evidencia/audit.md` §6 y §7 |
| Capturas de línea base (T3) | 594 capturas de 120 estados a 320, 390, 768 y 1366 px; 10 estados no capturables. Dos defectos ya presentes en `main` | `SCR/baseline/index.md`; L3 |
| Accesibilidad (T4, solo lectura de código) | 39 hallazgos (F-01 a F-40): 0 críticos, 7 altos, 16 medios, 16 bajos. 9 de 106 pares de color fallan, todos indicadores de estado o textos de muestra | `odd/ux-ui-refactor/evidencia/a11y-baseline.md`, índice de hallazgos |
| Persona no técnica, simulada (T6) | 19 tareas: 6 claras, 12 con dudas, 1 trabada («quién cambió qué en un día»). 15 problemas con redacción propuesta | `odd/ux-ui-refactor/evidencia/advocate-baseline.md` |

**Causas principales.** Los tres análisis coincidieron por separado (L6):

1. Palabras internas en pantalla: desvío, jornada, sede, egreso, tolerancia, historial.
2. El menú de siete secciones del `ADMIN`, que en el celular se partía en varias líneas.
3. «Jornadas» con cuatro herramientas en una sola página. Es el único problema crítico (P-01).
4. Mensajes lejos de la acción que los produjo (P-02, F-02).

**Defectos previos.** Los dos defectos de `main` se corrigieron aparte, antes del rediseño: issue #115, PR #116, cuatro tests de regresión (L4). El primero era la pantalla en blanco del historial de ubicación de un local. El segundo, la hora guardada en lugar de la real en las marcas que cargaba el `ADMIN`. La pantalla en blanco ya no se reproduce en las capturas finales (`SCR/after/compare.md`, estados `admin/sedes--historial-de-ubicacion*`).

## B. Investigación

Informe de T1: `odd/ux-ui-refactor/evidencia/research.md`.

- **Fuentes:** 105 abiertas y usadas: 35 de NN/g, 21 del W3C, 19 de GOV.UK, 6 de USWDS, 5 de plataformas y 19 de investigación y otras. Otras 17 no se usan como evidencia porque no se pudieron leer o solo se conocen por citas.
- **Clasificación:** 16 principios (P1 a P16). Cada uno está marcado como estándar, evidencia empírica (grado A o B) o preferencia. El registro L2 dice 15; la tabla del informe tiene 16.

Conclusiones que cambiaron decisiones de diseño:

| Tema | Qué dice la evidencia | Efecto en el producto |
|---|---|---|
| Tamaño de toque | WCAG AA pide 24 px; los 44 px del pedido son nivel AAA y la cifra de Apple | Las pautas separan tres cifras (§7.1 de `docs/UX_UI_GUIDELINES.md`); botón de marcar más grande |
| Tipografía | Ninguna tipografía es la más legible para todos; importan tamaño, contraste e interlineado | Fuente del sistema, sin fuente incluida (L9) |
| Validación | La evidencia está dividida entre validar al salir del campo y validar al enviar | Se valida al enviar, por convención (pauta C-19) |
| Navegación | Menú oculto: se usó en 57 % de los casos contra 86 % con enlaces visibles (n = 179) | Cuatro destinos siempre visibles |
| Lenguaje llano | Éxito de 46 % a 82 % en lectores con menos alfabetización tras reescribir (n = 50) | Glosario único (D-20261111-01) |

**Límites que el propio informe declara:**

- No hay investigación con usuarios de Braja.
- Los estudios con adultos mayores usaron personas de 65 años o más.
- No se encontró investigación independiente sobre aplicaciones de fichaje.
- Material Design no se pudo leer en su sitio.

## C. Exploración creativa

Tres direcciones como prototipos estáticos de las mismas pantallas (T5; `odd/ux-ui-refactor/evidencia/directions.md`):

| Dirección | Idea | Puntaje |
|---|---|---|
| A · Planilla | La planilla horaria del local: filas con regla, sin tarjetas, un solo elemento lleno por pantalla | 33 |
| B · Mostrador | Atención en el mostrador: un bloque por tarea, texto y botones grandes | 32 |
| C · Tablero | Tablero de control: estado siempre primero, acción siempre al final, más densidad | 31 |

Cada dirección se puntuó en ocho criterios, de 1 a 5. Las sumas quedaron a dos puntos, así que no decidieron. Decidió el orden de prioridades del pedido (S15).

**Dirección elegida:** un híbrido con base en Planilla (`SCR/directions/hibrido/`), que toma de cada propuesta:

- **De B:** la escala del empleado, el bloque «ahora», las opciones del motivo como tarjetas y la barra de pestañas abajo.
- **De C:** la banda verde oscura con la marca y la barra de estado en el borde de cada caso.

Mateo respondió «Continua» (L4). El sistema de diseño quedó en `odd/ux-ui-refactor/design-system.md`: 55 pares de contraste requeridos pasan AA (`odd/ux-ui-refactor/contrast-output.md`).

## D. Implementación

Todo el trabajo entró como PRs hijos a la rama de integración, con CI verde y un corte por PR (estrategia elegida por Mateo, L10).

- **Diferencia del frontend contra `main`:** 92 archivos en `frontend/src`: 38 nuevos, 50 modificados y 4 borrados; 12.905 líneas agregadas y 3.084 quitadas (`git diff --shortstat origin/main...HEAD -- frontend/src`).
- **Dependencias:** ninguna nueva. `package.json` no cambió.

### D.1 Pantallas modificadas

| Pantalla (nombre nuevo) | Antes | Cambios principales | PRs |
|---|---|---|---|
| Ingreso, cambio de contraseña, elegir empresa | Ídem | Barra de la aplicación, hoja plana, sin renglón en mayúsculas, error debajo de cada campo | #150, #151, #165 |
| Día del empleado | Ídem | Bloque «ahora» con estado, botón siguiente y horario; el día como planilla de cuatro filas; «Para explicar» arriba si hay algo pendiente; otro día es solo para mirar (D-20261112-01) | #141, #143, #147, #165 |
| «Para revisar» | «Bandeja» | La persona primero, barra de estado, par de botones «Justificado» y «No justificado», resultado en la fila, cantidad de casos | #148, #165 |
| «Hoy» | «Jornadas» e «Historial» | Lista del día primero, cada día se abre en su fila, «Buscar días anteriores» como pliegue | #137, #140, #142, #146 |
| «Días de trabajo» | Parte de «Jornadas» | Sección propia, opciones rápidas con tilde, días salteados como registros | #140, #152 |
| «Configuración» | No existía | Página con sus partes, el control de avisos y «Conexión protegida» | #144 |
| «Locales» | «Sedes» | Registros sin avatar, mapa más alto, foco que acompaña al mapa | #154, #165 |
| «Horarios» | Ídem | Registros por local, tipo de horario como opciones, selector de local arriba de la lista | #155, #165 |
| «Equipo» | «Empleados» | Edición, restablecimiento y contraseña provisoria dentro del registro de cada persona | #153 |
| «Primeros pasos» | Ídem | Pasos en orden, solo el siguiente destacado | #156 |

### D.2 Componentes

**Creados:**

- **En `app/ui.tsx`:** `Status`, `LoadFailure`, `PageHeading`, `StatusTag`, `Brand`, `SkipLink`, `TableScroll`, `TopbarNotice`, `Fieldset` y `FieldsSummary`. En `main` ese archivo exportaba siete componentes.
- **Archivos nuevos:** `app/icons.tsx` (32 íconos SVG, #125), `shared/labels.ts` (#119), `app/useFieldErrors.ts` (#159), `app/revealAndFocus.ts` (#157), `app/useBreakpoint.ts` (#134), `app/sessionWarning.tsx` (#164), `device/push/useAdminPush.ts` (#129), `features/admin/AdminNav.tsx` y `ConfigurationPage.tsx` (#144), y `features/admin/useAdminSection.ts` (#132).

**Refactorizados:** `PageMessage`, `Panel`, `FormField`, `AppHeader`, `CompanySwitcher`, `Loading` y `Empty`, más el aspecto de todos los botones (#127), campos (#128), mensajes (#131) y listas (#134).

**Eliminados:**

- `features/admin/AdminViews.tsx` y `AdminViewsRender.tsx`. Se partieron en un archivo por sección, con prueba de que el código se movió sin cambios (#133, #135); los archivos que solo reexportaban se borraron en #162.
- `useMediaQuery.ts` y `useNarrowScreen.ts`, reemplazados por `useBreakpoint` (#134).
- Reglas de CSS viejas: `.eyebrow`, `.deviation-*`, `.simple-*`, `.row-avatar` y el bloque de tokens heredado (#148, #150, #156, #162).
- Los colores escritos a mano en la hoja de estilos: quedan 0 (L33).

### D.3 Mejoras por área

- **Navegación:**
  - Una dirección por sección: Atrás y recargar conservan el lugar (#132).
  - Cuatro destinos: barra fija abajo por debajo de 1024 px y columna a la izquierda desde 1024 px (#144).
  - Título de pestaña por sección y foco al título al navegar (#157).
  - «Ir al contenido» (#160).
  - Cambio de empresa con el botón «Cambiar» (D-20261112-03, #165).
- **Formularios:**
  - Se valida al enviar, con el mensaje debajo de cada campo.
  - El foco va al primer campo con error.
  - La respuesta del servidor se muestra dentro del formulario (#151, #159).
  - Los botones se desactivan solo mientras se envía (#159).
- **Accesibilidad:**
  - Estados que no dependen solo del color (#131).
  - Controles de 48 px por debajo de 1024 px (#128).
  - Estados visibles en colores forzados (#160).
  - Tablas navegables con teclado (#160).
  - Foco devuelto al cerrar formularios (#157, #161).
  - Aviso de sesión con «Seguir conectado» (#164, #166).
- **Responsive:**
  - Solo tres cortes de ancho (600, 768 y 1024 px), más uno para pantallas angostas y otro para pantallas bajas (#160).
  - Listas en lugar de tablas por debajo de 768 px (#134).

## E. Documentación

| Documento | Contenido | Evidencia |
|---|---|---|
| `docs/UX_UI_GUIDELINES.md` | 84 obligaciones, cada una con su forma de comprobarla; la verificación manual M-1 a M-14; la sección 11 con lo pendiente | PR #163, L38 (129 archivos y 200 títulos citados, 0 faltantes) |
| `docs/DECISIONES.md` | Seis filas adoptadas: D-20261111-01 a -03 y D-20261112-01 a -03 | L7, L8, L13, L39 |
| `CLAUDE.md` | La regla 36 nombra los contenedores y vistas por sección; conteo de decisiones de §2 | #163, #165 |
| `odd/ux-ui-refactor/` | Sistema de diseño, tokens con su chequeo de contraste, plan de cortes, esquema de las pautas | T8, L9 |
| `odd/tasks/ux-ui-refactor.md` | Especificaciones S1 a S15, tareas y el registro L1 a L40 | Este repositorio |

## F. Validación

### F.1 Controles técnicos

| Corrida | Resultado | Evidencia |
|---|---|---|
| Línea de partida (`main` con #116) | 548 tests | L4 |
| Gate de T11a | lint, tipos y build en verde; 1119 tests en 50 archivos; `audit:prod` limpio salvo la excepción fechada GHSA-gcqx-w48m-w2h4, vigente hasta el 2027-01-31 | `SCR/after/gate/test.txt`, `SCR/after/gate/audit.txt` |
| Tres corridas completas de T12 | 1159 tests en 52 archivos, las tres en verde | `t12-gate-1.log` a `t12-gate-3.log`, en la carpeta temporal de la sesión, un nivel arriba de `SCR` |
| PR #166 | 1162 tests; lint, tipos y build en verde. El CI del frontend pasó; los dos trabajos de backend estaban pendientes al escribir este informe | Cuerpo del PR #166; `gh pr checks 166` |

El registro L40 anota 1161 tests porque se escribió antes de la segunda corrección; el PR #166 suma un test (`styles.test.tsx`, «el aviso de sesión por vencer queda pegado arriba al desplazar la página, sin tapar el foco») y llega a 1162.

### F.2 Revisión automática de capturas (T11a)

Se tomaron las capturas finales con el backend real en la pila local `braja-ux`: 604, contra 594 de antes. En 483 capturas de página completa a 1366, 768, 390 y 320 px se buscaron siete problemas:

- desplazamiento de costado;
- elementos fuera de la pantalla;
- texto cortado;
- controles superpuestos;
- controles de menos de 44 × 44 px;
- final de la página tapado por la barra fija;
- primer Tab sin anillo de foco visible.

Resultado: 0 casos de cada uno (`SCR/after/compare.md`, «Totals»).

Quedaron dos notas visuales:

- En «Crear un horario», ninguna opción queda elegida después de editar la hora de un horario predefinido. Sigue abierta.
- A 390 px, las horas del horario nocturno no quedaban alineadas. Se corrigió en #165.

### F.3 Verificación sobre la aplicación construida (G2)

Con una API simulada se probaron la aplicación construida a 320, 390, 768 y 1366 px, a 640 × 360, con zoom de 200 % y 400 %, solo con teclado y con colores forzados emulados (L36, PR #161).

La disposición pasó en todos los casos. Lo que falló se corrigió con tests que primero fallaban:

- el anillo de foco en los campos de fecha y hora;
- el foco después de crear un local, crear un empleado y cargar días;
- el aviso que toma el foco cuando un caso sale de la lista;
- los campos deshabilitados en colores forzados.

### F.4 Evaluación de uso simulada (T11b)

**Esto es una simulación.** Un agente recorrió 11 tareas mirando solo capturas, sin las explicaciones del diseño. Nadie fue observado; no hay métricas de éxito.

| Resultado | Tareas |
|---|---|
| Se completa sin dudas | 3: marcar la entrada; salir a almorzar y volver; restablecer una contraseña |
| Se completa con dudas | 8 |
| No se completa | 0 |

No se puede comparar con T6: son otras tareas y otro material.

**Lo que funcionó, según el agente:** la pantalla del empleado con una frase y un botón grande, las confirmaciones con hora y ubicación, la pregunta antes de salir temprano, el error sin conexión, la validación por campo, las tarjetas del motivo, el resumen de la carga de días, la entrega de la contraseña provisoria, la búsqueda en el mapa, la navegación coherente y las pantallas a 320 px.

Los problemas que encontró están en G.4.

### F.5 Revisión adversaria (T12)

Tres agentes de solo lectura revisaron la rama en `446e06b`: uno de UX, uno de accesibilidad y uno de QA (L39).

- **QA:** sin regresiones críticas ni altas. La única llamada nueva a la API es `GET /session`, la de «Seguir conectado».
- **UX:** 1 hallazgo crítico (K-1: botones de marcar en un día pasado) y 5 altos.
- **Accesibilidad:** 1 hallazgo crítico (la sesión del `ADMIN` vence sin aviso, F-04) y 2 altos.

Mateo decidió tres puntos, que quedaron como D-20261112-01 a -03. Las correcciones entraron en #164 y #165, con revisión nativa aprobada (L40). En el control sobre `9996676` quedaron resueltos 8 de los 9 hallazgos críticos y altos. F-04 quedó parcial: el aviso no se veía al bajar por la página. Lo corrige #166.

### F.6 Antes y después

- **Momento de las capturas:** las de «después» son del commit `5e00b42` más la documentación, antes de las correcciones de T12. Por eso todavía muestran horas de 12 horas («2:37 p. m.»), el rótulo viejo del radio y «Clasificación guardada.» lejos de su fila.
- **Ubicación:** son archivos locales, no están en el repositorio.
- **Rutas:** en la tabla, `ANTES` = `SCR/baseline/shots/` y `DESPUÉS` = `SCR/after/shots-after/`. El nombre de archivo es el mismo en las dos carpetas.

| Pantalla | Archivo (en `ANTES` y en `DESPUÉS`) | Qué cambió |
|---|---|---|
| Ingreso, 390 | `auth/login--empty--390-viewport.png` | Barra de la aplicación arriba; desaparece «INGRESO AL SISTEMA» (#150) |
| Día del empleado, 390 | `employee/dia--en-curso-sin-pendientes--390.png` | El estado, los botones y el horario en un solo bloque; planilla de cuatro filas; desaparecen los recuadros vacíos de «Desvíos del día» |
| Día del empleado, 320 | `employee/dia--en-curso-sin-pendientes--320.png` | La misma pantalla al ancho más chico, sin desplazamiento de costado |
| Marca confirmada, 390 | `employee/marcar--entrada-confirmada-en-curso--390-viewport.png` | La confirmación con ícono, hora y «Ubicación enviada» arriba del bloque de acción; botones con ícono |
| Motivo, 390 | `employee/motivo--completo-antes-de-enviar--390.png` | «Para explicar» como una sola lista, opciones en tarjetas con la elegida visible (#147, #128) |
| «Para revisar», 390 | `admin/bandeja--con-casos-y-aviso-de-dias--390.png` | Menú de siete secciones en tres líneas reemplazado por cuatro pestañas abajo; nombre de la persona primero; par de botones con ícono; barra de estado en el borde |
| «Para revisar», 1366 | `admin/bandeja--con-casos-y-aviso-de-dias--1366.png` | Columna de cuatro destinos; casos con la persona primero (#148) |
| «Hoy», 1366 | `admin/jornadas--hoy--1366.png` | Antes, la carga mensual iba arriba de la lista y la barra de avisos flotaba abajo. Ahora la lista del día va primero y «Buscar días anteriores» es un pliegue |
| «Días de trabajo», 390 | `admin/jornadas--cargar-dias-resultado-ok--390.png` | Sección propia; resultado dentro del formulario (#140, #152) |
| «Locales» con mapa, 390 | `admin/sedes--agregar-mapa-punto-elegido--390.png` | Mapa más alto; mapa y confirmación en una pantalla de 320 × 640 (#154) |
| «Equipo», 390 | `admin/empleados--lista--390.png` | Todo dentro del registro de cada persona (#153) |

## G. Riesgos y pendientes

### G.1 Lo que bloquea el release

| Pendiente | Responsable | Evidencia |
|---|---|---|
| Fusionar el PR #166 en la rama de integración cuando el CI termine | Desarrollo | `gh pr checks 166` |
| Decidir el PR #117 a `main`. Está en borrador y su descripción todavía dice que solo contiene documentos | Mateo | `gh pr view 117` |
| Probar en un Android y en un iPhone reales: instalación, sesión, marca con ubicación y avisos (M-7, M-9, M-12). La regla 38 lo exige antes de cada release y nunca se probó en un iPhone | Mateo, o quien él designe | `CLAUDE.md` regla 38; pautas §10 |
| Checklist de release y RTO: no existen. Es un pendiente de todo el proyecto, no de esta tarea | Mateo | `CLAUDE.md` §8 |

### G.2 Mateo (no bloquea, pero conviene antes del release)

- **Revisar los textos nuevos.** Están en pantalla como propuesta hasta que Mateo los revise. Los nombran los PRs de F2a (#151), F2b (#159), F1 (#157), H1 (#162), T12 (#164, #165), E6 (#153) y E4 (#154); la lista completa está en las pautas §11.4.
- **Elegir las palabras que el glosario deja abiertas:** las pausas para el `ADMIN`, el estado «Sin ingreso», «Falta explicar» y «Empleado» (pautas §11.5).
- **Registrar como filas de `docs/DECISIONES.md` las seis elecciones respondidas en el chat** (pautas §11.6; registros L21 a L34).
- **Decidir las propuestas de las pautas §11.3:** tipografía incluida, biblioteca de pruebas de accesibilidad, botón para copiar la contraseña provisoria y ofrecer los avisos desde «Para revisar».
- **Decidir las propuestas del diagnóstico que no tienen fila en `docs/DECISIONES.md` ni mención en las pautas:** O-3 (filtro por estado en `GET /inbox`), O-5 (contraseña provisoria más corta), O-7 (horario actual en la lista del equipo), O-8 (cuánto se desvió cada caso) y O-10 (huecos de la API) (`odd/ux-ui-refactor/evidencia/audit.md` §7).

### G.3 Enrique

- **#66:** cerrado como completado el 2026-11-11 por el PR #136, que llevó a `main` sin cambios los commits de su PR #130, con casillas de 18 px. En la rama de integración rige la regla de 24 px de B3, y la regla de 18 px se quitó al fusionar `main` (L18, L19).
- **#70:** cerrado como no planificado el 2026-11-11, reemplazado por #114.
- **Su rama local sin publicar** toca `styles.css`, `AuthScreens.tsx` y el archivo partido `AdminViewsRender.tsx`, que ya no existe (L17). Si la retoma, tiene que rehacerla sobre la estructura nueva.

### G.4 Desarrollo (seguimientos sin corregir)

**De la validación técnica.** Las pautas §11.7 listan los detalles que quedaron abiertos, ninguno marcado como crítico o alto; por ejemplo, el foco tapado 6 px en «Equipo», el texto «en 2 minutos» del aviso de sesión y la frase «cancelado por el administrador». A eso se suma la opción de «Crear un horario» que no queda elegida (F.2).

**Obligaciones que no quedaron vigentes** (pautas §11.2): L-6 (fechas y horas formateadas en un solo módulo), L-7 (duraciones en horas y minutos) y L-10 (marcar los campos opcionales).

**Problemas de la evaluación simulada T11b**, en el orden en que los dio el agente:

1. Los pasos no se encadenan: una persona o un local nuevo queda sin indicar qué le falta (horario, días cargados).
2. Fechas y horas difíciles de leer. Siguen abiertos: el caso muestra cuándo se registró y no su día de trabajo, no hay nombres de días, aparece «449 minutos» y los campos de fecha y hora no vienen completos. La mezcla de 12 y 24 horas se corrigió en #165.
3. Estados que confunden. Siguen abiertos: un día pasado con la salida olvidada dice «En curso» y «Sin ingreso» no muestra la hora esperada. La cantidad de casos se agregó en #165.
4. Confirmaciones lejos de la acción. Se corrigió en «Para revisar» (#165); el resto no se revisó de nuevo.
5. Valores por defecto riesgosos: «Seleccionar todos» viene tildado al cargar días, y se puede decidir con un toque sobre casos todavía no explicados.
6. Palabras poco claras: «Sin ingreso» al lado de «entrada», «No aplica», «Registrada:», «sesiones», «Hora del local», «Capturar ubicación del dispositivo» y la regla de largo de la contraseña.
7. Páginas largas en el celular con la acción al final.
8. Contraseñas provisorias con mayúsculas y minúsculas mezcladas, difíciles de dictar.
9. El error genérico «La hora o la acción no encajan… Revisá el orden.».

**Test intermitente.** Un test de foco de `EmployeeApp.test.tsx` falló una vez con la suite completa (L37). En T12 el foco pasó al contenedor y la espera tiene 5 s de plazo (pautas §11.7). Después pasó en todas las corridas completas registradas: el gate de T11a, las tres de T12 y la del #166.

### G.5 Riesgos residuales

- **Nadie del público real vio la aplicación.** Las pruebas con lector de pantalla (TalkBack, VoiceOver, NVDA), el tema de contraste real de Windows, el mapa con el dedo y las áreas seguras del iPhone siguen sin hacerse (M-6 y M-8 a M-12; pautas §11.8). Tampoco se hicieron M-2, M-3 ni M-14.
- **La evidencia de A, B, C y F.2 vive fuera del repositorio,** en la carpeta temporal `SCR`, incluidas las capturas. Si se borra esa carpeta, se pierde.

## H. Resultado final

**Qué tiene ahora quien usa la aplicación:**

- **El empleado** abre una pantalla con una frase que dice cómo va su día, un botón grande para la marca siguiente y su día como planilla de cuatro filas.
- **El encargado** tiene cuatro destinos siempre a la vista, cada caso empieza por la persona, y los resultados y errores aparecen donde actuó.
- **Los dos** leen las mismas palabras.

**Evidencia:**

- 39 cortes en 43 PRs hijos fusionados, más #166 abierto.
- De 548 a 1162 tests del frontend.
- 0 problemas automáticos en 483 capturas a cuatro anchos.
- 8 de 9 hallazgos críticos y altos resueltos, y el noveno en #166.
- Sin cambios de backend ni de contrato.

**Qué falta antes del release:**

1. Fusionar #166.
2. Probar en un Android y un iPhone reales según la regla 38.
3. Revisar los textos.
4. La decisión de Mateo sobre el PR #117.

Recomendación: revisar los textos y hacer las pruebas en dispositivos antes de fusionar el #117.
