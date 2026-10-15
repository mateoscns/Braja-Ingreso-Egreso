# Pendientes de definición — Fichaje Braja

Este archivo organiza preguntas para Mateo. **No cambia el estado de ninguna decisión.** Solo [DECISIONES.md](DECISIONES.md) registra una propuesta como adoptada por el dueño.

## Propuestas registradas

| ID | Decisión que Mateo debe adoptar, ajustar o rechazar | Impacto |
| --- | --- | --- |
| D-20261014-08 | Que solo el `ADMIN` clasifique un desvío como justificado o no justificado. | Permisos y flujo de revisión. |
| D-20261014-12 | Fichaje con ubicación del celular para todos, sin QR ni hardware; aceptación del riesgo de GPS falso. | Flujo de marca, sedes y tratamiento de ubicación. |
| D-20261014-13 | PWA con React y Vite; Capacitor como alternativa si fallan las notificaciones en iPhone. | Aplicación móvil y prueba en dispositivos reales. |
| D-20261014-14 | Java 21, Spring Boot MVC, MySQL 8 y Flyway, sin Redis, colas ni microservicios. | Arquitectura técnica. |
| D-20261014-15 | Notificaciones emergentes al `ADMIN` solo por desvíos, agrupadas en una ventana configurable. | Canal y reglas de avisos. |

## Reglas de negocio que faltan

| Prioridad | Pregunta a resolver | Por qué importa |
| --- | --- | --- |
| 1 | ¿Cómo se asigna a cada empleado una plantilla para las jornadas trabajadas y cómo se registra un cambio de horario? | Permite comparar cada marca con el horario correcto sin crear un cronograma semanal. Los días habituales, feriados y licencias solo hacen falta si luego se decide detectar ausencias. |
| 1 | ¿Qué pasa con una marca olvidada, repetida, simultánea o hecha sin conexión? ¿Quién puede corregirla y qué historial se conserva? | Afecta la integridad del registro y la confianza en su hora. |
| 1 | ¿En qué momento queda registrada la hora si una marca genera un desvío y el empleado aún no completó el motivo? | El tiempo de escritura no debería alterar el hecho que se quiere registrar. |
| 1 | ¿Cómo se aplican las plantillas a horarios nocturnos y cortados? ¿Puede haber más de un ingreso o pausa por jornada? | Define a qué jornada pertenece cada marca y qué secuencias son válidas. |
| 2 | Si se adopta la ubicación: ¿qué ocurre sin permiso, sin señal o fuera de una sede? ¿Quién ve la ubicación y cuánto tiempo se conserva? | Evita que el fichaje dependa de una medición imprecisa y acota el acceso a los datos. |
| 2 | ¿Quién consulta los motivos y por cuánto tiempo se conservan, en especial los ingresados bajo «salud»? | El texto libre puede contener información personal que no hace falta difundir. |
| 2 | ¿Qué desvíos generan un aviso dentro de la app y cuáles, si se adopta D-15, generan una notificación emergente? | Permite informar anomalías sin saturar al `ADMIN`. |

La máquina de estados, la detección automática de marcas faltantes, la corrección con auditoría, el radio de sedes y el método de inicio de sesión descritos en el relevamiento son **propuestas de especificación** hasta que se cierre su comportamiento. Las estimaciones de horas y hosting del artefacto de Claude tampoco son un compromiso aprobado.

## Propuesta de resolución de la jornada (sin adoptar)

Esta propuesta convierte las preguntas de prioridad 1 en decisiones concretas para Mateo. La opción elegida para continuar propone detectar `SIN_INGRESO` solo si el `ADMIN` declara una jornada esperada para una fecha concreta; no crea recurrencia semanal. Mateo debe confirmarla antes de adoptarla. Ninguna modifica [DECISIONES.md](DECISIONES.md).

| Tema | Opción mínima sugerida | Confirmación necesaria |
| --- | --- | --- |
| Plantilla aplicable | El `ADMIN` asigna una plantilla vigente a cada empleado, con fecha de inicio. Un cambio conserva la plantilla anterior para interpretar las marcas históricas. | ¿Hay empleados que alternan plantillas dentro de una misma semana? Si los hay, definir una excepción puntual por fecha sin crear un cronograma semanal. |
| Falta de ingreso | Para una fecha concreta, el `ADMIN` declara la jornada esperada y asigna una plantilla. Si no hay ingreso al superar la hora prevista más la tolerancia del empleado, el sistema genera `SIN_INGRESO`. Sin jornada declarada no se genera una ausencia. | ¿Mateo aprueba esta detección por fecha sin recurrencia semanal? ¿Qué estado conserva `SIN_INGRESO` si el empleado ficha después y completa el motivo? |
| Horario nocturno y cortado | Asociar la jornada a la fecha local en que comienza el primer bloque esperado; los dos bloques de un horario cortado pertenecen a esa misma jornada. | ¿Cuántas pausas se permiten por jornada y cómo se corrige un bloque que no se trabajó? |
| Desvío con motivo | Registrar primero la hora del intento recibido por el servidor y pedir después el motivo y la categoría, sin perder la marca si el empleado tarda en escribir. | ¿Qué estado y aviso corresponden si el motivo queda sin completar? |
| Falta de conexión o marca olvidada | Mostrar claramente que la marca no se registró y pedir reintento cuando vuelva la conexión. No atribuir al servidor una hora que nunca recibió. | ¿Quién puede corregir una marca y qué datos originales se conservan para auditarla? |
| Toques repetidos | Dos envíos de la misma acción deben producir una sola marca y una respuesta clara al empleado. | ¿Se permite repetir ingreso o egreso dentro de una misma jornada? |

## Orden sugerido para cerrar el relevamiento

1. Resolver la asignación de plantillas, la jornada nocturna o cortada y los casos de marcas fallidas.
2. Definir el flujo de justificación y decidir D-20261014-08 y D-20261014-12.
3. Decidir D-20261014-13 a D-20261014-15 y probar los avisos en el dispositivo real del `ADMIN` si se adopta push.
4. Convertir las respuestas en criterios de aceptación concretos dentro de [ESPECIFICACION.md](ESPECIFICACION.md).
