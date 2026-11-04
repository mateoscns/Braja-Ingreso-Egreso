# Deploy en un VPS

Runbook para levantar Fichaje Braja en un VPS con Docker Compose y Caddy (CLAUDE.md reglas 30 a 34). Todo se
hace con los scripts de esta carpeta; nada a mano dentro de los contenedores. Seguir los pasos en orden.

| Pieza | Qué es |
|---|---|
| `docker-compose.yml` | MySQL 8.4 (sin puerto publicado), backend (con sus jobs) y Caddy (80/443). Proyecto `braja`. |
| `caddy/Caddyfile` | HTTPS automático, `/api/*` al backend, errores de `/api` en JSON, cabeceras de seguridad, caché de la PWA. |
| `gen-secrets.sh` | Crea `deploy/.env` (modo 600) con secretos nuevos. Nunca lo pisa ni imprime un secreto. |
| `deploy.sh` | Backup, build con el sha, arranque, compuerta de salud y rollback. |
| `backup.sh` / `restore.sh` | Backup diario comprimido (14 días) y restauración con confirmación. |
| `bootstrap-vps.sh` | Prepara un Ubuntu 24.04 limpio. |
| `demo.sh` + `demo/compose.demo.yml` | Modo demo sin VPS: la misma pila en una PC, publicada con un túnel de Cloudflare (ver al final). |

## 1. Comprar el VPS

Hetzner CX22 o DigitalOcean, Ubuntu 24.04, 2 vCPU y 4 GB. Al crearlo, cargar tu clave SSH pública (sin clave, el
bootstrap deja el login por contraseña activo para no dejarte afuera). Anotar la IPv4 pública.

## 2. DNS

HTTPS es obligatorio: sin él no funcionan ni la push ni la geolocalización. Hace falta un nombre que apunte a la IP:

- Dominio propio: un registro `A` (por ejemplo `fichaje.tudominio.com`) con la IPv4 del VPS.
- Gratis: un subdominio de [DuckDNS](https://www.duckdns.org) (`braja-fichaje.duckdns.org`) con esa IPv4.

Cargar solo el registro `A`, **sin `AAAA`**: por IPv6, Docker le muestra a Caddy la IP de su gateway y no la del
cliente, y el límite de login por IP (regla 21) trataría a todos como uno. Comprobar antes de seguir:
`nslookup <dominio>` tiene que devolver la IP del VPS. Los puertos 80 y 443 tienen que estar abiertos (el bootstrap
lo hace) para que Let's Encrypt emita el certificado.

## 3. Bootstrap del servidor

```bash
scp deploy/bootstrap-vps.sh root@<ip>:/root/
ssh root@<ip> 'bash /root/bootstrap-vps.sh braja'
```

Instala Docker y el plugin compose desde el repo de Docker, 2 GB de swap, ufw (solo 22, 80 y 443),
actualizaciones automáticas de seguridad y el usuario `braja` en el grupo `docker`. Si había clave SSH, desactiva el
login por contraseña. Desde acá, todo como `braja`: `ssh braja@<ip>`.

Ojo: los puertos que publica Docker no pasan por ufw. Por eso el compose publica solo 80 y 443; nunca agregues
`ports:` a MySQL ni al backend.

Si querés copias fuera del servidor (`BRAJA_BACKUP_OFFHOST_CMD`), guardá las credenciales en la configuración de la
herramienta (por ejemplo `~/.config/rclone/rclone.conf`), no dentro del comando: todo `deploy/.env` llega al backend.

## 4. Clonar

```bash
git clone https://github.com/mateoscns/Braja-Ingreso-Egreso.git ~/fichaje
cd ~/fichaje
```

## 5. Generar secretos

```bash
bash deploy/gen-secrets.sh --domain <dominio> --vapid-subject mailto:<tu-email> \
  --admin-dni <DNI> --admin-name "<Nombre Apellido>" --company "Braja" --site "<Sede>" \
  --time-zone America/Argentina/Buenos_Aires
```

Pide la contraseña del primer `ADMIN` (de 16 caracteres a 72 bytes, oculta, dos veces). Crea `deploy/.env` con modo 600.
**Guardar una copia de `deploy/.env` en un gestor de contraseñas**: sin `BRAJA_HEALTH_ENCRYPTION_KEY_BASE64` los
motivos `SALUD` guardados no se pueden leer. No se sube a git (`.gitignore`) ni se pega en ningún chat.

## 6. Deploy

```bash
bash deploy/deploy.sh
```

Hace, en orden: chequeos (Docker, 3 GB libres, `.env` en modo 600, checkout sin cambios), build de
`braja-backend:<sha>` y `braja-caddy:<sha>`, MySQL arriba, **backup antes de migrar** (Flyway migra al arrancar el
backend), arranque y espera de hasta 5 minutos a que `https://<dominio>/api/v1/health` responda
`{"status":"UP"}` a través de Caddy con un certificado válido. La primera vez tarda más: compila todo y Caddy pide
el certificado. Correrlo de nuevo con el mismo commit no cambia nada.

## 7. Primer ADMIN

El primer deploy crea la empresa, la sede y el `ADMIN` con los datos del paso 5. Cuando queda sano, `deploy.sh`
apaga el bootstrap y borra la contraseña de `.env` (un arranque posterior con el bootstrap activo fallaría). Entrar
en `https://<dominio>` con ese DNI y contraseña, y desde el teléfono instalar la PWA (regla 38: probar en iPhone y en
Android).

## 8. Backup y restauración

Backup a mano: `bash deploy/backup.sh` (deja `~/braja-backups/braja-<fecha>.sql.gz`, modo 600, guarda 14 días).
Backup diario (06:15 UTC = 03:15 en Argentina), con `crontab -e` como `braja`:

```cron
15 6 * * * cd $HOME/fichaje && bash deploy/backup.sh >> $HOME/braja-backups/backup.log 2>&1
```

Copia fuera del servidor (regla 33): poner en `deploy/.env` un comando que reciba el archivo como `$1`, por ejemplo
`BRAJA_BACKUP_OFFHOST_CMD='rclone copy "$1" offsite:braja-backups'`. Sin eso, cada backup avisa que vive solo en el VPS.

Restaurar (reemplaza **toda** la base; antes hace un backup de seguridad del estado actual y pide escribir `RESTORE`):

```bash
bash deploy/restore.sh ~/braja-backups/braja-<fecha>.sql.gz
```

## 9. Actualizar

```bash
cd ~/fichaje && git pull --ff-only && bash deploy/deploy.sh
```

Solo se despliega lo que está en `main` con CI verde (regla 31).

## 10. Rollback

Si la versión nueva no queda sana, `deploy.sh` vuelve solo a la anterior e informa si la base cambió:

- "no migration ran": no hay que restaurar nada.
- "migrations ran ... NOT undone automatically": la base quedó con el esquema nuevo. Si la versión anterior falla con
  él, correr el `restore.sh` que imprime, con el backup tomado justo antes (se pierde lo escrito desde entonces).

Para volver a mano a la versión anterior: `bash deploy/deploy.sh --rollback` (hace un backup antes).

## 11. Logs y estado

```bash
docker compose -p braja ps
docker compose -p braja logs -f --tail 100 backend
docker compose -p braja logs --tail 100 caddy
curl -fsS https://<dominio>/api/v1/health
```

Los logs rotan (10 MB × 5 por contenedor). Los contenedores se reinician solos si se caen o si se reinicia el VPS
(`restart: unless-stopped`; Docker espaciando cada reintento hasta un minuto); el backend termina ante un
`OutOfMemoryError` para que arranque uno limpio. Límites de memoria: MySQL 1 GB, backend 1280 MB, Caddy 256 MB.

## Prueba local

La misma pila se puede levantar en una máquina de desarrollo con otro nombre de proyecto, puertos libres y
`BRAJA_DOMAIN=localhost` (Caddy usa su CA interna): generar un `.env` en un directorio temporal con
`gen-secrets.sh --env-file <tmp>/.env`, agregarle `BRAJA_HTTP_PORT`/`BRAJA_HTTPS_PORT` y un `BRAJA_NETWORK_SUBNET`
y `BRAJA_CADDY_IPV4` libres, y correr `BRAJA_ENV_FILE=<tmp>/.env docker compose -p braja-localtest -f
deploy/docker-compose.yml --env-file <tmp>/.env up -d --build`. Bajarla con `docker compose -p braja-localtest down -v`.

## Modo demo (sin VPS)

Para probar con usuarios reales antes de contratar el servidor (issue #97). Corre la misma pila en una PC con Docker
Desktop y la publica con un túnel rápido de Cloudflare: una dirección `https://…trycloudflare.com` sin cuenta, sin
dominio y sin abrir puertos del router. Cloudflare pone el certificado, así que la ubicación y la push andan. En Windows,
desde Git Bash en la raíz del repo:

```bash
bash deploy/demo.sh start      # la primera vez crea deploy/.env.demo y pide los datos del primer ADMIN
bash deploy/demo.sh url        # la dirección actual
bash deploy/demo.sh logs tunnel
bash deploy/demo.sh stop       # apaga y conserva los datos; start vuelve a levantar
bash deploy/demo.sh down --wipe  # borra la base de la demo (pide escribir BORRAR)
```

Límites:

- La PC tiene que quedar prendida, despierta y con internet mientras se prueba. Desactivar la suspensión.
- La dirección cambia cada vez que se reinicia el túnel (al reiniciar la PC o Docker). Con una dirección nueva hay que
  abrirla de nuevo en cada teléfono, volver a instalar la app y volver a activar las alertas.
- Todos los usuarios llegan con la dirección del túnel, así que comparten el límite de login por IP (100 fallos en
  15 min, D-20261027-05).
- No es producción: los datos viven en la PC y no hay backup automático. Proyecto Docker `braja-demo`, red
  172.31.90.0/24, imágenes `braja-*:demo`; no comparte nada con otros proyectos de la máquina.
