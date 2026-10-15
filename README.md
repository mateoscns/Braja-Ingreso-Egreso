# Fichaje Braja

Sistema propio para registrar ingreso, egreso, desayuno y almuerzo de empleados. Braja necesita consultar las marcas y conocer el motivo de los desvíos. La solución debe ser simple de operar y mantener, y servir para más de una empresa y sede.

Este repositorio contiene el relevamiento inicial. Todavía no hay una implementación del sistema.

## Alcance acordado

- El `ADMIN` da de alta empleados, crea plantillas de horario y asigna una tolerancia a cada empleado.
- El empleado registra ingreso, egreso, salida y vuelta del desayuno, y salida y vuelta del almuerzo.
- Las pausas no tienen una hora fija: se compara su duración con un valor configurable.
- Ante un desvío, el empleado escribe un motivo y elige una categoría: salud, transporte, emergencia u otra.
- El sistema contempla varias empresas y sedes. Los avisos viven dentro de la aplicación.

No incluye liquidación de sueldos, cálculo de montos, banco de horas ni planificación semanal de turnos. No integra servicios externos de control horario, no envía avisos por WhatsApp o Telegram y no usa el dominio de Braja.

## Roles y documentos

**Mateo** adopta las decisiones del proyecto. **`ADMIN`** es el rol que administra la operación de cada empresa; **empleado** es quien registra sus marcas. La palabra «dueño» en documentos anteriores se usó para más de uno de estos roles, por lo que aquí se los distingue expresamente.

| Documento | Para qué sirve |
| --- | --- |
| [Registro de decisiones](docs/DECISIONES.md) | Fuente de verdad sobre lo adoptado por Mateo y lo que sigue como propuesta. |
| [Especificación funcional](docs/ESPECIFICACION.md) | Describe el alcance confirmado sin cerrar reglas pendientes. |
| [Pendientes](docs/PENDIENTES.md) | Reúne propuestas y preguntas que necesitan definición antes de implementar. |

El registro contiene **11 decisiones adoptadas y 5 propuestas**. Una propuesta no pasa a requisito por aparecer en un diseño o en un artefacto: solo Mateo puede cambiar su estado en el registro.
