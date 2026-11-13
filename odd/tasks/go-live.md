# Go-live de Fichaje Braja (producción en un VPS)

Objetivo: la app anda en producción el lunes 16 de noviembre de 2026; deploy a más tardar el domingo 15. Rama de trabajo: la del PR de preparación del deploy (ver Log). Estrategia: un PR por tanda, merge con CI verde fijado al head.

## Specs

- S1. Mateo, 2026-11-12: «deja todas las investigaciones necesarias para que salgamos al deploy a más tardar el domingo, porque ya el lunes tiene que estar andando».
- S2. Mateo, 2026-11-12: «mi idea es que sea seguro, no se caiga y demás. la idea es que no tenga problemas con eso ningún día el cliente. es algo de uso diario».
- S3. Lo obligatorio antes del lunes, según la auditoría de preparación del 2026-11-12 (registro L1):
  - backup diario programado (ningún script lo instalaba), copia fuera del servidor cifrada, restauración probada en el VPS;
  - las claves de `deploy/.env` guardadas fuera del servidor (sin la clave de salud, «Para revisar» responde 500 en páginas con motivos de salud);
  - aviso externo si la app se cae y aviso si el backup falla (por mail);
  - lista de chequeo de salida y de cada actualización; deploys fuera del horario de trabajo;
  - reloj sincronizado (las marcas usan la hora del servidor) y prueba de reinicio;
  - pruebas físicas en iPhone y Android (D-20261112-04 vence en el primer deploy);
  - aviso legal mínimo a los empleados sobre ubicación y datos de salud (Ley 25.326);
  - acuerdo de soporte de una página con Braja (canal, horario, papel de respaldo);
  - carga de datos reales en producción (arranca vacía) e instalación en los celulares.

## Tasks

| ID | Tarea | Specs | Quién | Estado |
|---|---|---|---|---|
| T1 | Scripts: cron de backup, rclone, NTP, reinicio automático, limpieza de disco, aviso si el backup falla, chequeo de horario y de `main` en `deploy.sh`; README, `deploy/RECOVERY.md`, `docs/CHECKLIST_SALIDA.md`, `docs/CHECKLIST_RELEASE.md`, `docs/SI_LA_APP_NO_ANDA.md` | S2, S3 | desarrollo (agente lanzado el 2026-11-12) | en curso |
| T2 | Elegir y comprar el servidor (Hetzner CX23 no disponible; CPX22, DigitalOcean o Vultr São Paulo; decisión de proveedor y país de los datos) y el dominio con solo registro `A` | S1 | Mateo | pendiente (viernes a la noche) |
| T3 | Guardar `deploy/.env` y la clave de la copia cifrada en un gestor de contraseñas | S3 | Mateo | pendiente |
| T4 | Instalar en el VPS: bootstrap, secretos, deploy, backups (diario u horario, a decidir), copia externa cifrada, restauración de prueba, reinicio, monitores | S3 | desarrollo con Mateo | pendiente (sábado) |
| T5 | Pruebas físicas M-1 a M-14 de `docs/UX_UI_GUIDELINES.md` §10 en iPhone y Android | S3 | Mateo | pendiente (sábado o domingo) |
| T6 | Aviso legal mínimo y registro de la base ante la AAIP; revisión de un abogado la primera semana | S3 | Mateo y Braja | pendiente |
| T7 | Acuerdo de soporte de una página con Braja | S3 | Mateo | pendiente |
| T8 | Cargar locales, horarios, equipo y días reales; instalar la app en cada celular el lunes | S3 | Mateo con Braja | pendiente (domingo y lunes) |

## Log

- L1 (2026-11-12): auditoría de preparación con pruebas reales en copias descartables (sin tocar el demo): dump 1,2 s y 124 KB; restauración 3,7 s con todas las filas idénticas; backend sano en 21 s sobre la base restaurada; sin la clave de salud original, `GET /deviations` responde 500; un deploy corta la API unos 30 a 60 s; primer build de 8 a 12 min en 2 vCPU. Hallazgos: el cron de backup no lo instala ningún script; rclone no se instala; el plan Hetzner del README no está disponible; los backups incluyen las sesiones abiertas y deben ir cifrados fuera del servidor.
- L2 (2026-11-12): Mateo autorizó preparar lo del viernes («Sí, obvio»); el deploy y la compra se ven el viernes a la noche. Decisiones pendientes para Mateo: proveedor y país del servidor, backups diarios u horarios, monitoreo externo por mail, quién cubre la suba del costo del servidor.
