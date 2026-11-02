# Fichaje Braja

Aplicación propia para registrar ingreso, egreso, desayuno y almuerzo. La v1 incluye varias empresas y sedes, jornadas declaradas por fecha y avisos dentro de la app. No liquida sueldos, calcula montos, administra un banco de horas ni crea cronogramas semanales.

## Estado

La v1 está en `main` (PR #2), con CI (PR #4) y `MARCA_FALTANTE` (PR #6). Del 2026-10-27 al 2026-10-28 entraron las correcciones de la auditoría del 2026-10-27 y las funciones que se decidieron en ella: cancelar una jornada y anular una marca (PR #57), restablecer la contraseña de un empleado (PR #58), historial de cambios de una jornada (PR #63) y asignación de plantillas con fecha de inicio y declaración por lote (PR #65). La geocerca de sedes (issue #67) entró con el PR #69 el 2026-10-30. El 2026-11-02 la campaña de pruebas previa a producción (issue #72) y sus correcciones quedaron en los PRs #84 a #94, entre ellos la pila de deploy de `deploy/` (PR #92), que todavía no se corrió en un VPS. Al 2026-11-02 el registro tiene **66 filas adoptadas y 0 propuestas**: las 22 base del 2026-10-14 y del 2026-10-15 y 44 aclaraciones posteriores, la última D-20261102-15. Mateo es quien adopta decisiones de producto; `ADMIN` es el rol operativo que administra una empresa. La lista vigente está en [docs/DECISIONES.md](docs/DECISIONES.md).

## Recorrido de desarrollo

1. Copiar `.env.example` a `.env`, completar las contraseñas de MySQL (`SPRING_DATASOURCE_PASSWORD` y `BRAJA_DB_ROOT_PASSWORD`, que exige `docker-compose.yml`) y generar tres claves privadas distintas de 32 bytes: `BRAJA_HEALTH_ENCRYPTION_KEY_BASE64` (motivos `SALUD`), `BRAJA_LOGIN_IP_THROTTLE_KEY_BASE64` (HMAC del límite de login por IP) y `BRAJA_PUSH_SUBSCRIPTION_ENCRYPTION_KEY_BASE64` (secretos de suscripción push). Sin las dos primeras el backend no arranca.
2. Iniciar MySQL 8.4 con `docker compose up -d mysql`.
3. Desde `backend/`, arrancar Spring Boot con el perfil `local`: `.\mvnw.cmd spring-boot:run "-Dspring-boot.run.profiles=local"` (en Linux o macOS, `./mvnw spring-boot:run -Dspring-boot.run.profiles=local`). Flyway aplica las migraciones al iniciar. Sin el perfil `local` el backend no importa `.env` y, si esas variables no están en el entorno, falla al iniciar.
4. Instalar dependencias y arrancar la PWA con `cd frontend && npm ci && npm run dev`. Durante desarrollo, Vite reenvía `/api` a `http://localhost:8080` (el backend del paso 3); para apuntar a otro backend, definir `VITE_API_PROXY_TARGET` (por ejemplo `VITE_API_PROXY_TARGET=http://localhost:9090 npm run dev`).
5. Antes de integrar, correr el mismo control que el CI: `cd backend && .\mvnw.cmd verify` (corre también la campaña de pruebas, con la simulación de 7 días; la de 90 días va aparte con `.\mvnw.cmd -B verify -P simulation`) y `cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run audit:prod`. `audit:prod` ejecuta `npm audit --omit=dev` y solo tolera las excepciones fechadas de `frontend/scripts/audit-policy.mjs` (D-20261027-10).

Los comandos están en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md). `.env` es local y está excluido de Git; el perfil de desarrollo lo importa desde la raíz cuando Spring Boot se inicia dentro de `backend/`. Producción no importa ese archivo: sus secretos se inyectan desde el entorno de ejecución. No hay credenciales iniciales ni claves de cifrado productivas versionadas.
El límite adicional de inicio de sesión por IP usa 100 fallos en 15 minutos y bloquea por 15 minutos (D-20261027-05: todos los empleados de un local comparten la IP pública); se ajusta con `BRAJA_LOGIN_IP_THROTTLE_MAX_FAILURES` (por defecto 100, de 1 a 10000), `BRAJA_LOGIN_IP_THROTTLE_WINDOW` y `BRAJA_LOGIN_IP_THROTTLE_LOCK_DURATION` (por defecto `15m`, hasta 24 horas). El límite por DNI (5 fallos en 15 minutos) no es configurable. `BRAJA_LOGIN_IP_THROTTLE_KEY_BASE64` debe ser una clave aleatoria de 32 bytes, distinta de las claves de cifrado; el arranque falla si es igual a `BRAJA_HEALTH_ENCRYPTION_KEY_BASE64`. Fuera del perfil `local` activo por sí solo, el backend exige `BRAJA_TRUSTED_PROXY_CIDRS` y falla al iniciar si no está configurado. Con Caddy, usar la IP interna fija del contenedor que el backend ve como peer (`/32` para IPv4 o `/128` para IPv6), o la subred dedicada de Docker si Caddy usa direcciones dinámicas; no confiar en rangos amplios de redes privadas. El arranque falla si la lista confía en todas las direcciones IPv4 o IPv6, aunque sea repartida en varios rangos (`0.0.0.0/1` más `128.0.0.0/1`). La pila de `deploy/docker-compose.yml` ya lo resuelve: fija la red `172.31.81.0/24` y la dirección de Caddy `172.31.81.10`, y pone `BRAJA_TRUSTED_PROXY_CIDRS` en esa dirección `/32` (`BRAJA_NETWORK_SUBNET` y `BRAJA_CADDY_IPV4` las cambian si chocan con otra red del servidor); fuera de esa pila, el operador obtiene la IP o subred real del proxy antes de configurar el valor. El proxy debe sobrescribir o construir correctamente `X-Forwarded-For`; si un proxy confiable omite o envía una cadena inválida, la solicitud se rechaza. La cabecera se ignora cuando la conexión no viene de una red confiable.

### Primer `ADMIN`

En una base MySQL vacía, el backend provisiona una sola vez la cuenta `ADMIN`, su empresa y la sede inicial. Para ese primer arranque, el operador inyecta `BRAJA_BOOTSTRAP_ENABLED=true`, `BRAJA_BOOTSTRAP_DNI`, `BRAJA_BOOTSTRAP_PASSWORD` (de 16 caracteres a 72 bytes en UTF-8, D-20261102-04), `BRAJA_BOOTSTRAP_ADMIN_NAME`, `BRAJA_BOOTSTRAP_COMPANY_NAME`, `BRAJA_BOOTSTRAP_SITE_NAME` y `BRAJA_BOOTSTRAP_TIME_ZONE` (una zona IANA con forma Área/Lugar, D-20261102-05) mediante el entorno seguro del servidor; con la pila de `deploy/`, `gen-secrets.sh` los escribe en `deploy/.env` y `deploy.sh` apaga el bootstrap y borra la contraseña cuando el primer deploy queda sano. No usar valores de ejemplo ni guardar la contraseña en el repositorio. Después de que el arranque termine, quitar esos valores y desactivar `BRAJA_BOOTSTRAP_ENABLED`; si queda activado, el backend rechaza el siguiente arranque porque el bootstrap solo se permite una vez. El proceso falla en forma cerrada si la base no está vacía o falta algún valor requerido. El alta operativa de otras empresas y sus primeros `ADMIN` todavía debe definirse antes de incorporar otros clientes; está anotada en [PENDIENTES.md](docs/PENDIENTES.md).

## Módulos y contratos

| Ruta | Responsabilidad |
| --- | --- |
| `backend/` | API Spring Boot MVC, autorización multiempresa, reglas de jornada, persistencia MySQL, tareas programadas y pruebas de integración. |
| `frontend/` | React + TypeScript + Vite, experiencia PWA para `ADMIN` y empleados. No confirma una marca hasta que responde el servidor ni la pone en cola offline. |
| `openapi.yaml` | Contrato compartido de API entre frontend y backend. |
| `deploy/` | Pila de producción (Docker Compose con MySQL, backend y Caddy) y scripts de bootstrap del VPS, secretos, deploy, backup y restauración; el runbook es [deploy/README.md](deploy/README.md). |
| `docs/ARQUITECTURA.md` | Límites entre módulos, transacciones e invariantes de aislamiento. |
| `docs/DECISIONES.md` | Fuente de verdad de decisiones adoptadas por Mateo. |
| `docs/ESPECIFICACION.md` | Requisitos funcionales y criterios de aceptación de v1. |
| `docs/PENDIENTES.md` | Validaciones de entorno y temas operativos que no bloquean la implementación. |

`GET /api/v1/health` (paquete `ops`) responde sin sesión si el backend llega a MySQL; es la compuerta de salud del deploy y de los contenedores. El backend deriva empresa, rol y permisos de la sesión autenticada. Los IDs que envía la interfaz nunca conceden acceso por sí mismos. Cada jornada conserva una copia de su plantilla y tolerancia. Las marcas usan hora y secuencia del servidor; las coordenadas y los motivos de salud tienen acceso y retención limitados.

## Tecnología

- Java 21, Spring Boot MVC, MySQL 8.4 LTS y Flyway.
- React, TypeScript, Vite y PWA.
- Pruebas de persistencia y concurrencia contra MySQL 8.4 con Testcontainers.
- Sin Redis ni brokers externos. Una tabla outbox de MySQL y procesos programados agrupan y reintentan push.
- Capacitor solo se evalúa si la prueba de Web Push falla en el iPhone real del `ADMIN`.

## Documentación

- [Registro de decisiones](docs/DECISIONES.md)
- [Especificación funcional y guía de desarrollo](docs/ESPECIFICACION.md)
- [Pendientes de validación](docs/PENDIENTES.md)
- [Deploy en un VPS](deploy/README.md)
