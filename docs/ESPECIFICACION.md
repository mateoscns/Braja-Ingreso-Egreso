# Especificación de v1 — Fichaje Braja

**Estado:** la v1 existente entró a `main` con el PR #2 (rama `feat/v1-implementation`, 2026-10-19) y sus ampliaciones posteriores; esa implementación se verificó contra `main` en `f3c9635` el 2026-10-28. Mateo aprobó en el issue #67 el alcance general de geocerca de sedes, registrado como D-20261027-12. La implementación de geocerca está terminada y verificada localmente en `feat/site-geofence-67`, pero aún no está integrada en `main`. Tres aclaraciones elegidas por Enrique para este candidato siguen pendientes de adopción o ajuste por Mateo; se identifican como propuestas y no amplían por sí solas las decisiones adoptadas. [DECISIONES.md](DECISIONES.md) prevalece si aparece una diferencia.

## Objetivo y límites

Registrar ingreso, egreso, desayuno y almuerzo, y mostrar los desvíos para que el `ADMIN` los revise. El producto es software propio, multiempresa y multisede. No liquida sueldos, no calcula montos, no administra banco de horas y no crea cronogramas semanales. No integra SaaS de fichaje, no envía WhatsApp o Telegram y no usa el dominio actual de Braja. (D-20261014-02, -03, -09, -11 y -16.)

## Personas, identidad y acceso

- **Mateo** adopta decisiones del proyecto. No es un rol operativo de la aplicación por ese solo hecho.
- **`ADMIN`** administra empleados, sedes, plantillas, jornadas, correcciones, desvíos y sus avisos dentro de su empresa.
- **Empleado** registra sus marcas y completa los motivos de sus desvíos.
- El DNI normalizado identifica una cuenta global. La cuenta puede tener membresías y roles diferentes por empresa. Después de iniciar sesión con DNI y contraseña, el servidor valida cada membresía y define el contexto de empresa activa. (D-20261016-01.)
- El servidor deriva empresa, sede autorizada y permisos de la sesión y de las relaciones persistidas. No confía en un `companyId`, `siteId`, rol o usuario objetivo enviado por la interfaz para conceder acceso.
- El primer `ADMIN` se provisiona con una operación segura de backend, sin contraseña o token por defecto. Luego el `ADMIN` administra las cuentas de empleados. Las contraseñas se almacenan con hash resistente; la sesión usa cookie `HttpOnly`, protección CSRF y transporte HTTPS en producción.
- El `ADMIN` puede restablecer la contraseña de un empleado cuya cuenta pertenece únicamente a su empresa y no tiene rol `ADMIN`: el servidor genera una contraseña provisoria que se muestra una sola vez, exige cambiarla al ingresar, cierra todas las sesiones de la cuenta, libera el bloqueo de login del DNI y registra quién lo hizo y cuándo, sin guardar la contraseña. Si la persona está en otra empresa o es `ADMIN`, se rechaza sin decir dónde y lo resuelve el operador. (D-20261027-09.)

## Sedes, plantillas y jornadas

- Cada sede define su zona horaria IANA. Las fechas de jornada se interpretan en la zona de esa sede y los instantes del servidor se guardan como UTC.
- La ubicación de referencia de una sede se configura con latitud, longitud y un radio de 100 m por defecto, ajustable por el `ADMIN` entre 50 y 500 m. El `ADMIN` puede capturar la ubicación actual del dispositivo si está físicamente en el local o ingresar latitud y longitud manualmente. El centro y radio pueden editarse; cada cambio conserva autor, hora, valor anterior y valor nuevo en auditoría. Solo el `ADMIN` de esa empresa consulta las coordenadas exactas de sede, que se conservan mientras exista la sede. Esta ubicación de configuración es distinta de las coordenadas personales de las marcas de empleados (D-20261027-12).
- Sin una fecha elegida, el empleado consulta “hoy” según la zona horaria de cada sede; si tiene sedes en zonas distintas, puede ver fechas locales distintas a la vez. Si elige una fecha, esa fecha local se aplica a todas sus sedes. El calendario del `ADMIN` inicia con la fecha local del dispositivo y la interpreta como fecha local para cada sede.
- El `ADMIN` crea plantillas de horario por sede. Una plantilla contiene uno o más bloques de trabajo, límites de duración para desayuno y almuerzo y una hora final inequívoca, incluso en jornadas nocturnas o cortadas.
- El `ADMIN` declara una jornada por empleado, sede y fecha local. La fecha local del primer bloque identifica la jornada. Una persona puede tener jornadas en sedes distintas el mismo día.
- El `ADMIN` asigna a cada empleado una plantilla por sede con una fecha de inicio (D-20261015-02): la plantilla debe ser de una sede habilitada para el empleado (si no, 422) y la fecha, de los años 2000 a 2100. La asignación no se edita ni se borra: una nueva con fecha de inicio posterior la reemplaza desde esa fecha y el historial queda completo, del inicio más reciente al más antiguo. Repetir empleado, sede y fecha de inicio responde 409 `ASSIGNMENT_EXISTS`. Una plantilla asignada, como una usada por jornadas, no se puede mover a otra sede (409 `TEMPLATE_IN_USE`).
- Al declarar una jornada, la plantilla es opcional: sin ella se usa la asignación vigente del empleado en esa sede para esa fecha (la de inicio más reciente que no sea posterior); si no hay ninguna, responde 422 `TEMPLATE_REQUIRED`. Si el horario cambia en una fecha concreta, el `ADMIN` declara esa jornada con otra plantilla y la asignación no cambia.
- Al declarar la jornada, se copia la plantilla y la tolerancia individual vigentes. Cambiar una plantilla, asignación o tolerancia después no altera jornadas ya declaradas.
- No hay recurrencia semanal. Sin una jornada declarada no hay detección de `SIN_INGRESO`.
- Declaración por lote (D-20261027-11): el `ADMIN` elige de 1 a 200 empleados, una sede, un rango de hasta 31 días inclusive, al menos un día de la semana y, opcionalmente, una plantilla. Para cada empleado y cada fecha del rango con un día elegido se crea la jornada una sola vez, igual que una declaración individual (con la plantilla elegida o, si no, con la asignación vigente de cada empleado en esa fecha); no se guarda ninguna regla. Las fechas que ya tienen una jornada no cancelada se saltean (`JORNADA_EXISTS`), igual que las que no tienen plantilla vigente (`TEMPLATE_REQUIRED`) o cuya plantilla asignada no se puede declarar (`TEMPLATE_INVALID`), y la respuesta informa lo creado y lo salteado con su motivo. Si un empleado está inactivo o no está habilitado en la sede, se rechaza todo el pedido (422) sin crear nada. Si una declaración individual gana la misma fecha al mismo tiempo, el lote la informa como salteada y sigue habiendo una sola jornada.
- El `ADMIN` puede cancelar una jornada declarada solo si no tiene marcas válidas (las anuladas no cuentan), con un motivo obligatorio de 1 a 2000 caracteres (D-20261027-07). La jornada pasa al estado `CANCELADA` y guarda quién, cuándo y el motivo; sus desvíos activos (por ejemplo `SIN_INGRESO`) se retiran con auditoría y un aviso pendiente deja de contarse, como cualquier desvío retirado. Una jornada cancelada no admite marcas ni marcas olvidadas (409 `JORNADA_CANCELLED`), los jobs de ausencia y de `MARCA_FALTANTE` la ignoran, y el empleado la ve como cancelada, sin acciones. Con marcas, la cancelación responde 409 `JORNADA_HAS_MARKS`; cancelar dos veces responde 409 `JORNADA_CANCELLED`. Después de cancelarla se puede volver a declarar el mismo empleado, sede y fecha; entre las jornadas no canceladas sigue habiendo una sola por empleado, sede y fecha.
- Estados de la jornada: `NO_INGRESO`, `EN_CURSO`, `PAUSA_ABIERTA` y `EGRESADA` se derivan de las marcas que cuentan; `CANCELADA` es terminal y solo se alcanza desde `NO_INGRESO` sin marcas.
- Las marcas heredan la sede y el horario de la jornada; la interfaz no puede mover una marca a otra sede.

## Marcas y orden

Las acciones admitidas por jornada son `INGRESO`, `EGRESO`, `SALIDA_DESAYUNO`, `VUELTA_DESAYUNO`, `SALIDA_ALMUERZO` y `VUELTA_ALMUERZO`. Se admite como máximo un ciclo de salida y vuelta de cada pausa, y desayuno y almuerzo pueden realizarse en cualquier orden. No se admite `EGRESO` con una pausa abierta.

1. El servidor captura la hora oficial al recibir la solicitud, una vez tomado el bloqueo de la jornada (desde el 2026-10-27, #46); la app inicia GPS en paralelo y no lo espera.
2. En una transacción MySQL, el servidor bloquea la jornada, valida la acción contra el estado persistido, asigna una secuencia creciente y guarda la marca. La secuencia determina el orden cuando acciones diferentes llegan simultáneamente, incluso si comparten hora de recepción.
3. Cada intento usa una clave de idempotencia. Repetir clave y contenido devuelve la marca ya creada. Reutilizar la clave con contenido diferente da conflicto. No se deduplican acciones distintas mediante una ventana temporal.
4. La app indica éxito solo después de recibir confirmación del servidor y muestra la hora de servidor. Si no hay conexión o el servidor no confirma, la acción no se informa como registrada y no se encola para envío posterior.
5. El `ADMIN` puede corregir una marca o agregar una marca olvidada. El historial conserva el valor original y el corregido, la hora declarada del hecho cuando corresponda, la hora de carga, quién lo hizo, cuándo y el motivo.
6. El empleado puede registrar `INGRESO` desde 30 minutos antes del inicio previsto del primer bloque. Antes de esa ventana el servidor rechaza la marca; los ingresos tardíos no tienen un límite adicional por esta regla. Las demás acciones no se aceptan antes de la hora prevista de inicio.
7. El `ADMIN` puede anular una marca equivocada con un motivo obligatorio de 1 a 2000 caracteres (D-20261027-08). La marca no se borra: queda visible como anulada (el `ADMIN` ve también cuándo y el motivo; el empleado solo ve que está anulada), conserva su número de secuencia y deja de contar para el estado de la jornada, las transiciones y los desvíos, que se recalculan en la misma transacción. Solo se permite si las marcas que quedan forman un historial válido (por ejemplo, no se anula el `INGRESO` mientras haya marcas posteriores): si no, 409 `INVALID_MARK_HISTORY`. Anular dos veces o corregir una marca anulada responde 409 `MARK_VOIDED`. La anulación queda en `mark_correction_audits` con autor, hora y motivo. Reintentar la clave de idempotencia de una marca anulada devuelve su estado actual.
8. El `ADMIN` de la empresa consulta el historial de cambios de una jornada (`GET /admin/jornadas/{id}/audit`; en el detalle de la jornada, sección "Historial de cambios", plegada hasta que se abre). Lista, de más antiguo a más nuevo, la cancelación de la jornada, las marcas olvidadas, las correcciones y anulaciones de marcas y los cambios de sus desvíos (detección, cambio de tipo, clasificación, vuelta a revisión, motivo cargado o corregido, cierre), cada uno con quién lo hizo (o "sistema"), cuándo, el valor anterior y el nuevo, y el motivo del `ADMIN`. Nunca muestra el texto de un motivo (de ninguna categoría, D-20261016-04): de un cambio de motivo solo muestra las categorías. Tampoco muestra coordenadas. Otro rol recibe 403 y una jornada de otra empresa, 404. Devuelve hasta 500 cambios e indica si hay más.

La definición de transiciones y errores está en el contrato [openapi.yaml](../openapi.yaml). La UI carga el estado actual desde el servidor antes de mostrar la acción siguiente.

## Desvíos, pausas y ausencias

- Para el ingreso, se genera `SIN_INGRESO` solo al vencer la hora de inicio de una jornada declarada más la tolerancia individual guardada en esa jornada.
- Si llega el ingreso después de `SIN_INGRESO`, el sistema actualiza el mismo desvío a `LLEGADA_TARDE` cuando la hora del hecho supera el umbral de ingreso. Conserva un solo desvío y un solo motivo. Para una marca olvidada se usa la hora declarada del hecho, no la hora de carga.
- Se genera desvío de egreso cuando la hora queda más de la tolerancia individual antes o después del final previsto de la jornada. Un egreso dentro del margen, incluido el límite exacto, no genera ese desvío.
- Para una jornada cuya sede tiene centro de geocerca configurado, una marca está dentro de la sede solo si la distancia entre las coordenadas recibidas y el centro, más la precisión que reportó el dispositivo, es menor o igual al radio configurado. Si esa condición no se cumple, si la ubicación reportada no permite determinar que esté dentro del radio, o si no llega ubicación, se genera `FUERA_DE_SEDE` (D-20261027-12). La ubicación de una marca sigue pendiente hasta 30 segundos según D-20261014-12; al vencer sin coordenadas, el estado técnico pasa a `SIN_UBICACION` y el desvío informa el incumplimiento de ubicación. El empleado completa categoría y motivo conforme a D-20261014-07. El desvío queda en la bandeja, no genera push y nunca bloquea la marca.
- Si una jornada tiene `INGRESO` y no tiene `EGRESO` al superar la hora prevista de fin más la tolerancia individual guardada en la jornada, el job de ausencias genera `MARCA_FALTANTE` (D-20261018-01). Aparece solo en la bandeja interna; no genera push. Una pausa abierta no lo impide.
- Si el `EGRESO` llega después (marca del empleado, marca olvidada del `ADMIN` o corrección), dentro de la tolerancia el `MARCA_FALTANTE` se cierra y no queda desvío; fuera de la tolerancia el mismo desvío pasa a `EGRESO_TARDIO` con la hora real, conservando su motivo (D-20261019-01).
- La duración de desayuno y almuerzo se compara con el límite configurado en la plantilla congelada en la jornada. El exceso genera un desvío en la bandeja.
- Ante un desvío, el empleado elige `SALUD`, `TRANSPORTE`, `EMERGENCIA` u `OTRA` y escribe el motivo. Puede completarlo después; mientras tanto queda `MOTIVO_PENDIENTE`. La vista del empleado muestra sus motivos pendientes de cualquier fecha, incluida la jornada nocturna del día anterior.
- Mientras el `ADMIN` no clasificó el desvío, el empleado puede corregir su motivo; después queda fijo y un nuevo envío responde 409 `MOTIVE_LOCKED`. Si el `ADMIN` clasificó sin motivo y el motivo llega después, se acepta, la clasificación se borra y el desvío vuelve a revisión. Cada envío, corrección y vuelta a revisión queda en `deviation_audits` con autor y hora, sin el texto (D-20261027-02).
- Solo el `ADMIN` de la empresa decide si un desvío está justificado o no justificado. La bandeja permite revisar y corregir esa clasificación con auditoría.
- Si un desvío cambia de tipo (por ejemplo `SIN_INGRESO` a `LLEGADA_TARDE`, o `MARCA_FALTANTE` a `EGRESO_TARDIO`), su clasificación se borra y vuelve a revisión; el motivo se conserva y el cambio queda auditado (D-20261027-01). Un desvío retirado que vuelve a activarse es un hecho nuevo: empieza sin motivo ni clasificación, y la clasificación borrada queda auditada.
- La llegada tardía que reemplaza `SIN_INGRESO` actualiza el mismo desvío y su aviso; no crea un segundo evento visible.

### Aclaraciones propuestas para la implementación local

Las siguientes aclaraciones fueron seleccionadas por Enrique el 2026-10-29 para preparar una implementación revisable. No son decisiones de Mateo ni deben describirse como definitivas hasta que él las adopte o ajuste. Se mantienen en [PENDIENTES.md](PENDIENTES.md).

- Si al declarar la jornada la sede no tiene un centro de geocerca, esa jornada no recibe centro ni radio efectivos y no se evalúa contra una geocerca, aunque la sede se configure más tarde.
- Si la sede sí tiene centro al declarar la jornada, se congela en ella el centro y el radio vigentes. Las ediciones de sede solo afectan jornadas declaradas después; las jornadas previas sin instantánea no se evalúan retroactivamente.
- Se propone un desvío `FUERA_DE_SEDE` por cada marca de empleado que quede fuera, cuya precisión no permita confirmar que está dentro, o cuya ubicación no llegue en 30 segundos. Las marcas olvidadas cargadas por `ADMIN` no se someten a GPS. La marca nunca se bloquea y el desvío no genera push. Para una marca dentro del radio, la distancia al centro congelado más la precisión reportada debe ser menor o igual al radio.
- Cada desvío ligado a una marca incluye su `sourceMarkId`, acción y secuencia para que la persona pueda identificar el hecho. La respuesta no expone las coordenadas de la sede ni de la marca.

## Ubicación y privacidad

- La captura de ubicación empieza en paralelo al envío de la marca. La marca nunca espera la geolocalización ni la usa para bloquear el fichaje. Si la ubicación está disponible, se asocia después a la marca. Si no llega dentro de 30 segundos desde la aceptación de la marca, el servidor cierra el estado como `SIN_UBICACION`; una ubicación fuera de esa ventana se rechaza.
- Las coordenadas exactas de las marcas solo las consulta el `ADMIN` de la empresa y se purgan a los 90 días. Se usan también para evaluar la geocerca de sede conforme a D-20261027-12, sin bloquear la marca ni convertir la ubicación en prueba de identidad.
- Las coordenadas de referencia de una sede solo las consulta el `ADMIN` de esa empresa y se conservan mientras exista la sede; no se les aplica la purga de 90 días de las coordenadas de marca. La edición de centro o radio requiere auditoría (D-20261027-12).
- El texto libre de categoría `SALUD` se cifra en reposo y solo lo pueden leer el empleado autor y el `ADMIN` de esa empresa. Se purga a los 90 días: se borra solo ese texto; la categoría queda y los motivos de otras categorías no se purgan (D-20261016-04).
- Los motivos y las coordenadas no aparecen en logs, eventos de monitoreo, cachés de la PWA ni payloads push. La categoría de salud tampoco aparece en push.
- La PWA solo cachea archivos estáticos versionados; nunca cachea API autenticada, marcas pendientes, coordenadas o motivos.

## Bandeja y push

La bandeja interna es la fuente de verdad y muestra todos los desvíos. En la vista del `ADMIN`, cada caso identifica al empleado y la sede, permite clasificarlo y corregir una clasificación previa con motivo de auditoría. El push se envía solo al `ADMIN`, en lotes por empresa con ventanas fijas de cinco minutos y conteo por sede.

| Tipo de desvío | En bandeja | Push v1 |
| --- | --- | --- |
| `SIN_INGRESO` | Sí | Sí |
| `LLEGADA_TARDE` | Sí | Sí; reemplaza el aviso de ausencia existente |
| `MARCA_FALTANTE` | Sí | No, solo bandeja interna |
| `FUERA_DE_SEDE` | Sí; requiere motivo del empleado | No |
| Exceso de desayuno o almuerzo | Sí | No, apagado por defecto |
| Otros tipos | Sí | No hasta que Mateo los habilite en la matriz |
| Completar o corregir motivo (mientras no esté clasificado) | Actualiza el desvío | No genera push |

La bandeja del `ADMIN` se ordena por la hora del hecho (`occurredAt`), de la más reciente a la más antigua, con un cursor estable que no saltea ni repite filas aunque un desvío se clasifique entre páginas (D-20261027-03). Se filtra por empleado, sede y rango de fechas locales de jornada (hasta 366 días; el cursor de paginación solo continúa el mismo conjunto de filtros; un empleado o sede de otra empresa responde 404) y el `ADMIN` consulta el historial de jornadas, marcas y desvíos de un empleado o sede en un rango acotado (D-20261023-01). Cada desvío expone `occurredAt`, la hora del hecho: la de la marca que lo originó, o el vencimiento (inicio o fin programado más tolerancia) en `SIN_INGRESO` y `MARCA_FALTANTE`; la sesión expone el nombre visible de la persona en la empresa activa, que no existe para un `ADMIN` sin ficha de empleado (D-20261023-02).

El agrupador, los intentos de entrega y el estado se guardan en MySQL. Un lease evita dos dispatchers simultáneos; reintentos usan una clave estable para actualizar el aviso correspondiente. La entrega es al menos una vez: un evento solo se suma a una ventana que nadie reclamó todavía; si llega después, abre una ventana nueva. Un desvío retirado que vuelve a activarse es un hecho nuevo y avisa otra vez; el reemplazo de `SIN_INGRESO` por `LLEGADA_TARDE` no. Solo un 404 o 410 del proveedor borra la suscripción; cualquier otro rechazo es un intento fallido que se reintenta (5 s a 1 h, `DEAD` tras 12). Las alertas se activan por empresa: el `ADMIN` las pide en cada empresa, abrir otra empresa no suscribe el dispositivo y cerrar sesión no las corta (D-20261027-04). Los payloads solo contienen conteos y datos de navegación no sensibles, nunca motivos, coordenadas ni categorías de salud. No se usan Redis ni brokers externos.

## API y módulos

El contrato compartido está en [openapi.yaml](../openapi.yaml). Incluye sesión por DNI y contraseña, membresías, datos de sedes y plantillas, declaración y consulta de jornadas, marcas idempotentes, ubicación posterior, motivos, clasificación/corrección de desvíos, bandeja y suscripción push. Las APIs no guardan acciones offline.

El backend es un monolito modular Spring Boot MVC. Las reglas de aplicación se agrupan por identidad/acceso, configuración de empresa y sede, jornadas/marcas, desvíos/privacidad y avisos. La interfaz React + TypeScript llama el contrato API y contiene adaptadores aislados para geolocalización y Web Push. La persistencia usa MySQL 8, Flyway y transacciones; no se agregan servicios de control horario, Redis, brokers ni microservicios.

## Desarrollo local

Requisitos: Java 21, Node.js LTS, Docker Desktop (para MySQL y Testcontainers) y el cliente Docker disponible. MySQL local y Testcontainers usan la serie MySQL 8.4 LTS.

Copiar `.env.example` a `.env`; mantener ese archivo fuera de Git. `docker-compose.yml` no arranca MySQL sin `SPRING_DATASOURCE_PASSWORD` (usuario `braja_app`) y `BRAJA_DB_ROOT_PASSWORD`. En PowerShell se puede generar una clave privada aleatoria de 32 bytes para cada clave así:

```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

Ejecutar el bloque tres veces y guardar resultados distintos en `BRAJA_HEALTH_ENCRYPTION_KEY_BASE64` (motivos `SALUD`), `BRAJA_LOGIN_IP_THROTTLE_KEY_BASE64` (HMAC del límite de login por IP) y `BRAJA_PUSH_SUBSCRIPTION_ENCRYPTION_KEY_BASE64`. El backend no arranca sin las dos primeras ni si son iguales (`BrajaProperties.validate`). No reutilizar claves entre propósitos ni entornos. Las claves VAPID quedan vacías hasta configurar push saliente; si push está desactivado, la app puede iniciar sin clave de suscripción y rechazará de forma controlada el alta de suscripciones hasta configurarla. Luego:

```powershell
docker compose up -d mysql
cd backend
.\mvnw.cmd verify
.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"
```

El perfil `local` es obligatorio en desarrollo: es el que importa `../.env` (`application-local.yml`), permite la cookie de sesión sin `Secure` sobre HTTP y es el único caso en que el backend arranca sin `BRAJA_TRUSTED_PROXY_CIDRS` (`BrajaProperties.validate(Environment)`, llamado por `EncryptionService`). Sin ese perfil, y sin esas variables en el entorno, el arranque falla. `.\mvnw.cmd verify` corre las pruebas de integración contra MySQL 8.4 con Testcontainers; no necesita el contenedor de `docker compose`.

En otra terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Antes de integrar, el mismo control que corre el CI: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` y `npm run audit:prod`.

El backend usa Maven Wrapper para fijar su versión sin exigir una instalación global de Maven. El contrato OpenAPI es la referencia para ambos módulos.

## Criterios de aceptación de v1

La v1 existente se verificó el 2026-10-28 sobre `main` en `f3c9635`. Los criterios de geocerca agregados el 2026-10-29 se verificaron en el candidato local `feat/site-geofence-67`; todavía requieren revisión y aprobación antes de integrarse. Un criterio se marca `[x]` solo si un test o un camino de código con nombre lo cubre; entre paréntesis va la cita. Alias de CLAUDE.md §3: `IT` = `BackendMySqlIntegrationTest`, `Outbox` = `NotificationOutboxMySqlTest`. Los tests del backend están en `backend/src/test/java/com/braja/fichaje/` y los del frontend, en `frontend/src`.

- [x] Login por DNI normalizado, cambio seguro de contraseña y selección validada de empresa; el rol y la empresa nunca se aceptan como autorización desde el cliente. (`IT.httpLoginCreatesHttpOnlySessionCookieAndCsrfProtectsMutableRoutes`: login con `30.123.456` y empresa desconocida rechazada; `PasswordChangeSessionInvalidationMySqlTest`; `LoginHardeningMySqlTest.wrongCurrentPasswordIsThrottledLikeLoginAndHasADistinctCode`; `IT.httpSecurityRejectsAnonymousRequestsAndEmployeeCannotUseAnotherCompaniesIdsOrAdminRoutes`.)
- [x] Roles y datos quedan aislados entre empresas y sedes; IDs manipulados no habilitan lectura ni escritura cruzada. (`IT.validAdminsCannotReadOrModifyRecordsFromAnotherCompany`, `IT.httpSecurityRejectsAnonymousRequestsAndEmployeeCannotUseAnotherCompaniesIdsOrAdminRoutes`, `IT.employeeTemplateListIsRestrictedToAssignedSitesWithoutSiteFilter`.)
- [ ] Plantillas son por sede; jornadas son por empleado, sede y fecha local; los cambios posteriores no alteran la copia de horario y tolerancia de jornadas existentes. (Sin marcar: ningún test cambia una plantilla o una tolerancia después de declarar y compara la copia guardada.)
- [x] Cada empleado tiene una plantilla asignada por sede con fecha de inicio e historial; declarar sin plantilla usa la vigente, y la declaración por lote crea cada jornada una sola vez, saltea e informa las existentes y no deja dos jornadas vivas ante una declaración concurrente. (`TemplateAssignmentAndBulkDeclarationMySqlTest`: `anAssignmentIsStoredWithItsAuthorAndTheHistoryIsListedNewestFirst`, `declaringWithoutTemplateUsesTheAssignmentInForceOnThatDateAtThatSite`, `bulkSkipsAndReportsExistingJornadasButNotCancelledOnes`, `bulkAndSingleDeclarationsOfTheSameDaysAtTheSameTimeYieldOneJornadaPerDayAndNo5xx`.)
- [x] Cada transición de marca válida funciona; pausas pueden ir en cualquier orden, se permite un ciclo por pausa y se rechaza egreso con pausa abierta. (`MarkTransitionPolicyTest.breakfastAndLunchMayBeTakenInEitherOrderOnceEach`, `.aPauseMustBeClosedBeforeAnotherActionAndBeforeEgress`; `IT.reusedIdempotencyKeyWithDifferentPayloadConflictsAndPauseMustCloseBeforeEgress`.)
- [x] El `ADMIN` puede agregar marcas olvidadas con hora del hecho separada de la hora de carga, incluso si el egreso ya se registró; y corregir marcas conservando auditoría. (`IT.forgottenIngressCanBeInsertedBeforeAlreadyStoredEgresoAndKeepsReceiptSequence`; `JornadaCancellationAndMarkVoidMySqlTest.correctionOfAMarkThatIsNotVoidedStillWorksAndIsAuditedAsACorrection`; `JornadaAuditHistoryMySqlTest.adminReadsEveryChangeOfTheJornadaInOrderWithActorNamesAndNoMotiveTextOrCoordinates`.)
- [x] Marcas distintas concurrentes quedan secuenciadas bajo bloqueo MySQL; el reintento exacto es idempotente y reutilizar una clave con otro contenido da conflicto. (`IT.fiveDistinctConcurrentPauseRequestsYieldOneAcceptedMarkAndFourCodedConflicts`, `IT.identicalConcurrentRetriesPersistOneMarkAndReturnTheOriginalResponse`, `IT.reusedIdempotencyKeyWithDifferentPayloadConflictsAndPauseMustCloseBeforeEgress`.)
- [x] `SIN_INGRESO` compite de manera segura con el ingreso tardío; al llegar este, se actualiza el mismo desvío a `LLEGADA_TARDE` cuando corresponda, sin duplicar motivo ni aviso. (`IT.ingresoCommittedAfterRepeatableReadSnapshotWinsAgainstAbsenceWorker`; `Outbox.replacingAbsenceUpdatesOneOutboxEventAndDispatchCountsOnlyActiveDeviationsBySiteName`; `Outbox.reactivatedDeviationAfterSentWindowNotifiesAgainButReplacementDoesNot`.)
- [x] Egreso temprano o tardío más allá de tolerancia genera desvío; dentro del margen no lo genera. (`DeviationPolicyTest.earlyAndLateEgressOnlyDeviateOutsideTheInclusiveToleranceWindow`.)
- [x] `MARCA_FALTANTE` se genera una sola vez para una jornada con `INGRESO` y sin `EGRESO` pasada la tolerancia, sin push; un egreso posterior lo cierra (dentro del margen) o lo convierte en `EGRESO_TARDIO` en el mismo desvío. (`IT.missingEgressWorkerCreatesOneInternalDeviationAndSkipsItOnNextTick`, `Outbox.missingEgressDeviationNeverEntersTheOutboxOrOpensAWindow`, `IT.laterEgressWithinToleranceClosesMissingEgressWithoutLeavingADeviation`, `IT.laterEgressOutsideToleranceReplacesTheSameDeviationWithEgresoTardioAndKeepsTheMotive`.)
- [x] Ubicación lenta, denegada o fallida no demora la marca; la asociación posterior respeta 30 segundos y luego queda `SIN_UBICACION`. (`markFlow.test.ts`: "inicia GPS sin bloquear la marca…", "confirma la marca aunque el GPS esté denegado"; `IT.pendingLocationBecomesSinUbicacionAfterThirtySecondWindow`.)
- [x] Empleado no lee coordenadas de otros; solo ADMIN de su empresa ve ubicación exacta; coordenadas y texto de salud se purgan a los 90 días. (`IT.healthMotiveAndCoordinatesAreScopedAndPurgedAfterNinetyDays`; `AdminHistoryFiltersMySqlTest.employeeHistoryDetailNeverExposesAnotherAuthorsMotiveOrCoordinatesButAdminSeesCoordinates`.)
- [x] El `ADMIN` configura y edita centro y radio por sede; la interfaz permite captura del dispositivo o coordenadas manuales, y cada cambio se audita con autor, hora y valores anterior y nuevo. (`OrganizationTransactionMySqlTest.createSiteSavesFirstCenterAuditInSameTransaction`, `.siteLocationUpdateAuditsAndRollsBackAsOneTransaction`, `.siteLocationEndpointsEnforceAdminAndCompanyIsolation`; `SiteCoordinatesControllerTest`; `SitesViewRender.test.tsx`; `siteLocation.test.ts`.)
- [x] Las marcas se comparan con el centro y radio congelados en su jornada; las marcas fuera, imprecisas o sin ubicación crean `FUERA_DE_SEDE`, que queda en bandeja sin push y nunca bloquea la marca. (`IT.declaredJornadaFreezesTheSiteGeofenceAndCreatesOneDeviationPerOutsideMark`, `IT.missingEmployeeLocationCreatesOnePerMarkAfterThirtySecondsAndDoesNotDuplicateOnRetry`, `IT.locationAttachmentAndThirtySecondTimeoutRaceAcceptsOnTimePayload`, `IT.timelyLocationAfterTimeoutRetractsOrPreservesTheSamePerMarkDeviation`, `GeofencePolicyTest`; la categoría y el motivo siguen el flujo general de desvíos.)
- [x] El candidato probado omite la geocerca si la sede no tiene centro al declarar y conserva el centro/radio de la jornada cuando cambia la configuración de sede. (Comportamiento implementado como propuesta pendiente de Mateo; `IT.jornadaDeclaredWithoutSiteCenterSkipsGeofenceEvenAfterSiteIsConfigured`, `IT.declaredJornadaFreezesTheSiteGeofenceAndCreatesOneDeviationPerOutsideMark`.)
- [x] El candidato probado aplica un `FUERA_DE_SEDE` por marca de empleado, y al anular la marca retira solo su desvío. (Esta granularidad sigue pendiente de adopción por Mateo; `IT.declaredJornadaFreezesTheSiteGeofenceAndCreatesOneDeviationPerOutsideMark`, `IT.voidedMarkRejectsLateLocationAndNeverCreatesOutsideDeviation`, `V28__per_mark_geofence_deviations.sql`.)
- [ ] Solo el autor y ADMIN de su empresa leen motivos de salud; secretos y datos sensibles no llegan a logs, caché o push. (Sin marcar: el acceso y el push tienen test, `IT.healthMotiveAndCoordinatesAreScopedAndPurgedAfterNinetyDays` y `SafePushPayloadFactoryTest.payloadContainsOnlyStableNavigationAndAggregatedCounts`, pero ningún test revisa los logs.)
- [x] Push agrupa por empresa en ventanas fijas de cinco minutos, cuenta por sede, reintenta sin duplicados visibles y solo notifica por `SIN_INGRESO` y `LLEGADA_TARDE`. (`NotificationWindowPolicyTest`; `Outbox.groupsByFirstEventForFiveMinutesAndReplacementKeepsOneOutboxEvent`; `Outbox.partialDeliverySchedulesRetryWithStableTagAndTopic`; `PUSH_TYPES` en `JdbcDeviationNotificationOutbox`.)
- [x] La PWA no cachea respuestas de API ni encola marcas offline; solo presenta éxito tras confirmación del servidor. (`sw.ts`: `/api/v1` en `NetworkOnly`; `routePolicy.test.ts`: "mantiene cualquier ruta API fuera del fallback de navegación"; `markFlow.test.ts`: "no confirma hasta obtener respuesta del servidor…".)
- [x] La bandeja y el historial del `ADMIN` filtran por empleado, sede y fecha (rango de hasta 366 días) sin cruzar empresas; `occurredAt` de cada desvío es la hora del hecho y la sesión trae el nombre visible. (`AdminHistoryFiltersMySqlTest`: `inboxFiltersByEmployeeBySiteByDateRangeAndTheirCombination`, `inboxFilterWithAnotherCompanysEmployeeOrSiteIsNotFoundAndLeaksNothing`, `historyRejectsInvertedOverlongRangesAndTooManyJornadas`, `lateArrivalOccurredAtIsTheMarkTimeNotTheDetectionTimeOfTheAbsenceItReplaced`, `sessionExposesTheEmployeeDisplayNameOnLoginAndOnGetSession`.)
- [x] Las pruebas de integración validan bloqueo, restricciones y aislamiento contra MySQL 8 con Testcontainers. (`IT`, `Outbox` y las demás clases `*MySqlTest` usan `MySQLContainer` con `mysql:8.4`; `IT.migrationsCreateTheTenantAndPrivacyInvariants`.)

La prueba final de Web Push requiere URL HTTPS y el iPhone real del `ADMIN`. Capacitor solo se incorpora si esa prueba falla de forma confiable; la validación de dispositivo y la revisión legal siguen siendo puertas de entorno, no excusas para omitir los controles técnicos en el código.
