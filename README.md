# Fichaje Braja

Aplicación propia para registrar ingreso, egreso, desayuno y almuerzo. La v1 incluye varias empresas y sedes, jornadas declaradas por fecha y avisos dentro de la app. No liquida sueldos, calcula montos, administra un banco de horas ni crea cronogramas semanales.

## Estado

La v1 está en `main` (PR #2), con CI (PR #4) y `MARCA_FALTANTE` (PR #6). El registro conserva las **22 decisiones base adoptadas**, más **5 aclaraciones del 2026-10-16, 1 del 2026-10-18 y 6 del 2026-10-19**: **34 filas adoptadas y 0 propuestas**. Mateo es quien adopta decisiones de producto; `ADMIN` es el rol operativo que administra una empresa. La lista vigente está en [docs/DECISIONES.md](docs/DECISIONES.md).

## Recorrido de desarrollo

1. Copiar `.env.example` a `.env` y generar tres claves privadas distintas de 32 bytes: para motivos `SALUD`, el HMAC de límite de login por IP y los secretos de suscripción push.
2. Iniciar MySQL 8.4 con `docker compose up -d mysql`.
3. Ejecutar migraciones Flyway y arrancar Spring Boot con `--spring.profiles.active=local` para habilitar el perfil HTTP local.
4. Instalar dependencias y arrancar la PWA con `cd frontend && npm ci && npm run dev`. Durante desarrollo, Vite reenvía `/api` a `http://localhost:8080` (el backend del paso 3); para apuntar a otro backend, definir `VITE_API_PROXY_TARGET` (por ejemplo `VITE_API_PROXY_TARGET=http://localhost:9090 npm run dev`).
5. Ejecutar pruebas de backend y frontend antes de integrar cambios.

Los comandos están en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md). `.env` es local y está excluido de Git; el perfil de desarrollo lo importa desde la raíz cuando Spring Boot se inicia dentro de `backend/`. Producción no importa ese archivo: sus secretos se inyectan desde el entorno de ejecución. No hay credenciales iniciales ni claves de cifrado productivas versionadas.
El límite adicional de inicio de sesión por IP usa 30 fallos en 15 minutos y bloquea por 15 minutos; se ajusta con `BRAJA_LOGIN_IP_THROTTLE_MAX_FAILURES`, `BRAJA_LOGIN_IP_THROTTLE_WINDOW` y `BRAJA_LOGIN_IP_THROTTLE_LOCK_DURATION`. `BRAJA_LOGIN_IP_THROTTLE_KEY_BASE64` debe ser una clave aleatoria de 32 bytes, distinta de las claves de cifrado. Fuera del perfil `local` activo por sí solo, el backend exige `BRAJA_TRUSTED_PROXY_CIDRS` y falla al iniciar si no está configurado. Con Caddy, usar la IP interna fija del contenedor que el backend ve como peer (`/32` para IPv4 o `/128` para IPv6), o la subred dedicada de Docker si Caddy usa direcciones dinámicas; no confiar en rangos amplios de redes privadas. Este repositorio no fija una red de producción para Caddy, así que el operador debe obtener la IP/subred real de la red de despliegue antes de configurar el valor. El proxy debe sobrescribir o construir correctamente `X-Forwarded-For`; si un proxy confiable omite o envía una cadena inválida, la solicitud se rechaza. La cabecera se ignora cuando la conexión no viene de una red confiable.

### Primer `ADMIN`

En una base MySQL vacía, el backend provisiona una sola vez la cuenta `ADMIN`, su empresa y la sede inicial. Para ese primer arranque, el operador inyecta `BRAJA_BOOTSTRAP_ENABLED=true`, `BRAJA_BOOTSTRAP_DNI`, `BRAJA_BOOTSTRAP_PASSWORD` (mínimo 16 caracteres), `BRAJA_BOOTSTRAP_ADMIN_NAME`, `BRAJA_BOOTSTRAP_COMPANY_NAME`, `BRAJA_BOOTSTRAP_SITE_NAME` y `BRAJA_BOOTSTRAP_TIME_ZONE` mediante el entorno seguro del servidor. No usar valores de ejemplo ni guardar la contraseña en el repositorio. Después de que el arranque termine, quitar esos valores y desactivar `BRAJA_BOOTSTRAP_ENABLED`; si queda activado, el backend rechaza el siguiente arranque porque el bootstrap solo se permite una vez. El proceso falla en forma cerrada si la base no está vacía o falta algún valor requerido. El alta operativa de otras empresas y sus primeros `ADMIN` todavía debe definirse antes de incorporar otros clientes; está anotada en [PENDIENTES.md](docs/PENDIENTES.md).

## Módulos y contratos

| Ruta | Responsabilidad |
| --- | --- |
| `backend/` | API Spring Boot MVC, autorización multiempresa, reglas de jornada, persistencia MySQL, tareas programadas y pruebas de integración. |
| `frontend/` | React + TypeScript + Vite, experiencia PWA para `ADMIN` y empleados. No confirma una marca hasta que responde el servidor ni la pone en cola offline. |
| `openapi.yaml` | Contrato compartido de API entre frontend y backend. |
| `docs/ARQUITECTURA.md` | Límites entre módulos, transacciones e invariantes de aislamiento. |
| `docs/DECISIONES.md` | Fuente de verdad de decisiones adoptadas por Mateo. |
| `docs/ESPECIFICACION.md` | Requisitos funcionales y criterios de aceptación de v1. |
| `docs/PENDIENTES.md` | Validaciones de entorno y temas operativos que no bloquean la implementación. |

El backend deriva empresa, rol y permisos de la sesión autenticada. Los IDs que envía la interfaz nunca conceden acceso por sí mismos. Cada jornada conserva una copia de su plantilla y tolerancia. Las marcas usan hora y secuencia del servidor; las coordenadas y los motivos de salud tienen acceso y retención limitados.

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
