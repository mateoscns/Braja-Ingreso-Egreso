# Recuperación

Qué hacer cuando la app no anda, de menor a mayor. Todo con los scripts de esta carpeta (`README.md`); nada a mano
dentro de los contenedores. Lo que hace el local mientras tanto está en `docs/SI_LA_APP_NO_ANDA.md`.

## Objetivos

Propuestos el 2026-11-13, pendientes de OK de Mateo (D-20261113-02):

| Caso | RTO (volver a andar) | RPO (cuánto se puede perder) |
|---|---|---|
| A. La app se cae y el servidor sigue (contenedor caído, deploy malo, disco lleno) | 15 min | nada: la base sigue en el servidor |
| B. Se pierde el servidor (borrado, roto, cuenta suspendida) | 4 h | el intervalo del backup: hasta 24 h con el diario, hasta 1 h con uno por hora |

Lo que no se pierde nunca está en el papel del local: las marcas de ese rato las carga el `ADMIN` después.

Tiempos medidos el 2026-11-13 en una PC con los datos de prueba (en el VPS van a ser parecidos o algo mayores):

| Paso | Tiempo |
|---|---|
| Backup (`backup.sh`) | 1,2 s; 124 KB comprimido |
| Restauración (`restore.sh`, sin contar la confirmación) | 3,7 s |
| Backend desde que arranca hasta `UP` | 21 s |
| Corte de la API durante un deploy | de 30 a 60 s |
| Primer build en 2 vCPU | de 8 a 12 min |

## Cómo te enterás

- El monitor de la app (UptimeRobot o Better Stack, `README.md` «Monitoreo») manda un mail si
  `https://<dominio>/api/v1/health` deja de responder `UP`.
- El latido del backup manda un mail si un backup falló o no corrió, o si queda poco disco.
- Te llama Braja (`docs/SI_LA_APP_NO_ANDA.md`).

Lo primero, siempre: avisarle a Braja que anoten las marcas en papel hasta que les digas que volvió.

## A. La app no responde y el servidor sigue

Objetivo: 15 minutos.

1. Entrar: `ssh braja@<ip>` y `cd ~/fichaje`.
2. Mirar qué está caído: `docker compose -p braja ps`. Los tres (`mysql`, `backend`, `caddy`) tienen que estar
   `Up` y `healthy`.
3. Según lo que se ve:

   | Se ve | Hacer |
   |---|---|
   | Recién se desplegó una versión y desde ahí falla | `bash deploy/deploy.sh --rollback` (vuelve a la anterior; no pide fuera de horario). Si dice que hubo migraciones y la anterior también falla, el `restore.sh` que imprimió el deploy. |
   | `backend` reiniciando o `unhealthy` | `docker compose -p braja logs --tail 100 backend`. Si dice que falta una variable o una clave, revisar `deploy/.env` contra la copia del gestor de contraseñas. |
   | `mysql` caído | `docker compose -p braja logs --tail 100 mysql`. Si es disco lleno, la fila de abajo. |
   | Disco lleno (`df -h /`) | `docker system df`; `docker image prune -f` y `docker builder prune -f`; `ls -lh ~/braja-backups`. Nunca borrar el volumen `braja_mysql-data`. |
   | `caddy` responde pero sin certificado | `docker compose -p braja logs --tail 50 caddy`; `nslookup <dominio>` tiene que dar la IP del servidor. |
   | Todo `Up` pero la hora de las marcas está mal | `timedatectl`: tiene que decir `System clock synchronized: yes`. Si no, correr el bootstrap de nuevo (`sudo bash bootstrap-vps.sh braja`). |
   | No se sabe | Volver a levantar la versión actual: `bash deploy/deploy.sh --force` (el mismo commit no se reconstruye; `--force` porque es horario del local). |

4. Comprobar: `curl -fsS https://<dominio>/api/v1/health` responde `{"status":"UP"}`, el monitor vuelve a verde, y
   entrar como `ADMIN` y abrir «Hoy».
5. Avisarle a Braja que pueden volver a marcar y cargar las marcas del papel (`docs/SI_LA_APP_NO_ANDA.md`).

## B. Se perdió el servidor

Objetivo: 4 horas desde que te enterás. Trabajo efectivo: alrededor de una hora; el resto es margen para el DNS y
para lo que salga mal.

### Lo que tiene que existir antes (si falta algo, este procedimiento no alcanza)

- En el gestor de contraseñas: la copia vigente de `deploy/.env`, la contraseña y la sal del remoto `crypt` de rclone
  y las credenciales del almacenamiento de afuera (`README.md`, «Custodia de claves»).
- Tu clave SSH y el acceso al proveedor del VPS y al DNS (o a DuckDNS).
- Backups afuera, cifrados, recientes: el latido del backup en verde.

### Pasos

| # | Paso | Tiempo aprox. |
|---|---|---|
| 1 | Avisarle a Braja: papel hasta nuevo aviso. | 5 min |
| 2 | Crear un VPS nuevo como en `README.md` §1 (Ubuntu 24.04, 2 vCPU, 4 GB, IPv4), con tu clave SSH. Anotar la IPv4. | 5 min |
| 3 | DNS: cambiar el registro `A` del dominio a la IPv4 nueva (en DuckDNS, actualizar la IP). Va **antes del deploy**: `deploy.sh` espera el certificado de Let's Encrypt, y para emitirlo el dominio tiene que apuntar al servidor nuevo. Con TTL de 300 s llega en minutos. | 5 min + propagación |
| 4 | Bootstrap (`README.md` §3), con el mismo `BRAJA_BACKUP_SCHEDULE` que tenía el servidor viejo. Probar `ssh braja@<ip> sudo true`. | 5 a 10 min |
| 5 | Como `braja`: `git clone https://github.com/mateoscns/Braja-Ingreso-Egreso.git ~/fichaje`. | 1 min |
| 6 | Volver a poner `deploy/.env`: pegar la copia del gestor en `~/fichaje/deploy/.env` y `chmod 600 ~/fichaje/deploy/.env`. Tiene que decir `BRAJA_BOOTSTRAP_ENABLED='false'`; si la copia es anterior al primer deploy, cambiarlo a `false` y dejar vacío `BRAJA_BOOTSTRAP_PASSWORD` (la base se va a restaurar). | 5 min |
| 7 | Volver a poner rclone: pegar la configuración en `~/.config/rclone/rclone.conf` (o rehacerla con `rclone config` con la misma contraseña y sal) y `chmod 600`. Comprobar: `rclone ls braja-crypt:` lista los backups con nombres legibles. | 5 min |
| 8 | **Bajar el backup antes del deploy**: `rclone lsf braja-crypt: \| sort \| tail -n 3`, elegir el último y `rclone copy braja-crypt:<archivo> ~/braja-backups/`. Antes y no después: el deploy y la restauración suben backups nuevos de la base vacía, que quedan como los más recientes. Anotar el nombre del archivo bueno. | 2 min |
| 9 | Deploy: `cd ~/fichaje && bash deploy/deploy.sh`. En horario del local, `--force` (es una emergencia). Arranca con la base vacía y crea el esquema. | 10 a 15 min |
| 10 | Restaurar: `bash deploy/restore.sh ~/braja-backups/<archivo>` y escribir `RESTORE`. Si el backup es de un esquema anterior, Flyway migra al arrancar. | 2 min |
| 11 | Comprobar (abajo). | 10 min |
| 12 | Avisarle a Braja que volvió; el `ADMIN` carga las marcas del papel. | 5 min |

### Comprobar

- `curl -fsS https://<dominio>/api/v1/health` responde `{"status":"UP"}` y el monitor de la app está en verde.
- Entrar como `ADMIN`: «Hoy» muestra los días anteriores al backup; «Para revisar» abre sin error (si da error, la
  clave `BRAJA_HEALTH_ENCRYPTION_KEY_BASE64` no es la original: volver al paso 6).
- Un aviso de prueba llega al teléfono del `ADMIN` sin volver a activarlo (si hay que activarlo de nuevo, las claves
  VAPID no son las originales).
- Un empleado de prueba marca con ubicación. Las sesiones abiertas vuelven con la base: el empleado no tiene que
  volver a entrar.
- `bash deploy/backup.sh` termina bien, la copia aparece con `rclone ls braja-crypt:` y el latido queda en verde.
  `cat /etc/cron.d/braja-backup` muestra el horario.

### Después

- Si el servidor viejo vuelve a aparecer, apagarlo y borrarlo: tiene datos personales y una copia vieja de la base.
- Si se perdió por un ataque, además: cambiar las claves SSH, la contraseña de la base (`gen-secrets.sh` no pisa un
  `.env` existente: hacerlo a mano con cuidado) y las credenciales del almacenamiento. La clave
  `BRAJA_HEALTH_ENCRYPTION_KEY_BASE64` no se puede cambiar sin perder los motivos `SALUD` ya guardados: no hay
  herramienta para volver a cifrarlos.
- Let's Encrypt emite hasta 5 certificados iguales por semana: no repetir el procedimiento completo muchas veces
  seguidas con el mismo dominio.
- Anotar en el issue del incidente qué pasó, cuánto tardó cada paso y qué faltó, y corregir este archivo.
