# Go-live de Fichaje Braja (producción en un VPS)

Objetivo: la app anda en producción el lunes 16 de noviembre de 2026 en un VPS Hostinger, siempre que pasen las verificaciones de seguridad y funcionamiento. Rama: `chore/go-live-prep` (PR #179), worktree `braja-wt-go-live`. Estrategia: un commit por unidad en el PR #179; Mateo revisa y fusiona con merge commit fijado al head verificado. Runner: `bash -n`, pruebas en contenedores Ubuntu 24.04 descartables, `./mvnw -B verify` y el gate del frontend.

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

- S4. Mateo, 2026-11-15 (L3): «Poner Braja en condiciones de funcionar de forma segura, estable y recuperable en producción.» Quedan congelados: «Implementación funcional de passkeys», «Rediseños UX/UI», «Refactorizaciones no necesarias», «Nuevas funciones».
- S5. Passkeys (L3 §2): «No confundir congelar el desarrollo con derogar "D-20261114-01".» Antes de habilitar a los empleados, decisión expresa de Mateo entre «Alternativa A: lanzar la infraestructura y mantener el acceso productivo restringido hasta completar las passkeys» y «Alternativa B: habilitar temporalmente la versión actual sin passkeys, con aceptación explícita de Mateo y de Braja del riesgo de suplantación». «No incorporar el PR #194 al release solo para aparentar avance».
- S6. PR #179 (L3 §3, Agente A): «Comparar el PR #179 contra el "main" actualizado», «Corregir referencias a proveedores anteriores que ya no aplican», «Verificar que el PR #179 no incluya accidentalmente código de passkeys», resolver la colisión «D-20261113-*» con IDs libres de `main`, «No cambiar estados de decisiones de "propuesta" a "adoptada" sin aprobación de Mateo».
- S7. Hostinger (L3 §3, Agente B): VPS KVM, «Referencia recomendada: KVM 2», «Ubuntu Server 24.04 LTS limpio», IPv4 pública, «Sin paneles adicionales que dupliquen Caddy, Docker o el firewall». Entregable: «guía específica "HOSTINGER_GO_LIVE.md"» con los 10 puntos de hPanel, firewall (22, 80, 443, «MySQL 3306 sin exposición pública», «Backend 8080 sin exposición pública») y medición de recursos. «No cerrar la única vía de administración del VPS.»
- S8. Seguridad (L3 §3, Agente C): evaluar el «"sudo" sin contraseña para el usuario "braja"», «Preferir el menor privilegio operativamente viable», «No desactivar el acceso root ni modificar SSH antes de haber verificado, en una segunda sesión independiente, que el usuario autorizado puede entrar», `deploy/.env` en 600, sin secretos en GitHub ni en logs, claves de cifrado respaldadas fuera del VPS. Entregable: «informe de seguridad con bloqueos corregidos y riesgos residuales explícitos».
- S9. Backups (L3 §3, Agente D): «Backups automáticos reales», «Almacenamiento fuera del VPS», «Cifrado antes de subir», «Validación de integridad», «Avisos cuando falle un backup», «Restauración comprobada sobre una base de prueba», recuperación si Hostinger deja de estar disponible, procedimiento manual de fichaje. «La elección entre diario y horario requiere decisión explícita de Mateo». «No considerar que un snapshot del panel reemplaza un dump consistente de MySQL.» RTO/RPO: «No afirmar que se cumplen hasta probarlos».
- S10. QA (L3 §3, Agente E): gates de backend y frontend, Docker Compose y Caddy, arranque desde base vacía, ADMIN inicial, flujo de marcas, reinicio sin «volver a crear la empresa inicial ni perder los datos». Entregable: «matriz funcional PASS / FAIL / NOT TESTED con evidencias». «No sustituir un iPhone físico por una emulación de escritorio.»
- S11. Red team (L3 §3, Agente F): «Este agente no debe ser el autor de los cambios revisados.» «Un PASS de CI no demuestra por sí solo que el deploy funciona.»
- S12. Reglas de operación (L3 §7): «No utilizar "docker compose down -v" en producción.», «No borrar volúmenes para resolver errores.», «No introducir "--force" para saltar protecciones sin motivo y autorización.» Guía para Enrique con marcadores «<IP_DEL_VPS>» y «<DOMINIO_REAL>», sin contraseñas de ejemplo.

## Tasks

| ID | Tarea | Specs | Quién | Estado |
|---|---|---|---|---|
| T1 | Scripts: cron de backup, rclone, NTP, reinicio automático, limpieza de disco, aviso si el backup falla, chequeo de horario y de `main` en `deploy.sh`; README, `deploy/RECOVERY.md`, `docs/CHECKLIST_SALIDA.md`, `docs/CHECKLIST_RELEASE.md`, `docs/SI_LA_APP_NO_ANDA.md` | S2, S3 | desarrollo (agente lanzado el 2026-11-12) | en curso |
| T2 | Contratar el VPS Hostinger (KVM 2 de referencia, D-20261115-01 propuesta) y el dominio con solo registro `A` | S1, S7 | Enrique, con OK de Mateo | pendiente |
| T3 | Guardar `deploy/.env` y la clave de la copia cifrada en un gestor de contraseñas | S3 | Mateo | pendiente |
| T4 | Instalar en el VPS: bootstrap, secretos, deploy, backups (diario u horario, a decidir), copia externa cifrada, restauración de prueba, reinicio, monitores | S3 | desarrollo con Mateo | pendiente (sábado) |
| T5 | Pruebas físicas M-1 a M-14 de `docs/UX_UI_GUIDELINES.md` §10 en iPhone y Android | S3 | Mateo | pendiente (sábado o domingo) |
| T6 | Aviso legal mínimo y registro de la base ante la AAIP; revisión de un abogado la primera semana | S3 | Mateo y Braja | pendiente |
| T7 | Acuerdo de soporte de una página con Braja | S3 | Mateo | pendiente |
| T8 | Cargar locales, horarios, equipo y días reales; instalar la app en cada celular el lunes | S3 | Mateo con Braja | pendiente (domingo y lunes) |
| T9 | Incorporar `main` (`784820d`) al PR #179 y renumerar D-20261113-01/-02 a D-20261115-01/-02 | S6 | parent, inline | hecho (519ecc7) |
| T10 | Docs: quitar Hetzner como proveedor elegido, conteos de decisiones, checklists, `SI_LA_APP_NO_ANDA`, CLAUDE.md | S6 | agente A, delegado (paralelo, superficie disjunta) | hecho (e33ff22, ajustes en 1d9977d) |
| T11 | `deploy/HOSTINGER_GO_LIVE.md` y §1 de `deploy/README.md` | S7, S12 | agente B, delegado (paralelo) | hecho (1d9977d); sin probar en un VPS real |
| T12 | Seguridad del VPS: `bootstrap-vps.sh`, `gen-secrets.sh`, compose y Caddy; informe | S8 | agente C, delegado (paralelo) | hecho (b5ccc74); probado en contenedor Ubuntu 24.04, sin systemd ni ufw reales |
| T13 | Backups, restauración y continuidad: `backup.sh`, `restore.sh`, `deploy.sh`, `lib.sh`, `RECOVERY.md` | S9 | agente D, delegado (paralelo) | hecho (d737195); probado en contenedores; incluye la corrección de restauración del parent |
| T14 | QA de punta a punta y matriz PASS/FAIL/NOT TESTED; instrucciones de pruebas físicas | S10 | agente E, delegado (solo lectura, worktree aparte) | en curso |
| T15 | Revisión adversarial independiente del diff final | S11 | agente F, delegado (no autor) | en curso (sobre 1d9977d) |
| T16 | Decisión de passkeys A o B (S5) | S5 | Mateo | hecho: alternativa B (D-20261115-03); falta la aceptación escrita de Braja |

## Log

- L1 (2026-11-12): auditoría de preparación con pruebas reales en copias descartables (sin tocar el demo): dump 1,2 s y 124 KB; restauración 3,7 s con todas las filas idénticas; backend sano en 21 s sobre la base restaurada; sin la clave de salud original, `GET /deviations` responde 500; un deploy corta la API unos 30 a 60 s; primer build de 8 a 12 min en 2 vCPU. Hallazgos: el cron de backup no lo instala ningún script; rclone no se instala; el plan Hetzner del README no está disponible; los backups incluyen las sesiones abiertas y deben ir cifrados fuera del servidor.
- L2 (2026-11-12): Mateo autorizó preparar lo del viernes («Sí, obvio»); el deploy y la compra se ven el viernes a la noche. Decisiones pendientes para Mateo: proveedor y país del servidor, backups diarios u horarios, monitoreo externo por mail, quién cubre la suba del costo del servidor.
- L3 (2026-11-15, Mateo, verbatim; el mensaje llegó cortado a 20.000 caracteres, termina en «- Back»):

  > MISIÓN FINAL — BRAJA: CIERRE DE DESARROLLO Y GO-LIVE EN HOSTINGER
  >
  > INSTRUCCIÓN PRINCIPAL PARA MATEO Y CLAUDE OPUS
  >
  > Actuá como Principal Software Engineer, SRE, DevSecOps y responsable técnico del lanzamiento de Fichaje Braja.
  >
  > Quiero que esta ejecución sea el cierre de la preparación para producción.
  >
  > No quiero otra ronda de investigaciones generales, discusiones indefinidas ni funcionalidades nuevas. Quiero que Braja quede efectivamente preparada para desplegarse en un VPS Hostinger, con todo lo técnicamente posible resuelto, probado y documentado.
  >
  > Enrique se encargará de contratar o configurar Hostinger y ejecutar los pasos que requieran acceso a su cuenta.
  >
  > Vos sos responsable de dejar el repositorio, los scripts, las configuraciones, las pruebas y la documentación listos para esa operación.
  >
  > Objetivo operativo: lanzamiento previsto para el lunes 16 de noviembre de 2026, siempre que se superen las verificaciones de seguridad y funcionamiento.
  >
  > No sacrifiques controles críticos para cumplir la fecha. Si existe un bloqueo real, identificalo y prepará la resolución más corta y segura.
  >
  > ---
  >
  > 1. CONTEXTO Y FUENTE DE VERDAD
  >
  > Repositorio:
  >
  > "https://github.com/mateoscns/Braja-Ingreso-Egreso"
  >
  > Arquitectura existente:
  >
  > - Backend Java 21 y Spring Boot 3.5.16.
  > - MySQL 8.4 con Flyway.
  > - Frontend React + Vite + PWA.
  > - Docker Compose.
  > - Caddy para HTTPS y proxy inverso.
  > - Sesiones JDBC.
  > - Backups, restauración y scripts de infraestructura dentro de "deploy/".
  >
  > Estado conocido al comenzar:
  >
  > - "main": commit "784820d6c76dde849b2693b2be60be59108b00ba".
  > - PR #193: fusionado; Jackson 2.21.8 está en "main".
  > - PR #179: preparación del deploy, abierto en borrador.
  > - PR #194: incorporación inicial de WebAuthn4J, abierto; no implementa las passkeys funcionales.
  > - Issue #190: passkeys, aprobado, asignado a Enrique, todavía incompleto.
  > - Decisión "D-20261114-01": exige passkey para las marcas nuevas; aún no está implementada.
  >
  > Verificá nuevamente este estado antes de actuar.
  >
  > Leer obligatoriamente:
  >
  > 1. "CLAUDE.md".
  > 2. "docs/DECISIONES.md".
  > 3. "docs/ESPECIFICACION.md".
  > 4. "docs/PENDIENTES.md".
  > 5. "deploy/README.md".
  > 6. "deploy/RECOVERY.md", si existe en la rama de preparación.
  > 7. "docs/CHECKLIST_SALIDA.md".
  > 8. "docs/CHECKLIST_RELEASE.md".
  > 9. "docs/UX_UI_GUIDELINES.md", especialmente las pruebas manuales.
  > 10. "odd/tasks/go-live.md".
  > 11. Los PR #179 y #194 y el issue #190.
  >
  > La versión actual del código y las decisiones expresamente adoptadas prevalecen sobre planes anteriores.
  >
  > No inventes resultados de pruebas, infraestructura existente, aprobaciones ni accesos.
  >
  > ---
  >
  > 2. CAMBIO DE PRIORIDAD OBLIGATORIO
  >
  > A partir de esta instrucción, la prioridad absoluta es:
  >
  > Poner Braja en condiciones de funcionar de forma segura, estable y recuperable en producción.
  >
  > Quedan congelados temporalmente:
  >
  > - Implementación funcional de passkeys.
  > - Rediseños UX/UI.
  > - Refactorizaciones no necesarias.
  > - Nuevas funciones.
  > - Cambios de arquitectura sin justificación operativa.
  > - Optimizaciones cosméticas.
  > - Investigaciones que no desbloqueen una tarea concreta de producción.
  >
  > Excepción importante: decisión de passkeys
  >
  > No confundir congelar el desarrollo con derogar "D-20261114-01".
  >
  > La decisión adoptada exige passkeys para fichar y actualmente no está implementada.
  >
  > Antes de habilitar a los empleados en producción, preparar una decisión expresa para Mateo:
  >
  > Alternativa A: lanzar la infraestructura y mantener el acceso productivo restringido hasta completar las passkeys.
  >
  > Alternativa B: habilitar temporalmente la versión actual sin passkeys, con aceptación explícita de Mateo y de Braja del riesgo de suplantación mediante credenciales compartidas, alcance definido, responsable y compromiso de implementar #190 posteriormente.
  >
  > Recomendar B únicamente si el requisito antifraude no es condición contractual o funcional obligatoria para comenzar.
  >
  > No modificar silenciosamente una decisión adoptada ni declarar que las passkeys funcionan.
  >
  > No incorporar el PR #194 al release solo para aparentar avance: agregar una biblioteca que todavía no se utiliza no resuelve el problema de suplantación.
  >
  > ---
  >
  > 3. DELEGACIÓN MULTIAGENTE
  >
  > Utilizá los subagentes disponibles de Claude Code/Opus, respetando el límite de concurrencia.
  >
  > Quiero responsabilidades separadas, trabajo paralelo donde no existan dependencias y una revisión adversarial final.
  >
  > AGENTE A — Arquitectura y preparación del release
  >
  > Responsabilidad exclusiva: revisar la rama del PR #179 y consolidar la preparación de producción.
  >
  > Tareas:
  >
  > 1. Comparar el PR #179 contra el "main" actualizado.
  > 2. Detectar conflictos y cambios obsoletos.
  > 3. Verificar todas las decisiones propuestas.
  > 4. Corregir referencias a proveedores anteriores que ya no aplican.
  > 5. Adaptar el documento de arquitectura de deploy para Hostinger.
  > 6. Revisar los scripts de preparación y actualización.
  > 7. Verificar que el PR #179 no incluya accidentalmente código de passkeys.
  > 8. Preparar un diff mínimo, coherente y fácil de auditar.
  >
  > El PR #179 parte de una base anterior a la corrección Jackson. Actualizar cuidadosamente la rama, sin sobrescribir cambios de otros autores.
  >
  > Existe además una colisión documentada de identificadores de decisiones "D-20261113-*". Resolverla utilizando los identificadores realmente disponibles en "main".
  >
  > No cambiar estados de decisiones de "propuesta" a "adoptada" sin aprobación de Mateo.
  >
  > Entregable: PR #179 actualizado y revisión de los cambios necesaria para fusionarlo de manera segura.
  >
  > AGENTE B — HOSTINGER Y SISTEMA OPERATIVO
  >
  > Responsabilidad: adaptar las instrucciones al VPS real de Hostinger.
  >
  > Plataforma objetivo:
  >
  > - Proveedor: Hostinger.
  > - Tipo: VPS KVM.
  > - Referencia recomendada: KVM 2.
  > - CPU: 2 vCPU.
  > - RAM: 8 GB para KVM 2.
  > - Almacenamiento: 100 GB para KVM 2.
  > - Sistema operativo: Ubuntu Server 24.04 LTS limpio.
  > - IPv4 pública.
  > - Docker Engine y Docker Compose instalados mediante el procedimiento auditado.
  > - Sin paneles adicionales que dupliquen Caddy, Docker o el firewall.
  >
  > Si el plan adquirido es diferente, comprobar los recursos reales y documentar la compatibilidad; no asumir KVM 2 automáticamente.
  >
  > Investigar únicamente lo necesario en documentación oficial vigente de Hostinger.
  >
  > Hostinger hPanel
  >
  > Preparar instrucciones exactas para Enrique:
  >
  > 1. Dónde encontrar la IPv4 pública.
  > 2. Cómo elegir o comprobar Ubuntu 24.04 limpio.
  > 3. Cómo configurar claves SSH.
  > 4. Cómo configurar el firewall administrado.
  > 5. Cómo apuntar el dominio o subdominio.
  > 6. Dónde comprobar los recursos del servidor.
  > 7. Cómo acceder a la consola de recuperación si falla SSH.
  > 8. Cómo consultar snapshots y backups.
  > 9. Qué opciones pueden generar costos adicionales.
  > 10. Qué configuraciones NO debe activar.
  >
  > Firewall y puertos
  >
  > Validar:
  >
  > - SSH TCP 22 o puerto explícitamente documentado.
  > - HTTP TCP 80.
  > - HTTPS TCP 443.
  > - HTTPS UDP 443 si el diseño efectivo lo requiere.
  > - MySQL 3306 sin exposición pública.
  > - Backend 8080 sin exposición pública.
  > - Ningún panel administrativo adicional expuesto innecesariamente.
  >
  > Advertencia: el firewall administrado de Hostinger puede bloquear todo lo no permitido.
  >
  > Verificar conectividad SSH antes de aplicar restricciones.
  >
  > No cerrar la única vía de administración del VPS.
  >
  > Recursos
  >
  > Medir y documentar:
  >
  > - RAM.
  > - Swap.
  > - CPU.
  > - Disco libre.
  > - Inodos.
  > - Consumo de Docker.
  > - Consumo de MySQL.
  > - Consumo del backend.
  > - Límites y créditos de CPU del proveedor, cuando correspondan.
  >
  > No recomendar un plan superior sin evidencia de insuficiencia.
  >
  > Entregable: guía específica "HOSTINGER_GO_LIVE.md" o ubicación equivalente dentro de la documentación, lista para ejecutar.
  >
  > AGENTE C — SEGURIDAD DEL VPS Y SECRETOS
  >
  > Responsabilidad: validar las defensas necesarias para una aplicación que almacena registros laborales, ubicación y motivos de salud.
  >
  > Revisar:
  >
  > - Acceso SSH mediante claves.
  > - Protección del usuario de despliegue.
  > - Deshabilitación segura del acceso root remoto, cuando proceda.
  > - Actualizaciones de seguridad.
  > - Reinicios automáticos fuera del horario de trabajo.
  > - Sincronización NTP.
  > - Firewall Hostinger y firewall del sistema.
  > - Permisos de directorios y archivos.
  > - Docker y exposición de puertos.
  > - TLS.
  > - Protección de secretos.
  > - Gestión de sesiones y cookies.
  > - Ausencia de servicios innecesarios.
  >
  > Atención especial: bootstrap-vps.sh
  >
  > El PR #179 propone acceso "sudo" sin contraseña para el usuario "braja", que además pertenece al grupo "docker".
  >
  > Ambas configuraciones tienen implicaciones de privilegios elevados.
  >
  > Evaluar si realmente se necesita "sudo" irrestricto una vez terminada la instalación.
  >
  > Preferir el menor privilegio operativamente viable y documentar cualquier excepción.
  >
  > No desactivar el acceso root ni modificar SSH antes de haber verificado, en una segunda sesión independiente, que el usuario autorizado puede entrar y administrar el sistema.
  >
  > Secretos
  >
  > Comprobar que:
  >
  > - "deploy/.env" tiene permisos 600.
  > - No hay secretos en GitHub.
  > - No aparecen contraseñas en logs.
  > - No se envían secretos en respuestas de IA.
  > - No se almacenan claves en archivos de ejemplo.
  > - Las claves de cifrado están respaldadas fuera del VPS.
  > - Los datos de producción no se copian a entornos experimentales.
  > - La contraseña inicial del administrador se elimina del bootstrap como corresponde.
  >
  > Nunca mostrar el contenido completo de ".env" al generar evidencia.
  >
  > Entregable: informe de seguridad con bloqueos corregidos y riesgos residuales explícitos.
  >
  > AGENTE D — BACKUPS, RESTAURACIÓN Y CONTINUIDAD
  >
  > Responsabilidad: impedir que una falla del VPS provoque una pérdida irrecuperable de fichajes.
  >
  > Revisar:
  >
  > - "deploy/backup.sh".
  > - "deploy/restore.sh".
  > - Programación cron.
  > - Copias fuera del servidor.
  > - Encriptación de las copias externas.
  > - Rotación.
  > - Integridad.
  > - Alertas ante fallos.
  > - Restauración.
  > - Comportamiento ante falta de disco.
  > - Recuperación en un servidor nuevo.
  >
  > Requisitos
  >
  > Implementar y verificar:
  >
  > 1. Backups automáticos reales.
  > 2. Almacenamiento fuera del VPS, independiente del disco del servidor.
  > 3. Cifrado antes de subir los archivos al almacenamiento externo.
  > 4. Custodia independiente de las claves.
  > 5. Validación de integridad.
  > 6. Avisos cuando falle un backup.
  > 7. Retención documentada.
  > 8. Restauración comprobada sobre una base de prueba.
  > 9. Instrucciones para recuperar la aplicación si Hostinger deja de estar disponible.
  > 10. Procedimiento manual de fichaje mientras se recupera el servicio.
  >
  > Proponer un intervalo de backup razonable para registros de asistencia diarios.
  >
  > La elección entre diario y horario requiere decisión explícita de Mateo, con sus implicaciones de pérdida potencial de datos.
  >
  > Backups propios de Hostinger
  >
  > No considerar que un snapshot del panel reemplaza un dump consistente de MySQL.
  >
  > Distinguir:
  >
  > - Backup de aplicación.
  > - Backup cifrado externo.
  > - Backup del VPS del proveedor.
  > - Snapshot temporal del VPS.
  >
  > Documentar qué recupera cada uno y qué pérdida puede provocar.
  >
  > No restaurar sobre datos reales sin una operación aprobada expresamente. Usar un entorno desechable para los ensayos destructivos.
  >
  > RTO y RPO
  >
  > Revisar los objetivos propuestos en "deploy/RECOVERY.md":
  >
  > - Caída de aplicación: objetivo de recuperación de 15 minutos.
  > - Pérdida total del servidor: objetivo de 4 horas.
  > - Pérdida máxima de datos: según frecuencia del backup.
  >
  > No afirmar que se cumplen hasta probarlos o justificar que son objetivos todavía no medidos.
  >
  > Entregable: procedimiento reproducible y verificado de backup, restauración y recuperación.
  >
  > AGENTE E — QA END-TO-END Y EXPERIENCIA REAL
  >
  > Responsabilidad: demostrar que la aplicación funciona como sistema completo.
  >
  > Ejecutar:
  >
  > - Backend con MySQL 8.4.
  > - Tests Java.
  > - Campaña completa.
  > - Tests frontend.
  > - Lint y typecheck.
  > - Build de producción.
  > - Auditoría de dependencias pertinente.
  > - Docker Compose.
  > - Caddy.
  > - Arranque desde base vacía.
  > - Migraciones Flyway.
  > - Creación inicial del ADMIN.
  > - Login.
  > - Jornadas.
  > - Fichajes.
  > - Geolocalización.
  > - Notificaciones.
  > - Correcciones y marcas olvidadas.
  > - Auditoría de marcas.
  > - Reinicio del servidor.
  > - Persistencia de datos.
  > - Reconexión después de una caída.
  >
  > La aplicación debe sobrevivir al reinicio de los contenedores sin volver a crear la empresa inicial ni perder los datos.
  >
  > Pruebas de móviles
  >
  > Preparar y ejecutar, donde existan dispositivos físicos accesibles, las pruebas M-1 a M-14 de "docs/UX_UI_GUIDELINES.md".
  >
  > Obligatorio:
  >
  > Android
  >
  > - Instalación PWA.
  > - Login.
  > - GPS real.
  > - Entrada y salida.
  > - Sesión persistente.
  > - Notificación recibida.
  > - Reconexión tras pérdida de internet.
  >
  > iPhone
  >
  > - Safari.
  > - PWA instalada.
  > - Permisos de ubicación.
  > - Login.
  > - Fichaje completo.
  > - Notificaciones del ADMIN.
  > - VoiceOver.
  > - Elementos táctiles y diseño.
  >
  > Si no hay un dispositivo disponible, crear instrucciones exactas para que Enrique o Mateo realicen la prueba y adjunten evidencia.
  >
  > No sustituir un iPhone físico por una emulación de escritorio.
  >
  > No afirmar que una prueba física pasó sin haberla hecho.
  >
  > Entregable: matriz funcional PASS / FAIL / NOT TESTED con evidencias.
  >
  > AGENTE F — RED TEAM / VERIFICADOR INDEPENDIENTE
  >
  > Este agente no debe ser el autor de los cambios revisados.
  >
  > Debe intentar encontrar:
  >
  > - Errores peligrosos en el bootstrap.
  > - Bloqueos SSH.
  > - Contradicciones entre los firewalls.
  > - MySQL expuesto.
  > - Pérdida de secretos.
  > - Backups irrecuperables.
  > - Restauración que destruye datos incorrectos.
  > - Fallos de DNS o certificados.
  > - Contenedores que no arrancan tras reiniciar.
  > - Falta de recursos.
  > - Errores de permisos.
  > - Deploy de un commit distinto del aprobado.
  > - Rollback inseguro.
  > - Estados de negocio inconsistentes después de una falla.
  > - Cambios accidentales en las decisiones adoptadas.
  > - Documentación que promete algo que el código no hace.
  >
  > Verificar los procedimientos sobre Linux real o una máquina virtual desechable cuando corresponda.
  >
  > Emitir un dictamen independiente con hallazgos bloqueantes y no bloqueantes.
  >
  > Un PASS de CI no demuestra por sí solo que el deploy funciona.
  >
  > ---
  >
  > 4. FASE 0 — CONGELAR EL ALCANCE
  >
  > Antes de editar:
  >
  > 1. Registrar el SHA actual de "main".
  > 2. Revisar los PR abiertos.
  > 3. Confirmar que no hay cambios incompatibles en curso.
  > 4. Congelar las funcionalidades destinadas a un lanzamiento posterior.
  > 5. Identificar las decisiones de producto necesarias para el lanzamiento.
  > 6. Registrar la separación entre release operativo y futuro sistema de passkeys.
  >
  > No mezclar los cambios del PR #194 con los del PR #179.
  >
  > No cerrar el issue #190.
  >
  > No declarar implementado WebAuthn.
  >
  > Si la salida temporal sin passkeys se aprueba, registrar el riesgo, la excepción y las condiciones de finalización conforme al proceso del repositorio.
  >
  > ---
  >
  > 5. FASE 1 — CERRAR EL PR #179
  >
  > Esta es la primera prioridad de código.
  >
  > Revisar integralmente:
  >
  > - "bootstrap-vps.sh"
  > - "deploy.sh"
  > - "docker-compose.yml"
  > - "backup.sh"
  > - "restore.sh"
  > - "gen-secrets.sh"
  > - "deploy/README.md"
  > - "deploy/RECOVERY.md"
  > - "docs/CHECKLIST_SALIDA.md"
  > - "docs/CHECKLIST_RELEASE.md"
  > - "docs/SI_LA_APP_NO_ANDA.md"
  > - "docs/DECISIONES.md"
  > - "CLAUDE.md"
  >
  > Aplicar únicamente correcciones necesarias para Hostinger, seguridad y operación.
  >
  > Condiciones para considerar terminado #179
  >
  > - No quedan referencias operativas equivocadas a Hetzner como proveedor elegido.
  > - La documentación contempla Hostinger.
  > - No existen identificadores duplicados de decisiones.
  > - Los scripts funcionan en Ubuntu 24.04.
  > - El bootstrap es repetible.
  > - La instalación conserva acceso administrativo.
  > - Docker Compose valida.
  > - El servidor utiliza IPv4 correctamente.
  > - Caddy puede emitir TLS.
  > - Los backups y alertas tienen un procedimiento funcional.
  > - La restauración está comprobada en ambiente desechable.
  > - Se ejecutaron las pruebas pertinentes.
  > - El revisor independiente dio su informe.
  > - Se conocen todas las limitaciones.
  >
  > Solicitar revisión nativa de GitHub.
  >
  > El merge lo realiza Mateo con el SHA final comprobado y CI verde.
  >
  > No hacer squash si el procedimiento del repositorio exige merge commit.
  >
  > No fusionar automáticamente.
  >
  > ---
  >
  > 6. FASE 2 — PREPARAR EL VPS HOSTINGER
  >
  > No asumir que existe un VPS contratado.
  >
  > Si Enrique ya tiene acceso, proporcionar pasos para comprobarlo.
  >
  > Si todavía no lo contrató, entregar una guía de creación.
  >
  > Configuración recomendada
  >
  > - VPS KVM 2 como referencia.
  > - Ubuntu 24.04 limpio.
  > - IPv4 pública.
  > - SSH con clave pública.
  > - Región seleccionada considerando latencia, precio y ubicación de datos.
  > - Sin panel de administración adicional.
  > - Sin MySQL administrado de terceros.
  > - Sin Redis.
  > - Sin Kubernetes.
  > - Sin SaaS de despliegue innecesario.
  >
  > Reutilizar Docker Compose y Caddy del repositorio.
  >
  > Dominio
  >
  > Preparar dos alternativas:
  >
  > A. Dominio o subdominio propio, recomendado si ya está disponible.
  >
  > B. Subdominio estable compatible con los requisitos actuales, sin introducir servicios de pago innecesarios.
  >
  > Requisitos:
  >
  > - DNS "A" a la IPv4 real del VPS.
  > - Sin "AAAA" hasta resolver correctamente la política IPv6 y la identificación de IP de clientes.
  > - HTTPS válido.
  > - Caddy configurado para el dominio elegido.
  > - Pruebas de resolución desde afuera.
  > - Puertos 80 y 443 accesibles.
  >
  > No inventar un dominio ni emitir certificados para una dirección ficticia.
  >
  > Procedimiento que recibirá Enrique
  >
  > Preparar un documento que indique exactamente:
  >
  > 1. Qué seleccionar en Hostinger.
  > 2. Qué opción no seleccionar.
  > 3. Qué dato copiar del panel.
  > 4. Dónde configurar DNS.
  > 5. Cómo abrir y verificar SSH.
  > 6. Qué comandos ejecutar.
  > 7. Qué salida debe observar.
  > 8. Cómo detectar un error.
  > 9. Cómo recuperarse sin reinstalar.
  > 10. Qué evidencia compartir con Mateo sin exponer secretos.
  >
  > Usar marcadores claros como "<IP_DEL_VPS>" y "<DOMINIO_REAL>".
  >
  > No incluir contraseñas de ejemplo que se puedan confundir con credenciales definitivas.
  >
  > ---
  >
  > 7. FASE 3 — PREPARAR LA INSTALACIÓN REPRODUCIBLE
  >
  > Quiero que todos los pasos queden especificados y que los comandos correspondan a los scripts realmente existentes.
  >
  > Orden requerido:
  >
  > 1. Comprobar SSH.
  > 2. Verificar Ubuntu 24.04.
  > 3. Verificar IPv4 y DNS.
  > 4. Comprobar firewall del proveedor.
  > 5. Ejecutar bootstrap auditado.
  > 6. Verificar NTP.
  > 7. Verificar Docker y Compose.
  > 8. Verificar memoria, swap y disco.
  > 9. Clonar repositorio.
  > 10. Confirmar SHA de "main" y CI verde.
  > 11. Generar secretos.
  > 12. Verificar permisos.
  > 13. Configurar copia cifrada fuera del VPS.
  > 14. Configurar monitoreo.
  > 15. Ejecutar deploy.
  > 16. Verificar HTTPS y salud.
  > 17. Verificar creación del ADMIN.
  > 18. Verificar que los secretos de bootstrap dejaron de estar activos.
  > 19. Realizar prueba funcional.
  > 20. Comprobar backup.
  > 21. Probar restauración segura.
  > 22. Comprobar reinicio.
  > 23. Entregar acceso operativo al responsable.
  >
  > No sustituir scripts auditados por comandos manuales improvisados.
  >
  > No utilizar "docker compose down -v" en producción.
  >
  > No borrar volúmenes para resolver errores.
  >
  > No introducir "--force" para saltar protecciones sin motivo y autorización.
  >
  > ---
  >
  > 8. FASE 4 — VALIDAR EL RELEASE REAL
  >
  > La salida a producción debe ser verificable desde fuera del servidor.
  >
  > Backend
  >
  > - Respuesta correcta del endpoint de salud.
  > - MySQL saludable.
  > - Migraciones correctas.
  > - Sin excepciones repetidas.
  > - Sin reinicios continuos.
  > - Configuración del entorno correcta.
  > - Hora del servidor sincronizada.
  >
  > Frontend
  >
  > - Página cargando por HTTPS.
  > - Archivos estáticos correctos.
  > - Navegación operativa.
  > - Login.
  > - Gestión administrativa.
  > - Sesión.
  > - Errores controlados.
  >
  > Negocio
  >
  > Comprobar el flujo mínimo:
  >
  > 1. Crear o utilizar empresa inicial.
  > 2. Crear sede.
  > 3. Configurar horarios.
  > 4. Registrar empleado de prueba.
  > 5. Declarar jornada.
  > 6. Registrar entrada.
  > 7. Registrar pausa cuando corresponda.
  > 8. Registrar regreso.
  > 9. Registrar salida.
  > 10. Verificar el historial y las horas.
  > 11. Verificar auditoría.
  > 12. Verificar el comportamiento de GPS.
  > 13. Verificar acciones del ADMIN.
  >
  > No usar registros ficticios mezclados permanentemente con los datos laborales reales.
  >
  > Resiliencia
  >
  > Comprobar:
  >
  > - Reinicio del backend.
  > - Reinicio del VPS mediante ventana controlada.
  > - Persistencia de MySQL.
  > - Recuperación automática.
  > - Monitor externo.
  > - Back

- L4 (2026-11-15): estado al empezar. `origin/main` = `784820d6c76dde849b2693b2be60be59108b00ba`. PRs abiertos: #179 (draft, `9a1d127` sobre la base `d35d413`) y #194 (WebAuthn4J, no entra en este release). Issue abierto: #190 (passkeys, asignado a mateoscns). El #179 no toca `backend/` ni `frontend/` (`git diff origin/main HEAD -- backend frontend` vacío tras el merge). Merge de `main` en el #179 con conflictos en `CLAUDE.md` y `docs/DECISIONES.md`, resueltos dejando las filas de `main` y renumerando las propuestas a D-20261115-01 (servidor Hostinger) y D-20261115-02 (RTO y RPO).
- L5 (2026-11-15): Mateo eligió la alternativa B de passkeys («B: sin passkeys, temporal»), registrada como D-20261115-03, adoptada. Commits: b5ccc74 (seguridad: sudo con contraseña, SSH en un segundo paso con login por clave probado), e33ff22 (docs y la decisión B), d737195 (backups verificados por carga, copia externa cifrada con age, restore --check, deploy --sha), 1d9977d (guía de Hostinger y runbooks). Revisión del parent sobre el trabajo de D: el backup de seguridad de restore.sh podía rotar y borrar el archivo que se restauraba después del DROP DATABASE; corregido restaurando desde una copia privada. deploy/.env.template no se leyó (el harness lo deniega): Mateo decide si suma BRAJA_BACKUP_AGE_RECIPIENTS, BRAJA_BACKUP_KEEP_MIN, BRAJA_BACKUP_VERIFY_RESTORE y BRAJA_RESTORE_AGE_IDENTITY comentadas.
