# Plan de datos · Relaciones entre fuentes

[Especificación](spec.md) · [Tareas](tasks.md) · [Flujo de desarrollo](../../docs/github-flow.md)

## Modelo persistente

Se añaden las tablas `relationTypes` y `quotationLinks` a IndexedDB mediante una migración aditiva de Dexie v3 a v4. Cada fila de `quotationLinks` expresa una relación respaldada por un par de citas. `relationTypes` es el catálogo del proyecto y comienza vacío. Cada tipo guarda `id`, `projectId`, `name`, `description?`, `direction` (dirigida o simétrica), `createdAt` y `updatedAt`. El nombre normalizado es único dentro del proyecto. Las fuentes se recuperan por `annotations.sourceId`; la consulta de fuente a fuente es una proyección calculada.

| Campo                                | Función                                                          |
| ------------------------------------ | ---------------------------------------------------------------- |
| `id`                                 | UUID del vínculo, estable dentro del proyecto.                   |
| `projectId`                          | Proyecto propietario de ambas citas y fuentes.                   |
| `fromAnnotationId`, `toAnnotationId` | UUID de la cita de origen y de destino.                          |
| `relationTypeId`                     | Referencia al tipo definido por la persona en el mismo proyecto. |
| `note?`                              | Justificación opcional en texto plano.                           |
| `createdAt`, `updatedAt`             | Fechas de creación y última edición.                             |

En un tipo dirigido, el orden de las citas distingue entradas y salidas. En un tipo simétrico, se ordenan los UUID antes de guardar para que A–B y B–A sean el mismo vínculo. El índice único por proyecto, ambos extremos y tipo evita duplicados. Repetir el alta devuelve el vínculo existente sin sustituir su nota. Renombrar un tipo actualiza su nombre en las consultas porque los vínculos apuntan a su UUID. El borrado y el cambio de dirección se bloquean mientras existan vínculos del tipo. Los vínculos se establecen explícitamente y la consulta no infiere nuevos vínculos por transitividad.

Ejemplo: la persona crea los tipos «Apoya» y «Contradice». La cita A1 de la fuente A apoya la cita B1 de la fuente B. La cita A2 contradice B2. La consulta devuelve una pareja A–B con dos vínculos, cada uno con su tipo y evidencia. Se reutilizan los UUID, los selectores y las categorías de las citas guardadas.

## Organización en la extensión

- **Dominio (`src/domain/`).** Definir los tipos, las reglas de identidad, los resultados de consulta y la validación del contrato. El dominio desconoce Chrome e IndexedDB.
- **Almacenamiento (`src/storage/`).** El repositorio de vínculos comprueba que ambos extremos, sus fuentes y el tipo pertenecen al proyecto, y que las fuentes son distintas. Altas, ediciones y bajas se ejecutan en transacciones. La consulta parte de las citas de la fuente, busca ambos extremos en sus índices y devuelve los vecinos con sus vínculos y fragmentos. La eliminación de proyecto incluye los vínculos. Cualquier operación que elimine citas debe borrar primero sus vínculos; retirar una categoría conserva la cita y su evidencia.
- **Servicio de fondo (`src/background/`).** Exponer mensajes internos `relations.create`, `relations.update`, `relations.remove` y `relations.listBySource`, junto con `relationTypes.create`, `relationTypes.update`, `relationTypes.remove` y `relationTypes.list`. Aceptarlos desde la página interna autorizada de la extensión, validar el mensaje y comprobar el proyecto activo dentro de la operación. El script de contenido conserva sus responsabilidades de captura. Los datos permanecen en el perfil local.
- **Transferencia (`src/domain/project-file.ts` y `src/storage/project-transfer.ts`).** Exportar JSON v2 con `relationTypes` y `quotationLinks`. Leer v1 como un proyecto con el catálogo y los vínculos vacíos. Al importar como copia, asignar UUID nuevos a tipos y vínculos, y remapear el tipo y los dos extremos de cada vínculo. Volver a ordenar los extremos de vínculos simétricos con los nuevos UUID. Validar referencias, tipos, duplicados y límites. Importar en una sola transacción. Las versiones antiguas de la extensión que solo leen v1 rechazarán un archivo v2.

## Flujo en el panel lateral

La interfaz se incorpora después de la persistencia, los contratos y la transferencia. La acción «Relacionar con otra cita» parte de la ficha de una cita guardada. El borrador queda asociado al proyecto activo y conserva el primer fragmento durante la navegación dentro de ese proyecto. Cambiar de proyecto exige volver a iniciar la relación. La búsqueda reutiliza el servicio de evidencias y solo ofrece citas de otras fuentes del mismo proyecto.

La revisión muestra los fragmentos y sus fuentes, el nombre de la relación y su dirección. Guardar un tipo nuevo y su primer vínculo usa una única operación transaccional en el servicio de fondo. Si la operación falla, el panel conserva los campos para reintentar. Tras guardar, la ficha de cada cita permite consultar el vínculo y abrir la fuente de la otra. La entrega incluye el recorrido completo con teclado y una comprobación del panel a 320 px.
