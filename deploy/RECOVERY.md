# Recuperación

Qué hacer cuando la app no anda o se pierde el servidor, de menor a mayor gravedad. Todo se hace con los scripts de
esta carpeta (`README.md`); nada a mano dentro de los contenedores. Lo que hace el local mientras tanto está en
`docs/SI_LA_APP_NO_ANDA.md` y en la sección «Fichaje manual» de este archivo.

Reglas que no tienen excepción: no usar `docker compose down -v`, no borrar el volumen `braja_mysql-data` para
resolver un error y no restaurar sobre la base real sin una operación aprobada expresamente por Mateo. Los ensayos
destructivos se hacen en un entorno desechable; para probar un backup alcanza `restore.sh --check`, que no toca la base
real.

## Objetivos (no medidos todavía en el VPS)

Propuestos el 2026-11-13 (D-20261115-02, propuesta, pendiente de OK de Mateo):

| Caso | RTO (volver a andar) | RPO (cuánto se puede perder) |
|---|---|---|
| A. La app se cae y el servidor sigue (contenedor caído, deploy malo, disco lleno) | 15 min | nada: la base sigue en el servidor |
| B. Se pierde el servidor (borrado, roto, cuenta suspendida, Hostinger no disponible) | 4 h | el intervalo del backup: hasta 1 h con el backup cada hora (D-20261115-04), hasta 24 h con el diario de la alternativa |

Son **objetivos, no resultados**: ninguno se midió en el VPS de Hostinger. Se dan por cumplidos recién después de un
simulacro en el servidor real (caso A: detener el backend fuera de horario y medir hasta `UP`; caso B: el
procedimiento completo sobre un VPS nuevo y desechable) con los tiempos anotados en el issue correspondiente.

Tiempos medidos en una PC con Docker (no en el VPS):

| Paso | Tiempo | Datos | Fecha |
|---|---|---|---|
| `backup.sh` con su prueba de restauración en una base descartable | 6,8 s; 192 KB comprimido | 20.003 filas | 2026-11-15 |
| `restore.sh` completo (prueba previa, backup de seguridad, carga, comparación, arranque) | 26 s | 20.003 filas | 2026-11-15 |
| Backend desde que arranca hasta `UP` | 21 s | datos de prueba | 2026-11-13 |
| Corte de la API durante un deploy | de 30 a 60 s | | 2026-11-13 |
| Primer build en 2 vCPU | de 8 a 12 min | | 2026-11-13 |

## Los cuatro tipos de copia

Sólo el primero y el segundo son backups de la base en el sentido de este archivo. Un snapshot del panel no reemplaza
un dump consistente de MySQL.

| Tipo | Qué es | Dónde vive | Qué recupera | Qué se puede perder |
|---|---|---|---|---|
| 1. Backup de la aplicación | `backup.sh`: `mysqldump --single-transaction` (una foto consistente de la base), comprimido, con su `.sha256` y probado cargándolo en una base descartable | `~/braja-backups` en el VPS; 14 días, y siempre los 3 últimos | La base completa en este servidor (`restore.sh`) | Lo escrito después del último backup. Si se pierde el disco del VPS, se pierde junto con él |
| 2. Backup cifrado externo | El mismo archivo, cifrado con `age` antes de salir del servidor, copiado por `BRAJA_BACKUP_OFFHOST_CMD` | Un almacenamiento de otro proveedor (decisión pendiente, abajo) | La base completa en un servidor nuevo, aunque Hostinger no esté disponible | Lo escrito después del último backup que llegó afuera; sin la clave privada, todo |
| 3. Backup del VPS del proveedor | La copia automática del disco entero que ofrece Hostinger según el plan (verificar en hPanel la frecuencia y la retención) | Hostinger | El servidor entero tal como estaba: sistema, `deploy/.env`, Docker, la base | Días enteros (depende de la frecuencia). La copia del disco no coordina con MySQL: la base puede quedar como después de un corte de luz. Si se pierde la cuenta de Hostinger, se pierde también |
| 4. Snapshot temporal del VPS | Una foto manual del disco tomada desde hPanel antes de una operación riesgosa (actualizar Ubuntu, cambiar el firewall) | Hostinger, por un tiempo limitado | Volver el servidor al estado previo a esa operación | Todo lo ocurrido después del snapshot, marcas incluidas. Mismas limitaciones que el tipo 3 |

Antes de usar un tipo 3 o 4, tomar un backup tipo 1 (`bash deploy/backup.sh`) y bajarlo del servidor: volver a un
snapshot borra las marcas posteriores, y con ese backup se pueden recuperar.

## Backups: cómo funcionan

- **Programación**: el bootstrap instala `/etc/cron.d/braja-backup` (`BRAJA_BACKUP_SCHEDULE`; por defecto cada hora,
  a los 15 minutos, D-20261115-04). Log: `~/braja-backups/backup.log`. Además, `deploy.sh` toma uno antes de cada deploy (antes de
  que Flyway migre) y `restore.sh` uno de seguridad antes de reemplazar la base, con el backend ya detenido.
- **Qué comprueba cada backup** antes de contarlo como bueno: que el gzip esté completo, que termine con la línea
  `-- Dump completed` de mysqldump, su suma SHA-256 y que se pueda cargar en una base descartable
  (`braja_restore_check`, en el mismo MySQL) con las mismas tablas que la base real. Hasta pasar todo eso es un
  archivo `.partial`, que se borra ante cualquier error.
- **Disco lleno**: el dump falla, el `.partial` se borra, el script termina con error y avisa al monitor. Los backups
  anteriores no se tocan. (Probado el 2026-11-15 con un disco de 320 KB: el backup anterior quedó intacto y su suma
  siguió dando `OK`.)
- **Rotación**: sólo después de un backup bueno; borra los de más de 14 días (`BRAJA_BACKUP_RETENTION_DAYS`) salvo los
  3 más nuevos (`BRAJA_BACKUP_KEEP_MIN`), aunque sean viejos. Si el backup falla, no se borra nada.
- **Uno a la vez**: backups y restauraciones se esperan entre sí (`flock`). Mientras `restore.sh` espera la
  confirmación, un backup programado espera hasta 15 min y después falla con aviso.
- **Retención afuera**: la define el almacenamiento externo (regla de ciclo de vida del bucket, abajo); propuesta:
  30 días.

### Cifrado y custodia de claves

El dump contiene DNI, nombres, puntos de GPS, hashes de contraseñas y las sesiones abiertas: nunca sale del servidor
sin cifrar.

Hay dos formas soportadas. La recomendada es la primera:

| | `age` con clave pública (`BRAJA_BACKUP_AGE_RECIPIENTS`) | Remoto `crypt` de rclone (`README.md` §8) |
|---|---|---|
| Qué guarda el VPS | Sólo la clave pública: puede cifrar, no descifrar | La contraseña del `crypt` en `rclone.conf`: puede cifrar y descifrar |
| Si alguien entra al VPS | No puede leer los backups viejos que están afuera | Puede leer todos los backups de afuera |
| Qué hay que custodiar | La clave privada, fuera del VPS | La contraseña y la sal del `crypt`, fuera del VPS |

Con `age`:

1. En la PC de Mateo (no en el VPS): `age-keygen -o braja-backup-mateo.key` y, para una segunda persona o una copia
   en papel, `age-keygen -o braja-backup-respaldo.key`. Cada comando imprime su clave pública (`age1...`).
2. Guardar cada archivo `.key` en el gestor de contraseñas de Mateo y, el de respaldo, también impreso en un sobre
   cerrado en un lugar distinto (por ejemplo, con el dueño de Braja). Nunca en el VPS ni junto a los backups.
3. En `deploy/.env` del VPS: `BRAJA_BACKUP_AGE_RECIPIENTS='age1...mateo age1...respaldo'` y
   `BRAJA_BACKUP_OFFHOST_CMD='rclone copy "$1" offsite:braja-backups'` (un remoto común, sin `crypt`: el archivo ya
   sale cifrado). El paquete `age` tiene que estar instalado (`sudo apt-get install age`).
4. Probar: `bash deploy/backup.sh`; afuera aparece `braja-<fecha>.sql.gz.age`. Bajarlo a la PC y comprobar que se
   abre: `bash deploy/restore.sh --check <archivo>.age --identity braja-backup-mateo.key` en un entorno de prueba, o
   `age -d -i braja-backup-mateo.key <archivo>.age | gzip -t`.

Perder las dos claves privadas hace inútiles todos los backups de afuera. Además de estas claves, la copia de
`deploy/.env` en el gestor de contraseñas es imprescindible (`README.md`, «Custodia de claves»): sin
`BRAJA_HEALTH_ENCRYPTION_KEY_BASE64`, una base restaurada no puede mostrar los motivos `SALUD`.

Quien entra al VPS tiene también las credenciales del almacenamiento externo y podría borrar las copias. Para
evitarlo, usar credenciales que puedan subir pero no borrar (en Backblaze B2, una clave de aplicación sin el permiso
`deleteFiles`; en S3 o R2, bloqueo de objetos) y dejar que una regla de ciclo de vida del bucket borre lo de más de
30 días. En ese caso, el `rclone delete --min-age 30d` de `README.md` §8 se quita del comando.

### Avisos

- **Latido del backup** (`BRAJA_BACKUP_HEARTBEAT_URL`, healthchecks.io o Better Stack): cada backup bueno avisa a la
  URL; uno que falla (dump, comprobaciones, cifrado, copia afuera, disco por debajo de `BRAJA_DISK_MIN_FREE_MB`, o
  `BRAJA_BACKUP_OFFHOST_CMD` sin configurar) avisa a `<url>/fail`. Si el cron deja de correr o el servidor se apaga,
  el servicio manda el mail porque no llegó el latido a tiempo. Configurar el período igual al del cron y un margen
  (1 h + 15 min con el horario por defecto, o 1 día + 1 h con el diario).
- **Monitor de la app** (UptimeRobot o Better Stack, `README.md` «Monitoreo»): mail si
  `https://<dominio>/api/v1/health` deja de responder `UP`.
- Un llamado de Braja (`docs/SI_LA_APP_NO_ANDA.md`).

### Prueba de restauración

`bash deploy/restore.sh --check <backup>` carga el backup en la base descartable, muestra tabla por tabla las filas del
backup al lado de las de la base real y la borra. No cambia nada y no corta el servicio. Cada backup ya lo hace solo;
hacerlo a mano una vez por mes con un archivo bajado de afuera (`--identity`) prueba además la clave privada y el
almacenamiento externo.

## Intervalo de backup

| Opción | Cron (`BRAJA_BACKUP_SCHEDULE`) | Pérdida máxima si se pierde el servidor | Espacio |
|---|---|---|---|
| Cada hora (actual, D-20261115-04) | `15 * * * *` | hasta 1 h de marcas | unos 65 MB en 14 días; afuera, unos 140 MB en 30 días |
| Diario (alternativa) | `15 6 * * *` | hasta 24 h de marcas | unos 3 MB en 14 días con los datos de prueba |

Lo perdido en ese intervalo **no está en papel**: son marcas que el empleado hizo en la app y vio confirmadas. Con el
backup diario, perder el servidor a la tarde pierde las marcas de todo el día y hay que reconstruirlas preguntando a
cada empleado. Con datos de este tamaño, el backup horario cuesta segundos y pocos megas: por eso Mateo adoptó el
horario el 2026-11-15 (D-20261115-04), que es el valor por defecto del bootstrap. Pasar al diario (o volver al horario)
es correr de nuevo el bootstrap con `BRAJA_BACKUP_SCHEDULE="15 6 * * *"` (o `"15 * * * *"`) y ajustar el período del
latido; cambiarlo es una decisión de Mateo.

## Almacenamiento externo: decisión pendiente de Mateo

Tiene que ser de otro proveedor y de otra cuenta: un almacenamiento de Hostinger no protege si se pierde la cuenta de
Hostinger. Los archivos salen cifrados, así que el proveedor no puede leerlos; igual conviene revisar con el abogado
(tarea T6) la transferencia internacional de datos personales cifrados (Ley 25.326).

| Opción | Costo aproximado (verificar precio vigente) | Dónde quedan los datos | Notas |
|---|---|---|---|
| Backblaze B2 | centavos de dólar por mes a este tamaño (se cobra por TB) | EE. UU. o UE, a elección | Claves sin permiso de borrado y reglas de ciclo de vida; rclone lo soporta |
| Cloudflare R2 | gratis hasta 10 GB | Elegible por región | Compatible S3, bloqueo de objetos |
| Google Drive de una cuenta dedicada | gratis hasta 15 GB | Donde Google lo ubique | Simple; no hay credencial de «subir sin borrar» |
| Una PC propia por SFTP (rclone) | sin costo | En Argentina | Depende de que esa PC esté prendida y accesible; más trabajo de mantenimiento |

Elegido (D-20261115-05, 2026-11-15): Backblaze B2, con una clave de aplicación sin permiso de borrado y retención de 30 días por regla del bucket. Las demás filas quedan como alternativas.

## A. La app no responde y el servidor sigue

Objetivo: 15 minutos.

1. Avisarle a Braja que anoten las marcas en papel hasta nuevo aviso («Fichaje manual», abajo).
2. Entrar: `ssh braja@<IP_DEL_VPS>` y `cd ~/fichaje`.
3. Ver qué está caído: `docker compose -p braja ps`. Los tres (`mysql`, `backend`, `caddy`) tienen que estar `Up` y
   `healthy`.
4. Según lo que se ve:

   | Se ve | Hacer |
   |---|---|
   | Recién se desplegó una versión y desde ahí falla | `bash deploy/deploy.sh --rollback` (vuelve a la anterior sin deshacer migraciones; no pide fuera de horario). Si dice que hubo migraciones y la anterior también falla, el `restore.sh` que imprimió el deploy, con aprobación de Mateo. |
   | `backend` reiniciando o `unhealthy` | `docker compose -p braja logs --tail 100 backend`. Si falta una variable o una clave, revisar `deploy/.env` contra la copia del gestor de contraseñas. |
   | `mysql` caído | `docker compose -p braja logs --tail 100 mysql`. Si es disco lleno, la fila de abajo. |
   | Disco lleno (`df -h /`) | `docker system df`; `docker image prune -f` y `docker builder prune -f`; `ls -lh ~/braja-backups`. Nunca borrar el volumen `braja_mysql-data` ni el último backup. |
   | `caddy` responde pero sin certificado | `docker compose -p braja logs --tail 50 caddy`; `nslookup <DOMINIO_REAL>` tiene que dar la IP del servidor. |
   | Todo `Up` pero la hora de las marcas está mal | `timedatectl` tiene que decir `System clock synchronized: yes`. Si no, correr de nuevo el bootstrap. |
   | No se sabe | Volver a levantar la versión actual: `bash deploy/deploy.sh --sha <commit actual> --force` (el mismo commit no se reconstruye; `--force` porque es horario del local). |

5. Comprobar: `curl -fsS https://<DOMINIO_REAL>/api/v1/health` responde `{"status":"UP"}`, el monitor vuelve a verde, y
   el `ADMIN` puede entrar y abrir «Hoy».
6. Avisarle a Braja que pueden volver a marcar; el `ADMIN` carga lo anotado en papel.

## B. Se perdió el servidor (o Hostinger no está disponible)

Objetivo: 4 horas desde el aviso. Trabajo efectivo estimado: una hora; el resto es margen para el DNS y los
imprevistos. Si Hostinger no está disponible, el servidor nuevo se crea en otro proveedor con Ubuntu 24.04, 2 vCPU,
4 GB e IPv4 pública; los pasos son los mismos.

### Lo que tiene que existir antes (si falta algo, este procedimiento no alcanza)

- En el gestor de contraseñas: la copia vigente de `deploy/.env`, la clave privada `age` (o la contraseña y la sal del
  `crypt` de rclone) y las credenciales del almacenamiento externo.
- La clave SSH y el acceso al proveedor del VPS y al DNS del dominio.
- Backups afuera, recientes: el latido del backup en verde.

### Pasos

| # | Paso | Tiempo aprox. |
|---|---|---|
| 1 | Avisarle a Braja: papel hasta nuevo aviso. | 5 min |
| 2 | Crear el VPS nuevo (Ubuntu 24.04, 2 vCPU, 4 GB, IPv4) con la clave SSH. Anotar la IPv4. | 5 min |
| 3 | DNS: cambiar el registro `A` del dominio a la IPv4 nueva. Va **antes del deploy**: `deploy.sh` espera el certificado de Let's Encrypt, que exige que el dominio apunte al servidor nuevo. Con TTL de 300 s llega en minutos. | 5 min + propagación |
| 4 | Bootstrap en sus dos pasos (`README.md` §3) con el mismo `BRAJA_BACKUP_SCHEDULE` que tenía el servidor anterior. Probar desde otra terminal `ssh -t braja@<IP_DEL_VPS> 'sudo -v && docker ps'` (pide la contraseña de `braja`). Comprobar `age --version`. | 5 a 10 min |
| 5 | Como `braja`: `git clone https://github.com/mateoscns/Braja-Ingreso-Egreso.git ~/fichaje` y `git -C ~/fichaje checkout <commit que estaba desplegado>`. | 1 min |
| 6 | Volver a poner `deploy/.env`: pegar la copia del gestor en `~/fichaje/deploy/.env` y `chmod 600 ~/fichaje/deploy/.env`. Tiene que decir `BRAJA_BOOTSTRAP_ENABLED='false'`; si la copia es anterior al primer deploy, cambiarlo a `false` y dejar vacío `BRAJA_BOOTSTRAP_PASSWORD` (la base se va a restaurar). | 5 min |
| 7 | Volver a poner rclone: pegar la configuración en `~/.config/rclone/rclone.conf` (o rehacerla con `rclone config`) y `chmod 600`. Comprobar que `rclone lsf offsite:braja-backups` lista los backups. | 5 min |
| 8 | **Bajar el backup antes del deploy**: `rclone lsf offsite:braja-backups \| sort \| tail -n 3`, elegir el último y `mkdir -p ~/braja-restore && rclone copy offsite:braja-backups/<archivo>.age ~/braja-restore/`, en una carpeta aparte y nunca en `~/braja-backups/`, la de los backups locales. Antes y no después: el deploy y la restauración suben backups nuevos de la base vacía, que quedan como los más recientes. Anotar el nombre del archivo bueno. | 2 min |
| 9 | Copiar la clave privada al servidor sólo para la restauración: `(umask 077; cat > ~/restore.key)`, pegarla y terminar con Ctrl-D. Probar el backup sin tocar nada: `bash deploy/restore.sh --check ~/braja-restore/<archivo>.age --identity ~/restore.key` (levanta MySQL si hace falta; la base real todavía está vacía). | 3 min |
| 10 | Deploy: `cd ~/fichaje && bash deploy/deploy.sh --sha <commit>`. En horario del local, agregar `--force` (es una emergencia). Arranca con la base vacía y crea el esquema. | 10 a 15 min |
| 11 | Restaurar: `bash deploy/restore.sh ~/braja-restore/<archivo>.age --identity ~/restore.key`. Revisar lo que muestra (proyecto `braja`, volumen `braja_mysql-data`, base `braja`, filas actuales y del backup) y escribir `RESTORE`; recién entonces detiene el backend, hace el backup de seguridad y reemplaza la base. Si el backup es de un esquema anterior, Flyway migra al arrancar. | 2 min |
| 12 | Borrar la clave privada del servidor: `shred -u ~/restore.key`. | 1 min |
| 13 | Comprobar (abajo). | 10 min |
| 14 | Avisarle a Braja que volvió; el `ADMIN` carga lo anotado en papel y lo perdido desde el último backup. | 5 min |

Con el `crypt` de rclone en lugar de `age`: en el paso 8, `mkdir -p ~/braja-restore && rclone copy braja-crypt:<archivo>.sql.gz ~/braja-restore/`,
y en los pasos 9 y 11, `~/braja-restore/<archivo>.sql.gz` sin `--identity`.

### Comprobar

- `curl -fsS https://<DOMINIO_REAL>/api/v1/health` responde `{"status":"UP"}` y el monitor de la app está en verde.
- Como `ADMIN`: «Hoy» muestra los días anteriores al backup; «Para revisar» abre sin error (si da error, la clave
  `BRAJA_HEALTH_ENCRYPTION_KEY_BASE64` no es la original: volver al paso 6).
- Un aviso de prueba llega al teléfono del `ADMIN` sin volver a activarlo (si hay que activarlo, las claves VAPID no
  son las originales).
- Un empleado de prueba marca con ubicación. Las sesiones abiertas vuelven con la base.
- `bash deploy/backup.sh` termina bien, la copia aparece afuera y el latido queda en verde.
  `cat /etc/cron.d/braja-backup` muestra el horario.

### Después

- Si el servidor anterior vuelve a aparecer, apagarlo y borrarlo: tiene datos personales y una copia vieja de la base.
- Si se perdió por un ataque, además: cambiar las claves SSH, la contraseña de la base (`gen-secrets.sh` no pisa un
  `.env` existente: hacerlo a mano con cuidado) y las credenciales del almacenamiento. La clave
  `BRAJA_HEALTH_ENCRYPTION_KEY_BASE64` no se puede cambiar sin perder los motivos `SALUD` ya guardados. Con `age`, los
  backups de afuera no quedaron expuestos: el servidor nunca tuvo la clave privada.
- Let's Encrypt emite hasta 5 certificados iguales por semana: no repetir el procedimiento completo muchas veces
  seguidas con el mismo dominio.
- Anotar en el issue del incidente qué pasó, cuánto tardó cada paso y qué faltó, y corregir este archivo.

## Fichaje manual mientras se recupera el servicio

1. **Mientras no anda**: cada empleado anota en la planilla en papel del local (`docs/SI_LA_APP_NO_ANDA.md`) su
   nombre, la fecha, la marca (ingreso, salida o vuelta de pausa, egreso) y la hora del reloj del local. Quien marcó
   en la app y no vio el mensaje de confirmación, también lo anota.
2. **Cuando vuelve**: el `ADMIN` entra a «Hoy», elige la fecha del papel, abre el día de la persona y, en «Agregar una
   marca que faltó», carga cada fila con la hora del papel y el motivo «La app no andaba, anotado en papel». La app
   guarda la marca olvidada con su hora, quién la cargó, cuándo y por qué, y la muestra en el historial del día
   (`POST /admin/jornadas/{id}/forgotten-marks`).
3. **Límites de la carga** (los aplica el servidor): la hora no puede ser posterior a la actual y tiene que estar
   dentro de las 24 h anteriores al inicio o posteriores al fin del horario de ese día; un día cancelado no acepta
   marcas. Si el día de la persona no existe (por ejemplo, porque se declaró después del último backup y se perdió
   con el servidor), primero se vuelve a declarar en «Días de trabajo» y después se cargan las marcas.
4. **Caso B**: además del papel, faltan las marcas hechas en la app entre el último backup y la caída. No quedaron
   anotadas en ningún lado: el `ADMIN` las reconstruye con cada empleado y las carga igual, con el motivo
   «Perdida en la caída del servidor». Los avisos de «Para explicar» que aparezcan por esas horas se responden con el
   mismo motivo.
5. Guardar las planillas en papel: son la prueba de las horas de esos días.
