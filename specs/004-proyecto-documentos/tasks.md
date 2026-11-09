# Trazabilidad

**[T029 · #59](https://github.com/pavt/CodificaWeb/issues/59).** FR-17/CA-17 y FR-18/CA-18. Base T026 con la simplificación del panel. Q18 en `tests/integration/projects.test.ts` y `tests/branded/permissions.spec.ts` comprueba el alta y la selección del proyecto y el registro de páginas. Q19 en `tests/e2e/selection.spec.ts` abre el ZIP descargado y verifica el índice, la cita y sus categorías.

**[PR #60](https://github.com/pavt/CodificaWeb/pull/60).** Q18 cubre la selección y creación del proyecto, la validación de URL y el alta idempotente. Q19 también verifica la estructura y la seguridad de los nombres de archivo en `tests/unit/project-zip.test.ts`. Pasaron 121 pruebas unitarias y de integración con 81,14 % de cobertura de ramas, dos E2E en Chromium y las pruebas del panel nativo en Chrome y Brave.
