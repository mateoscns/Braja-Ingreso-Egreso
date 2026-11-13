# Checklist de release

Se sigue **en cada actualización** del servidor, después de la salida a producción (`CHECKLIST_SALIDA.md`). Cada
ítem dice cómo se comprueba; se marca solo con lo observado, con su evidencia en el PR o el issue del release. Un
ítem sin marcar necesita una excepción explícita de Mateo (`CLAUDE.md` §8). El procedimiento completo está en
`deploy/README.md` §9 y §10.

## Antes

- [ ] **El commit está en `main` con CI verde**: en GitHub, el commit tiene en verde «Backend (Java 21 + MySQL 8.4)»,
  «Backend campaign (MySQL 8.4)» y «Frontend (Node 24)». `deploy.sh` exige `HEAD` igual a `origin/main` pero no ve el
  CI.
- [ ] **Migraciones**: si el release trae una migración nueva, deja funcionando a la imagen anterior (regla 20). Si
  no, el rollback necesita restaurar el backup, y eso se sabe antes de empezar.
- [ ] **Verificación manual** de `docs/UX_UI_GUIDELINES.md` §10 para lo que cambió, con su evidencia (M-14 siempre que
  cambien textos; M-7 y M-9 en teléfonos reales si cambia algo de la marca, la ubicación o los avisos).
- [ ] **Hay un backup reciente afuera**: el latido del backup está en verde, y `rclone lsf braja-crypt: | sort | tail
  -n 1` es de hace menos de 25 h (backup diario) o de 2 h (cada hora). El deploy toma uno propio antes de migrar,
  pero este comprueba que la copia de afuera anda.
- [ ] **Fuera del horario del local** (lunes a sábado de 08:00 a 19:00 en Córdoba; `deploy.sh` lo comprueba). Un
  arreglo urgente en horario va con `--force` y se le avisa antes a Braja: la app se corta de 30 a 60 s.
- [ ] **Hay al menos 3 GB libres**: `df -h /` (el deploy no arranca con menos).

## El deploy

- [ ] `cd ~/fichaje && git pull --ff-only && bash deploy/deploy.sh` termina con `Deployed <sha>` y el sha es el del
  primer ítem.

## Después

- [ ] `curl -fsS https://<dominio>/api/v1/health` responde `{"status":"UP"}` y el monitor de la app está en verde.
- [ ] Entrar como `ADMIN`: «Hoy» y «Para revisar» abren sin error.
- [ ] Si cambió `deploy/.env`, la copia del gestor de contraseñas está actualizada.
- [ ] **Si algo falla**: `bash deploy/deploy.sh --rollback` vuelve a la versión anterior. Si el deploy dijo que hubo
  migraciones y la versión anterior falla con el esquema nuevo, correr el `restore.sh` que imprimió (se pierde lo
  escrito desde ese backup). Más casos en `deploy/RECOVERY.md`.
