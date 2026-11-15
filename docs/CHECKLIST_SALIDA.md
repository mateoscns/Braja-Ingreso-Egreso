# Checklist de salida a producción

Se hace **una vez**, para el primer deploy real (objetivo al 2026-11-15: que Braja use la app desde el lunes
2026-11-16, si pasan las verificaciones de seguridad y funcionamiento). Cada actualización posterior sigue
`CHECKLIST_RELEASE.md`. Cada ítem dice cómo se comprueba; se marca solo con lo observado y su evidencia (salida
del comando, captura) en el issue de la salida. Un ítem sin marcar necesita una excepción explícita de Mateo (`CLAUDE.md` §8), no un salto silencioso.

## Antes del deploy

- [x] **Decisión de Mateo sobre passkeys (D-20261114-01).** Eligió la alternativa B el 2026-11-15 (D-20261115-03):
  salir sin passkeys hasta que el #190 funcione en producción; responsable: Mateo.
- [ ] **Aceptación escrita de Braja** del riesgo de suplantación (D-20261115-03): sin passkey, quien conoce el DNI y la
  contraseña de otro empleado puede marcar por él. Bloquea habilitar a los empleados; se guarda junto con la evidencia
  de la salida.
- [ ] **El PR #194 (WebAuthn4J) no es parte de este release.** En el commit a desplegar, `git grep -il webauthn --
  backend frontend` no devuelve nada. Una biblioteca sin usar no resuelve la suplantación.
- [ ] **Decisiones propuestas resueltas**: Mateo adoptó o cambió D-20261115-01 (servidor) y D-20261115-02 (RTO y
  RPO), y eligió el intervalo del backup (diario o cada hora).
- [ ] **El commit está en `main` con CI verde.** En GitHub, el último commit de `main` tiene en verde «Backend (Java 21
  + MySQL 8.4)», «Backend campaign (MySQL 8.4)» y «Frontend (Node 24)». Anotar su sha.
- [ ] **Pruebas en teléfonos reales M-1 a M-14** de `docs/UX_UI_GUIDELINES.md` §10, con su evidencia. Son el requisito
  que dejó D-20261112-04: su excepción a la regla 38 deja de valer en este deploy. Como mínimo M-7 (Android
  instalado), M-9 (iPhone con VoiceOver y avisos), M-11 (mapa con el dedo) y M-12 (iPhone con muesca). Si los avisos
  fallan de forma sostenida en el iPhone, se aplica el plan B de D-20261014-13; no antes.
- [ ] **Servidor contratado** por Enrique (`deploy/HOSTINGER_GO_LIVE.md`, propuesta D-20261115-01): Hostinger VPS
  KVM 2 de referencia (2 vCPU, 8 GB de RAM, 100 GB de disco), Ubuntu Server 24.04 LTS limpio, IPv4 pública, sin
  paneles que dupliquen Docker, Caddy o el firewall.
- [ ] **Recursos reales comprobados** en el servidor, sin asumir el plan: `nproc`, `free -h` y `df -h /` coinciden con
  lo contratado (en el KVM 2: 2 vCPU, unos 8 GB de RAM y unos 100 GB de disco) y `lsb_release -d` dice Ubuntu 24.04.
  Si el plan es otro, se anota su compatibilidad antes de seguir (el build corre al lado de MySQL: con menos de 2 vCPU
  y 4 GB no alcanza).
- [ ] **Firewall**: desde afuera del servidor solo responden 22, 80 y 443; MySQL (3306) y el backend (8080) no
  responden (`nc -zv <IP_DEL_VPS> 3306` y `nc -zv <IP_DEL_VPS> 8080` fallan).
- [ ] **DNS**: `nslookup <dominio>` devuelve la IPv4 del servidor; no hay registro `AAAA`; TTL de 300 s si el dominio
  es propio.
- [ ] **Bootstrap** (`deploy/README.md` §3) terminado sin error, y en el servidor:
  - `timedatectl` dice `System clock synchronized: yes`;
  - `cat /etc/cron.d/braja-backup` muestra el horario elegido (diario o cada hora: decide Mateo);
  - `cat /etc/apt/apt.conf.d/52braja-auto-reboot` muestra la hora de reinicio (fuera del horario del local);
  - desde una segunda sesión, `ssh braja@<IP_DEL_VPS>` entra con su clave y tiene el acceso administrativo que
    indica `deploy/README.md` §3 antes de cerrar la sesión de root; recién después `ssh root@<IP_DEL_VPS>` es
    rechazado.
- [ ] **Secretos**: `deploy/.env` creado con `gen-secrets.sh`, modo 600 (`stat -c %a deploy/.env` da `600`).
- [ ] **Copia afuera cifrada** (`deploy/README.md` §8): `bash deploy/backup.sh` termina sin aviso de copia,
  `rclone ls braja-crypt:` lista el archivo y `rclone ls offsite:braja-backups` muestra nombres ilegibles.
- [ ] **Monitores** (`deploy/README.md`, «Monitoreo»; decide Mateo por D-20261014-02): el latido del backup está en
  verde después de ese backup, y el monitor de `https://<dominio>/api/v1/health` está creado.

## El deploy

- [ ] **Fuera del horario del local** (lunes a sábado de 08:00 a 19:00 en Córdoba). `deploy.sh` lo comprueba solo.
- [ ] `bash deploy/deploy.sh --sha <sha>` termina con `Deployed <sha>`, el mismo sha anotado arriba.
- [ ] `curl -fsS https://<dominio>/api/v1/health` responde `{"status":"UP"}` desde afuera del servidor.
- [ ] **Copia de `deploy/.env` en el gestor de contraseñas**, tomada después del deploy (el deploy apaga el bootstrap
  y borra su contraseña del archivo), junto con la contraseña y la sal del remoto `crypt` y las credenciales del
  almacenamiento. En un lugar distinto de los backups.

## Después del deploy

- [ ] **El monitor avisa**: con el backend detenido (`docker compose -p braja stop backend`) llega el mail del monitor;
  `bash deploy/deploy.sh --sha <sha>` lo vuelve a levantar y el monitor queda en verde.
- [ ] **Simulacro de restauración**: `bash deploy/backup.sh`, después `bash deploy/restore.sh <ese archivo>`; anotar
  cuánto tardó. La base todavía casi no tiene datos: es el mejor momento.
- [ ] **Primer `ADMIN`**: entra en `https://<dominio>` con el DNI y la contraseña del paso de secretos.
- [ ] **Configuración para el lunes**: locales con su ubicación, horarios, equipo y días de trabajo cargados para la
  semana del 2026-11-16.
- [ ] **Teléfonos**: la app instalada en el teléfono del `ADMIN` con los avisos activados (llega uno de prueba) y en
  el de al menos un empleado, que marca una entrada y una salida con ubicación. Hasta la aceptación escrita de Braja
  (D-20261115-03), esa prueba se hace con una cuenta de prueba y los empleados no se habilitan.
- [ ] **El rollback se conoce**: quien opera sabe que `bash deploy/deploy.sh --rollback` vuelve a la versión anterior
  y que `deploy/RECOVERY.md` dice qué hacer si se pierde el servidor.
- [ ] **Braja tiene el plan B**: `SI_LA_APP_NO_ANDA.md` con el contacto completado, impreso y entregado, con la
  planilla en papel.
- [ ] `docs/PENDIENTES.md` y `CLAUDE.md` §7 dicen que la pila ya corre en un VPS, con la fecha.
