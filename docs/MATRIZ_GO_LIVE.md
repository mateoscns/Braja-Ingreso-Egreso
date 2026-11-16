# Matriz de QA de punta a punta: go-live de Fichaje Braja

- Tarea: T14, spec S10 (`odd/tasks/go-live.md`).
- Fecha: 2026-11-15, entre 20:00 y 20:45 UTC.
- Commit probado: `8f12d28`, en un worktree aparte y desacoplado (no es el árbol `braja-wt-go-live`).
- Alcance del commit: `8f12d28` es anterior a `b5ccc74` (bootstrap y `gen-secrets.sh`) y a `d737195` (`backup.sh`, `restore.sh`, `deploy.sh`, `lib.sh`). `docker-compose.yml`, `deploy/caddy/`, `backend/` y `frontend/` no cambiaron después, así que las filas B, D y F valen para el head del PR #179; los scripts nuevos se verificaron en contenedores al escribirlos y en la revisión independiente (T15).
- Máquina: Windows 11, Docker 29.8.0, OpenJDK 21.0.11, Node 24.16.0, npm 11.13.0.
- Pila local: proyecto Docker `braja-golive-qa`, imágenes `braja-backend:golive-qa` y `braja-caddy:golive-qa`, red `172.31.97.0/24`, puertos 18080 y 18443, `BRAJA_DOMAIN=localhost` (CA interna de Caddy).
- Configuración: `.env` descartable generado con `deploy/gen-secrets.sh --env-file <scratch>`. No se abrió `deploy/.env` y no se imprimió ningún secreto.
- Datos: todos falsos (DNI 99000001 a 99000003, empresa «QA Empresa Prueba»).
- Regla: un PASS lleva evidencia observada. Lo que no se ejecutó figura como NOT TESTED.

## Resumen

| Resultado | Cantidad |
|---|---|
| PASS | 84 (B 7, D 23, F 33, N 1, R 20) |
| FAIL | 0 |
| NOT TESTED | 10 filas: 5 de infraestructura o navegador (I-01 a I-03, I-05 e I-06), 4 de backups en el VPS (R-21 a R-24) y la fila M-1 a M-14 (las 14 pruebas físicas) |

Las filas R (backups y restauración) se agregaron el 2026-11-15 con las pruebas de los scripts finales; reemplazan a la antigua I-04, que figuraba NOT TESTED porque esos scripts se estaban escribiendo.

Hubo dos fallas en la primera corrida del flujo (F-03 y F-12), pero las dos eran errores del script de prueba, no de la aplicación:

- **F-03**: el script sobrescribía el token falso con el válido, así que el pedido salió con CSRF correcto.
- **F-12**: el script llamó a `/jornadas/mine` sin el parámetro obligatorio `localDate`.

Se corrigió el script, se volvieron a correr las dos pruebas y quedaron en PASS. La evidencia de las dos corridas está en la tabla.

## Matriz

| ID | Área | Prueba | Resultado | Evidencia (comando y salida resumida) |
|---|---|---|---|---|
| B-01 | Backend | `./mvnw -B verify`: tests Java, campaña completa y simulación de 7 días contra MySQL 8.4 (Testcontainers) | PASS | `cd backend && ./mvnw -B verify` → `Tests run: 699, Failures: 0, Errors: 0, Skipped: 0`, `BUILD SUCCESS`, `Total time: 29:09 min`, `EXIT=0`. Corrieron, entre otras, `LockOrderSpecTest` (74), `OrganizationSpecTest` (81), `GeofenceSpecTest` (33), `MigrationSpecTest` (8), `simulation.SimulationSpecTest` (1) y `simulation.DeviationOracleTest` (29). Imagen `tc.mysql:8.4`. La simulación de 90 días no corre por defecto (`-P simulation`, CLAUDE.md §6) y no se corrió. |
| B-02 | Frontend | `npm ci` | PASS | `EXIT=0`; `added 491 packages, audited 492`. npm informa `13 vulnerabilities (4 low, 9 moderate)`, contando las dependencias de desarrollo; la compuerta de producción es B-07. |
| B-03 | Frontend | `npm run lint` | PASS | `eslint . --max-warnings 0` → `EXIT=0` |
| B-04 | Frontend | `npm run typecheck` | PASS | `EXIT=0` |
| B-05 | Frontend | `npm test` | PASS | `Test Files 57 passed (57)`, `Tests 1266 passed (1266)`, `EXIT=0` |
| B-06 | Frontend | `npm run build` | PASS | `EXIT=0`; `PWA v2.0.0`, `precache 19 entries (674.43 KiB)` |
| B-07 | Frontend | `npm run audit:prod` | PASS | `EXIT=0`; `npm audit --omit=dev: no advisories outside the dated exceptions.` Única excepción vigente: `GHSA-gcqx-w48m-w2h4` (deepmerge, baja, vence el 2027-01-31). |
| D-01 | Deploy | `docker compose config` válido con el `.env` descartable | PASS | `docker compose -p braja-golive-qa -f deploy/docker-compose.yml --env-file <qa.env> config -q` → `EXIT=0` |
| D-02 | Deploy | Build de las imágenes de producción | PASS | `docker compose ... build` → `EXIT=0`; `braja-backend:golive-qa` 333 MB y `braja-caddy:golive-qa` 67.1 MB |
| D-03 | Deploy | Arranque de la pila desde una base vacía | PASS | `docker compose ... up -d` → `EXIT=0`; `/api/v1/health` responde `200 {"status":"UP"}` a los ~18 s; `mysql Up (healthy)` |
| D-04 | Deploy | Migraciones Flyway en la base vacía | PASS | Log del backend: `Successfully applied 27 migrations to schema braja, now at version v29`. `flyway_schema_history`: 27 filas, 0 fallidas, última versión 29. Hay un WARN informativo: `Flyway upgrade recommended: MySQL 8.4 is newer than this version of Flyway ... latest supported version of MySQL is 8.1`. |
| D-05 | Deploy | Creación del primer `ADMIN` (bootstrap) | PASS | Base: `companies` = 1 («QA Empresa Prueba»), 1 membresía `ADMIN`, sede «QA Sede Bootstrap» en `America/Argentina/Buenos_Aires`; `bootstrap_guard.consumed_at = 2026-11-15 20:35:13`. Login: ver F-01. |
| D-06 | Deploy | Salud a través de Caddy con TLS verificado | PASS | `curl --ssl-no-revoke --cacert <raíz de la CA interna de Caddy> https://localhost:18443/` → 200 y `hostname (localhost) validated against certificate name`. Sin `--ssl-no-revoke`, el curl de Windows (Schannel) falla con exit 60 porque no puede consultar la revocación de una CA local. Es un artefacto de la prueba local; en el VPS el certificado es de Let's Encrypt. |
| D-07 | Deploy | La PWA se sirve: index, assets, service worker y manifest | PASS | `/` → 200 `text/html`, `Cache-Control: no-cache`. `/assets/index-tlGakgwq.js` → 200, `Cache-Control: public, max-age=31536000, immutable`. `/sw.js` → 200 `text/javascript` (Workbox 7.4.0). `/manifest.webmanifest` → 200 `application/manifest+json` (`"name":"Fichaje Braja"`). |
| D-08 | Deploy | Un asset faltante es 404 (no `index.html`) y una ruta de la SPA cae en `index.html` | PASS | `/assets/no-existe-qa.js` → 404; `/admin/configuracion` → 200 `text/html` (`<!doctype html> <html lang="es-AR">`) |
| D-09 | Deploy | Cabeceras de seguridad de Caddy | PASS | En `/`: `Strict-Transport-Security: max-age=31536000`, `Content-Security-Policy: default-src 'self'; ... img-src 'self' data: https://tile.openstreetmap.org ...`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `Permissions-Policy: geolocation=(self), ...`, `Cross-Origin-Opener-Policy: same-origin`. No hay cabecera `Server`. |
| D-10 | Deploy | Una ruta desconocida de la API responde en problem+json | PASS | `/api/v1/no-existe` sin sesión → 401 `application/problem+json`, `"code":"UNAUTHORIZED"` con `traceId` |
| D-11 | Deploy | Configuración pública | PASS | `/api/v1/public-config` → 200 `{"pushEnabled":true,"vapidPublicKey":"BE1e..."}`; solo la clave pública VAPID |
| D-12 | Deploy | MySQL y backend no publican puertos al host | PASS | `docker port`: mysql y backend sin puertos; caddy solo `80/tcp -> 0.0.0.0:18080`, `443/tcp -> 0.0.0.0:18443` y `443/udp -> 0.0.0.0:18443` (solo IPv4) |
| D-13 | Deploy | HTTP redirige a HTTPS | PASS | `http://localhost:18080/` → 308. El destino `https://localhost/` pierde el puerto 18443, cosa que solo pasa con puertos no estándar; en el VPS se usan 80 y 443. |
| D-14 | Deploy | Caddy responde 503 en problem+json con el backend detenido | PASS | `docker compose ... stop backend`, luego `GET /api/v1/health` → `HTTP/1.1 503`, `Content-Type: application/problem+json`, `Retry-After: 30`, `{"...","status":503,...,"code":"SERVICE_UNAVAILABLE","traceId":"5a090b8f-..."}`. La PWA (`/`) sigue en 200. |
| D-15 | Deploy | Caddy responde 413 en problem+json ante un cuerpo de más de 1 MB | PASS | POST de 1,1 MB a `/api/v1/session` con token CSRF válido → `413 application/problem+json`, `"code":"PAYLOAD_TOO_LARGE"`. Sin token CSRF el backend rechaza antes de leer el cuerpo (401 `SESSION_EXPIRED`), y con el backend caído responde 503: es lo esperado. |
| D-16 | Resiliencia | Reinicio con el bootstrap todavía activo: no vuelve a crear la empresa | PASS (con observación O-1) | `docker compose ... start backend` sin apagar el bootstrap → `java.lang.IllegalStateException: First-admin bootstrap is available only once on an empty database`. El backend entra en un ciclo de reinicios (`restarts=8` en ~70 s) y `/api/v1/health` responde 503. La base queda igual: `companies=1`, `accounts=3`. No se creó una segunda empresa. |
| D-17 | Resiliencia | El backend vuelve con el bootstrap apagado (lo que hace `disable_bootstrap` de `deploy.sh`) | PASS | En el `.env` descartable: `BRAJA_BOOTSTRAP_ENABLED='false'` y la contraseña vacía. `docker compose ... up -d backend` → `{"status":"UP"}` a los ~12 s, `restarts=0`. |
| D-18 | Resiliencia | `docker compose restart backend` conserva los datos | PASS | R1: UP a los ~12 s; `companies=1 accounts=3`; login del ADMIN 200; las mismas 3 sedes y los mismos empleados; la jornada sigue `EGRESADA` con `INGRESO,SALIDA_DESAYUNO,VUELTA_DESAYUNO,EGRESO`; auditoría con 3 entradas. Log: `Schema braja is up to date. No migration necessary.` |
| D-19 | Resiliencia | `docker compose restart` de toda la pila conserva los datos | PASS | R2: mismos resultados que R1; `companies=1` |
| D-20 | Resiliencia | `docker compose stop` y después `up -d` conservan los datos (sin `down -v`) | PASS | R3: tras el `stop`, `backend exited caddy exited mysql exited`; tras el `up -d`, UP a los ~12 s, `companies=1 accounts=3` y los mismos datos |
| D-21 | Resiliencia | `restart: unless-stopped`: el backend vuelve solo si su proceso termina | PASS | La política es `unless-stopped` en los tres contenedores. `docker exec backend sh -c 'kill -TERM 1'` → a los 6 s `status=running restarts=1` |
| D-22 | Resiliencia | MySQL vuelve solo si su proceso termina, y el backend se recupera | PASS | R5: `kill -TERM 1` en mysql mientras el backend arrancaba → `mysql restarts=1`. El backend falló una vez (Flyway: `Communications link failure`) y Docker lo reinició; UP a los ~6 s y los mismos datos. R6, con el backend ya arriba: `kill -TERM 1` en mysql → UP a los ~4 s **sin reiniciar el backend** (`backendRestarts=2` antes y después). Hubo dos `Unexpected error occurred in scheduled task` (`CannotCreateTransactionException`) mientras MySQL estaba caído, y 0 ERROR o WARN en el minuto siguiente. |
| D-23 | Resiliencia | Reloj del contenedor | PASS | `date -u` del host 20:42:45 = backend 20:42:45; `acceptedAt` de las marcas en UTC (`...Z`). En el VPS se verifica con `timedatectl` (NOT TESTED, I-03). |
| F-01 | Negocio | Login del ADMIN por la API real | PASS | `POST /api/v1/session` → 200, `role=ADMIN`, `company="QA Empresa Prueba"`, `mustChangePassword=false`; cookie `HttpOnly`, `Secure` y `SameSite=Lax` |
| F-02 | Negocio | El ADMIN ve la sede del bootstrap | PASS | `GET /sites` → 200, `QA Sede Bootstrap` |
| F-03 | Seguridad | Una mutación con CSRF inválido o ausente se rechaza | PASS (en la segunda corrida) | Primera corrida: 201, por el error del script explicado arriba; creó la sede de prueba «QA sin csrf» con un token válido. Segunda corrida (`recheck.mjs`): token falso → `403 FORBIDDEN application/problem+json`; sin cabecera → `403 FORBIDDEN`; no se creó ninguna sede «QA no debe crearse» (las sedes siguen siendo 3). |
| F-04 | Negocio | Crear una sede con geocerca | PASS | `POST /sites` (lat -31.4201, lon -64.1888, `MANUAL`, radio 100) → 201, `radius=100` |
| F-05 | Negocio | Crear una plantilla de horario | PASS | `POST /templates` → 201, bloque `16:00` a `21:00`, desayuno 15 min y almuerzo 30 min |
| F-06 | Negocio | Alta de empleado con clave provisoria | PASS | `POST /employees` → 201, `mustChangePassword=true` |
| F-07 | Negocio | Declarar la jornada de hoy | PASS | `POST /jornadas` → 201, `date=2026-11-15`, `state=NO_INGRESO`, `geofenceRadius=100` |
| F-08 | Negocio | Declarar la jornada de ayer | PASS | `POST /jornadas` → 201, `date=2026-11-14` |
| F-09 | Negocio | Login del empleado con la clave provisoria | PASS | 200, `mustChangePassword=true` |
| F-10 | Seguridad | Con la clave provisoria no se puede marcar | PASS | `POST /jornadas/{id}/marks` → `403 PASSWORD_CHANGE_REQUIRED` |
| F-11 | Negocio | Cambio de la clave provisoria | PASS | `PUT /session/password` → 204 |
| F-12 | Negocio | El empleado ve su jornada del día | PASS (en la segunda corrida) | Primera corrida: `400 MISSING_PARAMETER`, porque el script no mandó `localDate`. Segunda: `GET /jornadas/mine?localDate=2026-11-15` → 200, `count=1`, `ownJornada=true`, `state=NO_INGRESO` (empleado 2, recién creado). |
| F-13 | Fichaje | INGRESO con ubicación dentro de la geocerca | PASS | 201, `acceptedAt=2026-11-15T20:36:35.992060Z` (hora del servidor), `seq=1`; `POST /marks/{id}/location` → `202 RECIBIDA` |
| F-14 | Fichaje | El reintento idempotente devuelve la misma marca | PASS | Mismo `Idempotency-Key` → 200 y el mismo id |
| F-15 | Fichaje | Un segundo INGRESO se rechaza | PASS | `409 INVALID_MARK_TRANSITION` |
| F-16 | Fichaje | Una marca sin `Idempotency-Key` se rechaza | PASS | `400 IDEMPOTENCY_KEY_REQUIRED` |
| F-17 | Fichaje | Inicio de pausa (SALIDA_DESAYUNO) con ubicación | PASS | 201, `seq=2`, ubicación `202 RECIBIDA` |
| F-18 | Fichaje | Regreso de pausa (VUELTA_DESAYUNO) con ubicación | PASS | 201, `seq=3`, ubicación `202 RECIBIDA` |
| F-19 | Fichaje | EGRESO con ubicación fuera de la geocerca | PASS | 201, `seq=4`, ubicación `202 RECIBIDA` (unos 1,1 km al sur del centro) |
| F-20 | Historial | El ADMIN ve el historial con las marcas y el estado | PASS | `GET /jornadas?...&includeDetail=true` → 200, `state=EGRESADA`, 4 marcas `RECIBIDA` |
| F-21 | Geolocalización | Un EGRESO fuera de la sede genera FUERA_DE_SEDE | PASS | Desvíos: `LLEGADA_TARDE`, `EGRESO_TEMPRANO` y `FUERA_DE_SEDE`, todos `MOTIVO_PENDIENTE`. La llegada tarde y el egreso temprano son esperables: la plantilla empezaba una hora antes y el egreso fue al minuto. |
| F-22 | Geolocalización | El ADMIN ve las coordenadas y la precisión | PASS | `GET /marks/{egreso}` → `lat=-31.4301`, `acc=10`, `RECIBIDA` |
| F-23 | Privacidad | El empleado no recibe coordenadas | PASS | `GET /marks/{egreso}` como empleado → 200, `latPresent=false` |
| F-24 | Seguridad | El empleado no accede a rutas del ADMIN | PASS | `GET /employees` → `403 FORBIDDEN` |
| F-25 | Correcciones | Marca olvidada INGRESO cargada por el ADMIN | PASS | `POST /admin/jornadas/{ayer}/forgotten-marks` → 201, `occurredAt=2026-11-14T19:05:00Z` |
| F-26 | Correcciones | Marca olvidada EGRESO cargada por el ADMIN | PASS | 201, `occurredAt=2026-11-14T23:00:00Z` |
| F-27 | Correcciones | Corrección de una marca por el ADMIN | PASS | `POST /admin/marks/{id}/correction` → 200, `correctedTo=2026-11-14T23:30:00Z` |
| F-28 | Correcciones | Una corrección a futuro se rechaza | PASS | `422 VALIDATION_ERROR` |
| F-29 | Auditoría | La auditoría muestra las marcas olvidadas y la corrección | PASS | `GET /admin/jornadas/{ayer}/audit` → 200, `FORGOTTEN_MARK, DEVIATION:CREATED, FORGOTTEN_MARK, DEVIATION:TYPE_REPLACED, MARK_CORRECTION`, `actor="QA Admin Prueba"`, sin coordenadas |
| F-30 | Auditoría | Auditoría de la jornada de hoy | PASS | 200, `DEVIATION:CREATED` para `LLEGADA_TARDE`, `EGRESO_TEMPRANO` y `FUERA_DE_SEDE` |
| F-31 | Seguridad | El empleado no lee la auditoría | PASS | `403 FORBIDDEN` |
| F-32 | Negocio | Bandeja del ADMIN | PASS | `GET /inbox` → 200 con `items` |
| F-33 | Sesión | El logout invalida la sesión | PASS | `DELETE /session` → 204; después `GET /session` → `401 UNAUTHORIZED` |
| N-01 | Notificaciones | El outbox encola y despacha la ventana de aviso | PASS (solo del lado del servidor) | Base: `notification_outbox_events` tiene `LLEGADA_TARDE` = 1 y `SIN_INGRESO` = 1 (jornada de ayer); `notification_windows` tiene una fila `SENT` (1 intento). `push_subscriptions` = 0, así que ningún dispositivo recibió nada. La recepción real va en P-AND-06 y P-IOS-07. |
| I-01 | Infraestructura | `deploy/deploy.sh` de punta a punta | NOT TESTED | Exige `git fetch` y `HEAD == origin/main` (operación remota que este agente no tiene permitida), estar fuera del horario del local y un certificado válido para el dominio. Se reprodujo a mano su paso de apagar el bootstrap (D-17). Lo prueba T4 en el VPS. |
| I-02 | Infraestructura | Reinicio del VPS o del demonio Docker | NOT TESTED | Reiniciar Docker afectaría a los contenedores `shifty*` y `braja-demo-*` de esta máquina. Se cubrió el reinicio de los contenedores (D-18 a D-22). Va en una ventana controlada en el VPS (FASE 4). |
| I-03 | Infraestructura | NTP o `timedatectl` en el VPS | NOT TESTED | No hay VPS (T2 y T4) |
| I-05 | Infraestructura | Monitor externo (UptimeRobot o latido) | NOT TESTED | No hay dominio público |
| I-06 | Frontend | Navegación de la PWA en un navegador (login, ADMIN, sesión, errores controlados) | NOT TESTED | No se usó un navegador; se probó la API y la entrega de los archivos. Lo cubren P-AND y P-IOS. |
| M-01 a M-14 | Dispositivos | Pruebas manuales de `docs/UX_UI_GUIDELINES.md` §10 | NOT TESTED | No hay dispositivos físicos. No se emuló un iPhone (S10). Instrucciones abajo. |

## Backups y restauración (scripts finales)

Pruebas sobre `deploy/backup.sh`, `restore.sh`, `lib.sh` y `deploy.sh` en contenedores descartables (MySQL 8.4 real, backend y Caddy reemplazados por contenedores mínimos, nunca los de `shifty*` ni `braja-demo-*`). Quién la ejecutó y sobre qué versión:

- **Agente D** (autor de los scripts), en Ubuntu 24.04 con Docker 29.1.3 y age 1.1.1, con las 29 migraciones reales y 20.003 filas, sobre la versión que quedó en `d737195` sin la copia privada de `restore.sh` que se sumó en ese mismo commit.
- **Revisión independiente (T15)**, desde Git Bash con Docker Desktop: sobre `1d9977d`, el recheck de `dddd199`, las interrupciones de `35c654a` y el recheck de `4b72dbb`, con hasta 300.000 filas.

| ID | Prueba | Resultado | Evidencia (comando y salida resumida) |
|---|---|---|---|
| R-01 | Un backup se valida cargándolo en una base descartable antes de contar | PASS | D: `backup.sh` → exit 0 en 6,8 s, 192 KB; «Restore check passed»: 27 tablas, 20.003 filas iguales a las vivas; `sha256sum -c` OK |
| R-02 | Disco lleno durante el backup | PASS | D: tmpfs de 320 KB con un backup bueno → `gzip: No space left on device`, `ERROR: the dump failed…`, exit 1, sin `.partial`; el backup anterior sigue pasando `sha256sum -c` |
| R-03 | Con MySQL caído no se borran backups viejos | PASS | D: MySQL detenido y 4 backups de 20 días → exit 1, los 4 se conservan |
| R-04 | La rotación conserva siempre los 3 más nuevos | PASS | D: la corrida buena siguiente → «Removed 2… newest 3 are always kept» |
| R-05 | Un SIGTERM a mitad del dump no deja archivos ni la base descartable | PASS | D: exit 143, `BACKUP FAILED`, 0 archivos parciales, sin base `braja_restore_check` |
| R-06 | Cifrado age con clave pública | PASS | D: con 2 destinatarios afuera solo quedan `.age` (cabecera `age-encryption.org/v1`); descifrado con cada clave = mismo sha256 que el local; clave equivocada → «no identity matched». La revisión independiente no tenía age y no lo repitió |
| R-07 | `restore.sh --check` de un `.age` | PASS | D: con `--identity` → pasa; sin `--identity`, con otra clave o con 1 byte alterado → rechazado |
| R-08 | Aviso al monitor de latido | PASS | D: un nginx local recibió `GET /ping` con éxito y `GET /ping/fail` cuando falló la copia de afuera (exit 1, el backup local se conserva) |
| R-09 | Backups y restauraciones no se pisan (lock) | PASS | D: un backup lanzado mientras una restauración esperaba confirmación → «another backup or restore is still running», exit 1. Revisión independiente: `flock` en un contenedor, la segunda corrida muere al vencer la espera |
| R-10 | `restore.sh` rechaza archivos dañados antes de tocar nada | PASS | D y revisión independiente: gzip truncado, checksum que no coincide, SQL basura con marca de fin y un backup vacío sobre una base con datos → rechazados |
| R-11 | Restauración con confirmación | PASS | D: responder «no» → «nothing was changed»; `RESTORE` → backup de seguridad, carga, «Every table has the rows of the backup (27 tables)», unos 26 s |
| R-12 | `deploy.sh --sha` | PASS | D y revisión independiente: `--sha` distinto → se detiene, también con `--force`; formato inválido o en mayúsculas → se detiene; `--rollback --sha` → se detiene; el `--sha` correcto pasa y sigue el chequeo de `origin/main` |
| R-13 | Restaurar un backup de más de 14 días | PASS | Revisión independiente, con 3 backups más nuevos: sin la copia privada (rojo) la rotación del backup de seguridad lo borraba después del `DROP` y la base quedaba vacía; con `d737195` (verde) → «Restore complete», exit 0, las filas del backup |
| R-14 | Un `.age` descargado para restaurar no se borra | PASS | Revisión independiente sobre `dddd199`: el `.age` sin su `.sql.gz` sobrevive a `backup.sh`; el `.age` sobrante junto a su `.sql.gz` y un `restore-*` suelto se borran |
| R-15 | Falla el backup de seguridad de una restauración | PASS | Revisión independiente sobre `35c654a` (`REVOKE SELECT` al usuario del dump) → «the safety backup failed; nothing was restored», el backend vuelve a `Healthy`, exit 1, filas intactas |
| R-16 | Ctrl-C (SIGINT al grupo de procesos) durante el backup de seguridad | PASS | Revisión independiente sobre `35c654a` y `4b72dbb`: «Nothing was restored; starting the backend again», `Healthy`, exit 130; filas 2 / 3 / 300.000 iguales a las de antes; sin `braja_restore_check`, `.partial` ni `restore-*`; ninguna línea `ERROR` |
| R-17 | SIGTERM durante el backup de seguridad | PASS | Revisión independiente sobre `35c654a`: exit 143, el backend vuelve a `Healthy`, filas iguales, sin sobrantes |
| R-18 | Corte después del `DROP DATABASE` | PASS | Revisión independiente sobre `4b72dbb`, SIGINT durante «Loading»: el backend **no** se levanta (`Exited`), exit 130, la base queda a medias (176.060 de 300.000) y el log dice «the restore stopped after the database was dropped…» y «Restore the safety backup of the replaced state: bash deploy/restore.sh <ruta real>». Ese comando devolvió las 300.000 filas, exit 0 |
| R-19 | Restauración completa sin cortes | PASS | Revisión independiente sobre `4b72dbb`: «Restore complete», exit 0, filas del backup, ninguna línea `ERROR` |
| R-20 | `deploy.sh`: primer deploy, versión que no queda sana y `--rollback` | PASS | Revisión independiente sobre `1d9977d` con backend y Caddy mínimos: el primer deploy apaga el bootstrap; una versión que nunca da `UP` vuelve sola («Rolled back», «no migration ran», exit 1); `--rollback` intercambia la actual y la anterior |
| R-21 | El cron del backup cada hora en el VPS | NOT TESTED | No hay VPS; la línea de cron se generó y validó en un contenedor (agente C) |
| R-22 | Copia real a Backblaze B2 y servicio de latido real | NOT TESTED | No hay bucket ni monitor creados; se usaron un directorio y un nginx locales |
| R-23 | RTO y RPO medidos (D-20261115-02) | NOT TESTED | Se miden en el primer simulacro en el VPS |
| R-24 | El backend real arrancando después de una restauración | NOT TESTED | En R-11 a R-20 el backend era un contenedor mínimo; el arranque real con Flyway está probado en D-03 y D-18 a D-22, pero no después de una restauración |

## Observaciones (no son fallas)

- **O-1. Riesgo operativo del bootstrap.** Si el backend arranca con `BRAJA_BOOTSTRAP_ENABLED=true` sobre una base que ya tiene la empresa, no arranca y queda en un ciclo de reinicios; la API responde 503 hasta que alguien lo apaga (D-16).
  - El código lo hace a propósito: `BootstrapAdminRunner.java:52-53` hace fallar el arranque para no duplicar la empresa.
  - `deploy/deploy.sh` lo evita: `disable_bootstrap`, líneas 164-172, lo apaga después de la primera salud; las líneas 235-240 lo apagan en un deploy posterior si ya hay empresa.
  - El riesgo queda en tres casos: si el primer arranque se hace con `docker compose up` a mano, si el `.env` se restaura desde una copia tomada antes del primer deploy (la copia en el gestor de contraseñas tiene que ser la de después), o si `deploy.sh` se corta entre la compuerta de salud y `disable_bootstrap`.
  - Cómo comprobarlo después del primer deploy en el VPS: `grep -c "^BRAJA_BOOTSTRAP_ENABLED='false'" deploy/.env` tiene que dar 1.
- **O-2.** Flyway avisa que MySQL 8.4 es más nuevo que lo que tiene probado (8.1). Las 27 migraciones aplicaron bien y la campaña corre sobre 8.4. Es informativo.
- **O-3.** Con MySQL caído unos segundos, los jobs registran un `ERROR Unexpected error occurred in scheduled task` por tick. Se recuperan solos (0 errores en el minuto siguiente). Sirve saberlo para leer los logs después de un corte.
- **O-4.** Una ventana de aviso queda `SENT` aunque no haya ninguna suscripción. Es coherente con D-20261102-10 (regla 12).

## Pruebas físicas: instrucciones para Mateo o Enrique

Estas pruebas no se hicieron. Cada paso deja evidencia: una captura de pantalla o un video corto, más una línea con lo que se vio, el dispositivo, el modelo, la versión del sistema y del navegador, la fecha y la hora. Un paso no hecho se anota «NO HECHO» y no se da por bueno (`docs/UX_UI_GUIDELINES.md` §10).

### Antes de empezar

1. **Dónde probar.** Hace falta HTTPS con un certificado válido; sin eso no funcionan la ubicación ni la push. Hay dos opciones:
   - **(a) El VPS de producción, antes de cargar los datos reales (recomendada).** Inmediatamente después del primer deploy, tomar `bash deploy/backup.sh` y anotar el archivo: es la base con solo el ADMIN inicial. Hacer todas las pruebas. Al terminar, restaurar ese backup con `bash deploy/restore.sh <archivo>` para no dejar datos de prueba mezclados con los reales (FASE 4: «No usar registros ficticios mezclados permanentemente»). Después de restaurar, cada teléfono tiene que volver a activar los avisos. La decisión es de Mateo.
   - **(b) El modo demo (`bash deploy/demo.sh start`).** Es la misma pila, publicada con un túnel de Cloudflare. No prueba el dominio real.
2. **Datos de prueba**, con nombres que empiecen con «QA»: una sede «QA Local» con su ubicación (marcada en el mapa, M-11) y radio de 100 m; una plantilla «QA Turno» que empiece unos 20 minutos después del momento de la prueba y dure 4 h; un empleado «QA Empleado» con DNI de prueba y clave provisoria; una jornada declarada para hoy.
3. **Equipos:** un Android con Chrome actualizado; un iPhone con muesca y iOS 16.4 o posterior (la push de una web instalada lo exige), con Safari. El ADMIN usa uno de los dos o un tercer teléfono.
4. **Planilla de evidencia:** una fila por paso con `ID | Dispositivo | Resultado (PASS/FAIL/NO HECHO) | Evidencia (archivo) | Observación`, adjunta al PR de release.

### Android (Chrome)

| ID | Paso | Qué tiene que pasar | Evidencia |
|---|---|---|---|
| P-AND-01 | Abrir `https://<DOMINIO_REAL>` en Chrome. Menú ⋮ → «Instalar aplicación» o «Agregar a la pantalla principal». Abrirla desde el ícono. | Se abre a pantalla completa, sin la barra de direcciones, con el ícono y el nombre «Braja». | Captura del ícono en la pantalla principal y de la app abierta |
| P-AND-02 | Login como «QA Empleado» con la clave provisoria; cambiarla. | Pide cambiar la clave; después muestra la pantalla del empleado con la jornada de hoy. | Captura antes y después del cambio |
| P-AND-03 | Ajustes del teléfono → Ubicación activada. En la app, tocar la marca de ingreso. Cuando Chrome pregunte, permitir la ubicación. Hacerlo **dentro del local**. | La marca se confirma con la hora del servidor (tiene que coincidir con el reloj del teléfono con un minuto de diferencia como mucho). No queda esperando la ubicación. | Captura de la confirmación con la hora |
| P-AND-04 | En el teléfono del ADMIN: «Ver en el mapa» bajo esa marca. | El punto rojo cae dentro del círculo del local; se ven la distancia y la precisión. | Captura del mapa |
| P-AND-05 | Pausa (salida y vuelta de desayuno o de almuerzo) y egreso. Hacer el egreso **a más de 200 m del local**. | Cada marca se confirma. El ADMIN ve un caso «fuera del local» de esa jornada. | Capturas de cada confirmación y de la bandeja del ADMIN |
| P-AND-06 | ADMIN en Android: activar los avisos (aceptar el permiso de notificaciones). Declarar una jornada de prueba que empiece 5 min antes y no marcar el ingreso. Bloquear el teléfono. | Llega una notificación del sistema sobre la llegada tarde o la falta de ingreso, dentro de los 5 a 10 min siguientes, con el teléfono bloqueado. Al tocarla se abre la app. | Captura de la notificación en la pantalla bloqueada, con la hora |
| P-AND-07 | Sesión persistente: cerrar la app (deslizarla en las recientes), apagar la pantalla, esperar 30 min y volver a abrirla. Repetir al día siguiente. | El empleado sigue con la sesión iniciada (regla 23: 30 días para un empleado). El ADMIN vuelve a pedir clave tras 30 min sin uso. | Captura al reabrir, con la hora |
| P-AND-08 | Reconexión: activar el modo avión, intentar marcar, enviar un motivo y guardar un formulario del ADMIN. Desactivarlo y repetir. | Sin red: un mensaje dice que no se registró y qué hacer; lo escrito se conserva; **nada dice que la marca quedó registrada**. Con red: la marca se registra una sola vez. | Capturas sin red y al volver; la historia del ADMIN con una sola marca |
| P-AND-09 | M-7: como ADMIN, entrar a una parte de «Configuración», recargar y tocar Atrás dos veces. | Se conserva el lugar al recargar; Atrás vuelve por las secciones antes de salir. | Video corto |
| P-AND-10 | M-8 TalkBack: activarlo (Ajustes → Accesibilidad). Ingresar, marcar, explicar un caso (motivo), decidir un caso (ADMIN), cargar días y ubicar un local con el mapa. | Cada resultado se anuncia una sola vez; lo que se oye coincide con lo que se ve; hay un solo título de nivel 1. | Grabación de pantalla con audio |
| P-AND-11 | M-5: tamaño de letra del sistema al máximo y zoom de Chrome al 200 %. | No se pierde contenido ni ninguna función; ningún rótulo queda cortado. | Capturas de la pantalla del empleado y de la bandeja |
| P-AND-12 | M-3, controles táctiles: con el dedo, tocar cada botón, campo, casilla y opción de las pantallas del empleado y del ADMIN, y los controles del mapa. | Se tocan sin errar ni activar el de al lado; cada uno mide al menos 48 px por lado en el teléfono (medirlo con la depuración remota de Chrome, `chrome://inspect`, si hay una PC). | Capturas o medidas |
| P-AND-13 | M-11: ubicar un local con un solo dedo y sin arrastrar el mapa (búsqueda de dirección y coordenadas escritas). | Se puede en los dos casos y se confirma el punto antes de guardar. | Capturas |
| P-AND-14 | M-13: con la red limitada (datos móviles con una sola barra, o el modo ahorro de datos), marcar y guardar. | Los mensajes dicen qué pasó y si se guardó. | Capturas |

### iPhone (Safari)

| ID | Paso | Qué tiene que pasar | Evidencia |
|---|---|---|---|
| P-IOS-01 | En Safari, abrir `https://<DOMINIO_REAL>`. Compartir → «Agregar a pantalla de inicio» → Agregar. Abrirla **desde el ícono**: la push y la sesión de la app instalada no se comparten con Safari. | Se abre sin la barra de Safari, con el ícono y el nombre. | Captura del ícono y de la app abierta |
| P-IOS-02 | M-12: con la app instalada en un iPhone con muesca, mirar cada pantalla. | La barra de estado se lee; nada queda bajo la muesca ni bajo el indicador de inicio; la barra de abajo se ve entera. | Capturas de la pantalla del empleado y de una del ADMIN |
| P-IOS-03 | Permiso de ubicación: Ajustes → Privacidad y seguridad → Localización → activada. Al marcar por primera vez, iOS pregunta: elegir «Permitir mientras se usa la app» y dejar activada «Ubicación exacta». | Aparece el diálogo del sistema y la marca se confirma. | Captura del diálogo y de la confirmación |
| P-IOS-04 | Permiso denegado: Ajustes → Safari (o la app) → Ubicación → «Denegar». Marcar. | La marca se registra igual (la ubicación nunca bloquea una marca, regla 2) y el ADMIN ve la marca «sin ubicación». Volver a permitirla después. | Captura de la confirmación y de la vista del ADMIN |
| P-IOS-05 | Login, cambio de la clave provisoria y fichaje completo (ingreso dentro del local, pausa con salida y vuelta, egreso). | Cada marca se confirma con la hora del servidor; el ADMIN ve las cuatro en el historial con su ubicación. | Capturas |
| P-IOS-06 | Sesión persistente: cerrar la app desde el selector de apps, esperar 30 min y reabrirla. | El empleado sigue con la sesión iniciada. | Captura con la hora |
| P-IOS-07 | Avisos del ADMIN (M-9): iPhone del ADMIN con la app instalada → activar los avisos → aceptar el permiso de iOS. Provocar una llegada tarde como en P-AND-06. Bloquear el teléfono. | La notificación llega a la pantalla bloqueada. Si los avisos fallan de forma sostenida en iPhone, se aplica el plan B de D-20261014-13; no antes. | Captura de la notificación con la hora; si falla, anotar la versión de iOS y si la app estaba instalada desde el ícono |
| P-IOS-08 | M-9 VoiceOver: Ajustes → Accesibilidad → VoiceOver. Ingresar, marcar, explicar un caso, decidir un caso, cargar días y ubicar un local con el mapa. | Cada resultado se anuncia una sola vez; los nombres coinciden con lo que se ve; un solo título de nivel 1 (rotor → Encabezados). | Grabación de pantalla con audio |
| P-IOS-09 | Elementos táctiles y diseño (M-1 y M-3): recorrer cada pantalla en vertical y en horizontal, con un nombre de empresa, de persona y un motivo largos. | Sin desplazamiento de costado; sin textos cortados ni superpuestos; la marca siguiente se ve en el primer pantallazo; cada control se toca sin errar. | Capturas |
| P-IOS-10 | Reconexión: modo avión, intentar marcar, volver a la red y marcar. | Igual que P-AND-08. | Capturas |
| P-IOS-11 | M-2: en Safari del iPhone, mirar el texto de muestra de los campos, el selector de fecha y hora, las casillas y las listas desplegables. | Se leen bien (4,5:1 el texto, 3:1 los bordes). Si hay una Mac, medirlo con el inspector web de Safari. | Capturas |

### Pruebas de escritorio (§10 sin teléfono)

- **M-1** a 320, 390, 768, 1024 y 1366 px, y a 640 × 360.
- **M-4**, teclado.
- **M-5**, zoom del 200 % y del 400 %.
- **M-6**, con un tema de contraste real de Windows (Configuración → Accesibilidad → Temas de contraste) en Edge o Chrome; no con la emulación.
- **M-10**, NVDA con Chrome o Firefox en las pantallas del ADMIN, con las tablas leídas con sus encabezados.
- **M-14**, lectura de los textos nuevos o cambiados del release: voseo, ningún código en los mensajes y glosario de `shared/labels.ts`.

Evidencia: capturas y una línea por paso, como arriba.

### Cierre

- Pasar la planilla al PR de release. Cada FAIL lleva el paso exacto, lo que se vio, una captura y la hora, para buscarlo en `docker compose -p braja logs --since <hora> backend`.
- Si se usó la opción (a), restaurar el backup previo a las pruebas y comprobar en la app que no queda ningún dato «QA».
