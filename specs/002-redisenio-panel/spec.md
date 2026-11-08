# CodificaWeb · Seleccionar y categorizar

**Estado** · Borrador para aprobación. [Maqueta 02](https://www.figma.com/design/HtpYQ4Cfy5lKDcs61xO16l?node-id=4-2)

Una persona selecciona texto en la página, aplica una categoría existente o crea una con nombre y definición opcional. El proyecto asigna el color automáticamente. Al guardar, la cita queda asociada y resaltada. La categoría se reutiliza dentro del proyecto con su color y definición.

| ID    | Criterio de aceptación                                                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-01 | Al invocar CodificaWeb sobre una página compatible, la selección existente aparece en el panel. Si aún no hay selección, el panel indica que seleccione texto. Si hay un impedimento de acceso, el panel ofrece la acción necesaria en el punto de uso. El recorrido habitual no presenta una pantalla previa de autorización ni exige escribir la URL. |
| UX-02 | Desde la cita, se puede buscar y aplicar una categoría existente o crear una con nombre y definición opcional, con color asignado automáticamente mediante **Guardar y aplicar**. Se muestra la confirmación tras guardar.                                                                                                                              |
| UX-03 | El color de la categoría identifica el fragmento y su etiqueta con nombre. El usuario puede aplicar más de una categoría sin duplicarlas y distinguirlas mediante el panel y sus filtros.                                                                                                                                                               |
| UX-04 | Cambiar de pestaña, documento o proyecto invalida una selección pendiente. Un error de guardado conserva el formulario para reintentar y evita crear una categoría o asociación parcial.                                                                                                                                                                |
| UX-05 | Los proyectos anteriores siguen disponibles. Las citas, categorías, notas y archivos JSON conservan compatibilidad. El trabajo queda en el perfil local.                                                                                                                                                                                                |

La nota de la cita sigue disponible como acción secundaria. La definición pertenece a la categoría. Las funciones de búsqueda y administración se conservan según la [especificación vigente](../001-codificacion-web/spec.md).

T019 amplía la paleta cualitativa según el número de categorías del proyecto. Los colores ya asignados se conservan al añadir, eliminar o renombrar categorías, así como al importar proyectos.

## Citas subrayadas y categorías al margen

**Historia · Lectura de citas guardadas.** Al volver a una página codificada, quiero ver qué fragmentos están guardados, reconocer sus categorías por nombre y consultar su definición sin perder mi lugar.

| Criterio | Resultado observable                                                                                                                                                                                                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-06    | Cada cita guardada queda delimitada por una línea fina bajo el texto. La línea sigue los saltos de línea y distingue la cita de la selección temporal del navegador. En fragmentos con varias categorías se usa una sola línea. En citas solapadas se conserva el desempate de pintura existente y cada cita sigue siendo consultable. |
| UX-07    | El margen muestra una etiqueta por categoría aplicada, con su nombre y color. Las etiquetas se alinean con el comienzo de la cita. Cuando falta espacio o varias citas se agrupan, los nombres siguen disponibles en el panel, en orden de aparición, sin tapar el texto ni generar desplazamiento horizontal.                         |
| UX-08    | Pulsar una etiqueta con el ratón o activarla con el teclado abre la ficha de esa categoría y su cita. La ficha muestra nombre, color y definición vigente, o «Sin definición» si está vacía. Se puede activar otra etiqueta sin cambiar la selección de texto ni mover la página.                                                      |

Aplican FR-02/CA-02, FR-04/CA-04, FR-05/CA-05 y FR-06/CA-06 de la [especificación base](../001-codificacion-web/spec.md). Se mantienen la selección automática, la asignación desde el panel, los filtros, la privacidad local y la recuperación con los permisos vigentes.
