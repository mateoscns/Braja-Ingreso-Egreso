# Deploy en un VPS

Runbook para levantar Fichaje Braja en un VPS con Docker Compose y Caddy (CLAUDE.md reglas 30 a 34). Todo se
hace con los scripts de esta carpeta; nada a mano dentro de los contenedores. Seguir los pasos en orden.

| Pieza | Qué es |
|---|---|
| `docker-compose.yml` | MySQL 8.4 (sin puerto publicado), backend (con sus jobs) y Caddy (80/443). Proyecto `braja`. |
| `caddy/Caddyfile` | HTTPS automático, `/api/*` al backend, errores de `/api` en JSON, cabeceras de seguridad, caché de la PWA. |
| `gen-secrets.sh` | Crea `deploy/.env` (modo 600) con secretos nuevos. Nunca lo pisa ni imprime un secreto. |
| `deploy.sh` | Chequeos de release (`main`, fuera de horario), backup, build con el sha, arranque, compuerta de salud, limpieza y rollback. |
| `backup.sh` / `restore.sh` | Backup programado comprimido (14 días), copia cifrada fuera del servidor, latido al monitor y restauración con confirmación. |
| `bootstrap-vps.sh` | Prepara un Ubuntu 24.04 limpio: Docker, rclone, reloj sincronizado, firewall, reinicio automático, cron del backup, SSH. |
| `RECOVERY.md` | Qué hacer si se cae la app o se pierde el servidor, paso a paso y con tiempos. |
| `demo.sh` + `demo/compose.demo.yml` | Modo demo sin VPS: la misma pila en una PC, publicada con un túnel de Cloudflare (ver al final). |

Checklists: `docs/CHECKLIST_SALIDA.md` (la primera vez) y `docs/CHECKLIST_RELEASE.md` (cada actualización).

## 1. Comprar el VPS

Ubuntu 24.04, 2 vCPU, 4 GB de RAM y **IPv4 pública** (algunos proveedores ofrecen crear el servidor solo con IPv6 para
ahorrar: no sirve, el acceso es solo por IPv4, D-20261102-12). Al 2026-11-13 el Hetzner CX22 que recomendaba este
runbook ya no se vende y el CX23 figura sin stock. Opciones (precios a verificar al contratar):

| Opción | Pros | Contras |
|---|---|---|
| **Hetzner CPX22** (2 vCPU AMD, 4 GB, Europa) | El más barato con 4 GB; el resto del runbook está escrito para este tamaño. | En Alemania o Finlandia: unos 250 ms de ida y vuelta desde Córdoba. Una marca es un solo pedido, así que se nota poco. |
| DigitalOcean Basic 2 vCPU / 4 GB (Nueva York) | Menos latencia (unos 150 ms) y soporte en inglés con buena documentación. | Cuesta bastante más por el mismo tamaño. |
| Otro proveedor con 2 vCPU y 4 GB en América | Latencia menor. | Este runbook no se probó ahí; revisar que dé IPv4 y Ubuntu 24.04. |

Menos de 4 GB no alcanza: el build de Maven y el de npm corren al lado de MySQL. La elección del proveedor es una
propuesta pendiente de Mateo (D-20261113-01). Al crearlo, cargar tu clave SSH pública (sin clave, el bootstrap deja el
login por contraseña activo para no dejarte afuera). Anotar la IPv4 pública.

## 2. DNS

HTTPS es obligatorio: sin él no funcionan ni la push ni la geolocalización. Hace falta un nombre que apunte a la IP:

- Dominio propio: un registro `A` (por ejemplo `fichaje.tudominio.com`) con la IPv4 del VPS.
- Gratis: un subdominio de [DuckDNS](https://www.duckdns.org) (`braja-fichaje.duckdns.org`) con esa IPv4.

Cargar solo el registro `A`, **sin `AAAA`**: por IPv6, Docker le muestra a Caddy la IP de su gateway y no la del
cliente, y el límite de login por IP (regla 21) trataría a todos como uno. Comprobar antes de seguir:
`nslookup <dominio>` tiene que devolver la IP del VPS. Los puertos 80 y 443 tienen que estar abiertos (el bootstrap
lo hace) para que Let's Encrypt emita el certificado. Con dominio propio, poner el TTL del registro en 300 s: si hay
que mudarse a otro servidor (`RECOVERY.md`), el cambio llega en minutos y no en horas.

## 3. Bootstrap del servidor

```bash
scp deploy/bootstrap-vps.sh root@<ip>:/root/
ssh root@<ip> 'bash /root/bootstrap-vps.sh braja'
```

Hace, en orden:

- Docker y el plugin compose desde el repo de Docker; `rclone` y `cron` desde Ubuntu.
- **Reloj**: activa NTP (`timedatectl set-ntp true`) y espera hasta 60 s a que el reloj quede sincronizado; si no,
  se detiene con un error. Cada marca toma la hora del servidor (regla 1): sin reloj sincronizado no se despliega.
- 2 GB de swap y ufw (solo 22, 80 y 443).
- Actualizaciones automáticas de seguridad, con **reinicio automático a las 07:30 UTC (04:30 en Córdoba)** cuando una
  actualización lo pide (kernel, libc). Los contenedores vuelven solos. El corte dura uno o dos minutos.
- El usuario `braja` en el grupo `docker`, y el **cron del backup** para él en `/etc/cron.d/braja-backup`: todos los
  días a las 06:15 UTC (03:15 en Córdoba), con el log en `~braja/braja-backups/backup.log`.
- SSH: si hay clave, desactiva el login por contraseña. Si `braja` tiene una clave usable
  (`~braja/.ssh/authorized_keys` no vacío, suyo y sin permisos de escritura para otros), le da `sudo` sin contraseña
  y **desactiva el login de root** (`PermitRootLogin no`). Si no, deja root con clave y avisa. Antes de cerrar la
  sesión de root, probar desde otra terminal: `ssh braja@<ip> sudo true`.

Se puede correr de nuevo sin romper nada (por ejemplo para cambiar el horario del backup). Con root desactivado:
`ssh braja@<ip> 'sudo bash bootstrap-vps.sh braja'` (copiar antes el script a `~braja`). Opciones, como variables
de entorno; el reloj del servidor está en UTC y Argentina es UTC−3 todo el año:

| Variable | Por defecto | Para qué |
|---|---|---|
| `BRAJA_BACKUP_SCHEDULE` | `15 6 * * *` | Horario del backup (cron, 5 campos). Cada hora: `0 * * * *`. |
| `BRAJA_REBOOT_TIME` | `07:30` | Hora del reinicio automático (HH:MM, UTC). |
| `BRAJA_REPO_DIR` | `~braja/fichaje` | Dónde está el clon que usa el cron. |
| `BRAJA_PERMIT_ROOT_LOGIN` | `no` | `prohibit-password` para dejar entrar a root con clave. |
| `BRAJA_TIME_SYNC_TIMEOUT_SECONDS` | `60` | Cuánto esperar la sincronización del reloj. |

Por ejemplo, backup cada hora: `ssh root@<ip> 'BRAJA_BACKUP_SCHEDULE="0 * * * *" bash /root/bootstrap-vps.sh braja'`.

Ojo: los puertos que publica Docker no pasan por ufw. Por eso el compose publica solo 80 y 443; nunca agregues
`ports:` a MySQL ni al backend.

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
No se sube a git (`.gitignore`) ni se pega en ningún chat. Guardarlo en el gestor de contraseñas: ver
[Custodia de claves](#custodia-de-claves).

## 6. Deploy

```bash
bash deploy/deploy.sh
```

Hace, en orden:

1. Chequeos: Docker, 3 GB libres, `.env` en modo 600, checkout sin cambios.
2. **Chequeos de release** (regla 31): hace `git fetch` y exige que `HEAD` sea `origin/main`; y se niega a desplegar
   en **horario del local**, de lunes a sábado de 08:00 a 19:00 (hora de Córdoba), porque el cambio de backend corta
   la API de 30 a 60 s. Si el build terminó ya dentro del horario, vuelve a mirar y se detiene antes del cambio (las
   imágenes quedan construidas: la próxima corrida es rápida). Que el CI de ese commit esté verde no lo puede ver: es
   un paso de `docs/CHECKLIST_RELEASE.md`.
3. Build de `braja-backend:<sha>` y `braja-caddy:<sha>` (la primera vez, de 8 a 12 min con 2 vCPU).
4. MySQL arriba y **backup antes de migrar** (Flyway migra al arrancar el backend).
5. Arranque y espera de hasta 5 minutos a que `https://<dominio>/api/v1/health` responda `{"status":"UP"}` a través
   de Caddy con un certificado válido (el backend tarda unos 21 s).
6. Limpieza: borra las imágenes `braja-*` viejas salvo la anterior (la del rollback), las imágenes sin etiqueta y la
   caché de build sin usar hace más de 7 días. Sin esto el disco se llena deploy tras deploy.

Correrlo de nuevo con el mismo commit no cambia nada. `--force` (o `BRAJA_DEPLOY_FORCE=true`) saltea los dos
chequeos de release y dice cuál salteó: solo para un arreglo urgente. `--rollback` no los necesita.

| Variable (en el entorno o en `deploy/.env`) | Por defecto | Para qué |
|---|---|---|
| `BRAJA_DEPLOY_BLOCKED_DAYS` | `1-6` | Días con horario del local (1 = lunes); rango o lista: `1-6`, `1,3,5`. |
| `BRAJA_DEPLOY_BLOCKED_FROM` / `_UNTIL` | `08:00` / `19:00` | Horario del local (desde inclusive, hasta exclusive). |
| `BRAJA_DEPLOY_TIME_ZONE` | `America/Argentina/Cordoba` | Zona del local. |
| `BRAJA_DEPLOY_PRUNE` | `true` | `false` conserva la caché de build (una máquina que construye otros proyectos). |

## 7. Primer ADMIN

El primer deploy crea la empresa, la sede y el `ADMIN` con los datos del paso 5. Cuando queda sano, `deploy.sh`
apaga el bootstrap y borra la contraseña de `.env` (un arranque posterior con el bootstrap activo fallaría). Entrar
en `https://<dominio>` con ese DNI y contraseña, y desde el teléfono instalar la PWA (regla 38: probar en iPhone y en
Android).

## 8. Backup y restauración

Backup a mano: `bash deploy/backup.sh` (deja `~/braja-backups/braja-<fecha>.sql.gz`, modo 600, guarda 14 días; tarda
alrededor de un segundo y pesa unos 124 KB con los datos de prueba). El backup programado ya lo instaló el bootstrap
(`/etc/cron.d/braja-backup`, paso 3); su log es `~/braja-backups/backup.log`. Para ver cuándo corrió el último:
`ls -lt ~/braja-backups | head -3`.

El RPO es el intervalo del cron: con el backup diario, perder el servidor pierde hasta 24 h de marcas; con uno por
hora, hasta una hora. Con estos tamaños, uno por hora cuesta poco (14 días son unos 40 MB).

### Copia fuera del servidor, cifrada

Sin copia afuera, perder el VPS pierde también los backups (regla 33). **El dump no está cifrado** y contiene DNI,
nombres, puntos de GPS, hashes de contraseñas y las sesiones abiertas (cookies válidas por 30 días): la copia afuera va
siempre cifrada, con un remoto `crypt` de rclone. Nunca `scp` ni una carpeta sincronizada sin cifrar. Como `braja`:

```bash
rclone config
# 1. "n", nombre "offsite": el almacenamiento (Backblaze B2, un bucket S3, Google Drive...). Un bucket solo para esto.
# 2. "n", nombre "braja-crypt", tipo "crypt", remote "offsite:braja-backups", filename_encryption "standard",
#    y dejar que rclone genere la contraseña y la sal ("g"). Copiarlas al gestor de contraseñas antes de seguir.
chmod 600 ~/.config/rclone/rclone.conf
```

Y en `deploy/.env` (las credenciales quedan en `rclone.conf`, nunca en el comando: todo `deploy/.env` llega al backend):

```bash
BRAJA_BACKUP_OFFHOST_CMD='rclone copy "$1" braja-crypt: && rclone delete --min-age 30d braja-crypt:'
```

Copia cada backup nuevo y borra afuera los de más de 30 días. Probarlo: `bash deploy/backup.sh` y
`rclone ls braja-crypt:` (se ve el nombre); `rclone ls offsite:braja-backups` muestra nombres ilegibles: está cifrado.
Si la copia falla, el backup del cron termina con error y el monitor avisa (abajo); en un deploy solo avisa.

### Restaurar

Reemplaza **toda** la base; antes hace un backup de seguridad del estado actual y pide escribir `RESTORE` (unos 4 s con
los datos de prueba):

```bash
bash deploy/restore.sh ~/braja-backups/braja-<fecha>.sql.gz
```

Desde la copia de afuera: `rclone copy braja-crypt:braja-<fecha>.sql.gz ~/braja-backups/` y después lo mismo. Perder el
servidor entero: `RECOVERY.md`.

## Monitoreo

Dos avisos por e-mail, los dos con cuentas gratuitas. Son servicios de terceros para operar el servidor: no tocan los
datos de la app ni son parte del producto, pero D-20261014-02 (sin SaaS de terceros) habla del producto y la decisión
de usarlos es de Mateo.

- **Latido del backup** ([healthchecks.io](https://healthchecks.io) o el heartbeat de Better Stack): crear un chequeo
  con el período del cron (1 día o 1 hora) y un margen, y poner su URL en `deploy/.env`:
  `BRAJA_BACKUP_HEARTBEAT_URL='https://hc-ping.com/<uuid>'`. `backup.sh` le avisa a esa URL cuando el backup y su
  copia afuera salieron bien, y a `<url>/fail` cuando algo falló o quedan menos de 3 GB libres en el disco
  (`BRAJA_DISK_MIN_FREE_MB`). Si el cron deja de correr, el servicio avisa porque no llegó el latido. Si la URL no
  responde, el backup sigue igual.
- **La app de afuera** ([UptimeRobot](https://uptimerobot.com) o Better Stack): un monitor HTTP cada 5 min a
  `https://<dominio>/api/v1/health` que espere la palabra `UP`. Avisa si se cae el backend, Caddy, el certificado, el
  DNS o el servidor entero.

Probar los dos una vez: apagar el backend (`docker compose -p braja stop backend`) fuera de horario y ver que llega el
mail; volver con `bash deploy/deploy.sh`.

## Custodia de claves

`deploy/.env` vive solo en el servidor y **una copia en el gestor de contraseñas de Mateo, separada de los backups**.
Sin las claves de esa copia, un backup restaurado no sirve del todo:

- sin `BRAJA_HEALTH_ENCRYPTION_KEY_BASE64`, los motivos `SALUD` no se pueden leer y la bandeja responde 500 en las
  páginas que tienen uno;
- sin `BRAJA_VAPID_PUBLIC_KEY`, `BRAJA_VAPID_PRIVATE_KEY` y `BRAJA_PUSH_SUBSCRIPTION_ENCRYPTION_KEY_BASE64`, cada
  teléfono tiene que volver a activar los avisos.

Reglas: guardar la copia apenas termina el primer deploy (el deploy apaga el bootstrap y borra su contraseña del
archivo) y otra vez cada vez que cambia `deploy/.env`. Guardar también la contraseña y la sal del remoto `crypt` (sin
ellas los backups de afuera no se pueden abrir) y las credenciales del almacenamiento. Nunca en el mismo lugar que los
backups: quien consiga uno no tiene que conseguir también el otro.

## 9. Actualizar

```bash
cd ~/fichaje && git pull --ff-only && bash deploy/deploy.sh
```

Seguir `docs/CHECKLIST_RELEASE.md`. Solo se despliega lo que está en `main` con CI verde (regla 31): el deploy
comprueba `main` y el horario; el CI se mira en GitHub.

## 10. Rollback

Si la versión nueva no queda sana, `deploy.sh` vuelve solo a la anterior e informa si la base cambió:

- "no migration ran": no hay que restaurar nada.
- "migrations ran ... NOT undone automatically": la base quedó con el esquema nuevo. Si la versión anterior falla con
  él, correr el `restore.sh` que imprime, con el backup tomado justo antes (se pierde lo escrito desde entonces).

Para volver a mano a la versión anterior: `bash deploy/deploy.sh --rollback` (hace un backup antes; no pide `main` ni
fuera de horario, porque es el arreglo).

## 11. Logs y estado

```bash
docker compose -p braja ps
docker compose -p braja logs -f --tail 100 backend
docker compose -p braja logs --tail 100 caddy
curl -fsS https://<dominio>/api/v1/health
docker system df                       # cuánto disco usan imágenes, caché y volúmenes
timedatectl                            # "System clock synchronized: yes"
tail -n 20 ~/braja-backups/backup.log  # el último backup programado
```

MySQL guarda sus binlogs 7 días (`--binlog-expire-logs-seconds`, no 30 como por defecto): solo servirían para una
recuperación a un punto en el tiempo que este runbook no usa.

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
