# Cobertura UX del frontend

Este mapa aplica las leyes y reglas compartidas para el frontend de Fichaje Braja. Es una guía contextual, no una lista de funciones a agregar. Los principios que no aportan a un flujo de fichaje quedan fuera del producto.

## Criterio de lectura

- **Aplicada:** hay un patrón concreto en la interfaz.
- **Parcial:** existe una base, pero falta validación con usuarios, medición o cobertura en todos los estados.
- **Validación pendiente:** el código da soporte, pero se necesita dispositivo o tecnología asistiva real.
- **N/A:** agregarlo no tiene justificación en el alcance confirmado.
- **Ambigua:** el texto de origen está incompleto o corrupto; no se transforma en requisito.

## Laws of UX

| Ley | Estado | Aplicación en Braja y límite |
|---|---|---|
| Aesthetic-Usability Effect | Parcial | La interfaz mantiene la paleta verde/lima y una jerarquía visual sencilla. La percepción de facilidad requiere evaluación con empleados y ADMIN. |
| Chunking | Aplicada | Formularios, jornada, marcas y motivos se agrupan en paneles y secciones con títulos. |
| Doherty Threshold | Parcial | Esperas y confirmaciones del servidor son visibles; no hay medición de tiempos percibidos ni presupuesto de respuesta UX. |
| Cognitive Bias | Parcial | Estados, fechas locales y confirmaciones intentan reducir interpretaciones erróneas. Falta observar tareas reales para identificar sesgos o errores recurrentes. |
| Fitts's Law | Aplicada | Controles principales tienen objetivos táctiles amplios (mínimo 44 px) y estados de foco visibles. |
| Cognitive Load | Parcial | Etiquetas, ayudas y agrupación reducen memoria necesaria; la carga real debe probarse con usuarios. |
| Flow | Aplicada | El ADMIN navega por áreas estables y el empleado conserva un flujo directo para revisar jornada y fichar. |
| Goal-Gradient Effect | Parcial | Esperas, envíos y confirmaciones muestran avance de la acción; no se agrega una barra de progreso a tareas que no son progresivas. |
| Hick's Law | Aplicada | Se presentan acciones contextuales para el estado de la jornada, evitando ofrecer fichajes que no corresponden. |
| Jakob's Law | Aplicada | Se usan patrones web conocidos: navegación, formularios etiquetados, botones, estados de carga y mensajes de error. |
| Law of Common Region | Aplicada | Los límites de los paneles agrupan datos y acciones relacionados. |
| Law of Proximity | Aplicada | Etiquetas, campos, ayudas y acciones relacionadas aparecen juntos. |
| Law of Prägnanz | Aplicada | La pantalla usa jerarquía y bloques simples para hacer legible información operativa. |
| Law of Similarity | Aplicada | Componentes equivalentes comparten estilos y estados visuales. |
| Law of Uniform Connectedness | Aplicada | Los controles dentro de una sección se mantienen visualmente conectados mediante paneles y agrupaciones. |
| Mental Model | Aplicada | Se explicita que la marca usa hora del servidor, requiere conexión y puede asociar ubicación aparte. |
| Miller's Law | Parcial | Navegación y opciones se agrupan; no se toma “7 ± 2” como límite rígido ni se hizo prueba de recuerdo. |
| Occam's Razor | Aplicada | Se priorizan estados, acciones y controles necesarios para registro y administración de jornadas. |
| Paradox of the Active User | Aplicada | Las pantallas son accionables sin manual y muestran ayudas breves junto a los campos. |
| Pareto Principle | Parcial | Se priorizan fichaje, jornada y bandeja; no hay analítica de uso para afirmar una distribución 80/20. |
| Postel's Law | Parcial | Los formularios ofrecen validación y errores recuperables. El backend sigue siendo la autoridad y el frontend no promete aceptación antes de confirmarla. |
| Tesler's Law | Parcial | Se hace visible la complejidad inevitable de jornadas, sedes y estados; la simplificación debe validarse en tareas reales. |
| Peak-End Rule | Parcial | Una acción confirmada recibe un comprobante visible y los errores indican cómo reintentar; falta evaluación cualitativa del cierre de tareas. |
| Von Restorff Effect | Aplicada | Acciones principales y estados relevantes se distinguen con tamaño, color y contraste sin competir con el resto. |
| Selective Attention | Aplicada | Los títulos, estados y acciones principales resaltan frente a la información secundaria. |

## Rules for UI Design

| N.º | Regla recibida | Estado | Aplicación o motivo |
|---:|---|---|---|
| 1 | Embrace negative space | Aplicada | Espaciado y separación de secciones facilitan el escaneo. |
| 2 | Achieve simplicity through meaningful reduction | Aplicada | Se conserva el alcance de fichaje; no se agregan funciones sin valor confirmado. |
| 3 | Create great user experience through empathy | Parcial | Espera, errores, ayuda y confirmación tienen mensajes orientados a la persona; falta validación con usuarios. |
| 4 | “Create great user experiences through” | Ambigua | La frase está incompleta. |
| 5 | Strive for intuitive processes | Aplicada | Los pasos y controles corresponden al estado visible de cada jornada. |
| 6 | Create a comprehensive design system | Parcial | Hay componentes y tokens compartidos; falta una guía formal de diseño y su validación en todas las pantallas. |
| 7 | Introduce gamification | N/A | No corresponde al control horario confirmado y podría distraer del fichaje. |
| 8 | Use the Golden Ratio or Rule of Thirds | N/A | No es requisito funcional ni se fuerza una proporción decorativa en una herramienta operativa. |
| 9 | Organization helps discoverability of features | Aplicada | Las áreas del ADMIN tienen navegación y agrupación consistentes. |
| 10 | Intuitive Flow | Aplicada | La navegación y las acciones siguen el contexto de la tarea. |
| 11 | Leverage rich user analytics | N/A | No se incorpora analítica de comportamiento al alcance. |
| 12 | Leverage rich user analytics (duplicada) | N/A | Duplicado de la regla 11; no se incorpora analítica. |
| 13 | Stick to tried and tested design patterns | Aplicada | Formularios, navegación, estados y foco usan patrones web reconocibles. |
| 14 | Personalization & customization | N/A | No se agregan opciones de personalización sin necesidad de producto. |
| 15 | Use size, color, and contrast to establish a clear hierarchy | Parcial | Hay jerarquía y contraste deliberado; falta verificar todos los pares de color en pantallas y estados reales. |
| 16 | Don't make users think | Aplicada | Las acciones, estados de jornada y mensajes explican qué se puede hacer y qué pasó. |
| 17 | “Contextual hires and tips” | Parcial | Interpretada con cautela como ayudas contextuales: hay hints junto a campos; la frase original contiene un error. |
| 18 | 60-20-10 Color | Parcial | Se respeta la identidad Braja verde/lima; no se impone una proporción fija ni se midió su balance visual. |
| 19 | “Be modal advanced not-medal reliant” | Ambigua | La frase está corrupta; no se convierte en requisito de modales. |
| 20 | Be predictable | Aplicada | Los controles mantienen ubicación, comportamiento y feedback consistentes. |
| 21 | Be predictable (duplicada) | Aplicada | Duplicado de la regla 20. |
| 22 | Utilize grid systems | Aplicada | El layout usa grillas y adapta columnas a pantallas estrechas. |
| 23 | Good design is inclusive | Parcial | Foco visible, etiquetas, anuncios de estado, movimiento reducido y forced-colors están contemplados; falta prueba con lector de pantalla y personas usuarias. |
| 24 | Preference Disclosures | N/A | No se introducen preferencias o personalizaciones que requieran divulgación. |
| 25 | “Lean Flat design but” | Ambigua | La frase está incompleta. |
| 26 | “Ensure consistrant oderotiom” | Aplicada | Interpretada como consistencia de operación; los patrones de controles y feedback se comparten. |
| 27 | Ensure consistent identical design elements | Aplicada | Elementos equivalentes reutilizan componentes y estilos. |
| 28 | Set guidelines for micro-experience design components | Parcial | Existen componentes compartidos; la guía de uso todavía no está formalizada. |
| 29 | Create a clear focal point | Aplicada | Títulos y acciones principales tienen jerarquía visual. |
| 30 | “Savings in time feel like smpicity” | Parcial | Se reducen pasos y se comunica el resultado; el ahorro de tiempo requiere pruebas comparativas. |
| 31 | “Entoll or retire users” | Parcial | El ADMIN cuenta con flujos de alta/activación y baja de empleados; requiere validación con tareas reales. |
| 32 | Personalization and visual feedback | Parcial | Hay feedback visual y textual; la personalización no se agrega al alcance. |
| 33 | Set guidelines for micro-experience design components (duplicada) | Parcial | Duplicado de la regla 28. |
| 34 | “Ensure consoliality indeaed consolidation” | Ambigua | La frase está corrupta; no se asume si pedía consolidación u otra cosa. |
| 35 | Create rhythm to direct attention | Aplicada | Espaciado, títulos y jerarquía guían el recorrido de lectura. |
| 36 | “Savings in time to simplicity” | Parcial | Duplicado aproximado de la regla 30; falta medir ahorro de tiempo. |
| 37 | “Personalizatio and visual feed” | Parcial | Duplicado aproximado de la regla 32; el feedback está presente y no se incorpora personalización. |
| 38 | Social integration | N/A | Integración social no tiene relación con el alcance confirmado. |

## Validación pendiente

- Los tests automatizados y la revisión del navegador cubren interfaz y estados, pero no sustituyen la prueba con lector de pantalla ni la evaluación con empleados y ADMIN.
- La comparación visual cubre acceso, selección de empresa, cambio de contraseña, las cinco áreas del ADMIN, empleado y avisos en Chromium, a 1440 × 1000 y con viewport móvil emulado de 390 × 844. Se verificó que ninguna vista exceda el ancho móvil; la prueba en el iPhone real del ADMIN sigue pendiente.
- La confirmación de push en iPhone sigue siendo una prueba de entorno antes de certificar esa parte de la PWA.
- Los puntos N/A y las frases ambiguas no deben convertirse en funcionalidades sin una decisión de producto.
