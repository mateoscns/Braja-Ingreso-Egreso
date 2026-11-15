Objective: issue #190, D-20261114-01: every new employee mark is confirmed with a passkey (user verification required), verified on the server with WebAuthn4J; login with DNI and password stays as it is.
Branch: feat/passkeys-webauthn4j-190 (worktree E:/Repositorios/braja-wt-passkeys-190-spike, base origin/main 784820d). Delivery: chained PRs, one per unit below, each reviewed and merged by Mateo; no automatic merge or deploy.
Runner: `cd backend && ./mvnw -B verify` (no pipes, Docker Desktop up); focused `-Dtest=<Class>`; frontend `cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build && npm run audit:prod`.

## Specs

Adopted scope (verbatim, issue #190 "Alcance adoptado" and D-20261114-01):

- S1. "Cada marca nueva exige una passkey con UV requerido, verificada en el servidor. El login con DNI y contraseña queda igual. No hay forma de marcar con la sesión sola ni con la contraseña."
- S2. Enrollment and recovery: "se hacen en persona, con un código de un solo uso válido 15 minutos." "Para generarlo, el `ADMIN` vuelve a escribir su contraseña, y ese intento cuenta en el límite del login (regla 21)." "El código es aleatorio, tiene intentos limitados, sirve solo para ese empleado y queda auditado." "No hace falta un segundo `ADMIN`."
- S3. "Una passkey por cuenta (la cuenta es global, D-20261016-01). Se aceptan passkeys sincronizadas, con este riesgo documentado: se pueden usar desde otro dispositivo de la misma cuenta del proveedor."
- S4. "Sin dispositivo compatible o con el dispositivo perdido: el empleado no marca, y el `ADMIN` carga sus marcas como marcas olvidadas hasta la recuperación."
- S5. "el `ADMIN` solo registra o recupera la passkey de una cuenta `EMPLOYEE` que está únicamente en su empresa. Si no, la respuesta es 409 `ACCOUNT_SHARED`, igual que el restablecimiento de contraseña (D-20261027-09)."
- S6. "`deploy/deploy.sh` no vuelve solo a una imagen anterior a las passkeys. Lo hace únicamente con una opción explícita que queda registrada." "Hay que coordinarlo con el PR #179."
- S7. "No se usa `http.webAuthn()` de Spring Security, por CVE-2026-47841." "No implementar reconocimiento facial propio ni almacenar biometría."
- S8. "Fuera de alcance: un celular desbloqueado que se presta, la coerción y el GPS falso."
- S9. "Pendiente obligatorio antes de habilitarlo: pruebas físicas en Android y en iPhone (regla 38)." "no afirmar que se realizaron si no existe evidencia."

Server requirements (verbatim, issue #190 "Requisitos funcionales y de seguridad"):

- S10. "Ninguna ruta de marca nueva puede aceptar una sesión sola o un fallback por contraseña."
- S11. "Challenges aleatorios, de corta vida y de un solo uso; enlazados al intento y a su alcance, con verificación completa en backend." "Cada autorización de marca debe estar ligada en el servidor a la cuenta autenticada, sesión, empresa/membresía activa, empleado, jornada, acción, `Idempotency-Key`, origen/RP ID y vencimiento."
- S12. "No crear marca, cambiar jornada ni abrir desviación si la aserción es inválida. Consumir/terminalizar el challenge también ante rechazo de negocio después de una prueba válida para evitar replay posterior."
- S13. "El commit de challenge consumido, marca, jornada e idempotencia debe ser atómico. Definir semántica de fallos transitorios para no reactivar challenges indebidamente al revertir una transacción."
- S14. "Revalidar alcance y credencial activa dentro de la transacción; fijar orden de locks y cubrir carreras entre revocación y fichaje."
- S15. "Resolver una idempotencia ya confirmada antes de rechazar un challenge consumido, después de revalidar el alcance, para que una repetición concurrente legítima recupere el resultado."
- S16. "Alta, revocación y recuperación auditadas."
- S17. "No hay marcas offline. En despliegue/rollback, una imagen anterior no debe reabrir silenciosamente el endpoint de marcas sin WebAuthn."
- S18. GPS: "Considerar el momento de captura GPS para no consumir su ventana de 30 segundos durante la confirmación del autenticador."
- S19. "Las decisiones técnicas aún abiertas, como TTL de challenges, reintentos, contador de autenticador sincronizado y retención, deben justificarse y registrarse. Escalar a Mateo cualquier decisión que modifique comportamiento de producto o riesgo aceptado."

Dependency gate (verbatim, L4):

- S20. "Doy el OK humano requerido por `CLAUDE.md` §1 para incorporar `com.webauthn4j:webauthn4j-core:0.30.3.RELEASE`." Before runtime: "1. Que Maven resuelve Jackson 2.21.8 de forma consistente, sin Jackson 3. 2. Que la biblioteca supera las pruebas criptográficas positivas y negativas del spike. 3. Que el árbol efectivo no presenta vulnerabilidades nuevas bloqueantes. 4. Que `mvn verify` y los checks correspondientes siguen en verde." "Mantenemos el login actual y no usamos `http.webAuthn()` de Spring Security."

Technical values proposed by the backend design (S19; recorded, change only with a reason): challenge TTL 5 min (WebAuthn timeout 300000 ms); enrollment code 10 Crockford base-32 characters (XXXXX-XXXXX), stored as SHA-256, locked after 5 wrong attempts, a new code supersedes the old one; sign count 0/0 accepted (synced passkeys), stored > 0 and not greater is rejected and audited; challenges and codes deleted 1 day after expiry; `braja.webauthn.rp-id`, `rp-name` and `origins` required, startup fails without them.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S7, S20 | inline | done: runtime adds only webauthn4j-core 0.30.3 and jackson-dataformat-cbor 2.21.8; 13/13 crypto tests; `./mvnw -B verify` 712/712 green; PGP good (L5); CI on the PR | cdf8db7, next commit |
| T2 | S2, S3, S11, S16 | inline | pending: schema V30-V33 (enrollment codes, credentials, mark challenges, audits) | — |
| T3 | S1, S17 | inline | pending: `braja.webauthn.*` config, fail closed; deploy env coordinated with #179 | — |
| T4 | S19 | inline | pending: retention of challenges and codes in PrivacyRetentionScheduler | — |
| T5 | S2, S5, S16 | inline | pending, blocked on E1: ADMIN side (enrollment code with password re-auth, passkey state, revocation) | — |
| T6 | S2, S3 | inline | pending: employee enrollment (registration options and registration) | — |
| T7 | S11, S15 | inline | pending: mark passkey options | — |
| T8 | S10-S15 | inline | pending: test authenticator and migration of the mark tests | — |
| T9 | S1, S10-S15 | inline | pending, blocked on E5: enforcement in POST /jornadas/{id}/marks (also the public `recordEmployeeMark(..., Instant)` overload) | — |
| T10 | S17 | — | pending, blocked on E4: optional database guard on mark_events | — |
| T11 | S1, S4, S18 | inline | pending, blocked on the UI vocabulary: PWA flow (mark, enrollment, ADMIN screen) | — |
| T12 | S6, S17 | — | pending, after #179 merges: deploy.sh rollback guard | — |
| T13 | S9 | Mateo | pending: physical tests on Android and iPhone | — |

Open decisions for Mateo (asked one at a time): E1 shared or ADMIN accounts never enroll, so they never mark; a passkey enrolled while single-company cannot be revoked once the account joins another company. E2 stable demo hostname (trycloudflare changes per restart). E3 production RP ID is permanent. E4 database guard breaks the old image on purpose (rule 20). E5 two releases: enroll first, then enforce, no switch. E6 a counter going back blocks until re-enrollment. E7 revoked credentials kept forever because marks reference them. UI vocabulary («preparar este celular», «Celular para marcar»). Capacitor plan B (D-20261014-13) stops working with WebAuthn.

## Log

- L1 (2026-11-15, Mateo, verbatim, indented):

    # BRAJA #190 — Desbloqueo técnico e implementación progresiva de passkeys

    Actuá como Staff Software Engineer y orquestador multiagente especializado en Java 21, Spring Boot, WebAuthn4J, React, MySQL y seguridad.

    Repositorio: https://github.com/mateoscns/Braja-Ingreso-Egreso

    Issue aprobado: #190  
    Decisión adoptada: D-20261114-01  
    Responsable: EnriqueMartinez26

    ## Estado inicial

    El PR #193 fue fusionado mediante merge commit `784820d6c76dde849b2693b2be60be59108b00ba`.

    Jackson 2.21.8 ya está en `main`, mediante un override temporal del BOM.

    Existe un spike local anterior:

    - Rama: `spike/webauthn4j-core-190`
    - Commit: `c894a86ee7487d4b595eb1c496dc179b3135aee1`
    - WebAuthn4J 0.31.11.RELEASE
    - Nueve pruebas criptográficas reportadas en verde
    - Dependencia incorporada solo con scope `test`

    El bloqueo pendiente es Jackson 3.2.3, transitivo de WebAuthn4J. El candidato para la corrección es Jackson 3.2.4.

    ## Reglas fundamentales

    Leer `CLAUDE.md`, `docs/DECISIONES.md` y el issue #190.

    No pedir nuevamente la aprobación de D-20261114-01. Ya fue adoptada por Mateo.

    No utilizar `http.webAuthn()` de Spring Security 6.5.

    No modificar el PR #179.

    No implementar reconocimiento facial propio ni almacenar biometría.

    No fusionar ni desplegar automáticamente.

    No alterar el trabajo de otros agentes ni sus worktrees.

    ## Delegación

    Usá agentes reales y paralelizá las tareas independientes, respetando el límite de concurrencia disponible.

    ### Agente 1 — Dependencias y WebAuthn4J

    Recuperar el spike en un worktree aislado, partiendo del nuevo `main`.

    Analizar la forma más segura de incorporar Jackson 3.2.4:

    - Evaluar `tools.jackson:jackson-bom:3.2.4`.
    - Mantener Jackson 2.21.8 para el backend existente.
    - Comprobar versiones efectivas de core, databind y CBOR.
    - Verificar compatibilidad con WebAuthn4J.
    - Revisar posibles colisiones de dependencias compartidas.
    - Auditar vulnerabilidades y licencias.

    Reejecutar las nueve pruebas criptográficas.

    No pasar WebAuthn4J a runtime hasta obtener el GO correspondiente.

    ### Agente 2 — Backend y persistencia

    Investigar el diseño de integración con `MarkService`, sesiones JDBC y MySQL.

    Preparar un diseño implementable para:

    - Registro y revocación de credenciales.
    - Alta y recuperación con autorización del ADMIN.
    - Challenges de un solo uso.
    - Verificación UV obligatoria.
    - Autorización ligada a sesión, cuenta, empresa, jornada, acción e idempotencia.
    - Consumo transaccional del challenge.
    - Reintentos concurrentes y respuestas perdidas.
    - Revalidación de credenciales revocadas.

    Respetar el orden de locks del proyecto.

    El código de autorización nunca debe confiar en valores de identidad aportados por el frontend.

    ### Agente 3 — Frontend y experiencia móvil

    Analizar los componentes existentes y preparar el flujo:

    Abrir Braja → Marcar → Verificación del teléfono → Marca registrada.

    Mantener el inicio de sesión actual.

    Preparar el diseño para alta, revocación, recuperación y errores del dispositivo.

    Revisar Safari, Android, PWA instalada y diferencias de serialización de WebAuthn.

    Considerar el momento de captura GPS para no consumir su ventana de 30 segundos durante la confirmación del autenticador.

    ### Agente 4 — QA adversarial

    Preparar una batería de pruebas contra:

    - Firma inválida.
    - UV ausente.
    - Replay.
    - Challenge vencido.
    - Otra cuenta o empresa.
    - Sesión robada.
    - Registro no autorizado.
    - Credencial revocada.
    - Doble clic.
    - Peticiones simultáneas.
    - Respuesta HTTP perdida.
    - Fallos de transacción.
    - Incompatibilidad móvil.
    - Rutas antiguas que permitan fichar sin passkey.

    Verificar que ninguna marca nueva pueda persistirse utilizando únicamente DNI y contraseña.

    ## Gates de ejecución

    ### Gate A — Seguridad de dependencias

    Primero terminar el spike actualizado.

    Debe existir evidencia de que:

    - WebAuthn4J funciona con Jackson 3 corregido.
    - Jackson 2 continúa en 2.21.8.
    - Las pruebas criptográficas pasan.
    - No hay vulnerabilidades nuevas bloqueantes sin gestionar.
    - Las dependencias y licencias están verificadas.

    Si falla este gate, detener la incorporación al runtime y entregar diagnóstico.

    ### Gate B — Implementación

    Solo después del GO del Gate A, comenzar el código del #190.

    Dividir el trabajo en cambios pequeños y revisables. Evitar que varios agentes modifiquen los mismos archivos simultáneamente.

    Implementar la decisión D-20261114-01 sin ampliar el alcance funcional.

    Las decisiones técnicas aún abiertas, como TTL de challenges, reintentos, contador de autenticador sincronizado y retención, deben justificarse y registrarse. Escalar a Mateo cualquier decisión que modifique comportamiento de producto o riesgo aceptado.

    ### Gate C — Validación integral

    Ejecutar pruebas completas de backend y frontend, concurrencia con MySQL, auditoría de seguridad y revisión adversarial independiente.

    Las pruebas físicas de Android y iPhone deberán completarse antes del deploy; no afirmar que se realizaron si no existe evidencia.

    ### Gate D — Entrega

    Abrir PR para revisión de Mateo, sin merge automático.

    Coordinar el requisito de rollback del #190 con el PR #179, evitando escrituras concurrentes en `deploy.sh`.

    Si el conector GitHub devuelve 403 en operaciones de escritura, utilizar la terminal local autenticada solo para operaciones autorizadas. Nunca interpretar un 403 como éxito.

    ## Entregable

    Quiero un informe en español con:

    1. GO/NO-GO para WebAuthn4J.
    2. Versiones Maven efectivas y auditoría.
    3. Pruebas ejecutadas y resultados verificables.
    4. Arquitectura backend seleccionada.
    5. Trabajo realizado por cada agente.
    6. Riesgos pendientes.
    7. Estado de implementación del #190.
    8. PR creado, si corresponde.
    9. Bloqueos que requieren decisión de Mateo.

    No repetir investigaciones ya cerradas si existe evidencia válida. No declarar completada la implementación hasta que estén satisfechos los criterios del issue.
- L2 (2026-11-15, Mateo, verbatim): "Tómalo vos y prepara el mensaje para Enrique". Issue #190 reassigned to mateoscns.
- L3 (2026-11-15): Gate A. WebAuthn4J 0.31 and later use Jackson 3.2.x, which needs com.fasterxml.jackson.core:jackson-annotations 2.22; with the app's 2.21, 12 of 13 crypto tests fail with NoSuchMethodError. 0.30.3.RELEASE (Jackson 2 line) passes 13/13 with the runtime unchanged. Mateo answered "Si" to 0.30.3 (recommended).
- L4 (2026-11-15, Mateo, verbatim): "Mateo, sí, confirmo que me refería a **WebAuthn4J 0.30.3.RELEASE**, no a 0.32.0. Verifiqué su publicación en Maven Central, el proyecto original, el desarrollador Yoshikazu Nojima, la licencia Apache 2.0 y sus dependencias declaradas. No encontré indicios de que sea un paquete suplantado. **Doy el OK humano requerido por `CLAUDE.md` §1 para incorporar `com.webauthn4j:webauthn4j-core:0.30.3.RELEASE`.** La firma PGP todavía no fue verificada criptográficamente, así que no la considero una comprobación completada. Antes de llevarla al runtime, quiero que confirmemos: 1. Que Maven resuelve Jackson 2.21.8 de forma consistente, sin Jackson 3. 2. Que la biblioteca supera las pruebas criptográficas positivas y negativas del spike. 3. Que el árbol efectivo no presenta vulnerabilidades nuevas bloqueantes. 4. Que `mvn verify` y los checks correspondientes siguen en verde. Mantenemos el login actual y no usamos `http.webAuthn()` de Spring Security. Con esas comprobaciones satisfactorias, podemos continuar la implementación del #190. Sin fusionar ni desplegar automáticamente."
- L5 (2026-11-15, evidence for S20): `dependency:list -DincludeScope=runtime` against main adds exactly `com.webauthn4j:webauthn4j-core:0.30.3.RELEASE` and `com.fasterxml.jackson.dataformat:jackson-dataformat-cbor:2.21.8`; every Jackson artifact is 2.21.8 (annotations 2.21); no `tools.jackson` in the tree or in the packaged jar. WebAuthn4jVerificationTest 13/13. `./mvnw -B verify` exit 0, 712 tests, 0 failures, 0 errors, 0 skipped. PGP: jar and POM "Good signature" from key D641 9D20 2DFA 86A9 210F 5F04 A6D7 9C50 3F80 535D ("WebAuthn4J Project", created 2021-03-28), the same key that signed 0.17.0 (2021), 0.24.0, 0.29.0 and 0.32.0; the CBOR jar has a good signature from Tatu Saloranta (28118C070CB22A0175A2E8D43D12CA2AC19F3181); neither key is certified by a trusted signature (no web of trust here). SHA-1 of both jars matches Maven Central. Advisories: none for webauthn4j-core 0.30.3 (global database and repository advisories) or for jackson-dataformat-cbor 2.21.8 (GHSA-cjg7-h3pr-p927 fixed in 2.21.8, GHSA-3v8f-v6vx-fmrm fixed in 2.21.6). CI checks run on the PR.
