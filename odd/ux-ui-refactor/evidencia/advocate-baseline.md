# Fichaje Braja — Nontechnical User Advocate, baseline pass (current app)

Scope: the current app, before any redesign. Material: screenshots only, in `ux/baseline/shots/{auth,employee,admin}/`. I did not read source code, repository documents or any other report.

How to read this: I am simulating people, not reporting a usability test. Nobody was observed. Every "a person like this would probably…" is an inference from what is on the screen. File names are relative to `shots/`. On-screen text is quoted exactly, in Spanish. Two screenshots show temporary passwords of the test stack; I describe their shape and do not copy them.

Coverage: every screen family, mainly at `--390-viewport` and `--390`, and at `--1366` for the owner's screens. The test data has odd values (a shift "20:00 a 04:00", "240 minutos de tolerancia", every mark at "21:22"); I treat those as test data and judge wording and layout, not the numbers.

---

## 1. Walk-throughs

For each task: whether I could tell where to start, where I hesitated, words I did not understand, moments I could not tell what was saved or what a tap would do, what scared me, and how the screen answers ¿Dónde estoy? / ¿Qué estoy viendo? / ¿Qué puedo hacer? / ¿Qué pasa si toco?

### Employee tasks

**1. First time in with a DNI and a password on paper** — start: yes. Result: with doubt (probably stuck for some people at the password step).

- `auth/login--empty--390-viewport.png`: "Bienvenido", "Ingresá con tu DNI y contraseña.", two boxes, one dark button "Ingresar". I know what to do. "INGRESO AL SISTEMA" above the title adds nothing but does no harm.
- Hesitation: "DNI" — ¿lo escribo con puntos o sin puntos? Nothing says.
- Hesitation: the password my boss gave me. `admin/empleados--alta-creado-con-clave-provisoria--390-viewport.png` shows its shape: four groups of four letters and digits, upper and lower case mixed, separated by hyphens. On a cheap phone keyboard that means switching between capitals, lower case and numbers about a dozen times. "Mostrar contraseña" helps, and it is a real button with words, which is good.
- `auth/cambio-de-clave--vacio--390.png`: "PRIMER INGRESO", "Cambiá tu contraseña", "Cambiá la contraseña que te dieron por una tuya. Elegí una clave de al menos 12 letras o números. Puede ser una frase." The first box is "Contraseña que te dieron": I have to type that long code a second time, seconds after typing it to get in. A person like this would probably think "¿otra vez? ¿hice algo mal?".
- "al menos 12 letras o números" is a lot for someone whose other password is a 4-digit PIN. "Puede ser una frase" is a good hint but gives no example. The counter "Llevás 0 de 12." / "Llevás 22: alcanza." is clear and kind.
- The page uses "contraseña" and "clave" for the same thing in the same paragraph.
- Fear: "Cerrar sesión" sits directly under "Guardar contraseña", same width. I do not know what "cerrar sesión" does to what I typed; a slip of the thumb throws me out.
- Errors are plain: "La clave nueva tiene que tener al menos 12 letras o números.", "Las contraseñas nuevas no coinciden.", "Escribí la contraseña actual, la que te dieron para entrar." They appear at the top of the card, not next to the box that is wrong.
- Not shown: what I see right after saving.
- Four questions: Where — clear ("Fichaje Braja", "Bienvenido", "Primer ingreso"). What — clear. What can I do — clear. What happens if I tap — clear for "Ingresar" and "Guardar contraseña"; unclear for "Cerrar sesión".

**2. Register my arrival** — start: yes. Result: clear.

- `employee/dia--sin-empezar--390-viewport.png`: "Hola, Ana Gómez", "Todavía no marcaste tu entrada.", and one large dark button "Marcar entrada". The best screen in the app: my name, my situation in one sentence, one obvious action.
- Small doubt: the card title is "Marcar". Marcar what? The button answers it, so it does not stop me.
- `employee/marcar--aviso-de-ubicacion--390-viewport.png`: "Para marcar necesitamos saber que estás en el local. Solo se mira en el momento de marcar." with "Continuar" and "Volver". Honest and short. A worried person still asks "¿me siguen con el teléfono?"; the second sentence answers it.
- Not shown: the phone's own permission question after "Continuar", and what the app says if I answer no.
- Four questions: all four answered on the first screen.

**3. How do I know it was registered?** — Result: clear.

- `employee/marcar--entrada-confirmada-en-curso--390-viewport.png`: green box "✓ Listo: tu entrada quedó registrada a las 21:22." and "Ubicación enviada ✓"; the sentence under my name becomes "Estás trabajando desde las 21:22."; lower down, "Entrada 21:22". Three confirmations that agree. I would trust it.
- Doubt: the pill "En curso" next to "Tus marcas de hoy". ¿En curso qué?
- Doubt: under "Tu horario" it still says "Tenés 240 minutos de tolerancia para entrar." after I entered, and even after I finished the day (`employee/dia--terminado-salida-confirmada--390-viewport.png`). "Tolerancia" is not a word this person uses.
- Not shown: how long the green box stays.

**4. Go to breakfast and come back** — start: yes. Result: clear.

- "Me voy a desayunar" → `employee/marcar--pausa-desayuno-abierta--390-viewport.png`: "Estás desayunando: volvé antes de las 21:37." and the only button is "Volví del desayuno". First-person buttons in everyday words; the sentence gives the time I must be back. Excellent.
- Doubt: once breakfast is used, its button is simply gone (`employee/dia--en-curso-pausas-usadas--390-viewport.png` shows only "Marcar salida"). If I need to step out again, nothing tells me why I cannot.
- Not shown: whether the location notice appears again on every tap.

**5. The app says I have to explain something** — start: with doubt. Result: with doubt.

- On the first screen (`employee/dia--sin-empezar--390-viewport.png`) nothing at the top says I owe an explanation. The card "Para explicar" starts at the bottom edge of what the phone shows; the sentence under my name talks only about the entrance. A person like this would probably mark the entrance, see the green box and close the app.
- Once found, the form is good: "Faltó la salida", "No marcaste tu salida. ¿Qué pasó?", four choices with examples ("Transporte: el colectivo, el tren o el tránsito te demoraron"), "Contá qué pasó" with "Por ejemplo: hubo paro de colectivos.", button "Enviar motivo". "Lo que escribas solo lo ven vos y tu encargado." lowers the fear.
- Hesitation: the grey chip "8 nov 2026, 8:00 p. m." next to the title. Is that when I should have left, or when the app noticed? The format differs from the "21:22" used elsewhere on my screen.
- Hesitation: "Te fuiste 405 minutos antes (tu salida era 04:00)" (`employee/motivo--enviado--390-viewport.png`). Nobody thinks in 405 minutes.
- With two things to explain: after I send the first (`employee/motivo--enviado--390-viewport.png`) the green box "✓ Lo enviamos. Tu encargado lo va a revisar." sits directly above another form that looks exactly the same and is empty. A person like this would probably think the form was wiped and the text lost, or send the same story twice.
- If I forget to choose the type, the message is a small red "Elegí una de las opciones." under the options (`employee/motivo--error-falta-elegir-tipo--390.png`); easy to miss, and on a long page it may be off screen.
- Below there is a second card, "Desvíos del día", repeating the same case with a pill "Falta explicar". "Desvío" is not a word I know; it sounds like I did something wrong. Later the pill becomes "A revisar", "Justificado" or "No justificado" (`employee/otro-dia--desvios-a-revisar-y-no-justificado--390.png`). "No justificado" comes with no sentence about what it means for me or what I can do. That one scares me.
- While I look at another day ("Estás viendo el 9 nov 2026.") the "Para explicar" card shows a case dated "10 nov 2026". I cannot tell which day it belongs to.
- "Tu almuerzo duró 0 minutos y tenías 60." under "Almuerzo largo" contradicts itself (probably test data, but it shows the sentence does not protect against odd numbers).
- Four questions: Where — clear. What — two cards about the same thing with different names. What can I do — clear once found. What happens if I tap — "Enviar motivo" clear; "Podés cambiarlo hasta que lo revise" is a good promise.

**6. Leaving early** — start: yes. Result: clear.

- "Marcar salida" → `employee/marcar--confirmar-salida-antes-de-hora--390-viewport.png`: "¿Terminás tu día ahora? Tu horario termina a las 04:00." with "Sí, marcar salida" and "No, seguir trabajando". Both buttons say what they do. This is how a confirmation should read.
- Afterwards: "Ya terminaste tu día." and "✓ Listo: tu salida quedó registrada a las 21:22."
- Doubt: nothing tells me at that moment that I will now be asked to explain it; the "Salida temprana" case appears further down the page.

**7. See yesterday, then come back to today** — start: no. Result: with doubt.

- The way is "Ver otros días", the last card of the page. On a day with a pending explanation the page is roughly four phone screens long (`employee/dia--sin-empezar--390.png`).
- The control is a bare date box "dd/mm/aaaa" with a tiny calendar icon and "Elegí un día para ver sus marcas." There is no "Ayer" button. The phone's calendar picker is where an older worker is most likely to give up. ("sus marcas" should be "tus marcas".)
- After choosing, the sentence under my name becomes "Estás viendo el 9 nov 2026." — good — but I chose at the bottom and the answer is at the top; not shown whether the page jumps up.
- "Volver a hoy" exists only at the very bottom, under the date box (`employee/otro-dia--desvios-a-revisar-y-no-justificado--390.png`). At the top nothing offers the way back. The screenshots show no "Marcar" card on a past day, which is right, but nothing says so, and a nervous person may fear marking on the wrong day.
- Word: "Finalizada" next to "Tus marcas del 9 nov 2026".

**8. Something failed when I tapped** — start: yes. Result: clear for no internet; not evaluable for the rest.

- `employee/marcar--error-sin-internet--390-viewport.png`: "No hay internet. Tu marca no se registró. Cuando vuelva la conexión, tocá el mismo botón otra vez." It says what happened, whether it counted, and what to do. Very good.
- Doubt: "el mismo botón" is not named. Doubt: a small grey "Actualizar" appears under the message; I do not know if I must tap it first.
- `employee/dia--no-se-pudo-cargar-sin-internet--390.png`: "No pudimos cargar tu día", "No hay internet. Revisá la conexión y tocá Reintentar.", button "Reintentar". Clear.
- `employee/dia--hoy-sin-turno-cargado--390.png`: "Hoy no tenés turno cargado. Si tenés que trabajar, avisale a tu encargado." No button at all. Honest, but a worker standing at the door cannot register that they came; "turno cargado" is the app's inside language.
- `auth/login--sesion-vencida--390-viewport.png`: "Tu sesión venció. Iniciá sesión nuevamente." Shown in red as if I did something wrong; "sesión" is jargon.
- No screenshot shows: location refused or switched off, the server failing, or a tap that takes long.

### Owner tasks

**9. First time in: what do I have to do?** — start: with doubt. Result: clear once on "Primeros pasos".

- `admin/primeros-pasos--fresh-install--390.png`: "Primeros pasos", "Seguí estos pasos en orden. Cuando estén todos listos, tu equipo ya puede marcar.", "0 de 5 pasos listos", five numbered steps in my words ("Tu local", "Tus horarios", "Tu equipo", "Cada uno con su horario", "Días de trabajo cargados"), each with "Falta"/"Listo" and "Ir". When done: "Listo: mañana pueden marcar 5 personas. Volvé cada mes a cargar los días." This is the guide a first-time owner needs.
- I cannot tell whether this is the screen that opens after my first login, or "Bandeja" (`admin/bandeja--empty-fresh-install--390.png` says only "No hay desvíos para mostrar." and does not point to the steps).
- Hesitation: the buttons say only "Ir". ¿Ir a dónde? Only step 1's is dark.
- The steps speak of "local" and "equipo"; the menu they send me to says "Sedes" and "Empleados". Step 5 does not say it happens in "Jornadas".
- Before I read a single step, the top third of the phone is menu: seven items in three rows ("Primeros pasos, Bandeja, Jornadas, Historial, Sedes, Horarios, Empleados"), plus "Cómo instalar" and "Cerrar sesión", plus a bar stuck to the bottom, "Avisos: desactivados" / "Activar avisos".
- When the five steps are done the menu order changes: "Primeros pasos" moves to the end and "Bandeja" becomes first (`admin/primeros-pasos--todo-listo--390.png`). Things moving by themselves is what makes this person feel they broke something.

**10. Add my shop and say where it is** — start: with doubt. Result: with doubt, likely wrong outcome.

- `admin/sedes--fresh-install-one-site-without-location--390.png`: a shop already exists, "Sede Centro", that I did not create or name, with "Sin ubicación cargada". Its buttons are "Cambiar ubicación" (there is nothing to change yet) and "Ver historial de ubicación". Right under it is a large form "Agregar sede" with the friendly question "¿Dónde queda el local?" and the dark button "Elegir en el mapa". A person like this would probably fill that form and end up with two shops; step 1 of "Primeros pasos" would still say "Falta dónde queda: Sede Centro."
- I see no way to rename "Sede Centro".
- Subtitle: "Cada sede define su zona horaria y sus horarios." "Zona horaria" means nothing to me; the field itself is better ("Hora del local" — "Elegí la provincia del local, así las horas se ven como en su reloj.").
- The map path is good: "Buscá la dirección del local", "Tocá en el mapa la puerta del local.", then "Punto marcado. El círculo muestra los 100 m permitidos para marcar. Si no es la puerta, tocá de nuevo." (`admin/sedes--agregar-mapa-punto-elegido--390-viewport.png`).
- Too many confirmations: tap the map → "Confirmar ubicación" → a tick box "Confirmo que este punto corresponde a la sede." → "Crear sede". After the second one the screen says "Ya podés guardar la sede." but the button is called "Crear sede".
- Shown though I never asked: "Latitud -34.6041969 · Longitud -58.3878267", "Escribir las coordenadas a mano", "Precisión informada por el dispositivo: ±12.0 m (estimación; no garantiza exactitud)."
- "Capturar ubicación del dispositivo": I do not know what "dispositivo" is, nor that I must be standing in the shop. Its failures are the most technical text in the app: "Precisión insuficiente: El dispositivo informó una precisión de 80.0 m; solo se aceptan hasta 25 m. El punto no se guardó. … o crear la sede sin centro." and "Permiso de ubicación: El navegador o el dispositivo denegó el permiso. Habilitá la ubicación para este sitio en el navegador y en el sistema operativo…"
- If I forget the tick box, the red message "Confirmá que el nuevo punto corresponde a esta sede antes de guardarlo." appears at the top of the page, far from the box (`admin/sedes--cambiar-ubicacion-error-sin-confirmar--390-viewport.png`).
- "Distancia permitida para marcar (metros)" with "Si no sabés, dejá 100 m." is a good way to ask a hard question.
- Defect, not wording: `admin/sedes--historial-de-ubicacion-PANTALLA-EN-BLANCO--390-viewport.png` is an entirely empty screen: no menu, no text, no way back. A person like this would be sure they broke the app.

**11. Create the working hours** — start: yes. Result: with doubt.

- `admin/horarios--empty-fresh-install--390.png`: "Armá los horarios de cada local: a qué hora entran, a qué hora salen y cuánto pueden tardar en desayunar y almorzar." Then "¿Cómo es este horario?" with "Corrido — De 09:00 a 17:00", "Cortado — De 09:00 a 13:00 y de 17:00 a 21:00", "De noche — De 22:00 a 06:00 del día siguiente", and "Elegí el que más se parece. Después podés cambiar las horas." These are the words a shop owner in Argentina uses. "Así queda" shows the result before saving. Very good.
- Hesitation: "Tramo 1", "1 de 4 tramos", "+ Agregar otro tramo". "Tramo" is not how I talk.
- Hesitation: "Minutos para desayunar" / "Minutos para almorzar" with "Si la pausa dura más, te avisamos en la Bandeja. Con 0, te avisamos de cualquier pausa." Does 0 mean they may not have lunch, or that I am told every time? The list then shows "sin tiempo para almorzar", which reads like a prohibition. And I do not yet know what "la Bandeja" is.
- After "Crear horario" on the phone I see "Horario «Intermedio» creado." and the list (`admin/horarios--creado-paso-asignar-personas--390-viewport.png`). The next question, "¿Quién trabaja con este horario?", is below everything, partly under the "Avisos" bar. A person like this would probably stop here, believing they are done.
- That question's text: "Desde ese día, cuando cargues sus días de trabajo se usa este horario. Los días que ya cargaste no cambian." I had to read it three times. "Asignar" is a dull grey-green that looks switched off; "Ahora no" is clear.
- "Bruno Díaz y Ana Gómez ya tenían un horario desde ese día. Para cambiarlo, elegí otro día." (`admin/horarios--asignado-resultado--1366.png`) appears in a soft green box, so I cannot tell whether the others were saved or nothing was.

**12. Add an employee and give them a schedule** — start: yes. Result: with doubt.

- `admin/empleados--empty-fresh-install--390.png`: "Cada persona entra con su DNI. Acá la das de alta, elegís en qué locales trabaja y qué horario tiene." Clear. With staff already loaded, the form "Dar de alta un empleado" is under the whole list; with seven people that is many screens down (`admin/empleados--lista--390.png`), and nothing at the top offers "agregar".
- "Minutos de tolerancia" — the helper is good ("Son los minutos que puede llegar tarde o salir antes o después sin que te avisemos.") but the label is the jargon.
- "Contraseña provisoria" — "Solo hace falta si el DNI todavía no tiene cuenta. De 12 a 72 caracteres; las letras con tilde y la ñ cuentan como 2." I do not know whether this DNI "tiene cuenta", and the rule about tildes is a programmer's sentence. "Generar contraseña" saves me, if I notice it.
- After creating (`admin/empleados--alta-creado-con-clave-provisoria--390-viewport.png`): "Contraseña provisoria de Hugo Benítez", the code, "Entregásela en persona; se pide cambiarla al ingresar.", "No se vuelve a mostrar." and "Listo, ya la entregué". Good and honest. But: "Si ese DNI ya tenía cuenta en Fichaje, esta no se usa: sigue entrando con la suya." — so is this code good or not? And it is the long mixed-case code I must copy by hand onto paper.
- Wrong DNI: "Esa persona ya tiene un rol en esta empresa." (`admin/empleados--alta-con-dni-repetido--390-viewport.png`), at the top of the page, far from the form. "Rol" is jargon; it does not say what to do.
- Nothing tells me the new person still has no schedule. I have to guess the "Horarios" button on their card. The panel is fine once open ("Elegí el horario y desde qué día lo usa.", "Todavía no tiene horarios asignados.", "Asignar horario"); the button is again the dull colour.
- "Horarios" on a person's card and "Horarios" in the menu are two different things with one name.

**13. Load this month's working days** — start: with doubt. Result: with doubt.

- Nothing in the menu says "cargar días"; it is under "Jornadas". Why I must do this at all is said only in "Primeros pasos" and in the red warning "Mañana nadie tiene día cargado en Sede Norte: cargalos para que puedan marcar." (which does have a "Cargar días" button — good).
- The form speaks the owner's language: "¿Qué días trabajan?" (Lunes a viernes / Lunes a sábado / Todos), "¿Para qué período?" (Esta semana / Próximas 2 semanas / Lo que queda del mes / Mes que viene / Elegir fechas), "¿Quiénes? (7 de 7)", and before the button: "Vas a cargar 18 días (lunes a sábado, del 10 al 30 de noviembre) para 7 personas." That sentence is the best thing on the owner's side: it tells me what will happen before I tap.
- Hesitation: "Se cargan una sola vez. Para el mes siguiente, volvé a esta pantalla." "Una sola vez" sounds as if I cannot fix a mistake.
- Result (`admin/jornadas--cargar-dias-resultado-con-omitidos--390-viewport.png`): "No se cargó ningún día. No se cargaron 35: Ya tenían día cargado: … (30) / Sin horario asignado: Hugo Benítez (5)" in a green box. Green says "all good"; the text says nothing was loaded. I cannot tell whether to worry. ("Asignar horario" next to Hugo is a good shortcut.)
- Fresh install (`admin/jornadas--empty-fresh-install--390.png`): "¿Quiénes? (0 de 0)", "Vas a cargar 18 días … para 0 personas." and "Cargar días" still looks ready to tap.
- Subtitle "Cada día sigue el calendario de su local.": I do not know what it means.

**14. Someone arrived late: find it and decide** — start: yes. Result: with doubt.

- `admin/bandeja--con-casos-y-aviso-de-dias--1366.png` / `--390.png`: the case is there: "Llegada tarde", "A revisar", "Diego López · 10 nov 2026, 9:15 p. m.", "Motivo: Transporte · El tren de las 19 se canceló y el siguiente vino lleno.", buttons "Ver jornada", "Justificado", "No justificado". I can decide from the card. Good.
- Words: "CENTRO DE CONTROL", "Bandeja de desvíos", "Revisá motivos y resolvé cada caso. Las notificaciones no incluyen datos privados." (the second sentence answers a question I never had). "Marca: Ingreso" tells me nothing. Other titles need translating: "Egreso temprano", "Egreso tardío", "Egreso sin marcar", "Exceso de almuerzo", "Fuera de sede", "Sin ingreso".
- The card does not say how late. It shows a time, not "llegó 20 minutos tarde".
- "Falta motivo" versus "A revisar": I worked out that the first means the employee has not explained yet, but the card does not tell me to wait, and "Justificado"/"No justificado" are offered anyway.
- What happens when I tap "Justificado"? It seems to save at once ("Clasificación guardada.", `admin/bandeja--clasificacion-guardada--390-viewport.png`) with no question. Changing my mind later is "Corregir a no justificado" plus a compulsory "Motivo de corrección". A slip of the thumb costs me a written justification. That makes me afraid to tap.
- On the phone the list is long, every case has three stacked buttons, and the "Avisos" bar covers the bottom row of whichever card is at the edge.

**15. An employee forgot to register their exit yesterday** — start: with doubt. Result: with doubt.

- Two ways: the Bandeja case "Egreso sin marcar" → "Ver jornada", or "Jornadas" → find the "Fecha" box → yesterday → "Ver marcas".
- "Ver jornada" takes me to the whole "Jornadas" page: first the bulk loading form, then "Cargar o cambiar un solo día", then the day's list, and last "Marcas de Ana Gómez" (`admin/jornadas--abierta-desde-bandeja-egreso-sin-marcar--1366.png`). The phone screenshot starts at the right card, so the app seems to scroll there; if it does not, I land on a form about loading days and think I am in the wrong place. There is no visible way back to the case I came from.
- The form itself speaks well: "Agregar una marca que faltó", "¿Qué marca faltó?", "¿Por qué la agregás?", "Queda guardado que la agregaste vos y por qué." Honest about leaving a trace.
- Hesitation: "Egreso" in the list, when the employee's own screen says "Salida". "Hora (Sede Centro)" is a box "dd/mm/aaaa --:--": I must enter the full date again, in a field type that is awkward on a phone. Why does it name the shop?
- "Agregar marca" is the dull colour until filled; it looks broken.
- When something does not fit: "No se puede anular esa marca: las marcas que quedan no forman una jornada válida (por ejemplo, un ingreso con marcas posteriores). Anulá o corregí antes las posteriores." (`admin/jornadas--anular-marca-rechazada--390-viewport.png`). I would not know what to do next.
- Next to each mark: "Corregir" and a red "Anular". I do not know the difference between "anular" a mark and "cancelar" a day, or whether either can be undone. The explanation exists but only after I tap ("La marca no se borra: queda visible como anulada…").
- "No aplica" next to a mark: no aplica what?

**16. An employee forgot their password** — start: yes. Result: clear, with one frightening sentence.

- The login tells the employee "¿Te olvidaste la clave? Pedile al encargado una nueva." Good: no email flows.
- Owner: "Empleados" → on the person, "Restablecer contraseña" → "Se cierran todas sus sesiones y se genera una contraseña provisoria." → "Confirmar restablecimiento" / "Cancelar" → "Contraseña provisoria de Diego López", the code, "Entregásela en persona; se pide cambiarla al ingresar.", "No se vuelve a mostrar. Sus sesiones abiertas se cerraron.", "Listo, ya la entregué".
- Words: "Restablecer", "restablecimiento", "sesiones", "provisoria". "Se cierran todas sus sesiones" sounds as if I am about to delete something of theirs.
- On the phone the first screen after tapping looks unchanged (`admin/empleados--restablecer-clave-confirmar--390-viewport.png`); the confirmation is inside that person's card further down. Not shown whether the page moves there.
- Inactive person: "Está inactivo: activalo para restablecer su contraseña." Clear.

**17. Everything about one employee's day, including who changed what** — start: no. Result: stuck or nearly.

- I would go to "Historial" (the name promises it). `admin/historial--resultados-de-una-persona--1366.png` gives the days and marks, even "Egreso — Anulada · Marcó la salida por error cuando se iba a almorzar", but not who did it or when, and I see no button to open the day.
- The who-changed-what list is elsewhere: "Jornadas" → date → "Ver marcas" → scroll past the marks and past "Agregar una marca que faltó" → a grey line "Historial de cambios" with a small button "Ver historial" (`admin/jornadas--detalle-con-marca-anulada-e-historial-de-cambios--390-viewport.png`). Two different things are called "Historial".
- Once open it is readable: "Marca corregida: Ingreso de 9 nov 2026, 8:10 a. m. → Ingreso de 9 nov 2026, 8:03 a. m.", "Por Marta Admin", "Motivo: El reloj del local estaba adelantado". Less so: "Marca olvidada incorporada", "Desvío detectado: Egreso sin marcar", "Desvío cerrado", "Automático del sistema".
- "Historial" form: the boxes say "Empleado: Todos" and "Sede: Todas", and "Buscar" answers "Elegí un empleado o una sede." The screen offers "Todos" and then refuses it.
- In the results every line repeats the full date ("10 nov 2026, 9:22 p. m.") already in the heading; "Ubicación recibida" / "No aplica" on every line is noise for me.

**18. I want my phone to warn me when someone does not show up** — start: yes. Result: with doubt.

- On the phone a bar is always at the bottom: "Avisos: desactivados" and "Activar avisos". Easy to find.
- It does not say what I will be told. Only the desktop version does: "Alertas en este dispositivo — Desactivadas para Braja; cada empresa se activa por separado. Solo avisan sobre ingresos pendientes o llegadas tarde." (two names, "Avisos" and "Alertas", for one thing; "ingresos pendientes" instead of "alguien no llegó").
- If it fails: `admin/avisos--error-al-activar--390-viewport.png` shows a red box in English, "Registration failed - permission denied". I cannot read it and have no next step.
- If the phone blocked it: "Avisos: bloqueados en este navegador" with no button and no help (`admin/avisos--bloqueados-en-el-navegador--390-viewport.png`). Dead end. The desktop version says "Habilitalos desde los permisos del sitio.", which I would not know how to do.
- Not shown: what "Activar avisos" asks me, what a warning looks like when it arrives, and whether I first have to do "Cómo instalar". Opening one lands on "Abriste el desvío indicado por la notificación." and I cannot see which case that is in the first screen.
- The bar also covers the last buttons of whatever is behind it on every owner screen.

**19. Find a day from last week** — start: with doubt. Result: with doubt.

- Two candidates, "Jornadas" and "Historial"; I would not know which.
- In "Jornadas" the "Fecha" box is after two large cards (several screens down on the phone); it is a bare "dd/mm/aaaa" box. There are no "ayer" / "semana pasada" shortcuts, though the same page has friendly ones for loading days.
- In "Historial" I get "Desde" and "Hasta" already filled with the last week — good — but must first pick a person or a shop (see task 17). Dates in the wrong order give "La fecha desde no puede ser posterior a la fecha hasta.", which on the phone is cut off by the "Avisos" bar (`admin/historial--error-rango-de-fechas--390-viewport.png`).
- "Jornadas del martes, 10 de noviembre de 2026" as the list title is clear once I am there.

---

## 2. The 15 worst comprehension problems

Ordered by how many people each would stop and how often the screen is used. Each has the file, the exact text, why it confuses, and a concrete fix.

**1. The employee is not told at the top that an explanation is pending, and after sending one the next empty form looks as if the first was lost.**
Files: `employee/dia--sin-empezar--390-viewport.png`, `employee/motivo--enviado--390-viewport.png`. Text: "Para explicar"; "✓ Lo enviamos. Tu encargado lo va a revisar." above an identical empty form.
Why: used every day by every employee; the request is below the first screen and the confirmation is ambiguous.
Fix: under the greeting, one line that can be tapped: «Tenés 2 cosas para explicarle a tu encargado.» Number the cards («1 de 2»). After sending, replace that card with «✓ Enviado: “Llegaste tarde” (10 nov). Tu encargado lo va a revisar.» and title the next one «Te queda 1 más para explicar».

**2. The employee's daily screen uses the system's words for the person's own situation.**
Files: `employee/dia--sin-empezar--390.png`, `employee/otro-dia--desvios-a-revisar-y-no-justificado--390.png`. Text: "Desvíos del día", "Sin ingreso", "En curso", "Finalizada", "Tenés 240 minutos de tolerancia para entrar.", "No justificado", "Te fuiste 405 minutos antes".
Why: "desvío" and "no justificado" read as accusations and come with no consequence or next step; "tolerancia" and minutes above an hour need translating.
Fix: «Desvíos del día» → «Lo que pasó hoy»; «Sin ingreso» → «Todavía no entraste»; «En curso» → «Trabajando»; «Finalizada» → «Día terminado»; tolerance line → «Podés entrar hasta las 8:05 sin que cuente como tarde.»; «405 minutos antes» → «6 horas y 45 minutos antes»; «No justificado» → «Tu encargado no lo aceptó. Si no estás de acuerdo, hablá con él.»; «Justificado» → «Tu encargado lo aceptó.»; «A revisar» → «Tu encargado todavía no lo vio».

**3. First login: a long mixed-case code typed twice, then a 12-character password, with "Cerrar sesión" under the save button.**
Files: `auth/cambio-de-clave--vacio--390.png`, `admin/empleados--alta-creado-con-clave-provisoria--390-viewport.png`. Text: "Contraseña que te dieron", "Elegí una clave de al menos 12 letras o números. Puede ser una frase.", "Cerrar sesión".
Why: every employee passes through it once and cannot use the app until they do; it is the hardest typing in the whole product, in the first minute.
Fix: do not ask again for the code just used to get in. Make the code handed on paper short and without capitals (for example 8 digits in two groups). Text: «Elegí tu clave nueva. Tiene que tener 12 letras o números como mínimo. Lo más fácil es una frase, por ejemplo: mi perro se llama toby.» Move «Cerrar sesión» away from the button and call it «Salir sin cambiar». Use only «clave» or only «contraseña». Under DNI: «Solo números, sin puntos.»

**4. "Ver otros días" and "Volver a hoy" are at the bottom of a long page, behind a bare date box.**
Files: `employee/dia--sin-empezar--390.png`, `employee/otro-dia--desvios-a-revisar-y-no-justificado--390.png`. Text: "Ver otros días", "Día", "dd/mm/aaaa", "Elegí un día para ver sus marcas.", "Volver a hoy".
Why: a person afraid of the phone will not scroll four screens or use a calendar picker, and once on another day cannot see the way back.
Fix: buttons «Ayer» and «Otro día» right under the day's marks; when looking at another day, at the top: «Estás viendo el lunes 9 de noviembre.» with a button «Volver a hoy» beside it. Correct the helper to «para ver tus marcas».

**5. The owner's menu on the phone: seven unclear names in three rows that take the top third of every screen, and whose order changes.**
Files: `admin/primeros-pasos--fresh-install--390-viewport.png`, `admin/primeros-pasos--todo-listo--390.png`, `admin/navegacion--fila-que-se-desliza--600.png`. Text: "Primeros pasos, Bandeja, Jornadas, Historial, Sedes, Horarios, Empleados".
Why: present on every owner screen; "Bandeja", "Jornadas", "Historial" and "Sedes" do not say what is inside; content starts half-way down.
Fix: names by task: «Para revisar» (Bandeja), «Días de trabajo» (Jornadas), «Buscar días pasados» (Historial), «Locales» (Sedes), «Horarios», «Empleados», «Primeros pasos». Keep the order fixed. Show at most four on the phone, the rest under «Más».

**6. Bandeja: the case card speaks in "egreso/desvío/marca", does not say how much, and saves the decision on one tap.**
Files: `admin/bandeja--con-casos-y-aviso-de-dias--1366.png`, `admin/bandeja--clasificacion-guardada--390-viewport.png`, `admin/bandeja--corregir-clasificacion-formulario--390-viewport.png`. Text: "CENTRO DE CONTROL", "Bandeja de desvíos", "Egreso temprano", "Falta motivo", "Marca: Egreso", "Justificado", "No justificado", "Clasificación guardada.", "Corregir a justificado", "Motivo de corrección".
Why: the owner's most used screen; each title has to be translated and another page opened to learn how late someone was; undoing a slip costs a written reason.
Fix: title «Para revisar» with «Acá aparece cuando alguien llega tarde, falta, se va antes o tarda de más en una pausa.» Cards as sentences: «Diego López llegó 20 minutos tarde (entraba a las 8:00, marcó 8:20).» / «Ana Gómez se fue 1 hora antes.» / «Fabio Sosa no marcó la salida.» / «Elena Paz tardó 25 minutos de más en el almuerzo.» / «Carla Ruiz marcó lejos del local.» / «Gisela Torres no vino.» Pills: «Falta motivo» → «Todavía no explicó»; «A revisar» → «Ya explicó: decidí vos». Buttons: «Lo acepto» / «No lo acepto»; after tapping: «Guardado: aceptaste la explicación de Diego.» with «Deshacer» for a short while. Remove «Marca: Egreso».

**7. "Jornadas" is four tools on one page; the day I came to see is at the bottom.**
Files: `admin/jornadas--abierta-desde-bandeja-egreso-sin-marcar--1366.png`, `admin/jornadas--hoy--390.png`. Text: "Cargar días de trabajo", "Cargar o cambiar un solo día", "Jornadas del martes, 10 de noviembre de 2026", "Marcas de Ana Gómez", "Agregar una marca que faltó", "Historial de cambios".
Why: "Ver jornada" from a case lands on a page that begins with a form about loading days; on a phone with one day open the page is extremely long.
Fix: separate «Cargar días de trabajo» from «Ver un día». «Ver el día» from a case opens only that person's day, with a visible «← Volver a Para revisar».

**8. Two things called "Historial"; the who-changed-what list is hidden; the search offers "Todos" and then refuses it.**
Files: `admin/historial--initial--390.png`, `admin/historial--validation-error-nothing-chosen--390.png`, `admin/jornadas--detalle-con-marca-anulada-e-historial-de-cambios--390-viewport.png`. Text: "Historial", "Empleado: Todos", "Sede: Todas", "Elegí un empleado o una sede.", "Historial de cambios", "Ver historial".
Why: the owner looks for the trace in the place named after it and does not find it.
Fix: menu «Buscar días pasados»; first option of the box «Elegí una persona» (not «Todos»); each result with a button «Ver este día»; inside the day, «Cambios hechos a mano en este día (5)» right under the marks, with lines like «Marta cambió la entrada de 8:10 a 8:03. Motivo: el reloj del local estaba adelantado.»

**9. A shop that already exists without location, beside a big "Agregar sede" form, invites creating a duplicate.**
File: `admin/sedes--fresh-install-one-site-without-location--390.png`. Text: "Sede Centro", "Sin ubicación cargada", "Cambiar ubicación", "Agregar sede", "¿Dónde queda el local?".
Why: it is step 1 for every new owner, and the visible path leads to the wrong result while the checklist keeps saying "Falta".
Fix: on the existing shop, a dark button «Decir dónde queda» (not «Cambiar ubicación») and «Cambiar nombre»; on it, «Falta decir dónde queda este local.» Fold the new-shop form behind «Agregar otro local». Use «local» everywhere (the screen mixes "sede" and "local").

**10. Telling the app where the shop is exposes coordinates, precision and three confirmations, with technical errors.**
Files: `admin/sedes--agregar-punto-del-mapa-confirmado--390-viewport.png`, `admin/sedes--agregar-captura-poco-precisa--390-viewport.png`, `admin/sedes--agregar-captura-sin-permiso--390-viewport.png`, `admin/sedes--cambiar-ubicacion-error-sin-confirmar--390-viewport.png`, `admin/sedes--historial-de-ubicacion-PANTALLA-EN-BLANCO--390-viewport.png`. Text: "Capturar ubicación del dispositivo", "Latitud -34.6041969 · Longitud -58.3878267", "Escribir las coordenadas a mano", "Confirmo que este punto corresponde a la sede.", "Precisión insuficiente: …", "crear la sede sin centro", "en el navegador y en el sistema operativo".
Fix: main path only the map. «Capturar ubicación del dispositivo» → «Estoy en el local ahora: usar mi ubicación». Hide coordinates behind «Opciones avanzadas». One confirmation: «Confirmar ubicación» on the map is enough. Errors: «Tu teléfono no pudo ubicarte con precisión. Mejor buscá la dirección en el mapa y tocá la puerta del local.» / «Tu teléfono no dejó usar la ubicación. Buscá la dirección en el mapa.» Put any error next to the control it refers to. Fix the blank screen of «Ver historial de ubicación» and reword «Esta sede todavía no tiene cambios de ubicación auditados.» → «Nadie cambió la ubicación de este local todavía.»

**11. Warnings ("Avisos"): an error in English, a dead end, no explanation on the phone, and a bar that covers buttons.**
Files: `admin/avisos--error-al-activar--390-viewport.png`, `admin/avisos--bloqueados-en-el-navegador--390-viewport.png`, `admin/avisos--bloqueados-en-el-navegador--1366.png`. Text: "Registration failed - permission denied", "Avisos: bloqueados en este navegador", "Avisos: desactivados", "Alertas en este dispositivo".
Fix: bar text «¿Querés que este teléfono te avise si alguien no llega o llega tarde?» with «Sí, avisarme»; once decided, shrink it so it never covers buttons. Error: «No pudimos activar los avisos en este teléfono. Probá de nuevo; si sigue sin andar, pedí ayuda.» Blocked: «Este teléfono tiene los avisos bloqueados para Fichaje.» with «Ver cómo desbloquearlos». Use only «Avisos».

**12. The new-employee form: provisional password rules, "tolerancia", "rol", and the form under the list.**
Files: `admin/empleados--empty-fresh-install--390.png`, `admin/empleados--alta-con-dni-repetido--390-viewport.png`, `admin/empleados--lista--390.png`. Text: "Contraseña provisoria", "Solo hace falta si el DNI todavía no tiene cuenta. De 12 a 72 caracteres; las letras con tilde y la ñ cuentan como 2.", "Minutos de tolerancia", "Esa persona ya tiene un rol en esta empresa.", "Si ese DNI ya tenía cuenta en Fichaje, esta no se usa: sigue entrando con la suya."
Fix: button «Agregar empleado» at the top of the list. Drop the password box: always generate the code. «Minutos de tolerancia» → «¿Cuántos minutos puede llegar tarde sin que te avisemos?» Error next to the DNI: «Ya hay una persona con ese DNI en tu lista: revisá el número.» After creating, add «Ahora elegile un horario» with the button right there. Result text: «Anotá esta clave y dásela en persona. Es para entrar la primera vez; después va a elegir la suya. No la vas a poder ver de nuevo.»

**13. Schedules: "tramo", the meaning of 0 minutes, and the "who works with this schedule" step out of sight on the phone.**
Files: `admin/horarios--empty-fresh-install--390.png`, `admin/horarios--creado-paso-asignar-personas--390-viewport.png`, `admin/horarios--asignado-resultado--1366.png`. Text: "Tramo 1", "1 de 4 tramos", "Con 0, te avisamos de cualquier pausa.", "sin tiempo para almorzar", "Desde ese día, cuando cargues sus días de trabajo se usa este horario. Los días que ya cargaste no cambian."
Fix: «Tramo 1» → «Primera parte del día»; «+ Agregar otro tramo» → «+ Agregar otra parte (horario cortado)». Break question: «¿Cuánto pueden tardar en almorzar?» with «Si no almuerzan en el horario de trabajo, poné 0.» and chip «no almuerzan en el horario». After creating, show the question first, above the list: «Horario creado. ¿Quiénes lo van a usar?» with «Empieza a valer desde: hoy / otro día» and «Lo que ya cargaste antes queda como estaba.» Result in two lines: «Listo: Carla y Diego usan este horario desde el 10 de noviembre.» / «No cambié a Bruno ni a Ana: ya tenían otro horario desde ese día.»

**14. Loading days: a green result when nothing was loaded, "una sola vez", and a live button for zero people.**
Files: `admin/jornadas--cargar-dias-resultado-con-omitidos--390-viewport.png`, `admin/jornadas--empty-fresh-install--390.png`. Text: "No se cargó ningún día. No se cargaron 35: Ya tenían día cargado: … (30)", "Sin horario asignado: Hugo Benítez (5)", "Se cargan una sola vez. Para el mes siguiente, volvé a esta pantalla.", "Vas a cargar 18 días … para 0 personas."
Fix: neutral box: «No hizo falta cargar nada: esos días ya estaban cargados para 6 personas.» and, in the warning colour, «Falta: Hugo Benítez no tiene horario, por eso no se le cargaron 5 días.» + «Elegirle un horario». «Se cargan una sola vez» → «Si un día ya está cargado, no se pisa.» With nobody to load: disable the button and say «Primero agregá empleados a este local.»

**15. Fixing marks: "Egreso", "Anular", "No aplica", a date-and-time box, and a rejection nobody can act on.**
Files: `admin/jornadas--abierta-desde-bandeja-egreso-sin-marcar--390-viewport.png`, `admin/jornadas--anular-marca-rechazada--390-viewport.png`, `admin/jornadas--corregir-marca-formulario--390-viewport.png`. Text: "Egreso", "Hora (Sede Centro)", "dd/mm/aaaa --:--", "Anular", "No aplica", "REGISTRADA", "Tipo de marca corregida", "Guardar corrección de marca", "No se puede anular esa marca: las marcas que quedan no forman una jornada válida (por ejemplo, un ingreso con marcas posteriores). Anulá o corregí antes las posteriores."
Fix: the same words the employee sees: «Entrada», «Salida», «Salida a desayunar»… «¿A qué hora salió?» asking only the time (the day is already known). «Corregir» → «Cambiar la hora»; «Anular» → «Quitar esta marca», with «No se borra: queda tachada y se ve quién la quitó.» shown before tapping. «No aplica» → nothing, or «Cargada a mano». Rejection: «No podés quitar la entrada mientras haya marcas después. Primero quitá o cambiá las de más abajo.»

---

## 3. Terms a non-technical person may not understand

Employee side

| On screen | What I would expect |
|---|---|
| "Marcar", "marca", "Tus marcas de hoy" | acceptable when paired with a verb and object («Marcar entrada»); the bare card title «Marcar» → «¿Qué querés registrar?»; «Lo que registraste hoy» |
| "Sin ingreso" | «Todavía no entraste» |
| "En curso" / "En pausa" / "Finalizada" | «Trabajando» / «En pausa» / «Día terminado» |
| "tolerancia" ("Tenés 240 minutos de tolerancia para entrar.") | «Podés entrar hasta las … sin que cuente como tarde» |
| "Desvíos del día", "No hay desvíos este día." | «Lo que pasó hoy», «Hoy no pasó nada raro.» |
| "motivo", "¿Qué tipo de motivo es?", "Enviar motivo", "Corregir motivo" | «¿Por qué fue?», «Enviar», «Cambiar lo que escribí» |
| "Falta explicar" / "A revisar" / "Justificado" / "No justificado" | «Falta que lo expliques» / «Tu encargado todavía no lo vio» / «Tu encargado lo aceptó» / «Tu encargado no lo aceptó» |
| "Ubicación enviada", "Sin ubicación" | «Marcaste desde el local» / «No pudimos saber dónde estabas» |
| "Fuera del local" | acceptable; better «Marcaste lejos del local» |
| "turno cargado" ("Hoy no tenés turno cargado.") | «Hoy no figurás para trabajar» |
| "Cancelada" (in "Elegí tu turno") | «Tu encargado te sacó este día» |
| "sesión", "Cerrar sesión", "Tu sesión venció. Iniciá sesión nuevamente." | «Salir»; «Pasó mucho tiempo. Entrá de nuevo con tu DNI y tu clave.» |
| "contraseña" and "clave" mixed | one word, «clave» |
| "Cómo instalar", "menú ⋮ (tres puntos)", "Agregar a pantalla de inicio" | «Poner Fichaje en la pantalla del teléfono» |
| "405 minutos", "70 minutos" | hours and minutes |
| "9:15 p. m." beside "21:15" | one format everywhere |
| "Actualizar" | «Ver si ya volvió internet» |

Owner side

| On screen | What I would expect |
|---|---|
| "Bandeja", "Bandeja de desvíos", "CENTRO DE CONTROL", "Casos recientes" | «Para revisar» |
| "desvío", "Desvío detectado", "Desvío cerrado" | «algo fuera del horario», «Fichaje avisó…», «Ya quedó resuelto» |
| "Jornadas", "jornada", "Ver jornada" | «Días de trabajo», «día», «Ver el día» |
| "Historial" (menu) / "Historial de cambios" | «Buscar días pasados» / «Cambios hechos a mano» |
| "Sedes", "sede", "Fuera de sede", "sede sin centro" | «Locales», «local», «Marcó lejos del local», «local sin ubicación» |
| "Ingreso", "Egreso", "Egreso temprano", "Egreso tardío", "Egreso sin marcar", "Sin ingreso", "Exceso de almuerzo" | «Entrada», «Salida», «Se fue antes», «Se fue más tarde», «No marcó la salida», «No vino / no marcó la entrada», «Tardó de más en el almuerzo» |
| "Falta motivo", "A revisar", "Clasificación guardada.", "Corregir a justificado", "Motivo de corrección" | «Todavía no explicó», «Ya explicó: decidí vos», «Guardado», «Cambiar a “lo acepto”», «¿Por qué lo cambiás?» |
| "Marca: Egreso" | remove |
| "Minutos de tolerancia" | «Minutos que puede llegar tarde sin aviso» |
| "Dar de alta", "Activo" / "Inactivo" | «Agregar», «Trabaja acá» / «Ya no trabaja acá» |
| "Contraseña provisoria", "Restablecer contraseña", "Confirmar restablecimiento", "Se cierran todas sus sesiones" | «Clave para entrar la primera vez», «Darle una clave nueva», «Sí, darle una clave nueva», «Va a tener que entrar de nuevo con la clave nueva» |
| "cuenta", "rol" ("ya tiene un rol en esta empresa") | «ya está en tu lista» |
| "caracteres", "las letras con tilde y la ñ cuentan como 2" | remove |
| "Tramo", "1 de 4 tramos" | «parte del día» |
| "Asignar", "Horario asignado", "El que tiene asignado" | «Elegir», «Su horario», «El de siempre» |
| "período" | «¿Para cuándo?» |
| "Cada día sigue el calendario de su local." | remove |
| "zona horaria", "Hora de Buenos Aires y CABA", "Zona horaria de otro país", "America/Santiago" | «Hora del local»; a list of countries |
| "Capturar ubicación del dispositivo", "dispositivo", "navegador", "sistema operativo", "permisos del sitio" | «usar mi ubicación», «este teléfono» |
| "coordenadas", "Latitud", "Longitud", "Precisión insuficiente", "±12.0 m (estimación; no garantiza exactitud)" | hide; «Tu teléfono no pudo ubicarte bien» |
| "Distancia permitida para marcar (metros)" | understandable with its helper; keep |
| "auditados" | «Nadie cambió… todavía» |
| "Anular", "Anulada", "Marca anulada" / "Cancelar jornada", "Cancelada" | «Quitar», «Quitada» / «Sacar este día» |
| "Marca olvidada incorporada" | «Marta agregó la entrada que faltaba» |
| "Automático del sistema" | «Lo detectó Fichaje» |
| "REGISTRADA" (second date column), "No aplica" | «Cargada el…», nothing |
| "Avisos" / "Alertas", "ingresos pendientes", "Las notificaciones no incluyen datos privados." | «Avisos», «alguien no llegó» |
| "Registration failed - permission denied" | Spanish, with a next step |
| "Actualizar" | «Ver si hay novedades» (or automatic) |
| "Filtros: todos", "Aplicar", "Limpiar" | «Buscar por persona o fecha», «Buscar», «Ver todo» |
| "Conexión protegida" (desktop corner) | harmless; could go |
| "Ir" (Primeros pasos) | «Cargar mi local», «Armar horarios», «Agregar empleados»… |

---

## 4. What already works and should not be lost

- The employee's first screen: name, one sentence about the situation ("Todavía no marcaste tu entrada.", "Estás desayunando: volvé antes de las 21:37.", "Ya terminaste tu día."), and one large button.
- Buttons in the first person and in everyday words: "Me voy a desayunar", "Volví del desayuno", "Me voy a almorzar", "Marcar salida", "Sí, marcar salida" / "No, seguir trabajando".
- Only the actions that make sense now are shown; during a pause there is one button.
- The triple confirmation of a mark: green "✓ Listo: tu entrada quedó registrada a las 21:22.", the changed headline, and the line in the list.
- The location notice: "Para marcar necesitamos saber que estás en el local. Solo se mira en el momento de marcar."
- The no-internet message that says whether it counted: "Tu marca no se registró. Cuando vuelva la conexión, tocá el mismo botón otra vez."
- The explanation form: a question ("¿Qué pasó?"), choices with examples, an example in the text box, "Lo que escribas solo lo ven vos y tu encargado.", "Podés cambiarlo hasta que lo revise."
- "¿Te olvidaste la clave? Pedile al encargado una nueva." and the password counter "Llevás 5 de 12." / "Llevás 22: alcanza."
- "Primeros pasos": numbered, in the owner's words, with "Falta"/"Listo", what is missing where ("Falta dónde queda: Sede Centro."), and the closing "Listo: mañana pueden marcar 5 personas."
- Schedule presets "Corrido / Cortado / De noche" with example hours, and "Así queda".
- Loading days with ready-made choices and the sentence "Vas a cargar 18 días (lunes a sábado, del 10 al 30 de noviembre) para 7 personas."
- The warning that prevents a bad morning: "Mañana nadie tiene día cargado en Sede Norte: cargalos para que puedan marcar." with its button.
- The map: "Tocá en el mapa la puerta del local." and the circle of permitted distance; "Si no sabés, dejá 100 m."
- Honesty about traces: "Queda guardado que la agregaste vos y por qué.", "La marca no se borra: queda visible como anulada…", "No se vuelve a mostrar."
- "Listo, ya la entregué" as the way to close the password box.
- Disabled things that say why: "Está inactivo: activalo para restablecer su contraseña.", "Marcá al menos un local para crear el empleado."
- The voseo and the short sentences throughout; empty states that say what to do ("Este local todavía no tiene horarios. Creá el primero.").
- Buttons are words, not bare icons, almost everywhere.

---

## 5. What I could not evaluate from still images

- Which screen opens after login for an employee, and for an owner on the first day (Primeros pasos or Bandeja).
- What follows "Guardar contraseña" on the first login.
- The phone's own permission questions (location, notifications), and what the app says when the employee refuses location or has it switched off. No screenshot shows that case from the employee's side.
- Whether the page moves to the right place after a tap: after choosing a past day at the bottom, after "Ver jornada", after "Restablecer contraseña" on the fourth person, after "Crear horario" on a phone. In several `--390-viewport` files the first screen looks unchanged after the action.
- How long green and red messages stay, and whether they are noticed when they appear outside the visible area.
- Waiting: what a button looks like while the mark is being sent; whether an anxious person taps twice and what happens then.
- Whether "Justificado" / "No justificado" ask for confirmation; whether "Volver" and "Cancelar" lose what was typed.
- The native date and time pickers on a small Android phone, wherever the app uses "dd/mm/aaaa" or "dd/mm/aaaa --:--".
- The map with a thumb: zooming, tapping the exact door, whether the first search result is right.
- How the menu behaves at in-between widths (`admin/navegacion--fila-que-se-desliza--600.png` suggests a row that slides sideways; hidden items cannot be seen in a still).
- What a warning looks like on the locked phone and what the owner sees after tapping it.
- "Cómo instalar" on an iPhone and what "installed" changes.
- Whether the sticky "Avisos" bar ever goes away.
- Text size and contrast as felt by a 60-year-old in a bakery at 6 a.m.; reading a screenshot on a desk is not the same.

What a test with real people should check, in this order:

1. An employee who has never seen the app, alone, with the paper: can they get from the login to "Marcar entrada"? Where do they stop in the password change?
2. The morning after forgetting to mark the exit: do they notice they owe an explanation without being told? After sending the first of two, what do they think happened?
3. What do they understand by "Desvíos del día", "tolerancia" and "No justificado"? Ask them to say it in their own words.
4. "Fijate qué marcaste ayer y volvé a hoy", on their own phone.
5. A new owner with an empty account: do they set the location on the existing shop or create a second one? Do they find the "¿Quién trabaja con este horario?" step on the phone?
6. Read the menu aloud and say what is behind each word before tapping.
7. "Fulano no marcó la salida ayer, arreglalo" and "¿quién cambió esta hora?".
8. Turn on warnings on their own phone, including one phone where they are blocked.
