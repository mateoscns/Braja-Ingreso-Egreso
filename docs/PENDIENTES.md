# Pendientes de definición — Fichaje Braja

Este archivo reúne asuntos que requieren una decisión adicional o una validación externa. No reemplaza a [DECISIONES.md](DECISIONES.md), que es la fuente de verdad de lo adoptado por Mateo.

## Estado de decisiones

Las 22 decisiones base están adoptadas, incluidas D-20261014-12 a D-20261014-15 el 2026-10-16. Mateo también adoptó cinco aclaraciones el 2026-10-16, una el 2026-10-18, seis el 2026-10-19, dos el 2026-10-23 y doce el 2026-10-27, registradas como D-20261016-01 a -05, D-20261018-01, D-20261019-01 a -06, D-20261023-01 a -02 y D-20261027-01 a -12. Al 2026-10-30 el registro suma 51 decisiones adoptadas; D-20261029-01, D-20261030-01 y D-20261030-02 reflejan las decisiones de Mateo sobre captura de sede, una desviación por jornada y la geocerca congelada al declarar. El alcance general de la geocerca de sedes se aprobó en el issue #67 y se registró en D-20261027-12.

Resuelto desde el 2026-10-27 (ya no está pendiente como decisión): cancelar una jornada declarada y anular una marca equivocada (D-20261027-07 y -08, PR #57), restablecer la contraseña de un empleado desde el `ADMIN` (D-20261027-09, PR #58), declarar jornadas por lote (D-20261027-11, PR #65), asignar plantillas con fecha de inicio (D-20261015-02, PR #65), corregir el motivo mientras no se clasificó (D-20261027-02, PR #49), el límite de login por IP compartida (D-20261027-05, PR #52), la lectura de la auditoría de una jornada (PR #63) y el alcance aprobado de comparar marcas con la sede (D-20261027-12, issue #67). La implementación de geocerca sigue en revisión local en `feat/site-geofence-67`, aún fuera de `main`. Mateo adoptó la captura automática con carga manual conservada, el desvío único por jornada y la geocerca congelada al declarar en D-20261029-01, D-20261030-01 y D-20261030-02.

## Validaciones y definiciones pendientes

| Prioridad | Pendiente | Motivo |
| --- | --- | --- |
| 1 | Validar con asesoría competente el aviso, propósito, base legal y derechos aplicables al tratamiento de ubicación y motivos de salud. | Las reglas técnicas de acceso y purga no sustituyen la revisión legal. |
| 1 | Definir la retención de motivos que no sean de salud y la política de eliminación efectiva en copias de respaldo. | La retención de 90 días aplica a coordenadas de las marcas y al texto de salud; las coordenadas de sede se conservan mientras exista la sede (D-20261027-12). No hay decisión para los demás motivos ni las copias de respaldo. |
| 2 | Elegir proveedor de hosting y dominio HTTPS para la prueba real de Web Push en el iPhone del ADMIN. | D-20261014-16 excluye el dominio actual de Braja; la prueba de push necesita un origen HTTPS. |
| 2 | Ejecutar la prueba de Web Push en el iPhone real del ADMIN y, si falla, decidir la activación del plan B Capacitor. | La compatibilidad no se certifica solo con pruebas automatizadas. |
| 1 | Definir el proceso seguro para incorporar nuevas empresas y sus primeros ADMIN después del bootstrap inicial. | El bootstrap crea la primera empresa, sede y cuenta ADMIN una sola vez en una base vacía; no hay una pantalla ni endpoint para dar de alta otros tenants. |
| 2 | Definir un canal seguro de recuperación de contraseña sin intervención de una persona (autoservicio). | Desde D-20261027-09 el ADMIN restablece la contraseña de un empleado que pertenece solo a su empresa (`POST /employees/{employeeId}/password-reset`). Las cuentas que están en otra empresa o tienen rol ADMIN siguen dependiendo del operador, y no existe recuperación por autoservicio. |

## Criterio de implementación

Los pendientes de validación legal, hosting y dispositivo no cambian los comportamientos adoptados. `FUERA_DE_SEDE` queda en la bandeja, sin push y sin bloquear las marcas; se crea como máximo uno por empleado y jornada (D-20261027-12, D-20261030-01). No se deben agregar avisos por canales externos. Cada jornada usa el centro y el radio vigentes al declararla, y una jornada declarada sin centro no se compara (D-20261030-02). La captura estricta y la carga manual de centro están adoptadas en D-20261029-01; la prueba automatizada no sustituye la prueba física de captura.
