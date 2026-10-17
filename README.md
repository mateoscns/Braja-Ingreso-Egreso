# Fichaje Braja

Aplicación propia para registrar ingreso, egreso, desayuno y almuerzo. La v1 incluye varias empresas y sedes, jornadas declaradas por fecha y avisos dentro de la app. No liquida sueldos, calcula montos, administra un banco de horas ni crea cronogramas semanales.

## Estado

La implementación v1 está en curso en `feat/v1-implementation`. El registro conserva las **22 decisiones base adoptadas**, más **5 aclaraciones adoptadas el 2026-10-16**: **27 filas adoptadas y 0 propuestas**. Mateo es quien adopta decisiones de producto; `ADMIN` es el rol operativo que administra una empresa. La lista vigente está en [docs/DECISIONES.md](docs/DECISIONES.md).

## Recorrido de desarrollo

1. Copiar `.env.example` a `.env` y generar claves privadas de 32 bytes distintas para motivos `SALUD` y secretos de suscripción push.
2. Iniciar MySQL 8.4 con `docker compose up -d mysql`.
3. Ejecutar migraciones Flyway y arrancar Spring Boot con el perfil local.
4. Instalar dependencias y arrancar la PWA; durante desarrollo, Vite envía `/api` al backend.
5. Ejecutar pruebas de backend y frontend antes de integrar cambios.

Los comandos están en [docs/ESPECIFICACION.md](docs/ESPECIFICACION.md). `.env` es local y está excluido de Git; el perfil de desarrollo lo importa desde la raíz cuando Spring Boot se inicia dentro de `backend/`. Producción no importa ese archivo: sus secretos se inyectan desde el entorno de ejecución. No hay credenciales iniciales ni claves de cifrado productivas versionadas.

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
