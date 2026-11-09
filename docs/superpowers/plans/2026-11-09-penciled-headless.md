# Penciled headless — plan de implementación

**Estado** · Evaluación T031 en revisión ([#63](https://github.com/pavt/CodificaWeb/issues/63)). Las etapas de integración dependen de que exista una API de anclaje sin pintura.

**Objetivo** · Usar Penciled headless para mejorar la selección y recuperación de citas web en CodificaWeb. La selección válida debe aparecer en el panel al terminar el gesto y quedar disponible al pasar al panel para etiquetar.

**Trazabilidad** · FR-03 a FR-06 y CA-03 a CA-06. Validar también CA-09 y CA-10. La corrección de la tarjeta en T030 (#61, PR #62) tiene su propio alcance.

## Diseño

Integrar `penciled/headless` mediante un adaptador en el script de contenido. CodificaWeb conserva el ciclo de selección y foco, la identidad de pestaña y documento, la confirmación de guardado y la pintura por categorías. Dexie sigue siendo la fuente de datos. La instancia de Penciled debe trabajar en memoria y liberar observadores y eventos al cambiar de documento o revocarse el acceso.

La primera tarea debe comprobar con el paquete publicado si su API pública permite obtener rangos y resolver selectores sin activar un segundo pintor. Headless excluye la interfaz y sí incluye pintura. Si la separación requiere APIs privadas o altera los subrayados, se detiene esa integración y se documenta el límite en el PR. Verificar la versión publicada y fijarla, revisar licencia MIT, dependencias y tamaño del bundle MV3. El paquete debe funcionar localmente con los permisos actuales.

Mantener la lectura de `dom-text-v1`. Sus posiciones describen un flujo de texto específico y no se deben copiar directamente a un selector calculado con otra normalización. El primer objetivo es convertir el rango validado al formato actual. Si la resolución nueva necesita persistir datos adicionales, especificar un perfil versionado y su compatibilidad con importación y exportación antes de cambiar el contrato. Una resolución requiere coincidencia exacta y evidencia suficiente para identificar la ocurrencia. Ante ambigüedad o desaparición, conservar la cita como sin ubicar.

## Orden de implementación

1. **Pruebas de regresión y validación de la API** · Prioridad alta. Crear casos deterministas en las suites existentes de selección y panel nativo. Ejecutarlos primero con el motor actual y registrar qué falla. Probar la entrada pública de Penciled en MV3 con una página local y registrar qué mecanismos pueden separarse de su pintura y almacenamiento. Entregable de PR: resultados por caso y contrato de integración verificable.
2. **Integrar la captura** · Prioridad alta. Depende de la validación anterior. Escribir la regresión antes de modificar producción. Conectar el adaptador a la selección en el script de contenido y conservar el contrato del panel. Una selección nueva reemplaza a la anterior. Pasar al panel permite asignar la categoría y un clic fuera en la página limpia la selección. Navegar o cambiar de pestaña invalida la selección anterior. Entregable de PR: capturar y etiquetar correctamente con la extensión empaquetada.
3. **Integrar la recuperación de citas** · Prioridad alta. Depende del contrato de la primera tarea y de la integración de captura. Probar primero la recuperación tras recarga, cambios del DOM y citas repetidas. Conectar los rangos verificados al pintor existente y validar un proyecto de prueba guardado con el formato anterior. Entregable de PR: recuperación correcta, compatibilidad de datos y ausencia de marcas en ubicaciones ambiguas.

## Controles de aceptación

| Caso                                                       | Resultado exigido                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Título junto a autor, código con espacios o texto oculto   | El texto guardado corresponde al fragmento seleccionado y excluye contenido ajeno                                |
| Ratón en ambos sentidos y selección con teclado            | El panel recibe el fragmento al terminar el gesto                                                                |
| Paso al panel, clic fuera y navegación en la misma pestaña | Se puede categorizar al pasar al panel. Un clic fuera limpia el borrador y la página nueva admite otra selección |
| Dos categorías y citas superpuestas                        | Colores, categorías y comportamiento de subrayado coherentes con el proyecto                                     |
| Recarga, inserciones y texto repetido                      | Se recupera la ocurrencia correcta o queda sin ubicar                                                            |
| Proyecto anterior, relaciones y exportación ZIP            | Se preservan IDs, citas, categorías, vínculos y el JSON por documento                                            |

Usar `tests/e2e/selection.spec.ts` y `tests/branded/permissions.spec.ts` para las regresiones de navegador. Ejecutar `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test:e2e` y `pnpm test:selection` según corresponda. Adjuntar resultados de `pnpm test:e2e:branded` en Chrome y Brave antes de integrar los cambios de producto.

Tras la aprobación, registrar las tareas en Spec Kit y en la matriz, crear issues vinculados con sus dependencias y usar una rama por issue desde `origin/main`. Cada PR debe incluir la evidencia Red–Green–Refactor y pasar CI y revisión. Tras integrar, verificar el cierre del issue y CI en `main` antes de empezar la tarea dependiente.

[Documentación de Penciled](https://github.com/marcellosso/penciled#headless) · [Evaluación previa del repositorio](../../reference-analysis.md)
