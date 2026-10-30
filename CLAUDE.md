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

Estado base al 2026-10-29 (verificado sobre `origin/main` en
`925e2a9d4bfc040314497a98e3be8e0536605398`, PR #68): hay backend,
frontend, `openapi.yaml`, CI y, al 2026-10-30, 51 decisiones adoptadas (0
propuestas). El issue #67 está aprobado y la configuración/auditoría de
ubicación de sedes y la evaluación de `FUERA_DE_SEDE` están implementadas en
`feat/site-geofence-67` (PR #69). Mateo adoptó D-20261029-01 el 2026-10-30:
conserva la carga manual y agrega captura automática estricta con precisión
máxima de 25 m. También adoptó en D-20261030-01 un solo `FUERA_DE_SEDE` por
empleado y jornada, y en D-20261030-02 que cada jornada congele el centro y el
radio al declararse y que una jornada declarada sin centro no se compare. No hay
deploy, backup, Dockerfile, Caddy, `.githooks` ni VPS. Cada regla de §5 está
en un estado:

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
- **Asignate el issue antes de empezar** (acordado con Mateo el 2026-10-26):
  quien lo va a implementar se asigna el issue en GitHub con
  `gh issue edit <N> --add-assignee @me` y comprueba que la asignación quedó
  visible. Si el issue ya tiene a otra persona asignada, no se empieza: se
  consulta con Mateo. (2026-10-26: el #35 se implementó dos veces en paralelo,
  en la rama `fix/admin-display-name-35` y en el PR #36.)
- **Flujo de entrega** (verificado 2026-10-19 con `gh`): issue aprobado
  (labels `status:approved` + un `type:*`) → asignado a quien implementa →
  rama `tipo/descripcion` → PR con
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
  2026-10-19 ninguno de los 27 commits la lleva; al 2026-10-28, ninguno de los
  123 de `main` (`git log -i --grep=Co-Authored-By f3c9635`).
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
  2026-10-30: 50 filas (50 adoptadas: 16 del 2026-10-14, 6 del 10-15, 5 del
  10-16, 1 del 10-18, 6 del 10-19, 2 del 10-23, 12 del 10-27 y dos del 10-30).
  El `DECISIONES.md` sin versionar
  que había en la raíz era una copia vieja; al 2026-10-28 ya no está en el
  clon principal.
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
  (multi-empresa y multi-sede). Las otras 42 filas también rigen; las que
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

Es el estado verificado sobre `main` en
`5e61d0a5bb6b81c26603f42e9093bf85e9baab4a` al 2026-10-20, revalidado sobre
`f3c9635` al 2026-10-28, y también el destino: la estructura
por funcionalidad con `JdbcTemplate` se mantiene (D-20261019-03). Lo que la
versión anterior planteaba (capas `api/servicio/repositorio/dominio`, JPA,
`ContextoEmpresa`, `OutboxPush`, JWT) queda descartado; las reglas de
ArchUnit que se agreguen se ajustan a esta estructura.

**Backend** (`backend/`, paquete `com.braja.fichaje`, por funcionalidad):

- `api` (`ApiException`, `ApiExceptionHandler`: `application/problem+json`
  con `code` y `traceId`; `DateRanges`), `config` (`BrajaProperties` `braja.*`;
  `SchedulingConfiguration`, `@EnableScheduling` salvo
  `braja.scheduling.enabled=false`, que apagan los tests de integración).
- `security`: sesión Spring Session JDBC (cookie `BRAJA_SESSION`), CSRF
  (`X-CSRF-TOKEN`), BCrypt 12, `ScopeService`, `AccountService`,
  `SessionController`, `LoginThrottleService`, `ClientAddressResolver`,
  `PasswordResetService` y `TemporaryPasswordGenerator` (restablecimiento por
  el `ADMIN`, D-20261027-09), `EncryptionService` (AES-GCM de motivos
  `SALUD`), `BootstrapAdminRunner`, `PrivacyRetentionScheduler`.
- `organization` (sedes, empleados, plantillas: `OrganizationController`,
  `OrganizationService`; asignación de plantillas con fecha de inicio:
  `TemplateAssignmentController`, `TemplateAssignmentService`, D-20261015-02),
  `timekeeping` (`JornadaController`, `JornadaDeclarationService` (una o por
  lote, D-20261027-11), `JornadaHistoryService`, `JornadaAuditController` y
  `JornadaAuditService`, `MarkController`, `MarkService`, `MarkScheduler`,
  `DeviationWorkerRetryPolicy`), `deviations` (`DeviationController`,
  `DeviationService`, `DeviationPolicy`), `notifications` (outbox en MySQL,
  dispatcher, Web Push VAPID, cifrado de suscripciones). (2026-10-28.)
- **Persistencia**: `JdbcTemplate` con SQL a mano; sin JPA ni Spring Data.
  Flyway V1–V23; V12 y V17 no existen (nunca hubo archivos con esos números,
  `git log --all`). Las FK llevan `(id, company_id)` compuesto: la base
  rechaza cruces entre empresas.
- **Transacciones**: `@Transactional` en servicios (`MarkService`,
  `DeviationService`, `OrganizationService`, `TemplateAssignmentService`,
  `JornadaDeclarationService`, `JornadaHistoryService`, `JornadaAuditService`
  de solo lectura, el outbox, `AdminPushSubscriptionService`,
  `LoginThrottleService`, `BootstrapAdminRunner`, `PrivacyRetentionScheduler`);
  `AccountService` no envuelve login ni cambio de contraseña en una
  transacción (§5.21; lo dice su Javadoc) y escribe la contraseña con
  `TransactionTemplate`, igual que `PasswordResetService`; los jobs de
  `MarkService` usan `TransactionTemplate` `REQUIRES_NEW` por candidato.
  Ningún controlador lleva `@Transactional`; las escrituras de varias
  sentencias viven en servicios. Al 2026-10-28 `OrganizationController` lee
  con `JdbcTemplate` directo y escribe una sola sentencia (`createSite`);
  `JornadaController` solo lee (§7).
- **Alcance de empresa**: sin JWT. `ScopeService.require/requireAdmin` toma
  la empresa activa de la sesión (`braja.activeCompanyId`) y relee de MySQL,
  en cada request, membresía, rol y `active`. Cada consulta recibe
  `company_id` explícito.
- **Dominio sin Spring**, con tests unitarios: `MarkTransitionPolicy`,
  `MarkState`, `DeviationPolicy`, `NotificationRetryPolicy`,
  `MarkRequestFingerprint`, `DeviationWorkerRetryPolicy`, `DateRanges`
  (2026-10-28).
- **La jornada es una máquina de estado** (`NO_INGRESO`, `EN_CURSO`,
  `PAUSA_ABIERTA`, `EGRESADA`), derivada del historial (`MarkState.from`);
  las transiciones son reglas en `MarkTransitionPolicy`, no una tabla.
  Desde 2026-10-27 existe además `CANCELADA`, terminal, que solo se alcanza
  desde `NO_INGRESO` sin marcas (D-20261027-07), y las marcas anuladas no
  cuentan para el historial (D-20261027-08). Guarda: `chk_jornada_state`
  (V2, V19), `chk_jornada_cancellation` (V19), `MarkTransitionPolicyTest`,
  `MarkStateTest`, `JornadaCancellationAndMarkVoidMySqlTest`.
- **Jobs** (`@Scheduled`): `MarkScheduler` (ausencias y `MARCA_FALTANTE`
  15 s, lote de 200; timeout de ubicación 5 s), `NotificationOutboxDispatcher`
  (5 s, `braja.notifications.dispatch-delay-ms`), `PrivacyRetentionScheduler`
  (15 min). Un candidato de ausencia o `MARCA_FALTANTE` que falla espera de
  30 s a 1 h antes de volver a elegirse (`deviation_worker_retry_at`, V13,
  PR #27; `DeviationWorkerRetryPolicyTest`,
  `IT.absenceWorkerBacksOffFailingCandidateAndProcessesNextCandidateOnce`).
- **Sin Redis, colas ni microservicios** (D-20261014-14): outbox,
  idempotencia y rate limit de login viven en MySQL.
- **Helper único por cosa transversal**: hoy `ScopeService` (empresa y
  rol) y la tabla de outbox; ningún test prohíbe saltearlos
  `[sin guarda: destino]`.
- **Módulo de referencia que se copia**: `timekeeping` (`MarkController` →
  `MarkService` → SQL), con su test de concurrencia en `IT`.

**Frontend** (`frontend/src`): una app con vistas por rol (`EMPLEADO`,
`ADMIN`): `app/`, `features/{auth,admin,employee}`, `shared/api`
(`ApiClient`: único `fetch`, CSRF en memoria), `shared/pwa`, `shared/`
(`dateRange`, `format`),
`device/{push,pwa}`, `sw.ts` (Workbox; `/api/v1` en `NetworkOnly`, sin cola
offline). Tests: vitest + Testing Library. ESLint y el chequeo de tipos corren
en CI (§5.35), pero ninguna regla exige dirección de dependencias entre carpetas.

## 5. Reglas

### Dominio (propias de este proyecto)

1. **La hora de cada marca la pone el servidor** (D-20261015-03).
   `MarkController.MarkInput` solo trae `action`. El instante se toma en
   `MarkService.recordEmployeeMark` con los locks de cuenta, membresía y jornada
   ya tomados, y una marca anterior a otra ya guardada da 409
   `INVALID_MARK_ORDER` (2026-10-27, #46: antes se tomaba en el controlador y una
   marca con secuencia mayor podía tener hora menor). Guarda:
   `TimekeepingBoundsMySqlTest.employeeMarkTimeIsTakenAfterTheJornadaLockIsReleasedByAnotherTransaction`
   y `.employeeMarkEarlierThanTheLastStoredMarkIsRejected` (HTTP);
   `IT.identicalConcurrentRetriesPersistOneMarkAndReturnTheOriginalResponse`
   aserta `acceptedAt`.
2. **La ubicación es informativa y nunca bloquea una marca**
   (D-20261014-12). Llega después (`POST /marks/{id}/location`): la marca nace
   `PENDIENTE` y pasa a `RECIBIDA` o, a los 30 s, a `SIN_UBICACION`. Guarda:
   `chk_mark_location_status` (V3),
   `IT.pendingLocationBecomesSinUbicacionAfterThirtySecondWindow`.
 3. **La ubicación personal del empleado solo se captura al marcar.** Está
    prohibido el seguimiento en segundo plano o periódico. El front pide una
    posición por marca (`features/employee/markFlow.ts`; sin `watchPosition`).
    La ubicación fija de una sede es un flujo distinto: el `ADMIN` puede
    capturarla al crear o editar la sede si está físicamente en el local, o
    ingresar latitud/longitud manualmente; confirma el punto antes de guardar.
     Solo el `ADMIN` de esa empresa ve las coordenadas exactas y se conservan
     durante la vida de la sede (D-20261027-12). La ubicación personal de las
     marcas conserva su purga de 90 días. D-20261029-01 agrega captura automática
     de alta precisión, `maximumAge=0`, 30 segundos y máximo 25 m, sin retirar
     la carga manual; el origen del punto se audita. Guarda: `OrganizationTransactionMySqlTest`
    (`createSiteSavesFirstCenterAuditInSameTransaction`,
    `siteLocationUpdateAuditsAndRollsBackAsOneTransaction`) y
     `SitesViewRender.test.tsx`. El punto manual usa los rangos de la base y se
     puede revisar en un enlace de mapa antes de guardar.
4. **Todo desvío exige motivo y categoría, pero después de guardar la
   marca** (D-20261014-07, D-20261015-04): queda `MOTIVO_PENDIENTE` hasta
   `PUT /deviations/{id}/motive` (categoría `SALUD`, `TRANSPORTE`,
   `EMERGENCIA` u `OTRA`; texto de 1 a 4000). El empleado lo corrige hasta
   que se clasifica; después responde 409 `MOTIVE_LOCKED`, salvo el primer
   motivo de un desvío clasificado sin motivo, que lo devuelve a revisión
   (D-20261027-02). Cada envío queda en `deviation_audits` (V16). Guarda:
   `chk_deviation_type`, `chk_deviation_motive_category`,
   `chk_deviation_motive_storage` (V4, V11), `chk_deviation_audit_change`
   (V16), `DeviationRulesMySqlTest` (corrección, bloqueo, validación).
5. **Solo `ADMIN` cambia el estado de justificación** (D-20261014-08):
   `requireAdmin` en `PUT /admin/deviations/{id}/classification`; cambiar una
   clasificación exige motivo y escribe `deviation_audits`. Si el desvío
   cambia de tipo, la clasificación se borra y vuelve a revisión
   (D-20261027-01); si se reactiva, empieza sin motivo ni clasificación. Guarda: `chk_deviation_classification` (V4),
   `DeviationRulesMySqlTest.classificationStillAuditsAndCorrectionStillNeedsAReason`
   (incluye el 403 a un empleado) y
   `DeviationRulesMySqlTest.classifiedAbsenceReplacedByLateArrivalGoesBackToReviewKeepingTheMotive`.
6. **Toda corrección de `ADMIN` sobre una marca escribe auditoría** (valor
   anterior, nuevo, autor, hora) en la misma transacción (D-20261015-03, -05):
   `forgotten_mark_audits` y `mark_correction_audits`. Guarda en marcas
   olvidadas: `IT.forgottenIngressCanBeInsertedBeforeAlreadyStoredEgresoAndKeepsReceiptSequence`
   y `IT.forgottenPauseStartCannotLeaveInvalidHistoryWhenReturnIsAlsoMissing`
   (rollback sin auditoría).
   La anulación de una marca (D-20261027-08) no borra la fila y escribe
   `mark_correction_audits` con `change_kind='VOID'` (V20, V21). Guarda:
   `JornadaCancellationAndMarkVoidMySqlTest.voidingAMarkKeepsTheRowAuditsItAndStopsCountingIt`
   (2026-10-27). **Lectura** (issue #60, 2026-10-27; antes las tres tablas de
   auditoría no tenían ningún camino de lectura): `GET /admin/jornadas/{id}/audit`
   (`JornadaAuditService`, solo `ADMIN` de la empresa) devuelve la cancelación,
   las marcas olvidadas, las correcciones, las anulaciones y `deviation_audits`
   de la jornada, sin texto de motivo ni coordenadas, con tope de 500. Guarda,
   también de lo que escribe `correctMark`:
   `JornadaAuditHistoryMySqlTest.adminReadsEveryChangeOfTheJornadaInOrderWithActorNamesAndNoMotiveTextOrCoordinates`
   y `onlyAnAdminOfTheSameCompanyReadsTheHistory`.
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
   Un desvío retirado que se reactiva vuelve a avisar; el reemplazo
   `SIN_INGRESO` → `LLEGADA_TARDE` no (2026-10-27: el reactivado no avisaba).
   Las alertas se activan por empresa y abrir otra empresa no suscribe el
   dispositivo (D-20261027-04). Guarda:
   `Outbox.reactivatedDeviationAfterSentWindowNotifiesAgainButReplacementDoesNot`,
   `AdminPushControl.test.tsx`.

### Concurrencia y estado

9. **Empresa y rol desde la base, por request, nunca del cliente.** Sin JWT:
   `ScopeService` relee membresía, rol y `active` en cada request
   (D-20261016-01). Guarda:
   `Baja.deactivationRevokesMembershipAndExistingSessionScopeAndLogin`,
   `IT.httpSecurityRejectsAnonymousRequestsAndEmployeeCannotUseAnotherCompaniesIdsOrAdminRoutes`.
   CA8 (brecha cerrada el 2026-10-26, PR #26; antes ningún test usaba un
   `ADMIN` real de otra empresa):
   `IT.validAdminsCannotReadOrModifyRecordsFromAnotherCompany` usa dos `ADMIN`
   válidos de empresas distintas sobre bandeja, jornada, empleado, plantilla,
   marca olvidada, corrección y clasificación. Que cada consulta lleve
   `company_id` es convención `[sin guarda: implementado, sin test]`.
10. **Lock pesimista antes de registrar una marca** (D-20261015-06).
    `recordEmployeeMark` hace `SELECT … FOR UPDATE` sobre la cuenta, la
    membresía y la fila de `jornadas`, relee el historial `FOR UPDATE`, valida
    la transición y recién ahí inserta. Última defensa en la base:
    `uq_mark_jornada_sequence` (V3) y la unicidad de jornada por empleado,
    sede y fecha, que reemplazan al índice por `(empresa, empleado, fecha, bloque, tipo)` del
    archivo anterior (D-20261019-04). Desde V19 (2026-10-27, D-20261027-07) esa
    unicidad es `uq_jornada_employee_site_active_date` (empresa, empleado, sede y
    `active_local_date`, nula si `CANCELADA`) en lugar de `uq_jornada_employee_site_date`
    (V2): ignora las canceladas y sigue siendo la última defensa entre las demás.
    Guarda: `IT.identicalConcurrentRetries…` (2 hilos),
    `IT.ingresoCommittedAfterRepeatableReadSnapshotWinsAgainstAbsenceWorker`,
    `JornadaCancellationAndMarkVoidMySqlTest.concurrentDeclarationsOfTheSameEmployeeSiteAndDateStillYieldOneJornada` (4 hilos).
    La declaración por lote (D-20261027-11, 2026-10-27) trata el choque con esa unicidad como fecha salteada
    (`JORNADA_EXISTS`), no como error: `TemplateAssignmentAndBulkDeclarationMySqlTest.bulkAndSingleDeclarationsOfTheSameDaysAtTheSameTimeYieldOneJornadaPerDayAndNo5xx`.
    Ráfaga de acciones distintas (brecha cerrada el 2026-10-26, PR #26):
    `IT.fiveDistinctConcurrentPauseRequestsYieldOneAcceptedMarkAndFourCodedConflicts`
    (5 hilos: 1 marca aceptada, 4 409 `INVALID_MARK_TRANSITION`, cero 5xx) y
    `IT.distinctConcurrentPauseMarksSerializeToOneAcceptedMarkAndOneConflict`.
11. **Orden único de locks**, el real: cuenta → membresía → (empleado) →
    jornada → marcas → desvíos → estado de notificación de la empresa →
    ventana de aviso (`FOR UPDATE`; el reclamo solo toma ventanas). Declarar
    (una o por lote) y asignar plantilla toman la plantilla `FOR SHARE` antes de
    insertar; mover una plantilla de sede la toma `FOR UPDATE` antes de leer sus
    jornadas y asignaciones (`JornadaDeclarationService`,
    `TemplateAssignmentService`, `OrganizationService.saveTemplate`, 2026-10-27). Todo
    camino nuevo lo respeta. `ApiExceptionHandlerTest` solo prueba que un
    fallo de lock da 409 reintentable. `[sin guarda: implementado, sin test]`
12. **El envío de push va fuera de la transacción** (D-20261014-14). El desvío
    inserta en `notification_outbox_events` y su ventana; `claimDueWindows`
    reclama con `FOR UPDATE SKIP LOCKED` en `REQUIRES_NEW`, deja un lease de
    600 s y commitea; `NotificationOutboxDispatcher` envía sin transacción
    (timeout de 5 s en `VapidWebPushGateway`) y registra el resultado aparte.
    Reintento exponencial de 5 s a 1 h, `DEAD` tras 12 intentos. Garantía:
    **al menos una vez**. (Shifty, 2026-09-04: una llamada al proveedor dentro
    del lock agotaba el pool.) Un evento solo se suma a una ventana `PENDING`
    bloqueada `FOR UPDATE` hasta el commit; el `SKIP LOCKED` del reclamo la
    saltea mientras tanto y, ya reclamada, el evento abre otra ventana
    (2026-10-27: un evento que commiteaba tras el reclamo quedaba en una ventana
    `SENT`). Solo 404 y 410 borran la suscripción; otro rechazo es intento
    fallido, con WARN de estado y host; `DEAD` deja un ERROR. Guarda:
    `chk_notification_window_status` (V8), `NotificationRetryPolicyTest`,
    `Outbox.concurrentEventsForOneCompanyShareTheFirstOpenWindow`,
    `Outbox.partialDeliverySchedulesRetryWithStableTagAndTopic`,
    `Outbox.eventEnqueuedAfterItsWindowWasClaimedIsDeliveredInANewWindow`,
    `Outbox.claimSkipsAWindowWhileAnEnqueueIntoItIsUncommittedAndThenCountsTheEvent`,
    `Outbox.rejectedSubscriptionsAreKeptAndRetriedWhileGoneSubscriptionsAreRemoved`,
    `Outbox.windowThatExhaustsItsAttemptsBecomesDeadAndIsLoggedOnce`.
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
    Un candidato que falla se reintenta con espera creciente y no ocupa el lote
    (V13, 2026-10-22, PR #27; antes se volvía a elegir en cada tick). Guarda:
    `IT.absenceWorkerSkipsAlreadyProcessedCandidatesOnNextTick`,
    `IT.absenceWorkerBacksOffFailingCandidateAndProcessesNextCandidateOnce`,
    `DeviationWorkerRetryPolicyTest`.

### Datos y migraciones

 15. **Todo parámetro numérico de la API lleva cota inferior Y superior**:
     tolerancia y pausas (`@Min/@Max`), ubicación (`@DecimalMin/@DecimalMax`),
     radio de geocerca 50–500 metros (100 por defecto; columna y `CHECK` en V25),
    `limit` de bandeja 1–100 y rangos de fechas de 366 días inclusive como
    máximo en años 2000–2100 (`api/DateRanges`), contraseña 12–256. Un solo lado
    deja un 500 alcanzable (Shifty, 2026-09-04: desborde con `offset`). Guarda de
    base: `chk_employee_tolerance`, `chk_jornada_tolerance`. Desde 2026-10-27
    (#46; antes se aceptaban 367 días, fechas de jornada sin año acotado y horas
    a futuro): `DateRangesTest`; la `localDate` de una jornada declarada y el
    `occurredAt` de marcas olvidadas o corregidas (nunca a futuro, a ≤ 24 h del
    horario de la jornada) tienen guarda en `TimekeepingBoundsMySqlTest`. El resto
    en la API `[sin guarda: implementado, sin test]`.
16. **Agregados en la base**: los conteos del push salen de `GROUP BY`
    (`NotificationWindowRepository.loadSiteCounts`). No hay otros totales.
    `[sin guarda: implementado, sin test]`
17. **Una consulta dentro de un loop es N+1 hasta demostrar lo contrario**; se
    resuelve con `IN` o join. Incumplida al 2026-10-28 en
    `OrganizationController.employees` (`OrganizationService.employeeView` lee
    las sedes de cada empleado), `OrganizationController.templates`
    (`templateView` lee los bloques de cada plantilla) y `JornadaController.mine`
    (`getJornada` lee jornada y marcas por cada id). `[sin guarda: destino]`
18. **Unicidad y normalización en la base**: el identificador es el DNI global
    (D-20261016-01), no un `username` por empresa: `accounts.dni_normalized`
    solo dígitos (`DniNormalizer`, 7 a 12) con `UNIQUE uq_account_dni` (V1) y
    sin `CHECK` de formato. Guarda: `uq_account_dni`; la normalización
    `[sin guarda: implementado, sin test]`.
19. **Migraciones Flyway versionadas y reversibles por procedimiento.**
    Flyway Community no tiene `undo`: cada migración declara en un comentario
    cómo se vuelve atrás. El DDL de MySQL no es transaccional: **una sentencia
    DDL por migración**. Rige desde V12 (D-20261019-05): solo V11 declara su
    reversa, y V1–V5 y V7–V10 tienen varias sentencias pero no se reescriben.
    V19–V21 (2026-10-27) son un `ALTER TABLE` cada una y declaran su reversa; V23
    (2026-10-27, asignación de plantillas) es un `CREATE TABLE` con su reversa.
    Al 2026-10-28, V13–V16 y V18–V23 tienen una sola sentencia y un comentario
    `-- Revert:`; V12 y V17 no existen. V24–V29 (2026-10-30, issue #67) siguen
    la misma regla: V28 amplía el `CHECK` con `FUERA_DE_SEDE`, exige su marca fuente
    y usa la unicidad activa por jornada existente; V29 agrega el origen a la auditoría de ubicación.
    Migrar desde base vacía ocurre en cada corrida de `IT`
    (`IT.migrationsCreateTheTenantAndPrivacyInvariants`). `[sin guarda: destino]`
20. **Migraciones sin corte (expand/contract)**: aplica cuando exista deploy
    (V11 ya avisa que con filas `MARCA_FALTANTE` la imagen anterior falla).
    Sin entidades JPA no hay test índice-contra-entidad. `[sin guarda: destino]`

### Seguridad

21. **Rate limit de login** por DNI y, desde el 2026-10-22 (PR #24, V14), también
    por IP, persistido en MySQL
    (`login_throttles`, V5): 5 fallos en 15 min bloquean ese DNI 15 min (429 con
    `Retry-After`). Sobrevive a reinicios; no hay Bucket4j. El intento se
    reserva bajo lock de la fila antes de verificar la contraseña, en una
    transacción corta propia, y el login no lleva `@Transactional`: una
    conexión del pool por vez (2026-10-27: intentos concurrentes pasaban el
    chequeo antes de guardar fallos, y 12 logins agotaban el pool de 12). La
    contraseña actual de `PUT /session/password` cuenta en el mismo límite.
    Cualquier falla de la base en el login o en `PUT /session/password`
    (throttles, búsqueda de la cuenta, membresías) da 503
    `AUTHENTICATION_UNAVAILABLE`, devuelve el intento reservado si la
    verificación no terminó y registra la causa una vez en WARN, sin DNI,
    contraseña ni IP (2026-10-27: solo la búsqueda de la cuenta lo hacía; el
    resto daba 500 y dejaba el intento contado). Una contraseña errónea ya
    verificada consume el intento aunque falle el contador por IP. Además hay
    límite por IP (`login_ip_throttles`, HMAC de la IP): 100 fallos en 15 min
    bloquean esa IP 15 min (D-20261027-05: los empleados de un local comparten
    la IP pública y 30 errores bloqueaban a todo el local), configurable con
    `BRAJA_LOGIN_IP_THROTTLE_MAX_FAILURES` (1 a 10000),
    `BRAJA_LOGIN_IP_THROTTLE_WINDOW` y `BRAJA_LOGIN_IP_THROTTLE_LOCK_DURATION`.
    Solo cuentan las contraseñas erróneas, no la correcta sin membresías.
    Guarda: `LoginHardeningMySqlTest`, `LoginThrottleByIpMySqlTest`,
    `BrajaPropertiesValidationTest.loginIpThrottleDefaultsToOneHundredFailuresAndIsConfigurableThroughItsEnvironmentVariable`.
    Brecha: quien conoce un DNI puede bloquearlo.
22. **Configuración de producción falla cerrada.** Hoy: ningún secreto con
    default en el repo; `EncryptionService` llama `BrajaProperties.validate()`
    y el arranque falla sin clave de salud de 32 bytes, con VAPID incompleto o
    con push activo sin clave de suscripción; no hay springdoc, actuator ni
    CORS. Sin perfil activo, la configuración por defecto pone `Secure=true`
    en `BRAJA_SESSION`. `Secure=false` se permite únicamente si `local` es el
    único perfil activo; si no, el arranque falla. Guarda:
    `SessionCookieSecurityStartupTest` (2026-10-19). `BRAJA_TRUSTED_PROXY_CIDRS`
    no puede confiar en todas las direcciones IPv4 o IPv6, ni con prefijo 0 ni
    repartidas en varios rangos (2026-10-27: `0.0.0.0/1` más `128.0.0.0/1`
    pasaba). Un rango amplio que no cubre todo (`0.0.0.0/1`) se acepta: elegir
    la IP real del proxy es responsabilidad del operador. Guarda:
    `ClientAddressResolverTest.rejectsTrustedProxyRangesThatTogetherCoverAWholeAddressFamily`.
23. **Cambios sensibles revocan acceso.** No hay `token_version`: la
    autenticación es sesión en MySQL (30 min de inactividad). Baja de
    empleado, membresía o cuenta cortan el acceso en la siguiente request
    porque `ScopeService` relee la base (guarda: `Baja`). El cambio de
    contraseña borra las demás sesiones de la cuenta (guarda:
    `PasswordChangeSessionInvalidationMySqlTest`). El restablecimiento por el
    `ADMIN` (D-20261027-09, `POST /employees/{id}/password-reset`) borra todas
    las sesiones, exige cambiar la provisoria y solo vale para cuentas
    `EMPLOYEE` que están únicamente en esa empresa (409 `ACCOUNT_SHARED` si
    no; guarda: `AdminPasswordResetMySqlTest`, 2026-10-27). No hay endpoint
    para cambiar el rol ni dar de baja a un `ADMIN`: "nunca el último
    `ADMIN`" se cumple por ausencia `[sin guarda: implementado, sin test]`.
24. **Anti-CSRF**: toda mutación exige `X-CSRF-TOKEN`; cookie de sesión
    `HttpOnly`, `SameSite=Lax`. El login rota el token (2026-10-27: el token
    previo al login seguía valiendo). Sin sesión autenticada (vencida o
    ausente) el rechazo de CSRF da 401 `SESSION_EXPIRED`; con sesión viva, 403.
    Guarda:
    `IT.httpLoginCreatesHttpOnlySessionCookieAndCsrfProtectsMutableRoutes`,
    `LoginHardeningMySqlTest.loginRotatesTheCsrfTokenSoThePreLoginTokenIsRejected`,
    `LoginHardeningMySqlTest.mutationWithoutAnAuthenticatedSessionIs401WhileCsrfMismatchOnALiveSessionStays403`. La
    lista explícita de `Content-Type` del archivo anterior no existe
    `[sin guarda: destino]`.
25. **Entrada hostil**: el motivo y todo texto que ve el `ADMIN` se limpia de
    caracteres de control, bidi y zero-width, con tope de largo. Al 2026-10-28
    solo hay tope (4000 motivo; 2000 auditoría, cancelación de jornada y
    anulación de marca: `MarkController.ReasonInput`); nada limpia esos
    caracteres (advertencia abierta de las revisiones del 2026-10-27, §7); no
    hay exportación CSV. `[sin guarda: destino]`
26. **Errores neutros hacia afuera**: Problem Details con `code` estable; el
    login da el mismo 401 para usuario inexistente, contraseña errónea o sin
    membresías; una contraseña actual errónea en `PUT /session/password` da
    401 `CURRENT_PASSWORD_INVALID`, distinto de la sesión vencida. El `traceId`
    es un UUID aleatorio, sin correlación con logs. Guarda (DNI inexistente
    contra contraseña errónea): `LoginThrottleByIpMySqlTest`; el código
    `CURRENT_PASSWORD_INVALID`: `LoginHardeningMySqlTest`; el caso sin
    membresías (401 neutro, cuenta en el límite por DNI y no en el de IP):
    `LoginHardeningMySqlTest.correctPasswordWithoutActiveMembershipsIsANeutral401CountedOnlyOnTheDniThrottle`.
27. **Sin token de acceso en el front.** La sesión es la cookie `HttpOnly`
    `BRAJA_SESSION`; lo único en memoria es el token CSRF. El front no usa
    `localStorage`, `sessionStorage` ni IndexedDB (`rg` 2026-10-19). No hay
    refresh token con rotación (el archivo anterior asumía JWT). Guarda: la
    aserción `httponly` de `IT.httpLoginCreatesHttpOnlySession…`. En el front,
    guarda parcial (2026-10-28): `AuthScreens.test.tsx` ("envía DNI y contraseña
    al servidor sin guardarlos en el navegador") y `client.test.ts` ("envía CSRF
    en toda operación que cambia estado y no persiste el token") asertan
    `localStorage` y `sessionStorage` vacíos; IndexedDB y el resto de la app
    `[sin guarda: implementado, sin test]` (`rg` 2026-10-28: solo esos dos
    tests nombran el almacenamiento).

### Tiempo

28. **Persistencia y cálculo en UTC; la hora local es presentación** (zona
    IANA por sede, D-20261015-02). La conexión fija UTC (Hikari `SET
    time_zone`, `connectionTimeZone=UTC`, `--default-time-zone` en compose). La
    fecha de jornada es la fecha local del primer bloque en la zona de la
    sede (CA5). La fecha de jornada se lee sin conversión por la zona de la JVM
    (2026-10-20, PR #28: `rs.getDate` dependía de esa zona; guarda:
    `IT.journeyDatesDoNotDependOnJvmDefaultTimeZone`). **Brecha**: no hay
    `Clock` inyectado como bean; al 2026-10-28 `Instant.now()` aparece 31 veces
    en 16 archivos de `backend/src/main/java` (antes, 25 en 13). Los caminos
    principales reciben el instante por parámetro (`createDueAbsences`,
    `reconcile`) y `recordEmployeeMark` recibe un `Clock`
    (`MarkController` pasa `Clock.systemUTC()`). Sin test de jornada nocturna
    ni de horario de verano. `[sin guarda: destino]`

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

35. **Lint y chequeo de tipos del frontend corren en CI.** `npm run lint` usa
    ESLint flat config con `typescript-eslint` recomendado y cero warnings;
    `@typescript-eslint/no-explicit-any` se desactiva en archivos de test.
    `npm run typecheck` ejecuta `tsc -b` con `strict`, `noUnusedLocals` y
    `noUnusedParameters`. No hay reglas específicas para límites entre capas,
    ciclos de imports ni exports sin uso `[sin guarda: destino]` (2026-10-20;
    `frontend/eslint.config.js`, `frontend/tsconfig.json`,
    `.github/workflows/ci.yml`).
36. **Los componentes de render reciben datos y callbacks por props; el estado
    remoto vive en contenedores.** En ADMIN, los contenedores viven en
    `frontend/src/features/admin/AdminViews.tsx` y las vistas en
    `frontend/src/features/admin/AdminViewsRender.tsx`.
    `frontend/src/features/admin/AdminViews.test.tsx` cubre interacciones,
    pero no existe una prueba que proteja esa separación arquitectónica
    `[sin guarda: implementado, sin test]` (2026-10-20).
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
    --omit=dev` corre en CI a través de `npm run audit:prod`
    (`frontend/scripts/audit-check.mjs`): falla ante todo aviso salvo las
    excepciones fechadas de `frontend/scripts/audit-policy.mjs`, que vencen
    solas. Al 2026-10-27 hay una: `GHSA-gcqx-w48m-w2h4` (`deepmerge`, baja,
    sin versión corregida, solo en la compilación), vence el 2027-01-31
    (D-20261027-10). Guarda: `frontend/scripts/audit-policy.test.mjs`. No hay
    `mvn dependency-check`. La cobertura `[sin guarda: destino]`.

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
  N-1 conflictos, cero 5xx. Al 2026-10-28 existen las dos: la primera con 2
  hilos (`IT.identicalConcurrentRetries…`) y la segunda con 5
  (`IT.fiveDistinctConcurrentPauseRequests…`, PR #26).
- **Un bug de producción se reproduce con un test antes de arreglarse**, con
  fecha y síntoma en el comentario.
- **Un pipe a `tail` esconde el exit code.** Los comandos del gate se
  encadenan sin pipe, o se lee `$?` del que importa. (Shifty, 2026-09-11:
  errores de tipos pasaron tres fases así.)
- **Gate antes de cada push**, sin pipes: `cd backend && ./mvnw verify`
  (Windows: `.\mvnw.cmd verify`) y
  `cd frontend && npm ci && npm run lint && npm run typecheck && npm test &&
  npm run build && npm run audit:prod`. `npm run build` también ejecuta
  `tsc -b`. No hay Spotless.
- **CI es la verdad.** Si local pasa y CI falla, la diferencia es el bug.
  `.github/workflows/ci.yml` corre en `pull_request` y en `push` a `main`
  (`permissions: contents: read`; cancela corridas previas de la misma ref).
  Jobs: `backend` (Temurin 21, `./mvnw verify -B`; Testcontainers levanta
  MySQL 8.4 con el Docker del runner; 20 min) y `frontend` (Node 24: `npm ci`,
  `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
  `npm run audit:prod`, que corre `npm audit --omit=dev` con la política de
  §5.39; 15 min; `ci.yml` revalidado el 2026-10-28). **Es un
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
  - `docs/ARQUITECTURA.md` nombraba módulos `identity`, `scheduling`,
    `privacy`, `common` y `device/location` que no existen con esos nombres.
    Corregido el 2026-10-28: usa los paquetes reales y una nota remite a §4.
  - Al 2026-10-19 `OrganizationController` (lecturas y `createSite`) y
    `JornadaController` (lecturas y alta de jornada) usan `JdbcTemplate`
    directo, con a lo sumo una sentencia de escritura; ningún controlador
    lleva `@Transactional`. Las escrituras de varias sentencias de
    organización viven en `OrganizationService`
    (`OrganizationTransactionMySqlTest`). Desde el 2026-10-27 el alta de
    jornada (una o por lote) vive en `JornadaDeclarationService`
    (`@Transactional`); `JornadaController` solo lee (revalidado 2026-10-28).
  - `openapi.yaml` es manual (no hay springdoc) y ningún test lo compara con
    el código (2026-10-28).
- **Ya cubierto** (2026-10-19): reintentos idénticos concurrentes;
  transiciones de jornada; ventana de ingreso de 30 min (D-20261016-05);
  `MARCA_FALTANTE` y su cierre o reemplazo por `EGRESO_TARDIO`
  (D-20261018-01, D-20261019-01); baja de empleado; ubicación y purga a 90
  días; CSRF, cookie `HttpOnly` y `Secure` por defecto con guarda de arranque;
  agrupación, reintento y payload del push; CI con tests en MySQL 8.4 real.
- **Falta todavía** (inventario revalidado sobre `main` `f3c9635` el
  2026-10-28):
  - Inyectar `Clock` (28). Agregar reglas ESLint para límites entre capas,
    ciclos y exports sin uso (35), y una prueba arquitectónica para proteger
    la separación contenedor/render (36).
  - El alta con un DNI existente filtra estado de la cuenta a otra empresa:
    `OrganizationService.createEmployee` responde `ACCOUNT_INACTIVE` para una
    cuenta inactiva; al agregar una cuenta activa ya existente, devuelve su DNI
    y `mustChangePassword`. `OrganizationController` delega la operación. Del
    mismo modo, `PasswordResetService` responde 409 `ACCOUNT_SHARED` si la
    cuenta tiene una membresía en otra empresa o un rol `ADMIN`: no dice cuál,
    pero le revela al `ADMIN` que la persona está en otra empresa
    (D-20261027-09, 2026-10-27).
  - N+1 en `OrganizationController.employees/templates` y
    `JornadaController.mine` (17).
  - Con conocer un DNI se puede bloquear esa cuenta (21); el límite por IP
    existe (100 fallos en 15 min, D-20261027-05) pero no evita eso.
  - Entrada hostil (25): los textos que ve el `ADMIN` solo tienen tope de
    largo; no se limpian caracteres de control, bidi ni zero-width.
  - Push (advertencias abiertas de las revisiones del 2026-10-27; el código
    sigue igual el 2026-10-28): `sw.ts` no escucha
    `pushsubscriptionchange`, así que una suscripción que el navegador renueva
    no se vuelve a registrar; una suscripción que el proveedor rechaza siempre
    con un 4xx distinto de 404 y 410 no se borra: se reintenta hasta `DEAD`
    (regla 12).
  - Declaración por lote (PR #65; advertencia de revisión abierta, 2026-10-28):
    hasta 200 empleados × 31 días (`JornadaDeclarationService.MAX_BULK_EMPLOYEES`,
    `MAX_BULK_DAYS`) se crean en una sola transacción (`declareBulk`), que
    retiene los locks de las plantillas (`FOR SHARE`) y de las jornadas
    insertadas hasta el commit; un lote grande demora a quien espere esas filas.
  - Issue #67 fue aprobado por Mateo y registrado como D-20261027-12. Esta
    rama implementa ubicación/radio de sede, captura GPS/manual, auditoría,
    permisos y persistencia, más la evaluación de `FUERA_DE_SEDE`. D-20261029-01
    conserva la carga manual y agrega captura del navegador con alta precisión,
    `maximumAge=0`, límite de 30 segundos y precisión reportada de hasta 25 m;
    también requiere mostrar un enlace al mapa y auditar el origen del punto.
    D-20261030-01 decide un desvío por empleado y jornada, y D-20261030-02
    congela centro y radio al declarar y omite la geocerca si la sede no tenía
    centro (2026-10-30).
  - Primer deploy: V11 exige el procedimiento de reversa antes de volver a la
    imagen anterior, y el job crea `MARCA_FALTANTE` para toda jornada abierta
    histórica (la consulta no tiene cota de fecha; interno, sin push).
  - Web Push en un iPhone real; dominio y hosting (D-20261014-16,
    `docs/PENDIENTES.md`); deploy, backup, Dockerfile, Caddy, VPS y RTO;
    acuerdo escrito con Braja sobre reuso del código con otros clientes.
- **Cerrado**:
  - 2026-10-20, PR #23: el cambio de contraseña no cerraba las otras sesiones
    (regla 23; `PasswordChangeSessionInvalidationMySqlTest`).
  - 2026-10-20, PR #28: `rs.getDate("local_date")` en `JornadaController`
    dependía de la zona de la JVM (regla 28;
    `IT.journeyDatesDoNotDependOnJvmDefaultTimeZone`).
  - 2026-10-22, PR #27: el job de ausencias volvía a elegir en cada tick un
    candidato que fallaba siempre, podía ocupar el lote de 200 y escribía un
    `LOGGER.error` con traza cada 15 s; ahora espera de 30 s a 1 h (V13) y
    avisa en WARN al primer fallo y al tope (regla 14).
  - 2026-10-22, PR #24: no había límite de login por IP (regla 21; subido a 100
    fallos el 2026-10-27, D-20261027-05, PR #52).
  - 2026-10-26, PR #26: faltaban los tests CA8 con un `ADMIN` real de otra
    empresa (regla 9) y la ráfaga de acciones distintas (regla 10).
  - 2026-10-27, #46 (PR #50): `occurredAt` de marcas olvidadas y corregidas
    sin cota (regla 15); `receivedAt` tomado antes de los locks (regla 1).

Hueco que se repite en todos los proyectos: **el pre-commit hook solo corre
si cada clon hace `git config core.hooksPath .githooks`**. Hoy no existe
`.githooks`: no hay gate local salvo correr a mano los comandos de §6.

## 8. Compuertas de proceso

- **Pre-commit**: no existe. Destino: toolchain (JDK 21, Node 24), formato,
  lint y tipos de back y front, cero warnings.
- **CI**: existe lo de §6. No existen formato (Spotless, Prettier), escaneo de
  secretos, SAST ni cobertura.
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
2. [x] El dueño revisó las 50 filas adoptadas en `docs/DECISIONES.md`
   (adopciones del 2026-10-14 al 2026-10-30; las últimas son D-20261029-01 y
   D-20261030-01).
3. [ ] Portar `DecisionesDelDuenoTest` (frases de atribución sin ID → falla).
4. [~] Toolchain: Java 21 y Node 24 fijados solo en CI (PR #4). Los `<…>` de
   este archivo se completaron con lo real; quedan RTO y el dominio.
5. [~] Sacar `[sin guarda]` regla por regla (2026-10-28). Con guarda: 1, 2, 4,
   5, 6, 7, 8, 10, 12, 13, 14, 21, 22, 26 y la máquina de estados; parcial: 9
   (`company_id` en cada consulta), 15, 18 (normalización), 23 (último
   `ADMIN`), 24 (`Content-Type`), 27 (front), 35 (reglas para capas, ciclos y
   exports), 37 y 39 (cobertura). Siguen sin guarda: 3, 11 (orden de locks),
   16, 17, 19, 20, 25, 28 (`Clock`), 29–34, 36 (separación
   contenedor/render), 38 y 40.
6. [x] Primera verificación completa del archivo contra el código:
   2026-10-20, sobre `main` en `5e61d0a5bb6b81c26603f42e9093bf85e9baab4a`.
   Segunda: 2026-10-28, sobre `main` en
   `f3c96357b9b0e40a29b56880ca8c1850ca6a6481`. Se repite al cerrar cada hueco
   de §7.
