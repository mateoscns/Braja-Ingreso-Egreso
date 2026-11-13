# Checklist de salida a producción

Se hace **una vez**, para el primer deploy real (objetivo: sábado 2026-11-14, para que Braja use la app el lunes
2026-11-16). Cada actualización posterior sigue `CHECKLIST_RELEASE.md`. Cada ítem dice cómo se comprueba; se marca
solo con lo observado y su evidencia (salida del comando, captura) en el issue de la salida. Un ítem sin marcar
necesita una excepción explícita de Mateo (`CLAUDE.md` §8), no un salto silencioso.

## Antes del deploy

- [ ] **El commit está en `main` con CI verde.** En GitHub, el último commit de `main` tiene en verde «Backend (Java 21
  + MySQL 8.4)», «Backend campaign (MySQL 8.4)» y «Frontend (Node 24)». Anotar su sha.
- [ ] **Pruebas en teléfonos reales M-1 a M-14** de `docs/UX_UI_GUIDELINES.md` §10, con su evidencia. Son el requisito
  que dejó D-20261112-04: su excepción a la regla 38 deja de valer en este deploy. Como mínimo M-7 (Android
  instalado), M-9 (iPhone con VoiceOver y avisos), M-11 (mapa con el dedo) y M-12 (iPhone con muesca). Si los avisos
  fallan de forma sostenida en el iPhone, se aplica el plan B de D-20261014-13; no antes.
- [ ] **Servidor elegido y creado** (`deploy/README.md` §1, propuesta D-20261113-01): Ubuntu 24.04, 2 vCPU, 4 GB, con
  IPv4 pública.
- [ ] **DNS**: `nslookup <dominio>` devuelve la IPv4 del servidor; no hay registro `AAAA`; TTL de 300 s si el dominio
  es propio.
- [ ] **Bootstrap** (`deploy/README.md` §3) terminado sin error, y en el servidor:
  - `timedatectl` dice `System clock synchronized: yes`;
  - `cat /etc/cron.d/braja-backup` muestra el horario elegido (diario o cada hora: decide Mateo);
  - `cat /etc/apt/apt.conf.d/52braja-auto-reboot` muestra la hora de reinicio (fuera del horario del local);
  - desde otra terminal, `ssh braja@<ip> sudo true` entra sin contraseña y `ssh root@<ip>` es rechazado.
- [ ] **Secretos**: `deploy/.env` creado con `gen-secrets.sh`, modo 600 (`stat -c %a deploy/.env` da `600`).
- [ ] **Copia afuera cifrada** (`deploy/README.md` §8): `bash deploy/backup.sh` termina sin aviso de copia,
  `rclone ls braja-crypt:` lista el archivo y `rclone ls offsite:braja-backups` muestra nombres ilegibles.
- [ ] **Monitores** (`deploy/README.md`, «Monitoreo»; decide Mateo por D-20261014-02): el latido del backup está en
  verde después de ese backup, y el monitor de `https://<dominio>/api/v1/health` está creado.

## El deploy

- [ ] **Fuera del horario del local** (lunes a sábado de 08:00 a 19:00 en Córdoba). `deploy.sh` lo comprueba solo.
- [ ] `bash deploy/deploy.sh` termina con `Deployed <sha>`, el mismo sha anotado arriba.
- [ ] `curl -fsS https://<dominio>/api/v1/health` responde `{"status":"UP"}` desde afuera del servidor.
- [ ] **Copia de `deploy/.env` en el gestor de contraseñas**, tomada después del deploy (el deploy apaga el bootstrap
  y borra su contraseña del archivo), junto con la contraseña y la sal del remoto `crypt` y las credenciales del
  almacenamiento. En un lugar distinto de los backups.

## Después del deploy

- [ ] **El monitor avisa**: con el backend detenido (`docker compose -p braja stop backend`) llega el mail del monitor;
  `bash deploy/deploy.sh` lo vuelve a levantar y el monitor queda en verde.
- [ ] **Simulacro de restauración**: `bash deploy/backup.sh`, después `bash deploy/restore.sh <ese archivo>`; anotar
  cuánto tardó. La base todavía casi no tiene datos: es el mejor momento.
- [ ] **Primer `ADMIN`**: entra en `https://<dominio>` con el DNI y la contraseña del paso de secretos.
- [ ] **Configuración para el lunes**: locales con su ubicación, horarios, equipo y días de trabajo cargados para la
  semana del 2026-11-16.
- [ ] **Teléfonos**: la app instalada en el teléfono del `ADMIN` con los avisos activados (llega uno de prueba) y en
  el de al menos un empleado, que marca una entrada y una salida con ubicación.
- [ ] **El rollback se conoce**: quien opera sabe que `bash deploy/deploy.sh --rollback` vuelve a la versión anterior
  y que `deploy/RECOVERY.md` dice qué hacer si se pierde el servidor.
- [ ] **Braja tiene el plan B**: `SI_LA_APP_NO_ANDA.md` con el contacto completado, impreso y entregado, con la
  planilla en papel.
- [ ] `docs/PENDIENTES.md` y `CLAUDE.md` §7 dicen que la pila ya corre en un VPS, con la fecha.
