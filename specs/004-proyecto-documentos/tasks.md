# Trazabilidad

**[T029 · #59](https://github.com/pavt/CodificaWeb/issues/59).** FR-17/CA-17 y FR-18/CA-18. Base T026 con la simplificación del panel. Q18 en `tests/integration/projects.test.ts` y `tests/branded/permissions.spec.ts` comprueba el alta y la selección del proyecto y el registro de páginas. Q19 en `tests/e2e/selection.spec.ts` abre el ZIP descargado y verifica el índice, la cita y sus categorías.

**[PR #60](https://github.com/pavt/CodificaWeb/pull/60).** Q18 cubre la selección y creación del proyecto, la validación de URL y el alta idempotente. Q19 también verifica la estructura y la seguridad de los nombres de archivo en `tests/unit/project-zip.test.ts`. Pasaron 121 pruebas unitarias y de integración con 81,14 % de cobertura de ramas, dos E2E en Chromium y las pruebas del panel nativo en Chrome y Brave.

Q18 reproduce el arrastre real con el alta pendiente. El panel muestra el texto antes de confirmar el proyecto o documento y habilita las categorías al completar el alta. Al cambiar de proyecto, el panel espera una selección nueva.

Q18 comprueba el estado al llegar, antes de seleccionar, y el regreso a una página con citas. También cubre proyectos guardados, búsqueda por nombre y selección con teclado, páginas que pertenecen a otro proyecto y descarte de respuestas obsoletas. IndexedDB agrega un índice de URL para consultar fuentes existentes sin reescribir sus registros.

Q18 también se ejecuta de forma permanente en CI mediante `pnpm test:selection`. Usa el panel lateral nativo del Chromium de Playwright y comprueba la selección desde la página, el alta, el etiquetado y el regreso a un documento guardado. El recorrido anterior en pestaña sigue cubriendo la exportación y la gestión de proyectos.

En el PR #60 se retira el editor de notas del fragmento y su requisito FR-07. La prueba del panel nativo comprueba que el editor no está presente. Q10 y Q19 verifican que las notas históricas se conservan en los archivos JSON y ZIP.
