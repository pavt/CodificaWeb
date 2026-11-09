# Plan

Reutilizar `Project` para Proyecto, `Source` para DocumentoWeb, `Annotation` para Cita, `Code` para Categoría y `Coding` para Etiquetado. Un proyecto reúne documentos y categorías. Un documento contiene citas. Las citas se asocian a categorías del mismo proyecto mediante Etiquetado. El tipo web se indica en la exportación y el anclaje conserva su perfil.

Registrar el documento, el proyecto nuevo cuando corresponda y la selección del proyecto en una transacción Dexie. Usar el índice único de proyecto y URL para reabrir documentos sin duplicarlos. Proyectar una instantánea de exportación en un índice y archivos por documento. Usar fflate 0.8.2 (MIT) para crear el ZIP localmente.
