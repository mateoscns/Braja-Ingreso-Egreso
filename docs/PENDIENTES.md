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
| 1 | ¿Qué días se espera que trabaje cada empleado y cómo se manejan feriados, licencias y cambios de horario, sin crear un cronograma semanal? | Sin esa regla, «sin ingreso» puede producir falsas ausencias. |
| 1 | ¿Qué pasa con una marca olvidada, repetida, simultánea o hecha sin conexión? ¿Quién puede corregirla y qué historial se conserva? | Afecta la integridad del registro y la confianza en su hora. |
| 1 | ¿En qué momento queda registrada la hora si una marca genera un desvío y el empleado aún no completó el motivo? | El tiempo de escritura no debería alterar el hecho que se quiere registrar. |
| 1 | ¿Cómo se aplican las plantillas a horarios nocturnos y cortados? ¿Puede haber más de un ingreso o pausa por jornada? | Define a qué jornada pertenece cada marca y qué secuencias son válidas. |
| 2 | Si se adopta la ubicación: ¿qué ocurre sin permiso, sin señal o fuera de una sede? ¿Quién ve la ubicación y cuánto tiempo se conserva? | Evita que el fichaje dependa de una medición imprecisa y acota el acceso a los datos. |
| 2 | ¿Quién consulta los motivos y por cuánto tiempo se conservan, en especial los ingresados bajo «salud»? | El texto libre puede contener información personal que no hace falta difundir. |
| 2 | ¿Qué desvíos generan un aviso dentro de la app y cuáles, si se adopta D-15, generan una notificación emergente? | Permite informar anomalías sin saturar al `ADMIN`. |

La máquina de estados, la detección automática de marcas faltantes, la corrección con auditoría, el radio de sedes y el método de inicio de sesión descritos en el relevamiento son **propuestas de especificación** hasta que se cierre su comportamiento. Las estimaciones de horas y hosting del artefacto de Claude tampoco son un compromiso aprobado.

## Orden sugerido para cerrar el relevamiento

1. Resolver los días esperados, la jornada nocturna o cortada y los casos de marcas fallidas.
2. Definir el flujo de justificación y decidir D-20261014-08 y D-20261014-12.
3. Decidir D-20261014-13 a D-20261014-15 y probar los avisos en el dispositivo real del `ADMIN` si se adopta push.
4. Convertir las respuestas en criterios de aceptación concretos dentro de [ESPECIFICACION.md](ESPECIFICACION.md).
