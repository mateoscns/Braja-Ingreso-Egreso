# Arquitectura v1 — límites e invariantes

Aplicación modular de una sola API y una PWA. Las reglas de acceso, jornada, privacidad y notificaciones viven en el servidor; la interfaz refleja su estado y no lo sustituye.

## Límites del backend

Paquete raíz sugerido: `com.braja.fichaje`.

| Módulo | Es responsable de | No debe hacer |
| --- | --- | --- |
| `identity` | Cuentas globales por DNI, contraseñas, sesiones, CSRF, membresías y rol de cada empresa. | Aceptar empresa o rol enviados por el cliente como autoridad. |
| `organization` | Empresas, sedes, zona horaria, cuentas/membresías de empleado y tolerancia vigente. | Cambiar el horario o la tolerancia de jornadas ya declaradas. |
| `scheduling` | Plantillas por sede, jornadas por empleado/sede/fecha y copia inmutable de horario/tolerancia. | Crear recurrencia semanal o jornadas implícitas. |
| `timekeeping` | Estado de jornada, marcas, secuencia, idempotencia, acciones olvidadas y correcciones auditadas. | Esperar GPS o usar la hora del dispositivo como hora oficial. |
| `deviations` | Detección de ausencia, llegadas, egresos y pausas; motivos; clasificación por ADMIN; auditoría. | Emitir un segundo evento cuando `SIN_INGRESO` pasa a `LLEGADA_TARDE`. |
| `privacy` | Cifrado de texto `SALUD`, autorización de coordenadas, ventana de asociación y purga a 90 días. | Escribir contenido sensible en logs, métricas o errores. |
| `notifications` | Bandeja, outbox MySQL, ventanas por empresa, lease, reintentos y suscripciones Web Push. | Filtrar datos de motivo, coordenadas o salud en el push. |
| `common` | Tipos de ID, reloj, contexto autenticado, errores API y correlación no sensible. | Contener reglas de negocio de los módulos. |

Las dependencias apuntan desde la interfaz de cada módulo hacia sus contratos de aplicación. `timekeeping` consulta la jornada y la membresía autorizada; `deviations` aplica reglas a los hechos de `timekeeping`; `notifications` reacciona a desvíos persistidos mediante una outbox en la misma base. Ningún módulo accede directamente a tablas privadas de otro módulo para saltarse sus reglas. No se separan servicios ni se introduce un broker.

## Transacciones y orden

### Registrar una marca

1. Resolver principal, empresa activa y membresía desde la sesión.
2. Capturar el instante de recepción con el reloj del servidor antes de esperar el bloqueo.
3. Buscar la clave de idempotencia del actor. La clave es única por cuenta; si ya existe con el mismo hash canónico de jornada y acción, devolver el resultado guardado; si cambia el contenido, responder `409`.
4. Bloquear la fila de la jornada con una transacción MySQL, volver a validar autorización y estado, incrementar la secuencia y aplicar una única transición.
5. Guardar marca, estado y desvío en la misma transacción. Insertar en outbox con la clave estable del desvío cuando corresponda.
6. Responder con ID, hora recibida por el servidor y secuencia. La ubicación puede guardarse después y nunca modifica esos valores.

Las restricciones únicas de empresa, jornada, secuencia y clave idempotente respaldan el control de aplicación. La detección programada de `SIN_INGRESO` toma el mismo bloqueo de jornada, vuelve a leer el estado y crea el desvío como máximo una vez. El ingreso tardío compite por el mismo bloqueo y transforma el evento existente.

### Avisos

La clave de agrupación es empresa más una ventana fija de cinco minutos que comienza con el primer desvío; la ventana no se extiende cuando llegan más eventos. Cada lote mantiene conteos por sede. El payload expone solo el total y el identificador, nombre y conteo de cada sede, con texto genérico; nunca incluye motivos, coordenadas ni categoría de salud. El job toma un lease con vencimiento, reúne eventos elegibles y registra el intento. Una clave estable de aviso permite que reintentos o el reemplazo por `LLEGADA_TARDE` actualicen el aviso visible. La ventana, el lease, el estado y los reintentos quedan en MySQL. Los efectos de red del push ocurren fuera de la transacción que guarda la marca.

## Aislamiento de datos

- Toda petición autenticada tiene principal, membresía y empresa activa resueltos por el servidor.
- Una entidad de negocio pertenece a una empresa. Las lecturas y escrituras incluyen esa empresa en su predicado; las relaciones entre empresa, sede, empleado, plantilla, jornada y desvío se validan en el servicio y con claves foráneas/restricciones compatibles.
- Ocultar botones en React no es autorización. Cada endpoint vuelve a comprobar el rol y el alcance de la entidad.
- Una cuenta global puede tener memberships en varias empresas. Cambiar la empresa activa solo selecciona una membership existente.
- Un empleado solo consulta sus jornadas y motivos. Un `ADMIN` solo accede a información de la empresa activa. Las coordenadas exactas solo se serializan para ese `ADMIN`; texto de salud, únicamente para autor o `ADMIN` de la empresa.
- Los procesos programados recorren registros por empresa y conservan la misma autorización de dominio y reglas de aislamiento.

## Privacidad y operación

- El cuerpo de peticiones de login, suscripciones push, motivos y ubicación no se registra. Errores usan códigos estables y `traceId` opaco.
- El texto `SALUD` se cifra con AES-GCM; la clave se entrega por configuración secreta de entorno y nunca se versiona. Una clave ausente o inválida impide servir funciones que la requieren.
- Los endpoints y claves de suscripciones Web Push también se cifran en reposo con una clave independiente. Si push saliente está desactivado, la aplicación puede iniciar sin esa clave y rechaza de forma controlada las altas de suscripción hasta que se configure.
- Coordenadas exactas y texto de salud vencen a los 90 días. Un trabajo de purga elimina el material y el contenido cifrado asociado. Retención de backups y de motivos no sanitarios sigue en [PENDIENTES.md](PENDIENTES.md).
- El service worker cachea solo la shell y recursos estáticos versionados; excluye `/api/`, rutas autenticadas y acciones de marca. La interfaz solo indica que una marca se guardó después de recibir la respuesta del servidor.
- Las pruebas de locks, restricciones e idempotencia usan MySQL 8 mediante Testcontainers. H2 o una base en memoria no sustituye esa puerta.

## Límites del frontend

| Área | Responsabilidad |
| --- | --- |
| `app` | Enrutamiento, carga de sesión, selección de empresa y errores de autenticación. |
| `features/admin` | Empleados, sedes, plantillas, declaración de jornadas, revisión/corrección y bandeja. |
| `features/employee` | Estado actual, marcas confirmadas por el servidor y carga/completado del motivo propio. |
| `shared/api` | Cliente HTTP same-origin, credenciales de cookie, token CSRF, contratos y Problem Details. |
| `device/location` | Solicitar GPS en paralelo a la marca y adjuntar la coordenada al ID devuelto, con timeout visible. |
| `device/push` | Permiso contextual, alta/baja de suscripción y navegación al desvío al tocar una notificación. |
| `service-worker` | Cache app-shell de recursos estáticos; sin cache API, cola offline ni contenido personal. |

La UI nunca calcula la hora oficial, no interpreta una solicitud pendiente como éxito y no conserva marcas para enviarlas sin conexión. `SIN_INGRESO` y su reemplazo usan el mismo ID de desvío de backend. Los módulos de feature no importan internals del backend ni implementan reglas de acceso.

## Contrato y verificación

[openapi.yaml](../openapi.yaml) es la fuente compartida para rutas, campos, códigos de error, CSRF, idempotencia, privacidad y autorización. Los cambios incompatibles requieren actualizar contrato, ambas implementaciones y pruebas en el mismo cambio. Las pruebas de integración deben correr sobre MySQL 8.4, la línea LTS actual de MySQL 8, con Testcontainers. Ver los criterios de aceptación completos en [ESPECIFICACION.md](ESPECIFICACION.md).
