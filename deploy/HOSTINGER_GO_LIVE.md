# Salida a producción en Hostinger

Guía para que Enrique contrate y prepare el VPS de Hostinger y deje Fichaje Braja andando, en el orden de la fase 3 de
la misión del 2026-11-15 (`odd/tasks/go-live.md`, L3). Cada paso dice qué hacer, qué salida esperar, cómo darse cuenta
de un error y qué evidencia mandarle a Mateo. Los comandos son los de los scripts de esta carpeta (`README.md`,
`RECOVERY.md`); los datos de Hostinger salen de su documentación oficial, consultada el 2026-11-15
([Fuentes](#fuentes)). Lo que esa documentación no dice está marcado **(sin verificar)**.

Marcadores: `<IP_DEL_VPS>` (la IPv4 del panel), `<DOMINIO_REAL>` (el nombre elegido en el paso de DNS),
`<SHA_DE_MAIN>` (el commit de `main` que Mateo aprueba, completo). Nunca escribir una contraseña en este archivo, en un
chat, en un mail ni en un issue.

## Antes de empezar

| Hace falta | Quién | Para qué paso |
|---|---|---|
| OK de Mateo a D-20261115-01 (Hostinger KVM 2) y el `<SHA_DE_MAIN>` aprobado, con CI verde | Mateo | Contratar, 5, 10, 15 |
| El dominio o subdominio (alternativa A o B, abajo) | Mateo | 3 |
| DNI, nombre y sede del primer `ADMIN`; un mail de contacto para los avisos push (`mailto:`) | Mateo con Braja | 11 |
| Intervalo del backup: por defecto diario a las 03:15 de Córdoba; uno por hora está pendiente de Mateo (`RECOVERY.md`, «Intervalo de backup») | Mateo | 5 |
| Almacenamiento externo de **otro proveedor**, no de Hostinger (por ejemplo Backblaze B2 o Cloudflare R2, con credenciales que suben pero no borran; `RECOVERY.md`, «Almacenamiento externo»; decide Mateo) | Mateo | 13 |
| Dos pares de claves `age` generados en la PC de Mateo, nunca en el VPS (`RECOVERY.md`, «Cifrado y custodia de claves»); al VPS van solo las dos claves públicas `age1…` | Mateo | 13, 21 |
| Cuentas de los dos monitores por mail (`README.md`, «Monitoreo»; decide Mateo) | Mateo | 14 |
| Un gestor de contraseñas donde Mateo guarda `deploy/.env`, las claves privadas `age`, la contraseña de root y la contraseña de `sudo` de `braja` | Mateo | 5, 11, 13, 18 |
| Una clave SSH de Enrique (`ssh-keygen -t ed25519 -C "enrique-braja-vps"`, con frase de paso) | Enrique | Contratar |
| Horario: `deploy.sh` no despliega de lunes a sábado de 08:00 a 19:00 (Córdoba) | — | 15, 22 |
| Para habilitar a los empleados: la aceptación **por escrito** de Braja del riesgo de suplantación, porque marcan sin passkey (D-20261115-03) | Mateo con Braja | 23 |

## Lo que nunca se hace

Estas operaciones pierden datos o dejan el servidor sin protección. Si un error parece pedir una de ellas, se frena y se
consulta a Mateo.

- `docker compose down -v`, `docker volume rm`, `docker volume prune` o `docker system prune --volumes`: borran la base.
- Borrar `deploy/.env` para volver a correr `gen-secrets.sh`: una clave de salud nueva deja ilegibles los motivos
  `SALUD` ya guardados.
- `bash deploy/deploy.sh --force` sin autorización de Mateo (salvo lo que manda `RECOVERY.md` en una emergencia).
- `bash deploy/restore.sh` **sin** `--check` sobre la base real sin una operación aprobada por Mateo: reemplaza toda la
  base. Para probar un backup alcanza `--check`, que no cambia nada.
- En hPanel, **Change OS** o **Reinstall** una vez que hay datos: borran el disco entero y el snapshot.
- Restaurar un backup o un snapshot de Hostinger sobre el servidor en uso: pisa todo el disco y pierde las marcas
  posteriores.
- Cerrar la única sesión de administración antes de probar otra nueva (pasos 1, 4 y 5).
- `ufw disable`, agregar `ports:` a `mysql` o `backend`, cargar un registro `AAAA`.
- Generar las claves `age` en el VPS o dejar ahí una clave privada `age` después de usarla.
- Dejar que el asistente de IA de hPanel (Kodee o Hostinger Agent) cambie el firewall, SSH o el sistema: cada cambio
  pasa por esta guía.
- Pegar `deploy/.env`, `rclone.conf`, una contraseña, una clave privada (SSH o `age`) o la URL del latido en un chat o
  un mail.

## 1. Qué elegir en Hostinger

| Elegir | No elegir |
|---|---|
| **VPS KVM 2**: 2 vCPU, 8 GB de RAM, 100 GB NVMe, 1 IPv4 y 1 IPv6. | KVM 1 (1 vCPU, 4 GB): el compose le da al backend `cpus: 1.5` y Docker rechaza más CPU de las que tiene el servidor, así que no arranca sin cambiar el compose (no probado en un KVM 1). Un plan mayor, sin evidencia ([Recursos](#6-recursos-medir-y-decidir)). |
| **Ubicación**: la decide Mateo (latencia, precio, dónde quedan los datos). Brasil es la única de Sudamérica para VPS. La ubicación **no se puede cambiar después**. | Elegir a la ligera: mudarse es crear otro VPS y reinstalar. |
| **Sistema**: pestaña **Plain OS**, **Ubuntu 24.04** (sin software ni escritorio). | Pestañas **Control Panel**, **Application** y **Docker Application**: CloudPanel, Coolify, Dokploy, Easypanel, Portainer, cPanel, «Ubuntu 24.04 with Docker» y similares. Duplican Docker, Caddy o el firewall, y algunas cobran licencia. Tampoco Ubuntu 22.04 ni 26.04. |
| **Clave SSH**: pegar la clave **pública** (`~/.ssh/id_ed25519.pub`) durante la configuración inicial. | Pegar la clave privada (el archivo sin `.pub`). |
| **Contraseña de root**: una larga, generada por el gestor, guardada ahí. Es la entrada de la Web Console si falla SSH. | Una contraseña reutilizada o anotada fuera del gestor. |
| Backups semanales incluidos: dejarlos como están. | **Daily backups** (es un **Upgrade** pago) sin decisión de Mateo. **Malware Scanner** (Monarx): instala un agente y bloquea el VPS hasta 60 min; su limpieza automática es paga. No activarlo en la salida. Un almacenamiento de Hostinger para los backups: no protege si se pierde la cuenta. |

Si el plan contratado no es KVM 2, medir antes de desplegar ([Recursos](#6-recursos-medir-y-decidir)) y avisarle a
Mateo: D-20261115-01 lo pide.

## 2. Mapa de hPanel

Todo empieza en **VPS** → **Manage** (al lado del servidor). Los nombres de los menús pueden cambiar; si uno no aparece,
buscarlo en el panel y anotar dónde estaba.

| Qué | Dónde | Nota |
|---|---|---|
| IPv4 pública | **Overview** (bloque de SSH y de detalles del VPS); también en la lista de VPS, al lado de Status | Copiar la IPv4: es `<IP_DEL_VPS>`. La IPv6 que aparece **no** se usa. |
| Sistema operativo | **OS & Panel** → **Operating System** → **Plain OS** → Ubuntu 24.04 → **Change OS** | Borra todo el disco y el snapshot. Solo antes del primer deploy. |
| Claves SSH | **Settings** → **SSH keys** → **Add SSH key** | No dice en qué usuario la instala ni si vale sin reinstalar **(sin verificar)**: se comprueba en el paso 1. |
| Contraseña de root | **Settings** → **Root password** (o **Change** en Overview) | No se puede ver, solo cambiar. |
| Firewall administrado | **Security** → **Firewall** | Paso 4. |
| DNS de un dominio de Hostinger | **Domains** → **DNS** (DNS Zone Editor) | Paso 3. |
| Uso de recursos | **Backups & Monitoring** → **Server Usage** | CPU, RAM, disco y tráfico; 24 h, semana, mes o año; hora GMT+0. |
| Consola si falla SSH | **Overview** → **Web Console** (abre otra pestaña; permitir ventanas emergentes) | Suele entrar sola como root; si pide usuario, `root` y su contraseña. La configuración de SSH no la afecta. |
| Modo de emergencia | **Settings** → **Emergency mode** | Si el sistema no arranca. Dura hasta 24 h; los archivos quedan bajo `/mnt`. |
| Backups y snapshots | **Backups & Monitoring** → **Snapshots & Backups**; estado en **Latest actions** | [Sección 8](#8-backups-y-snapshots-de-hostinger). |

## 3. Dominio

HTTPS es obligatorio (la push y la ubicación no andan sin él), y Caddy pide el certificado a Let's Encrypt solo, si el
nombre apunta a `<IP_DEL_VPS>` y los puertos 80 y 443 están abiertos.

**Alternativa A, recomendada: un subdominio propio**, por ejemplo `fichaje` bajo un dominio de Braja.

- Dominio en Hostinger: **Domains** → **DNS** → elegir el dominio. Borrar los registros `A`, `AAAA` o `CNAME` que ya
  existan para ese nombre. Agregar un registro **`A`**, nombre `fichaje` (solo esa parte), valor `<IP_DEL_VPS>`, TTL
  **300** (Hostinger propone 14400; con 300 una mudanza llega en minutos, `RECOVERY.md`). Preferir un subdominio al
  dominio raíz: en el raíz, Hostinger no deja manejar los `AAAA` mientras su CDN esté activa.
- Dominio en otro proveedor: el mismo registro `A` en el DNS de ese proveedor. No hace falta mover el dominio.

**Alternativa B, sin dominio propio: un subdominio gratuito de [DuckDNS](https://www.duckdns.org)**
(`<nombre>.duckdns.org`). Se crea con una cuenta gratuita, se carga `<IP_DEL_VPS>` en el campo IPv4 y se deja **vacío**
el de IPv6. La IP del VPS es fija: no hace falta instalar su actualizador. Es un tercero gratuito sin garantía de
servicio; el nombre lo elige Mateo. No usar el nombre `srv…hstgr.cloud` que muestra Hostinger: su documentación lo llama
temporal.

En los dos casos: **solo `A`, nunca `AAAA`**. Por IPv6, Docker le muestra a Caddy la IP de su gateway y el límite de
login por IP trataría a todos los clientes como uno (D-20261102-12). El compose publica 80 y 443 solo en IPv4.

## 4. Paso a paso

**S1** es la primera sesión de root, abierta en el paso 1, y no se cierra hasta terminar el paso 5. Las demás pruebas
se hacen desde terminales nuevas de la PC de Enrique, donde el paso lo pide. Desde el paso 5, `sudo` pide la contraseña
de `braja`: cada comando con `sudo` que se lanza desde la PC lleva `ssh -t` (sin terminal no la puede pedir). Si un
comando no da la salida esperada, no seguir: ver [Recuperarse sin reinstalar](#7-recuperarse-sin-reinstalar).

### Acceso

**Paso 1. Comprobar SSH.** Desde la PC:

```bash
ssh -o PasswordAuthentication=no root@<IP_DEL_VPS> 'whoami'
```

- Esperado: la primera vez pregunta por la huella del servidor. Compararla con la que da la Web Console
  (`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`), escribir `yes`, y la salida es `root`.
- Error `Permission denied (publickey)`: la clave no quedó instalada. En la Web Console, como root:
  `mkdir -p /root/.ssh && chmod 700 /root/.ssh && nano /root/.ssh/authorized_keys`, pegar la línea del `.pub`, guardar,
  `chmod 600 /root/.ssh/authorized_keys`, y repetir.
- Error `Connection timed out`: firewall del panel (paso 4) o IP equivocada.

Dejar abierta una sesión interactiva como **S1**: `ssh root@<IP_DEL_VPS>`.

**Paso 2. Verificar Ubuntu 24.04 limpio.** En S1:

```bash
grep -E '^(ID|VERSION_ID)=' /etc/os-release
command -v docker || echo "sin docker"
ss -tlnp
```

- Esperado: `ID=ubuntu`, `VERSION_ID="24.04"`, `sin docker`, y `ss` muestra solo `sshd` en el puerto 22 (y quizá un
  resolvedor local en `127.0.0.53` o `127.0.0.54`, puerto 53).
- Error: otra versión, Docker ya instalado o un panel escuchando (puertos como 8443, 8090 o 3000): **Change OS** →
  **Plain OS** → Ubuntu 24.04. Solo ahora, que no hay datos. Después, volver al paso 1.

**Paso 3. Verificar IPv4 y DNS.** En S1: `ip -4 -br addr show scope global` muestra `<IP_DEL_VPS>/…`. En la PC:

```bash
nslookup <DOMINIO_REAL>
nslookup -type=AAAA <DOMINIO_REAL>
```

- Esperado: la primera da `Address: <IP_DEL_VPS>`; la segunda no da ninguna dirección IPv6.
- Error: otra IP o ninguna: revisar el registro `A` y esperar (Hostinger habla de hasta 24 h; con TTL 300 suelen ser
  minutos). Aparece una IPv6: borrar el `AAAA` (o el campo IPv6 de DuckDNS). No seguir al deploy sin esto.

**Paso 4. Firewall del panel.** El firewall de Hostinger filtra antes de que el tráfico llegue al servidor, así que
también frena los puertos que publica Docker (ufw no). Al activarse, **descarta todo lo que no tenga una regla de
aceptar**, y un grupo sin reglas bloquea todo.

1. Con S1 abierta: **Security** → **Firewall** → crear un grupo `braja-produccion` con estas reglas y ninguna otra:

   | Acción | Protocolo | Puerto | Origen | Para qué |
   |---|---|---|---|---|
   | Accept | TCP (SSH) | 22 | Anywhere | Administración |
   | Accept | TCP (HTTP) | 80 | Anywhere | Certificado de Let's Encrypt y redirección a HTTPS |
   | Accept | TCP (HTTPS) | 443 | Anywhere | La app |
   | Accept | UDP | 443 | Anywhere | HTTP/3: el compose publica `443/udp` y Caddy lo sirve. Sin esta regla los navegadores vuelven a TCP. |

   Nunca 3306 (MySQL) ni 8080 (backend): no se publican y no se abren.
2. Activar el grupo en el VPS. Hostinger aplica los cambios en dos minutos o menos y solo a conexiones nuevas: S1 sigue
   viva.
3. Esperar dos minutos y abrir una sesión **nueva** desde la PC: `ssh root@<IP_DEL_VPS> 'echo SSH-OK'` → `SSH-OK`.
4. Desde la PC, que lo demás no conteste. Windows (PowerShell): `Test-NetConnection <IP_DEL_VPS> -Port 3306` y
   `-Port 8080` dan `TcpTestSucceeded : False`. Linux o macOS: `nc -vz -w 5 <IP_DEL_VPS> 3306` falla.

- Error en 3: no cerrar S1. Corregir la regla de 22 o desactivar el grupo en el panel, esperar dos minutos y repetir.
- El ping deja de responder: es lo esperado, no hay regla para ICMP. Los monitores usan HTTPS.

### Servidor

**Paso 5. Bootstrap, en dos pasos.** El paso 1 prepara el servidor y nunca toca SSH; el paso 2 cierra el login por
contraseña y el de root, y se niega a hacerlo si `braja` no demostró antes que entra con su clave, usa `sudo` y llega a
Docker.

En la PC, bajar el script del commit aprobado y copiarlo a root (en PowerShell, `curl.exe` en lugar de `curl`):

```bash
curl -fsSLo bootstrap-vps.sh https://raw.githubusercontent.com/mateoscns/Braja-Ingreso-Egreso/<SHA_DE_MAIN>/deploy/bootstrap-vps.sh
scp bootstrap-vps.sh root@<IP_DEL_VPS>:/root/
```

**5.1. Paso 1 del bootstrap, en S1** (una sesión interactiva: equivale a
`ssh -t root@<IP_DEL_VPS> 'bash /root/bootstrap-vps.sh braja'`, y además deja S1 abierta para después):

```bash
bash /root/bootstrap-vps.sh braja; echo "exit=$?"
```

Solo si Mateo eligió el backup por hora: `BRAJA_BACKUP_SCHEDULE="0 * * * *" bash /root/bootstrap-vps.sh braja; echo "exit=$?"`.
Sin `| tee`: un pipe esconde el código de salida.

A mitad del paso pide elegir la contraseña de `sudo` de `braja` (`New password:` y `Retype new password:`): generarla en
el gestor, guardarla ahí y pegarla. SSH nunca la acepta después del paso 2; solo la usa `sudo`.

- Esperado, entre otras líneas: `[bootstrap] Clock synchronized: …`, `Docker Compose version v…`, la tabla de `ufw` con
  `22/tcp`, `80/tcp`, `443/tcp` y `443/udp` en `ALLOW IN`, `[bootstrap] Deploy user: braja`,
  `[bootstrap] Copied root's authorized SSH keys to braja`, `[bootstrap] Choose the password braja types for sudo …`,
  `passwd: password updated successfully`, `[bootstrap] Backup schedule: '15 6 * * *' (server time), log: /home/braja/braja-backups/backup.log`,
  `[bootstrap] Note: /home/braja/fichaje is not cloned yet; …`,
  `[bootstrap] SSH: unchanged (password and root logins still work). Step 2, keeping THIS session open:`,
  `[bootstrap] Done…` y `exit=0`.
- `WARNING: listening on a public address besides 22, 80 and 443`: un servicio que nadie pidió. Mandarle a Mateo la
  lista que imprime antes de seguir.
- `WARNING: braja has no password, so its sudo does not work yet`: en S1, `passwd braja`, y volver a correr el paso 1.
- `[bootstrap] ERROR: …`: dice qué falló. El script se puede correr de nuevo sin romper nada.

**5.2. Paso 2 del bootstrap**, con S1 todavía abierta, desde una terminal **nueva** de la PC, entrando como `braja` con
su clave:

```bash
scp bootstrap-vps.sh braja@<IP_DEL_VPS>:
ssh -t braja@<IP_DEL_VPS> 'sudo bash bootstrap-vps.sh --harden-ssh braja'
```

`sudo` pide la contraseña de `braja` (`[sudo] password for braja:`).

- Esperado: `[bootstrap] braja logged in with its key, used sudo and reaches Docker: closing SSH password and root logins`,
  `[bootstrap] SSH: key only; root login: no. Keep this session open and check from a THIRD terminal:` y las líneas de
  comprobación y de vuelta atrás.
- `sshd has no logged public-key login of braja`: entrar una vez como `braja` (`ssh braja@<IP_DEL_VPS>`) y repetir.
  Solo si los registros de `sshd` se perdieron y ya se entró con la clave:
  `ssh -t braja@<IP_DEL_VPS> 'sudo env BRAJA_SSH_KEY_LOGIN_VERIFIED=yes bash bootstrap-vps.sh --harden-ssh braja'`.
- `docker does not work for braja`: salir, volver a entrar y repetir.
- `authorized_keys is missing, empty, not owned by braja or writable by others`: en S1,
  `ls -l /home/braja/.ssh/authorized_keys` (tiene que existir, ser de `braja` y modo 600).
- Para dejar entrar a root con clave (no es lo recomendado): agregar `env BRAJA_PERMIT_ROOT_LOGIN=prohibit-password`
  después de `sudo`. Las dos variables de este paso van así, después de `sudo env`, porque `sudo` descarta las del
  entorno.

**5.3. Comprobar desde una tercera terminal**, todavía sin cerrar S1:

```bash
ssh -t braja@<IP_DEL_VPS> 'sudo -v && docker ps'
ssh root@<IP_DEL_VPS> true
ssh -t braja@<IP_DEL_VPS> "sudo sshd -T | grep -Ei '^(passwordauthentication|permitrootlogin) '"
```

- Esperado: la primera pide la contraseña de `braja` y muestra la cabecera de `docker ps` (`CONTAINER ID   IMAGE …`, sin
  contenedores todavía); root da `Permission denied (publickey)`; la tercera, `passwordauthentication no` y
  `permitrootlogin no`.
- Error: con S1 abierta, volver atrás con `rm /etc/ssh/sshd_config.d/01-braja-hardening.conf && systemctl reload ssh`
  (o, sin S1, desde la Web Console como root) y revisar el mensaje del paso 2.

Recién con las tres comprobaciones bien se cierra S1. Desde acá todo se hace como `braja`: `ssh braja@<IP_DEL_VPS>`.

**Paso 6. Reloj (NTP).** `timedatectl`

- Esperado: `System clock synchronized: yes`, `NTP service: active`, `Time zone: Etc/UTC (UTC, +0000)`.
- Error: no sincronizado → `timedatectl timesync-status`; el VPS tiene que poder salir por UDP 123. Otra zona → el
  bootstrap lo avisó; el horario del backup y del reinicio se leen en esa zona. Cada marca usa este reloj: no desplegar
  sin `yes`.

**Paso 7. Docker, Compose y age.**

```bash
docker version --format '{{.Server.Version}}'
docker compose version
systemctl is-enabled docker
age --version
```

- Esperado: una versión de Docker, `Docker Compose version v2…`, `enabled` y una versión de `age`, sin `sudo`.
- Error `permission denied … docker.sock`: salir y volver a entrar (el grupo `docker` se aplica al iniciar sesión).

**Paso 8. Memoria, swap, disco e inodos.** Correr los comandos de [Recursos](#6-recursos-medir-y-decidir) y guardar la
salida. Esperado en un KVM 2: `nproc` da 2; `free -h` da unos 7,x GiB de memoria y 2,0 GiB de swap; `df -h /` más de 90
GB libres; `df -i /` con poco uso.

### Aplicación

**Paso 9. Clonar.**

```bash
git clone https://github.com/mateoscns/Braja-Ingreso-Egreso.git ~/fichaje
```

Va en `~/fichaje`: es donde lo busca el cron del backup.

**Paso 10. Confirmar el commit y el CI.** En el servidor:

```bash
cd ~/fichaje && git fetch origin main && git rev-parse HEAD origin/main
```

Las dos líneas tienen que ser `<SHA_DE_MAIN>`. Si no, avisarle a Mateo: `main` cambió desde que lo aprobó. Desde la PC
(con `gh` instalado y sesión iniciada):

```bash
gh api repos/mateoscns/Braja-Ingreso-Egreso/commits/<SHA_DE_MAIN>/check-runs --jq '.check_runs[] | "\(.name): \(.conclusion)"'
```

Esperado: `Backend (Java 21 + MySQL 8.4): success`, `Backend campaign (MySQL 8.4): success` y
`Frontend (Node 24): success`. Sin `gh`, lo mismo en la pestaña Actions de GitHub. `deploy.sh --sha` comprueba el commit
y `main`, no el CI.

**Paso 11. Secretos.** Como `braja`, nunca con `sudo` (si lo crea root, `braja` no lo puede leer y el deploy se
detiene):

```bash
cd ~/fichaje
bash deploy/gen-secrets.sh --domain <DOMINIO_REAL> --vapid-subject mailto:<EMAIL_DE_CONTACTO> \
  --admin-dni <DNI_DEL_ADMIN> --admin-name "<NOMBRE_DEL_ADMIN>" --company "Braja" --site "<NOMBRE_DE_LA_SEDE>" \
  --time-zone America/Argentina/Cordoba
```

Pide dos veces la contraseña del primer `ADMIN` (de 16 caracteres a 72 bytes; no se ve al escribirla). La escribe la
persona que va a ser `ADMIN`, o se genera en el gestor de Mateo; no viaja por chat.

- Esperado: `Created /home/braja/fichaje/deploy/.env (mode 600, owner braja) with new secrets for <DOMINIO_REAL>. No secret was printed.`,
  y las indicaciones para copiar el archivo al gestor después del primer deploy (paso 18).
- Error `already exists; it is never overwritten`: no borrarlo; avisarle a Mateo.

**Paso 12. Permisos.**

```bash
stat -c '%a %U %n' ~ ~/fichaje/deploy/.env ~/braja-backups
git -C ~/fichaje check-ignore deploy/.env
git -C ~/fichaje status --porcelain
```

Esperado: `750 braja /home/braja`, `600 braja …/.env` y `700 braja …/braja-backups`; `check-ignore` imprime
`deploy/.env` (git lo ignora); `status` no imprime nada. Error: `chmod 600 ~/fichaje/deploy/.env` o
`chmod 700 ~/braja-backups`.

**Paso 13. Copia cifrada fuera del VPS.** Con `age` (`RECOVERY.md`, «Cifrado y custodia de claves»): el servidor solo
tiene las claves públicas, así que puede cifrar pero nunca descifrar.

1. En la PC de Mateo, no en el VPS: `age-keygen -o braja-backup-mateo.key` y `age-keygen -o braja-backup-respaldo.key`.
   Cada uno imprime su clave pública (`age1…`). Los dos `.key` van al gestor; el de respaldo, además, impreso en un
   sobre en otro lugar.
2. En el VPS, como `braja`: `rclone config` → `n`, nombre `offsite`, el almacenamiento elegido por Mateo, con sus
   credenciales de solo subida. Sin remoto `crypt`: el archivo ya sale cifrado. Después:
   `chmod 600 ~/.config/rclone/rclone.conf`.
3. Agregar a `deploy/.env` con `nano ~/fichaje/deploy/.env` (las dos claves públicas, separadas por un espacio):

   ```bash
   BRAJA_BACKUP_AGE_RECIPIENTS='<CLAVE_PUBLICA_MATEO> <CLAVE_PUBLICA_RESPALDO>'
   BRAJA_BACKUP_OFFHOST_CMD='rclone copy "$1" offsite:braja-backups'
   ```

   Con una credencial que no puede borrar, la retención de afuera (propuesta: 30 días) la hace una regla del bucket.

- Esperado ahora: `rclone lsd offsite:` responde sin error y `stat -c %a ~/fichaje/deploy/.env` sigue en `600`. La
  copia real se prueba en el paso 20.
- Alternativa no recomendada: el remoto `crypt` de rclone (`README.md` §8); con él, quien entre al VPS puede leer los
  backups de afuera.

**Paso 14. Monitoreo.** Según `README.md`, «Monitoreo»: crear el latido del backup con el período del cron y un margen
(1 día + 1 h, o 1 h + 15 min) y agregar `BRAJA_BACKUP_HEARTBEAT_URL` a `deploy/.env`; crear el monitor HTTP cada 5 min
a `https://<DOMINIO_REAL>/api/v1/health` que espere `UP`. Queda en rojo hasta el paso 16: es lo esperado.

**Paso 15. Deploy.** Fuera de lunes a sábado de 08:00 a 19:00 (Córdoba). Sin `--force`.

```bash
cd ~/fichaje && bash deploy/deploy.sh --sha <SHA_DE_MAIN>; echo "exit=$?"
```

El primer build tarda de 8 a 12 minutos. Esperado, en orden: `HEAD <sha> is the approved commit <SHA_DE_MAIN>`,
`HEAD is origin/main (<12 caracteres>); check that its CI is green`, `Building images…`,
`Restore check: the backup and the live database are both empty (no migration has run yet)`,
`Backup complete and checked: …`, `Backup before migrating: … (schema none)`,
`Waiting up to 300s for https://<DOMINIO_REAL>/api/v1/health`, `Healthy`,
`First ADMIN created; turning the bootstrap off and removing its password…`, otra vez `Healthy`,
`Deployed <12 caracteres> (schema …)` y `exit=0`.

- `is not the approved commit`: el clon no está en `<SHA_DE_MAIN>`. Volver al paso 10; no usar `--force` (tampoco
  saltea esta comprobación).
- `inside the shop hours`: esperar al horario permitido y repetir.
- `BACKUP FAILED`: el deploy se detiene antes de migrar; la línea anterior dice por qué (disco, base inaccesible).
- `The backend is healthy, but https://… does not answer through Caddy`: falta DNS o certificado. Revisar el paso 3, las
  reglas 80 y 443 del paso 4 y `docker compose -p braja logs --tail 50 caddy`. Corregir y correr `deploy.sh` una vez
  más; no en bucle (Let's Encrypt limita los intentos fallidos por hora).
- `The backend itself is not healthy`: `docker compose -p braja logs --tail 100 backend`, mandarle a Mateo las líneas de
  error sin valores de `.env`.

### Verificación

**Paso 16. HTTPS y salud, desde afuera.** En la PC:

```bash
curl -fsS https://<DOMINIO_REAL>/api/v1/health
curl -sI https://<DOMINIO_REAL>/
curl -sI http://<DOMINIO_REAL>/
```

Esperado: `{"status":"UP"}`; la segunda con estado 200 y la cabecera `Strict-Transport-Security: max-age=31536000`
(puede salir en minúsculas); la tercera redirige a `https://`. En el servidor, `docker compose -p braja ps`: `mysql` y
`backend` `Up … (healthy)`, `caddy` `Up`, y solo `caddy` con puertos (`0.0.0.0:80`, `0.0.0.0:443` TCP y UDP). Repetir
las pruebas de 3306 y 8080 del paso 4. El monitor de la app pasa a verde.

**Paso 17. Primer `ADMIN`.** Abrir `https://<DOMINIO_REAL>` y entrar con el DNI y la contraseña del paso 11. Esperado:
la vista del `ADMIN` con la empresa y la sede. Error de credenciales: no volver a correr `gen-secrets.sh`; avisarle a
Mateo.

**Paso 18. Secretos del bootstrap apagados.** Sin mostrar el archivo:

```bash
grep -c "^BRAJA_BOOTSTRAP_ENABLED='false'" ~/fichaje/deploy/.env
grep -c "^BRAJA_BOOTSTRAP_PASSWORD=''" ~/fichaje/deploy/.env
```

Esperado: `1` y `1`. Si da `0`, no seguir: avisarle a Mateo con la salida de `deploy.sh`. Recién ahora Mateo guarda la
copia de `deploy/.env` en su gestor (desde su PC: `scp braja@<IP_DEL_VPS>:fichaje/deploy/.env ./braja.env`, adjuntarlo
al gestor y borrar `braja.env`). Se repite cada vez que cambia `deploy/.env`.

**Paso 19. Prueba funcional.** Con una sede y un empleado de prueba, con nombres que digan «Prueba», el flujo mínimo de
la fase 4 de la misión (sede, horario, empleado, jornada, entrada, pausa, regreso, salida, historial, auditoría, GPS y
acciones del `ADMIN`) y las pruebas en teléfonos reales M-1 a M-14 de `docs/UX_UI_GUIDELINES.md` §10. No hay forma de
borrar esos registros: al terminar, dar de baja al empleado de prueba. Borrarlos del todo exigiría reemplazar la base
con un backup anterior a la prueba (`restore.sh` sin `--check`): solo con la aprobación expresa de Mateo y antes de
cargar datos reales.

**Paso 20. Backup.**

```bash
bash deploy/backup.sh; echo "exit=$?"
ls -l ~/braja-backups
rclone ls offsite:braja-backups
cat /etc/cron.d/braja-backup
```

- Esperado: `Restore check of braja-<fecha>.sql.gz in a throwaway database …` con una tabla de filas,
  `Restore check passed: … tables and … rows loaded, then dropped`, `Backup complete and checked: …`,
  `Encrypted for 2 age recipient(s); this server cannot decrypt it`, `Copying braja-<fecha>.sql.gz.age off this server`,
  la ruta del backup y `exit=0`, sin ningún `WARNING` ni `BACKUP FAILED`. En `~/braja-backups`, cada
  `braja-<fecha>.sql.gz` con su `.sha256`, modo 600. Afuera, `braja-<fecha>.sql.gz.age`. El latido queda en verde. `cat`
  muestra el horario elegido.
- Después de la primera corrida programada: `tail -n 5 ~/braja-backups/backup.log` termina sin `BACKUP FAILED`.

**Paso 21. Prueba de restauración, sin tocar la base.** `restore.sh --check` carga un backup en una base descartable,
muestra sus filas al lado de las de la base real y la borra: no cambia nada y no corta el servicio. Hecho con el
archivo de afuera, prueba también la clave privada y el almacenamiento:

```bash
mkdir -p -m 700 ~/braja-restore-test
rclone copy offsite:braja-backups/<ARCHIVO>.sql.gz.age ~/braja-restore-test/
(umask 077; cat > ~/restore.key)
time bash deploy/restore.sh --check ~/braja-restore-test/<ARCHIVO>.sql.gz.age --identity ~/restore.key
shred -u ~/restore.key
rm -r ~/braja-restore-test
```

`<ARCHIVO>` es el del paso 20. En la tercera línea, Mateo pega su clave privada `age` y termina con Ctrl-D; la quinta la
borra del servidor. Esperado: `Decrypting …`, la tabla de filas, `Restore check passed: …` y
`Nothing was changed: the throwaway database was dropped. … can be restored.` Anotar el tiempo.

- `could not be decrypted`: no es la clave privada que corresponde a las públicas del paso 13.
- `does not load into a throwaway database`: ese backup no sirve; avisarle a Mateo.

**Paso 22. Reinicio.** Fuera del horario del local, en la sesión de `braja`: `sudo reboot` (pide la contraseña). A los 2
o 3 minutos, volver a entrar y:

```bash
docker compose -p braja ps
timedatectl
swapon --show
sudo ufw status
```

Esperado sin tocar nada: los tres contenedores `Up` (`mysql` y `backend` `healthy`), reloj sincronizado, `/swapfile`
activo, `Status: active`. Desde la PC, `curl -fsS https://<DOMINIO_REAL>/api/v1/health` da `{"status":"UP"}` y el
`ADMIN` entra con sus datos: la empresa no se volvió a crear.

### Entrega

**Paso 23. Acceso operativo.** Mateo manda su clave **pública**; Enrique la agrega en una línea nueva de
`~/.ssh/authorized_keys` de `braja` (`nano ~/.ssh/authorized_keys`) y Mateo prueba
`ssh -t braja@<IP_DEL_VPS> 'sudo -v && docker ps'` con la contraseña de `sudo` del gestor. Cómo accede Mateo a hPanel lo
deciden ellos. Mandar la evidencia de la [sección 10](#10-evidencia-para-mateo) y marcar `docs/CHECKLIST_SALIDA.md`.

Los empleados empiezan a usar la app recién cuando Braja aceptó por escrito el riesgo de suplantación (D-20261115-03):
hasta que estén las passkeys, quien conoce el DNI y la contraseña de otro empleado puede marcar por él.

## 5. Después de la salida

Cada actualización sigue `docs/CHECKLIST_RELEASE.md` (`deploy.sh --sha` con el commit aprobado). Una vez por mes, el
paso 21 con el backup más reciente de afuera. Si la app se cae o se pierde el servidor: `RECOVERY.md`; perder el
servidor pierde las marcas hechas después del último backup que llegó afuera.

## 6. Recursos: medir y decidir

```bash
nproc; lscpu | grep -E '^(Model name|CPU\(s\))'
free -h; swapon --show
uptime; vmstat 5 3
df -h /; df -i /
docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}'
docker system df
sudo journalctl -k --since "-7 days" | grep -Ei 'out of memory|oom-kill' || echo "sin OOM"
```

El último pide la contraseña de `braja`. Medir tres veces: antes del deploy (paso 8), durante el primer build (en otra
sesión) y con la app andando. Además, en hPanel, **Server Usage** (24 h y semana).

| Recurso | Señal de que alcanza | Señal de que no |
|---|---|---|
| RAM | `free -h`: más de 2 GiB en `available` con la app andando; `sin OOM` | Mensajes OOM, o `available` cerca de cero |
| Swap | Casi sin uso con la app andando | Uso que crece y se mantiene |
| CPU | `uptime`: carga menor a 2 en reposo; en `vmstat`, `st` (CPU robada por el proveedor) cerca de 0 | Carga alta sostenida sin build en curso; `st` alto sostenido |
| Contenedores | `docker stats`: `mysql` bajo 1 GiB, `backend` bajo 1,25 GiB, `caddy` bajo 256 MiB | `MemPerc` cerca de 100 % sostenido (es el límite del compose, no del plan) |
| Disco | `df -h /`: más de 10 GB libres; `deploy.sh` exige 3 GB y el backup avisa por debajo de 3 GB | Libre que baja deploy tras deploy: `docker system df` |
| Inodos | `df -i /`: `IUse%` bajo 50 % (Hostinger los declara ilimitados, pero el sistema de archivos tiene un tope) | `IUse%` alto |

Créditos de CPU: Hostinger deja usar el 100 % de las vCPU mientras haya créditos; la línea de base es el 60 % y un saldo
lleno alcanza para unas tres horas al 100 %. Sin créditos, el KVM 2 baja al 30 % de su capacidad hasta recuperar el
20 % del saldo (otra página oficial dice 20 % de capacidad: las dos fuentes no coinciden). Dónde ver el saldo en hPanel
no está documentado **(sin verificar)**. Un build de 8 a 12 minutos no los agota; una CPU alta durante horas sin build
sí.

Los criterios de la tabla son de esta guía, no de Hostinger. Un plan mayor se propone solo con evidencia: OOM, swap en
uso sostenido, créditos agotados en un día normal o disco por debajo de 10 GB después de limpiar. Con la evidencia, la
decisión es de Mateo.

## 7. Recuperarse sin reinstalar

| Síntoma | Hacer |
|---|---|
| SSH: `Connection timed out` después del paso 4 | En el panel, corregir la regla de 22 o desactivar el grupo; esperar dos minutos. Mientras tanto, Web Console. |
| SSH: `Permission denied (publickey)` | Web Console como root; revisar `/root/.ssh/authorized_keys` o `/home/braja/.ssh/authorized_keys` (de `braja`, modo 600, carpeta `.ssh` en 700). |
| Quedó cerrado SSH para todos después del paso 2 | Web Console como root (SSH no la afecta): `rm /etc/ssh/sshd_config.d/01-braja-hardening.conf && systemctl reload ssh`, arreglar la clave y repetir el paso 5.2. |
| `sudo` no acepta la contraseña de `braja` | Web Console como root: `passwd braja`, guardar la nueva en el gestor. |
| La Web Console pide contraseña y no se conoce | **Settings** → **Root password**, poner una nueva (guardarla en el gestor) y entrar como `root`. Después, `sshd -T \| grep -Ei '^(passwordauthentication\|permitrootlogin) '` tiene que seguir en `no`; si no, repetir el paso 5.2. |
| La Web Console aparece vacía | Hostinger indica cerrarla, reiniciar el VPS desde el panel y abrirla otra vez. |
| `sshd` rechaza su configuración | El paso 2 del bootstrap vuelve solo a la configuración anterior si `sshd -t` o `sshd -T` fallan; leer su mensaje. |
| El sistema no arranca | **Settings** → **Emergency mode** (hasta 24 h); el disco queda bajo `/mnt`. Avisarle a Mateo antes de tocar nada. |
| Reloj sin sincronizar | `timedatectl timesync-status`; volver a correr el paso 1 del bootstrap: `ssh -t braja@<IP_DEL_VPS> 'sudo bash bootstrap-vps.sh braja'`. |
| Sin certificado | Paso 3 (DNS sin `AAAA`), reglas 80 y 443, `docker compose -p braja logs --tail 50 caddy`; un solo reintento de `deploy.sh`. |
| Deploy fallido | `deploy.sh` vuelve solo a la versión anterior y dice si hay que restaurar; seguir lo que imprime y `README.md` §10. |
| App caída, disco lleno, contenedor reiniciando | `RECOVERY.md`, caso A. |

## 8. Backups y snapshots de Hostinger

No reemplazan el backup de la app (`backup.sh`: un volcado consistente de MySQL, probado y con copia cifrada en otro
proveedor). `RECOVERY.md`, «Los cuatro tipos de copia», dice qué recupera cada uno. Lo que dice Hostinger de los suyos:

| | Backup de Hostinger | Snapshot de Hostinger |
|---|---|---|
| Cuándo | Automático, semanal; diario es un **Upgrade** pago | Manual, cuando se pide |
| Cuántos | Hasta cuatro: dos diarios y dos semanales | Uno; el nuevo pisa al anterior |
| Cuánto dura | Hasta que lo reemplaza uno nuevo | Un día; también se borra al cambiar o reinstalar el sistema y al restaurar un backup |
| Dónde | Fuera del servidor | En el mismo servidor |
| Cifrado en reposo | No | No |
| Qué restaura | Todo el VPS al momento de la copia; pisa todo lo actual y tarda de 10 minutos a horas, con el VPS bloqueado | Igual |

Restaurar cualquiera de los dos devuelve **todo** el servidor a esa fecha: se pierden las marcas posteriores. Nunca sin
el OK de Mateo, y antes un `bash deploy/backup.sh`. Un snapshot sirve antes de un cambio riesgoso del sistema, sabiendo
que vence en un día.

## 9. Costos adicionales

Ninguno de Hostinger es necesario para la salida. Los precios no figuran en la documentación consultada: se ven en la
pantalla de compra.

- Renovación del plan: el precio de la promoción y el de renovación pueden ser distintos; mirarlo al contratar (lo paga
  Braja, D-20261014-10).
- Daily backups del VPS (**Upgrade**).
- Licencia de Monarx para limpieza automática.
- Licencias de paneles (cPanel, DirectAdmin, Plesk, Webuzo) y de otras plantillas con prueba gratuita.
- Un plan mayor.
- El dominio, si se compra uno (alternativa A).
- IPs adicionales: Hostinger no las vende para VPS (una IP por servidor).
- Fuera de Hostinger: el almacenamiento externo de los backups (`RECOVERY.md` estima centavos por mes en B2 y gratis
  hasta 10 GB en R2; verificar el precio vigente).

## 10. Evidencia para Mateo

Mandar, por el issue de la salida, salidas de comandos y capturas; nunca valores de `deploy/.env`.

| Paso | Evidencia |
|---|---|
| 1–4 | Plan, ubicación y sistema (captura del Overview, sin la contraseña); salida de `grep … /etc/os-release`; `nslookup` A y AAAA; captura de las reglas del firewall; `Test-NetConnection` o `nc` a 3306 y 8080 |
| 5 | Últimas 15 líneas de cada paso del bootstrap con `exit=0`; la cabecera de `docker ps`, el rechazo de root y `sshd -T` |
| 6–8 | `timedatectl`; versiones de Docker y `age`; los comandos de Recursos |
| 10–12 | `git rev-parse HEAD origin/main`; las tres líneas `success`; la salida de `stat` y `check-ignore` |
| 13–14 | `rclone lsd offsite:`; las dos claves públicas `age1…` (son públicas); captura de los dos monitores, sin la URL del latido |
| 15–18 | Últimas 20 líneas de `deploy.sh` con `exit=0`; los tres `curl`; `docker compose -p braja ps`; los dos `grep -c` en `1` |
| 19–22 | Resultado de la prueba funcional y de M-1 a M-14; `backup.sh` con `exit=0`; `rclone ls offsite:braja-backups`; la salida de `restore.sh --check` y su tiempo; estado después del reinicio |

Nunca: `deploy/.env`, `rclone.conf`, contraseñas, claves privadas (SSH o `age`), la URL del latido, el DNI y la
contraseña del `ADMIN` juntos, ni volcados de la base.

## Fuentes

Documentación oficial de Hostinger consultada el 2026-11-15:

- Plan KVM 2, créditos de CPU e inodos: [Parameters and limits of hosting plans](https://www.hostinger.com/support/6976044-parameters-and-limits-of-hosting-plans-in-hostinger/),
  [How CPU credits work on Hostinger VPS](https://www.hostinger.com/support/how-cpu-credits-work-on-hostinger-vps/).
- IPv4 en el panel y una IP por VPS: [How to find your VPS IP address](https://www.hostinger.com/support/5139756-how-to-find-your-vps-ip-address-at-hostinger/).
- Plantillas y paneles: [VPS operating system templates](https://www.hostinger.com/support/1583571-what-are-the-available-operating-systems-for-vps-at-hostinger/),
  [How to change the operating system of your VPS](https://www.hostinger.com/support/4965922-how-to-change-the-operating-system-of-your-vps-at-hostinger/).
- Claves SSH: [How to use SSH keys at Hostinger VPS](https://www.hostinger.com/support/4792364-how-to-use-ssh-keys-at-hostinger-vps/).
- Contraseña de root: [How to change your VPS SSH password](https://www.hostinger.com/support/8942826-how-to-change-your-vps-ssh-password-at-hostinger/).
- Firewall administrado: [How to use a managed VPS firewall](https://www.hostinger.com/support/8172641-how-to-use-a-managed-vps-firewall-at-hostinger/).
- DNS: [How to point a domain to your VPS](https://www.hostinger.com/support/1583227-how-to-point-a-domain-to-your-vps-at-hostinger/),
  [How to manage A records](https://www.hostinger.com/support/4468886-how-to-manage-a-records-at-hostinger/),
  [How to manage AAAA records](https://www.hostinger.com/support/8899705-how-to-manage-aaaa-records-at-hostinger/).
- Nombre temporal `hstgr.cloud`: [How to change the domain of a Docker project](https://www.hostinger.com/support/how-to-change-the-domain-of-a-docker-project/).
- Uso de recursos: [How to check VPS resources usage](https://www.hostinger.com/support/4725768-how-to-check-vps-resources-usage-at-hostinger/).
- Consola y emergencia: [How to use the Hostinger VPS Web Console](https://www.hostinger.com/support/7978544-how-to-use-the-browser-terminal-in-hostinger/),
  [How to use emergency mode on your VPS](https://www.hostinger.com/support/5726577-how-to-use-emergency-mode-on-your-vps),
  [How to troubleshoot SSH connection issues](https://www.hostinger.com/support/9969102-how-to-troubleshoot-ssh-connection-issues-on-vps).
- Backups y snapshots: [How to back up or restore a Hostinger VPS](https://www.hostinger.com/support/1583232-how-to-back-up-or-restore-a-vps-at-hostinger/),
  [How to activate Daily Backups](https://www.hostinger.com/support/1665153-how-to-activate-daily-backups-in-hostinger/).
- Ubicaciones: [Hostinger server locations](https://www.hostinger.com/support/1583267-where-are-hostinger-servers-located/).
- Malware Scanner: [Hostinger VPS malware scanner](https://www.hostinger.com/support/8450363-hostinger-vps-malware-scanner/).

Sin verificar en esa documentación: en qué usuario instala hPanel una clave SSH agregada después de crear el VPS y si
vale sin reinstalar; si la Web Console depende de SSH o del firewall (sus mensajes sugieren una consola serie, y el
bootstrap la da por independiente de SSH); si el firewall filtra también el tráfico saliente; dónde se ve el saldo de
créditos de CPU; la zona horaria con que Hostinger entrega Ubuntu; el precio de los backups diarios y de Monarx.
