# Especificación funcional inicial — Fichaje Braja

**Estado:** borrador alineado con las decisiones adoptadas hasta el 2026-10-15. Describe el comportamiento confirmado; los casos que siguen abiertos están en [PENDIENTES.md](PENDIENTES.md). Ante diferencias, prevalece [DECISIONES.md](DECISIONES.md).

## Objetivo y límites

Registrar ingreso, egreso, desayuno y almuerzo, y explicar los desvíos respecto del horario. El producto es software propio de Braja, contempla varias empresas y sedes desde el inicio y no integra servicios externos de control horario. Quedan fuera la liquidación de sueldos, los montos, el banco de horas y la planificación semanal de turnos. Los avisos viven en la aplicación; no se usa WhatsApp ni Telegram ni el dominio actual de Braja. Referencias: D-20261014-02, -03, -09, -11 y -16.

## Personas y responsabilidades

| Persona o rol | Responsabilidad confirmada |
| --- | --- |
| Mateo | Decide si una propuesta del registro pasa a «adoptada por el dueño». No es un rol operativo de la aplicación por ese solo hecho. |
| `ADMIN` | Da de alta empleados, crea y asigna plantillas, declara jornadas por fecha, corrige marcas con historial y decide si un desvío queda justificado. |
| Empleado | Registra sus marcas, elige una categoría y escribe el motivo de un desvío; puede completar después un motivo pendiente. |

Referencias: encabezado de [DECISIONES.md](DECISIONES.md), D-20261014-04, -05, -07, -08 y D-20261015-02 a -06.

## Registro de la jornada

1. Se registran el ingreso y el egreso.
2. Si toma desayuno, el empleado registra una salida y una vuelta. Se permite como máximo un ciclo de desayuno por jornada.
3. Si toma almuerzo, el empleado registra una salida y una vuelta. Se permite como máximo un ciclo de almuerzo por jornada.
4. Desayuno y almuerzo no tienen hora fija; la duración real se compara con la duración configurable.
5. La hora oficial de una marca hecha por el empleado es la hora del servidor cuando la recibe. Si el ADMIN carga a posteriori una marca olvidada, se conservan por separado la hora declarada del hecho y la hora de carga del servidor. El servidor guarda la marca antes de pedir el motivo y la categoría del desvío.
6. Si no hay conexión, la aplicación indica que la marca no quedó registrada y pide reintentar. La hora del dispositivo no se usa como hora oficial.
7. Los reintentos duplicados o simultáneos de una misma acción producen una sola marca.
8. Solo el `ADMIN` corrige una marca o agrega una marca olvidada de una fecha pasada. Una corrección conserva el valor original y el corregido; una marca agregada conserva por separado la hora declarada del hecho y la hora de carga del servidor. En ambos casos se conserva quién hizo el cambio, cuándo y el motivo.
9. Las acciones distintas para una misma jornada se procesan de forma secuencial y atómica, en el orden de aceptación del servidor, y se validan contra el estado actualizado. Si una acción deja de corresponder, no se registra y la app pide reintentar. El orden se conserva aunque las marcas tengan la misma hora de recepción.

El alcance contempla seis clases de marca. Los criterios de aceptación siguientes también definen cómo se registran las marcas agregadas después y cómo se ordenan las acciones distintas simultáneas. Referencias: D-20261014-03 y -06; D-20261015-03, -05 y -06.

## Horarios y desvíos

El `ADMIN` crea plantillas reutilizables (por ejemplo, mañana, tarde, noche, medio tiempo y cortado), asigna una plantilla a cada empleado con fecha de inicio y conserva el historial ante cambios. Los cambios puntuales se declaran para una fecha concreta; no hay recurrencia semanal. La fecha local en que comienza el primer bloque esperado identifica una jornada nocturna o cortada, y sus bloques pertenecen a esa jornada. Referencias: D-20261014-03 y -05; D-20261015-01 y -02.

`SIN_INGRESO` se genera solo para una fecha con jornada declarada, al superar el horario previsto más la tolerancia del empleado. Si el empleado ficha después, se cierra `SIN_INGRESO` y se registra `LLEGADA_TARDE` con los minutos reales, como un solo desvío y un solo motivo. Si el ADMIN agrega después una marca de ingreso olvidada, se conserva la hora declarada del hecho y la hora de carga por separado; se cierra el `SIN_INGRESO` de esa jornada. Solo se genera `LLEGADA_TARDE` si la hora declarada supera el horario previsto más la tolerancia; si no la supera, se cierra `SIN_INGRESO` sin generar `LLEGADA_TARDE`. Referencias: D-20261015-01 y -05.

Ante un desvío, el empleado elige **salud**, **transporte**, **emergencia** u **otra**, y escribe el motivo. Si aún no lo completa, el sistema conserva la marca y la hora y deja el desvío en `MOTIVO_PENDIENTE` para que lo complete después. Solo el `ADMIN` decide si queda justificado o no justificado. Referencias: D-20261014-07 y -08; D-20261015-04.

## Empresas, sedes y avisos

El producto debe servir a varias empresas y sedes, y los datos de cada empresa deben permanecer aislados. El diseño técnico de ese aislamiento y la asignación de una marca a una sede todavía deben especificarse. La ubicación del celular como parte del fichaje sigue siendo una propuesta, no un requisito adoptado. Referencias: D-20261014-09 y -12.

Los avisos viven dentro de la aplicación. Qué desvíos se muestran, si se adopta notificación emergente y cómo se agrupa siguen pendientes. Referencias: D-20261014-11 y -15.

## Criterios de aceptación

- El `ADMIN` puede dar de alta empleados sin un límite fijo, crear plantillas y asignarlas con fecha de inicio. Un cambio no altera la interpretación histórica de las marcas anteriores.
- Un cambio puntual de horario se declara para una fecha concreta; el sistema no crea recurrencia semanal.
- En horarios nocturnos o cortados, los bloques de trabajo pertenecen a la jornada que comienza en la fecha local del primer bloque esperado.
- Se admite como máximo una salida y vuelta de desayuno y una de almuerzo por jornada. La duración de cada pausa se compara con el valor configurable.
- Los reintentos duplicados o simultáneos de una misma acción producen una sola marca.
- Las acciones distintas de una misma jornada se procesan en orden secuencial del servidor y cada una se valida de forma atómica contra el estado actualizado; una acción incompatible no se registra y la app pide reintentar. Se conserva el orden aunque las marcas tengan la misma hora de recepción.
- El ADMIN puede agregar una marca olvidada indicando la hora del hecho y el motivo. Se conservan también la hora de carga del servidor y quién la realizó; si es un ingreso, `SIN_INGRESO` se cierra y `LLEGADA_TARDE` solo se genera si la hora declarada supera el horario previsto más la tolerancia; si no, se cierra `SIN_INGRESO` sin generar `LLEGADA_TARDE`.
- Una marca hecha por el empleado conserva la hora de recepción del servidor. Una marca olvidada que carga el ADMIN conserva por separado la hora declarada del hecho y la hora de carga del servidor. Una acción no recibida por falta de conexión no se presenta como registrada y no toma la hora del dispositivo.
- Si una marca genera un desvío, se guarda antes de solicitar el motivo. Si el motivo falta, el desvío queda `MOTIVO_PENDIENTE` y puede completarse después.
- El `ADMIN` puede corregir marcas conservando los datos originales, la corrección, quién la realizó, cuándo y por qué; y es quien clasifica los desvíos como justificados o no justificados.
- Cada desvío admite motivo y una de las cuatro categorías adoptadas.
- Una ausencia solo se genera en una jornada declarada por fecha. Si llega el fichaje posterior, `SIN_INGRESO` se reemplaza por `LLEGADA_TARDE` con los minutos reales y un solo desvío y motivo.
- Los datos de una empresa no son visibles para usuarios de otra. No aparecen funciones de liquidación de sueldos, montos, banco de horas ni planificación semanal.
