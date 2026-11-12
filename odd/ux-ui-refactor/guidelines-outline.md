# Esquema de `docs/UX_UI_GUIDELINES.md`

Borrador del índice y de las obligaciones del documento futuro (tarea T10, especificación S9 de `odd/tasks/ux-ui-refactor.md`). Fecha: 2026-11-11.
No es el documento: es la lista de lo que va a exigir, con la forma de comprobar cada punto. Los valores salen de `design-system.md` y de `tokens.css` (misma carpeta).

## Cómo leer este esquema

- Cada obligación tiene un identificador, lo que exige, **cómo se verifica** y su clase.
- Verificación: **`test`** (vitest, con el archivo; «nuevo en X» indica la tanda de `slice-plan.md` que lo agrega), **`script`** (se corre a mano y su salida se pega en el PR) o **`manual`** (un paso de la lista de la sección 8, con su número). Una obligación sin ninguna de las tres no entra en el documento.
- Clase, según la clasificación del informe de investigación (`ux/research/research.md`, sección 0.1):
  - **`[norma]`**: criterio de WCAG 2.2 nivel A o AA (se cita el número) o guía publicada de plataforma o de un sistema de diseño público (se indica «plataforma»). Solo los criterios de WCAG son requisito de conformidad.
  - **`[evidencia]`**: hay investigación empírica detrás; A si se pudo leer el método, B si la fuente dice basarse en estudios propios sin mostrarlos.
  - **`[convención]`**: decisión de este producto, sin respaldo empírico verificado. Se puede cambiar con una decisión; no se presenta como requisito de accesibilidad.
- Las reglas duras de negocio, las decisiones de `docs/DECISIONES.md` y la autoridad del dueño prevalecen sobre este documento (S9). Donde una obligación nace de una decisión, lleva su identificador.
- Ninguna palabra, tamaño ni orden se probó con usuarios reales: el perfil de usuario es una hipótesis del encargo.

## Índice propuesto del documento

1. Para qué sirve y a quién obliga
2. Principios (los diez de `design-system.md`, sección 1)
3. Tokens (referencia a `frontend/src/styles.css`; el documento no repite los valores)
4. Navegación
5. Jerarquía
6. Lenguaje (incluye el glosario de D-20261111-01)
7. Accesibilidad
8. Componentes
9. Responsive
10. Verificación manual antes de cada release
11. Qué queda fuera y qué es propuesta pendiente

---

## 1. Navegación

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| N-1 | El menú del `ADMIN` tiene cuatro destinos, en este orden y con estos nombres: «Para revisar», «Hoy», «Días de trabajo», «Configuración» (D-20261111-02). | `test` `features/admin/AdminNav.test.tsx` (nuevo en N4): cuatro enlaces, en ese orden | `[convención]` (decisión del dueño); el máximo de 3 a 5 destinos en una barra es `[norma]` de plataforma |
| N-2 | El orden y la presencia de los cuatro destinos no cambian con el estado de la configuración ni con el ancho. | `test` `AdminNav.test.tsx`: mismo orden con la configuración completa e incompleta | `[norma]` WCAG 3.2.3 |
| N-3 | Cada destino tiene nombre visible; el ícono lo acompaña y nunca lo reemplaza. | `test` `AdminNav.test.tsx`: cada enlace tiene texto; `app/icons.test.tsx`: todo ícono lleva `aria-hidden="true"` | `[evidencia]` B; `[norma]` WCAG 2.5.3 para el nombre |
| N-4 | El lugar actual se marca con dos señales además del color (barra y peso) y con `aria-current`. | `test` `AdminNav.test.tsx` (`aria-current`); `test` `app/styles.test.tsx`: la regla del actual declara borde con `--brand` | `[norma]` WCAG 1.4.1 y 1.4.11 |
| N-5 | El título de cada pantalla (`h1`) es la misma palabra que su entrada del menú. | `test` por sección (nuevo en W3b y N4): el `h1` coincide con la etiqueta del enlace actual | `[norma]` WCAG 2.4.6 y 3.2.4 |
| N-6 | Cada sección tiene una dirección: recargar o volver atrás no pierde el lugar. | `test` `features/admin/useAdminSection.test.ts` (nuevo en N1); `manual` M-7 | `[convención]` (D-20261111-02, paso 1) |
| N-7 | Al cambiar de sección cambia el título del documento y el foco va al `h1`. | `test` (nuevo en F1): `document.title` y `toHaveFocus()` | `[norma]` WCAG 2.4.2 y 2.4.3 |
| N-8 | En el celular hay un solo elemento fijo, la barra de abajo; nada más usa `position: fixed` ni `sticky`. | `test` `app/styles.test.tsx` (nuevo en N4): una sola regla con `position: fixed` | `[convención]` |
| N-9 | La barra fija no tapa el control que tiene el foco. | `test` `app/styles.test.tsx`: `scroll-padding-bottom` y el relleno de `.main-content` reservan `--bottom-nav-height`; `manual` M-4 | `[norma]` WCAG 2.4.11 |
| N-10 | El menú no se desplaza de costado en ningún ancho. | `manual` M-1 (320 px: las cuatro etiquetas enteras) | `[evidencia]` B |
| N-11 | El empleado tiene una sola pantalla y ningún menú. | `test` `features/employee/EmployeeApp.test.tsx`: no hay `navigation` | `[convención]` |
| N-12 | Si existe un enlace de ayuda o la frase «avisale a tu encargado» en más de una pantalla, ocupa el mismo lugar relativo en todas. | `manual` M-8 | `[norma]` WCAG 3.2.6 |

## 2. Jerarquía

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| J-1 | Un solo `h1` por pantalla y ningún nivel de título salteado. | `test` (ayudante sobre `getAllByRole('heading')`, por pantalla) | `[norma]` WCAG 1.3.1 |
| J-2 | A lo sumo un botón relleno (`.button-primary`) por formulario, fila o encabezado; ninguno en una lista de registros salvo el paso siguiente de «Primeros pasos»; ninguno en un filtro. | `test` por pantalla: `within(región).getAllByRole('button')` con la clase, a lo sumo uno | `[norma]` de plataforma (GOV.UK, USWDS) |
| J-3 | En la pantalla del empleado la marca siguiente es el control más grande y está en el primer pantallazo antes de marcar. | `test` `app/styles.test.tsx`: `.button-clock` usa `--target-clock`; `manual` M-1 (320 × 640 y 390 × 844) | `[evidencia]` A para el tamaño; la posición es `[convención]` |
| J-4 | Los registros homogéneos (días, marcas, personas, locales, horarios, casos) son filas de una lista o de una tabla; no se usan tarjetas. | `test` `app/styles.test.tsx` (nuevo en H1): ninguna regla de fila declara `border` completo ni `border-radius`; revisión de PR | `[evidencia]` B |
| J-5 | Solo tienen recuadro: los controles, el bloque «ahora» del empleado y la confirmación de una marca. | `test` `app/styles.test.tsx`: lista cerrada de selectores con `border` en los cuatro lados | `[convención]` |
| J-6 | No hay sombras, degradados ni fondos translúcidos. | `test` `app/styles.test.tsx`: ningún `box-shadow` salvo los dos `inset` de 1 px, ningún `gradient(`, ningún `backdrop-filter` | `[convención]` |
| J-7 | El verde oscuro como fondo existe solo en la barra de arriba; el lima, solo en la marca y en el foco sobre esa barra. | `test` `app/styles.test.tsx`: `background` con `--brand` solo en `.topbar` y `.button-primary`; `--lime` solo en dos reglas | `[convención]` |
| J-8 | El resultado de una acción aparece dentro del formulario o de la fila que la originó; arriba de la página solo van las fallas de carga y los avisos de llegada. | `test` por formulario: `within(form).getByRole('alert')` tras un envío fallido (nuevo en F2a y F2b) | `[norma]` WCAG 3.3.1; `[evidencia]` B |
| J-9 | Un formulario que se abre desde una fila se muestra debajo de esa fila y recibe el foco; al cerrarse, el foco vuelve al botón que lo abrió. | `test` con `user-event` y `toHaveFocus()` (nuevo en N2, D3, F1) | `[norma]` WCAG 2.4.3 |
| J-10 | El texto corrido no pasa de 65 caracteres por línea en pantallas anchas. | `test` `app/styles.test.tsx`: `.lead` y `.message-body` usan `--measure` | `[convención]` |

## 3. Lenguaje

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| L-1 | Una sola palabra por cosa, la misma para el empleado y el `ADMIN`: el glosario de D-20261111-01 (tabla al final de esta sección). | `test` `app/glossary.test.ts` (nuevo en W3b): falla si una palabra retirada aparece en un texto visible | `[norma]` WCAG 3.2.4; `[evidencia]` A para el lenguaje llano |
| L-2 | Los nombres de marcas, casos, estados y categorías salen de un único módulo (`shared/labels.ts`). | `test` `app/glossary.test.ts`: ningún otro archivo declara esos textos; `shared/labels.test.ts` | `[convención]` |
| L-3 | Voseo rioplatense y trato directo; mayúscula solo al inicio y en nombres propios. | `test` `app/glossary.test.ts`: ningún texto visible de dos o más palabras en mayúsculas; ningún `text-transform` en la hoja de estilos | `[convención]` |
| L-4 | Nunca se dice que una marca quedó registrada antes de la respuesta del servidor, ni se sugiere que se enviará después. | `test` `features/employee/EmployeeApp.test.tsx`: con el pedido pendiente no existe el texto «registrada»; con falla de red el mensaje dice que no se registró | `[evidencia]` B; exigencia del encargo (S8) y de la regla de «sin cola offline» |
| L-5 | Un mensaje de error dice qué pasó, si se guardó y qué hacer; sin códigos, sin la palabra «inválido», sin culpar a la persona. | `test` `app/glossary.test.ts`: lista de términos vedados en mensajes («inválido», «error 4», «HTTP»…); revisión de PR con la plantilla de tres partes | `[norma]` WCAG 3.3.1 y 3.3.3 |
| L-6 | Las horas y las fechas se formatean solo en `shared/format.ts`. | `test` (nuevo en H1): ningún `Intl.DateTimeFormat` ni `toLocale` fuera de ese módulo | `[convención]` |
| L-7 | Una duración de 60 minutos o más se muestra en horas y minutos. | `test` `shared/format.test.ts` (`formatMinutes`): 45, 60, 90, 240 | `[evidencia]` B (unidades familiares) |
| L-8 | Un ejemplo va en la ayuda del campo; el texto de muestra dentro del campo nunca es el único lugar de una instrucción. | `test` por formulario: el ejemplo es `toHaveAccessibleDescription` del campo | `[norma]` de plataforma; WCAG 1.4.3 aplica al texto de muestra |
| L-9 | El botón para salir de un formulario no usa la palabra de una acción de dominio. | `test` `app/glossary.test.ts`: «Cancelar» no aparece como único texto de un botón dentro de un formulario de cancelación | `[convención]` |
| L-10 | Los campos opcionales dicen «(opcional)»; los obligatorios no llevan marca. | `test` por formulario: `getByLabelText(/opcional/)` donde corresponde | `[norma]` de plataforma (GOV.UK, USWDS); el asterisco está en discusión |
| L-11 | El texto fijo del aviso push lleva solo cantidades, nunca nombres ni motivos. | `test` existente de `device/push/safeNotification` | regla dura (D-20261014-15) |

**Glosario (D-20261111-01).** «día de trabajo» (no «jornada»); «Para revisar» (no «bandeja»); «caso» para el `ADMIN` y ningún sustantivo para el empleado («Para explicar»); «local» (no «sede»); «Entrada» y «Salida» (no «ingreso» ni «egreso»); «No marcó la entrada», «Llegada tarde», «Salió antes», «Salió después de hora», «No marcó la salida», «Desayuno largo», «Almuerzo largo», «Fuera del local»; «Todavía no explicó»; «avisos» (no «alertas», «push» ni «notificaciones»); «contraseña» (no «clave»). Se conservan «Justificado», «No justificado», «marca», «tolerancia» y «tramo». Los nombres internos, la API y los términos de `docs/ESPECIFICACION.md` no cambian.

Pendiente de palabra (el documento las lista como abiertas hasta que el dueño decida): los nombres de las cuatro marcas de pausa para el `ADMIN`, los estados de un día («Sin ingreso» usa una palabra retirada) y los textos nuevos marcados como «(copy)» en `design-system.md`.

## 4. Accesibilidad

**Áreas de toque: tres cifras distintas, que no se mezclan.**

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| A-1 | **24 px**: ningún control mide menos de 24 × 24 px CSS. Es lo que exige WCAG 2.2 AA. | `test` `app/styles.test.tsx`: `--target-floor` vale `1.5rem` y es el tamaño de casillas y botones de opción; `manual` M-3 | `[norma]` WCAG 2.5.8 |
| A-2 | **44 px**: todo control mide al menos 44 px de alto y de ancho (48 px en la disposición con barra inferior). Es el mínimo de trabajo de este producto, no un requisito de AA. | `test` `app/styles.test.tsx`: `--target` vale `3rem` y `2.75rem` desde 1024 px; `.button`, los campos, `.check`, `.nav-item` y `summary` lo usan como `min-height`; `manual` M-3 | `[convención]` (44 es el valor AAA de WCAG 2.5.5 y el de Apple) |
| A-3 | **80 px**: el botón de la marca siguiente; 56 px las otras marcas del empleado. | `test` `app/styles.test.tsx`: `--target-clock: 5rem`, `--target-large: 3.5rem` | `[evidencia]` A, extrapolada de un estudio con personas de 65 a 95 años |

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| A-4 | Todo par de texto y fondo cumple 4,5:1 (3:1 desde 24 px, o 18,5 px en negrita). | `test` `app/styles.test.tsx`: tabla de pares sobre los tokens (portada de `contrast.mjs`) | `[norma]` WCAG 1.4.3 |
| A-5 | Todo borde de control, indicador de estado, ícono con significado y anillo de foco cumple 3:1 con lo que lo rodea. | misma tabla; `manual` M-2 para lo que pinta el navegador | `[norma]` WCAG 1.4.11 |
| A-6 | Ningún color fuera del bloque de tokens. | `test` `app/styles.test.tsx`: techo que solo baja, cero al final (nuevo en A1) | `[convención]` (S9: «Tokens centralizados») |
| A-7 | Ningún estado se distingue solo por el color: lleva palabra o forma. | `test` `app/ui.test.tsx`: `StatusTag` siempre tiene texto e ícono; `test` de estilos: seleccionado, presionado y actual declaran borde; `manual` M-6 | `[norma]` WCAG 1.4.1 |
| A-8 | El foco es visible en todo control: anillo de 3 px separado 2 px. | `test` `app/styles.test.tsx`: existe `:focus-visible` con `outline` y ningún `outline: none` sin su regla; `manual` M-4 | `[norma]` WCAG 2.4.7 |
| A-9 | Todo lo interactivo es un control nativo (`button`, `a`, `input`, `select`, `textarea`, `summary`). | `test` (nuevo en H1): ningún `onClick` sobre `div` o `span` en los fuentes | `[norma]` WCAG 2.1.1 y 4.1.2 |
| A-10 | Todo control tiene nombre accesible, y el nombre contiene el texto visible. | `test` (ayudante con `toHaveAccessibleName`, por pantalla) | `[norma]` WCAG 4.1.2 y 2.5.3 |
| A-11 | Todo campo tiene etiqueta visible; la ayuda y el error están asociados al campo. | `test` `app/ui.test.tsx` (existente, `FormField`) | `[norma]` WCAG 1.3.1, 3.3.2 |
| A-12 | Los errores son `alert`; los demás mensajes usan una región `status` que existe antes que su texto. | `test` `app/ui.test.tsx` (existente) y el ayudante de estado (nuevo en F3) | `[norma]` WCAG 4.1.3 |
| A-13 | Ningún mensaje desaparece por tiempo. | `test` (nuevo en H1): ningún `setTimeout` que oculte un mensaje en los componentes de mensajes | `[norma]` WCAG 2.2.1 |
| A-14 | `lang="es-AR"`; el zoom no se bloquea; la orientación no se fija. | `test` `app/indexHtml.test.ts` (ampliado): `lang`, sin `user-scalable` ni `maximum-scale`; `frontend/vite.config.ts` sin `orientation` | `[norma]` WCAG 3.1.1, 1.4.4, 1.3.4 |
| A-15 | Los tamaños de texto y las áreas de toque están en `rem`; los campos usan 16 px. | `test` `app/styles.test.tsx`: ningún `font-size` en `px`; el campo usa `--font-size-body` | `[norma]` WCAG 1.4.4 |
| A-16 | El texto de trabajo mide 16 px (18 px en la pantalla del empleado); 14 px solo en etiquetas de estado, nombres de la barra inferior, encabezados de columna y marcas de tiempo. | `test` `app/styles.test.tsx`: `--font-size-meta` solo en la lista cerrada de selectores | `[norma]` de plataforma (USWDS, GOV.UK); WCAG no fija un mínimo |
| A-17 | Con `prefers-reduced-motion` no hay animación ni transición; toda espera tiene texto. | `test` `app/styles.test.tsx`: existe el bloque; `test` de `Loading`: el texto acompaña al indicador | `[convención]` (buena práctica; el criterio 2.3.3 es AAA) |
| A-18 | En modo de colores forzados siguen visibles el foco y los estados seleccionado, presionado y actual. | `test` `app/styles.test.tsx`: el bloque `forced-colors` nombra esos selectores; `manual` M-6 | `[convención]` |
| A-19 | El mapa se puede usar sin arrastrar y sin puntero: búsqueda de dirección y coordenadas escritas. | `test` `features/admin/SitesViewRender.test.tsx` (existente); `manual` M-9 | `[norma]` WCAG 2.5.7 y 2.1.1 |
| A-20 | El ingreso admite gestor de contraseñas y pegar; hay botón para mostrar la contraseña. | `test` `features/auth/AuthScreens.test.tsx`: `autocomplete`, sin `onPaste`, el botón con `aria-pressed` | `[norma]` WCAG 3.3.8, 1.3.5 |
| A-21 | Las listas son listas, las tablas tienen encabezados y nombre, y cada grupo de opciones es un `fieldset` con `legend`. | `test` por pantalla (`getByRole('table', { name })`, `getByRole('group', { name })`) | `[norma]` WCAG 1.3.1 |
| A-22 | El primer elemento enfocable de cada aplicación salta al contenido. | `test` (nuevo en G1): `userEvent.tab()` da el enlace y lleva a `main` | `[convención]` (WCAG 2.4.1 ya se cumple con los puntos de referencia) |

## 5. Componentes

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| C-1 | Los valores de color, tamaño, radio, borde, espacio y duración salen de los tokens de `:root`. | `test` `app/styles.test.tsx`: techos de literales de color, de `font-size` sin token y de radios (cero al final) | `[convención]` (S9) |
| C-2 | Tres radios (4, 8 y 12 px), dos anchos de borde (1 y 2 px), tres pesos (400, 600, 700), cinco tamaños de texto. | `test` `app/styles.test.tsx`: los valores declarados pertenecen a esas listas | `[convención]` |
| C-3 | Ningún estado depende de distinguir el peso 600 del 700. | revisión de PR; `manual` M-5 (un Android con Roboto) | `[convención]` |
| C-4 | Un botón existe en estas variantes y en ninguna otra: principal, secundario, enlace, destructivo; tamaños normal, grande y de marca. | `test` (nuevo en H1): toda clase `button-*` usada en los fuentes está en la lista | `[convención]` |
| C-5 | Un botón deshabilitado se lee (sin opacidad) y dice por qué, con texto visible asociado; un botón de envío solo se deshabilita mientras envía o con ese motivo. | `test` `app/styles.test.tsx`: `:disabled` no declara `opacity`; `test` `features/admin/AccessibilityBase.test.tsx` (existente) ampliado a cada botón deshabilitado | `[norma]` de plataforma (GOV.UK, USWDS) |
| C-6 | Todo componente con datos define sus estados: cargando, vacío, error (con «Reintentar») y con contenido; los cuatro con textos distintos. | `test` por pantalla: un caso por estado | `[evidencia]` B; S9 |
| C-7 | Un mensaje tiene una de cuatro clases (información, listo, atención, error), con barra, ícono y fondo propios; el texto va siempre en el color de texto. | `test` `app/ui.test.tsx`: rol e ícono por clase; `test` de estilos: `.message` usa `border-left` | `[norma]` WCAG 1.4.1 |
| C-8 | La confirmación de una marca solo existe después de la respuesta del servidor, muestra la hora del servidor y no usa el estilo de ningún otro mensaje. | `test` `features/employee/EmployeeApp.test.tsx` | `[evidencia]` B; S8 |
| C-9 | Una etiqueta de estado no parece un botón: sin cursor de mano, sin efecto al pasar, esquinas de 4 px. | `test` `app/styles.test.tsx`: `.status-chip` no declara `cursor` ni `:hover` y usa `--radius-tag` | `[evidencia]` B |
| C-10 | El color de una etiqueta indica de quién es el turno: ámbar si espera a quien mira, gris punteado si espera a otra persona, verde y rojo para lo decidido; los estados de un día son neutros. | `test` `shared/labels.test.ts`: tabla de tono por estado y por rol | `[convención]` |
| C-11 | Las dos decisiones de un caso van separadas por 12 px y se apilan cuando no entran lado a lado. | `test` `app/styles.test.tsx`: `.button-pair` usa `gap: var(--space-3)` y `auto-fit` | `[convención]` (la distancia entre acciones opuestas es `[evidencia]` B) |
| C-12 | El día del empleado se muestra en cuatro filas fijas; una marca anulada no ocupa una fila y se lista tachada debajo; una marca cargada por el encargado muestra la hora declarada. | `test` `features/employee/employeeDay.test.ts` (`daySlots`, nuevo en D2) | `[convención]` |
| C-13 | Los íconos son SVG en línea, siempre con texto visible al lado y ocultos para los lectores de pantalla; no hay caracteres Unicode usados como ícono. | `test` `app/icons.test.tsx`; `test` (nuevo en H1): lista de caracteres vedados en los fuentes | `[evidencia]` B |
| C-14 | No hay diálogos modales, avisos emergentes ni ayudas que dependan de pasar el puntero. | `test` (nuevo en H1): ningún `role="dialog"`, `aria-modal` ni `title=` en los fuentes | `[convención]` |
| C-15 | La confirmación se pide solo para lo serio y difícil de deshacer (anular una marca, cancelar un día, restablecer una contraseña), nombra la consecuencia y sus botones nombran la acción. | `test` por flujo (existentes en `AdminViews.test.tsx`); revisión de PR para un flujo nuevo | `[evidencia]` B; `[norma]` WCAG 3.3.4 |
| C-16 | No queda ninguna clase usada sin regla ni regla sin uso. | `test` (nuevo en H1): cruce entre las clases de los `.tsx` y los selectores de la hoja | `[convención]` |
| C-17 | Sin dependencias nuevas para estilos, íconos o tipografías. | revisión de PR: `frontend/package.json` sin cambios en `dependencies`; regla de CLAUDE.md §1 | regla del repositorio |

## 6. Responsive

| ID | Obligación | Cómo se verifica | Clase |
|---|---|---|---|
| R-1 | A 320 px de ancho ninguna pantalla se desplaza de costado, salvo una tabla dentro de su propio contenedor y el mapa. | `manual` M-1 | `[norma]` WCAG 1.4.10 |
| R-2 | Cuatro puntos de corte y ninguno más: hasta 359 px, desde 600 px, desde 768 px y desde 1024 px. | `test` `app/styles.test.tsx` (nuevo en G1): los `@media` de ancho pertenecen a esa lista | `[convención]` |
| R-3 | La hoja de estilos se escribe del celular hacia arriba (`min-width`). | mismo test: `max-width` solo con 359 px | `[convención]` |
| R-4 | Los registros son lista hasta 767 px y tabla desde 768 px, con los mismos datos y el mismo orden; el cambio lo decide un único gancho. | `test` `app/useBreakpoint.test.ts`; `test` por pantalla en los dos modos | `[norma]` de plataforma (USWDS); `[evidencia]` B |
| R-5 | Una tabla nunca queda con columnas cortadas a 768 px ni a 1024 px. | `manual` M-1 (768 y 1024 px, «Equipo» y «Hoy») | `[norma]` WCAG 1.4.10 |
| R-6 | Barra inferior hasta 1023 px; columna izquierda desde 1024 px. | `test` `app/styles.test.tsx`: `.nav` fija fuera del `@media (min-width: 1024px)` y estática dentro | `[convención]` (abajo es la costumbre de iOS y Android; no hay estudio que compare) |
| R-7 | En un visor bajo (hasta 480 px de alto) nada queda fijo. | `test` `app/styles.test.tsx`: existe `@media (max-height: 480px)` con `position: static` para `.nav`; `manual` M-1 (640 × 360) | `[norma]` WCAG 1.4.10 |
| R-8 | La pantalla del empleado se diseña primero para el celular: una columna, texto de 18 px, la marca siguiente arriba. | `test` `app/styles.test.tsx`: `.employee-frame` usa `--font-size-body-lg`; `manual` M-1 | `[convención]` (S9: «Priorizar el uso móvil en flujos de fichaje») |
| R-9 | Con zoom del 200 % y con el texto del sistema al máximo no se pierde contenido ni función. | `manual` M-5 | `[norma]` WCAG 1.4.4 y 1.4.12 |
| R-10 | Un nombre largo (empresa, persona, motivo) se parte en varias líneas; no se corta con puntos suspensivos. | `test` `app/styles.test.tsx`: ningún `text-overflow: ellipsis`; `manual` M-1 con el dato de prueba largo | `[norma]` WCAG 1.4.10 |
| R-11 | Las áreas seguras del teléfono (`env(safe-area-inset-*)`) se respetan en la barra de arriba y en la de abajo. | `test` `app/styles.test.tsx`: las dos reglas usan `env(`; `manual` M-10 | `[convención]` |

## 7. Gobierno

| ID | Obligación | Cómo se verifica |
|---|---|---|
| G-1 | Un cambio que agrega una palabra visible para una cosa del glosario, un destino del menú o una función, o que contradice una decisión vigente, se presenta como propuesta con su fila en `docs/DECISIONES.md`; no se implementa como definitivo. | revisión de PR; `test` `app/glossary.test.ts` para las palabras |
| G-2 | Este documento no atribuye aprobaciones: cada regla que nace de una decisión cita su identificador. | revisión de PR (misma regla que CLAUDE.md §2) |
| G-3 | Todo cambio visual adjunta capturas a 320, 390, 768 y 1366 px de las pantallas que toca. | plantilla del PR |
| G-4 | Lo que el documento llama `[convención]` se puede cambiar con una decisión; lo que llama `[norma]` WCAG no. | la clase de cada fila |

## 8. Verificación manual (pasos explícitos, antes de cada release)

Cada paso produce una evidencia que se pega en el PR o en la lista del release: una captura o una frase con lo observado.

| Paso | Qué se hace | Qué se mira |
|---|---|---|
| M-1 | Abrir cada pantalla a 320, 390, 768, 1024 y 1366 px de ancho, y a 640 × 360. | Sin desplazamiento de costado, sin texto cortado ni superpuesto, sin columnas cortadas; la marca siguiente en el primer pantallazo |
| M-2 | Con las herramientas del navegador, medir el contraste de lo que pinta el navegador: texto de muestra, selector de fecha y de hora, casilla sin marcar, flecha de la lista, autocompletado. En Chrome, Safari de iPhone y Firefox. | 4,5:1 el texto, 3:1 los bordes |
| M-3 | Medir con las herramientas del navegador el recuadro de cada tipo de control. | Ninguno bajo 44 px por lado; ninguno bajo 24 px |
| M-4 | Recorrer cada flujo solo con teclado (Tab, Mayús+Tab, Enter, Espacio, flechas, Escape), de la entrada al resultado, a 320 y a 1366 px. | El foco siempre visible, nunca debajo de la barra, y en el orden de lectura |
| M-5 | Zoom del navegador al 200 % y al 400 %; tamaño de texto de Android al máximo; un Android con Roboto. | Sin pérdida de contenido; ningún rótulo cortado; ningún estado que dependa del peso |
| M-6 | Activar los colores forzados (temas de contraste de Windows). | Foco, seleccionado, presionado y actual visibles |
| M-7 | En la aplicación instalada en Android: entrar a una parte de «Configuración», recargar, tocar Atrás dos veces. | Se conserva el lugar; Atrás vuelve por las pantallas antes de salir |
| M-8 | TalkBack con Chrome y VoiceOver con Safari: ingresar, marcar, explicar un caso, decidir un caso, cargar días, cargar un local con el mapa. | Cada resultado se anuncia una vez; los nombres coinciden con lo visible |
| M-9 | Ubicar un local solo con la búsqueda; solo con coordenadas escritas; con un dedo y sin arrastrar. | Se puede en los tres casos |
| M-10 | Aplicación instalada en un iPhone. | Barra de estado legible; nada bajo la muesca ni bajo el indicador de inicio |
| M-11 | Con la red limitada y sin red: marcar, enviar un motivo, guardar un formulario. | Cada mensaje dice qué pasó, si se guardó y qué hacer; lo escrito se conserva |

## 9. Qué no se escribe como regla

Quedaron fuera porque nada podría comprobarlas o porque la investigación no las sostiene: «la interfaz debe ser intuitiva», «usar una tipografía especialmente legible» (no hay una tipografía más legible para todos: se exige tamaño, contraste e interlineado, A-4, A-16), «las mayúsculas se leen peor» (está en discusión: L-3 se justifica por coherencia), «44 px es el mínimo accesible» (A-1 y A-2 separan las cifras), «la validación inmediata es mejor» (en discusión: se valida al enviar, por convención), «no más de cinco opciones por pantalla» (sin estudio detrás).

Propuestas que el documento listará como pendientes, sin regla: una tipografía incluida en la aplicación; una biblioteca de pruebas de accesibilidad (`axe-core`, `eslint-plugin-jsx-a11y`, un navegador de pruebas); el aviso de sesión por vencer (WCAG 2.2.1 queda sin cumplir para la sesión de 30 minutos del `ADMIN`: hallazgo F-04); el cambio de empresa con botón; ofrecer los avisos en «Para revisar» mientras estén apagados.
