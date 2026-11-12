# Pautas de UX e interfaz de Fichaje Braja

Este documento dice qué tiene que cumplir toda pantalla del frontend y cómo se comprueba cada punto. Sirve para revisar un PR que toca la interfaz sin tener que reconstruir la historia de la refactorización (issue #114).

Fecha: 2026-11-12. Verificado contra el commit `f2874f0` de la rama `feat/ux-ui-refactor-114`: cada archivo de test citado existe en ese commit y cada título de test citado aparece en su archivo (comprobado con un script; ver «Cómo se mantiene» en la sección 1). Para escribirlo no se corrieron los tests: la última corrida registrada es la del merge de la tanda H1, con 1119 tests en verde (registro L37 de `odd/tasks/ux-ui-refactor.md`).

## Camino rápido para revisar un PR de interfaz

1. Correr el gate del frontend de `CLAUDE.md` §6 (`npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run audit:prod`), sin pipes. Casi todas las obligaciones con verificación `test` caen ahí.
2. Correr los comandos `script` de las obligaciones que el PR toca (sección 1.2) y pegar la salida en el PR.
3. Si el PR cambia lo que se ve, adjuntar capturas a 320, 390, 768 y 1366 px (G-3) y hacer los pasos `manual` que le correspondan (sección 10).
4. Si el PR agrega una palabra, un destino del menú o una función, o contradice una decisión vigente, tratarlo como propuesta (G-1).

## Índice

1. Para qué sirve y a quién obliga
2. Principios
3. Tokens
4. Navegación
5. Jerarquía
6. Lenguaje
7. Accesibilidad
8. Componentes
9. Responsive
10. Verificación manual antes de cada release
11. Qué queda fuera y qué es propuesta pendiente

---

## 1. Para qué sirve y a quién obliga

Obliga a todo cambio en `frontend/src` que cambie lo que una persona ve, lee o toca: textos, estilos, componentes, navegación, foco y mensajes. No cambia reglas de negocio, contratos de API ni el backend.

### 1.1 Qué prevalece sobre este documento

- Las reglas duras de `CLAUDE.md` §5, las decisiones adoptadas de `docs/DECISIONES.md` y la autoridad del dueño del producto (Mateo) prevalecen sobre cualquier pauta de acá. Si una pauta choca con una de ellas, gana la regla o la decisión y esta pauta se corrige.
- En particular, ninguna mejora visual cambia las reglas de geolocalización (la ubicación se pide solo al marcar y nunca bloquea una marca: regla 3 de `CLAUDE.md`, D-20261014-12), de horarios, de idempotencia, de clasificación de casos, de auditoría ni la ausencia de cola offline.
- El alcance del producto es cerrado (D-20261014-03): una pauta de interfaz no agrega funciones.

### 1.2 Cómo leer cada obligación

Cada obligación tiene un identificador (por ejemplo `N-4`), lo que exige, cómo se verifica y su clase.

**Formas de verificar:**

| Forma | Qué es | Dónde corre |
|---|---|---|
| `test` | Un test de vitest. Se cita el archivo, relativo a `frontend/src/`, y el título del test entre comillas, tal como está en el código. Un `%s` del título es el valor de un `it.each`. | `npm test`, en el gate de §6 de `CLAUDE.md` y en CI |
| `script` | Un comando que se corre desde la raíz del repositorio. Su salida se pega en el PR. | A mano |
| `manual` | Un paso de la lista de la sección 10, con su número (`M-1`…). | A mano, antes de cada release |

Una obligación que no tiene ninguna de las tres formas no entra en este documento: va a la sección 11.

**Clases:**

- **`[norma]`**: criterio de WCAG 2.2 nivel A o AA (se cita su número) o guía publicada de una plataforma o de un sistema de diseño público (se indica «plataforma»). Solo los criterios de WCAG son requisito de conformidad.
- **`[evidencia]`**: hay investigación empírica detrás. A si se pudo leer el método; B si la fuente dice basarse en estudios propios sin mostrarlos.
- **`[convención]`**: decisión de este producto, sin respaldo empírico verificado. Se puede cambiar con una decisión; no se presenta como requisito de accesibilidad.
- **`decisión`**: la obligación sale de una fila adoptada de `docs/DECISIONES.md`, que se cita por su ID.

Ninguna palabra, tamaño ni orden de este documento se probó con usuarios reales: el perfil de usuario es una hipótesis del encargo del #114.

### 1.3 Gobierno

| ID | Obligación | Cómo se verifica |
|---|---|---|
| G-1 | Un cambio que agrega una palabra visible para algo del glosario, un destino del menú o una función, o que contradice una decisión vigente, se presenta como propuesta pendiente de aprobación, con su fila `propuesta` en `docs/DECISIONES.md`. No se implementa como definitivo. | Revisión del PR; para las palabras retiradas, `test` `app/glossary.test.ts` "no text people read uses a retired word" |
| G-2 | Este documento no atribuye aprobaciones: cada pauta que nace de una decisión cita su ID; lo que no tiene fila se escribe como convención o como propuesta pendiente (misma regla que `CLAUDE.md` §2). | Revisión del PR |
| G-3 | Todo cambio visual adjunta capturas a 320, 390, 768 y 1366 px de las pantallas que toca. | Descripción del PR (el repositorio no tiene plantilla de PR) |
| G-4 | Lo que este documento llama `[convención]` se puede cambiar con una decisión; lo que llama `[norma]` WCAG, no. | La clase de cada fila |

### 1.4 Cómo se mantiene

- Al cambiar una pantalla, se actualiza la obligación que la describe en el mismo PR. Si el código y este documento difieren, gana el código y este documento se corrige, con la fecha.
- Antes de aceptar un cambio en este documento se comprueba que cada test citado exista: se extrae cada ruta `*.test.ts(x)` entre comillas invertidas y cada título entre comillas que la sigue, y se busca el título en el archivo. El 2026-11-12 se hizo con un script de un solo uso, que no está en el repositorio: 129 referencias a archivos y 200 títulos, ninguno faltante. Convertirlo en un test que corra en CI es una propuesta (sección 11.3).
- `docs/UX_FRONTEND_COVERAGE.md` es un mapa anterior de leyes de UX aplicadas al frontend; no se revisó para esta versión y puede usar nombres que ya no están en pantalla.

---

## 2. Principios

Son los diez del sistema de diseño (`odd/ux-ui-refactor/design-system.md`, sección 1). Las secciones 4 a 9 los vuelven obligaciones comprobables.

1. **Plano y con líneas.** El contenido va sobre blanco, separado por líneas: una línea fina entre filas y una raya de tinta de 2 px bajo el título de una sección. Sin sombras, degradados ni transparencias.
2. **Solo tiene borde lo que se opera o lo que dice un estado**: un control, una etiqueta de estado, el bloque «ahora» del empleado y la confirmación de una marca.
3. **Los registros nunca son tarjetas.** Son filas de una lista, y de una tabla desde 768 px.
4. **El relleno es información.** El verde lleno dice «la acción siguiente»: a lo sumo un botón lleno por región.
5. **El oscuro, como fondo de una zona, está en un solo lugar: la barra de arriba.** El lima, solo en la marca y en el foco sobre esa barra.
6. **Un estado es forma, palabra y color, en ese orden de importancia.** La barra del borde izquierdo repite la etiqueta; nunca la reemplaza.
7. **El color dice de quién es el turno.** Ámbar: espera a quien mira. Gris punteado: espera a otra persona. Verde y rojo: lo decidido. El estado de un día es neutro.
8. **Un tamaño de texto para trabajar** (16 px; 18 px en lo principal de la pantalla del empleado), una sola familia de letra.
9. **Todo lo que se toca mide al menos 44 px**; 48 px en las pantallas con barra de abajo; el botón de la marca siguiente, 80 px.
10. **Nada flota.** Ayudas, mensajes, formularios y resultados se abren en el flujo, al lado de lo que los causó.

---

## 3. Tokens

Los valores viven en un solo lugar: el bloque de tokens al principio de `frontend/src/styles.css`, que termina en el comentario `/* end of tokens */`. Este documento no repite los valores salvo cuando el número es la regla (24, 44, 48, 56 y 80 px). La especificación de cada token y su uso está en `odd/ux-ui-refactor/design-system.md`, sección 2.

| Familia | Tokens | Qué protege su uso |
|---|---|---|
| Color | 20 colores: superficies, texto, marca, estados (`--ok`, `--warn`, `--bad` y sus superficies), borde, línea fina, anillo de foco, lima | `test` `app/styles.test.tsx` "ningún color fuera del bloque de tokens: no queda ninguno escrito a mano", "cada par de texto, borde, estado y foco de los tokens cumple el contraste AA (1.4.3 y 1.4.11)" |
| Texto | una familia (`--font-family`), cinco tamaños en `rem` (`--font-size-meta`, `-body`, `-body-lg`, `-title`, `-display`), tres pesos, interlineados | `test` `app/styles.test.tsx` "los tamaños de letra salen de los tokens: no queda ningún font-size sin token", "hay una sola familia de letra: toda font-family sale de un token" |
| Espacio | `--space-1` a `--space-7`, `--gutter`, `--measure` | Revisión del PR (ningún test pone techo a los espacios escritos a mano) |
| Forma | tres radios (`--radius-tag`, `--radius`, `--radius-block`), dos bordes (`--border-width`, `--border-width-strong`), dos barras (`--bar-width`, `--state-bar-width`) | `script` de C-2 |
| Áreas de toque | `--target-floor`, `--target`, `--target-large`, `--target-clock`, `--bottom-nav-height` | Sección 7, A-1 a A-3 |

**Contraste.** El test de contraste recalcula 55 pares obligatorios sobre los tokens (portados de `odd/ux-ui-refactor/contrast.mjs`); ninguno falla. Según `odd/ux-ui-refactor/contrast-output.md`, el menor margen de un texto es 6,02:1 (`--warn` sobre `--warn-surface`, mínimo 4,5:1) y el menor de un borde o indicador es 3,80:1 (`--border` sobre `--bad-surface`, mínimo 3:1). Esas cifras valen para `styles.css` porque sus 20 colores son idénticos a los de `odd/ux-ui-refactor/tokens.css` (comparación del 2026-11-12).

**Un token nuevo** entra en el bloque de arriba con un comentario que dice para qué es; si es un color, se agrega su par a `TOKEN_PAIRS` en `app/styles.test.tsx`. `test` `app/styles.test.tsx` "no queda ningún token viejo y toda variable que se usa está declarada".

---

## 4. Navegación

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| N-1 | El menú del `ADMIN` tiene cuatro destinos, en este orden y con estos nombres: «Para revisar», «Hoy», «Días de trabajo», «Configuración». | `test` `features/admin/AdminNav.test.tsx` "es una sola navegación con nombre, con los cuatro destinos en el orden decidido y como enlaces a su dirección"; `features/admin/useAdminSection.test.ts` "usa los nombres finales del menú de cuatro destinos" | decisión D-20261111-02; tener de 3 a 5 destinos en una barra es `[norma]` de plataforma |
| N-2 | El orden y la presencia de los cuatro destinos no cambian con el estado de la configuración ni con el ancho de la pantalla. | `test` `features/admin/AdminNav.test.tsx` "el orden de los cuatro es el mismo con la configuración completa o con un paso pendiente"; `manual` M-1 | `[norma]` WCAG 3.2.3 |
| N-3 | Cada destino tiene nombre visible; el ícono lo acompaña y nunca lo reemplaza, y los lectores de pantalla no lo leen. | `test` `features/admin/AdminNav.test.tsx` "es una sola navegación con nombre, con los cuatro destinos en el orden decidido y como enlaces a su dirección"; `app/icons.test.tsx` "«%s» es un svg de adorno: oculto para lectores de pantalla y fuera del orden de foco", "al lado de un texto no cambia el nombre del control ni aparece como imagen" | `[evidencia]` B; `[norma]` WCAG 2.5.3 para el nombre |
| N-4 | El lugar actual se marca con dos señales además del color (una barra de 4 px y la negrita) y con `aria-current`. En una parte de «Configuración» queda marcada «Configuración» y, en la columna de la computadora, también la parte. | `test` `app/styles.test.tsx` "el lugar actual de la navegación se reconoce por una barra de 4 px y la negrita, no solo por el color (1.4.1)"; `features/admin/AdminNav.test.tsx` "en %s marca «%s» como el lugar actual y ningún otro", "en una parte de «Configuración» (%s) «Configuración» sigue marcada y su parte «%s» es el lugar actual" | `[norma]` WCAG 1.4.1 y 1.4.11 |
| N-5 | En el `ADMIN`, el título de cada sección (`h1`) es la misma palabra que su entrada del menú. | `test` `features/admin/AdminViews.test.tsx` "la dirección %s abre %s" | `[norma]` WCAG 2.4.6 y 3.2.4 |
| N-6 | Cada sección del `ADMIN` tiene una dirección propia (`#/hoy`, `#/configuracion/locales`…): recargar o volver atrás no pierde el lugar. | `test` `features/admin/useAdminSection.test.ts` "cada sección tiene una dirección propia que empieza con #/ y vuelve a su sección", "volver atrás muestra la sección anterior y adelante la siguiente"; `manual` M-7 | decisión D-20261111-02 (su primer paso) |
| N-7 | Cada pantalla y cada sección le pone nombre a la pestaña del navegador («Hoy · Fichaje Braja»). Cuando la persona cambia de sección, el foco va al `h1`; al abrir la aplicación, no se mueve. | `test` `features/admin/AdminViews.test.tsx` "la dirección %s se llama «%s · Fichaje Braja» en la pestaña", "elegir una sección del menú le pone su nombre a la pestaña y lleva el foco a su título", "al abrir el panel el foco no se mueve: la primera sección no es un cambio"; `app/App.test.tsx` "cada pantalla que elige la aplicación tiene su título, y la del ADMIN lo deja a su sección" | `[norma]` WCAG 2.4.2 y 2.4.3 |
| N-8 | En el celular hay un solo elemento fijo, la barra de abajo, más la franja que pinta la zona de la barra de estado del iPhone; en la computadora, ninguno. El aviso de versión nueva y la ayuda para instalar van en el flujo de la página. | `test` `app/styles.test.tsx` "nada queda fijo en la pantalla salvo la barra de navegación y la franja de la barra de estado del iPhone", "el aviso de versión nueva y la ayuda para instalar van en el flujo de la página, sin flotar sobre ella" | `[convención]` |
| N-9 | La barra fija no tapa el control que tiene el foco. | `test` `app/styles.test.tsx` "deja lugar para que la barra de navegación no tape el contenido ni el foco (2.4.11)"; `manual` M-4 | `[norma]` WCAG 2.4.11 |
| N-10 | El menú no se desplaza de costado en ningún ancho: a 320 px entran las cuatro etiquetas enteras. | `test` `app/styles.test.tsx` "la navegación del ADMIN es una barra fija abajo hasta 1024 px, una columna a la izquierda desde ahí y entra entera en 320 px"; `manual` M-1 | `[evidencia]` B |
| N-11 | El empleado tiene una sola pantalla y ningún menú. | `manual` M-1 | `[convención]` |
| N-12 | Una ayuda que se repite en varias pantallas (por ejemplo, «avisale a tu encargado») ocupa el mismo lugar relativo en todas. | `manual` M-14 | `[norma]` WCAG 3.2.6 |
| N-13 | «Configuración» es una página (`#/configuracion`) que lleva a sus partes (Locales, Horarios, Equipo y Primeros pasos), cada una con una línea que dice para qué es, y tiene el control de avisos del dispositivo. «Primeros pasos» va primero y solo mientras falta un paso. Desde 1024 px, la columna izquierda lista esas partes debajo de «Configuración». | `test` `features/admin/ConfigurationPage.test.tsx` "lleva a cada una de sus partes, con una línea que dice para qué es", "mientras falta un paso, «Primeros pasos» es la primera parte", "tiene el control de avisos de este dispositivo, después de las partes"; `features/admin/AdminNav.test.tsx` "las partes de «Configuración» van debajo de ella, con «Primeros pasos» primero solo mientras falta un paso" | decisión D-20261111-02 (las partes y «Primeros pasos mientras falte un paso»); que la columna liste las partes es `[convención]` |
| N-14 | La dirección vieja `#/historial` lleva a «Hoy», con la búsqueda de días anteriores abierta, y queda `#/hoy` sin agregar un paso al historial del navegador. | `test` `features/admin/useAdminSection.test.ts` "la dirección vieja #/historial muestra «Hoy», queda #/hoy sin agregar un paso y dice por dónde se llegó"; `features/admin/AdminViews.test.tsx` "la dirección vieja #/historial abre «Hoy» con la búsqueda abierta y queda #/hoy sin agregar un paso" | decisión D-20261111-02 (la búsqueda que era «Historial» queda en «Hoy») |

---

## 5. Jerarquía

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| J-1 | Un solo `h1` por pantalla y ningún nivel de título salteado. | `test` `features/auth/AuthScreens.test.tsx` "%s: la marca va como texto en la barra de arriba, el título es el único h1 y no hay renglón en mayúsculas"; `app/ui.test.tsx` "el encabezado de página tiene el título como h1 y su bajada, sin línea de arriba, y una acción opcional"; `manual` M-8 (la lista de títulos del lector de pantalla) | `[norma]` WCAG 1.3.1 |
| J-2 | A lo sumo un botón lleno (`.button-primary`) por formulario, fila o encabezado; ninguno en una lista de registros, salvo el paso siguiente de «Primeros pasos»; ninguno en un filtro. | `test` `features/auth/AuthScreens.test.tsx` "solo el botón que sigue va relleno; mostrar la contraseña y cerrar sesión son enlaces"; `features/admin/AdminViews.test.tsx` "el par «Justificado» / «No justificado» es un grupo con nombre y ningún botón de la fila es el principal"; `features/admin/FirstSteps.test.tsx` "solo el próximo paso tiene el botón lleno; un paso listo lleva a su sección con un enlace y los demás con un botón secundario"; `manual` M-1 | `[norma]` de plataforma (GOV.UK, USWDS) |
| J-3 | En la pantalla del empleado, la marca siguiente es el control más grande y está en el primer pantallazo antes de marcar. | `test` `app/styles.test.tsx` "la próxima marca es un botón principal de 80 px y las marcas ya no tienen botones propios"; `features/employee/EmployeeApp.test.tsx` "muestra la próxima marca como un botón grande, desayuno antes que almuerzo y la salida última y aparte"; `manual` M-1 (320 × 640 y 390 × 844) | `[evidencia]` A para el tamaño; la posición es `[convención]` |
| J-4 | Los registros homogéneos (días, marcas, personas, locales, horarios, casos) son filas de una lista o de una tabla, separadas por una línea fina; no son tarjetas. | `test` `app/styles.test.tsx` "cada registro es una fila con una línea fina debajo, sin recuadro, esquinas, fondo ni sombra (principio 3)", "las filas van una debajo de la otra sin hueco: las separa su línea, no el espacio entre tarjetas", "un caso es una fila con su barra de estado a la izquierda y una línea fina debajo, sin recuadro ni sombra" | `[evidencia]` B |
| J-5 | Solo tienen recuadro: los controles y las etiquetas de estado, el bloque «ahora» del empleado, la confirmación de una marca, la marca de Fichaje Braja y el número de cada paso de «Primeros pasos». Una sección es plana. | `test` `app/styles.test.tsx` "el bloque de ahora tiene el borde de 2 px del verde de la marca y las esquinas de bloque, sin fondo ni sombra", "la confirmación es un bloque verde de 2 px con su tilde, y la ubicación que no llegó es una advertencia dentro de él", "una sección es plana: su título lleva una raya de tinta debajo y no hay recuadro, fondo ni sombra"; `manual` M-1 | `[convención]` |
| J-6 | No hay sombras (salvo el segundo píxel interno del borde de lo elegido y de un campo inválido), degradados ni fondos translúcidos. | `test` `app/styles.test.tsx` "las únicas sombras son el segundo píxel interno del borde de lo elegido y de un campo inválido", "ningún color fuera del bloque de tokens: no queda ninguno escrito a mano" (descarta `rgba()`); `script` `git grep -nE "gradient\(\|backdrop-filter" -- frontend/src/styles.css` sin salida | `[convención]` |
| J-7 | El verde oscuro de la marca es fondo de una zona solo en la barra de arriba y en la franja de la barra de estado del iPhone; como relleno de un control, solo en el botón principal. El lima va solo en la marca y en el anillo de foco sobre la barra de arriba, incluido «Ir al contenido», que aparece sobre ella. | `test` `app/styles.test.tsx` "el botón principal es el verde de la marca con su texto, sin sombra", "«Ir al contenido» queda fuera de la vista hasta tener el foco y entonces aparece sobre la barra de arriba sin mover nada (2.4.1)"; `script` `git grep -nE "background: *var\(--brand\)\|var\(--lime\)" -- frontend/src/styles.css` (al 2026-11-12: `body::before`, `.button-primary` y `.topbar` para el fondo; `.skip-link:focus-visible`, el foco de la barra de arriba y `.brand-mark` para el lima) | `[convención]` |
| J-8 | El resultado de una acción aparece dentro del formulario o de la fila que la originó; arriba de la página solo van las fallas de carga y los avisos de llegada. | `test` `features/auth/AuthScreens.test.tsx` "el error del ingreso es uno solo para el formulario, adentro y arriba del botón, sin señalar ningún campo"; `features/employee/EmployeeViews.test.tsx` "lo que responde el servidor va dentro del formulario, arriba del botón, sin marcar ningún campo"; `features/admin/AdminViews.test.tsx` "una decisión que falla muestra su mensaje dentro de su fila", "el resultado de la carga de días queda dentro del formulario, encima de su botón"; `features/admin/SitesViewRender.test.tsx` "shows a failed create and the created local inside the add form, right above its button" | `[norma]` WCAG 3.3.1; `[evidencia]` B |
| J-9 | Un formulario que se abre desde una fila se muestra debajo de esa fila y recibe el foco; al cerrarse, el foco vuelve al botón que lo abrió. | `test` `features/admin/AdminViews.test.tsx` "«Corregir» abre el formulario debajo de su marca con el foco en el primer campo, y «Cancelar» devuelve el foco al botón"; `features/employee/EmployeeApp.test.tsx` "Corregir motivo abre su formulario en el mismo renglón y lleva el foco adentro; Cancelar lo devuelve al botón"; `features/admin/SitesViewRender.test.tsx` "opening it takes the focus to its first control, «Elegir en el mapa»; «Cancelar» gives it back to «Cambiar ubicación»" | `[norma]` WCAG 2.4.3 |
| J-10 | El texto corrido no pasa de unos 65 caracteres por línea en pantallas anchas (`--measure`). | `script` `git grep -n "var(--measure)" -- frontend/src/styles.css` (al 2026-11-12, cinco reglas, entre ellas `.message-body` y `.empty-state`); `manual` M-1 a 1366 px | `[convención]` |

---

## 6. Lenguaje

El castellano de la interfaz es el de Argentina, natural y comprensible (S9 del encargo: «Español natural y comprensible para usuarios de Argentina.»).

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| L-1 | Una sola palabra por cosa, la misma para el empleado y el `ADMIN`: el glosario de abajo. Los nombres de caso con verbo se conjugan según quién los lee. | `test` `app/glossary.test.ts` "no text people read uses a retired word", "finds whole retired words only, in texts and not in API values"; `shared/labels.test.ts` "names the case %s «%s»" | decisión D-20261111-01 y D-20261111-03; `[norma]` WCAG 3.2.4; `[evidencia]` A para el lenguaje llano |
| L-2 | Los nombres de marcas, casos, estados y categorías salen de un único módulo, `shared/labels.ts`, con una tabla para el `ADMIN` (`forAdmin`) y otra para el empleado (`forEmployee`). | `test` `shared/labels.test.ts` "names nothing else", "names the mark %s «%s»", "names the category of a motive %s «%s»"; `manual` M-14 (ningún componente escribe a mano el nombre de un caso) | `[convención]` |
| L-3 | Voseo rioplatense y trato directo. Mayúscula solo al inicio de una frase y en nombres propios: ningún texto en mayúsculas, ni escrito ni por estilo. | `test` `app/styles.test.tsx` "los títulos usan la escala de los tokens, sin espaciado entre letras", "no queda el renglón chico arriba de los títulos", "una tabla es una planilla: títulos de 14 px en negrita sin mayúsculas, raya de borde debajo y celdas con línea fina"; `script` `git grep -n "text-transform" -- frontend/src/styles.css` sin salida; `manual` M-14 | `[convención]` |
| L-4 | Nunca se dice que una marca quedó registrada antes de la respuesta del servidor, ni se sugiere que se enviará después. Si no se sabe si llegó, se dice eso. | `test` `features/employee/EmployeeApp.test.tsx` "mientras la marca está en camino nada dice que quedó registrada: el lugar de la confirmación dice que se está enviando", "un conflicto que persiste tras el reintento dice que la marca no se registró", "una espera agotada dice que no sabemos si llegó, libera los botones y reintenta con la misma clave"; `manual` M-13 | exigencia del encargo (S8) y de la ausencia de cola offline; `[evidencia]` B |
| L-5 | Un mensaje de error dice qué pasó, si se guardó y qué hacer, en ese orden; sin códigos, sin la palabra «inválido» y sin culpar a la persona. | `test` `features/employee/EmployeeApp.test.tsx` "no deja texto técnico en la pantalla", "sin internet al cargar lo dice en palabras simples", "a 503 during a deploy says the system is updating, not the connection, and the retry keeps the Idempotency-Key"; `features/auth/AuthScreens.test.tsx` "dice en palabras simples que la clave nueva es corta y no la envía"; `manual` M-14 | `[norma]` WCAG 3.3.1 y 3.3.3 |
| L-8 | Un ejemplo va en la ayuda del campo, unida a él; el texto de muestra dentro del campo nunca es el único lugar de una instrucción. | `test` `features/employee/EmployeeApp.test.tsx` "el ejemplo es una ayuda unida al cuadro de texto, no un texto de relleno"; `features/admin/SitesViewRender.test.tsx` "groups the location as a field of the system, its help read before its buttons, and the name example as a hint"; `app/styles.test.tsx` "el texto de ejemplo de un campo se lee: placeholder con el color de texto secundario y sin transparencia (1.4.3)" | `[norma]` de plataforma; WCAG 1.4.3 aplica al texto de muestra |
| L-9 | El botón para salir de un formulario no usa la palabra de una acción de dominio: el formulario de «Cancelar el día» se cierra con «Volver», no con «Cancelar». | `test` `features/admin/AdminViews.test.tsx` "«Cancelar jornada» abre su formulario dentro del día con el foco en el motivo; su error queda en el formulario y «Volver» devuelve el foco", "«Anular» abre el formulario debajo de su marca con el foco en el motivo, y «Volver» devuelve el foco al botón"; `features/employee/EmployeeApp.test.tsx` "la pregunta toma el foco y «No, seguir trabajando» lo devuelve al botón de la salida" | `[convención]` |
| L-11 | El texto del aviso push lleva solo cantidades de casos, en total y por local, con el nombre del local; nunca nombres de personas ni motivos. | `test` `device/push/safeNotification.test.ts` "muestra conteo total y por sede usando solo campos validados", "descarta conteos o nombres de sede inconsistentes y vuelve al aviso genérico" | regla dura D-20261014-15; el título «Para revisar» es de D-20261111-01 |

L-6, L-7 y L-10 del esquema previo no son obligaciones vigentes: el código no las cumple o nada las comprueba. Están en la sección 11.

### Glosario (D-20261111-01 y D-20261111-03)

Solo cambian las palabras en pantalla. Los nombres internos, la API, la base y los términos de `docs/ESPECIFICACION.md` no cambian.

| Cosa | En pantalla | Retirado de la pantalla |
|---|---|---|
| jornada | «día de trabajo» (corto: «día») | «jornada» |
| bandeja de desvíos | «Para revisar» | «bandeja» |
| desvío, para el `ADMIN` | «caso» | «desvío» |
| desvío, para el empleado | ningún sustantivo: la sección es «Para explicar» | «desvío» |
| sede | «local» | «sede» |
| ingreso, egreso | «Entrada», «Salida» | «ingreso», «egreso» |
| tipos de caso, para el `ADMIN` | «No marcó la entrada», «Llegada tarde», «Salió antes», «Salió después de hora», «No marcó la salida», «Desayuno largo», «Almuerzo largo», «Fuera del local» | «Faltó la entrada», «Egreso temprano», «Salida tarde», «Exceso de desayuno»… |
| tipos de caso, para el empleado (D-20261111-03) | «No marcaste la entrada», «Saliste antes», «Saliste después de hora», «No marcaste la salida»; los que no llevan verbo son iguales | |
| falta motivo, para el `ADMIN` | «Todavía no explicó» | «Falta motivo» |
| push, alertas, notificaciones | «avisos» | «alertas», «push», «notificaciones» |
| clave | «contraseña» | «clave» |
| se conservan | «Justificado», «No justificado», «marca», «tolerancia», «tramo» | |

Los destinos de D-20261111-02 suman: «Hoy», «Días de trabajo», «Configuración», «Locales», «Horarios», «Equipo», «Avisos en este dispositivo» y «Primeros pasos».

El test del glosario tiene una sola excepción, con su motivo escrito en `app/glossary.test.ts`: el estado de un día sin entrada todavía se llama «Sin ingreso» (`shared/labels.ts`), porque la decisión no nombra los estados de un día. Las palabras que siguen abiertas están en la sección 11.

---

## 7. Accesibilidad

El objetivo es WCAG 2.2 nivel AA (S9: «Contrastes conforme a WCAG 2.2 AA.»). Ninguna herramienta automática de accesibilidad corre en el repositorio (sección 11): lo que no cubre un test se comprueba con un paso manual.

### 7.1 Áreas de toque: tres cifras distintas, que no se mezclan

El encargo pide «procurar áreas de interacción de aproximadamente 44 × 44 píxeles cuando el diseño lo permita». WCAG 2.2 AA exige 24 px. El producto usa 44 como mínimo de trabajo y 48 donde hay barra de abajo.

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| A-1 | **24 px**: ningún control mide menos de 24 × 24 px CSS. Una casilla o un botón de opción mide 24 px y toda su etiqueta es el área de toque. | `test` `app/styles.test.tsx` "una casilla o un botón de opción mide el piso de 24 px y su etiqueta entera es el área de toque (2.5.8)"; `manual` M-3 | `[norma]` WCAG 2.5.8 |
| A-2 | **44 px**: todo control mide al menos 44 px de alto, y un botón de enlace también de ancho. Por debajo de 1024 px, donde está la barra de abajo, el mínimo es 48 px (`--target` vale `3rem`, y `2.75rem` desde 1024 px). | `test` `app/styles.test.tsx` "todo botón mide al menos el alto de toque del sistema y el botón de enlace también el ancho (2.5.8)", "un campo de una línea mide el alto de toque del sistema y un área de texto arranca con lugar para varias líneas", "cada destino de la barra mide el alto de la barra y cada renglón de la columna el alto de toque (2.5.8)", "un plegable es un control: tiene borde, el alto de toque y una flecha dibujada sin caracteres"; `manual` M-3 | `[convención]` (44 es el valor AAA de WCAG 2.5.5 y el de Apple) |
| A-3 | **80 px**: el botón de la marca siguiente; 56 px, las otras marcas del empleado. | `test` `app/styles.test.tsx` "la próxima marca es un botón principal de 80 px y las marcas ya no tienen botones propios", "las otras marcas miden 56 px y la salida va aparte, después de una línea fina" | `[evidencia]` A, extrapolada de un estudio con personas de 65 a 95 años |

### 7.2 Resto de las obligaciones

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| A-4 | Todo par de texto y fondo cumple 4,5:1 (3:1 desde 24 px, o 18,5 px en negrita). | `test` `app/styles.test.tsx` "cada par de texto, borde, estado y foco de los tokens cumple el contraste AA (1.4.3 y 1.4.11)"; `manual` M-2 para lo que pinta el navegador | `[norma]` WCAG 1.4.3 |
| A-5 | Todo borde de control, indicador de estado, ícono con significado y anillo de foco cumple 3:1 con lo que lo rodea. | `test` `app/styles.test.tsx` "cada par de texto, borde, estado y foco de los tokens cumple el contraste AA (1.4.3 y 1.4.11)", "los bordes de los campos contrastan al menos 3:1 con el blanco (1.4.11)"; `manual` M-2 | `[norma]` WCAG 1.4.11 |
| A-6 | Ningún color fuera del bloque de tokens (los colores del sistema dentro de `forced-colors` no cuentan). | `test` `app/styles.test.tsx` "ningún color fuera del bloque de tokens: no queda ninguno escrito a mano" | `[convención]` (S9: «Tokens centralizados.») |
| A-7 | Ningún estado se distingue solo por el color: lleva palabra o forma. | `test` `app/ui.test.tsx` "una etiqueta de estado dice el estado con un ícono y una palabra, y no es un botón"; `app/styles.test.tsx` "un botón elegido (aria-pressed) se distingue por su borde de 2 px del verde de la marca, no solo por el fondo (1.4.1)", "un campo inválido se reconoce por su barra, su borde de 2 px y su texto, no solo por el rojo (1.4.1)", "un enlace se reconoce sin depender del color: va subrayado y con el verde de la marca (1.4.1)"; `manual` M-6 | `[norma]` WCAG 1.4.1 |
| A-8 | El foco es visible en todo control con el teclado: un anillo de 3 px separado 2 px, también en el botón de calendario de un campo de fecha u hora. Lo que recibe el foco por código (un título, un resultado) no muestra el anillo después de un toque o un clic, y sí con el teclado. | `test` `app/styles.test.tsx` "el foco se ve igual en todo control: un anillo de 3 px separado 2 px, con el color del token (2.4.7)", "ninguna regla quita el contorno sin su regla :focus-visible que lo devuelve (2.4.7)", "un campo de fecha u hora lleva el anillo común también cuando el foco está en su botón de calendario (2.4.7)", "lo que toma el foco por código no muestra el anillo después de un toque o un clic"; `manual` M-4 | `[norma]` WCAG 2.4.7 |
| A-9 | Todo lo interactivo es un control nativo (`button`, `a`, `input`, `select`, `textarea`, `summary`). | `script` `git grep -nE "<(div\|span\|li\|tr\|td\|p\|section\|article)\b[^>]*onClick" -- "frontend/src/*.tsx" ":!*.test.tsx"` sin salida (no ve un elemento escrito en varias líneas); `manual` M-4 | `[norma]` WCAG 2.1.1 y 4.1.2 |
| A-10 | Todo control tiene nombre accesible, y el nombre contiene el texto visible. | `test` `features/admin/AccessibilityBase.test.tsx` "la columna de botones de la tabla de empleados tiene nombre", "la elección de empresa nombra cada botón solo con la empresa y su rol"; `features/admin/AdminViews.test.tsx` "da contexto accesible al botón Corregir de cada marca"; `features/auth/AuthScreens.test.tsx` "mostrar la contraseña suma un tilde al botón sin cambiarle el nombre"; `manual` M-8, M-9 y M-10 | `[norma]` WCAG 4.1.2 y 2.5.3 |
| A-11 | Todo campo tiene etiqueta visible; la ayuda va antes del control y la ayuda y el error están asociados al campo. Un grupo de opciones es un `fieldset` con su leyenda. | `test` `app/ui.test.tsx` "asocia la ayuda de un campo con su control", "muestra el error debajo del campo y lo asocia al control", "ordena el campo como etiqueta, ayuda, control y error: la ayuda se lee antes de escribir", "un grupo de controles es un campo: leyenda, ayuda, controles y error, que lo marca inválido" | `[norma]` WCAG 1.3.1 y 3.3.2 |
| A-12 | Los errores son `alert`; los demás mensajes y las esperas usan una región `status` que existe antes que su texto, para que el lector de pantalla la anuncie. | `test` `app/ui.test.tsx` "expone mensajes y carga como feedback accesible", "monta la región de un aviso vacía y recién después escribe el texto, para que se anuncie", "la carga también monta su región vacía y recién después escribe el texto"; `device/pwa/ServiceWorkerUpdate.test.tsx` "la región del aviso ya está en la página, vacía, antes de que llegue una versión nueva, para que se anuncie" | `[norma]` WCAG 4.1.3 |
| A-13 | Ningún mensaje desaparece por tiempo. | `script` `git grep -n "setTimeout(" -- frontend/src ":!*.test.*"`: al 2026-11-12 solo aparecen los plazos de `features/employee/markFlow.ts` (la marca y su ubicación) y de `features/admin/siteLocation.ts` (la ubicación de un local); ninguno oculta un mensaje | `[norma]` WCAG 2.2.1 |
| A-14 | El documento declara `lang="es-AR"`; el zoom no se bloquea; la orientación no se fija. | `script` `git grep -n 'lang="es-AR"' -- frontend/index.html` da una línea; `git grep -nE "user-scalable\|maximum-scale" -- frontend/index.html` y `git grep -n "orientation" -- frontend/vite.config.ts` sin salida | `[norma]` WCAG 3.1.1, 1.4.4 y 1.3.4 |
| A-15 | Los tamaños de texto y las áreas de toque están en `rem`; los campos usan 16 px. | `test` `app/styles.test.tsx` "los tamaños de letra salen de los tokens: no queda ningún font-size sin token", "la etiqueta y la ayuda de un campo miden 16 px y salen de los tokens; un grupo de campos no tiene recuadro" (los tokens de tamaño están en `rem`) | `[norma]` WCAG 1.4.4 |
| A-16 | El texto de trabajo mide 16 px; 14 px (`--font-size-meta`) solo en etiquetas de estado, nombres de la barra de abajo, encabezados de columna y marcas de tiempo. | `test` `app/styles.test.tsx` "una etiqueta de estado tiene borde y esquinas de 4 px, letra de 14 px en negrita y nunca parece un botón", "una tabla es una planilla: títulos de 14 px en negrita sin mayúsculas, raya de borde debajo y celdas con línea fina"; `script` `git grep -n "var(--font-size-meta)" -- frontend/src/styles.css` y comparar cada regla con esos cuatro usos. Excepción conocida: `.small-copy` usa 14 px fuera de esos usos (sección 11) | `[norma]` de plataforma (USWDS, GOV.UK); WCAG no fija un mínimo |
| A-17 | Con `prefers-reduced-motion` no hay animación, transición ni desplazamiento suave; toda espera tiene texto. | `test` `features/admin/AdminViews.test.tsx` "evita el desplazamiento suave cuando el sistema reduce el movimiento"; `app/revealAndFocus.test.ts` "salta sin deslizar cuando el sistema pide menos movimiento, y respeta dónde ubicar la parte"; `app/ui.test.tsx` "la carga también monta su región vacía y recién después escribe el texto"; `script` `git grep -n "prefers-reduced-motion" -- frontend/src/styles.css` da el bloque | `[convención]` (buena práctica; el criterio 2.3.3 es AAA) |
| A-18 | Con colores forzados (temas de contraste de Windows) siguen visibles el foco, lo elegido, lo apretado, el lugar actual y el borde de un campo deshabilitado. | `test` `app/styles.test.tsx` "con colores forzados lo elegido, lo apretado y el lugar actual se siguen viendo con los colores del sistema (1.4.11)", "con colores forzados un campo deshabilitado tiene el borde del color del sistema para lo deshabilitado"; `manual` M-6 | `[norma]` WCAG 1.4.11 |
| A-19 | El mapa de un local se puede usar sin arrastrar y sin puntero: búsqueda de dirección y coordenadas escritas; la captura con el dispositivo sigue disponible. | `test` `features/admin/SitesViewRender.test.tsx` "offers the map first and leaves the device capture and manual coordinates in place", "searches the address once per click, and the chosen result centers the map and sets the point to save", "creates a site from manually entered coordinates after map review"; `manual` M-11 | `[norma]` WCAG 2.5.7 y 2.1.1; el mapa es de D-20261109-01 |
| A-20 | El ingreso admite el gestor de contraseñas y pegar, también después de un envío fallido; hay un botón para mostrar la contraseña. | `test` `features/auth/AuthScreens.test.tsx` "los campos conservan su etiqueta y su autocompletado, y la contraseña se puede pegar (3.3.8)", "después de un envío fallido las contraseñas se siguen pudiendo pegar (3.3.8)", "mostrar la contraseña suma un tilde al botón sin cambiarle el nombre" | `[norma]` WCAG 3.3.8 y 1.3.5 |
| A-21 | Las listas son listas, las tablas tienen encabezados y nombre, y cada grupo de opciones tiene nombre. | `test` `features/admin/AdminViews.test.tsx` "la tabla de los días y la de las marcas se nombran por el título de su sección"; `features/employee/EmployeeViews.test.tsx` "es una tabla con título y una fila con encabezado por cada momento del día"; `features/employee/EmployeeApp.test.tsx` "los tipos de motivo son un grupo de opciones con nombre, una opción grande por tipo"; `features/admin/FirstSteps.test.tsx` "los pasos son una lista ordenada de registros, cada uno con su número, que no se lee porque el título ya lo dice" | `[norma]` WCAG 1.3.1 |
| A-22 | Lo primero que alcanza Tab en cada pantalla es «Ir al contenido», que lleva al único `main` sin cambiar la dirección. Excepción: mientras se muestra el aviso de versión nueva, su botón «Actualizar» va antes, porque el aviso está arriba de todo en la página. | `test` `features/admin/AdminNav.test.tsx` "lo primero que alcanza Tab es «Ir al contenido», que lleva al único main sin cambiar la sección de la dirección"; `features/employee/EmployeeApp.test.tsx` "lo primero que alcanza Tab es «Ir al contenido», que lleva al único main de la pantalla"; `features/auth/AuthScreens.test.tsx` "lo primero que alcanza Tab es «Ir al contenido», que lleva al único main"; `app/ui.test.tsx` "lleva el foco al main de la pantalla sin cambiar la dirección, que en el ADMIN es la sección"; `manual` M-4 (con una versión nueva pendiente) | `[convención]` (WCAG 2.4.1 ya se cumple con los puntos de referencia) |

---

## 8. Componentes

Los componentes compartidos viven en `frontend/src/app/ui.tsx` (`PageMessage`, `Status`, `LoadFailure`, `Loading`, `Empty`, `StatusTag`, `FormField`, `Fieldset`, `FieldsSummary`, `Panel`, `PageHeading`, `TableScroll`, `SkipLink`, `AppHeader`, `Brand`, `CompanySwitcher`), los íconos en `app/icons.tsx`, la validación en `app/useFieldErrors.ts` y el foco en `app/revealAndFocus.ts`. Antes de crear uno nuevo se reutiliza uno de estos (S10 del encargo: no crear un segundo sistema de componentes).

### 8.1 Los estados que todo componente define

S9 pide los estados `loading`, `disabled`, `error`, `success` y vacío. En este producto se resuelven así:

| Estado | Pieza | Obligación |
|---|---|---|
| Cargando | `Loading` (región `status` y texto) o `Status` para una espera dentro de un formulario | A-12, A-17 |
| Deshabilitado | el atributo `disabled`, que no baja la opacidad, con el motivo en texto visible | C-5 |
| Error | `LoadFailure` (una carga que falló, con «Reintentar»), `PageMessage` de tipo error (lo que respondió el servidor) y el error de un campo en `FormField` o `Fieldset` | C-6, C-7, C-19 |
| Listo | `PageMessage` de tipo listo, dentro de lo que causó la acción; la confirmación de una marca (`.receipt`) | C-7, C-8 |
| Vacío | `Empty` (`.empty-state`): texto, sin recuadro, distinto del error | C-6 |

### 8.2 Obligaciones

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| C-1 | Los valores de color, tamaño de letra, familia y variables salen de los tokens de `:root`. | `test` `app/styles.test.tsx` "ningún color fuera del bloque de tokens: no queda ninguno escrito a mano", "los tamaños de letra salen de los tokens: no queda ningún font-size sin token", "hay una sola familia de letra: toda font-family sale de un token", "no queda ningún token viejo y toda variable que se usa está declarada" | `[convención]` (S9: «Tokens centralizados.») |
| C-2 | Tres radios (4, 8 y 12 px) más el círculo del indicador de carga y del ícono de la confirmación; dos anchos de borde (1 y 2 px) más las dos barras de estado y el borde del indicador de carga; tres pesos (400, 600 y 700); cinco tamaños de texto. | `script` `git grep -ohE "border-radius: *[^;}]+" -- frontend/src/styles.css \| sort -u` da solo `var(--radius-tag)`, `var(--radius)`, `var(--radius-block)` y `50%`; `git grep -ohE "font-weight: *[^;}]+" -- frontend/src/styles.css \| sort -u` da solo los tres tokens de peso | `[convención]` |
| C-3 | Ningún estado depende de distinguir el peso 600 del 700 (en un Android con Roboto sin cara 600, se dibuja como 700). | `manual` M-5 | `[convención]` |
| C-4 | Un botón es `.button` con una de estas variantes y ninguna otra: principal (`.button-primary`), secundario (`.button-secondary`), enlace (`.button-link`), destructivo (`.button-danger`); tamaños grande (`.button-large`), de marca (`.button-clock`) y de ancho completo (`.button-block`). `.button-pair` y `.button-row` los agrupan. | `test` `app/styles.test.tsx` "las variantes del sistema existen y los nombres viejos de botón se fueron", "toda clase que escribe el marcado tiene su regla en la hoja" | `[convención]` |
| C-5 | Un botón deshabilitado se lee (sin opacidad) y dice por qué con texto visible. Un botón de envío solo se deshabilita mientras envía: si falta un dato, se aprieta y el formulario explica qué falta. | `test` `app/styles.test.tsx` "un botón deshabilitado se sigue leyendo: ninguna regla de botón usa opacidad y su texto, fondo y borde salen de los tokens"; `features/admin/AccessibilityBase.test.tsx` "crear un empleado sin local se puede intentar, y restablecer la contraseña de alguien inactivo explica por qué no"; `features/employee/EmployeeViews.test.tsx` "el botón de enviar solo se apaga mientras se envía"; `features/admin/AdminViews.test.tsx` "sin la zona horaria del local, «Agregar marca» dice por qué no se puede usar", "corregir y anular sin motivo lo explican debajo del motivo, con los botones habilitados" | `[norma]` de plataforma (GOV.UK, USWDS) |
| C-6 | Todo componente con datos define cargando, vacío, error con «Reintentar» y con contenido, con textos distintos: una carga fallida nunca se muestra como una lista vacía. | `test` `features/admin/AdminViews.test.tsx` "distingue un fallo de carga de la lista vacía de sedes y permite reintentar", "muestra el estado vacío de sedes solo cuando la consulta termina correctamente sin filas", "distingue un fallo de carga de la bandeja vacía y permite reintentar"; `features/admin/JornadaAudit.test.tsx` "distingue un fallo de carga del historial vacío y permite reintentar"; `features/employee/EmployeeApp.test.tsx` "no presenta una consulta fallida como un día sin turno y permite reintentar"; `app/ui.test.tsx` "una carga fallida es un error con un botón para reintentar" | `[evidencia]` B; S9 |
| C-7 | Un mensaje tiene uno de cuatro tipos (información, listo, atención, error), con barra, ícono y fondo propios; el texto va siempre en el color de texto y el tipo lo dicen las palabras y la barra. | `test` `app/ui.test.tsx` "cada tipo de mensaje tiene su rol y su ícono, oculto para los lectores: el tipo lo dicen las palabras y la barra"; `app/styles.test.tsx` "un mensaje es una barra a la izquierda sobre su fondo, con el texto en el color de siempre y sin sombra (1.4.1)", "cada tipo de mensaje tiene su barra, su fondo y el ícono del color de su barra" | `[norma]` WCAG 1.4.1 |
| C-8 | La confirmación de una marca solo existe después de la respuesta del servidor, dice qué se marcó y a qué hora (la del servidor), toma el foco y no usa el estilo de ningún otro mensaje. Si la ubicación no llegó, es una advertencia dentro de ella. | `test` `features/employee/EmployeeApp.test.tsx` "dice qué se marcó y a qué hora, con el foco en el aviso", "la ubicación que no llegó es una advertencia dentro de la confirmación, no una línea de éxito"; `app/styles.test.tsx` "la confirmación es un bloque verde de 2 px con su tilde, y la ubicación que no llegó es una advertencia dentro de él" | decisión D-20261015-03 (la hora la pone el servidor); `[evidencia]` B; S8 |
| C-9 | Una etiqueta de estado (`StatusTag`) no parece un botón: sin cursor de mano ni efecto al pasar, esquinas de 4 px, ícono y palabra. | `test` `app/styles.test.tsx` "una etiqueta de estado tiene borde y esquinas de 4 px, letra de 14 px en negrita y nunca parece un botón"; `app/ui.test.tsx` "una etiqueta de estado dice el estado con un ícono y una palabra, y no es un botón" | `[evidencia]` B |
| C-10 | El color de una etiqueta o de una barra de estado dice de quién es el turno, con cinco tonos: ámbar si espera a quien mira, gris punteado si espera a otra persona, verde y rojo para lo decidido, neutro para el estado de un día. Los tonos son clases, no valores de la API. | `test` `app/ui.test.tsx` "las cinco tonalidades de una etiqueta son clases, no valores de la API"; `app/styles.test.tsx` "la barra dice de quién es el turno: punteada mientras la persona no explicó, ámbar a revisar, verde o roja ya decidido", "las clases viejas de estado toman las cinco tonalidades por reglas compartidas: ámbar te espera a vos, gris punteado espera a otro" | `[convención]` |
| C-11 | Las dos decisiones de un caso («Justificado» y «No justificado») son un grupo con nombre, de botones iguales, separados por 12 px (`--space-3`), y se apilan cuando no entran lado a lado. | `test` `app/styles.test.tsx` "el par se apila en una fila angosta, va lado a lado con lugar y en una pantalla ancha las decisiones van a la derecha del caso"; `features/admin/AdminViews.test.tsx` "el par «Justificado» / «No justificado» es un grupo con nombre y ningún botón de la fila es el principal" | `[convención]` (la distancia entre acciones opuestas es `[evidencia]` B) |
| C-12 | El día del empleado se muestra en cuatro filas fijas (Entrada, Desayuno, Almuerzo, Salida). Una marca anulada no ocupa una fila y se lista tachada debajo. Una marca que cargó el encargado muestra la hora declarada y la nota «Cargada por tu encargado». | `test` `features/employee/employeeDay.test.ts` "siempre devuelve las cuatro filas en el mismo orden, también sin marcas", "una marca anulada nunca llena su fila y queda listada aparte, debajo de su fila", "una marca que cargó tu encargado muestra la hora declarada y la nota «Cargada por tu encargado»"; `features/employee/EmployeeViews.test.tsx` "una marca anulada no llena su fila: va tachada debajo, con la etiqueta Anulada" | `[convención]`; la marca anulada que no cuenta es de D-20261027-08 |
| C-13 | Los íconos son los SVG en línea de `app/icons.tsx`, siempre con texto visible al lado y ocultos para los lectores de pantalla; ninguna pantalla usa caracteres Unicode como ícono. | `test` `app/icons.test.tsx` "el conjunto es el del sistema de diseño: ni uno más ni uno menos", "«%s» es un svg de adorno: oculto para lectores de pantalla y fuera del orden de foco"; `app/styles.test.tsx` "ninguna pantalla dibuja los glifos del hallazgo F-22: el sistema tiene sus íconos" | `[evidencia]` B |
| C-14 | No hay diálogos modales, avisos emergentes que se van solos ni ayudas que dependan de pasar el puntero (atributo `title`). Toda confirmación es un formulario en el flujo. | `script` `git grep -nE 'role="dialog"\|aria-modal\|<[a-z][a-z0-9]*\s[^>]*\btitle=' -- "frontend/src/*.tsx" ":!*.test.tsx"` sin salida (el `title` de `Panel` y `PageHeading` es una prop, no el atributo); A-13 para los avisos que se van | `[convención]` |
| C-15 | La confirmación se pide solo para lo serio y difícil de deshacer (anular una marca, cancelar un día, restablecer una contraseña, marcar la salida antes del fin del horario), nombra la consecuencia y sus botones nombran la acción. | `test` `features/admin/AdminViews.test.tsx` "anula una marca solo con motivo y confirmación", "cancela una jornada sin marcas solo con motivo y confirmación", "pide confirmación, muestra la provisoria una sola vez y la borra al cerrar el aviso"; `features/admin/EmployeesView.test.tsx` "«Restablecer contraseña» takes the focus to what the reset does, never to the button that confirms it; «Cancelar» gives it back"; `features/employee/EmployeeApp.test.tsx` "antes del fin del horario pregunta si termina el día y recién al confirmar marca" | decisión D-20261027-07, D-20261027-08 y D-20261027-09 para esas acciones; `[evidencia]` B; `[norma]` WCAG 3.3.4 |
| C-16 | No queda ninguna clase usada sin regla en la hoja ni regla sin uso en el marcado. | `test` `app/styles.test.tsx` "toda clase que escribe el marcado tiene su regla en la hoja", "toda clase que nombra la hoja la escribe el marcado" | `[convención]` |
| C-17 | Sin dependencias nuevas para estilos, íconos o tipografías. | `script` `git diff origin/main -- frontend/package.json` sin cambios en `dependencies`; regla de `CLAUDE.md` §1 | regla del repositorio |
| C-18 | Una tabla que puede no entrar va dentro de `TableScroll`: mientras no entra, su caja es una región con el nombre de su título que toma el foco, para desplazarla con el teclado. | `test` `app/ui.test.tsx` "ninguna pantalla escribe la caja a mano: toda tabla que se desplaza pasa por TableScroll", "mientras la tabla no entra, su caja es una región con el nombre del título que toma el foco", "si la tabla entra, la caja no es una región ni una parada de Tab" | `[norma]` WCAG 2.1.1 |
| C-19 | Un formulario se valida al enviar, con una sola forma en toda la aplicación (`app/useFieldErrors.ts`): sin la burbuja del navegador (`noValidate`), un mensaje debajo de cada campo con problemas, el foco en el primero, y un resumen arriba solo cuando fallan dos o más campos. | `test` `features/auth/AuthScreens.test.tsx` "el ingreso vacío marca cada campo con su mensaje, sin la burbuja del navegador, y lleva el foco al DNI"; `features/admin/AdminViews.test.tsx` "agregar una marca sin hora ni motivo explica cada campo, con el foco en la hora, y no se envía"; `features/admin/SitesViewRender.test.tsx` "an add form without a name or with a wrong radius explains each field, sums it up and focuses the name"; `app/ui.test.tsx` "el resumen de un formulario largo aparece solo con dos o más campos mal, como alerta" | `[norma]` WCAG 3.3.1 y 3.3.3; validar al enviar y no mientras se escribe es `[convención]` |

---

## 9. Responsive

S9: «Priorizar el uso móvil en flujos de fichaje.»

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| R-1 | A 320 px de ancho ninguna pantalla se desplaza de costado, salvo una tabla dentro de su propia caja (C-18) y el mapa. | `manual` M-1 | `[norma]` WCAG 1.4.10 |
| R-2 | Cuatro puntos de corte de ancho y ninguno más: hasta 359 px, desde 600 px, desde 768 px y desde 1024 px; además, el bloque de pantalla baja (hasta 480 px de alto). | `test` `app/styles.test.tsx` "la hoja usa solo los puntos de corte del sistema: min-width de 600, 768 y 1024 px, y max-width solo de 359 px" | `[convención]` |
| R-3 | La hoja de estilos se escribe del celular hacia arriba: la regla base es la del teléfono y lo ancho va en bloques `min-width`. | `test` `app/styles.test.tsx` "lo que cambiaba en las pantallas angostas es la regla de base y lo ancho va a un bloque del sistema" | `[convención]` |
| R-4 | Los registros son lista hasta 767 px y tabla desde 768 px, con los mismos datos y el mismo orden; el cambio lo decide un único gancho (`app/useBreakpoint.ts`). | `test` `app/useBreakpoint.test.ts` "muestra la tabla desde 768 px y la lista por debajo", "pregunta por 768 px de ancho, el corte del sistema de diseño"; `features/admin/AdminViews.test.tsx` "el estado de cada día es una etiqueta con su ícono, en la tabla y en la lista del teléfono", "una marca anulada lleva la etiqueta «Anulada» en la tabla y en la lista del teléfono" | `[norma]` de plataforma (USWDS); `[evidencia]` B |
| R-5 | Una tabla nunca queda con columnas cortadas a 768 px ni a 1024 px. | `manual` M-1 (768 y 1024 px, «Equipo» y «Hoy») | `[norma]` WCAG 1.4.10 |
| R-6 | Barra de navegación abajo hasta 1023 px; columna izquierda desde 1024 px. | `test` `app/styles.test.tsx` "la navegación del ADMIN es una barra fija abajo hasta 1024 px, una columna a la izquierda desde ahí y entra entera en 320 px" | decisión D-20261111-02 (pestañas abajo en el celular, columna izquierda en la computadora) |
| R-7 | En una pantalla baja (hasta 480 px de alto) nada queda fijo. | `test` `app/styles.test.tsx` "la navegación del ADMIN es una barra fija abajo hasta 1024 px, una columna a la izquierda desde ahí y entra entera en 320 px" (comprueba el bloque `max-height: 480px`); `manual` M-1 (640 × 360) | `[norma]` WCAG 1.4.10 |
| R-8 | La pantalla del empleado se diseña primero para el celular: una columna, en este orden: el estado del día y la marca siguiente, lo que hay para explicar si hay algo, las marcas de hoy y al final «Ver otros días»; lo principal en 18 px o más. | `test` `app/styles.test.tsx` "las marcas del empleado van en una sola columna y los botones de un registro bajan solos cuando no entran", "el estado del día es el texto más grande de la pantalla y el saludo queda chico"; `features/employee/EmployeeApp.test.tsx` "ordena el estado del día, el panel de marcar, las marcas de hoy y al final Ver otros días", "con algo pendiente va arriba de Tus marcas de hoy, justo después del bloque de marcar"; `manual` M-1 | `[convención]` (S9) |
| R-9 | Con zoom del 200 % y del 400 % y con el texto del sistema al máximo no se pierde contenido ni función. | `manual` M-5 | `[norma]` WCAG 1.4.4, 1.4.10 y 1.4.12 |
| R-10 | Un nombre largo (empresa, persona, motivo) se parte en varias líneas; no se corta con puntos suspensivos. | `script` `git grep -n "text-overflow" -- frontend/src/styles.css` sin salida; `manual` M-1 con datos largos | `[norma]` WCAG 1.4.10 |
| R-11 | Las áreas seguras del teléfono (`env(safe-area-inset-*)`) se respetan arriba y abajo. | `test` `app/styles.test.tsx` "nada queda fijo en la pantalla salvo la barra de navegación y la franja de la barra de estado del iPhone", "deja lugar para que la barra de navegación no tape el contenido ni el foco (2.4.11)"; `manual` M-12 | `[convención]` |

---

## 10. Verificación manual antes de cada release

Estos pasos cubren lo que ningún test puede ver: lo que pinta el navegador, los dispositivos reales y las tecnologías de apoyo. Cada paso deja una evidencia en el PR de release: una captura o una frase con lo observado, el navegador, el dispositivo y la fecha. Un paso no hecho se anota como no hecho; no se da por bueno.

`CLAUDE.md` regla 38 ya exige probar la PWA en un iPhone con Safari y en un Android con Chrome antes de cada release (instalación, sesión, marca con ubicación y, en el dispositivo del `ADMIN`, recepción de avisos). Los pasos M-7, M-8, M-9 y M-12 son esa prueba.

1. **M-1. Anchos.** Abrir cada pantalla (ingreso, elegir empresa, cambio de contraseña, empleado, y cada sección del `ADMIN`) a 320, 390, 768, 1024 y 1366 px de ancho, y a 640 × 360. Con un dato de prueba largo (nombre de empresa, de persona y un motivo de varias líneas). Mirar: sin desplazamiento de costado, sin texto cortado ni superpuesto, sin columnas cortadas, la marca siguiente en el primer pantallazo a 320 × 640 y a 390 × 844, el empleado sin menú, a lo sumo un botón lleno por región.
2. **M-2. Contraste de lo que pinta el navegador.** Con las herramientas del navegador, medir el texto de muestra, el selector de fecha y de hora, la casilla sin marcar, la flecha de la lista desplegable y el autocompletado. En Chrome, Safari de iPhone y Firefox. Mirar: 4,5:1 el texto, 3:1 los bordes.
3. **M-3. Tamaño de los controles.** Medir con las herramientas del navegador el recuadro de cada tipo de control (botón, botón de enlace, campo, casilla con su etiqueta, opción, plegable, destino del menú, controles del mapa). Mirar: ninguno bajo 44 px por lado (48 px por debajo de 1024 px de ancho); ninguno bajo 24 px.
4. **M-4. Teclado.** Recorrer cada flujo solo con teclado (Tab, Mayús+Tab, Enter, Espacio, flechas, Escape), de la entrada al resultado, a 320 y a 1366 px. Repetir el comienzo con una versión nueva pendiente (el aviso «Actualizar» arriba). Mirar: el foco siempre visible, nunca tapado por la barra de abajo, en el orden de lectura; lo primero es «Ir al contenido», o «Actualizar» si está el aviso; un formulario que se cierra devuelve el foco a su botón.
5. **M-5. Zoom y texto grande.** Zoom del navegador al 200 % y al 400 %; tamaño de texto de Android al máximo; un Android con Roboto. Mirar: sin pérdida de contenido ni función, ningún rótulo cortado, ningún estado que dependa de la diferencia entre negrita y seminegrita.
6. **M-6. Colores forzados.** Activar un tema de contraste real de Windows (Configuración, Accesibilidad, Temas de contraste) en Edge o Chrome. Mirar: foco, opción elegida, botón apretado, lugar actual del menú y campo deshabilitado visibles.
7. **M-7. Android instalado.** Instalar la aplicación en un Android con Chrome. Como `ADMIN`: entrar a una parte de «Configuración», recargar, tocar Atrás dos veces; activar los avisos y recibir uno. Como empleado: ingresar y marcar con ubicación. Mirar: se conserva el lugar al recargar, Atrás vuelve por las secciones antes de salir, la marca se confirma con la hora del servidor, el aviso llega.
8. **M-8. TalkBack.** Con TalkBack y Chrome en un Android real: ingresar, marcar, explicar un caso, decidir un caso, cargar días y ubicar un local con el mapa. Mirar: cada resultado se anuncia una sola vez, los nombres que se oyen coinciden con lo que se ve, la lista de títulos tiene un solo nivel 1 y ningún salto.
9. **M-9. VoiceOver.** Lo mismo que M-8 con VoiceOver y Safari en un iPhone real, con la aplicación instalada; en el iPhone del `ADMIN`, activar los avisos y recibir uno. Si los avisos fallan de forma sostenida en iPhone, se aplica el plan B de D-20261014-13; no antes.
10. **M-10. NVDA.** Lo mismo que M-8 con NVDA y Chrome o Firefox en Windows, para las pantallas del `ADMIN`. Mirar además: las tablas se leen con sus encabezados.
11. **M-11. Mapa sin arrastrar.** Ubicar un local solo con la búsqueda de dirección; solo con coordenadas escritas; y en un teléfono real, con un dedo y sin arrastrar. Mirar: se puede en los tres casos y se confirma el punto antes de guardar.
12. **M-12. iPhone instalado.** Abrir la aplicación instalada en un iPhone con muesca. Mirar: barra de estado legible, nada bajo la muesca ni bajo el indicador de inicio, la barra de abajo entera.
13. **M-13. Red limitada y sin red.** Con la red limitada y sin red: marcar, enviar un motivo, guardar un formulario del `ADMIN`. Mirar: cada mensaje dice qué pasó, si se guardó y qué hacer; lo escrito se conserva; nada dice que una marca quedó registrada sin respuesta del servidor.
14. **M-14. Lectura de textos.** Leer los textos nuevos o cambiados del release. Mirar: voseo y trato directo, ninguna palabra retirada del glosario, ningún nombre de caso escrito fuera de `shared/labels.ts`, mensajes de error en tres partes y sin códigos, y las ayudas que se repiten («avisale a tu encargado») en el mismo lugar relativo de cada pantalla.

**Hecho hasta ahora.** La tanda G2 (2026-11-12, registro L36) hizo M-1, M-4, M-5 (zoom del 200 % y del 400 %) y M-6 sobre la aplicación construida, con los colores forzados emulados en Chrome y no con un tema real de Windows. No se hicieron todavía M-2, M-3, M-6 con un tema real, M-7 a M-12 ni M-14 en un dispositivo real.

---

## 11. Qué queda fuera y qué es propuesta pendiente

Nada de esta sección es una obligación vigente. Lo que necesita al dueño se lista para que decida; mientras no lo haga, no se cita como decisión suya.

### 11.1 Lo que no se escribe como regla

Quedaron fuera porque nada podría comprobarlas o porque la investigación no las sostiene: «la interfaz debe ser intuitiva»; «usar una tipografía especialmente legible» (no hay una tipografía más legible para todos: se exige tamaño, contraste e interlineado, A-4, A-15 y A-16); «las mayúsculas se leen peor» (está en discusión: L-3 se justifica por coherencia); «44 px es el mínimo accesible» (A-1 y A-2 separan las cifras); «la validación inmediata es mejor» (en discusión: se valida al enviar, por convención, C-19); «no más de cinco opciones por pantalla» (sin estudio detrás).

### 11.2 Obligaciones del esquema que no quedaron vigentes

| ID | Qué pedía el esquema | Por qué no está | Qué haría falta |
|---|---|---|---|
| L-6 | Horas y fechas formateadas solo en `shared/format.ts` | Al 2026-11-12 hay fechas y horas que se muestran formateadas fuera de ese módulo: `formatTime` en `features/employee/employeeDay.ts` y el título del día en `features/admin/JourneysViewRender.tsx`; los demás `Intl.DateTimeFormat` fuera del módulo calculan, no muestran | Mover esos dos formatos a `shared/format.ts` y agregar un test que lo exija |
| L-7 | Una duración de 60 minutos o más en horas y minutos | No existe ese formato: la tolerancia se muestra siempre en minutos («Tenés {minutos} minutos de tolerancia para entrar.», `features/employee/EmployeeViews.tsx`) | Un `formatMinutes` en `shared/format.ts`; sus textos («1 hora y 30 minutos») son propuesta pendiente de aprobación del dueño |
| L-10 | Los campos opcionales dicen «(opcional)» | Ningún texto de la aplicación lo dice y no se revisó qué campos son opcionales | Revisar los formularios y decidir la marca |

### 11.3 Propuestas que agregan algo y necesitan una decisión

Cada una cambia el comportamiento o agrega una dependencia, así que va como propuesta pendiente de aprobación del dueño (G-1), con su fila en `docs/DECISIONES.md` si se avanza:

- Una tipografía incluida en la aplicación (hoy se usa la del sistema).
- Una biblioteca de pruebas de accesibilidad (`axe-core`, `eslint-plugin-jsx-a11y` o un navegador de pruebas): dependencias nuevas, con la verificación de `CLAUDE.md` §1.
- Un aviso de sesión por vencer: la sesión de 30 minutos del `ADMIN` vence sin aviso, y WCAG 2.2.1 queda sin cumplir para ella (hallazgo F-04).
- Cambiar de empresa con un botón explícito (F-20) y un botón para copiar la contraseña provisoria (F-37).
- Ofrecer activar los avisos desde «Para revisar» mientras estén apagados.
- Un test que compruebe que cada test citado en este documento existe (hoy es un paso a mano, sección 1.4). No agrega dependencias.

### 11.4 Textos pendientes de la revisión del dueño

Estos textos ya están en pantalla. Se escribieron durante la refactorización y esperan que Mateo los revise; hasta entonces son propuesta, no decisión:

- Validación del ingreso y del empleado (tanda F2a): «Escribí tu DNI.», «El DNI tiene que tener de 7 a 12 números.», «Escribí tu contraseña.».
- Validación de los formularios del `ADMIN` (tanda F2b, PR #159): «Elegí la fecha y la hora.», «Elegí un empleado.», «Elegí el día.», «Escribí el nombre y apellido.», «Escribí el DNI.», «La contraseña provisoria tiene que tener al menos 12 caracteres.», «Marcá al menos un local.», «Elegí un horario.», «Elegí desde qué día.», «Escribí el nombre del local.», «Reintentá la carga antes de crear un horario.».
- El título de la pestaña del empleado, «Marcar · Fichaje Braja» (tanda F1).
- El historial de un día (tanda H1, PR #162): «Marca corregida: de {marca y hora} a {marca y hora}», «Caso actualizado: de {caso} a {caso}» y «{caso}: motivo corregido, categoría de {categoría} a {categoría}».
- La etiqueta del campo para editar a una persona en «Equipo» pasó de «Nombre y apellido» a «Nombre» (tanda E6), para que el texto visible quede dentro de su nombre accesible (WCAG 2.5.3). Se puede volver atrás si el dueño prefiere la anterior.
- La frase del sistema de diseño «Si no podés tocar el mapa…» para «Locales» (tanda E4) todavía no está en pantalla.

### 11.5 Palabras que el glosario deja abiertas

D-20261111-01 no las nombra; hasta que el dueño elija, se usa lo que figura entre paréntesis:

- Los nombres de las cuatro marcas de pausa para el `ADMIN` (hoy los mismos del empleado: «Salida a desayunar», «Vuelta del desayuno», «Salida a almorzar», «Vuelta del almuerzo»).
- Los estados de un día: «Sin ingreso» usa una palabra retirada (es la excepción del test del glosario); los otros son «En curso», «En pausa», «Finalizada» y «Cancelada».
- La etiqueta del empleado para un caso sin explicar («Falta explicar»).
- «Empleado» como nombre de una persona en filtros y tablas, al lado de «Equipo» como nombre de la sección.

### 11.6 Elecciones respondidas durante la tarea, sin fila en `docs/DECISIONES.md`

Mateo respondió estas preguntas durante la refactorización (registro de `odd/tasks/ux-ui-refactor.md`), pero no tienen fila propia. Este documento las trata como convenciones; se propone registrarlas como filas para que tengan la misma fuerza que las demás decisiones:

- El día del empleado como planilla de cuatro filas, con la nota de la marca cargada por el encargado (C-12; registro L21).
- La columna de la computadora lista las partes de «Configuración» (N-13; registro L22).
- «Para explicar» arriba de «Tus marcas de hoy» mientras hay algo pendiente (R-8; registro L23).
- En «Para revisar», cada caso empieza por la persona (registro L25).
- Sin renglones en mayúsculas arriba de los títulos (L-3; registro L26).
- Las palabras «Ir al contenido» (A-22; registro L34).

### 11.7 Seguimientos conocidos

De la verificación de la tanda G2 (registro L36), sin corregir:

- A. En «Equipo», un control con foco queda a veces tapado 6 px; es intermitente y AA se cumple, porque 2.4.11 admite que el foco quede tapado en parte (N-9).
- B. El aviso de versión nueva va antes de «Ir al contenido» en el orden del teclado. Se resolvió escribiendo A-22 como lo que hace la aplicación: el aviso está arriba de todo y su botón va primero. Si se prefiere el salto siempre primero, es un cambio de código.
- C. La alineación de los botones de los filtros cuando hay un error de fecha, entre 600 y 875 px de ancho, quedó para revisar.
- D. «Clasificación guardada.» aparece lejos de su fila (resto del hallazgo F-02; es la excepción conocida de J-8).
- E. Al cerrar el aviso de la contraseña provisoria (`dismissIssuedPassword`), la vista no se desplaza para mostrar el bloque desde su comienzo.
- F. El orden de Tab en la barra de arriba por debajo de 1024 px de ancho quedó para revisar.

De la tanda H1 (registro L37):

- Las clases `status-${valor de la API}` todavía existen; el destino es usar solo las clases de tono (C-10).
- `.small-copy` usa 14 px fuera de los cuatro usos de A-16.
- Un test de foco de `features/employee/EmployeeApp.test.tsx` falló una vez con la suite completa bajo carga; pasó solo y en la siguiente corrida completa.

De las revisiones nativas (registros L28 y L29): el ajuste de «Guardar contraseña» en el primer pantallazo a 320 × 640 no tiene test (se midió en 626 px); el relleno de `.button-link[aria-pressed]` es global aunque hoy solo lo usa el botón de mostrar la contraseña; las áreas seguras de los costados dependen de la barra de arriba.

### 11.8 Lo que necesita un dispositivo o una persona

Ningún test ni emulación sustituye estas pruebas; están en la sección 10 y siguen sin hacerse al 2026-11-12:

- TalkBack con Chrome en un Android real (M-8).
- VoiceOver con Safari en un iPhone real, y los avisos en iPhone (M-9; `CLAUDE.md` regla 38 dice que nunca se probó en un iPhone real).
- NVDA en Windows (M-10).
- Un tema de contraste real de Windows (M-6).
- El mapa con un dedo en un teléfono (M-11).
- Personas sin experiencia técnica usando la aplicación: el recorrido del #114 fue una simulación sobre capturas, nadie fue observado.
