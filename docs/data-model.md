# Modelo de datos

Todas las entidades tienen `id` UUID, `createdAt` y `updatedAt` ISO 8601 UTC. Los cambios actualizan la fecha del registro afectado. Las claves externas se validan en el dominio y en la misma transacción Dexie que la escritura.

| Entidad    | Campos adicionales                    | Índices y reglas                                                                                                       |
| ---------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Project    | name, description                     | Nombre requerido. Proyecto activo como preferencia local separada                                                      |
| Source     | projectId, url, title, capturedAt     | Único [projectId+url]. HTTP(S), sin credenciales. La URL de navegación se serializa con URL, conserva query y hash     |
| Code       | projectId, name, description, color   | Único [projectId+nameKey], clave derivada de nombre recortado, NFC y minúsculas. Color RGB hexadecimal de seis dígitos |
| Annotation | projectId, sourceId, selectors, note? | Índice [projectId+sourceId]. Fuente del mismo proyecto. Una nota de texto plano opcional                               |
| Coding     | projectId, annotationId, codeId       | Único [annotationId+codeId]. Índices [projectId+codeId] y [projectId+annotationId]. Ambos extremos del mismo proyecto  |

Project tiene muchas Source y Code. Source tiene muchas Annotation. Annotation y Code son muchos a muchos mediante Coding. Crear la misma asociación es idempotente. Borrar un código retira sus Coding. Borrar una anotación retira sus Coding. Borrar una fuente retira sus anotaciones y asociaciones. Borrar un proyecto retira todo su corpus. Las cascadas son atómicas y actualizar un código no duplica su color en la evidencia. Las notas históricas se conservan en las anotaciones existentes y en los archivos de intercambio.

## Persistencia local de T005

La base IndexedDB v1 se crea bajo el origen de la extensión con el proyecto inicial y los códigos Tema y Contexto. Las fuentes se crean al asignar el primer código y usan la URL como título inicial. Retirar el último código conserva la anotación y su fuente. Las asociaciones de las versiones anteriores vivían en memoria.

El panel asigna un UUID a cada intento lógico y reutiliza el mismo UUID si se pierde la respuesta de Chrome. El worker escribe el recibo interno y los cambios en la misma transacción Dexie con durabilidad estricta. Repetir el UUID con los mismos datos devuelve el estado actual sin volver a aplicar la mutación. Reutilizarlo con otros datos se rechaza. Los recibos son internos a IndexedDB y quedan fuera del formato de exportación.

## Selectores v1

`selectors` tiene un `TextQuoteSelector` con exact/prefix/suffix y un `TextPositionSelector` con start/end. Ambos usan el mismo flujo `dom-text-v1`. Intervalos semiabiertos UTF-16 con enteros seguros y longitud de la cita igual a end − start. Guardar hasta 32 unidades UTF-16 de contexto a cada lado sin cortar pares sustitutos. Se conserva la cita histórica aunque falle el anclaje. El estado de resolución es efímero y depende del documento.

## Transferencia de proyectos JSON

El archivo exportado usa `schemaVersion: 2` y añade `relationTypes` y `quotationLinks` al sobre de v1. Cada vínculo referencia dos citas de fuentes distintas y un tipo del mismo proyecto. El importador también admite archivos v1 y crea la copia con un catálogo de tipos y vínculos vacío. Al copiar un v2, remapea los tipos y ambos extremos. Ordena de nuevo los extremos simétricos según sus nuevos IDs y conserva el orden de los dirigidos. Las claves derivadas se reconstruyen. La versión de IndexedDB y la del archivo se gestionan por separado.

Validar forma y campos permitidos, tipos, UUID únicos por entidad, fechas coherentes, relaciones, claves únicas, protocolos y límites antes de iniciar la escritura. Límites iniciales de importación propuestos: 10 MiB UTF-8, 50 000 registros en total, 16 384 unidades UTF-16 por cita o nota, 256 por nombre y 2048 por URL. Rechazar claves inesperadas en objetos y construir registros desde campos explícitos. Nunca interpretar notas ni títulos como HTML. Importar como copia con IDs nuevos en una transacción, remapeando claves y conservando fechas de procedencia. Exportar desde una sola transacción de lectura consistente.

[Archivo de ejemplo v1 compatible con la importación](examples/project-v1.json)
