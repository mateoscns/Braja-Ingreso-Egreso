# Fichaje Braja — UX audit and information architecture (T2, specs S4 and S6)

Date: 2026-11-10. Branch `feat/ux-ui-refactor-114`, working tree at `c2402b8`. Read-only audit: nothing in the repository was changed.

## How to read this document

- Built from the code, not from screenshots. Every claim about the product carries a `path:line`. Anything that depends on how a screen renders (overlaps, what is above the fold) is derived from the CSS and marked **"confirm on T3 screenshots"**.
- Paths are relative to `frontend/src/` unless they start with `docs/`, `deploy/`, `backend/`, `odd/`, `openapi.yaml` or `README.md` (repository root). Long paths are abbreviated:

| Code | File | Code | File |
|---|---|---|---|
| `APP` | `app/App.tsx` | `AA` | `features/admin/AdminApp.tsx` |
| `SES` | `app/session.tsx` | `AV` | `features/admin/AdminViews.tsx` (containers) |
| `UI` | `app/ui.tsx` | `AVR` | `features/admin/AdminViewsRender.tsx` |
| `AS` | `features/auth/AuthScreens.tsx` | `EVR` | `features/admin/EmployeesViewRender.tsx` |
| `EA` | `features/employee/EmployeeApp.tsx` | `SV` | `features/admin/SchedulesView.tsx` |
| `EV` | `features/employee/EmployeeViews.tsx` | `SE` | `features/admin/ScheduleEditor.tsx` |
| `ED` | `features/employee/employeeDay.ts` | `WDP` / `WDF` | `features/admin/WorkDaysPanel.tsx` / `WorkDaysForm.tsx` |
| `EM` | `features/employee/employeeMessages.ts` | `FS` / `SS` | `features/admin/FirstSteps.tsx` / `setupStatus.ts` |
| `CL` | `shared/api/client.ts` | `SMP` | `features/admin/SiteMapPanel.tsx` |
| `APC` | `device/push/AdminPushControl.tsx` | `SL` | `features/admin/siteLocation.ts` |
| `CSS` | `styles.css` | `SPEC` / `DEC` | `docs/ESPECIFICACION.md` / `docs/DECISIONES.md` |

- UI strings are quoted exactly, in Spanish, between « ».
- "Phase 1" is the pass merged on 2026-11-09 (PR #106, #107, #111; `odd/tasks/ux-phase1.md`). What it fixed is not re-reported; where a phase 1 fix left a residue, the residue is reported.
- The user profile (employees who mostly use WhatsApp, workers aged 45 to 65, owners doing admin between other tasks, cheap phones, unstable connections) is a design hypothesis of the brief, not research.
- Severity scale: **critical** = a frequent task can fail or record something wrong; **high** = a frequent task is confusing or a rarer one can go wrong; **medium** = friction or inconsistency; **low** = polish.

## Summary of counts

| Role | Screens | Sections / panels / inline flows |
|---|---|---|
| Entry gate (anonymous and pre-role) | 4: boot loader, login, forced password change, company chooser | 0 dialogs; 3 forms |
| `EMPLEADO` | 1 screen | 8 sections (greeting and state sentence, shift picker, mark feedback, «Marcar» with 2 inline confirmation steps, «Tus marcas de hoy», «Para explicar», «Desvíos del día», «Ver otros días») |
| `ADMIN` | 7 sections in one shell: Primeros pasos, Bandeja, Jornadas, Historial, Sedes, Horarios, Empleados | 32 panels and inline flows, not counting page headings (listed in 1.4) |
| Global chrome | top bar (brand, install control, company switcher, company pill, user label, sign-out), ADMIN section menu, ADMIN alerts bar, update banner | — |

There is no modal dialog, no `window.confirm`, no router and no URL per section anywhere in `frontend/src` (search for `dialog`, `aria-modal`, `confirm(` returns nothing outside tests; the ADMIN section is `useState` at `AA:27`). Every confirmation is an inline form or an inline message.

---

# 1. Inventory

## 1.1 Entry gate (`APP:16-24`)

The gate decides in this order: loading → no session → must change password → no active company → role.

| # | Screen | Component | Reached when | Left by | States |
|---|---|---|---|---|---|
| G0 | Boot loader | `APP:18` «Preparando Fichaje Braja…» | every cold start, while `GET /session` runs (`SES:22-33`) | automatically | loading only. If `/session` fails with anything but 401, the login shows the error text (`SES:29` «No se pudo validar la sesión.» or the client message) |
| G1 | Login | `LoginScreen` `AS:13-40` | no session (`APP:19`); after sign-out; after any 401 (`SES:41-44`) | «Ingresar» (`AS:36`) | idle; busy («Entrando, esperá un momento…» `AS:31`, button «Ingresando…» `AS:36`); wrong credentials «El DNI o la contraseña son incorrectos.» (`CL:72`); throttled «Hubo demasiados intentos. Esperá … y probá otra vez.» (`CL:84`); unavailable (`CL:86`, `CL:88`); session expired «Tu sesión venció. Iniciá sesión nuevamente.» (`SES:42`); mark interrupted «Pasó mucho tiempo y hay que entrar de nuevo. Tu marca todavía no se guardó.» (`features/auth/interruptedMark.ts:7`); sign-out not confirmed «No pudimos confirmar que la sesión se cerró. Si terminaste, cerrá también esta pestaña.» (`SES:62`) |
| G2 | Forced password change | `PasswordChangeScreen` `AS:66-97` | `session.mustChangePassword` (`APP:20`): first login, after an ADMIN reset, or mid-session on 403 `PASSWORD_CHANGE_REQUIRED` (`SES:46-48`) | «Guardar contraseña» (`AS:93`) or «Cerrar sesión» (`AS:94`) | idle with live counter «Llevás 4 de 12.» / «Llevás 12: alcanza.» (`AS:63`); busy «Guardando tu contraseña…» (`AS:87`); five client validations (`AS:75-78`); server errors (`CL:74`, `shared/password.ts:7`) |
| G3 | Company chooser | `CompanyScreen` `AS:42-60` | signed in with no active company (`APP:21-22`): accounts with several companies, or none | tapping a company (`AS:54`) or «Cerrar sesión» (`AS:58`) | list; busy «Esperando la activación de {empresa}…» (`AS:53`); error; zero companies «Tu cuenta todavía no tiene empresas asignadas. Consultá con un administrador.» (`AS:57`) |

## 1.2 Global chrome

| Element | Component | Who sees it | Content and states |
|---|---|---|---|
| Update banner | `device/pwa/ServiceWorkerUpdate.tsx:22-28`, mounted `APP:11` | everyone, on every screen including login | «Hay una versión nueva» + «Actualizar» / «Actualizando…». Fixed, bottom centre, `z-index: 50` (`CSS:444`) |
| Top bar | `AppHeader` `UI:29-37` | EMPLEADO (`EA:274`) and ADMIN (`AA:85`) | brand link «Fichaje Braja» with `href="#inicio"` (`UI:33`; no element has that id, see P-14); children; company pill (`UI:34`); user label (`UI:34`); «Cerrar sesión» (`UI:35`) |
| Install control | `device/pwa/InstallControl.tsx:24-31` | both roles until installed | nothing when installed or on desktop without a prompt; «Instalar app» (`:25`); «Cómo instalar» toggling a help bubble (`:27-30`) |
| Company switcher | `CompanySwitcher` `UI:39-69` | accounts with 2+ companies | `<select>` with no visible label (`aria-label="Empresa activa"`, `UI:63`); busy «Esperando la activación de {empresa}…» (`UI:66`); error bubble (`UI:67`) |
| ADMIN section menu | `AA:90-96` | ADMIN | caption «ADMINISTRACIÓN» (`AA:90`); «Primeros pasos» first while a step is missing (`AA:91`) or last when all done (`AA:95`); «Bandeja», «Jornadas», «Historial» (`AA:16`); caption «CONFIGURACIÓN» (`AA:93`); «Sedes», «Horarios», «Empleados» (`AA:19`); footer «Conexión protegida» (`AA:96`). Left column at more than 760 px; one sideways-scrolling row from 521 to 760 px (`CSS:368-371`); wrapped pills that scroll away at 520 px or less (`CSS:401-402`); captions and footer hidden at 760 px or less (`CSS:369`) |
| ADMIN alerts bar | `AdminPushControl` `APC:146-167`, mounted `AA:110` | ADMIN, on every section | fixed bottom bar (`CSS:342`). Title «Alertas en este dispositivo» (`APC:154`). States: loading «Consultando la configuración de avisos…» (`APC:158`); config error + «Reintentar consulta» (`APC:165`); off «Desactivadas para {empresa}; cada empresa se activa por separado. Solo avisan sobre ingresos pendientes o llegadas tarde.» + «Activar avisos» (`APC:161`, `:166`); on «Activadas para {empresa}.» + «Desactivar» (`APC:163`); unsupported, not enabled, blocked (`APC:147-151`); short status at 760 px or less «Avisos: activados» / «Avisos: desactivados» (`APC:162`); result messages (`APC:30`, `:56`, `:127`, `:141`) |

## 1.3 `EMPLEADO`: one screen (`EA:273-295`)

Order on screen: top bar → greeting → shift picker (only with 2+ jornadas) → mark feedback → «Marcar» → «Tus marcas de hoy» → «Para explicar» → «Desvíos del día» → «Ver otros días».

| # | Section | Component | Content | States |
|---|---|---|---|---|
| E1 | Greeting and state sentence | `DayHeading` `EV:29-31` | «Hola, {nombre}» + one sentence | no jornada «Hoy no tenés turno cargado. Si tenés que trabajar, avisale a tu encargado.» (`ED:108`); `NO_INGRESO` «Todavía no marcaste tu entrada.» (`ED:111`); `EN_CURSO` «Estás trabajando desde las HH:MM.» (`ED:127`); `PAUSA_ABIERTA` «Estás desayunando: volvé antes de las HH:MM.» / «…: tenías que volver a las HH:MM.» (`ED:122-123`); `EGRESADA` «Ya terminaste tu día.» (`ED:112`); `CANCELADA` «Tu encargado canceló este día: no tenés que marcar.» (`ED:113`); another day «Estás viendo el {fecha}.» plus « No hay turno cargado ese día.» (`EA:270`); empty while loading or failed (`EA:269`) |
| E2 | Shift picker | `JourneyPicker` `EV:33-40` | «Elegí tu turno»; one button per jornada: schedule name, date · local · state label | only when the day has 2+ jornadas (`EA:280`); disabled while a mark is in flight |
| E3 | Mark feedback | `MarkFeedback` `EV:42-54` | error text, «Actualizar» (`EV:48`), success «Listo: tu entrada quedó registrada a las HH:MM.» (`ED:133`) and the location line | location: «Enviando ubicación… no cierres la app.», «Ubicación enviada ✔», «No llegó tu ubicación: puede figurar como fuera del local. Revisá que el celular tenga la ubicación activada.» (`ED:145-150`); errors (`EM:7-17`, `CL:46`, `CL:51`) |
| E4 | «Marcar» | `MarkPanel` `EV:56-76` | one large suggested mark (`EV:68`), other allowed pauses smaller (`EV:69-71`), exit last and outlined (`EV:72`). Labels «Marcar entrada», «Me voy a desayunar», «Volví del desayuno», «Me voy a almorzar», «Volví del almuerzo», «Marcar salida» (`ED:4-7`) | hidden when no mark is allowed (`EA:286`: `EGRESADA`, `CANCELADA`); sending «Enviando tu marca… esperá un momento.» (`EV:73`); inline step **early exit** «¿Terminás tu día ahora? Tu horario termina a las HH:MM.» with «Sí, marcar salida» / «No, seguir trabajando» (`ED:103`, `EV:64-65`); inline step **location notice** «Para marcar necesitamos saber que estás en el local. Solo se mira en el momento de marcar.» with «Continuar» / «Volver» (`features/employee/locationNotice.ts:7`, `EV:64-65`) |
| E5 | «Tus marcas de hoy» / «Tus marcas del {fecha}» | `DayMarksPanel` `EV:78-92` | state chip (`shared/format.ts:3-9`: «Sin ingreso», «En curso», «En pausa», «Finalizada», «Cancelada»); «Tu horario» with tramos; «{Local} · Tenés {n} minutos de tolerancia para entrar.» (`EV:82`); list of marks with time and location label («Ubicación enviada», «Enviando ubicación…», «Sin ubicación», `ED:137-141`); voided marks struck through with chip «Anulada» (`EV:86-87`) | empty «Todavía no marcaste nada.» (`EV:90`) |
| E6 | «Para explicar» | `MotivePanel` + `MotiveCard` `EV:107-150` | intro «Contale a tu encargado qué pasó. Podés cambiarlo hasta que lo revise. Lo que escribas solo lo ven vos y tu encargado.» (`EV:109`); one form per pending deviation of **any date** (`features/employee/dayData.ts:11`): type name, date-time chip, sentence + «¿Qué pasó?» (`EV:130`), radios «¿Qué tipo de motivo es?» with «Salud», «Transporte», «Emergencia», «Otra» and a help line each (`EV:18-23`, `EV:132`), textarea «Contá qué pasó» (`EV:140`), «Enviar motivo» / «Guardar corrección» (`EV:145`), «Cancelar» when editing (`EV:146`) | loading; day failed «No pudimos cargar lo que tenés para explicar.» (`EV:114`); own error + «Reintentar» (`EV:111-112`); truncated «Te mostramos los 100 más recientes. Cuando los completes vas a ver los anteriores.» (`EV:113`); empty «No tenés nada para explicar.» (`EV:115`); success «Lo enviamos. Tu encargado lo va a revisar.» (`EA:249`); field errors «Elegí una de las opciones.», «Contá en pocas palabras qué pasó.» (`EA:240-241`); locked «Tu encargado ya lo revisó: ya no se puede cambiar.» (`CL:52`) |
| E7 | «Desvíos del día» | `DeviationsPanel` `EV:152-166` | cards of the deviations of the viewed date: type name, status chip («Falta explicar», «A revisar», «Justificado», «No justificado», `EV:25-27`), sentence, «Tu explicación: …» (`EV:161`), «Corregir motivo» while `PENDIENTE_REVISION` (`EV:162`), «Agregar motivo» when classified without one (`EV:163`) | loading; failed «No pudimos cargar los desvíos.»; empty «No hay desvíos este día.» (`EV:156`, `EV:165`) |
| E8 | «Ver otros días» | `OtherDayPanel` `EV:168-173` | date field «Día» with hint «Elegí un día para ver sus marcas.»; «Volver a hoy» once a date is chosen (`EV:171`) | disabled while a mark is in flight |

Whole-screen states: loading «Cargando tu día…» (`EA:283`); load failed, panel «No pudimos cargar tu día» + «Reintentar» (`EA:284`) with plain-language causes (`EM:29-34`).

Deviation type names shown to the employee (`ED:152-155`): «Faltó la entrada», «Llegada tarde», «Salida temprana», «Salida tarde», «Faltó la salida», «Desayuno largo», «Almuerzo largo», «Fuera del local». Each has a sentence built from the day (`ED:171-207`), for example «Llegaste 12 minutos tarde (tu entrada era 09:00).».

## 1.4 `ADMIN`: seven sections in one shell (`AA:84-111`)

Start section: «Primeros pasos» while a setup step is missing, «Bandeja» otherwise (`AA:45`); «Preparando tu panel…» until that is known (`AA:98`).

### A1. Primeros pasos (`FirstStepsRender` `FS:10-29`; data `SS:27-126`)

| Panel | Content | States |
|---|---|---|
| Heading | eyebrow «PARA EMPEZAR», «Primeros pasos», «Seguí estos pasos en orden. Cuando estén todos listos, tu equipo ya puede marcar.» (`FS:17`) | — |
| «{n} de 5 pasos listos» | five rows: «1. Tu local», «2. Tus horarios», «3. Tu equipo», «4. Cada uno con su horario», «5. Días de trabajo cargados» (`SS:98`, `:104`, `:110`, `:114`, `:121`), each with an explanation, an optional detail («Falta dónde queda: …», «Falta en: …», «Falta para: …»), a chip «Listo» / «Falta» / «Revisalo» (`FS:24`) and a button «Ir» (`FS:25`) | loading «Revisando qué falta…» (`FS:20`); error + «Reintentar» (`FS:18`); all done «Listo: mañana pueden marcar {n} personas. Volvé cada mes a cargar los días.» (`FS:5-6`) |

### A2. Bandeja (`AdminInbox` `AV:89-177` → `AdminInboxRender` `AVR:60-125`)

| Panel / flow | Content | States |
|---|---|---|
| Heading | eyebrow «CENTRO DE CONTROL», «Bandeja de desvíos», «Revisá motivos y resolvé cada caso. Las notificaciones no incluyen datos privados.», button «Actualizar» (`AVR:81`) | «Actualizando…» |
| Page messages | error, success «Clasificación guardada.» (`AV:155`), zones failed (`AVR:84`), «Abriste el desvío indicado por la notificación.» (`AVR:85`; unreachable today, see P-13) | — |
| Coverage notice | `CoverageNoticeRender` `FS:35-40`: «Mañana nadie tiene día cargado en {locales}: cargalos para que puedan marcar.» (error) or «Hay días cargados hasta el {día}.» (info), button «Cargar días» (`SS:153`, `SS:158`, `AA:101`) | absent when no local has people with a schedule |
| Filters | «Empleado», «Sede», «Desde», «Hasta», «Aplicar», «Limpiar» (`AVR:73-77`); at 520 px or less folded under «Filtros: todos» / «Filtros: {resumen}» (`AVR:57`, `AVR:87`) | range errors (`shared/dateRange.ts:22-29`) |
| «Casos recientes» | one card per deviation (`AVR:105-124`): symbol, type name, status chip, «{persona} · {fecha y hora}», «Marca: {tipo}», «Motivo: {categoría} · {texto}»; actions «Ver jornada», «Justificado», «No justificado», or «Corregir a no justificado» / «Corregir a justificado» | loading «Cargando desvíos…»; empty «No hay desvíos para mostrar.» / «Ningún desvío coincide con los filtros aplicados.» (`AVR:103-104`); load failed + «Reintentar»; «Cargar anteriores» (`AVR:92`) |
| Inline: correct a classification | «Motivo de corrección», «Guardar corrección», «Cancelar» (`AVR:119-122`) | «Guardando…» |

Type names (`AVR:471`): «Sin ingreso», «Llegada tarde», «Egreso temprano», «Egreso tardío», «Egreso sin marcar», «Exceso de desayuno», «Exceso de almuerzo», «Fuera de sede». Status chips (`AVR:472`): «Falta motivo», «A revisar», «Justificado», «No justificado».

### A3. Jornadas (`JourneysView` `AV:744-948` → `JourneysViewRender` `AVR:274-373`)

Order on screen: heading → messages → coverage notice → «Cargar días de trabajo» → «Cargar o cambiar un solo día» → «Jornadas del {fecha}» → detail.

| Panel / flow | Content | States |
|---|---|---|
| Heading | eyebrow «DÍAS DE TRABAJO», «Jornadas», «Cargá los días que trabaja cada persona y revisá sus marcas. Cada día sigue el calendario de su local.» (`AVR:305`) | dependency error + «Reintentar datos de la jornada» (`AVR:307`) |
| Coverage notice | same as Bandeja; the button scrolls to the form (`AA:70-74`, `AA:103`) | — |
| «Cargar días de trabajo» | `WorkDaysFormRender` `WDF:41-88`: «Local»; «¿Qué días trabajan?» with «Lunes a viernes», «Lunes a sábado», «Todos» and seven checkboxes; «¿Para qué período?» with «Esta semana», «Próximas 2 semanas», «Lo que queda del mes», «Mes que viene», «Elegir fechas» (+ «Primer día», «Último día»); «¿Quiénes? (n de m)» with «Seleccionar todos»; fold «Usar otro horario para todos»; preview «Vas a cargar 22 días (lunes a sábado, del 10 al 30 de noviembre) para 4 personas.» (`features/admin/workDays.ts:134`); «Se cargan una sola vez. Para el mes siguiente, volvé a esta pantalla.» (`WDF:17`); «Cargar días» | busy «Cargando…» (`WDF:73`); validation (`workDays.ts:137-155`); result «Se cargaron 88 días. No se cargaron 4:» with groups «Ya tenían día cargado», «Sin horario asignado» + «Asignar horario», «Con el horario desactivado» + «Revisar horarios» (`WDF:76-85`) |
| Fold «Cargar o cambiar un solo día» | «Local», «Empleado», «Día», «Horario» («El que tiene asignado»), «Cargar este día» (`AVR:310-322`) | own error and success «Día cargado.» (`AV:834`) |
| «Jornadas del martes, 10 de noviembre de 2026» | field «Fecha»; table «Empleado / Sede / Estado / Acciones» with «Ver marcas», or cards at 520 px or less; «Actualizar» (`AVR:323-333`) | loading; empty «No hay días cargados para esta fecha.»; no date «Elegí una fecha para ver los días cargados.» (`AV:929`); load failed |
| Detail «Marcas de {persona}» | «Horario asignado: {nombre} · tolerancia {n} min» (`AVR:337`); table «Marca / Hora / Registrada / Ubicación / Acciones» with «Corregir» and «Anular» per mark, or cards (`AVR:345-352`); location labels «Ubicación pendiente», «Ubicación recibida», «Sin ubicación», «Ubicación depurada», «No aplica» plus raw coordinates (`AVR:474`, `AVR:299`) | loading «Consultando marcas…» (`AVR:334`); no marks; cancelled «Jornada cancelada el … Motivo: …» (`AVR:339`); zone missing (`AVR:338`) |
| Inline: cancel the day | «Cancelar jornada» → «Motivo de cancelación» + hint, «Confirmar cancelación», «Volver» (`AVR:340-343`) | only for `NO_INGRESO` with no valid marks (`AVR:296`) |
| Inline: void a mark | «Motivo de anulación» + hint, «Confirmar anulación», «Volver» (`AVR:353-356`) | «Anulando…» |
| Inline: correct a mark | «Tipo de marca corregida», «Hora corregida ({local})», «Motivo de corrección de marca», «Guardar corrección de marca», «Cancelar» (`AVR:357-362`) | «Guardando…» |
| Inline: add a forgotten mark | «Agregar una marca que faltó», «¿Qué marca faltó?», «Hora ({local})», «¿Por qué la agregás?», «Agregar marca» (`AVR:363-369`) | hidden for a cancelled day |
| Fold «Historial de cambios» | «Ver historial» / «Ocultar historial»; entries such as «Marca corregida: Ingreso de … → Ingreso de …», «Desvío detectado: Sin ingreso», «Por {nombre}» / «Automático del sistema» (`AVR:376-421`) | loading; empty «Esta jornada no tiene cambios registrados.»; truncated «Se muestran los primeros {n} cambios de esta jornada.» (`AVR:383`) |

Mark type names for the ADMIN (`AVR:470`): «Ingreso», «Egreso», «Salida desayuno», «Vuelta desayuno», «Salida almuerzo», «Vuelta almuerzo».

### A4. Historial (`AdminHistory` `AV:179-216` → `AdminHistoryRender` `AVR:425-457`)

| Panel | Content | States |
|---|---|---|
| Heading | eyebrow «CONSULTA», «Historial», «Jornadas, marcas y desvíos de un empleado o una sede en un rango de fechas.» (`AVR:433`) | options failed + «Reintentar datos» (`AVR:434`) |
| Filters | «Empleado» («Todos»), «Sede» («Todas»), «Desde», «Hasta» (default: last 7 days, `AV:184`), «Buscar» (`AVR:435-442`) | «Elegí un empleado o una sede.» (`AV:199`); range errors |
| «Jornadas encontradas (n)» | read-only cards: date, person, local, state chip, list of marks, list of deviations with status and motive (`AVR:449-453`) | before searching «Elegí un empleado o una sede y un rango de fechas, y tocá Buscar.»; empty; loading «Consultando el historial…»; too much data (`AV:210`) |

### A5. Sedes (`SitesView` `AV:218-608` → `SitesViewRender` `AVR:127-235`)

| Panel / flow | Content | States |
|---|---|---|
| Heading | eyebrow «ORGANIZACIÓN», «Sedes», «Cada sede define su zona horaria y sus horarios.» (`AVR:159`) | page error; page success «Sede creada.» (`AV:588`), «Ubicación de la sede actualizada.» (`AV:549`) |
| «Sedes registradas» | per local: name, «Hora de {provincia}», «Ubicación cargada» / «Sin ubicación cargada», «Distancia permitida para marcar: {n} m»; «Cambiar ubicación», «Ver historial de ubicación» (`AVR:163-164`) | loading; empty «Todavía no hay sedes.»; load failed |
| Inline: change location | «¿Dónde queda el local?»: «Elegir en el mapa», «Capturar ubicación del dispositivo» / «Capturar otra ubicación» / «Cancelar búsqueda», «Quitar ubicación»; status line; «Latitud … · Longitud …»; «Revisar este punto en el mapa»; checkbox «Confirmo que este punto corresponde a la sede.»; fold «Escribir las coordenadas a mano»; «Distancia permitida para marcar (metros)»; «Guardar ubicación», «Cancelar» (`AVR:165-194`) | capture: searching, received, eight error kinds (`AVR:151-157`, `SL:37-113`) |
| Inline: map picker | `SiteMapPanel` `SMP:23-48`: «Buscá la dirección del local», «Buscar», results, «Tocá en el mapa la puerta del local.» / «Punto marcado. El círculo muestra los {n} m permitidos para marcar. Si no es la puerta, tocá de nuevo.», «Confirmar ubicación», «Cerrar mapa» | map loading «Cargando el mapa…»; searching; no results; search error (`AV:441-459`) |
| Inline: location history | «Historial de ubicación»: «Configuración inicial de ubicación» / «Ubicación y radio actualizados», «Por {nombre}», «Origen del punto: captura automática / carga manual», «Centro anterior: {lat}, {lon} · radio: {n} m» (`AVR:255-272`) | loading; empty «Esta sede todavía no tiene cambios de ubicación auditados.»; failed |
| «Agregar sede» | «Nombre de la sede», the same location block, radius, «Hora del local» (province list; «Otra (fuera de Argentina)» opens «Zona horaria de otro país», `features/admin/SiteZoneField.tsx:16-27`), «Crear sede» (`AVR:197-232`) | «Guardando…»; validations (`AV:555-578`) |

### A6. Horarios (`SchedulesView` `SV:34-153` → `SchedulesViewRender`, `ScheduleEditor`, `ScheduleAssignStep` in `SE`)

| Panel / flow | Content | States |
|---|---|---|
| Heading | eyebrow «CONFIGURACIÓN», «Horarios», «Armá los horarios de cada local: a qué hora entran, a qué hora salen y cuánto pueden tardar en desayunar y almorzar.» (`SE:143`) | success «Horario «{nombre}» creado.» / «… actualizado.» (`SV:86`, `SV:106`) |
| «Horarios de este local» | one card per schedule of the local chosen in the create form: name, chips («09:00–13:00», «desayuno hasta 15 min»), chip «Inactivo», «Cambiar horario» (`SE:146-158`) | loading; empty «Este local todavía no tiene horarios. Creá el primero.»; no local «Primero creá un local en Sedes.»; failed |
| Inline: change in place | the editor inside the card with «Los días que ya cargaste mantienen el horario anterior.» (`SE:9`), «Guardar cambios», «Cancelar» | field errors; server error |
| «Crear un horario» | «Local» (only with 2+ locals), «¿Cómo es este horario?» («Corrido», «Cortado», «De noche»), «Nombre del horario», «¿A qué hora entran y salen?» with «Tramo n», «Entra a las», «Sale a las», «Quitar este tramo», «Agregar otro tramo», «Minutos para desayunar», «Minutos para almorzar», «Así queda», «Crear horario» (`SE:43-94`) | legacy «Opciones avanzadas» (`SE:77-87`); «Revisá lo que está marcado debajo de cada campo.» (`SE:88`) |
| Step after saving | «¿Quién trabaja con este horario?»: checkboxes «Empleados de este local», «Desde el día», «Asignar», «Ahora no» / «Listo» (`SE:109-131`); replaces the create panel after creating, opens inside the card after changing (`SV:141-149`) | employees loading or failed; none «Este local todavía no tiene empleados activos. Los podés agregar en Empleados.»; per-person results (`SE:113-115`) |

### A7. Empleados (`EmployeesView` `AV:610-736` → `EmployeesViewRender` `EVR:29-112`, `TemplateAssignmentsRender` `EVR:115-133`)

| Panel / flow | Content | States |
|---|---|---|
| Heading | eyebrow «EQUIPO», «Empleados», «Cada persona entra con su DNI. Acá la das de alta, elegís en qué locales trabaja y qué horario tiene.» (`EVR:93`) | page error; page success «Empleado creado.», «Cambios del empleado guardados.», «Horario asignado.» (`AV:682`, `AV:694`, `AV:649`) |
| «Empleados (n)» | table «Nombre / DNI / Locales / Minutos de tolerancia / Estado / Acciones» (`EVR:58`) or cards at 520 px or less (`EVR:70-90`); per person «Editar», «Horarios», «Restablecer contraseña» (`EVR:51-53`) | loading; empty «No hay empleados cargados.»; failed |
| Inline: edit | name, locals, tolerance, «Activo», «Guardar», «Cancelar» inside the row or card (`EVR:62-66`, `EVR:74-79`) | «Guardando…» |
| Inline: «Horarios de {persona}» | «Elegí el horario y desde qué día lo usa. Si trabaja en varios locales, cada local tiene el suyo. Los días que ya cargaste no cambian.»; list «{horario} · {local} · desde {fecha}»; «Horario», «Desde el día», «Asignar horario»; «Cerrar» (`EVR:121-131`) | loading; empty «Todavía no tiene horarios asignados.»; failed |
| Inline: reset password | «Se cierran todas sus sesiones y se genera una contraseña provisoria.», «Confirmar restablecimiento», «Cancelar» (`EVR:48-50`) | inactive person: disabled with «Está inactivo: activalo para restablecer su contraseña.» (`EVR:54`) |
| «Contraseña provisoria de {persona}» | the password in large type, «Entregásela en persona; se pide cambiarla al ingresar.», «No se vuelve a mostrar. …», «Listo, ya la entregué» (`EVR:21-25`) | after a reset it opens above the list (`EVR:96`); after creating, between the list and the form (`EVR:98`) |
| «Dar de alta un empleado» | «Nombre y apellido», «DNI», «Minutos de tolerancia», «Contraseña provisoria» + «Generar contraseña», «Locales donde trabaja», «Crear empleado» (`EVR:99-110`) | no local «Primero creá un local en Sedes.»; no local ticked «Marcá al menos un local para crear el empleado.» (`EVR:107-109`) |

---

# 2. Per-screen diagnosis

Verdicts: **OK**, **Weak** (works, with friction) or **Poor** (likely to confuse or mislead). `P-nn` points to the problem list in section 6. Improvement options are options, not decisions; the ones that need the owner are repeated in section 7.

## D1. Login (`AS:13-40`)

- **Goal:** get in with DNI and password. **Who:** everyone; employees at most once a month (30-day session, D-20261109-02), ADMIN several times a day (30-minute session).
- **Essential information:** which two things to type; what went wrong; who to ask for a new password.
- **Primary action:** «Ingresar». **Secondary:** «Mostrar contraseña».

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | OK | «Ingresá con tu DNI y contraseña.» (`AS:29`). The eyebrow «INGRESO AL SISTEMA» and the footnote «Sistema interno de registro de Braja» (`AS:29`, `AS:39`) add nothing a person needs |
| Navegación | OK | one way forward; «¿Te olvidaste la clave? Pedile al encargado una nueva.» (`AS:38`) says what to do when stuck |
| Jerarquía | OK | brand, title, two fields, one wide primary button |
| Terminología | Weak | «contraseña» in the label and the toggle, «clave» in the help line of the same card (`AS:34-35` vs `AS:38`). «Bienvenido» is masculine only (`AS:29`). «Ingresar» here means signing in; for the ADMIN «Ingreso» is also the name of the clock-in mark (`AVR:470`) |
| Acciones | OK | one primary; the toggle keeps the same text when pressed («Mostrar contraseña», `AS:35`), so its state is visible only as `aria-pressed` |
| Feedback | OK | «Entrando, esperá un momento…» and «Ingresando…» (`AS:31`, `AS:36`) |
| Errores | Weak | server errors are specific (`CL:72`, `CL:84`). Empty or short fields fall to the browser's own bubbles, because this form has no `noValidate` (`AS:32`) while the next screen validates by hand (`AS:88`): two styles of error in two consecutive screens (P-11) |
| Accesibilidad | OK (structure) | labels tied by `FormField` (`UI:75-92`), error as `role="alert"` (`UI:13`), `inputMode="numeric"` on the DNI (`AS:33`). Contrast and target sizes belong to T4 |
| Responsive | OK | card `min(100%, 436px)` (`CSS:60`), tighter under 520 px (`CSS:386-392`) |
| Consistencia | Weak | P-11 and the clave/contraseña mix |

- **Redundant:** eyebrow, footnote.
- **Options:** (a) one word for the credential on every screen; (b) the toggle text follows its state («Mostrar» / «Ocultar»); (c) own validation messages like the next screen; (d) a neutral greeting.

## D2. Forced password change (`AS:66-97`)

- **Goal:** replace the password someone handed over with one's own. **Who:** every employee on day one and after each reset by the ADMIN; the first ADMIN.
- **Essential information:** the rule for the new password, and that the first field is the one they were given.
- **Primary:** «Guardar contraseña». **Secondary:** «Mostrar contraseñas», «Cerrar sesión».

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | Weak | the eyebrow says «PRIMER INGRESO» (`AS:85`) also after an ADMIN reset or a mid-session 403 (`SES:46-48`), when it is not the first time |
| Navegación | OK | forward, or «Cerrar sesión» |
| Jerarquía | OK | rule in bold above the form (`AS:85`), counter under the new password (`AS:90`) |
| Terminología | Weak | «contraseña» in title and labels, «clave» in the rule and in two errors: «Elegí una clave de al menos 12 letras o números.», «La clave nueva tiene que tener…», «La clave es demasiado larga…» (`shared/password.ts:10-12`) |
| Acciones | Poor | the person has just typed the provisional password on the login and must type it again in «Contraseña que te dieron» (`AS:89`). The provisional password is 19 characters with dashes (`features/admin/temporaryPassword.ts:22`). With the new one twice (12 or more each, `AS:90-91`) the first sign-in is five fields and at least 70 keystrokes on a phone (P-09) |
| Feedback | OK | live counter «Llevás 7 de 12.» (`AS:63`); busy text (`AS:87`) |
| Errores | OK | each case in plain words (`AS:75-78`); shown at the top of the card, not next to the field |
| Accesibilidad | OK (structure) | one alert region; `autoComplete` set per field (`AS:89-91`) |
| Responsive | OK | phone padding tuned so the button fits (`CSS:386-392`) |
| Consistencia | Weak | terminology; the message «Tenés que cambiar tu contraseña provisoria antes de continuar.» calls it «provisoria» (`CL:76`) while this screen says «la que te dieron» |

- **Redundant:** typing the provisional password a second time.
- **Options:** (a) keep the password typed at login in memory for this one transition and send it as `currentPassword`, showing only the two new fields (frontend only, memory only, so rule 27 holds; needs a security read in T12); (b) eyebrow that matches the cause; (c) one word; (d) shorter provisional password or shorter minimum: owner decision and backend (section 7, O-5).

## D3. Company chooser (`AS:42-60`)

- **Goal:** pick which company to work in. **Who:** only accounts in several companies.
- **Primary:** tap a company. **Secondary:** «Cerrar sesión».

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | OK | «Elegí una empresa» + «Solo aparecen las empresas donde tenés acceso.» (`AS:51`) |
| Navegación | OK | one tap; inside the app the switcher changes it later (`UI:63`) |
| Jerarquía | OK | list of large rows |
| Terminología | Weak | eyebrow «CUENTA COMPARTIDA» (`AS:51`) is system language; the role reads «Administración» or «Empleado» (`AS:55`); «Esperando la activación de {empresa}…» (`AS:53`) |
| Acciones | OK | whole row is the button |
| Feedback | OK | «…» on the chosen row and a status line (`AS:53-55`) |
| Errores | OK | zero companies explained (`AS:57`), though it says «un administrador» where the rest of the employee copy says «tu encargado» |
| Accesibilidad | OK (structure) | buttons; decorative glyphs hidden (`AS:55`) |
| Responsive | OK | same card as login |
| Consistencia | Weak | encargado / administrador (glossary) |

- **Options:** drop the eyebrow; «Abriendo {empresa}…»; one word for the person in charge.

## D4. Employee day (`EA:273-295`, `EV`)

- **Goal:** mark the next thing and know it was accepted. **Who:** every employee, several times a day, on a small phone, often in a hurry.
- **Essential information:** what state my day is in; what I can mark now; whether the last mark arrived; whether I owe an explanation.
- **Primary action:** the suggested mark. **Secondary:** other pauses, exit, explain, look at another day.

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | OK | greeting plus one sentence of state (`ED:107-129`) directly above the action |
| Navegación | Weak | one screen, no menu: good. But the other-day view keeps the mark buttons live (`EA:135`, `EA:286` have no check on `date`) and the only way back, «Volver a hoy», is at the very bottom (`EV:171`) (P-05). «Corregir motivo» in the last-but-one panel opens its form in the panel above with no scroll or focus (`EA:257-261`, `EA:267`, order at `EA:289-292`) (P-02) |
| Jerarquía | Weak | the order is right for marking (phase 1). Below it, on a normal day, two empty panels («No tenés nada para explicar.», «No hay desvíos este día.», `EV:115`, `EV:165`) sit between the marks and «Ver otros días». When there is something to explain, the form is the third panel down, under the list of marks (P-17) |
| Terminología | Weak | the day is «turno» (`ED:108`, `EV:36`), «día» (`ED:112-113`) and, in the chip, a state from the ADMIN vocabulary: «Sin ingreso» next to «Todavía no marcaste tu entrada.» (`shared/format.ts:4` at `EV:79`). The panel title «Desvíos del día» (`EV:156`) is the only place the employee meets «desvíos». «Para explicar», «Falta explicar», «Tu explicación» alternate with «Enviar motivo», «Corregir motivo», «¿Qué tipo de motivo es?» (`EV:109`, `:26`, `:161`, `:145`, `:162`, `:132`). The chip «A revisar» (`EV:26`) does not say who reviews |
| Acciones | OK / Weak | one large primary, pauses smaller, exit apart (`ED:88-97`). The form buttons «Enviar motivo» / «Guardar corrección» are `button-small` (`EV:145`) although they are the primary action of that card |
| Feedback | OK | success only after the server answers (`EA:177-179`), with action and server time (`ED:133`), focus moved to it (`EA:201`, `EA:70`); location reported separately (`ED:145-150`); an unknown result says so and the retry reuses the key (`EM:7`, `EA:171`). This satisfies S8 «nunca indicar que una marca fue registrada si el servidor todavía no confirmó» |
| Errores | Weak | messages are plain and say what to do (`EM:9-17`). Prevention gaps: «Marcar entrada» is offered hours before it is allowed and the rule only appears after tapping («Todavía es temprano para marcar. …», `CL:46`) (P-29); the missing-location warning is delivered inside a green success message (`EV:49-52`, `ED:149`) because `PageMessage` has no warning kind (`UI:9`) (P-24) |
| Accesibilidad | OK (structure) | live regions, focus management, radios in a fieldset (`EV:131-139`); to be measured by T4 |
| Responsive | OK | built phone-first in phase 1 (`CSS:302-340`) |
| Consistencia | Weak | names of marks and deviations differ from the ADMIN's for the same facts (P-03); the location step says «necesitamos saber que estás en el local» (`locationNotice.ts:7`) although location never blocks a mark (CLAUDE.md rule 2) (P-24); the date-time of a pending item is drawn as a status chip (`EV:129`) |

- **Redundant:** a pending deviation of the day appears twice, as a form in «Para explicar» and as a card with «Falta explicar» in «Desvíos del día»; the state appears as sentence and as chip; «Tenés {n} minutos de tolerancia para entrar.» (`EV:82`) repeats every day and covers only the entry, while the tolerance also applies to the exit (D-20261016-03).
- **Options:** (a) one section for explanations and their status, shown only when there is something in it, placed right under the mark feedback when something is pending; (b) on another day, carry the date in the button («Marcar salida del lunes 9») or hide the panel for future days, and repeat «Volver a hoy» next to the sentence; (c) a line under the state sentence with the earliest time to mark the entry, computed from the schedule the screen already has (`ED:52-55`); (d) a warning style for «No llegó tu ubicación»; (e) the same names as the ADMIN (glossary); (f) reword the location step so it does not read as a condition.

## D5. ADMIN shell and chrome (`AA:84-111`, `UI:29-69`, `APC`)

- **Goal:** know where I am and move between tasks. **Who:** the owner, daily (review) and monthly (planning), on a phone or a desktop.

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | Weak | the menu is a list of things («Sedes», «Horarios», «Empleados», «Jornadas») plus two metaphors («Bandeja», «Historial») (`AA:16-19`). Nothing says "what do I do today" |
| Navegación | Poor | no URL per section (`AA:27`): the browser Back button leaves the app, a reload returns to the start section, a section cannot be bookmarked or linked from a notification (P-06, P-13). On a phone the seven items wrap into rows that scroll away (`CSS:401-402`), so after scrolling a long page the menu is out of reach; from 521 to 760 px they sit in one sideways-scrolling row (`CSS:368-370`). The two group captions that separate daily work from configuration are hidden at 760 px or less (`CSS:369`). «Primeros pasos» changes position, first or last, depending on the setup state (`AA:91`, `AA:95`) |
| Jerarquía | Weak | all seven items weigh the same; the alerts bar is permanently fixed over the content (`CSS:342`) and reserves 90 to 124 px at the bottom of every page (`CSS:18`, `CSS:359`) for a setting changed once (P-07) |
| Terminología | Weak | menu «Bandeja» vs page «Bandeja de desvíos» vs panel «Casos recientes» (`AA:16`, `AVR:81`, `AVR:88`); menu «Sedes» while forms and messages say «local» (`EVR:107`, `SE:148`, `SS:98`); alerts are «alertas», «avisos», «avisos push» and «notificaciones» (`APC:154`, `APC:162`, `InstallControl.tsx:29`, `AVR:81`) |
| Acciones | OK | each item is a button with `aria-current` (`AA:80`) |
| Feedback | Weak | no count of what is waiting in the Bandeja (the dot style exists unused, `CSS:173`); «Preparando tu panel…» while the start section is decided (`AA:98`) |
| Errores | Weak | when the session expires (30 minutes idle for an ADMIN, D-20261109-02) the whole app is replaced by the login (`APP:19`, `SES:41-44`) and any half-filled form is gone (P-22) |
| Accesibilidad | Weak | `nav` is labelled (`AA:90`); icons are text glyphs hidden from assistive tech (`AA:81`). Changing section moves neither focus nor the document title (`AA:58-63`). T4 measures the rest |
| Responsive | Weak | see Navegación. The update banner and the alerts bar are both fixed at the bottom; at 520 px or less the bar spans the width at `bottom: 9px` (`CSS:413`) and the banner sits centred at `bottom: 16px` with a higher `z-index` (`CSS:444`): by geometry they overlap (confirm on T3 screenshots) |
| Consistencia | Weak | each page has an eyebrow from a third classification that contradicts the menu groups: «CENTRO DE CONTROL», «DÍAS DE TRABAJO», «CONSULTA», «ORGANIZACIÓN» (Sedes), «CONFIGURACIÓN» (Horarios only), «EQUIPO», «PARA EMPEZAR» (`AVR:81`, `:305`, `:433`, `:159`, `SE:143`, `EVR:93`, `FS:17`) (P-23) |

- **Redundant:** with two or more companies the active company shows twice, in the switcher and in the pill (`UI:34`, `UI:63`); «Conexión protegida» (`AA:96`); the eyebrows.
- **Options:** section 5.

## D6. Primeros pasos (`FS:10-29`, `SS:83-126`)

- **Goal:** get a new shop from empty to "people can mark tomorrow". **Who:** the owner, once; then it returns whenever the next 8 days have no day loaded for a local (`SS:88-92`).

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | OK | «Seguí estos pasos en orden. Cuando estén todos listos, tu equipo ya puede marcar.» (`FS:17`) |
| Navegación | Weak | each «Ir» jumps to a section (`FS:25`) and nothing in that section leads back or to the next step; the owner returns through the menu, five round trips. Steps 3 and 4 both lead to «Empleados» (`SS:111`, `SS:118`); step 5 is called «Días de trabajo cargados» and leads to a menu item called «Jornadas» (`SS:121-124`) |
| Jerarquía | OK | numbered list, next step's button is the primary one (`FS:25`) |
| Terminología | Weak | «Tu local» → menu «Sedes»; «Días de trabajo» → «Jornadas». Once setup is complete the same page, still titled «Primeros pasos / PARA EMPEZAR», is where a missing month shows up |
| Acciones | Weak | five buttons that all read «Ir» (the full name is only in `aria-label`, `FS:25`). The order schedule (2) before team (3) defeats the shortcut built in phase 1: after creating a schedule the step «¿Quién trabaja con este horario?» finds nobody («Este local todavía no tiene empleados activos.», `SE:117`), so every person is later given a schedule one by one in step 4 |
| Feedback | OK | «{n} de 5 pasos listos», chips «Listo» / «Falta» / «Revisalo», names of what is missing (`SS:100`, `:106`, `:116`) |
| Errores | OK | load error with «Reintentar» (`FS:18`) |
| Accesibilidad | OK (structure) | ordered list with label (`FS:21`) |
| Responsive | OK | rows wrap (`CSS:458-460`) |
| Consistencia | Weak | the step state reuses the deviation colours by class name (`status-justificado`, `status-motivo_pendiente`, `FS:24`); the number shows twice on a pending row, in the badge and in «1. Tu local» (`FS:22-23`) |

- **Options:** (a) team before schedules, so one assignment step covers everyone and step 4 completes by itself; (b) buttons that name the destination («Cargar el local», «Armar horarios»…); (c) after finishing a step in its section, a line that leads to the next one; (d) once complete, the monthly reminder lives with the planning task, not under «Primeros pasos»; (e) activating alerts on this device listed as an optional last item (it is in no step today).

## D7. Bandeja (`AV:89-177`, `AVR:60-125`)

- **Goal:** see what went off schedule, read the explanation, decide if it is justified. **Who:** the owner, daily; it is also where a push notification is supposed to lead.
- **Essential information:** who, where, what happened, by how much, what the person said, what is still undecided.
- **Primary action:** decide (justified or not). **Secondary:** open the day, filter, correct an earlier decision.

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | Weak | «Revisá motivos y resolvé cada caso.» is clear; the second sentence, «Las notificaciones no incluyen datos privados.» (`AVR:81`), is a privacy note about another feature. Three nouns for the same object: «desvíos», «casos», and the chip states |
| Navegación | Weak | «Ver jornada» moves to the Jornadas section (`AA:64-69`); the inbox unmounts and on return it reloads from the first page without filters (`AV:129`) and there is no way back to the same card (P-30) |
| Jerarquía | Poor | decided and undecided items share one list ordered by time of the fact (D-20261027-03); nothing separates "waiting for me" from "done". The list never empties, so the owner cannot tell when the review is finished (P-04). The info variant of the coverage notice («Hay días cargados hasta el …» + «Cargar días») sits above the list on every visit (`SS:158`, `AA:101`) (P-25) |
| Terminología | Weak | type names in system voice («Sin ingreso», «Egreso tardío», «Exceso de desayuno», «Fuera de sede», `AVR:471`) while the employee reads «Faltó la entrada», «Salida tarde», «Desayuno largo», «Fuera del local» (`ED:152-155`) for the same record (P-03). «Marca: Ingreso» (`AVR:109`). «Corregir a no justificado», «Motivo de corrección» (`AVR:114`, `AVR:120`) where «motivo» is also the employee's explanation two lines above (`AVR:110`) |
| Acciones | Poor | the decision buttons read like states: «Justificado» / «No justificado» (`AVR:116-117`) are the same words as the chips (`AVR:472`). One tap decides, with no undo; changing it afterwards requires writing a reason (`AV:158-162`, `AVR:119-121`). Both small buttons sit side by side and both turn to «Guardando…» at once (`AVR:116-117`). The same two buttons are offered when the person has not explained yet (chip «Falta motivo»), and nothing says that a later explanation will erase the decision (D-20261027-02) (P-31) |
| Feedback | Weak | success is one generic line at the top of the page, «Clasificación guardada.» (`AV:155`, `AVR:83`), which can be off screen when the card is far down the list (P-02); on the card only the chip and the buttons change |
| Errores | Weak | load failure and empty are told apart (`AVR:88`, `AVR:104`). A failed zone lookup prints «No se pudieron cargar las zonas horarias de las sedes: … Las horas se muestran en la zona horaria de este dispositivo.» (`AVR:84`) |
| Accesibilidad | OK (structure) | «Ver jornada de {persona}» as accessible name (`AVR:113`); the decision buttons carry no person in their name |
| Responsive | OK | filters fold into one line on phones (`AVR:87`); cards wrap (`CSS:382-383`) |
| Consistencia | Weak | the card shows person and time but not the local (`AVR:108`), although SPEC:113 says each case identifies «al empleado y la sede»; it shows the time but not the size of the deviation, which the employee side does compute («Llegaste 12 minutos tarde…», `ED:180-183`). The symbol is «!» for one type and «↗» for all others (`AVR:106`) |

- **Redundant:** the notifications sentence; the eyebrow; the symbol.
- **Options:** (a) two groups, «Para revisar» first and «Ya revisados» folded, built from the loaded page, or a pending-only request through `GET /deviations?status=…`, which already accepts a status and returns the person's name (`openapi.yaml:1059-1100`, `backend/.../deviations/DeviationService.java:29`) but has a 200-row cap and no employee filter; a status filter on `/inbox` itself is a contract change (O-3); (b) verbs on the buttons and the result named on the card («Quedó como justificado»); (c) the local on the card; (d) the decision confirmation next to the card; (e) a visible note on items still without explanation; (f) open the day in place (an expandable area under the card, reusing the detail) so the list is not lost.

## D8. Jornadas, part 1: loading days of work (`WDF`, `WDP`, `AVR:310-322`)

- **Goal:** tell the system which days each person works, about once a month; add or replace a single day as an exception.
- **Primary action:** «Cargar días». **Secondary:** another schedule for all; a single day.

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | OK | «Elegí el local, qué días trabajan y para qué período. Cada persona usa el horario que tiene asignado.» (`WDF:42`), a live sentence of what will be loaded (`workDays.ts:134`) |
| Navegación | Weak | reached through a menu item named «Jornadas»; the monthly task and the daily review share one page (P-01) |
| Jerarquía | Weak | good inside the form. On the page, this occasional form comes first and the daily list comes after it and after a second, folded form (`AVR:308-333`) |
| Terminología | Weak | «Cargar» is the action, and its busy label «Cargando…» (`WDF:73`) is the same word the app uses for fetching (`UI:16`); the fold «Cargar o cambiar un solo día» (`AVR:311`) cannot change a day: a loaded day answers «Esa persona ya tiene ese día cargado en ese local.» (`CL:53`), and the hint describes a three-step detour, «abrilo en la lista de abajo, cancelalo y cargalo de nuevo» (`AVR:312`) (P-19) |
| Acciones | OK | sensible defaults: Monday to Saturday, rest of the month, everyone (`WDP:18-22`); two taps for the common case |
| Feedback | OK | result grouped by reason with the next action on each group (`WDF:76-85`) |
| Errores | OK | each validation in plain words (`workDays.ts:137-155`); batch rejections explained (`features/admin/bulkDeclaration.ts:27-36`) |
| Accesibilidad | OK (structure) | fieldsets with legends, pressed state on quick choices (`WDF:46`, `WDF:51`) |
| Responsive | OK | wraps; long on a phone (about seven groups before the button) |
| Consistencia | Weak | quick-choice buttons use `aria-pressed` on `button-quiet`; the schedule type cards use another pattern for the same idea (`SE:50`) |

- **Options:** (a) its own destination, apart from the daily review (section 5); (b) the single day described as «Agregar un día suelto»; (c) busy label «Guardando…».

## D9. Jornadas, part 2: the day list and the detail (`AVR:323-371`)

- **Goal:** see who came today, fix a mark, add one that was forgotten, cancel a day that should not exist, read what was changed. **Who:** the owner, daily or when someone reports a mistake.
- **Essential information:** date, local, person, state, schedule of that day, marks with their times, deviations of that day.
- **Primary action:** open a person's day. **Secondary:** correct, void, add, cancel, history.

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | Weak | the list title «Jornadas del martes, 10 de noviembre de 2026» (`AVR:41-47`) is clear; the page subtitle covers two tasks |
| Navegación | Poor | the list is below two forms (P-01). «Ver marcas» loads the detail in a panel under the whole list (`AVR:334-335`) and the page does not scroll to it: scrolling happens only when arriving from a deviation (`AV:815-825`), not from the list (`AV:946`, `AV:842-854`). With more rows than fit on screen the tap appears to do nothing. Only a date field moves between days (`AVR:324`); no previous or next day |
| Jerarquía | Weak | the detail starts with «Horario asignado: {nombre} · tolerancia {n} min» (`AVR:337`) and has no date, local, state or schedule hours, so marks cannot be compared with the schedule on this screen, and the deviations of that day are not listed (P-18). The form to add a forgotten mark is always open at the bottom (`AVR:363`) |
| Terminología | Weak | «Ingreso / Egreso / Salida desayuno» (`AVR:470`) vs the employee's «Entrada / Salida / Salida a desayunar» (`ED:9-12`); columns «Hora» and «Registrada» (`AVR:350`) with no explanation of the difference; «Ubicación depurada», «No aplica» (`AVR:474`); raw coordinates «-34.60000, -58.40000» (`AVR:299`); «Horario asignado» for what is the schedule frozen in that day; «Marca olvidada incorporada», «Automático del sistema», «Por una persona sin nombre registrado» (`AVR:403`, `AVR:386`) (P-10) |
| Acciones | Weak | «Cancelar jornada» (the domain action, `AVR:343`) lives in the same panel as form buttons «Cancelar» that only close a form (`AVR:361`), while the forms that confirm a cancellation or a void use «Volver» to back out (`AVR:342`, `AVR:355`) (P-12). «Corregir» and «Anular» open their forms under the table, not at the row (`AVR:353-362`). The time fields are `datetime-local` and start empty (`AV:757`), so the owner picks a date that the screen already knows |
| Feedback | OK | messages render inside the detail once it is open (`AVR:336`): «Marca agregada.», «Marca corregida.», «Marca anulada.», «Jornada cancelada.» (`AV:867`, `:883`, `:894`, `:915`) |
| Errores | Weak | specific where it matters (`AV:38-41`, `AV:902-904`); «Esa hora no existe en la zona horaria de la sede.» (`AV:862`); «No se pudo cargar la zona horaria de la sede. Reintentá los datos de la jornada antes de incorporar o corregir marcas.» (`AVR:338`). The history's truncation note says «Se muestran los primeros {n} cambios» (`AVR:383`) while the server keeps the **newest** 500 (D-20261102-09) (P-26) |
| Accesibilidad | OK (structure) | buttons named with mark and time (`AVR:300`); forms labelled (`AVR:353`, `AVR:357`) |
| Responsive | OK | cards instead of tables at 520 px or less (`AVR:325-331`, `AVR:345-349`) |
| Consistencia | Weak | two registers in one panel: «Tipo de marca corregida», «Motivo de corrección de marca», «Guardar corrección de marca» (`AVR:358-361`) next to «¿Qué marca faltó?», «¿Por qué la agregás?» (`AVR:365-367`). A voided mark has class names with no style (`mark-voided`, `AVR:345`, `AVR:351`); only the strikethrough marks it |

- **Redundant:** «Registrada» for marks made by the employee (equal to «Hora»); coordinates as numbers.
- **Options:** (a) this list as the daily home of the ADMIN (section 5), with previous and next day; (b) the detail opens at the row, or the page scrolls and focuses it; (c) a header in the detail with date, local, state and the tramos; (d) correct, void and add forms at the row, with the date prefilled from the day; (e) «Cancelar este día» and one abort word everywhere; (f) location as words plus a map link like the one Sedes already has (`AVR:251-253`); (g) truncation text corrected.

## D10. Historial (`AVR:425-457`)

- **Goal:** look back at a person or a local over a period. **Who:** the owner, occasionally (a dispute, the end of the month).

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | OK | the subtitle says what it lists (`AVR:433`) |
| Navegación | Poor | read-only dead end: a card has no action, so a problem seen here is fixed by going to «Jornadas», choosing the date and finding the person again. The day list of Jornadas is this same query with one date and fewer fields (`AV:786` vs `AV:204`) (P-08) |
| Jerarquía | OK | date, person, local, state; then marks; then deviations |
| Terminología | Weak | «Historial» also names the change log of a day and of a local (`AVR:380`, `AVR:164`) (P-19). A card can show the chip «Sin ingreso» (state of the day, `shared/format.ts:4`) and a deviation called «Sin ingreso» (`AVR:471`) one under the other (`AVR:450`, `AVR:452`) |
| Acciones | Weak | nothing loads until «Buscar»; the form's own default («Todos» + «Todas») is the one combination it rejects («Elegí un empleado o una sede.», `AV:199`), even with a single local |
| Feedback | OK | count in the title (`AVR:443`); loading and empty states (`AVR:444`) |
| Errores | OK | the 422 is explained with its limits (`AV:210`) |
| Accesibilidad | OK (structure) | each card labelled with date and person (`AVR:449`) |
| Responsive | OK | cards and wrapping lists |
| Consistencia | Weak | marks and deviations are listed with the same list style; the status chip sits in the middle of a deviation line (`AVR:452`) |

- **Options:** (a) merge with the day list: one view of days with a date or a period, each day opening the same detail; (b) if kept apart, preselect the only local and add «Ver marcas» on each card.

## D11. Sedes (`AVR:127-272`, `SMP`)

- **Goal:** tell the system where each shop is and how far from it a mark still counts. **Who:** the owner, at setup and rarely after.

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | Weak | the subtitle «Cada sede define su zona horaria y sus horarios.» (`AVR:159`) leaves out the location, which is the main thing done here, and leads with «zona horaria» |
| Navegación | OK | list and form side by side on a desktop, stacked on a phone (`CSS:185`, `CSS:352`) |
| Jerarquía | Weak | the create form has three primary-styled buttons: «Elegir en el mapa», «Confirmar ubicación» inside the map, and «Crear sede» (`AVR:202`, `SMP:45`, `AVR:231`) (P-20) |
| Terminología | Weak | menu and title «Sedes», questions «¿Dónde queda el local?»; the place is «ubicación», «punto», «centro» and «coordenadas» («crear la sede sin centro», `SL:37`; «Podés dejar el centro vacío.», `AV:331`; «Centro anterior: … · radio:», `AVR:267`); «radio» in the history vs «Distancia permitida para marcar» in the form (`AVR:14`); «Hora de Buenos Aires y CABA» (`AVR:163`); coordinates printed to seven decimals (`AVR:177`, `AVR:212`); error titles «Geolocalización no disponible», «Precisión insuficiente», «Conexión no segura» and texts with «origen HTTP», «HTTPS (o localhost durante desarrollo)», «contexto seguro» (`AVR:151-157`, `SL:37`, `SL:105`) (P-10) |
| Acciones | Weak | the map flow is good (search, tap the door, confirm). After «Confirmar ubicación» the form still shows a ticked checkbox «Confirmo que este punto corresponde a la sede.» (`AVR:217-219`), a second confirmation for a point just confirmed. A local cannot be renamed or removed and its hour cannot be changed after creation: the API offers only create and change location (`openapi.yaml:241-340`), and the screen does not say so |
| Feedback | Weak | «Sede creada.» and «Ubicación de la sede actualizada.» render at the top of the page (`AVR:160-161`) while the forms are in the list or, on a phone, below it (P-02) |
| Errores | Weak | validation errors («Ingresá latitud y longitud juntas…», `AV:521`, `AV:561`) also go to the top of the page. Nothing explains the consequences: without a location marks are not compared with the shop (SPEC:84); a change reaches the days not yet started from today (D-20261102-01) |
| Accesibilidad | Weak | the map is a `role="application"` region with a label (`SiteMapPicker.tsx:56`); picking a point needs a pointer, with the address search and the folded manual fields as alternatives. T4 to judge |
| Responsive | OK | map height computed to keep search and confirm on screen (`CSS:88`, `CSS:95`) |
| Consistencia | Weak | create and change-location blocks are near copies with separate state (`AVR:166-191` vs `AVR:199-228`) and slightly different hints (`AVR:174` vs `AVR:207`) |

- **Redundant:** coordinates line; the link «Revisar este punto en el mapa» that opens another site in a new tab (`AVR:178`, `AVR:213`) once the in-app map exists; the checkbox for map points.
- **Options:** (a) title «Locales»; (b) one location component for create and change; (c) the map's confirm as the only confirmation for a map point, and one primary per step; (d) coordinates and manual entry behind the existing fold; (e) results next to the form; (f) one line on what happens without a location and when a change applies.

## D12. Horarios (`SE`, `SV`)

- **Goal:** describe the shop's schedules and say who works with each. **Who:** the owner, at setup and when a schedule changes.

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | OK | subtitle in plain words (`SE:143`) |
| Navegación | Weak | with two or more locals, the list «Horarios de este local» follows the field «Local» that lives inside the create form (`SV:70`, `SE:45-47`); when the create panel is replaced by the assignment step (`SV:146`) the selector is gone and the list cannot be switched (P-21) |
| Jerarquía | OK | list and form; preview «Así queda» before saving (`SE:74-76`) |
| Terminología | OK / Weak | «Entra a las», «Sale a las», «Minutos para desayunar» are plain. «Tramo» is shown even for a schedule with a single one («Tramo 1», «1 de 4 tramos», `SE:58`, `SE:62`) |
| Acciones | OK | three starting types fill sensible times (`features/admin/scheduleTramos.ts:16-18`); after saving, assignment in the same place (`SE:109`) |
| Feedback | OK | «Horario «Mañana» creado.» (`SV:86`), per-person assignment results (`SE:113-115`) |
| Errores | OK | each error under its field (`SE:63-64`), summary «Revisá lo que está marcado debajo de cada campo.» (`SE:88`) |
| Accesibilidad | OK (structure) | fieldset per tramo, `aria-invalid` (`SE:62-64`) |
| Responsive | OK | tramo fields collapse to two columns (`CSS:241-244`) |
| Consistencia | Weak | an inactive schedule shows a chip «Inactivo» (`SE:152`) but nothing on this screen can deactivate one, and saving a change reactivates it without saying so (accepted behaviour 7 of D-20261102-10). The type cards reuse the employee's shift-picker style by class name (`SE:50`) |

- **Options:** (a) the local selector above the list, outside the form; (b) hide «Tramo 1» and the counter while there is one tramo; (c) a note on an inactive schedule that saving turns it back on.

## D13. Empleados (`EVR`)

- **Goal:** add people, say where they work and with which schedule, hand over or reset a password, take someone out. **Who:** the owner, at setup and when staff changes.

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | OK | subtitle (`EVR:93`) |
| Navegación | Weak | the form to add a person is under the whole list (`EVR:97-99`), with no button at the top that leads to it; Sedes and Horarios put their create form beside the list (`AVR:162`, `SE:145`) |
| Jerarquía | Weak | three quiet buttons of equal weight per row («Editar», «Horarios», «Restablecer contraseña», `EVR:51-53`). The list does not show the schedule each person has now; it is only visible by opening «Horarios» one by one, where the list of past assignments does not mark which one is in force (`EVR:125`) (P-16) |
| Terminología | Weak | the row button «Horarios» has the same name as the menu item; «Activo / Inactivo» (`EVR:65`), «dado de baja» (`CL:57`), «desactivado» (`WDF:83`) for the same idea; «Se cierran todas sus sesiones» (`EVR:48`); «Esta persona también tiene acceso en otra empresa o como ADMIN; su contraseña la restablece el operador.» (`CL:56`) |
| Acciones | Weak | «Contraseña provisoria» is a masked field whose hint asks the owner something they cannot know: «Solo hace falta si el DNI todavía no tiene cuenta. De 12 a 72 caracteres; las letras con tilde y la ñ cuentan como 2.» (`EVR:104`, `shared/password.ts:8`). Taking someone out is: «Editar», untick «Activo», «Guardar» (`EVR:65`), with no word on what it means (cannot sign in or mark, history kept; CLAUDE.md rule 7) |
| Feedback | Weak | «Empleado creado.» and errors render at the top of the page (`EVR:94-95`), the form is at the bottom (P-02). The provisional password panel is scrolled into view and focused (`AV:714-719`): good |
| Errores | Weak | a rejected DNI or name answers «Revisá los datos ingresados.» (`CL:81`) without naming the field (P-11) |
| Accesibilidad | OK (structure) | inline inputs named with the person (`EVR:62-65`) |
| Responsive | OK | cards with the edit form inside at 520 px or less (`EVR:70-90`) |
| Consistencia | Weak | «Estado» is plain text in the table and a coloured chip in the cards (`EVR:65`, `EVR:73`); the chip borrows the «justificado» colour by class name |

- **Options:** (a) «Agregar empleado» visible at the top (button that reveals or scrolls to the form); (b) generate the provisional password by default and keep typing one as a folded choice; (c) show the current schedule per person, reusing the assignments the setup check already loads for up to 30 people (`SS:30-34`), or through a new API field (O-7); (d) «Dar de baja» / «Volver a activar» with one line of consequence; (e) rename the row button («Cambiar horario»).

## D14. Alerts bar (`APC:146-167`)

- **Goal:** turn alerts on for this device and this company. **Who:** the owner, once per device and company.

| Dimension | Verdict | Evidence |
|---|---|---|
| Claridad del propósito | Weak | at 760 px or less only «Avisos: desactivados» and the button are visible (`CSS:360-361`); what the alerts are about, «Solo avisan sobre ingresos pendientes o llegadas tarde.» (`APC:161`), is hidden exactly where most owners will see it |
| Navegación | Weak | a setting that lives over every screen instead of in one place (P-07) |
| Jerarquía | Poor | permanent, fixed, above the content, for a one-time choice |
| Terminología | Weak | «Alertas» in the title, «Avisos» in the status and the button, «avisos push» in the install help, «notificaciones» in the Bandeja (`APC:154`, `:162`, `:166`, `InstallControl.tsx:29`, `AVR:81`); «ingresos pendientes» is a fifth name for a missed entry; «El navegador renovó la suscripción; los avisos siguen activos…», «La suscripción del navegador está incompleta.» (`APC:56`, `APC:32`) |
| Acciones | OK | one button per state |
| Feedback | OK | «Avisos activados para {empresa} en este dispositivo.» (`APC:30`) |
| Errores | OK | unsupported, blocked and not-enabled each explain the way out (`APC:147-151`) |
| Accesibilidad | OK (structure) | `aside` with a label (`APC:157`); the bar is accounted for in scroll padding (`CSS:36`) |
| Responsive | Weak | reserves 90 px on phones (`CSS:359`); overlaps the update banner by geometry (D5) |
| Consistencia | Weak | terminology |

- **Options:** (a) move it into the place where device and company settings live (section 5) and offer it once, in context, on the Bandeja while it is off; (b) one word, «avisos»; (c) keep D-20261027-04 as is (per company, sign-out does not cut them).

---

# 3. Flows

Counts are the shortest path with today's code: **taps** on buttons or choices, **fields** typed or picked. A native date or time picker counts as one field. ⚠ marks a point where the person can get lost or fear breaking something; ✂ marks a step that adds no value.

## Employee

### F1. Sign in for the first time

1. Login: type «DNI» and «Contraseña» (the provisional one, 19 characters with dashes, `features/admin/temporaryPassword.ts:22`) → «Ingresar». *2 fields, 1 tap.*
2. Screen changes to «Cambiá tu contraseña» (`APP:20`). ✂ Type the provisional password again in «Contraseña que te dieron» (`AS:89`), then «Nueva contraseña» (12 or more) and «Repetí la nueva contraseña» → «Guardar contraseña». *3 fields, 1 tap.*
3. With several companies: «Elegí una empresa», *1 tap*. Otherwise the day screen.

Total: 5 fields, 2 or 3 taps, 2 or 3 screens, at least 70 keystrokes. ⚠ The rule is given as «al menos 12 letras o números» (`shared/password.ts:10`); the counter helps (`AS:63`). ⚠ After an ADMIN reset the same screen says «PRIMER INGRESO» (`AS:85`).

### F2. Clock in, breaks, clock out

1. Open the app (session lasts 30 days): the sentence says the state, the large button says the next mark.
2. Tap the button. First mark after opening the app without a granted permission: inline notice → «Continuar» → the browser's own permission prompt (`EA:147`, `locationNotice.ts:16-22`). *1 tap; 3 the first time.*
3. «Enviando tu marca… esperá un momento.» → «Listo: tu entrada quedó registrada a las 09:02.» with the location line.
4. Breaks: «Me voy a desayunar» → later «Volví del desayuno»; the sentence shows the limit («volvé antes de las 10:20», `ED:122`). *1 tap each.*
5. Exit: «Marcar salida». Before the end of the schedule it asks «¿Terminás tu día ahora? …» → «Sí, marcar salida» (`ED:100-104`). *1 or 2 taps.*

⚠ Before the allowed time the button is there and the tap fails with a three-line rule (`CL:46`). ⚠ In «Ver otros días» the same buttons act on the day being viewed (`EA:286`): a past day still open accepts a mark with the current time (late entries have no limit, SPEC:44).

### F3. See whether a mark was accepted

Immediately: the green message with action and time, focused (`EV:49-52`). Later: «Tus marcas de hoy», one row per mark with time and location state (`EV:83-90`). If the answer never came: «No sabemos si llegó. Tocá el mismo botón otra vez: no se marca dos veces.» (`EM:7`), plus «Actualizar» (`EV:48`); when the refreshed day contains the mark, the error turns into the confirmation (`EA:205-210`). No wasted step.

### F4. Complete a pending explanation

1. Scroll past «Marcar» and «Tus marcas de hoy» to «Para explicar» (third panel). Nothing at the top says something is pending.
2. Choose one of four options, write the text, «Enviar motivo». *1 tap, 1 field, 1 tap.*
3. «Lo enviamos. Tu encargado lo va a revisar.» at the top of that panel; the card leaves the panel.

### F5. Correct an explanation already sent

1. Scroll to «Desvíos del día» (fourth panel) → «Corregir motivo». *1 tap.*
2. ⚠ The form opens in «Para explicar», the panel above, without scrolling or focus (`EA:257-261`, `EA:267`); on a phone it is off screen.
3. Change, «Guardar corrección». Only for deviations of the date on screen: an older one that is already in review can be reached only by choosing its date in «Ver otros días».

### F6. Look at another day

1. Scroll to the end → «Ver otros días» → pick the date. *1 field.*
2. The whole screen reloads for that date; the sentence says «Estás viendo el 9 nov 2026.» (`EA:270`).
3. ⚠ To return: scroll to the end again → «Volver a hoy» (`EV:171`).

## ADMIN

### F7. First-time setup (five steps of «Primeros pasos»)

1. Lands on «Primeros pasos» (`AA:45`). Step 1 «Ir» → Sedes. The first local already exists (created with the installation, `README.md:22`) without a location: «Cambiar ubicación» → «Elegir en el mapa» → type the address → «Buscar» → tap a result → (tap the door) → «Confirmar ubicación» → «Guardar ubicación». *About 7 taps, 1 field.*
2. ⚠ No link back: menu → «Primeros pasos» → step 2 «Ir» → Horarios: pick a type, adjust hours, «Crear horario» → «¿Quién trabaja con este horario?» finds nobody, because the team is step 3 → «Listo». ✂ The assignment step cannot help in this order.
3. Menu → «Primeros pasos» → step 3 «Ir» → Empleados: scroll to the form at the bottom; name, DNI, «Generar contraseña», «Crear empleado» → read out the password → «Listo, ya la entregué». *Per person: 2 fields, 3 taps.*
4. Menu → «Primeros pasos» → step 4 «Ir» → Empleados again: for each person «Horarios» → choose a schedule → «Asignar horario» → «Cerrar». *Per person: 4 taps.*
5. Menu → «Primeros pasos» → step 5 «Ir» → Jornadas: defaults are right → «Cargar días». *1 tap.*

About ten menu taps only to move between the guide and the sections. With team before schedules, step 4 would be one screen with checkboxes for everyone.

### F8. Add a local with its location

Sedes → «Agregar sede»: name → «Elegir en el mapa» → address → «Buscar» → result → «Confirmar ubicación» → (distance, default 100) → (province, default Buenos Aires) → «Crear sede». *2 fields, 5 taps.* ⚠ On a phone the result «Sede creada.» appears at the top of the page, above the list (`AVR:161`). ⚠ A name typed wrong cannot be changed afterwards.

### F9. Build a schedule

Horarios → «Crear un horario»: (local, with 2+) → type card → name (prefilled with the type, `features/admin/scheduleDraft.ts:36-40`) → hours → minutes for breakfast and lunch (15 and 60 by default) → «Crear horario» → tick who works with it → «Asignar». *1 to 3 fields, 3 or more taps.* No wasted step.

### F10. Add an employee and give them a schedule

Empleados → scroll to «Dar de alta un empleado» → name, DNI → «Generar contraseña» → (tick the local when there are several) → «Crear empleado» → hand over the password → «Listo, ya la entregué» → find the person in the list → «Horarios» → schedule → «Asignar horario». *2 or 3 fields, 6 or 7 taps, two scrolls.* ⚠ The new person has no schedule until the last three taps, and nothing on the list shows it; the first sign of it is «Sin horario asignado: …» when loading days (`WDF:81`).

### F11. Load the days of work for a month

Jornadas → the form is first on the page → «Mes que viene» → «Cargar días». *2 taps.* The result box says how many were loaded and why any were not.

### F12. Review the Bandeja and decide

Bandeja → read the card → «Justificado» or «No justificado». *1 tap per case.* ⚠ Decided cases stay in the list among the undecided ones. ⚠ A wrong tap is undone only with «Corregir a …» plus a written reason. ⚠ To see the marks of that day: «Ver jornada» leaves the Bandeja; coming back reloads it from the top.

### F13. Load a forgotten mark

- From the Bandeja, on «Egreso sin marcar»: «Ver jornada» → the page scrolls to the detail with «Egreso» preselected (`AA:67`, `AV:814-816`) → scroll to the form at the end of the detail → pick date and time → reason → «Agregar marca». *2 fields, 2 taps.* ✂ The date has to be picked although the day is known.
- Without the Bandeja: Jornadas → scroll past two forms → «Fecha» → «Ver marcas» → ⚠ scroll down to find the detail → scroll to its form → same as above.

### F14. Correct or void a mark

Detail → «Corregir» on the row → ⚠ the form opens under the table → type, date and time (prefilled, `AV:872`), reason → «Guardar corrección de marca». *1 field, 2 taps.* Void: «Anular» → reason → «Confirmar anulación». *1 field, 2 taps.* The hints say exactly what will happen («La marca no se borra: queda visible como anulada…», `AVR:354`): good.

### F15. Cancel a day

Jornadas → date → «Ver marcas» → «Cancelar jornada» (only when nobody marked) → reason → «Confirmar cancelación». *1 field, 3 taps per person.* ⚠ For a holiday with ten people this is ten times; the API has no cancellation for several days at once (`openapi.yaml:1008-1035`).

### F16. Read the change history of a day

Detail → scroll to the end → «Ver historial». *1 tap.* Read-only, oldest first.

### F17. Reset an employee's password

Empleados → row → «Restablecer contraseña» → «Confirmar restablecimiento» → the panel with the new password opens above the list and takes focus → «Listo, ya la entregué». *3 taps.* ⚠ For a person who is also in another company the answer is a message that names «ADMIN» and «el operador» (`CL:56`).

### F18. Turn on alerts

Any ADMIN screen → bottom bar → «Activar avisos» → the browser's prompt → «Avisos activados para {empresa} en este dispositivo.» *2 taps.* ⚠ On an iPhone the app has to be installed first; the bar explains it in its unsupported state (`APC:147`) and the header has «Cómo instalar». ⚠ Tapping a notification opens the app on its start section, which is «Primeros pasos» whenever a setup step is missing (`AA:45`), not the Bandeja; the URL `/admin` it opens is not read by the app (`device/push/safeNotification.ts:57`, `AV:107`).

---

# 4. Vocabulary

Changing a visible word does not require changing internal names, API fields or the specification's terms (S6). **The words for «jornada» and «desvío» are an open owner decision (assumption A1 of the task): the evaluation below is input for Mateo, not an outcome.**

Criteria per candidate: **U** everyday use in Argentina, **P** functional precision, **C** consistency with the rest of the app. `+` good, `~` fair, `−` weak. The U column is the auditor's judgment as a design hypothesis; it is not research and should be checked with real users (T6).

## 4.1 Objects

| Term today | Where | Problem | Candidates (U / P / C) | Recommendation |
|---|---|---|---|---|
| **jornada** | ADMIN: menu «Jornadas» (`AA:16`), «Jornadas del …» (`AVR:46`), «Cancelar jornada» (`AVR:343`), «Ver jornada» (`AVR:113`), «Jornadas encontradas» (`AVR:443`), errors (`CL:58-59`). The same thing is «día de trabajo» / «día cargado» (`WDF:41`, `SS:121`, `AVR:332`), and for the employee «turno» (`ED:108`, `EV:36`) or «día» (`ED:112-113`) | four words for one object; «jornada» is formal labour language | (1) **«día» / «día de trabajo»**: U+ P~ (a night shift spans two calendar days; a person can have two in a day at different locals) C+ (already used in the planning form). (2) **«turno»**: U+ P+ (fits night and split cases) C~ (it is also what many call the schedule: "turno mañana"). (3) keep **«jornada»**: U~ P+ C− | **Owner decision.** Proposal: «día» as the general word for both roles («Días de trabajo», «Cancelar este día», «Ver el día»), «turno» only where two exist on the same date (the employee's picker already does this, `EV:36`) |
| **desvío** | ADMIN: «Bandeja de desvíos» (`AVR:81`), empty states (`AVR:104`), history (`AVR:410-412`), notification «Fichaje Braja · Desvíos pendientes», «Hay 3 desvíos nuevos para revisar» (`device/push/safeNotification.ts:51`, `:60`). Employee: «Desvíos del día» (`EV:156`). Also «casos» (`AVR:88`) | technical; in daily speech a «desvío» is a road detour | (1) **«novedad»**: U+ (workplaces speak of "novedades" of attendance) P~ (neutral: does not say something is wrong) C+. (2) **«irregularidad»**: U~ P+ C~, sounds like an accusation. (3) **«incidencia»**: U− P+ C~. (4) keep **«desvío»**: U− P+ C+ | **Owner decision.** Proposal: ADMIN «novedad» as the noun and «Para revisar» as the place; employee no noun at all («Para explicar», and the type names themselves) |
| **bandeja** | menu, title (`AA:16`, `AVR:81`), hint «te avisamos en la Bandeja» (`SE:8`), notification body (`safeNotification.ts:7`) | an email metaphor; the hypothesis users live in WhatsApp | (1) **«Para revisar»**: U+ P+ (says what to do) C+. (2) **«Novedades»**: U+ P~ C+ (pairs with the noun). (3) **«Avisos»**: U+ P− (collides with push alerts) | «Para revisar» (follows the «desvío» decision) |
| **sede** vs **local** | «Sedes» in the menu, title, labels and errors (`AA:19`, `AVR:159`, `AVR:74`, `AVR:198`, `AV:199`, `AV:290`); «local» in every question and message written in phase 1 (`AVR:167`, `EVR:76`, `WDF:43`, `SS:98`, `CL:53`); «Fuera de sede» for the ADMIN vs «Fuera del local» for the employee (`AVR:471`, `ED:154`) | two words on the same screens | (1) **«local»**: U+ P+ for shops C+ (already the majority). (2) **«sucursal»**: U+ P+ C− (new word). (3) **«sede»**: U~ P+ C− | «local» everywhere visible; the menu item becomes «Locales» |
| **plantilla** → **horario** | done in phase 1 (`SE:143`). Residue: «Horario asignado: …» in the day detail (`AVR:337`) names the schedule frozen in that day; the row button «Horarios» (`EVR:52`) equals the menu item | — | — | «Horario de este día: …» in the detail; row button «Cambiar horario» |
| **tramo** | «Tramo 1», «{n} de 4 tramos», «Agregar otro tramo», «Quitar este tramo» (`SE:58-68`), errors (`scheduleTramos.ts:12`) | understood by context; shown even when there is only one | (1) keep **«tramo»**: U~ P+ C+. (2) **«parte»**: U+ P~ C~. (3) **«franja»**: U~ P+ C− | keep «tramo», hide the word while the schedule has a single one |
| **tolerancia** | «Minutos de tolerancia» + hint (`EVR:8-9`), «tolerancia 5 min» (`AVR:337`), «Tenés 5 minutos de tolerancia para entrar.» (`EV:82`) | common word at work; the employee line covers only the entry | (1) keep with its hint: U+ P+ C+. (2) **«minutos de gracia»**: U~ P+ C−. (3) **«margen»**: U~ P~ C− | keep; on the employee side say «para entrar y para salir», or drop the line |
| **marca** / **marcar** | everywhere, both roles (`EV:60`, `AVR:350`) | consistent | — | keep |
| **motivo** | three meanings: the employee's explanation («Enviar motivo», `EV:145`; «Motivo:», `AVR:110`); the ADMIN's written reason for a change («Motivo de corrección», «Motivo de anulación», «Motivo de cancelación», `AVR:120`, `:354`, `:341`); the kind («¿Qué tipo de motivo es?», `EV:132`). The employee side also says «explicar», «explicación» (`EV:109`, `EV:161`) | one word, three roles, plus a synonym | employee's text: (1) **«explicación»** U+ P+ C+ (matches «Para explicar»); (2) «motivo» U+ P~ C−. ADMIN's reason: (1) **«¿Por qué?»** phrased as a question, as the forgotten-mark form already does (`AVR:367`) U+ P+ C+; (2) «motivo» U+ P~ | «explicación» for what the employee writes; a question for what the ADMIN writes |
| categories | «Salud», «Transporte», «Emergencia», «Otra» with a help line (`EV:18-23`); same labels for the ADMIN (`AVR:473`) | consistent and plain | — | keep |
| **historial** | menu «Historial» (search of past days, `AA:16`); «Historial de cambios» of a day (`AVR:380`); «Ver historial de ubicación» of a local (`AVR:164`) | three different things | menu: (1) **«Días anteriores»** U+ P+ C+; (2) «Buscar» U+ P~. Change logs: (1) **«Cambios de este día»**, **«Cambios de ubicación»** U+ P+ C+; (2) «Registro de cambios» U~ P+ | as marked; if the search merges into the daily view (section 5) the menu word disappears |
| **encargado** / **administrador** / **ADMIN** / **operador** | «tu encargado» (`AS:38`, `ED:108`, `EV:109`, `CL:52`); «un administrador» (`AS:57`, `AVR:265`), «el administrador» (`CL:59`); «ADMIN», «el operador» (`CL:56`); «Administración» (`AS:55`, `AA:85`) | four names for two people (the shop's person in charge, and whoever runs the installation) | — | «tu encargado» in everything an employee reads; never «ADMIN» on screen; one plain phrase for the second person (wording for Mateo, O-9) |
| **contraseña** / **clave** | labels and titles say «contraseña» (`AS:34`, `AS:85`, `EVR:104`); help and rules say «clave» (`AS:38`, `shared/password.ts:10-12`); «provisoria» (`EVR:21`, `CL:76`) vs «la que te dieron» (`AS:75`, `AS:89`) | two words in the same card | (1) **«contraseña»**: U+ P+ C+ (labels, browsers, password managers). (2) **«clave»**: U+ (banks and public offices use it) P+ C~ | one word; «contraseña» costs fewer changes |

## 4.2 Names of marks

| Mark | Employee: button (`ED:4-7`) | Employee: list (`ED:9-12`) | ADMIN (`AVR:470`) | Recommendation |
|---|---|---|---|---|
| `INGRESO` | «Marcar entrada» | «Entrada» | «Ingreso» | «Entrada» for both |
| `EGRESO` | «Marcar salida» | «Salida» | «Egreso» | «Salida» for both |
| `SALIDA_DESAYUNO` | «Me voy a desayunar» | «Salida a desayunar» | «Salida desayuno» | «Salida a desayunar» |
| `VUELTA_DESAYUNO` | «Volví del desayuno» | «Vuelta del desayuno» | «Vuelta desayuno» | «Vuelta del desayuno» |
| `SALIDA_ALMUERZO` / `VUELTA_ALMUERZO` | «Me voy a almorzar» / «Volví del almuerzo» | «Salida a almorzar» / «Vuelta del almuerzo» | «Salida almuerzo» / «Vuelta almuerzo» | as the employee list |

«Ingreso» and «egreso» stay only as internal and specification terms. With «Salida» as the exit, the list reads «Salida» next to «Salida a desayunar»; a more distinct exit name («Salida del trabajo», or «Fin del día») is worth testing with users.

## 4.3 Names of deviation types

| Code | Employee (`ED:152-155`) | ADMIN (`AVR:471`) | Candidates for one shared name | Recommendation |
|---|---|---|---|---|
| `SIN_INGRESO` | «Faltó la entrada» | «Sin ingreso» (also the name of a day state, `shared/format.ts:4`) | «No marcó la entrada» (U+ P+: says the fact, not that the person was absent), «Faltó la entrada» (U+ P~), «Ausente» (U+ P−: the person may arrive later) | «No marcó la entrada» |
| `LLEGADA_TARDE` | «Llegada tarde» | «Llegada tarde» | — | keep |
| `EGRESO_TEMPRANO` | «Salida temprana» | «Egreso temprano» | «Salió antes» (U+ P+), «Salida temprana» (U+ P+) | «Salió antes» or keep «Salida temprana» |
| `EGRESO_TARDIO` | «Salida tarde» | «Egreso tardío» | «Salió después de hora» (U+ P+), «Salida tarde» (U+ P~) | «Salió después de hora» |
| `MARCA_FALTANTE` | «Faltó la salida» | «Egreso sin marcar» | «No marcó la salida» (U+ P+, pairs with the first row) | «No marcó la salida» |
| `EXCESO_DESAYUNO` / `EXCESO_ALMUERZO` | «Desayuno largo» / «Almuerzo largo» | «Exceso de desayuno» / «Exceso de almuerzo» | «Desayuno largo» (U+ P+), «Se pasó en el desayuno» (U+ P+ but long) | «Desayuno largo» / «Almuerzo largo» |
| `FUERA_DE_SEDE` | «Fuera del local» | «Fuera de sede» | «Marcó fuera del local» (U+ P~: the record also covers a location that never arrived or was imprecise, SPEC:56), «Sin ubicación en el local» (U~ P+) | «Fuera del local», with the sentence saying which case when it is known |

The alerts bar calls the first row «ingresos pendientes» (`APC:161`): it should use the chosen name.

## 4.4 States

| Kind | Today | Problem | Recommendation |
|---|---|---|---|
| Day states (`shared/format.ts:3-9`, shown to both roles) | «Sin ingreso», «En curso», «En pausa», «Finalizada», «Cancelada» | system voice; «Sin ingreso» collides with the deviation of the same name | «Todavía no entró», «Trabajando», «En pausa», «Ya salió», «Cancelado» (verify gender once the noun is chosen) |
| Deviation status, employee (`EV:25-27`) | «Falta explicar», «A revisar», «Justificado», «No justificado» | «A revisar» does not say who reviews | «Te falta explicar», «Lo está revisando tu encargado», «Justificado», «No justificado» |
| Deviation status, ADMIN (`AVR:472`) | «Falta motivo», «A revisar», «Justificado», «No justificado» | «Falta motivo» does not say who owes it | «Todavía no explicó», «Para revisar», «Justificado», «No justificado» |
| Classification («clasificar», «clasificación») | «Clasificación guardada.» (`AV:155`), «clasificado como justificado», «clasificación corregida de … a …», «vuelve a revisión (se quitó la clasificación …)» (`AVR:414-416`) | abstract noun; «justificado / no justificado» themselves are everyday labour words and should stay | verb forms: buttons «Justificar» / «No justificar»; result «Quedó como justificado»; change «Cambiar a no justificado» + «¿Por qué lo cambiás?» |
| Mark location, employee (`ED:137-141`) | «Ubicación enviada», «Enviando ubicación…», «Sin ubicación» | fine | keep |
| Mark location, ADMIN (`AVR:474`) | «Ubicación pendiente», «Ubicación recibida», «Sin ubicación», «Ubicación depurada», «No aplica» | «depurada» and «No aplica» are system words | «Esperando la ubicación», «Con ubicación», «No llegó la ubicación», «Ubicación borrada (pasaron 90 días)», «Cargada a mano» |
| Person | «Activo» / «Inactivo» (`EVR:65`), «dado de baja» (`CL:57`), schedule «desactivado» / «Inactivo» (`WDF:83`, `SE:152`) | three words | person: «Activo» / «De baja»; schedule: «En uso» / «Sin uso» or keep «Inactivo», but one word per object |
| Setup step (`FS:24`) | «Listo», «Falta», «Revisalo» | fine | keep |

## 4.5 Actions

| Term today | Where | Problem | Recommendation |
|---|---|---|---|
| **cancelar** | domain: «Cancelar jornada», «Confirmar cancelación» (`AVR:342-343`). Interface: «Cancelar» closes a form in seven places (`AVR:121`, `AVR:193`, `AVR:361`, `EVR:50`, `EVR:55`, `SE:92`, `EV:146`) | the same word cancels a working day and closes a form, sometimes in the same panel; other forms back out with «Volver» (`AVR:342`, `AVR:355`, `EV:65`), «Ahora no» (`SE:125`), «Cerrar» (`EVR:121`), «Cerrar mapa» (`SMP:46`) | one backing-out word for forms («Volver»); the domain action always with its object («Cancelar este día») |
| **anular** | «Anular», «Confirmar anulación», «Anulada» (`AVR:300`, `AVR:355`, `EV:87`) | clear with its hint; differs from «cancelar» only by object | keep «Anular», written with its object where space allows («Anular marca») |
| **corregir** | «Corregir» a mark (`AVR:300`); «Corregir a no justificado» (`AVR:114`); «Corregir motivo» (`EV:162`); «Guardar corrección» for two different things (`AVR:121`, `EV:145`) | one verb for three objects | mark: «Corregir»; decision: «Cambiar a …»; explanation: «Cambiar lo que escribí» |
| **cargar** | enter data: «Cargar días», «Cargar este día», «Días de trabajo cargados», «No hay empleados cargados.» (`WDF:73`, `AVR:320`, `SS:121`, `EVR:97`). Fetch: «Cargando…», «No pudimos cargar tu día», «Cargar anteriores» (`UI:16`, `EA:284`, `AVR:92`). «Cargando…» is also the busy label of «Cargar días» (`WDF:73`) | two meanings; one string serves both | keep «cargar» for entering days; fetching becomes «Buscando…» / «No pudimos mostrar…» / «Ver anteriores»; saving shows «Guardando…» |
| **declarar** | gone from the interface (phase 1) | — | — |
| **actualizar** | refresh data: «Actualizar» (`AVR:81`, `AVR:323`, `EV:48`). Update the app: «Hay una versión nueva» + «Actualizar» (`ServiceWorkerUpdate.tsx:23-27`). Also «El sistema se está actualizando.» (`EM:13`) | two meanings | refresh: «Volver a cargar» or an icon with that name; app: «Usar la versión nueva» |
| **restablecer** | «Restablecer contraseña», «Confirmar restablecimiento» (`EVR:49-53`) | formal | «Dar una contraseña nueva» / «Sí, dar una nueva» |
| **dar de alta** / **crear** | «Dar de alta un empleado» as title, «Crear empleado» as button (`EVR:99`, `EVR:108`); «Agregar sede» / «Crear sede» (`AVR:197`, `AVR:231`); «Crear un horario» / «Crear horario» | title and button use different verbs in two of three screens | «Agregar» for all three, title and button alike |
| **ir** | «Ir» ×5 in the guide (`FS:25`) | no destination | name the destination |

## 4.6 Location and alerts

| Term today | Where | Recommendation |
|---|---|---|
| «ubicación», «punto», «centro», «coordenadas», «latitud», «longitud» | «¿Dónde queda el local?» (`AVR:167`); «Punto elegido en el mapa.» (`AVR:181`); «crear la sede sin centro» (`SL:37`, `:57`, `:72`, `:87`); «Centro anterior» (`AVR:267`); «Latitud … · Longitud …» (`AVR:177`); «Revisá las coordenadas, la precisión y el mapa» (`AV:290`) | «dónde queda» and «ubicación» only; numbers stay behind the fold «Escribir las coordenadas a mano» |
| «radio» / «distancia permitida para marcar» / «geocerca» | «Distancia permitida para marcar (metros)» (`AVR:14`); «radio» in the location history (`AVR:263`, `AVR:267-268`); «geocerca» never appears on screen | «distancia permitida» in the history too |
| «capturar», «captura automática», «carga manual», «precisión informada por el dispositivo» | `AVR:170`, `AVR:180`, `AVR:266` | «Usar dónde estoy ahora»; «desde el celular» / «escrita a mano» / «elegida en el mapa» |
| «Hora del local», «zona horaria» | «Hora del local» with provinces (`SiteZoneField.tsx:16`): good. «zona horaria» remains in the Sedes subtitle and in three errors (`AVR:159`, `AVR:84`, `AVR:338`, `AV:862`) | «la hora del local» in those four places |
| «alertas», «avisos», «avisos push», «notificaciones» | `APC:154`, `APC:162`, `InstallControl.tsx:29`, `AVR:81`, `AVR:85` | «avisos» only |
| «sesión», «sesiones» | «Cerrar sesión» (`UI:35`): familiar. «Se cierran todas sus sesiones» (`EVR:48`), «Sus sesiones abiertas se cerraron.» (`EVR:24`) | keep «Cerrar sesión»; «va a tener que entrar de nuevo en todos sus dispositivos» |

---

# 5. Navigation and information architecture

## 5.1 The map today

```
Entry gate      Boot → Login → [Cambiá tu contraseña] → [Elegí una empresa]

EMPLEADO        one screen
                Hola + estado → [Elegí tu turno] → aviso de la marca → Marcar → Tus marcas de hoy
                → Para explicar → Desvíos del día → Ver otros días

ADMIN           top bar · menu · fixed alerts bar
  [Primeros pasos]     first while a step is missing, last when complete (AA:91, AA:95)
  ADMINISTRACIÓN
    Bandeja            filtros · casos: decidir, corregir la decisión, «Ver jornada» → Jornadas
    Jornadas           cargar días (mensual) · un solo día · lista del día · detalle: cancelar,
                       corregir, anular, agregar marca, historial de cambios
    Historial          filtros · jornadas encontradas (solo lectura)
  CONFIGURACIÓN
    Sedes              lista: cambiar ubicación, historial de ubicación · agregar
    Horarios           lista del local: cambiar, asignar · crear → asignar
    Empleados          lista: editar, horarios, restablecer contraseña · dar de alta
```

Links between sections that exist: guide → section (`FS:25`); Bandeja → day detail (`AA:64-69`); coverage notice → Jornadas (`AA:101`); result of loading days → Empleados or Horarios (`AV:939`). None of them has a way back.

## 5.2 What is wrong with it

1. **Grouped by entity, not by task.** The owner's recurring tasks are three: decide what is waiting (daily), check or fix today's marks (daily), load next month's days (monthly). The first has its own section; the second and third share «Jornadas», with the monthly one on top (P-01); the read-only «Historial» repeats the second without its actions (P-08).
2. **Seven items of equal weight**, plus a guide that changes position (P-06, P-15). On a phone the grouping captions are hidden and the items wrap and scroll away.
3. **No addresses.** Section, date, open day and filters live in component state (`AA:27`, `AV:750`, `AV:94-95`): Back, reload and a notification tap all lose the place (P-06, P-13, P-30).
4. **A device setting occupies every screen** (P-07).
5. **Names do not line up**: menu word, page title, eyebrow and guide step differ for four of seven sections (P-23).

## 5.3 Alternatives for the ADMIN

Names below use the vocabulary proposal of section 4; they change if Mateo decides otherwise.

### Alternative A: four destinations by task

| Destination | Holds (all of it exists today) | Frequency |
|---|---|---|
| **Para revisar** | the Bandeja: undecided first, decided folded; filters; the day opens in place | daily |
| **Hoy** (the days and their marks) | the day list with previous day, next day and a date; the same detail (correct, void, add, cancel, changes); «otro período» = today's Historial filters (person or local, range), each result opening the same detail | daily |
| **Días de trabajo** | «Cargar días de trabajo», the single day, and until when days are loaded (today's coverage notice) | monthly |
| **Configuración** | Locales, Horarios, Equipo, «Avisos en este dispositivo», and «Primeros pasos» while a step is missing | setup, then rare |

- **Phone:** a bottom bar with four labelled items, always visible and within reach of the thumb. It replaces the wrapped pills and takes the place of the fixed alerts bar, so the content gains height. «Configuración» opens a short list of its four parts.
- **Desktop:** the current left column with the same four; «Configuración» shows its children.
- **For:** matches how often each thing is done; four choices instead of seven; one list of days instead of two; the alerts setting gets a place; each destination can be named with a verb or a time word that explains itself.
- **Against:** rare tasks cost one more tap on a phone; the largest change: `JourneysView` keeps planning and detail state together (`AV:744-948`) and has to be split; the guide's links and several tests name the current sections (`features/admin/AdminViews.test.tsx`, `FirstSteps.test.tsx`, `AdminHistory.test.tsx`).
- **Screens:** none added. Top level goes from 7 to 4; «Historial» stops being a separate screen.

### Alternative B: keep the seven sections, fix names, order and addresses

Same menu structure; «Sedes» → «Locales», «Bandeja» → «Para revisar», titles equal to menu words, eyebrows removed; inside «Jornadas» the day list and detail move above the forms and the monthly form folds; «Historial» cards get «Ver marcas»; the menu on phones becomes one sticky row; each section gets an address.

- **For:** small diff, low regression risk, easy to coordinate with the responsive work on the same files (#66, #70).
- **Against:** the page that mixes two tasks stays one page; seven or eight items do not fit one row on a 320 px phone (they scroll sideways again, which phase 1 removed, `CSS:400-402`); the duplicate list stays.

### Alternative C: a start page with status cards in front of the sections

A first screen with «Para revisar: 3», «Hoy: 5 trabajando, 1 no entró», «Días cargados hasta el 30», each leading to its section.

- **For:** answers "what needs me today" in one look; a natural home for the guide and the coverage notice.
- **Against:** it is a new screen and one more tap before every task (S6: «No agregues pantallas, pasos ni confirmaciones únicamente para que la interfaz parezca más completa»); the counts need requests that no endpoint serves directly (the Bandeja has no count; a day summary is one `GET /jornadas` per local), on connections assumed unstable.

### Recommendation

**Alternative A, reached in two steps.** Step 1 is the part of B that A needs anyway and that fixes the worst problems on its own: addresses per section, the day list and its detail first and in place, messages next to the action, one name per thing. Step 2 regroups into the four destinations and the bottom bar. C is not recommended as a screen; if a count of what is waiting proves cheap, it belongs as a number on «Para revisar».

Addresses: hash routes (`#/revisar`, `#/hoy/2026-11-10`, …) need no dependency and no server change. The production server already falls back to `index.html` for unknown paths (`deploy/caddy/Caddyfile:55`), so path routes would also work, but they touch the deploy and the service worker's navigation route (`sw.ts:25-27`). The notification already opens `/admin` (`device/push/safeNotification.ts:57`); the app should treat that address as «Para revisar» whatever the setup state.

## 5.4 The employee

**Recommended (E1): stay with one screen**, reordered:

```
Hola + estado  [+ «Volver a hoy» when another day is shown]
[Te falta explicar algo  → lleva a la sección]        only when something is pending
[Elegí tu turno]                                      only with two or more
aviso de la marca → Marcar → Tus marcas de hoy
Para explicar (pendientes y enviadas, una sola sección)   only when it has content
Ver otros días
```

**Alternative (E2): two views, «Hoy» and «Mis días».** The second holds the date picker, past days as read-only cards and past explanations. For: the daily screen gets shorter and marking on another day by mistake becomes impossible. Against: a second screen and a menu for a rare task; it would also remove today's possibility of marking on a past day that is still open, which is a product decision (O-4). Not recommended now.

## 5.5 Everyday use versus occasional configuration

| Everyday | Monthly | Setup, then rare | Once per device |
|---|---|---|---|
| mark (employee); explain (employee); decide what is waiting; see today's marks; fix or add a mark | load days of work; cancel a day; add a single day | locals and their location; schedules; team; who has which schedule; reset a password | install the app; turn on alerts; pick the company |

---

# 6. Prioritized problem list

**Frequency:** D daily, W weekly, M monthly, S setup or rare. **Impact:** who is affected and how. **Effort:** S (hours), M (a day or two), L (several days). **Type:** W = visual or wording only; L = frontend logic; B = needs a backend, contract or product change (repeated in section 7).

| ID | Problem | Evidence | Freq | Impact | Severity | Effort | Files | Type |
|---|---|---|---|---|---|---|---|---|
| P-01 | «Jornadas» stacks a monthly form above the daily list; «Ver marcas» opens the detail under the list without scrolling to it | `AVR:308-335`; `AV:842-854`, `AV:946` vs `AV:815-825` | D | owner cannot find today's marks; a tap seems to do nothing | critical | M (step 1), L (split) | `AV`, `AVR`, `AA`, `WDP`, tests | L |
| P-02 | Results and errors appear far from the action: at the top of the page for forms at the bottom or inside a list; «Corregir motivo» opens a form in another panel | Sedes `AVR:160-161` vs `AVR:165`, `AVR:197`; Empleados `EVR:94-95` vs `EVR:99`; Bandeja `AVR:82-83`; employee `EA:257-261`, `EA:289-292` | D | the person does not see that it worked or why it failed | high | M | `AVR`, `EVR`, `AV`, `EA`, `EV` | L |
| P-03 | Two vocabularies for the same marks, deviations and states between roles; «Sin ingreso» is both a day state and a deviation | `ED:9-12`, `ED:152-155`, `EV:25-27` vs `AVR:470-472`; `shared/format.ts:3-9` | D | owner and employee cannot talk about the same record with the same words | high | S (after the decision) | `AVR`, `ED`, `EV`, `shared/format.ts`, `APC`, `safeNotification.ts`, tests | W (+B: O-1) |
| P-04 | The Bandeja does not separate undecided from decided; buttons read like states; the card lacks the local and the size of the deviation | `AVR:105-118`, `AVR:472`; `openapi.yaml:1169-1200`; SPEC:113 | D | review never "ends"; decisions by mistake | high | M | `AV`, `AVR` | L (+B: O-3, O-8) |
| P-05 | Employee: mark buttons stay live while another day is shown; «Volver a hoy» only at the bottom | `EA:135`, `EA:286`; `EV:171` | W | a mark recorded on the wrong day | high | S | `EA`, `EV` | L (+B: O-4 if hidden) |
| P-06 | ADMIN menu: seven equal items, wrapped and not fixed on phones, groups hidden; no address per section, so Back and reload lose the place | `AA:13-20`, `AA:27`; `CSS:369`, `CSS:401-402` | D | disorientation on the device most owners use | high | M (addresses), L (regroup) | `AA`, `CSS`, `APP`, tests | L |
| P-31 | A case can be decided before the employee explained; nothing warns that a later explanation erases the decision | `AVR:115-118`; D-20261027-02 | W | decisions that silently disappear | high | S | `AVR` | W |
| P-09 | First sign-in: provisional password of 19 characters typed twice, new one of 12 typed twice; «PRIMER INGRESO» after a reset | `AS:85-93`; `temporaryPassword.ts:22`; `shared/password.ts:2` | S (every employee) | the first contact with the app is its hardest screen | high | S (remove the repeat), B (length) | `AS`, `SES` | L (+B: O-5) |
| P-18 | The day detail lacks date, local, state, schedule hours and deviations; forms open away from the row; date not prefilled | `AVR:335-337`, `AVR:353-369`; `AV:757` | W | the owner corrects marks without seeing the schedule | medium | M | `AVR`, `AV` | L |
| P-12 | «Cancelar» is both a domain action and the way to close a form; six different words to back out | `AVR:342-343`, `AVR:361`; `SE:125`; `EVR:121`; `SMP:46`; `EV:65` | W | fear of cancelling the wrong thing | medium | S | `AVR`, `EVR`, `SE`, `SMP`, `EV` | W |
| P-07 | Fixed alerts bar on every ADMIN screen; four names for alerts; overlap with the update banner on phones (by geometry) | `AA:110`; `CSS:342`, `CSS:413`, `CSS:444`; `APC:154-166` | D (seen), S (used) | lost space on small screens; noise | medium | M | `APC`, `AA`, `CSS`, `styles.test.tsx` | L |
| P-08 | «Historial» is a read-only dead end that repeats the day list; its default state is invalid | `AVR:425-457`; `AV:199`, `AV:204` vs `AV:786` | M | a problem seen there has to be found again elsewhere | medium | M | `AV`, `AVR` | L |
| P-10 | System language left in ADMIN screens: coordinates, «zona horaria», «centro», «radio», «depurada», «No aplica», «HTTPS», «contexto seguro», «ADMIN», «operador», «sesiones», «auditados» | `AVR:84`, `:177`, `:212`, `:260`, `:267`, `:299`, `:338`, `:474`; `SL:37`, `SL:105`; `CL:56`; `EVR:48` | S to W | not understood; phase 1 (S5) meant to remove these | medium | S | `AVR`, `SL`, `CL`, `EVR`, `AV` | W |
| P-11 | Three ways of validating (browser bubbles, own messages, disabled buttons); generic server errors: «Revisá los datos ingresados.», and «…Revisá tu conexión…» for any unknown failure | `AS:32` vs `AS:88`; `AVR:197`, `EVR:99`; `EVR:108`, `AVR:342`; `CL:81`, `CL:89` | W | errors that do not say what to fix, or blame the connection | medium | M | `CL`, `AS`, `AVR`, `EVR`, `UI` | L |
| P-15 | Setup guide: order prevents assigning schedules to everyone at once; five «Ir»; no way back from a section; returns monthly under the name «Primeros pasos» and moves in the menu | `SS:103-119`; `SE:117`; `FS:25`; `AA:45`, `AA:91-95`; `SS:88-92` | S, M | a 30-minute setup stays long | medium | M | `SS`, `FS`, `AA`, tests | L |
| P-16 | Empleados: add form under the list; current schedule not shown; row button «Horarios» equals the menu item; taking someone out is an unexplained checkbox | `EVR:97-99`; `EVR:52`; `EVR:65`; `EVR:125` | S | people left without a schedule go unnoticed | medium | M | `EVR`, `AV` | L (+B: O-7) |
| P-17 | Employee: two panels for the same records, both shown empty on a normal day; «A revisar» does not say who; motivo / explicación | `EV:107-117`, `EV:152-166`; `EV:26` | D | noise under the main action; pending items below the fold | medium | M | `EA`, `EV` | L |
| P-13 | A notification tap does not reach the Bandeja reliably: it opens the start section, which is the guide when a step is missing; the deep-link message is unreachable | `safeNotification.ts:57`; `AA:45`; `AV:107`, `AVR:85` | W | the alert leads to the wrong place | medium | S (with addresses) | `AA`, `AV`, `sw.ts` | L |
| P-30 | «Ver jornada» leaves the Bandeja and loses position and filters | `AA:64-69`; `AV:129` | D | the owner loses the place in the review | medium | M | `AA`, `AV`, `AVR` | L |
| P-22 | When the ADMIN session expires (30 minutes idle) the app is replaced by the login and half-filled forms are lost | `APP:19`; `SES:41-44`; D-20261109-02 | W | retyping a schedule or a selection | medium | L | `APP`, `SES`, `AA` | L |
| P-19 | «Historial» names three things; «cargar» means fetch and enter; «Actualizar» means refresh and update the app | `AA:16`, `AVR:380`, `AVR:164`; `WDF:73`, `UI:16`; `AVR:81`, `ServiceWorkerUpdate.tsx:27` | D | wrong expectations of a button | medium | S | several | W |
| P-20 | Sedes: three primary buttons in one form; a ticked confirmation after confirming on the map; consequences unexplained; subtitle leaves out the location | `AVR:202`, `SMP:45`, `AVR:231`; `AVR:217-219`; `AVR:159` | S | hesitation in the first setup step | medium | M | `AVR`, `AV`, `SMP` | L |
| P-23 | Menu word, page title, eyebrow and guide step disagree for four sections | `AA:16-19`; `AVR:81`, `:159`, `:305`, `:433`; `SE:143`; `EVR:93`; `SS:98-124` | D | "where am I?" has several answers | medium | S | `AA`, `AVR`, `SE`, `EVR`, `FS`, `SS` | W |
| P-24 | The location step reads as a condition; the missing-location warning is green; there is no warning style | `locationNotice.ts:7`; `EV:49-52`; `UI:9` | D | wrong idea of what location does | medium | S | `locationNotice.ts`, `EV`, `UI`, `CSS` | W / L |
| P-29 | The employee learns when the entry is allowed only by failing; the tolerance line covers only the entry | `CL:46`; `EV:82`; `ED:52-55` | D | an avoidable error on the main action | medium | S | `ED`, `EV`, `EA` | L |
| P-21 | Horarios: the list follows a field inside the create form; an inactive schedule turns on again when saved, unannounced | `SV:70`, `SE:45-47`, `SV:146`; `SE:152`; D-20261102-10 (7) | S | with several locals, schedules seem missing | low | S | `SV`, `SE` | L |
| P-25 | The coverage note sits above the Bandeja on every visit; the setup check reloads on each visit with one request per person (up to 30) | `SS:158`, `AA:101`; `AA:62`, `SS:30-38` | D | list pushed down; slow on weak connections | low | S | `AA`, `SS`, `FS` | L |
| P-26 | The truncation note of the change history says «los primeros» though the newest 500 are kept | `AVR:383`; D-20261102-09 | S | wrong statement | low | S | `AVR` | W |
| P-27 | Company shown twice with a switcher; the switcher has no visible label; «Conexión protegida» is decoration | `UI:34`, `UI:63`; `AA:96` | D | clutter in a tight header | low | S | `UI`, `AA`, `CSS` | W |
| P-28 | Text glyphs as icons: «◷» means inbox, pause and schedule; «♙» means employees; «!» / «↗» on cards | `AA:16-19`; `EV:70`, `EV:80`; `AVR:106` | D | icons that say nothing and depend on the phone's font | low | S to M | `AA`, `EV`, `AVR`, `FS` | W |
| P-14 | The brand link points to `#inicio`, which does not exist | `UI:33` | D | a link that does nothing | low | S | `UI` | L |
| P-32 | Cancelling a day for many people is one by one | `AVR:340-343`; `openapi.yaml:1008-1035` | M | a holiday costs four taps and a reason per person | low (today) | — | — | B (O-10) |

Suggested order for the implementation slices: P-01 and P-02 (structure of the two busiest ADMIN pages) → P-03, P-12, P-19, P-23 (vocabulary, after Mateo's answer) → P-04, P-31, P-30 (the review) → P-05, P-17, P-24, P-29 (the employee screen) → P-06, P-13, P-07 (navigation and the alerts bar) → the rest.

---

# 7. Needs an owner decision

Nothing here is approved. Each item is a proposal; the decision ID is the row of `docs/DECISIONES.md` it touches or depends on.

| # | Proposal | Why it needs Mateo | Touches |
|---|---|---|---|
| O-1 | Visible words for «jornada» and «desvío» (section 4.1): proposal «día» and «novedad» / «Para revisar» | left open on 2026-11-09 (`odd/tasks/ux-phase1.md` S4; assumption A1 of this task). Visible wording only; internal names, API and SPEC terms stay | no decision contradicted; SPEC:22 documents one interface wording («distancia permitida para marcar»), so new visible terms should be recorded the same way |
| O-2 | The rest of the visible vocabulary as one list: «Locales», «Entrada / Salida» for both roles, shared deviation names, state names, «avisos», «contraseña», verbs for deciding (sections 4.2 to 4.6) | changes what both kinds of users read everywhere, and the fixed text of the push notification (`safeNotification.ts:51-60`) | D-20261014-15 stays respected (the notification keeps counts only) |
| O-3 | A status filter on `GET /inbox` so «Para revisar» can page through undecided cases only | contract and backend change | D-20261027-03 (order and cursor stay as decided; the filter is added). Without it: grouping on the loaded page, or `GET /deviations?status=…` with its 200-row cap (`openapi.yaml:1059-1100`) |
| O-4 | Employee, days other than today: (a) recommended, keep marking possible but name the date on the button and hide the panel for future days; (b) make other days read-only | (b) removes something employees can do today: closing a past day that is still open | D-20261016-05 (when a mark is accepted) is not changed by (a) |
| O-5 | A shorter provisional password, or a shorter minimum for the employee's own password | backend and a security rule | D-20261102-04 (12 characters to 72 bytes), D-20261027-09 (reset); listed as pending in `odd/tasks/ux-phase1.md` S4. Frontend-only relief that needs no decision: not asking for the provisional password a second time (D2, option a), subject to the security review |
| O-6 | In «Dar de alta un empleado», generate the provisional password by default and fold the field for typing one | recommended form keeps the option, so it is a layout change; removing the typed option entirely would drop an existing possibility | D-20261027-09; `openapi.yaml:371-417` (the password is required only for a new DNI) |
| O-7 | Show each person's current schedule in the team list | either one request per person, as the setup check already does for up to 30 (`SS:30-34`), or a new field in `GET /employees` | D-20261015-02 (assignments); contract change if the field is added |
| O-8 | Show in each case how much it deviated («12 minutos tarde») and the schedule | the Bandeja item does not carry the schedule; it needs one `GET /jornadas/{id}` per card or a new field | contract change if the field is added |
| O-9 | The wording for "who to ask" when the ADMIN cannot reset a password («su contraseña la restablece el operador», `CL:56`) | names a person or a channel outside the app | D-20261027-09 |
| O-10 | Gaps of the API that the interface cannot cover and this refactor does **not** propose to build: renaming or removing a local or changing its hour (`openapi.yaml:241-340`); deactivating a schedule (D-20261102-10, item 7); changing the schedule of a day already loaded without cancelling it; cancelling a day for several people at once; applying an edited schedule to days not started (pending in `odd/tasks/ux-phase1.md` S4) | product scope and backend | D-20261014-03 (closed scope). The screens should say plainly what cannot be done instead of leaving the owner to look for it |
| O-11 | Move «Alertas en este dispositivo» from the fixed bar to «Configuración», offer it once in context on the review screen, and list it as an optional last step of the guide | changes where an existing control lives; no rule changes | D-20261027-04 stays as is (per company; sign-out does not cut them) |
| O-12 | Regroup the ADMIN into four destinations (section 5.3, alternative A), merging «Historial» into the days view | a visible restructuring of the whole ADMIN; functions are kept | D-20261023-01 (filter and history by employee, local and range) stays satisfied |

Not proposed, because an adopted decision fixes it: the length of the ADMIN session (D-20261109-02); when a mark is accepted (D-20261016-05); location never blocking a mark (D-20261014-12); no offline queue (D-20261014-13); one explanation per deviation and who decides (D-20261014-07, -08); the order of the Bandeja (D-20261027-03).

---

# 8. Code-shape notes for the refactor

## 8.1 Size and concerns

| File | Lines | Note |
|---|---|---|
| `AV` | 948 | five containers in one file. `SitesView` is 390 lines (`AV:218-608`) with two parallel shapes for the same location form: separate `useState` values for create (`AV:224-235`) and one draft object for edit (`AV:236`), so every handler exists twice (`captureLocationFor` branches at `AV:273-298`; validation at `AV:515-537` and `AV:555-577`; messages at `AV:290` / `AV:296`, `AV:357` / `AV:402`). `JourneysView` (`AV:744-948`) holds about 40 state values declared several per line (`AV:747-763`) for five tasks: day list, single day, detail, three mark forms, change history |
| `AVR` | 474 | lines of up to about 3,000 characters with whole tables in one expression (`AVR:127`, `AVR:274`, `AVR:332`, `AVR:350-352`); `SitesViewRender` takes about 50 props, `JourneysViewRender` about 75 (`AVR:274`). The location block is written twice, for create and for edit (`AVR:166-191`, `AVR:199-228`). Shared pieces live at the bottom of this file and are imported by the others (`LoadFailure`, `PageHeading`: `EVR:6`, `SE:4`; a type: `SS:2`) |
| `EA` | 296 | one container with 27 state values (`EA:34-60`); correct by rule 36, but the mark, the pending explanations and the day load are three concerns that could be three hooks |
| `APC` | 168 | fetches, subscribes and renders in one component: rule 36 does not hold here |

## 8.2 Rule 36 (render components get data and callbacks by props)

- **Holds:** `AdminInbox` / `AdminHistory` / `SitesView` / `EmployeesView` / `JourneysView` (`AV`) → `*Render` (`AVR`, `EVR`); `SchedulesView` (`SV`) → `SE`; `WorkDaysPanel` → `WDF`; `EmployeeApp` → `EV` (stated at `EV:10`); `AdminApp` → `FirstStepsRender`; `SiteMapPanel` and `SiteMapPicker` are presentational.
- **Does not hold or is blurred:** `AdminPushControl` (above); `CompanySwitcher` keeps its own busy and error state (`UI:42-45`); the three auth screens keep form state and call the session callbacks (`AS:14-26`), acceptable but not split; `SiteZoneField` has local state, documented (`SiteZoneField.tsx:8-12`); `AdminApp` is both container and the menu's markup (`AA:78-96`).
- **Containers reach into the page by id** to scroll or focus: `'work-days'` (`AA:71`), `'jornada-detail'` (`AV:822`), `deviation-${id}` (`AV:141`), `employeeDetailId` (`AV:656`), `ISSUED_PASSWORD_ID` (`AV:716`). A shared "reveal and focus" helper would replace five hand-written versions and fix P-01 and P-02 in one place.
- No test protects the split (CLAUDE.md rule 36 says so); the refactor should not rely on it being enforced.

## 8.3 Duplicated logic

| What | Copies |
|---|---|
| Labels for marks, deviations, statuses, categories, locations | `AVR:470-474` (functions) vs `ED:4-20`, `ED:152-155`, `EV:18-27` (records) vs `shared/format.ts:3-9`. One shared module removes P-03 at the source |
| Phone breakpoint hook | `useNarrowScreen` (`features/admin/useNarrowScreen.ts`) and `useMediaQuery(PHONE_QUERY)` (`features/admin/useMediaQuery.ts`), same 520 px query, both used in `AV` (`AV:108`, `AV:622`, `AV:753`) |
| Joining names | `joinNames` (`SS:54`), `joinNames` (`scheduleTramos.ts:162`), `listNames` (`WDF:24`), `joinWords` (`workDays.ts:92`) |
| Today's date | `dateInBrowserZone` (`AV:32`) = `deviceDate` (`shared/dateRange.ts:34`); `calendarToday` (`workDays.ts:24`) ≈ `localCalendarDate` (`features/employee/dayData.ts:30`) |
| Wall-clock time of a local to an instant | `zonedInstant` (`ED:41`) and `instantForSiteTime` (`AV:49`) |
| Coordinate pair validation | `validCoordinates` (`AV:81`) = `siteCoordinates` (`AVR:243`) |
| Error text helper | `errText` (`AV:36`, `SV:12`) |
| Page heading | `PageHeading` (`AVR:464`) exists; the Bandeja and the guide write the same markup by hand (`AVR:81`, `FS:17`) |
| Error + retry | `LoadFailure` (`AVR:459`) exists; written by hand at `AVR:307`, `AVR:434`, `FS:18`, `EA:284`, `EV:111-112` |
| Brand lockup | four copies (`UI:33`, `AS:28`, `AS:50`, `AS:84`) |

## 8.4 Shared components that exist and their gaps (`UI`)

`PageMessage` (info, error, success; no warning, `UI:9`), `Loading`, `Panel` (always `section` + `h2`, `UI:20-23`), `Empty`, `AppHeader`, `CompanySwitcher`, `FormField` (label, hint, error, `UI:75-92`). Missing as components although the pattern repeats: button (class strings typed by hand everywhere), status chip, card, fold (`details`), inline confirmation step, choice group (pressed buttons), list row. Each of those is today a class-name convention.

## 8.5 CSS (`styles.css`, 469 lines, one global file)

- **Tokens:** 14 colour and size tokens on `:root` (`CSS:10-30`) against 106 distinct hex literals in the file; radii of 6, 8, 9, 10, 11, 12, 13, 14, 18 and 22 px; font sizes written per rule (`.75rem` to `1.15rem`). Centralised tokens (S9) start from here.
- **Near-identical card rules:** `.company-choice` (`CSS:145`), `.history-card` (`:192`), `.template-card` (`:218`), `.block-editor` (`:224`), `.deviation-card` (`:256`), `.motive-card` (`:295`), `.journey-option` (`:298`), `.employee-category-option` (`:320`), `.site-location-selection` (`:76`), `.site-map-panel` (`:84`), `.work-days-preview` (`:453`): eleven borders, radii and paddings for one idea.
- **Duplicated rules:** `.field-hint-error` twice (`CSS:69`, `CSS:237`); `.fieldset-plain` (`CSS:443`) repeats `fieldset.field` (`CSS:105`); two fold styles, `.site-location-manual` (`CSS:82-83`) and `.fold` (`CSS:447-451`).
- **Dead rules** (no component uses the class): `.employee-title` (`CSS:270-271`, `:407-408`), `.mark-action-primary` (`CSS:290-294`), `.nav-dot` (`CSS:173`), `.timeline-title` (`CSS:279`), `.mark-action small` (`CSS:288`), `.page-title-row > .field` (`CSS:180`, `:378`). `.mark-action-primary` is kept alive only by a test that reads the stylesheet (`app/styles.test.tsx:54-59`).
- **Classes used with no rule:** `mark-voided` (`AVR:345`, `:351`, `:451`), `mark-row-voided` (`EV:85`), `audit-history`, `audit-items` (`AVR:258-260`, `AVR:379-384`), `history-deviations` (`AVR:452`). A voided mark is told apart only by strikethrough.
- **Class names that no longer say what they style:** `.journey-picker` / `.journey-option` for schedule types (`SE:50`); `.history-card` / `.history-items` for employee cards and day cards (`EVR:70-85`, `AVR:328`); `.site-location-manual` and `.site-location-coordinate-inputs` inside the schedule editor (`SE:77-81`); `.status-justificado` / `.status-motivo_pendiente` for setup steps and for "active" (`FS:24`, `EVR:73`); `.mark-feedback` for the confirmation step (`EV:61`); `.status-chip` for a timestamp (`EV:129`); `.employee-detail` for the password panel (`EVR:21`); `.correction-form` for cancel and void (`AVR:340`, `AVR:353`).
- **Naming pattern:** flat, kebab-case, component prefix plus suffix modifiers (`button-primary`, `nav-link-active`, `template-card-open`). Status classes are built from API values (`status-${state.toLowerCase()}`, `AVR:107`, `AVR:329`, `EV:79`, `EV:159`), which ties class names to the contract's enums.
- **Breakpoints:** 1050, 760, 640, 520 and 400 px; the 760 and 520 blocks are each split in two or three places (`CSS:92`, `:356`; `:241`, `:329`, `:385`); the 520 value is repeated in two hooks.
- **Stylesheet tests:** `app/styles.test.tsx` has 11 tests that parse the text of `styles.css` (selectors, token names, media queries). Any restructuring of the stylesheet has to move those assertions with it; they are the only guard of the contrast and target-size fixes of phase 1.
- **Icons:** Unicode glyphs in text (`AA:13-19`, `EV:70`, `EV:80`, `EV:158`, `AVR:106`, `AVR:163`, `CSS:449-450`). The production CSP allows no external fonts or CDNs (CLAUDE.md rule 22), so icons have to be inline SVG or text.

## 8.6 Constraints the implementation has to keep

- No `localStorage`, `sessionStorage` or IndexedDB (rule 27): the location notice and the interrupted-mark note are module variables (`locationNotice.ts:5`, `interruptedMark.ts:5`); any "remember this" idea has the same limit.
- Every API call through `shared/api/client.ts` (rule 37); the only other `fetch` is the address search (`shared/api/geocode.ts`).
- Success is shown only after the server answers and the retry reuses the idempotency key (`EA:171-181`, `features/employee/markFlow.ts:85-99`): the mark flow's behaviour is covered by 48 tests in `EmployeeApp.test.tsx` and should be restyled, not rewritten.
- `AV` and `AVR` are the files Enrique's #66 and #70 also touch; splitting them is the highest-conflict change of the refactor and should be agreed through Mateo before it starts.
