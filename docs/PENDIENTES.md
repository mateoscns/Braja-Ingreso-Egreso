# Pendientes de definición — Fichaje Braja

Este archivo organiza las preguntas que siguen abiertas. **No cambia el estado de ninguna decisión.** Solo [DECISIONES.md](DECISIONES.md) registra una propuesta como adoptada por el dueño.

## Propuestas registradas

| ID | Decisión que Mateo debe adoptar, ajustar o rechazar | Impacto |
| --- | --- | --- |
| D-20261014-12 | Fichaje con la ubicación del celular para todos, sin QR ni hardware; aceptación del riesgo de GPS falso. | Flujo de marca, sedes y tratamiento de ubicación. |
| D-20261014-13 | PWA con React y Vite; Capacitor como alternativa si fallan las notificaciones en iPhone. | Aplicación móvil y prueba en dispositivos reales. |
| D-20261014-14 | Java 21, Spring Boot MVC, MySQL 8 y Flyway, sin Redis, colas ni microservicios. | Arquitectura técnica. |
| D-20261014-15 | Notificaciones emergentes al `ADMIN` solo por desvíos, agrupadas en una ventana configurable. | Canal y reglas de avisos. |

## Reglas de negocio que siguen abiertas

| Prioridad | Pregunta a resolver | Por qué importa |
| --- | --- | --- |
| 1 | ¿Puede el ADMIN incorporar a posteriori una marca olvidada y qué hora debe conservar? ¿Qué ocurre si llegan simultáneamente acciones distintas para la misma jornada? | Evita presentar como recibida por el servidor una hora que no registró y define cómo ordenar eventos distintos. |
| 2 | Si se adopta la ubicación: ¿qué ocurre sin permiso, sin señal o fuera de una sede? ¿Quién ve la ubicación y cuánto tiempo se conserva? | Evita que el fichaje dependa de una medición imprecisa y acota el acceso a los datos. |
| 2 | ¿Quién consulta los motivos y por cuánto tiempo se conservan, en especial los ingresados bajo «salud»? | El texto libre puede contener información personal que no hace falta difundir. |
| 2 | ¿Qué desvíos generan un aviso dentro de la app y cuáles, si se adopta D-15, generan una notificación emergente? | Permite informar anomalías sin saturar al `ADMIN`. |

Las reglas de `SIN_INGRESO` y su reemplazo por `LLEGADA_TARDE` (D-20261015-01), la asignación de plantillas y jornadas (D-20261015-02), el registro en servidor, los reintentos duplicados y la corrección auditada (D-20261015-03), los motivos pendientes (D-20261015-04) y la decisión del ADMIN sobre la justificación (D-20261014-08) quedaron adoptados en [DECISIONES.md](DECISIONES.md). D-20261015-03 no define todavía el alta retroactiva de una marca olvidada ni cómo ordenar acciones distintas que llegan a la vez; esa pregunta sigue abierta. D-20261014-12 a D-20261014-15 siguen como propuestas. El resto de la máquina de estados, el radio de sedes y el método de inicio de sesión descritos en el relevamiento siguen pendientes de especificación. Las estimaciones de horas y hosting del artefacto de Claude tampoco son un compromiso aprobado.

## Orden sugerido para cerrar el relevamiento

1. Resolver el alta retroactiva de marcas olvidadas y el orden de acciones distintas que llegan simultáneamente.
2. Definir qué ocurre con la ubicación sin permiso o señal, quién la consulta y cuánto se conserva; hacer lo mismo con los motivos de categoría «salud».
3. Decidir D-20261014-12 a D-20261014-15; si se adopta push, probarlo en el dispositivo real del `ADMIN`.
4. Convertir las decisiones adoptadas y las propuestas que Mateo apruebe en criterios de aceptación dentro de [ESPECIFICACION.md](ESPECIFICACION.md).
