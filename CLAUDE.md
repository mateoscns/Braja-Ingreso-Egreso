# Fichaje Braja — reglas duras y forma de trabajar con IA

Sistema propio de registro de ingreso y egreso de empleados (con desayuno y
almuerzo) para Braja, multi-empresa y multi-sede. Stack: PWA React + Vite +
TypeScript, Java 21 + Spring Boot 3 (MVC) + JdbcTemplate, MySQL 8.4 + Flyway,
sesión HTTP en MySQL. Producción: Docker Compose + Caddy en un VPS (`deploy/`,
D-20261102-12); al 2026-11-02 la pila existe pero nunca corrió en un VPS (§7).

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

Estado al 2026-11-02 (tercera verificación completa, §9: sobre la rama de
integración `0be9c05`, que reúne sobre `main` `1288e23` los PRs #84 a #94 de la
campaña de pruebas previa a producción, issue #72; al fusionarse, `main` en
`<sha de main tras el merge>`): hay backend, frontend, `openapi.yaml`, CI, la
campaña de pruebas con su simulación, la pila de deploy de `deploy/`
(`backend/Dockerfile`, compose, Caddy y scripts) y 66 decisiones adoptadas (0
propuestas). La geocerca de sedes (issue #67) entró con el PR #69 el
2026-10-30. No hay VPS, dominio, `.githooks`, checklist de release ni RTO, y la
pila de `deploy/` no corrió nunca en un servidor real. Cada regla de §5 está
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
  123 de `main` (`git log -i --grep=Co-Authored-By f3c9635`); al 2026-11-02,
  ninguno de los 178 de la rama de integración `0be9c05`.
- **Dependencias nuevas solo con verificación humana** (slopsquatting):
  comprobar en Maven Central o npm que el paquete existe, quién lo publica
  y desde cuándo. Va al `pom.xml` o al `package.json` y al lockfile en el
  mismo commit. Exige rebuild de TODAS las imágenes que lo usan
  (`braja-backend:<sha>` y `braja-caddy:<sha>`, que construye
  `deploy/deploy.sh`): un `restart` sigue corriendo la imagen vieja.

## 2. Personas y decisiones

- **Roles**: dueño Mateo: adopta las decisiones de producto, destrucción y
  excepciones. Enrique: desarrollador; propone, no adopta. Cliente: Braja
  (paga el hosting, D-20261014-10; pide cambios a través de Mateo). "El
  dueño" es Mateo. **No confundir con el rol `ADMIN` del dominio**, que es
  el dueño del comercio cliente; en el código y acá ese rol es siempre
  `ADMIN`.
- **Registro de decisiones**: `docs/DECISIONES.md`, filas `ID
  (D-AAAAMMDD-NN) | fecha | decisión | propuesta por | estado | motivo`. Al
  2026-11-02: 66 filas, todas adoptadas y 0 propuestas (16 del 2026-10-14, 6
  del 10-15, 5 del 10-16, 1 del 10-18, 6 del 10-19, 2 del 10-23, 12 del 10-27,
  1 del 10-29, 2 del 10-30 y 15 del 11-02). Las 15 del 2026-11-02
  (D-20261102-01 a -15) son propuestas de la IA durante la campaña #72 que
  Mateo adoptó con su aprobación general de ese día al plan de producción
  (`odd/tasks/production-readiness.md`); cada una lo dice en su motivo.
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
  (multi-empresa y multi-sede). Las otras 61 filas también rigen; las que
  cambian una regla de §5 se citan ahí.
- **Una decisión nueva** la propone quien la detecta (Mateo, Enrique o la
  IA) como fila `propuesta`; hasta que Mateo la adopte no se cita como
  decisión del dueño ni se implementa como definitiva.

## 3. Cómo se escribe una regla en este archivo

- **Cita lo que la sostiene**: archivo, test o restricción; sin cita, va
  `[sin guarda: …]`. Tests en `backend/src/test/java/com/braja/fichaje/` y
  `frontend/src/**/*.test.*`, por clase y método. Alias: `IT` =
  `BackendMySqlIntegrationTest`; `Outbox` = `NotificationOutboxMySqlTest`;
  `Baja` = `EmployeeDeactivationMySqlTest`; `Campaign` = las clases del paquete
  `campaign` (tag JUnit `campaign`, heredado de `CampaignTestBase`) y
  `campaign/simulation` (la de 90 días, `Simulation90DaysTest`, lleva además el
  tag `simulation`). Una clase `*SpecTest` sin paquete es de `campaign`.
- **Lleva el incidente que la originó**, con fecha y síntoma entre
  paréntesis: `(AAAA-MM-DD: <qué se rompió>)`. Una regla sin historia se
  borra "para simplificar"; una con historia, no. Las que vienen de otro
  proyecto citan ese proyecto (Shifty).
- **Distingue destino de estado.** La lista de excepciones NO vive en este
  archivo (se desactualiza): vive en un test como **techo que solo baja**.
  Al 2026-11-02 hay tres: `KnownDefectCeilingTest.CEILING` (tests
  `@KnownDefect` de la campaña; 0 tras los arreglos #73 a #81),
  `EndpointContractSpecTest.UNDOCUMENTED_CODES` y `UNDOCUMENTED_STATUSES`
  (códigos y estados que emite el backend sin estar en `openapi.yaml`; los dos
  vacíos) y `MigrationSpecTest.PRE_RULE_EXCEPTIONS` (V1 a V10, regla 19). Al
  tocar un archivo exceptuado se migra hacia el patrón; no se extiende la
  excepción.
- **Los conteos se fechan** ("al AAAA-MM-DD quedan N"). Un conteo que
  cambia con cada commit no es un control.
- **Una excepción es única, fechada y dice por qué es segura**, y desde
  cuándo deja de valer. **Lo que falla abierto se documenta como tal** (qué
  queda sin protección y quién se entera).

## 4. Arquitectura

Es el estado verificado sobre `main` en
`5e61d0a5bb6b81c26603f42e9093bf85e9baab4a` al 2026-10-20, revalidado sobre
`f3c9635` al 2026-10-28 y sobre la rama de integración `0be9c05` al
2026-11-02, y también el destino: la estructura
por funcionalidad con `JdbcTemplate` se mantiene (D-20261019-03). Lo que la
versión anterior planteaba (capas `api/servicio/repositorio/dominio`, JPA,
`ContextoEmpresa`, `OutboxPush`, JWT) queda descartado; las reglas de
ArchUnit que se agreguen se ajustan a esta estructura.

**Backend** (`backend/`, paquete `com.braja.fichaje`, por funcionalidad):

- `api` (`ApiException`, `ApiExceptionHandler`, `Problem`, `ProblemCodes` y
  `ProblemErrorController`, que reemplaza el `/error` de Spring Boot: toda
  respuesta 4xx y 5xx es `application/problem+json` con `code` y `traceId`,
  D-20261102-11; `HostileText`, regla 25; `DateRanges`), `config`
  (`BrajaProperties` `braja.*`; `SchedulingConfiguration`, `@EnableScheduling`
  salvo `braja.scheduling.enabled=false`, que apagan los tests de integración;
  `TimeConfiguration`, el único bean `Clock`, regla 28), `ops`
  (`HealthController`: `GET /api/v1/health` anónimo, 200 `{"status":"UP"}` o
  503 `DATABASE_UNAVAILABLE`; sin actuator; guarda: `HealthEndpointMySqlTest`).
- `security`: sesión Spring Session JDBC (cookie `BRAJA_SESSION`), CSRF
  (`X-CSRF-TOKEN`), BCrypt 12, `ScopeService`, `AccountService`,
  `SessionController`, `LoginThrottleService`, `ClientAddressResolver`,
  `PasswordResetService` y `TemporaryPasswordGenerator` (restablecimiento por
  el `ADMIN`, D-20261027-09), `EncryptionService` (AES-GCM de motivos
  `SALUD`), `BootstrapAdminRunner`, `PrivacyRetentionScheduler` (purga a 90
  días de coordenadas de marcas y texto `SALUD`, y a un día de las filas de
  `login_throttles` y `login_ip_throttles` sin bloqueo vigente, D-20261102-08).
- `organization` (sedes, empleados, plantillas: `OrganizationController`,
  `OrganizationService`; asignación de plantillas con fecha de inicio:
  `TemplateAssignmentController`, `TemplateAssignmentService`, D-20261015-02),
  `timekeeping` (`JornadaController`, `JornadaDeclarationService` (una o por
  lote, D-20261027-11), `JornadaHistoryService`, `JornadaAuditController` y
  `JornadaAuditService`, `MarkController`, `MarkService`, `MarkScheduler`,
  `DeviationWorkerRetryPolicy`), `deviations` (`DeviationController`,
  `DeviationService`, `DeviationPolicy`, con `JOB_LOOKBACK_DAYS = 7` y
  `PUSH_FRESHNESS` de 2 h, D-20261102-02 y -03; `GeofencePolicy`),
  `notifications` (outbox en MySQL, dispatcher, Web Push VAPID, cifrado de
  suscripciones). (2026-11-02.)
- **Despliegue** (`deploy/`, D-20261102-12; runbook `deploy/README.md`):
  `backend/Dockerfile` (JRE 21, usuario sin privilegios, `HEALTHCHECK` contra
  `/api/v1/health`), `deploy/docker-compose.yml` (MySQL 8.4 sin puerto
  publicado, backend con sus jobs, Caddy en 80/443 con IP fija en la red
  `braja`), `deploy/caddy/` (Caddyfile e imagen que compila la PWA),
  `gen-secrets.sh`, `deploy.sh`, `backup.sh`, `restore.sh`,
  `bootstrap-vps.sh` y `lib.sh`. El `docker-compose.yml` de la raíz sigue
  siendo solo el MySQL de desarrollo. (2026-11-02.)
- **Persistencia**: `JdbcTemplate` con SQL a mano; sin JPA ni Spring Data.
  Flyway V1–V29 al 2026-11-02; V12 y V17 no existen (nunca hubo archivos con
  esos números, `git log --all`; guarda: `MigrationSpecTest`). Las FK llevan
  `(id, company_id)` compuesto: la base rechaza cruces entre empresas.
- **Transacciones**: `@Transactional` en servicios (`MarkService`,
  `DeviationService`, `OrganizationService`, `TemplateAssignmentService`,
  `JornadaDeclarationService`, `JornadaHistoryService`, `JornadaAuditService`
  de solo lectura, el outbox, `AdminPushSubscriptionService`,
  `LoginThrottleService`, `BootstrapAdminRunner`, `PrivacyRetentionScheduler`);
  `AccountService` no envuelve login ni cambio de contraseña en una
  transacción (§5.21; lo dice su Javadoc) y escribe la contraseña con
  `TransactionTemplate`, igual que `PasswordResetService`; los jobs de
  `MarkService` usan `TransactionTemplate` `REQUIRES_NEW` por candidato, en
  READ COMMITTED. Desde el 2026-11-02 (D-20261102-15, #74, PR #94) también
  corren en READ COMMITTED las escrituras de marcas por HTTP
  (`MarkService.recordEmployeeMark`, `attachLocation`, `forgottenMark`,
  `correctMark`, `cancelJornada`, `voidMark`) y las declaraciones
  (`JornadaDeclarationService.declare` y `declareBulk`): con REPEATABLE READ, el
  `FOR UPDATE` sobre el historial vacío tomaba gap locks y las primeras marcas
  de la apertura se trababan entre jornadas (S64), y un lote que competía con el
  guardado de una plantilla congelaba bloques viejos y nuevos mezclados (S63).
  Guarda: `LockOrderSpecTest.s64TwentyLateIngresosWithTheAbsenceJobAndTheDispatcherOpenOnePushWindowCountedPerSite`,
  `.s63ABulkDeclarationRacingATemplateSaveFreezesOneWholeTemplateVersion`.
  Ningún controlador lleva `@Transactional`; las escrituras de varias
  sentencias viven en servicios. Al 2026-11-02 `OrganizationController` solo
  lee con `JdbcTemplate` directo (el alta de sede la hace
  `OrganizationService.createSite`) y `JornadaController` solo lee (§7).
- **Alcance de empresa**: sin JWT. `ScopeService.require/requireAdmin` toma
  la empresa activa de la sesión (`braja.activeCompanyId`) y relee de MySQL,
  en cada request, membresía, rol y `active`. Cada consulta recibe
  `company_id` explícito.
- **Dominio sin Spring**, con tests unitarios: `MarkTransitionPolicy`,
  `MarkState`, `DeviationPolicy`, `NotificationRetryPolicy`,
  `MarkRequestFingerprint`, `DeviationWorkerRetryPolicy`, `DateRanges`,
  `GeofencePolicy`, `HostileText` (2026-11-02).
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
  (15 min). Los jobs de ausencia y `MARCA_FALTANTE` solo miran jornadas de los
  últimos 7 días locales de su sede, contando hoy (D-20261102-02; regla 14).
  Un candidato de ausencia o `MARCA_FALTANTE` que falla espera de
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
   la carga manual; el origen del punto se audita. La geocerca juzga cada marca
   con las coordenadas y la precisión tal como quedan guardadas (D-20261102-14;
   `GeofencePolicyTest.storedAccuracyIsRoundedUpToTheCentimeterSoItNeverLooksMorePreciseThanReported`,
   `GeofenceSpecTest.s42ReAnchoringJudgesTheOtherMarkWithTheAccuracyItReported`).
   Guarda: `OrganizationTransactionMySqlTest`
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
   (D-20261027-02). Cada envío queda en `deviation_audits` (V16). El texto se
   limpia antes de validarse (regla 25). `FUERA_DE_SEDE` (V28) también exige
   motivo. Guarda: `chk_deviation_type`, `chk_deviation_motive_category`,
   `chk_deviation_motive_storage` (V4, V11), `chk_deviation_audit_change`
   (V16), `DeviationRulesMySqlTest` (corrección, bloqueo, validación),
   `DeviationLifecycleSpecTest.s36TheEmployeeCorrectsTheMotiveUntilItIsClassifiedThenItIsLockedAndAuditsNeverKeepTheText`
   y `.s36AFirstMotiveOnADeviationClassifiedWithoutMotiveSendsItBackToReview`.
5. **Solo `ADMIN` cambia el estado de justificación** (D-20261014-08):
   `requireAdmin` en `PUT /admin/deviations/{id}/classification`; cambiar una
   clasificación exige motivo y escribe `deviation_audits`. Si el desvío
   cambia de tipo, la clasificación se borra y vuelve a revisión
   (D-20261027-01); si se reactiva, empieza sin motivo ni clasificación. Guarda: `chk_deviation_classification` (V4),
   `DeviationRulesMySqlTest.classificationStillAuditsAndCorrectionStillNeedsAReason`
   (incluye el 403 a un empleado),
   `DeviationRulesMySqlTest.classifiedAbsenceReplacedByLateArrivalGoesBackToReviewKeepingTheMotive`
   y `DeviationLifecycleSpecTest.s38OnlyTheAdminClassifiesAndChangingAClassificationNeedsAReason`.
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
   de la jornada, sin texto de motivo ni coordenadas, con tope de 500: si hay
   más, las 500 más nuevas en orden cronológico con `truncated=true`
   (D-20261102-09, PR #86; antes conservaba las 500 más viejas). Guarda,
   también de lo que escribe `correctMark`:
   `JornadaAuditHistoryMySqlTest.adminReadsEveryChangeOfTheJornadaInOrderWithActorNamesAndNoMotiveTextOrCoordinates`,
   `.onlyAnAdminOfTheSameCompanyReadsTheHistory`,
   `.theHistoryIsCappedAt500EntriesAndSaysItWasTruncated` y
   `AdminCorrectionSpecTest.s49HistoryStopsAtFiveHundredEntriesAndFlagsTheTruncation`.
7. **Un empleado dado de baja no inicia sesión ni marca; su historial no se
   borra.** La baja es `PATCH /employees/{id}` con `active=false`; no existe
   endpoint de borrado y las FK impiden borrar filas referenciadas. Guarda:
   `Baja` (sesión existente, login, job de ausencias y push) y
   `AuthAbuseSpecTest.s19DeactivationMidJornadaCutsTheLiveSessionBlocksLoginAndTheJobsSkipThePerson`.
   Al reactivarlo, los jobs marcan a lo sumo los últimos 7 días y sin push
   (D-20261102-02, -03; `OrganizationSpecTest.r3AReactivationFlagsOnlyTheLastSevenLocalDaysOfTheInactiveSpanAndPushesNone`).
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
   `AdminPushControl.test.tsx`. Desde el 2026-11-02 un desvío solo encola push
   si se detecta a lo sumo 2 h después de su hecho (`DeviationPolicy.PUSH_FRESHNESS`,
   D-20261102-03, PR #89; antes una fecha pasada declarada, una reactivación o
   el primer deploy avisaban por días viejos); pasado ese plazo se registra igual
   en la bandeja. Guarda:
   `DeviationLifecycleSpecTest.r2AnAbsenceIsAlwaysRecordedButPushedOnlyWhenDetectedAtMostTwoHoursAfterItWasDue`,
   `.r2ALateArrivalLoadedByTheAdminIsPushedOnlyWhileItsIngressIsAtMostTwoHoursOld`,
   `.r2AnUnpushedAbsenceReplacedByAFreshLateArrivalNotifiesOnceForTheArrival`,
   `.s37ADeviationReactivatedMoreThanTwoHoursAfterItsIngressComesBackWithoutANewPush`,
   `NotificationSpecTest.s55AnAbsenceDetectedMoreThanTwoHoursAfterItWasDueIsRecordedButCountedInNoPush`.

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
   marca olvidada, corrección y clasificación; desde el 2026-11-02,
   `AuthAbuseSpecTest.s20EveryIdOfAnotherCompanyLooksLikeAnUnknownIdAndChangesNothing`
   recorre cada ruta con ids de otra empresa. Que cada consulta lleve
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
    `IT.distinctConcurrentPauseMarksSerializeToOneAcceptedMarkAndOneConflict`;
    con 20 hilos, `LockOrderSpecTest.s62TwentyIdenticalRetriesMakeOneMarkAndTwentyDistinctActionsAcceptOneAndConflictNineteen`.
    La transacción corre en READ COMMITTED (D-20261102-15, §4): el lock de la
    fila de la jornada serializa el historial sin gap locks (2026-11-02, #74: con
    REPEATABLE READ, 16 de 20 primeras marcas simultáneas de jornadas distintas
    respondían 409 reintentable; guarda: `LockOrderSpecTest.s64TwentyLateIngresosWithTheAbsenceJobAndTheDispatcherOpenOnePushWindowCountedPerSite`).
11. **Orden único de locks**, el real: cuenta → membresía → (empleado) →
    jornada → marcas → desvíos → estado de notificación de la empresa →
    ventana de aviso (`FOR UPDATE`; el reclamo solo toma ventanas). Declarar
    (una o por lote) y asignar plantilla toman la plantilla `FOR SHARE` antes de
    insertar; mover una plantilla de sede la toma `FOR UPDATE` antes de leer sus
    jornadas y asignaciones (`JornadaDeclarationService`,
    `TemplateAssignmentService`, `OrganizationService.saveTemplate`, 2026-10-27).
    Editar la geocerca de una sede (`OrganizationService.updateSiteLocation`,
    D-20261102-01) toma: las jornadas no empezadas de la sede, por id
    `FOR UPDATE` en tandas de 500 → la sede `FOR UPDATE` → las declaradas
    mientras tanto, `FOR UPDATE SKIP LOCKED`. Las jornadas van antes que la sede
    porque una marca o el job de ausencias toman la jornada y después la sede en
    modo compartido por la FK del desvío que insertan; tomar la sede primero se
    trabaría con ellos. El `SKIP LOCKED` falla abierto: una jornada declarada
    durante el cambio que otra transacción tiene tomada en ese instante conserva
    la geocerca anterior y nadie recibe aviso (§7). Todo camino nuevo respeta este
    orden. Guarda (2026-11-02, campaña #72; antes solo
    `ApiExceptionHandlerTest`, que prueba que un fallo de lock da 409
    reintentable):
    `LockOrderSpecTest.s63EveryPairOfWritesOnOneJornadaEndsWithoutDeadlockOrServerErrorAndKeepsTheInvariants`
    (cada par de escrituras que comparten un lock, la edición de sede incluida,
    sin deadlock ni 5xx) y
    `.s63ABulkDeclarationRacingATemplateSaveFreezesOneWholeTemplateVersion`.
    Que un camino nuevo entre en esos pares no lo exige ningún test.
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
    fallido, con WARN de estado y host; `DEAD` deja un ERROR. Una ventana cuyas
    únicas suscripciones respondieron 404 o 410 queda `SENT` aunque nadie la
    recibió (aceptado, D-20261102-10;
    `NotificationSpecTest.s56AGoneSubscriptionIsDeletedAtOnceAndTheWindowIsClosed`).
    Guarda:
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
    `IDEMPOTENCY_CONFLICT`; el reintento devuelve la marca original. Sin el
    header responde 400 `IDEMPOTENCY_KEY_REQUIRED` y no guarda nada (2026-11-02,
    #73: antes respondía sin `code`); una clave mal formada, 422
    `VALIDATION_ERROR`, y la clave de una marca rechazada no se guarda y se
    puede reutilizar (las dos aceptadas, D-20261102-10). Guarda:
    `IT.identicalConcurrentRetries…`,
    `IT.reusedIdempotencyKeyWithDifferentPayloadConflictsAndPauseMustCloseBeforeEgress`,
    `IT.idempotencyReplayCannotReturnAnotherCompanyReceiptAfterCompanySwitch`,
    `MarkStateMachineSpecTest.s28AMarkWithoutIdempotencyKeyIsA400AndStoresNothing`,
    `.s28AMarkWithoutIdempotencyKeyCarriesAProblemCode`,
    `.s28AMalformedIdempotencyKeyIsRejectedWithACode` y
    `.s27SameKeyAndBodyReplayTheSameMarkEvenAfterAnAdminCorrectsOrVoidsIt`.
14. **Jobs programados**: corren dentro del backend; el flag
    `braja.scheduling.enabled` apaga todos los `@Scheduled`. Sin ShedLock: se
    agrega antes de escalar a más de una instancia. Hoy un doble disparo lo
    acotan `uq_deviation_jornada_active_type` (V9) y el lock por jornada.
    Un candidato que falla se reintenta con espera creciente y no ocupa el lote
    (V13, 2026-10-22, PR #27; antes se volvía a elegir en cada tick). Los jobs
    de ausencia y `MARCA_FALTANTE` solo miran jornadas de los últimos 7 días
    locales de su sede, contando hoy (`DeviationPolicy.JOB_LOOKBACK_DAYS`,
    D-20261102-02, PR #89; 2026-11-02: sin cota, el primer deploy sobre datos
    reales y cada reactivación marcaban todas las jornadas abiertas históricas,
    de a 200 por tick). Guarda:
    `IT.absenceWorkerSkipsAlreadyProcessedCandidatesOnNextTick`,
    `IT.absenceWorkerBacksOffFailingCandidateAndProcessesNextCandidateOnce`,
    `DeviationWorkerRetryPolicyTest`,
    `MigrationSpecTest.s76FirstTickAfterDeployFlagsOnlyTheLastSevenLocalDaysAndPushesOnlyTheFreshAbsence`,
    `.s76TheSevenLocalDaysAreCountedInTheZoneOfEachSite`,
    `.s76AHistoricBacklogOlderThanTheLastSevenLocalDaysIsNeverFlagged`.

### Datos y migraciones

15. **Todo parámetro numérico de la API lleva cota inferior Y superior**:
    tolerancia y pausas (`@Min/@Max`), ubicación (`@DecimalMin/@DecimalMax`),
    radio de geocerca 50–500 metros (100 por defecto; columna y `CHECK` en V25),
    `limit` de bandeja 1–100 y rangos de fechas de 366 días inclusive como
    máximo en años 2000–2100 (`api/DateRanges`). Una contraseña nueva (cambio,
    provisoria del alta y la del primer `ADMIN`) tiene de 12 caracteres (16 la del
    primer `ADMIN`) a 72 bytes en UTF-8, el límite de BCrypt; más larga responde
    422 `PASSWORD_TOO_LONG` y en el bootstrap hace fallar el arranque
    (D-20261102-04, PR #90; 2026-11-02: la API documentaba 256 caracteres y BCrypt
    ignoraba en silencio los bytes después del 72). La contraseña de login acepta
    hasta 256 caracteres, como antes. Un solo lado deja un 500 alcanzable (Shifty,
    2026-09-04: desborde con `offset`). Guarda de base: `chk_employee_tolerance`,
    `chk_jornada_tolerance`. Desde 2026-10-27 (#46; antes se aceptaban 367 días,
    fechas de jornada sin año acotado y horas a futuro): `DateRangesTest`; la
    `localDate` de una jornada declarada y el `occurredAt` de marcas olvidadas o
    corregidas (nunca a futuro, a ≤ 24 h del horario de la jornada) tienen
    guarda en `TimekeepingBoundsMySqlTest`. Desde 2026-11-02 (campaña #72):
    `AuthAbuseSpecTest.s23ANewPasswordIsAtMost72Utf8BytesAndBodiesHaveNoSizeCap`,
    `.s23OversizedButWellFormedInputIsA422WithACode`,
    `BootstrapAdminValidationTest.aPasswordAbove72Utf8BytesStopsTheStartup`,
    `GeofenceSpecTest.s44RadiusIsAcceptedFrom50To500`,
    `OrganizationSpecTest.s53TemplateShapeAndBreakLimitBounds`,
    `.s52TheRangeIsAtMost31DaysInclusive`, `.s52TheLotIsAtMost200Employees` y
    `.s51AssignmentStartDatesAreBoundedTo2000Through2100`. Que cada parámetro
    tenga su test no se comprobó uno por uno `[sin guarda: implementado, sin test]`.
16. **Agregados en la base**: los conteos del push salen de `GROUP BY`
    (`NotificationWindowRepository.loadSiteCounts`). No hay otros totales.
    `[sin guarda: implementado, sin test]`
17. **Una consulta dentro de un loop es N+1 hasta demostrar lo contrario**; se
    resuelve con `IN` o join. Al 2026-10-28 la incumplían
    `OrganizationController.employees` (leía las sedes de cada empleado),
    `OrganizationController.templates` (los bloques de cada plantilla) y
    `JornadaController.mine` (jornada y marcas por cada id); desde el 2026-11-02
    (#75, PR #87) cada listado lee los hijos de todas sus filas con un número
    constante de consultas (`IN`) y el cuerpo de la respuesta no cambió. Guarda:
    `QueryCountSpecTest.s67EmployeesRunsAConstantNumberOfStatements`,
    `.s67TemplatesRunsAConstantNumberOfStatements`,
    `.s67MineRunsAConstantNumberOfStatements`,
    `.s67RangeListingsRunTheSameStatementsWhateverTheRowCount` y
    `.s67ListingsReturnTheSameBodyAsTheRowByRowReads`. Un listado nuevo no
    tiene esa guarda hasta que se agrega a `QueryCountSpecTest`.
18. **Unicidad y normalización en la base**: el identificador es el DNI global
    (D-20261016-01), no un `username` por empresa: `accounts.dni_normalized`
    solo dígitos (`DniNormalizer`, 7 a 12) con `UNIQUE uq_account_dni` (V1) y
    sin `CHECK` de formato. Guarda: `uq_account_dni`; la normalización
    `[sin guarda: implementado, sin test]`.
19. **Migraciones Flyway versionadas y reversibles por procedimiento.**
    Flyway Community no tiene `undo`: cada migración declara en un comentario
    cómo se vuelve atrás. El DDL de MySQL no es transaccional: **una sentencia
    DDL por migración**. Rige desde V12 (D-20261019-05): V1–V10 no declaran su
    reversa y casi todas tienen varias sentencias, pero no se reescriben; V11
    cumple (un `ALTER` y su reversa). Al 2026-11-02, V11, V13–V16 y V18–V29 tienen
    una sola sentencia DDL y un comentario `-- Revert:`; V12 y V17 no existen.
    Una migración aplicada no se edita: Flyway compara su checksum y el arranque
    fallaría. Migrar desde base vacía ocurre en cada corrida de `IT`
    (`IT.migrationsCreateTheTenantAndPrivacyInvariants`). Guarda (2026-11-02,
    campaña #72; antes `[sin guarda: destino]`):
    `MigrationSpecTest.s75FromV12OnEveryMigrationIsOneDdlStatementWithItsRevertAndTheExceptionsOnlyShrink`
    (techo `PRE_RULE_EXCEPTIONS` con V1–V10, que solo baja),
    `.s75EmptyDatabaseMigratesToTheLatestVersionWithEveryVersionRecorded` y las
    migraciones con datos `.s75V23DatabaseWithDataMigratesKeepingEveryRowAndApplyingTheV24ToV29Defaults`
    y `.s75V27DatabaseWithGeofenceDataMigratesKeepingEveryRowAndLeavesTheOldAuditSourceUnknown`.
    **Reversa de V11, completa** (su comentario no se corrige porque cambiaría el
    checksum; 2026-11-02: el comentario no dice que hay que borrar la fila de
    `flyway_schema_history`, así que Flyway seguía dando V11 por aplicada y un
    `migrate` posterior nunca volvía a agregar `MARCA_FALTANTE`; lo fija
    `MigrationSpecTest.v11DocumentedRevertFailsWhileAMissingEgressRowExistsAndLeavesFlywayHistoryClaimingV11`):
    con la base respaldada y el backend detenido, (1) borrar las filas de
    `deviation_audits` de todo desvío `MARCA_FALTANTE` (activo o no) y después
    esos desvíos, o cambiarles el tipo; (2) correr el `ALTER TABLE` del
    comentario de V11; (3) `DELETE FROM flyway_schema_history WHERE version='11'`.
    La alternativa es restaurar el backup previo a la migración
    (`deploy/restore.sh`).
20. **Migraciones sin corte (expand/contract)**: el deploy existe desde el
    2026-11-02 (`deploy/deploy.sh`, regla 32) y no deshace migraciones: si la
    versión nueva no queda sana, vuelve a la imagen anterior sobre el esquema
    nuevo e imprime el `restore.sh` del backup tomado antes de migrar. Por eso
    toda migración tiene que dejar funcionando a la imagen anterior (V11 ya avisa
    que, con filas `MARCA_FALTANTE`, la imagen anterior falla). Ningún test lo
    comprueba y, sin entidades JPA, no hay test índice-contra-entidad.
    `[sin guarda: destino]`

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
    El job de privacidad borra las filas de `login_throttles` y
    `login_ip_throttles` un día después de su última actualización, salvo que
    tengan un bloqueo vigente (D-20261102-08, PR #90; 2026-11-02: las de DNI
    solo se borraban con un login correcto). En producción el límite por IP
    depende de que Caddy vea la IP real del cliente: el acceso es solo por IPv4
    (`deploy/docker-compose.yml` publica los puertos solo en `0.0.0.0` y el DNS
    lleva un registro `A` sin `AAAA`, D-20261102-12), porque por IPv6 Docker le muestra a
    Caddy la IP de su gateway. Aceptado (D-20261102-10): la ventana de 15 min
    incluye su extremo final, y con cinco intentos del mismo DNI en verificación
    a la vez otro simultáneo responde 429 aunque su contraseña sea correcta
    (cada intento reserva uno de los cinco antes de BCrypt; sin test que lo fije).
    Guarda: `LoginHardeningMySqlTest`, `LoginThrottleByIpMySqlTest`,
    `BrajaPropertiesValidationTest.loginIpThrottleDefaultsToOneHundredFailuresAndIsConfigurableThroughItsEnvironmentVariable`,
    `AuthAbuseSpecTest.s14FiveWrongPasswordsLockTheDniForExactlyFifteenSimulatedMinutes`,
    `.s14AWrongPasswordAtTheExactEdgeStillCountsInTheOldWindow`,
    `.s15HundredFailuresLockOneClientAddressAndOnlyThatOne`,
    `LockOrderSpecTest.s65ThirtyNineSimultaneousLoginsOnATwelveConnectionPoolAnswerOnly200Or401Or429WithConsistentCounters`,
    `PrivacySpecTest.s61LoginThrottleRowsOfDniAndAddressAreDeletedOneMicrosecondPastADayUnlessStillLocked`.
    Brecha: quien conoce un DNI puede bloquearlo.
22. **Configuración de producción falla cerrada.** Hoy: ningún secreto con
    default en el repo; `EncryptionService` llama `BrajaProperties.validate()`
    y el arranque falla sin clave de salud de 32 bytes, con VAPID incompleto o
    con push activo sin clave de suscripción; no hay springdoc, actuator ni
    CORS (la compuerta de salud es `GET /api/v1/health`, §4, sin dependencia
    nueva). El bootstrap del primer `ADMIN` hace fallar el arranque con una
    contraseña de más de 72 bytes o una zona que no es una región IANA
    (D-20261102-04, -05; guarda:
    `BootstrapAdminValidationTest.aPasswordAbove72Utf8BytesStopsTheStartup`,
    `.aSiteZoneThatIsNotAnIanaRegionStopsTheStartup`). En producción,
    `deploy/docker-compose.yml` fija `BRAJA_SESSION_COOKIE_SECURE=true` y
    `BRAJA_TRUSTED_PROXY_CIDRS` en la IP fija de Caddy `/32`, y el Caddyfile
    agrega HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`,
    `Referrer-Policy`, `Permissions-Policy`, COOP y una CSP de solo mismo origen,
    y quita `Server` (2026-11-02; `[sin guarda: implementado, sin test]`: el
    build de la imagen de Caddy solo corre `caddy validate`). Sin perfil activo,
    la configuración por defecto pone `Secure=true`
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
    no; guarda: `AdminPasswordResetMySqlTest`, 2026-10-27; también libera el
    bloqueo de login del DNI:
    `AuthAbuseSpecTest.s18TheAdminResetClosesEverySessionLiftsTheDniLockAndForcesAPasswordChange`).
    El token CSRF vive en la sesión, así que el navegador que tenía una de esas
    sesiones lo pierde con ella: su siguiente login con ese token responde 401
    `SESSION_EXPIRED` sin contar un intento y la PWA reintenta una vez con un
    token nuevo (por diseño, `docs/ESPECIFICACION.md`, 2026-11-02). No hay endpoint
    para cambiar el rol ni dar de baja a un `ADMIN`: "nunca el último
    `ADMIN`" se cumple por ausencia `[sin guarda: implementado, sin test]`.
24. **Anti-CSRF**: toda mutación exige `X-CSRF-TOKEN`; cookie de sesión
    `HttpOnly`, `SameSite=Lax`. El login rota el token (2026-10-27: el token
    previo al login seguía valiendo). Sin sesión autenticada (vencida o
    ausente) el rechazo de CSRF da 401 `SESSION_EXPIRED`; con sesión viva, 403.
    Guarda:
    `IT.httpLoginCreatesHttpOnlySessionCookieAndCsrfProtectsMutableRoutes`,
    `LoginHardeningMySqlTest.loginRotatesTheCsrfTokenSoThePreLoginTokenIsRejected`,
    `LoginHardeningMySqlTest.mutationWithoutAnAuthenticatedSessionIs401WhileCsrfMismatchOnALiveSessionStays403`,
    `AuthAbuseSpecTest.s17EveryMutationWithoutAValidCsrfTokenIsRejectedAndWritesNothing`
    y `.s17ATokenAloneGrantsNothingAndTheTokenDiesAtLoginAndLogout`. No hay una
    lista explícita de `Content-Type`: un cuerpo que no es `application/json`
    responde 415 `UNSUPPORTED_MEDIA_TYPE` en problem+json (2026-11-02, #73: antes
    con el cuerpo de Spring Boot; guarda:
    `ErrorContractSpecTest.s73EveryMalformedRequestIsAProblemWithCodeAndTraceId`).
25. **Entrada hostil**: todo texto libre que lee otra persona (nombres de sede,
    empleado y plantilla, el texto del motivo y las razones del `ADMIN` en
    clasificación, marca olvidada, corrección, cancelación y anulación) pasa por
    `api/HostileText` en el constructor de su record de entrada, antes de Bean
    Validation (D-20261102-13, #76, PR #93). Quita controles C0 y C1, marcas
    bidi, caracteres de ancho cero y demás ignorables de Unicode, con
    excepciones para emoji y escrituras que necesitan ZWJ, ZWNJ o selectores de
    variación; deja los saltos de línea como LF solo en motivos y razones;
    normaliza a NFC. Los topes (4000 el motivo; 2000 las razones; 120 el nombre
    de sede o de plantilla; 160 el de empleado) cuentan el texto limpio y un valor que queda vacío responde 422
    (2026-11-02, S22: antes solo había tope y un texto bidi le mostraba al
    `ADMIN` algo distinto de lo guardado). Las filas guardadas antes no se
    migran; no hay exportación CSV. Guarda: `HostileTextTest` (entre otros,
    `HostileTextTest.cleaningIsIdempotent` y
    `HostileTextTest.hiddenPayloadsInTagsAndVariationSelectorsAreRemoved`),
    `HostileInputSpecTest.s22EveryTextTheAdminSeesIsCleaned`,
    `.s22EveryAdminVisibleTextKeepsItsLengthCap` y
    `.s22NulLoneSurrogatesAndInvalidUtf8AreNeverA5xx`. Un campo de texto nuevo
    no queda cubierto hasta que su record llama a `HostileText`
    `[sin guarda: destino]` (ningún test recorre todos los records).
26. **Errores neutros hacia afuera**: toda respuesta 4xx y 5xx del backend es
    Problem Details (`application/problem+json`) con `code` estable y `traceId`,
    también las de los filtros de seguridad y las de `/error`
    (`ProblemErrorController`); `detail` es un texto fijo que nunca repite la
    excepción ni el pedido (D-20261102-11, #73, PR #88; 2026-11-02: un 415, un 405,
    un cuerpo ilegible o un error de filtro respondían sin `code` o con el
    cuerpo de Spring Boot). Códigos nuevos: 400 `IDEMPOTENCY_KEY_REQUIRED`,
    `MALFORMED_REQUEST`, `MISSING_PARAMETER`; 404 `NOT_FOUND` para una ruta
    desconocida; 405 `METHOD_NOT_ALLOWED`; 406 `NOT_ACCEPTABLE`; 415
    `UNSUPPORTED_MEDIA_TYPE`; 503 `SERVICE_UNAVAILABLE` y `DATABASE_UNAVAILABLE`;
    500 `INTERNAL_ERROR`; la campaña agregó también 422 `PASSWORD_TOO_LONG` y 409
    `EMPLOYEE_NOT_IN_SITE` (D-20261102-04, -07). El login da el mismo 401 para
    usuario inexistente, contraseña errónea o sin membresías; una contraseña
    actual errónea en `PUT /session/password` da 401 `CURRENT_PASSWORD_INVALID`,
    distinto de la sesión vencida. El `traceId` es un UUID aleatorio, sin
    correlación con logs. Detrás de Caddy, el proxy responde bajo `/api` 413
    `PAYLOAD_TOO_LARGE` y 503 `SERVICE_UNAVAILABLE` en problem+json, sin
    `traceId` (regla 34). Guarda (DNI inexistente contra contraseña errónea):
    `LoginThrottleByIpMySqlTest`, `AuthAbuseSpecTest.s16EveryLoginFailureLooksTheSame`;
    el código `CURRENT_PASSWORD_INVALID`: `LoginHardeningMySqlTest`; el caso sin
    membresías (401 neutro, cuenta en el límite por DNI y no en el de IP):
    `LoginHardeningMySqlTest.correctPasswordWithoutActiveMembershipsIsANeutral401CountedOnlyOnTheDniThrottle`;
    el contrato: `EndpointContractSpecTest.s11ApplicationErrorsAreProblemJsonWithCodeAndTraceId`,
    `.s11SecurityFilterProblemsCarryATraceId`, `.s11FrameworkErrorsAreProblemJsonWithCode`,
    `.s12EveryCodeTheBackendEmitsIsDocumentedOrOnTheShrinkingList`,
    `ErrorContractSpecTest.s73EveryMalformedRequestIsAProblemWithCodeAndTraceId`
    y `ApiExceptionHandlerTest`.
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
    `IT.journeyDatesDoNotDependOnJvmDefaultTimeZone`). **La hora del servidor sale
    de un único bean `Clock`** (`config/TimeConfiguration`, `Clock.systemUTC()`
    en producción), inyectado en todos los servicios, controladores y jobs; los
    tests lo reemplazan para simular días (2026-11-01: había 33 `Instant.now()` en
    15 archivos y no se podía simular el paso del tiempo). La única excepción es el
    vencimiento de sesión de Spring Session, que usa su propio reloj. Guarda:
    `NoWallClockInMainSourcesTest` (ninguna llamada al reloj del sistema fuera de
    `TimeConfiguration`), `ClockSpecTest`. La zona de una sede es un id IANA
    con forma Área/Lugar (contiene `/`, no está bajo `Etc/`): `UTC`, `GMT`, `EST`,
    `Etc/GMT+3` y los desplazamientos fijos se rechazan con 422 (D-20261102-05,
    PR #90; 2026-11-02: se aceptaba cualquier `ZoneId`, también `-03:00`). Jornada
    nocturna y horario de verano tienen guarda desde el 2026-11-02 (campaña #72;
    antes ningún test): `TimeZoneSpecTest.s68SantiagoFallsBackInApril2027AndSpringsForwardInSeptember`,
    `.s68SantiagoJornadasAroundTheFallBackKeepTheirLocalDateAndFollowTheWallClock`,
    `.s69AnOvernightShiftIsMarkedAcrossMidnightAndStaysOnItsStartDate`,
    `.s69TheAbsenceJobUsesTheOvernightStartAndNotTheLocalDate`,
    `.s70BlockTimesInAGapOrOverlapResolveLikeJavaTimeForDeclarationAndTheAbsenceJob`,
    `.s71AFixedOffsetIsRejectedAsASiteZone`. Aceptado (D-20261102-10): un turno
    dura su tramo de reloj de pared y un horario en el hueco o el solapamiento
    del cambio de hora se resuelve como `LocalDateTime.atZone`, sin aviso.

### Configuración y despliegue

29. **Un proceso con configuración inválida no arranca**: cubierto para las
    claves de cifrado y VAPID, el proxy de confianza y la cookie (regla 22) y el
    bootstrap del primer `ADMIN` (contraseña y zona desde el 2026-11-02);
    `BrajaProperties` no usa `@Validated`. Guarda: `BrajaPropertiesValidationTest`,
    `SessionCookieSecurityStartupTest`, `BootstrapAdminValidationTest`. Del lado
    del deploy, `deploy/deploy.sh` se niega a seguir sin Docker, sin
    `deploy/.env` en modo 600, sin `BRAJA_DOMAIN`, con cambios sin commitear, con
    menos de 3 GB libres o con un compose inválido
    (`[sin guarda: implementado, sin test]`). Que no haya otra propiedad sin
    validar no lo prueba nada.
30. **Backend y jobs comparten imagen y un único bloque de entorno.** Los jobs
    son `@Scheduled` dentro del backend, que en producción es una sola imagen
    (`backend/Dockerfile`) con un solo `env_file` (`deploy/.env`) en
    `deploy/docker-compose.yml` (2026-11-02, PR #92). El `docker-compose.yml` de
    la raíz solo define el MySQL 8.4 de desarrollo.
    `[sin guarda: implementado, sin test]`
31. **Imágenes versionadas por sha, publicadas solo con CI verde en `main`.**
    `deploy.sh` construye `braja-backend:<sha>` y `braja-caddy:<sha>` (12
    caracteres de `git rev-parse`) en el propio servidor y guarda la anterior
    para el rollback (2026-11-02, PR #92). Destino que falta: no hay registro de
    imágenes ni CI que las publique, y el deploy no comprueba que el commit esté
    en `main` con CI verde; solo exige un checkout sin cambios
    (`deploy/README.md` lo pide como paso manual). `[sin guarda: destino]`
32. **Deploy por script, nunca a mano**: `deploy/deploy.sh` (2026-11-02, PR #92)
    hace preflight, construye las imágenes, levanta MySQL, toma un backup antes
    de migrar (Flyway migra al arrancar el backend, así que el backup siempre
    precede a la migración), arranca, espera hasta 5 min a que
    `GET /api/v1/health` responda `{"status":"UP"}` a través de Caddy con
    certificado válido y, si no, vuelve solo a las imágenes anteriores sin
    deshacer la migración (regla 20). Destino que falta: no hay backend nuevo al
    lado del viejo (el contenedor se reemplaza y hay un corte mientras arranca),
    ningún test automático corre los scripts y nunca se corrió en un VPS (solo
    la prueba local de `deploy/README.md`). `[sin guarda: implementado, sin test]`
33. **El VPS se opera con scripts versionados**: `bootstrap-vps.sh` (Docker,
    swap, ufw con 22/80/443, actualizaciones de seguridad, usuario `braja`),
    `backup.sh` (dump comprimido, modo 600, 14 días; copia fuera del servidor
    opcional con `BRAJA_BACKUP_OFFHOST_CMD`, D-20261102-12), `restore.sh` (pide
    confirmación y hace antes un backup de seguridad); healthchecks de MySQL y del
    backend y `restart: unless-stopped` en los tres contenedores (2026-11-02, PR
    #92). Destino que falta: no hay VPS (lo paga Braja, D-20261014-10; las
    credenciales las tiene Mateo), el cron del backup diario se instala a mano
    (`deploy/README.md` §8), la copia fuera del servidor no está configurada,
    los reinicios no tienen tope (Docker solo espacia los reintentos) y no hubo
    un simulacro de restauración. `[sin guarda: destino]`
34. **Los errores de Caddy bajo la API respetan el formato JSON de la API**,
    sin redirects de barra final. `deploy/caddy/Caddyfile` (2026-11-02, PR #92)
    pasa `/api` y `/api/*` al backend sin reescribir la ruta ni redirigir la
    barra final, limita el cuerpo a 1 MB y en `handle_errors` responde bajo
    `/api` 413 `PAYLOAD_TOO_LARGE` y, ante cualquier otro error propio (backend
    caído o reiniciando), 503 `SERVICE_UNAVAILABLE` con `Retry-After: 30`, los dos
    en problem+json con `code` y un `traceId` aleatorio (`{http.request.uuid}`). Un asset faltante es 404, no
    `index.html`. La imagen corre `caddy validate` al construirse; ningún test
    pide esas respuestas. `[sin guarda: implementado, sin test]`

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
    Al 2026-11-02 la única excepción del backend es
    `DeviationService.reconcile`, con 107 líneas (53 a 159; ≈100 al 2026-10-19),
    según un recorrido aproximado de `backend/src/main/java` por métodos que
    empiezan con sangría de 4 espacios; el frontend no se midió. Es deuda, no
    permiso: ante una validación nueva se extrae, no se apila.
    `[sin guarda: destino]`

## 6. Qué cuenta como verde (y qué no)

- **Verde contra H2 no prueba nada de concurrencia, locks, índices únicos ni
  `SKIP LOCKED`.** Los tests de integración (`IT`, `Outbox`, `Baja`, `Campaign`)
  corren contra MySQL 8.4 real con Testcontainers, en CI y en local. Todo cambio que
  toque marcas, estados, aislamiento entre empresas, jobs o migraciones lleva
  su prueba ahí.
- **El endpoint de marca tiene prueba de ráfaga**: N marcas idénticas a la
  vez (mismo `Idempotency-Key`) → 1 marca creada y N-1 respuestas
  idempotentes; N marcas distintas sobre el mismo empleado a la vez → 1 éxito,
  N-1 conflictos, cero 5xx. Al 2026-10-28 existen las dos: la primera con 2
  hilos (`IT.identicalConcurrentRetries…`) y la segunda con 5
  (`IT.fiveDistinctConcurrentPauseRequests…`, PR #26). Desde el 2026-11-02 las
  dos corren también con 20 hilos
  (`LockOrderSpecTest.s62TwentyIdenticalRetriesMakeOneMarkAndTwentyDistinctActionsAcceptOneAndConflictNineteen`),
  y `QueryCountSpecTest.s66AThousandMarkRequestsInOneSimulatedMinuteAnswerOnlyExpectedCodesAndCreateNoExtraMark`
  manda 1000 pedidos de marca en un minuto simulado.
- **Un bug de producción se reproduce con un test antes de arreglarse**, con
  fecha y síntoma en el comentario.
- **Un pipe a `tail` esconde el exit code.** Los comandos del gate se
  encadenan sin pipe, o se lee `$?` del que importa. (Shifty, 2026-09-11:
  errores de tipos pasaron tres fases así.)
- **Gate antes de cada push**, sin pipes: `cd backend && ./mvnw verify`
  (Windows: `.\mvnw.cmd verify`) y
  `cd frontend && npm ci && npm run lint && npm run typecheck && npm test &&
  npm run build && npm run audit:prod`. `npm run build` también ejecuta
  `tsc -b`. No hay Spotless. Desde el 2026-11-02 el `./mvnw verify` local
  corre también la campaña (`pom.xml`: `junit.excludedGroups` vale
  `simulation` por defecto), con la simulación de 7 días
  (`SimulationSpecTest`); la de 90 días (`Simulation90DaysTest`) corre solo con
  `./mvnw -B verify -P simulation` (unos 53 min según la corrida de la campaña,
  dato informado y no medido en esta verificación) o cuando `-Dtest` la nombra.
- **CI es la verdad.** Si local pasa y CI falla, la diferencia es el bug.
  `.github/workflows/ci.yml` corre en `pull_request` y en `push` a `main`
  (`permissions: contents: read`; cancela corridas previas de la misma ref).
  Jobs (revalidados el 2026-11-02): `backend`, "Backend (Java 21 + MySQL 8.4)"
  (Temurin 21, `./mvnw verify -B -Djunit.excludedGroups=campaign,simulation`;
  Testcontainers levanta MySQL 8.4 con el Docker del runner; 20 min),
  `backend-campaign`, "Backend campaign (MySQL 8.4)" (`./mvnw verify -B
  -Djunit.groups=campaign`: las suites de la campaña y la simulación de 7 días,
  sin la de 90; 20 min), y `frontend`, "Frontend (Node 24)" (`npm ci`,
  `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
  `npm run audit:prod`, que corre `npm audit --omit=dev` con la política de
  §5.39; 15 min). **Checks requeridos**: `main` exige "Backend (Java 21 +
  MySQL 8.4)" y "Frontend (Node 24)" (D-20261019-06; `gh api
  repos/mateoscns/Braja-Ingreso-Egreso/branches/main/protection`, 2026-11-02,
  `strict: false`), sin costo porque el repo es público (D-20261019-02).
  **"Backend campaign" no es requerido**: un PR puede fusionarse con la campaña
  en rojo. Hacerlo requerido es una decisión de Mateo, pendiente (§7).
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
    (`@Transactional`). Al 2026-11-02 los dos controladores solo leen: el alta
    de sede también vive en un servicio (`OrganizationService.createSite`).
  - `openapi.yaml` es manual (no hay springdoc). Desde el 2026-11-02
    `EndpointContractSpecTest` compara con el código las rutas
    (`.s9EveryBackendRouteIsDocumentedAndEveryDocumentedRouteExists`), los
    estados (`.s10EveryStatusTheMatrixSeesIsDocumented`) y los códigos
    (`.s12EveryCodeTheBackendEmitsIsDocumentedOrOnTheShrinkingList`); los
    esquemas y los campos no los compara ningún test.
- **Ya cubierto** (2026-10-19): reintentos idénticos concurrentes;
  transiciones de jornada; ventana de ingreso de 30 min (D-20261016-05);
  `MARCA_FALTANTE` y su cierre o reemplazo por `EGRESO_TARDIO`
  (D-20261018-01, D-20261019-01); baja de empleado; ubicación y purga a 90
  días; CSRF, cookie `HttpOnly` y `Secure` por defecto con guarda de arranque;
  agrupación, reintento y payload del push; CI con tests en MySQL 8.4 real.
  Desde el 2026-11-02 (campaña #72, PR #85), suites por especificación contra
  MySQL real y una simulación de 7 días en CI y de 90 días a mano (§6), con
  sus techos que solo bajan (§3).
- **Falta todavía** (inventario revalidado sobre la rama de integración
  `0be9c05` el 2026-11-02):
  - Operación: no hay VPS ni dominio, y la pila de `deploy/` nunca corrió en un
    servidor real (reglas 31 a 34); no hubo simulacro de restauración; la copia
    de backups fuera del servidor no está configurada; no hay RTO ni checklist
    de release (§8). Lo que sigue a cargo de Mateo está en `docs/PENDIENTES.md`.
  - Web Push en un iPhone real (regla 38); acuerdo escrito con Braja sobre reuso
    del código con otros clientes.
  - Issue #71 (asignado a Enrique, sin `status:approved` al 2026-11-02):
    restaurar los checks requeridos del frontend. Issue #83 (asignado a Mateo, en
    curso): `pushsubscriptionchange` en `sw.ts` y los mensajes de
    `PASSWORD_TOO_LONG` y `EMPLOYEE_NOT_IN_SITE` en la PWA.
  - El job "Backend campaign" no es un check requerido (§6).
  - Agregar reglas ESLint para límites entre capas, ciclos y exports sin uso
    (35), y una prueba arquitectónica para proteger la separación
    contenedor/render (36).
  - Geocerca: el `SKIP LOCKED` de la edición de sede falla abierto (regla 11,
    D-20261102-01): una jornada declarada durante el cambio y tomada por otra
    transacción en ese instante conserva la geocerca anterior, sin aviso a nadie.
  - `openapi.yaml`: ningún test compara esquemas ni campos con el código (arriba).
  - Comportamientos aceptados como están (D-20261102-10, lista con sus tests en
    `docs/ESPECIFICACION.md`, "Comportamientos aceptados"). Otros que la campaña
    marca como CHAR no tienen todavía fila en `docs/DECISIONES.md` (2026-11-02):
    el cuerpo de los pedidos no tiene tope en el backend (Caddy lo limita a
    1 MB; `AuthAbuseSpecTest.s23ANewPasswordIsAtMost72Utf8BytesAndBodiesHaveNoSizeCap`);
    una mutación anónima con un token CSRF anónimo válido da 401
    `UNAUTHORIZED` (`EndpointContractSpecTest`); un id de ruta o un parámetro que
    no se puede leer da 422 y no 400 ni 404 (`ErrorContractSpecTest`); el
    reintento de una clave de idempotencia se resuelve antes de mirar si la
    jornada se canceló (`MarkStateMachineSpecTest`); los nombres de sede viajan en
    el payload del push (`NotificationSpecTest`); la purga a 90 días conserva
    `location_received_at` (`PrivacySpecTest`).
  - El alta con un DNI existente filtra estado de la cuenta a otra empresa:
    `OrganizationService.createEmployee` responde `ACCOUNT_INACTIVE` para una
    cuenta inactiva; al agregar una cuenta activa ya existente, devuelve su DNI
    y `mustChangePassword`. `OrganizationController` delega la operación. Del
    mismo modo, `PasswordResetService` responde 409 `ACCOUNT_SHARED` si la
    cuenta tiene una membresía en otra empresa o un rol `ADMIN`: no dice cuál,
    pero le revela al `ADMIN` que la persona está en otra empresa
    (D-20261027-09, 2026-10-27).
  - Con conocer un DNI se puede bloquear esa cuenta (21); el límite por IP
    existe (100 fallos en 15 min, D-20261027-05) pero no evita eso.
  - Push (advertencias abiertas de las revisiones del 2026-10-27; el código
    sigue igual el 2026-11-02): `sw.ts` no escucha
    `pushsubscriptionchange` (issue #83), así que una suscripción que el
    navegador renueva no se vuelve a registrar; una suscripción que el proveedor
    rechaza siempre con un 4xx distinto de 404 y 410 no se borra: se reintenta
    hasta `DEAD` (regla 12).
  - Declaración por lote (PR #65; advertencia de revisión abierta, 2026-10-28):
    hasta 200 empleados × 31 días (`JornadaDeclarationService.MAX_BULK_EMPLOYEES`,
    `MAX_BULK_DAYS`) se crean en una sola transacción (`declareBulk`), que
    retiene los locks de las plantillas (`FOR SHARE`) y de las jornadas
    insertadas hasta el commit; un lote grande demora a quien espere esas filas.
  - Volver a una imagen anterior a V11 exige antes la reversa completa de V11
    (regla 19). Un primer deploy sobre una base vacía no la necesita.
  - No existe `.githooks`: no hay gate local (abajo y §8).
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
  - 2026-10-30, PR #69: geocerca de sedes (issue #67; D-20261027-12,
    D-20261029-01, D-20261030-01, D-20261030-02).
  - 2026-11-02, campaña de pruebas previa a producción (issue #72). Los PRs
    están abiertos y apilados al 2026-11-02; cada ítem se da por cerrado al
    fusionarse:
    - PR #84: un único bean `Clock` (regla 28).
    - PR #85: la campaña, sus suites, la simulación de 7 y 90 días y el job de CI
      "Backend campaign" (§6).
    - PR #86 (#80): el historial de una jornada conservaba las 500 entradas más
      viejas (regla 6, D-20261102-09).
    - PR #87 (#75): N+1 en `/employees`, `/templates` y `/jornadas/mine`
      (regla 17).
    - PR #88 (#73): errores sin `code`, con el cuerpo de Spring Boot o sin
      `traceId` en los filtros (reglas 24 y 26, D-20261102-11).
    - PR #89 (#78): jobs sin cota de fecha y push por días viejos (reglas 8 y 14,
      D-20261102-02, -03).
    - PR #90 (#79): contraseñas hasta 256 caracteres con BCrypt cortando en 72
      bytes, zonas de desplazamiento fijo, plantilla inactiva y empleado fuera de
      la sede con códigos distintos en declaración individual y por lote, y
      `login_throttles` sin purga (reglas 15, 21 y 28; D-20261102-04 a -08).
    - PR #91 (#77): la geocerca juzgaba la precisión sin redondear, se perdía el
      motivo al re-anclar en una marca pendiente y mover el centro no alcanzaba
      a las jornadas no empezadas (D-20261102-01, -14).
    - PR #92 (#81): no había Dockerfile, compose de producción, Caddy, compuerta
      de salud ni scripts de deploy y backup (reglas 30 a 34, D-20261102-12).
    - PR #93 (#76): los textos que ve el `ADMIN` no se limpiaban de controles,
      bidi ni invisibles (regla 25, D-20261102-13).
    - PR #94 (#74): deadlock de primeras marcas (S64) y declaración por lote
      contra guardado de plantilla (S63) por REPEATABLE READ (reglas 10 y 11,
      D-20261102-15).

Hueco que se repite en todos los proyectos: **el pre-commit hook solo corre
si cada clon hace `git config core.hooksPath .githooks`**. Hoy no existe
`.githooks`: no hay gate local salvo correr a mano los comandos de §6.

## 8. Compuertas de proceso

- **Pre-commit**: no existe. Destino: toolchain (JDK 21, Node 24), formato,
  lint y tipos de back y front, cero warnings.
- **CI**: existe lo de §6. No existen formato (Spotless, Prettier), escaneo de
  secretos, SAST ni cobertura.
- **Todo cambio de endpoint actualiza `openapi.yaml` en el mismo commit.** Se
  escribe a mano. Desde el 2026-11-02 una ruta, un estado o un código que el
  backend emite sin estar documentado hace fallar `EndpointContractSpecTest`
  (§7); un esquema o un campo distinto no lo detecta ningún test
  `[sin guarda: destino]`.
- **Release checklist y runbook de backup/restore (RPO 24 h, RTO a definir)
  gatean releases**: el runbook existe desde el 2026-11-02 (`deploy/README.md`:
  deploy, backup, restauración y rollback; RPO 24 h por el backup diario,
  D-20261102-12); la checklist de release y el RTO no existen todavía. Un ítem
  sin marcar necesita excepción explícita del dueño, no un salto silencioso.
  El deploy toma un backup nuevo antes de cada migración (`deploy/deploy.sh`,
  regla 32); no mira la antigüedad de un backup anterior.
- **Merge**: merge commit tras CI verde, fijado al commit verificado (§1).
  `main` exige los checks "Backend (Java 21 + MySQL 8.4)" y "Frontend
  (Node 24)" para fusionar (D-20261019-06); "Backend campaign" no es requerido
  (§6).

## 9. Arranque (checklist de este proyecto)

1. [x] Repo con `backend/`, `frontend/`, `docs/` (PR #2, v1); `docs/` tiene
   `ESPECIFICACION.md`, `DECISIONES.md`, `ARQUITECTURA.md` y `PENDIENTES.md`;
   `openapi.yaml` en la raíz.
2. [x] El dueño adoptó las 66 filas de `docs/DECISIONES.md` (adopciones del
   2026-10-14 al 2026-11-02; las 15 del 2026-11-02, D-20261102-01 a -15, con su
   aprobación general de ese día al plan de producción, que puede vetar fila por
   fila).
3. [ ] Portar `DecisionesDelDuenoTest` (frases de atribución sin ID → falla).
4. [~] Toolchain: Java 21 y Node 24 fijados en CI (PR #4) y en las imágenes de
   `deploy/` (`eclipse-temurin:21`, `node:24`). Los `<…>` de este archivo se
   completaron con lo real, salvo el sha de `main` tras el merge (encabezado y
   §9.6); quedan RTO y el dominio.
5. [~] Sacar `[sin guarda]` regla por regla (2026-11-02). Con guarda: 1, 2, 4,
   5, 6, 7, 8, 10, 11 (los pares de escrituras de `LockOrderSpecTest`), 12,
   13, 14, 17, 19, 21, 22, 24, 26, 28 y la máquina de estados; parcial: 9
   (`company_id` en cada consulta), 15 (no se revisó parámetro por parámetro),
   18 (normalización), 23 (último `ADMIN`), 25 (un campo nuevo sin
   `HostileText`), 27 (front), 29, 35 (reglas para capas, ciclos y exports), 37
   y 39 (cobertura). Implementadas sin test: 30, 32 y 34. Siguen sin guarda: 3,
   16, 20, 31, 33, 36 (separación contenedor/render), 38 y 40.
6. [x] Primera verificación completa del archivo contra el código:
   2026-10-20, sobre `main` en `5e61d0a5bb6b81c26603f42e9093bf85e9baab4a`.
   Segunda: 2026-10-28, sobre `main` en
   `f3c96357b9b0e40a29b56880ca8c1850ca6a6481`. Tercera: 2026-11-02, sobre la
   rama de integración `0be9c05` de los PRs #84 a #94; al fusionarse, `main` en
   `<sha de main tras el merge>`. Se repite al cerrar cada hueco de §7.
