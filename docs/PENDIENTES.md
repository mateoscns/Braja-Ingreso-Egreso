# Pendientes de definición — Fichaje Braja

Este archivo reúne asuntos que requieren una decisión adicional o una validación externa. No reemplaza a [DECISIONES.md](DECISIONES.md), que es la fuente de verdad de lo adoptado por Mateo.

## Estado de decisiones

Las 22 decisiones base están adoptadas, incluidas D-20261014-12 a D-20261014-15 el 2026-10-16. Mateo también adoptó cinco aclaraciones de acceso, jornadas, egresos, privacidad y margen de ingreso anticipado, registradas como D-20261016-01 a -05. El registro suma 27 filas adoptadas y 0 propuestas funcionales pendientes.

## Validaciones y definiciones pendientes

| Prioridad | Pendiente | Motivo |
| --- | --- | --- |
| 1 | Decidir si la v1 debe detectar otras marcas faltantes (`MARCA_FALTANTE`), como un egreso olvidado, y bajo qué regla. | La v1 genera `SIN_INGRESO` solo para jornadas declaradas; no hay una decisión adoptada para inferir otras acciones omitidas. |
| 1 | Validar con asesoría competente el aviso, propósito, base legal y derechos aplicables al tratamiento de ubicación y motivos de salud. | Las reglas técnicas de acceso y purga no sustituyen la revisión legal. |
| 1 | Definir la retención de motivos que no sean de salud y la política de eliminación efectiva en copias de respaldo. | La decisión adoptada fija 90 días para coordenadas y texto de salud, pero no para los demás motivos ni copias. |
| 2 | Elegir proveedor de hosting y dominio HTTPS para la prueba real de Web Push en el iPhone del ADMIN. | D-20261014-16 excluye el dominio actual de Braja; la prueba de push necesita un origen HTTPS. |
| 2 | Ejecutar la prueba de Web Push en el iPhone real del ADMIN y, si falla, decidir la activación del plan B Capacitor. | La compatibilidad no se certifica solo con pruebas automatizadas. |
| 1 | Definir el proceso seguro para incorporar nuevas empresas y sus primeros ADMIN después del bootstrap inicial. | El bootstrap crea la primera empresa, sede y cuenta ADMIN una sola vez en una base vacía; no hay una pantalla ni endpoint para dar de alta otros tenants. |
| 2 | Definir un canal seguro de recuperación de contraseña. | No existe un mecanismo aprobado para restablecer credenciales sin intervención manual del operador. |

## Criterio de implementación

Los pendientes de validación legal, hosting y dispositivo no cambian los comportamientos adoptados. No se deben agregar geocercas que bloqueen marcas ni enviar avisos por canales externos. Las dudas técnicas de despliegue deben documentarse sin cambiar decisiones de producto.
