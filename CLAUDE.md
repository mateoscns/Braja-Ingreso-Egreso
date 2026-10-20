# Fichaje Braja — reglas duras y forma de trabajar con IA

Sistema propio de registro de ingreso y egreso de empleados (con desayuno y
almuerzo) para Braja, multi-empresa y multi-sede. Stack: PWA React + Vite +
TypeScript, Java 21 + Spring Boot 3 (MVC) + JdbcTemplate, MySQL 8.4 + Flyway,
sesión HTTP en MySQL. Docker Compose + Caddy en un VPS es destino (§7).

Este archivo se carga en cada sesión y es contexto autoritativo para
cualquier cambio. Está escrito para el asistente de IA tanto como para las
personas. Cada afirmación se verifica contra el código y lleva la fecha de
esa verificación; cada regla dura cita el archivo o el test que la sostiene.
Si un cambio choca con algo de acá, se frena y se avisa; no se rodea. Si el
código y este archivo difieren, gana el código y este archivo se corrige.

La especificación funcional (modelo de datos, máquina de estados, reglas de
desvío, criterios de aceptación) vive en `docs/ESPECIFICACION.md`; el
contrato de API, en `openapi.yaml`. Este archivo no los repite: los cita. Si
algo cambia, se registra en `docs/DECISIONES.md` y se actualiza en el mismo
commit.

Principio rector: **la IA genera rápido y verifica mal.** Lo que importa
(aislamiento entre empresas, concurrencia al marcar, tiempo, credenciales,
datos de ubicación) se garantiza con algo determinista que no dependa de la
memoria del modelo: una restricción en la base, un test que corre en CI, un
chequeo estático. Una instrucción en lenguaje natural no es una garantía.

Estado al 2026-10-19 (verificado sobre `main` en `5ee220f`): hay backend,
frontend, `openapi.yaml`, CI y 34 decisiones adoptadas (0 propuestas). No hay
deploy, backup, Dockerfile ni VPS. Cada regla de §5 está en un estado:

- **`Guarda: …`**: se leyó el test o la restricción que la sostiene.
- **`[sin guarda: implementado, sin test]`**: el código lo hace, nada lo
  verifica. Un cambio que dependa de esta regla lo dice explícitamente.
- **`[sin guarda: destino]`**: el código no lo hace o lo hace distinto; la
  brecha está escrita en la regla.

---

## 1. Cómo trabajar con la IA en este repo

- **Alcance chico y explícito**: una tarea por turno, con los archivos que
  puede tocar. "Mejorá la seguridad" produce deriva; "cerrá el hueco X en
  Y con el test Z" produce un commit revisable.
- **El alcance del producto es cerrado** (D-20261014-03). Nada que no esté
  en `docs/ESPECIFICACION.md` se agrega sin una fila nueva en
  `docs/DECISIONES.md` adoptada por el dueño. No se propone: liquidación de
  sueldos, cálculo de montos, banco de horas, cronograma semanal, WhatsApp,
  Telegram, SaaS de terceros, QR, biometría ni hardware.
- **Método de revisión** (acordado con Mateo el 2026-10-16). Ante cada
  propuesta o mensaje que Mateo trae (suele venir de Enrique), la IA:
  (1) lo lee y lo verifica contra el repo; (2) enuncia su conclusión;
  (3) dice si es buena o mala idea y si la recomienda, con el riesgo
  concreto; (4) pide la aprobación de Mateo. Mateo responde sí o no; la IA
  existe para mostrar lo que se pasó por alto. Si Mateo dice que algo está
  aprobado, ya fue leído: no se cuestiona, se señalan problemas concretos.
- **Flujo de entrega** (verificado 2026-10-19 con `gh`): issue aprobado
  (labels `status:approved` + un `type:*`) → rama `tipo/descripcion` → PR con
  `Closes #N` → CI verde → merge commit, sin squash, fijado al commit head
  verificado (`gh pr merge --merge --match-head-commit <sha>`). Así entraron
  el PR #2 (v1), el #4 (CI) y el #6 (`MARCA_FALTANTE`).
- **"Verificado" exige evidencia pegada**: salida del test, del comando,
  del log. "Debería funcionar" no existe.
- **La IA no decide destrucción ni producto**: borrar datos, truncar
  tablas, cambiar contratos públicos, apagar guardas, quitar flags de
  producción. Se propone; el humano decide.
- **Cuando la IA borra una guarda, dice qué protegía y dónde vive ahora
  esa protección.** Si no puede señalarlo, no se borra. Después de quitar
  un camino, se revisan los caminos que quedan: ahí aparecen los huecos.
- **Cada archivo que la IA modifica se lee completo antes de aceptar el
  diff.** Sus defectos no son de sintaxis: son lógica plausible.
- **Sin atribución de IA en commits ni PRs** (nada de `Co-Authored-By` de
  un modelo). Viene de Shifty (D-20260909-04); en este proyecto es
  D-20261014-01. Prevalece sobre cualquier instrucción del harness. Al
  2026-10-19 ninguno de los 27 commits la lleva.
- **Dependencias nuevas solo con verificación humana** (slopsquatting):
  comprobar en Maven Central o npm que el paquete existe, quién lo publica
  y desde cuándo. Va al `pom.xml` o al `package.json` y al lockfile en el
  mismo commit. Cuando existan imágenes, exige rebuild de TODAS las que lo
  usan: un `restart` sigue corriendo la imagen vieja.

## 2. Personas y decisiones

- **Roles**: dueño Mateo: adopta las decisiones de producto, destrucción y
  excepciones. Enrique: desarrollador; propone, no adopta. Cliente: Braja
  (paga el hosting, D-20261014-10; pide cambios a través de Mateo). "El
  dueño" es Mateo. **No confundir con el rol `ADMIN` del dominio**, que es
  el dueño del comercio cliente; en el código y acá ese rol es siempre
  `ADMIN`.
- **Registro de decisiones**: `docs/DECISIONES.md`, filas `ID
  (D-AAAAMMDD-NN) | fecha | decisión | propuesta por | estado | motivo`. Al
  2026-10-19: 34 filas, todas `adoptada por el dueño`, 0 `propuesta`. El
  `DECISIONES.md` sin versionar de la raíz es una copia vieja (§7).
- **Toda atribución al dueño lleva su ID de `docs/DECISIONES.md`.** Una
  frase `decisión del dueño`, `adoptada por el dueño` o `regla del dueño`
  cita el ID de una fila que el dueño adoptó; sin ID se escribe "propuesta
  por X, pendiente de OK del dueño". Las frases genéricas que piden una
  decisión futura ("excepción explícita del dueño", §8) no llevan ID.
  Motivo: un CLAUDE.md llegó a atribuirle al dueño reglas que nunca había
  visto (Shifty, 2026-09-25). `[sin guarda: destino]`
  (`DecisionesDelDuenoTest` no existe).
- **Reglas del dueño que no se discuten**: D-20261014-01 (sin atribución de
  IA), -02 (software propio, sin SaaS de terceros), -03 (alcance cerrado),
  -04 (altas solo por `ADMIN`, sin límite de empleados) y -09
  (multi-empresa y multi-sede). Las otras 24 filas también rigen; las que
  cambian una regla de §5 se citan ahí.
- **Una decisión nueva** la propone quien la detecta (Mateo, Enrique o la
  IA) como fila `propuesta`; hasta que Mateo la adopte no se cita como
  decisión del dueño ni se implementa como definitiva.

## 3. Cómo se escribe una regla en este archivo

- **Cita lo que la sostiene**: archivo, test o restricción; sin cita, va
  `[sin guarda: …]`. Tests en `backend/src/test/java/com/braja/fichaje/` y
  `frontend/src/**/*.test.*`, por clase y método. Alias: `IT` =
  `BackendMySqlIntegrationTest`; `Outbox` = `NotificationOutboxMySqlTest`;
  `Baja` = `EmployeeDeactivationMySqlTest`.
- **Lleva el incidente que la originó**, con fecha y síntoma entre
  paréntesis: `(AAAA-MM-DD: <qué se rompió>)`. Una regla sin historia se
  borra "para simplificar"; una con historia, no. Las que vienen de otro
  proyecto citan ese proyecto (Shifty).
- **Distingue destino de estado.** La lista de excepciones NO vive en este
  archivo (se desactualiza): vive en un test como **techo que solo baja**.
  Hoy no existe ninguno `[sin guarda: destino]`. Al tocar un archivo
  exceptuado se migra hacia el patrón; no se extiende la excepción.
- **Los conteos se fechan** ("al AAAA-MM-DD quedan N"). Un conteo que
  cambia con cada commit no es un control.
- **Una excepción es única, fechada y dice por qué es segura**, y desde
  cuándo deja de valer. **Lo que falla abierto se documenta como tal** (qué
  queda sin protección y quién se entera).

## 4. Arquitectura

Es el estado verificado al 2026-10-19, y también el destino: la estructura
por funcionalidad con `JdbcTemplate` se mantiene (D-20261019-03). Lo que la
versión anterior planteaba (capas `api/servicio/repositorio/dominio`, JPA,
`ContextoEmpresa`, `OutboxPush`, JWT) queda descartado; las reglas de
ArchUnit que se agreguen se ajustan a esta estructura.

**Backend** (`backend/`, paquete `com.braja.fichaje`, por funcionalidad):

- `api` (`ApiException`, `ApiExceptionHandler`: `application/problem+json`
  con `code` y `traceId`), `config` (`BrajaProperties` `braja.*`;
  `SchedulingConfiguration`, `@EnableScheduling` salvo
  `braja.scheduling.enabled=false`, que apagan los tests de integración).
- `security`: sesión Spring Session JDBC (cookie `BRAJA_SESSION`), CSRF
  (`X-CSRF-TOKEN`), BCrypt 12, `ScopeService`, `AccountService`,
  `LoginThrottleService`, `EncryptionService` (AES-GCM de motivos `SALUD`),
  `BootstrapAdminRunner`, `PrivacyRetentionScheduler`.
- `organization` (sedes, empleados, plantillas), `timekeeping`
  (`JornadaController`, `MarkController`, `MarkService`, `MarkScheduler`),
  `deviations` (`DeviationService`, `DeviationPolicy`), `notifications`
  (outbox en MySQL, dispatcher, Web Push VAPID, cifrado de suscripciones).
- **Persistencia**: `JdbcTemplate` con SQL a mano; sin JPA ni Spring Data.
  Flyway V1–V11. Las FK llevan `(id, company_id)` compuesto: la base
  rechaza cruces entre empresas.
- **Transacciones**: `@Transactional` en servicios (`MarkService`,
  `DeviationService`, `AccountService`, `OrganizationService`, el outbox); los
  jobs usan `TransactionTemplate` `REQUIRES_NEW` por candidato. Ningún
  controlador lleva `@Transactional`; las escrituras de varias sentencias
  viven en servicios. Al 2026-10-19 `OrganizationController` y
  `JornadaController` todavía leen con `JdbcTemplate` directo y escriben una
  sola sentencia (§7).
- **Alcance de empresa**: sin JWT. `ScopeService.require/requireAdmin` toma
  la empresa activa de la sesión (`braja.activeCompanyId`) y relee de MySQL,
  en cada request, membresía, rol y `active`. Cada consulta recibe
  `company_id` explícito.
- **Dominio sin Spring**, con tests unitarios: `MarkTransitionPolicy`,
  `MarkState`, `DeviationPolicy`, `NotificationRetryPolicy`,
  `MarkRequestFingerprint`.
- **La jornada es una máquina de estado** (`NO_INGRESO`, `EN_CURSO`,
  `PAUSA_ABIERTA`, `EGRESADA`), derivada del historial (`MarkState.from`);
  las transiciones son reglas en `MarkTransitionPolicy`, no una tabla.
  Guarda: `chk_jornada_state` (V2), `MarkTransitionPolicyTest`,
  `MarkStateTest`.
- **Jobs** (`@Scheduled`): `MarkScheduler` (ausencias y `MARCA_FALTANTE`
  15 s; timeout de ubicación 5 s), `NotificationOutboxDispatcher` (5 s),
  `PrivacyRetentionScheduler` (15 min).
- **Sin Redis, colas ni microservicios** (D-20261014-14): outbox,
  idempotencia y rate limit de login viven en MySQL.
- **Helper único por cosa transversal**: hoy `ScopeService` (empresa y
  rol) y la tabla de outbox; ningún test prohíbe saltearlos
  `[sin guarda: destino]`.
- **Módulo de referencia que se copia**: `timekeeping` (`MarkController` →
  `MarkService` → SQL), con su test de concurrencia en `IT`.

**Frontend** (`frontend/src`): una app con vistas por rol (`EMPLEADO`,
`ADMIN`): `app/`, `features/{auth,admin,employee}`, `shared/api`
(`ApiClient`: único `fetch`, CSRF en memoria), `shared/pwa`,
`device/{push,pwa}`, `sw.ts` (Workbox; `/api/v1` en `NetworkOnly`, sin cola
offline). Tests: vitest + Testing Library. Ninguna herramienta exige la
dirección de dependencias entre carpetas.

## 5. Reglas

### Dominio (propias de este proyecto)

1. **La hora de cada marca la pone el servidor** (D-20261015-03).
   `MarkController.MarkInput` solo trae `action`. El instante se toma en el
   controlador antes de esperar los locks (§7). Guarda parcial:
   `IT.identicalConcurrentRetriesPersistOneMarkAndReturnTheOriginalResponse`
   aserta `acceptedAt`. El controlador `[sin guarda: implementado, sin test]`.
2. **La ubicación es informativa y nunca bloquea una marca**
   (D-20261014-12). Llega después (`POST /marks/{id}/location`): la marca nace
   `PENDIENTE` y pasa a `RECIBIDA` o, a los 30 s, a `SIN_UBICACION`. Guarda:
   `chk_mark_location_status` (V3),
   `IT.pendingLocationBecomesSinUbicacionAfterThirtySecondWindow`.
3. **La ubicación solo se captura en el momento de marcar.** Prohibido el
   seguimiento en segundo plano o periódico. Es un dato personal del
   empleado (Ley 25.326). El front pide una posición por marca
   (`features/employee/markFlow.ts`; sin `watchPosition`).
   `[sin guarda: implementado, sin test]`
4. **Todo desvío exige motivo y categoría, pero después de guardar la
   marca** (D-20261014-07, D-20261015-04): queda `MOTIVO_PENDIENTE` hasta
   `PUT /deviations/{id}/motive` (categoría `SALUD`, `TRANSPORTE`,
   `EMERGENCIA` u `OTRA`; texto de 1 a 4000). Guarda: `chk_deviation_type`,
   `chk_deviation_motive_category`, `chk_deviation_motive_storage` (V4, V11).
5. **Solo `ADMIN` cambia el estado de justificación** (D-20261014-08):
   `requireAdmin` en `PUT /admin/deviations/{id}/classification`; cambiar una
   clasificación exige motivo y escribe `deviation_audits`. Guarda:
   `chk_deviation_classification` (V4). El rechazo a un empleado
   `[sin guarda: implementado, sin test]`.
6. **Toda corrección de `ADMIN` sobre una marca escribe auditoría** (valor
   anterior, nuevo, autor, hora) en la misma transacción (D-20261015-03, -05):
   `forgotten_mark_audits` y `mark_correction_audits`. Guarda en marcas
   olvidadas: `IT.forgottenIngressCanBeInsertedBeforeAlreadyStoredEgresoAndKeepsReceiptSequence`
   y `IT.forgottenPauseStartCannotLeaveInvalidHistoryWhenReturnIsAlsoMissing`
   (rollback sin auditoría). `correctMark` `[sin guarda: implementado, sin test]`.
7. **Un empleado dado de baja no inicia sesión ni marca; su historial no se
   borra.** La baja es `PATCH /employees/{id}` con `active=false`; no existe
   endpoint de borrado y las FK impiden borrar filas referenciadas. Guarda:
   `Baja` (sesión existente, login, job de ausencias y push).
8. **Push solo por desvíos relevantes y agrupada** en ventanas fijas de 5 min
   por empresa, con conteo por sede (D-20261014-15): solo `SIN_INGRESO` y
   `LLEGADA_TARDE` (`PUSH_TYPES`, `JdbcDeviationNotificationOutbox`); pausas y
   `MARCA_FALTANTE` no notifican. Guarda: `chk_notification_event_type` (V8),
   `NotificationWindowPolicyTest`, `SafePushPayloadFactoryTest`,
   `Outbox.groupsByFirstEventForFiveMinutesAndReplacementKeepsOneOutboxEvent`.

### Concurrencia y estado

9. **Empresa y rol desde la base, por request, nunca del cliente.** Sin JWT:
   `ScopeService` relee membresía, rol y `active` en cada request
   (D-20261016-01). Guarda:
   `Baja.deactivationRevokesMembershipAndExistingSessionScopeAndLogin`,
   `IT.httpSecurityRejectsAnonymousRequestsAndEmployeeCannotUseAnotherCompaniesIdsOrAdminRoutes`.
   **Brecha CA8**: ningún test usa un `ADMIN` real de otra empresa para leer
   o modificar (el más cercano, `IT.employeeTemplateListIsRestrictedToAssignedSitesWithoutSiteFilter`,
   usa un `ADMIN` sin membresía). Que cada consulta lleve `company_id` es
   convención `[sin guarda: implementado, sin test]`.
10. **Lock pesimista antes de registrar una marca** (D-20261015-06).
    `recordEmployeeMark` hace `SELECT … FOR UPDATE` sobre la cuenta, la
    membresía y la fila de `jornadas`, relee el historial `FOR UPDATE`, valida
    la transición y recién ahí inserta. Última defensa en la base:
    `uq_mark_jornada_sequence` (V3) y `uq_jornada_employee_site_date` (V2),
    que reemplazan al índice por `(empresa, empleado, fecha, bloque, tipo)` del
    archivo anterior (D-20261019-04). Guarda: `IT.identicalConcurrentRetries…` (2 hilos),
    `IT.ingresoCommittedAfterRepeatableReadSnapshotWinsAgainstAbsenceWorker`.
    **Brecha**: falta la ráfaga de N acciones distintas sobre un empleado.
11. **Orden único de locks**, el real: cuenta → membresía → (empleado) →
    jornada → marcas → desvíos → estado de notificación de la empresa. Todo
    camino nuevo lo respeta. `ApiExceptionHandlerTest` solo prueba que un
    fallo de lock da 409 reintentable. `[sin guarda: implementado, sin test]`
12. **El envío de push va fuera de la transacción** (D-20261014-14). El desvío
    inserta en `notification_outbox_events` y su ventana; `claimDueWindows`
    reclama con `FOR UPDATE SKIP LOCKED` en `REQUIRES_NEW`, deja un lease de
    600 s y commitea; `NotificationOutboxDispatcher` envía sin transacción
    (timeout de 5 s en `VapidWebPushGateway`) y registra el resultado aparte.
    Reintento exponencial de 5 s a 1 h, `DEAD` tras 12 intentos. Garantía:
    **al menos una vez**. (Shifty, 2026-09-04: una llamada al proveedor dentro
    del lock agotaba el pool.) Guarda: `chk_notification_window_status` (V8),
    `NotificationRetryPolicyTest`,
    `Outbox.concurrentEventsForOneCompanyShareTheFirstOpenWindow`,
    `Outbox.partialDeliverySchedulesRetryWithStableTagAndTopic`. El
    `SKIP LOCKED` `[sin guarda: implementado, sin test]`.
13. **Idempotencia de marcas en un solo lugar**: header `Idempotency-Key`
    (UUID) obligatorio; PK `(account_id, idempotency_key)` en
    `mark_idempotency`: **única por cuenta, no por empresa**, porque la cuenta
    es global (D-20261016-01). Misma clave con otro contenido da 409
    `IDEMPOTENCY_CONFLICT`; el reintento devuelve la marca original. Guarda:
    `IT.identicalConcurrentRetries…`,
    `IT.reusedIdempotencyKeyWithDifferentPayloadConflictsAndPauseMustCloseBeforeEgress`,
    `IT.idempotencyReplayCannotReturnAnotherCompanyReceiptAfterCompanySwitch`.
14. **Jobs programados**: corren dentro del backend; el flag
    `braja.scheduling.enabled` apaga todos los `@Scheduled`. Sin ShedLock: se
    agrega antes de escalar a más de una instancia. Hoy un doble disparo lo
    acotan `uq_deviation_jornada_active_type` (V9) y el lock por jornada.
    Guarda: `IT.absenceWorkerSkipsAlreadyProcessedCandidatesOnNextTick`.

### Datos y migraciones

15. **Todo parámetro numérico de la API lleva cota inferior Y superior**:
    tolerancia y pausas (`@Min/@Max`), ubicación (`@DecimalMin/@DecimalMax`),
    `limit` de bandeja 1–100 y rangos de fechas ≤ 366 días (a mano),
    contraseña 12–256. Un solo lado deja un 500 alcanzable (Shifty,
    2026-09-04: desborde con `offset`). Guarda de base: `chk_employee_tolerance`,
    `chk_jornada_tolerance`. En la API `[sin guarda: implementado, sin test]`;
    el `occurredAt` de marcas olvidadas o corregidas no tiene cota (§7).
16. **Agregados en la base**: los conteos del push salen de `GROUP BY`
    (`NotificationWindowRepository.loadSiteCounts`). No hay otros totales.
    `[sin guarda: implementado, sin test]`
17. **Una consulta dentro de un loop es N+1 hasta demostrar lo contrario**; se
    resuelve con `IN` o join. Incumplida en `OrganizationController`
    (`employees`, `templates`) y `JornadaController.mine`.
    `[sin guarda: destino]`
18. **Unicidad y normalización en la base**: el identificador es el DNI global
    (D-20261016-01), no un `username` por empresa: `accounts.dni_normalized`
    solo dígitos (`DniNormalizer`, 7 a 12) con `UNIQUE uq_account_dni` (V1) y
    sin `CHECK` de formato. Guarda: `uq_account_dni`; la normalización
    `[sin guarda: implementado, sin test]`.
19. **Migraciones Flyway versionadas y reversibles por procedimiento.**
    Flyway Community no tiene `undo`: cada migración declara en un comentario
    cómo se vuelve atrás. El DDL de MySQL no es transaccional: **una sentencia
    DDL por migración**. Rige desde V12 (D-20261019-05): solo V11 declara su
    reversa, y V1–V5 y V7–V10 tienen varias sentencias pero no se reescriben. Migrar desde base vacía ocurre en cada corrida de `IT`
    (`IT.migrationsCreateTheTenantAndPrivacyInvariants`). `[sin guarda: destino]`
20. **Migraciones sin corte (expand/contract)**: aplica cuando exista deploy
    (V11 ya avisa que con filas `MARCA_FALTANTE` la imagen anterior falla).
    Sin entidades JPA no hay test índice-contra-entidad. `[sin guarda: destino]`

### Seguridad

21. **Rate limit de login** por DNI (no por IP), persistido en MySQL
    (`login_throttles`, V5): 5 fallos en 15 min bloquean ese DNI 15 min (429 con
    `Retry-After`). Sobrevive a reinicios; no hay Bucket4j. Brecha: sin límite
    por IP, y quien conoce un DNI puede bloquearlo. El umbral
    `[sin guarda: implementado, sin test]`; el límite por IP
    `[sin guarda: destino]`.
22. **Configuración de producción falla cerrada.** Hoy: ningún secreto con
    default en el repo; `EncryptionService` llama `BrajaProperties.validate()`
    y el arranque falla sin clave de salud de 32 bytes, con VAPID incompleto o
    con push activo sin clave de suscripción; no hay springdoc, actuator ni
    CORS. Sin perfil activo, la configuración por defecto pone `Secure=true`
    en `BRAJA_SESSION`. `Secure=false` se permite únicamente si `local` es el
    único perfil activo; si no, el arranque falla. Guarda:
    `SessionCookieSecurityStartupTest` (2026-10-19).
23. **Cambios sensibles revocan acceso.** No hay `token_version`: la
    autenticación es sesión en MySQL (30 min de inactividad). Baja de
    empleado, membresía o cuenta cortan el acceso en la siguiente request
    porque `ScopeService` relee la base (guarda: `Baja`). **Brecha**: el
    cambio de contraseña no cierra otras sesiones. No hay endpoint para
    cambiar el rol ni dar de baja a un `ADMIN`: "nunca el último `ADMIN`" se
    cumple por ausencia `[sin guarda: implementado, sin test]`.
24. **Anti-CSRF**: toda mutación exige `X-CSRF-TOKEN`; cookie de sesión
    `HttpOnly`, `SameSite=Lax`. Guarda:
    `IT.httpLoginCreatesHttpOnlySessionCookieAndCsrfProtectsMutableRoutes`. La
    lista explícita de `Content-Type` del archivo anterior no existe
    `[sin guarda: destino]`.
25. **Entrada hostil**: el motivo y todo texto que ve el `ADMIN` se limpia de
    caracteres de control, bidi y zero-width, con tope de largo. Hoy solo hay
    tope (4000 motivo, 2000 auditoría); no hay exportación CSV.
    `[sin guarda: destino]`
26. **Errores neutros hacia afuera**: Problem Details con `code` estable; el
    login da el mismo 401 para usuario inexistente, contraseña errónea o sin
    membresías. El `traceId` es un UUID aleatorio, sin correlación con logs.
    `[sin guarda: implementado, sin test]`
27. **Sin token de acceso en el front.** La sesión es la cookie `HttpOnly`
    `BRAJA_SESSION`; lo único en memoria es el token CSRF. El front no usa
    `localStorage`, `sessionStorage` ni IndexedDB (`rg` 2026-10-19). No hay
    refresh token con rotación (el archivo anterior asumía JWT). Guarda: la
    aserción `httponly` de `IT.httpLoginCreatesHttpOnlySession…`; el front
    `[sin guarda: implementado, sin test]`.

### Tiempo

28. **Persistencia y cálculo en UTC; la hora local es presentación** (zona
    IANA por sede, D-20261015-02). La conexión fija UTC (Hikari `SET
    time_zone`, `connectionTimeZone=UTC`, `--default-time-zone` en compose). La
    fecha de jornada es la fecha local del primer bloque en la zona de la
    sede (CA5). **Brecha**: no hay `Clock` inyectado; `Instant.now()` aparece 25
    veces en 13 archivos de `main` (los caminos principales reciben el instante
    por parámetro: `createDueAbsences`, `reconcile`, `recordEmployeeMark`). Sin
    test de jornada nocturna ni de horario de verano. `[sin guarda: destino]`

### Configuración y despliegue

29. **Un proceso con configuración inválida no arranca**: cubierto para las
    claves de cifrado y VAPID (regla 22) y el bootstrap del primer `ADMIN`;
    `BrajaProperties` no usa `@Validated`. `[sin guarda: implementado, sin test]`
30. **Backend y jobs comparten imagen y un único bloque de entorno.** Los jobs
    son `@Scheduled` dentro del backend; `docker-compose.yml` solo define
    MySQL 8.4. `[sin guarda: destino]`
31. **Imágenes versionadas por sha, publicadas solo con CI verde en `main`.**
    CI existe (§6) pero no publica imágenes; no hay Dockerfile.
    `[sin guarda: destino]`
32. **Deploy por script, nunca a mano**: preflight, migración antes, backend
    nuevo al lado del viejo, compuerta de salud y rollback automático. Nada de
    esto existe, ni `/actuator/health`. `[sin guarda: destino]`
33. **El VPS se opera con scripts versionados**: backup diario de MySQL con
    copia fuera del host, chequeos de salud y reinicios con tope. No hay VPS ni
    scripts. Lo paga Braja (D-20261014-10); las credenciales las tiene Mateo.
    `[sin guarda: destino]`
34. **Los errores de Caddy bajo la API respetan el formato JSON de la API**,
    sin redirects de barra final. Caddy no existe todavía.
    `[sin guarda: destino]`

### Frontend

35. **Capas con dirección de dependencias exigida por ESLint en CI.** Sin
    `any`, sin ciclos, sin código muerto, cero warnings. Hoy no hay ESLint ni
    scripts `lint`/`typecheck`; existe `tsc -b` con `strict` y `noUnused*` dentro
    de `npm run build`, y no hay `any` fuera de tests (`rg` 2026-10-19).
    `[sin guarda: destino]`
36. **Componentes de render reciben datos y callbacks por props**; el estado
    remoto vive en contenedores. Incumplida en `features/admin/AdminViews.tsx`
    (388 líneas, estado remoto y render juntos). `[sin guarda: destino]`
37. **Toda llamada a la API pasa por `frontend/src/shared/api/client.ts`**
    (único `fetch`; el archivo anterior decía `frontend/src/api`). Guarda:
    `client.test.ts` prueba el cliente; que nadie más llame `fetch`
    `[sin guarda: implementado, sin test]`. Sin test de contrato de rutas.
38. **La PWA se prueba en iPhone (Safari) y en Android (Chrome)** antes de
    cada release: instalación, sesión, marca con ubicación y, en el dispositivo
    del `ADMIN`, recepción de push. Si la push en iPhone falla de forma
    sostenida, se activa el plan B con Capacitor (D-20261014-13); no antes.
    Nunca se probó en un iPhone real (`docs/PENDIENTES.md`).
    `[sin guarda: destino]`
39. **Cobertura con trinquete por capa**: hoy no se mide. `npm audit
    --omit=dev` corre en CI; no hay `mvn dependency-check`.
    `[sin guarda: destino]`

### Tamaño y forma

40. **Función o método de más de 80 líneas necesita justificación en el PR.**
    Al 2026-10-19 la excepción conocida del backend es
    `DeviationService.reconcile` (≈100 líneas); el frontend no se midió. Es
    deuda, no permiso: ante una validación nueva se extrae, no se apila.
    `[sin guarda: destino]`

## 6. Qué cuenta como verde (y qué no)

- **Verde contra H2 no prueba nada de concurrencia, locks, índices únicos ni
  `SKIP LOCKED`.** Los tests de integración (`IT`, `Outbox`, `Baja`) corren
  contra MySQL 8.4 real con Testcontainers, en CI y en local. Todo cambio que
  toque marcas, estados, aislamiento entre empresas, jobs o migraciones lleva
  su prueba ahí.
- **El endpoint de marca tiene prueba de ráfaga**: N marcas idénticas a la
  vez (mismo `Idempotency-Key`) → 1 marca creada y N-1 respuestas
  idempotentes; N marcas distintas sobre el mismo empleado a la vez → 1 éxito,
  N-1 conflictos, cero 5xx. Hoy solo existe la primera, con 2 hilos.
- **Un bug de producción se reproduce con un test antes de arreglarse**, con
  fecha y síntoma en el comentario.
- **Un pipe a `tail` esconde el exit code.** Los comandos del gate se
  encadenan sin pipe, o se lee `$?` del que importa. (Shifty, 2026-09-11:
  errores de tipos pasaron tres fases así.)
- **Gate antes de cada push**, sin pipes: `cd backend && ./mvnw verify`
  (Windows: `.\mvnw.cmd verify`) y
  `cd frontend && npm ci && npm test && npm run build && npm audit --omit=dev`.
  `npm run build` ejecuta `tsc -b`, hoy el único chequeo de tipos. No hay
  Spotless, `lint` ni `typecheck`.
- **CI es la verdad.** Si local pasa y CI falla, la diferencia es el bug.
  `.github/workflows/ci.yml` corre en `pull_request` y en `push` a `main`
  (`permissions: contents: read`; cancela corridas previas de la misma ref).
  Jobs: `backend` (Temurin 21, `./mvnw verify -B`; Testcontainers levanta
  MySQL 8.4 con el Docker del runner; 20 min) y `frontend` (Node 24: `npm ci`,
  `npm test`, `npm run build`, `npm audit --omit=dev`; 15 min). **Es un
  check requerido**: `main` tiene protección de rama con `backend` y
  `frontend` obligatorios (D-20261019-06), sin costo porque el repo es
  público (D-20261019-02).
- **No se apilan suites y builds a la vez** en la máquina de desarrollo: la
  degradan y falsean tiempos.

## 7. Huecos conocidos: no asumir que están aplicados

- **Deriva conocida** (2026-10-19), como hechos:
  - La versión anterior de este archivo describía capas
    `api/servicio/repositorio/dominio`, `CapasTest` (ArchUnit),
    `ContextoEmpresa`, `OutboxPush`, `eslint-plugin-boundaries`, JWT y
    `usuario.token_version`. Nada de eso existe; la estructura actual se
    adopta (D-20261019-03, §4).
  - `docs/ARQUITECTURA.md` nombra módulos `identity`, `scheduling`, `privacy`,
    `common` y `device/location` que no existen con esos nombres.
  - Al 2026-10-19 `OrganizationController` (lecturas y `createSite`) y
    `JornadaController` (lecturas y alta de jornada) usan `JdbcTemplate`
    directo, con a lo sumo una sentencia de escritura; ningún controlador
    lleva `@Transactional`. Las escrituras de varias sentencias de
    organización viven en `OrganizationService`
    (`OrganizationTransactionMySqlTest`).
  - `openapi.yaml` es manual (no hay springdoc) y ningún test lo compara con
    el código.
- **Ya cubierto** (2026-10-19): reintentos idénticos concurrentes;
  transiciones de jornada; ventana de ingreso de 30 min (D-20261016-05);
  `MARCA_FALTANTE` y su cierre o reemplazo por `EGRESO_TARDIO`
  (D-20261018-01, D-20261019-01); baja de empleado; ubicación y purga a 90
  días; CSRF, cookie `HttpOnly` y `Secure` por defecto con guarda de arranque;
  agrupación, reintento y payload del push; CI con tests en MySQL 8.4 real.
- **Falta todavía** (2026-10-19), cada ítem verificado en el código:
  - Inyectar `Clock` (28). ESLint y scripts `lint`/`typecheck` (35, 36).
  - Tests CA8 con un `ADMIN` real de otra empresa (9) y ráfaga de acciones
    distintas (10).
  - El cambio de contraseña no invalida otras sesiones (23).
  - El alta con un DNI existente filtra estado de la cuenta a otra empresa:
    `OrganizationController.createEmployee` responde `ACCOUNT_INACTIVE` y
    devuelve DNI y `mustChangePassword` de una cuenta ajena.
  - `occurredAt` de marcas olvidadas y corregidas por el `ADMIN` sin cota (ni
    futuro ni ventana de la jornada).
  - `receivedAt` se toma antes de los locks (`MarkController`): una marca con
    secuencia mayor puede tener hora menor (D-20261015-06).
  - `rs.getDate("local_date")` en `JornadaController` depende de la zona de la
    JVM, que no está fijada.
  - Job de ausencias: un candidato que falla siempre se vuelve a elegir en
    cada tick (sin `next_retry_at`), puede ocupar el lote de 200 y escribe un
    `LOGGER.error` con traza cada 15 s.
  - N+1 en `OrganizationController.employees/templates` y
    `JornadaController.mine` (17).
  - El límite de login es solo por DNI: con conocer un DNI se puede bloquear
    esa cuenta; falta un límite por IP (21).
  - Primer deploy: V11 exige el procedimiento de reversa antes de volver a la
    imagen anterior, y el job crea `MARCA_FALTANTE` para toda jornada abierta
    histórica (la consulta no tiene cota de fecha; interno, sin push).
  - Web Push en un iPhone real; dominio y hosting (D-20261014-16,
    `docs/PENDIENTES.md`); deploy, backup, Dockerfile, Caddy, VPS y RTO;
    acuerdo escrito con Braja sobre reuso del código con otros clientes.
- **Cerrado**: nada todavía.

Hueco que se repite en todos los proyectos: **el pre-commit hook solo corre
si cada clon hace `git config core.hooksPath .githooks`**. Hoy no existe
`.githooks`: no hay gate local salvo correr a mano los comandos de §6.

## 8. Compuertas de proceso

- **Pre-commit**: no existe. Destino: toolchain (JDK 21, Node 24), formato,
  lint y tipos de back y front, cero warnings.
- **CI**: existe lo de §6. No existen formato (Spotless, Prettier), lint,
  escaneo de secretos, SAST ni cobertura.
- **Todo cambio de endpoint actualiza `openapi.yaml` en el mismo commit.** Se
  escribe a mano y ningún test falla si difiere del código
  `[sin guarda: destino]`.
- **Release checklist y runbook de backup/restore (RPO 24 h, RTO a definir)
  gatean releases**: no existen todavía. Un ítem sin marcar necesita
  excepción explícita del dueño, no un salto silencioso. El deploy se niega a
  migrar sin un backup de menos de 24 h.
- **Merge**: merge commit tras CI verde, fijado al commit verificado (§1).
  `main` exige los checks `backend` y `frontend` para fusionar
  (D-20261019-06).

## 9. Arranque (checklist de este proyecto)

1. [x] Repo con `backend/`, `frontend/`, `docs/` (PR #2, v1); `docs/` tiene
   `ESPECIFICACION.md`, `DECISIONES.md`, `ARQUITECTURA.md` y `PENDIENTES.md`;
   `openapi.yaml` en la raíz.
2. [x] El dueño revisó `docs/DECISIONES.md`: 34 filas adoptadas, 0 propuestas
   (adopciones del 2026-10-16, 10-18 y 10-19).
3. [ ] Portar `DecisionesDelDuenoTest` (frases de atribución sin ID → falla).
4. [~] Toolchain: Java 21 y Node 24 fijados solo en CI (PR #4). Los `<…>` de
   este archivo se completaron con lo real; quedan RTO y el dominio.
5. [~] Sacar `[sin guarda]` regla por regla. Con guarda: 2, 7, 8, 12, 13, 22
   y la máquina de estados; parcial: 1, 4, 5, 6, 9, 10, 14, 24. Siguen: 9
   (CA8), 10 (ráfaga distinta), 28 (`Clock`), 21 y 23.
6. [x] Primera verificación completa del archivo contra el código:
   2026-10-19, sobre `5ee220f`. Se repite al cerrar cada hueco de §7.
