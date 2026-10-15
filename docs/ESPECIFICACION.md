# Especificación funcional inicial — Fichaje Braja

**Estado:** borrador basado en las decisiones adoptadas el 2026-10-13 y 2026-10-14. Este documento describe el comportamiento confirmado; los detalles aún no decididos están en [PENDIENTES.md](PENDIENTES.md). Ante una diferencia, prevalece [DECISIONES.md](DECISIONES.md).

## Objetivo y límites

Registrar ingreso, egreso, desayuno y almuerzo, y explicar los desvíos respecto del horario. El producto es software propio de Braja, contempla varias empresas y sedes desde el inicio, y no integra servicios externos de control horario. Referencias: D-20261014-02, -03 y -09.

Quedan fuera del alcance la liquidación de sueldos, los montos, el banco de horas y la planificación semanal de turnos. Los avisos se consultan en la aplicación: no se envían por WhatsApp ni Telegram. No se utiliza el dominio actual de Braja. Referencias: D-20261014-03, -11 y -16.

## Personas y responsabilidades

| Persona o rol | Responsabilidad confirmada |
| --- | --- |
| Mateo | Decide si una propuesta del registro pasa a «adoptada por el dueño». No es un rol operativo de la aplicación por ese solo hecho. |
| `ADMIN` | Da de alta empleados y crea plantillas de horario. La forma exacta de revisar y resolver desvíos está pendiente. |
| Empleado | Registra sus marcas y, ante un desvío, escribe el motivo y elige una categoría. |

Referencias: encabezado de [DECISIONES.md](DECISIONES.md), D-20261014-04, -05, -07 y -08.

## Registro de la jornada

1. Se registra el **ingreso** y el **egreso**.
2. Si el empleado toma desayuno, se registran la **salida** y la **vuelta**.
3. Si toma almuerzo, se registran la **salida** y la **vuelta**.
4. El desayuno y el almuerzo no tienen hora fija. Su duración real se compara con una duración configurable.

Estas son las seis clases de marca contempladas por el alcance adoptado. El orden permitido, la cantidad de pausas por jornada, el origen de la hora y las marcas repetidas requieren reglas precisas antes de implementarse. Referencias: D-20261014-03 y -06; [PENDIENTES.md](PENDIENTES.md).

## Horarios y desvíos

El `ADMIN` crea plantillas reutilizables, por ejemplo mañana, tarde, noche, medio tiempo y cortado. La tolerancia se asigna por empleado. No hay planificación semanal de turnos. Falta definir cómo se determina qué plantilla corresponde a un día concreto, incluidos días sin trabajo y cambios excepcionales. Referencias: D-20261014-03 y -05.

Ante un desvío, el empleado escribe un motivo y selecciona **salud**, **transporte**, **emergencia** u **otra**. El desvío termina clasificado como **justificado** o **no justificado**. Aún no está adoptado que solo el `ADMIN` tome esa decisión ni cómo se representa un desvío mientras espera resolución. Referencias: D-20261014-07 y -08.

## Empresas, sedes y avisos

El producto debe servir a varias empresas y sedes. Cada empresa debe acceder únicamente a sus propios datos; el modelo de aislamiento y la asignación de una marca a una sede todavía deben especificarse. La ubicación del celular como parte del fichaje sigue siendo una propuesta, no un requisito adoptado. Referencias: D-20261014-09 y -12.

Los avisos viven dentro de la aplicación. La selección de desvíos notificables, las notificaciones emergentes y su agrupación siguen pendientes. Referencias: D-20261014-11 y -15.

## Comprobaciones del alcance confirmado

- Un `ADMIN` puede dar de alta empleados sin un límite fijo de cantidad y crear plantillas de horario.
- Un empleado puede registrar las marcas de ingreso, egreso y pausas contempladas por el alcance.
- El sistema compara la duración de desayuno y almuerzo con el valor configurado, aunque el momento de la pausa cambie.
- Cada desvío admite un motivo escrito y una de las cuatro categorías adoptadas.
- Los datos de una empresa no son visibles para usuarios de otra empresa.
- No aparecen funciones de liquidación de sueldos, banco de horas ni planificación semanal.

Estos son criterios de alcance. Los casos de prueba con minutos, estados y transiciones concretas se redactarán cuando se resuelvan las preguntas de [PENDIENTES.md](PENDIENTES.md).
