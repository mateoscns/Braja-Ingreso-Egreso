# Registro de decisiones — Fichaje Braja

Dueño: Mateo. Solo el dueño pasa una fila de `propuesta` a `adoptada por el dueño`.

Las filas marcadas `adoptada por el dueño` recogen lo que Mateo definió en el relevamiento del 2026-10-13 y 2026-10-14; si alguna no refleja lo que dijo, se corrige.

| ID | Fecha | Decisión | Propuesta por | Estado | Motivo |
| --- | --- | --- | --- | --- | --- |
| D-20261014-01 | 2026-10-14 | Sin atribución de IA en commits ni PRs | Mateo (plantilla base; viene de Shifty D-20260909-04) | adoptada por el dueño | Trazabilidad humana de los cambios |
| D-20261014-02 | 2026-10-14 | Software propio de Braja; no se usan ni integran SaaS de terceros de control horario | Mateo | adoptada por el dueño | El cliente quiere un sistema propio |
| D-20261014-03 | 2026-10-14 | Alcance cerrado: solo registro de ingreso, egreso, desayuno y almuerzo. No liquida sueldos, no calcula montos, no hay banco de horas ni cronograma semanal | Mateo | adoptada por el dueño | Mantener el sistema simple y barato |
| D-20261014-04 | 2026-10-14 | Los empleados los da de alta el ADMIN; sin límite de cantidad | Mateo | adoptada por el dueño | La plantilla cambia; no se diseña para un número fijo |
| D-20261014-05 | 2026-10-14 | Horarios como plantillas creadas por el ADMIN (mañana, tarde, noche, medio tiempo, cortado); tolerancia asignada por empleado | Mateo | adoptada por el dueño | Más simple y configurable que un horario por persona |
| D-20261014-06 | 2026-10-14 | Desayuno y almuerzo sin hora fija; se registra salida y vuelta y se compara contra una duración configurable | Mateo | adoptada por el dueño | Los días cargados se mueven las pausas |
| D-20261014-07 | 2026-10-14 | Ante un desvío el empleado escribe el motivo y elige categoría (salud, transporte, emergencia, otra); el desvío queda justificado o no justificado | Mateo | adoptada por el dueño | El dueño del comercio quiere saber por qué |
| D-20261014-08 | 2026-10-14 | Solo el ADMIN decide si un desvío es justificado o no justificado | Claude | propuesta | Supuesto para poder avanzar; pendiente de OK del dueño |
| D-20261014-09 | 2026-10-14 | Multi-empresa y multi-sede desde el inicio | Mateo | adoptada por el dueño | Braja puede abrir más sedes; reuso con otros clientes |
| D-20261014-10 | 2026-10-14 | Braja paga el hosting; Mateo desarrolla y mantiene con abono mensual | Mateo | adoptada por el dueño | Modelo comercial acordado |
| D-20261014-11 | 2026-10-14 | Sin WhatsApp ni Telegram; los avisos viven en la propia app | Mateo | adoptada por el dueño | Evitar costos por mensaje y dependencias externas |
| D-20261014-12 | 2026-10-14 | Fichaje con la ubicación del celular para todos (local y calle); sin QR ni hardware; GPS falso es riesgo aceptado | Claude | propuesta | Un solo flujo, sin hardware; Mateo aceptó el riesgo de GPS falso |
| D-20261014-13 | 2026-10-14 | PWA (React + Vite) en vez de app nativa; plan B: Capacitor si la push en iPhone falla | Claude | propuesta | Sin costo de tiendas; solo el ADMIN necesita notificaciones |
| D-20261014-14 | 2026-10-14 | Backend Java 21 + Spring Boot MVC + MySQL 8 + Flyway; sin Redis, colas ni microservicios | Claude | propuesta | Stack conocido; el volumen no justifica más |
| D-20261014-15 | 2026-10-14 | Push al ADMIN solo por desvíos, agrupada en una ventana configurable (5 min por defecto) | Claude | propuesta | Evitar saturar al dueño del comercio cuando entran todos juntos |
| D-20261014-16 | 2026-10-14 | No se usa el dominio de Braja | Mateo | adoptada por el dueño | Hoy no hay acceso a ese dominio |
