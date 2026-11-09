# Especificación funcional de CodificaWeb

**Estado** Propuesta para aprobación · **Fecha** 2026-11-08

Investigadores que codifican contenido web pueden conservar evidencia textual y revisarla en Chrome y Brave en un perfil local. Las siguientes historias son incrementos verificables. Los identificadores CA corresponden a criterios de aceptación.

| Historia                                        | Requisitos                 |
| ----------------------------------------------- | -------------------------- |
| US1 · Seleccionar, codificar y ver el resultado | FR-03, FR-04, FR-05        |
| US2 · Recuperar evidencia                       | FR-06                      |
| US3 · Organizar y consultar un corpus           | FR-01, FR-02, FR-08, FR-09 |
| US4 · Transferir un proyecto                    | FR-10                      |

| Requisito                      | Escenario de aceptación                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 · CRUD de proyectos      | CA-01 · Crear dos proyectos, renombrar uno y cambiar de proyecto. Cada lista muestra su propio corpus. Al confirmar la eliminación se retira solo el proyecto elegido y sus dependientes.                                                                     |
| FR-02 · CRUD de códigos        | CA-02 · Crear código con nombre, descripción y color, asociarlo en dos fuentes y editarlo. Ambas muestran los cambios. Confirmar su eliminación retira sus asociaciones y conserva fragmentos y notas.                                                        |
| FR-03 · Capturar texto         | CA-03 · Seleccionar texto HTML a través de nodos inline y pasar al panel. Se conserva la cita y su procedencia de la pestaña correcta. Selección vacía, editable o de documento obsoleto se rechaza con aviso.                                                |
| FR-04 · Asignar varios códigos | CA-04 · Añadir dos códigos al mismo fragmento, repetir uno y retirar el otro. Queda una asociación única. Se rechazan asociaciones entre proyectos.                                                                                                           |
| FR-05 · Mostrar colores        | CA-05 · Pintar un fragmento, añadir otro superpuesto y filtrar por cualquiera de los códigos. Ambos se pueden identificar desde el panel y los nodos de texto de la página quedan intactos.                                                                   |
| FR-06 · Recuperar resaltados   | CA-06 · Tras guardar, recargar y revisitar un origen autorizado. Se recupera el mismo fragmento incluso tras inserciones alrededor o cambios de marcado compatibles. Una cita repetida sin evidencia distintiva o que desaparece se conserva como sin ubicar. |
| FR-08 · Buscar y filtrar       | CA-08 · Filtrar por código, texto o fuente dentro del proyecto activo. Los filtros se combinan por intersección y se incluyen evidencias sin ubicar.                                                                                                          |
| FR-09 · Ir a la evidencia      | CA-09 · Desde un resultado, abrir o enfocar la fuente y desplazar al rango cuando se resuelve. Ante permiso ausente, redirección a otra fuente o anclaje fallido, el panel explica el estado y conserva la cita.                                              |
| FR-10 · Transferir JSON        | CA-10 · Exportar e importar en otro perfil. Se preservan contenido, procedencia y relaciones. Referencias rotas, archivos no válidos o versiones futuras se rechazan de forma atómica.                                                                        |

## Aclaraciones adoptadas para revisión

- Las notas históricas se conservan al importar y exportar proyectos. La anotación puede existir sin código. La primera entrega de desarrollo puede usar un proyecto y un código iniciales hasta que llegue su gestión.
- HTML HTTP(S) en el documento principal, con permisos por origen. Quedan para después iframes, Shadow DOM, controles editables, navegación privada y PDF. Las páginas internas del navegador o con inyección bloqueada muestran un estado de incompatibilidad.
- El proyecto activo controla los resaltados. El panel enumera todos los códigos de una selección. El color principal es determinista y se puede cambiar con el filtro.
- Fuente identificada por URL normalizada conservando query y fragmento, para respetar rutas y documentos distintos. Una SPA se reevalúa al cambiar de URL y al cambiar su contenido.
- Importar crea una copia aislada con IDs nuevos, relaciones remapeadas y fechas originales. Solicitar permisos para abrir las fuentes requiere acción explícita. La búsqueda textual compara subcadenas sin distinguir mayúsculas, con normalización Unicode NFC.
- La extensión funciona localmente sin cuentas, servidores, telemetría ni sincronización. Al abrir una fuente original se produce navegación normal del navegador.
- Pendientes de versiones futuras. Codificación PDF, jerarquías y agrupaciones de códigos, frecuencias y relaciones, asistencia por IA, colaboración y sincronización en la nube.
