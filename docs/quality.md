# Calidad y estrategia de pruebas

## SDD y TDD

Specify define historias, FR y criterios CA. Clarify deja decisiones explícitas en la especificación. Plan y Tasks fijan módulos, secuencia y relaciones. Tras aprobación, Implement usa Red–Green–Refactor. Validate contrasta criterios y evidencia. Mantener FR → CA → T → issue → Q y archivo de prueba → commits → PR → CI y SHA en main, según el [flujo GitHub](github-flow.md). Al crear cada prueba, añadir su ruta a la tarea y conservar evidencia de la ejecución roja y verde.

Cada comportamiento empieza con una prueba observable. Ejecutarla sola y verificar que falla porque falta el comportamiento. Implementar lo mínimo y comprobar que pasa. Refactorizar con la suite verde. Para un defecto, reproducirlo antes de arreglarlo. Vitest exige 80 % global en sentencias, ramas, funciones y líneas sobre src, incluidos archivos sin importar. La cobertura complementa las pruebas funcionales.

## Catálogo de pruebas

| ID  | Nivel                       | Evidencia                                                                                           |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| Q01 | Integración y E2E           | Crear, editar, cambiar y borrar proyectos. Cascadas, aislamiento y cancelación                      |
| Q02 | Integración y E2E           | Código reutilizado en dos fuentes. Edición de color y borrado conservan evidencia                   |
| Q03 | E2E                         | Selección por teclado y puntero entre nodos, Unicode, editable, cambio de foco y documento obsoleto |
| Q04 | Unitaria e integración      | Varios códigos, duplicados idempotentes, retirar relación y rechazar proyecto ajeno                 |
| Q05 | Unitaria y E2E              | Tramos iguales, parciales y anidados, desempate, filtro, texto DOM intacto y presupuesto R2         |
| Q06 | Unitaria y E2E              | Offsets, cita duplicada, inserciones, nodos divididos, ruta SPA, recarga y cita eliminada           |
| Q07 | Integración y E2E           | Ciclo de nota, recarga y borrado conservando códigos                                                |
| Q08 | Unitaria y E2E              | Intersección de filtros, búsqueda NFC, resultados sin ubicar y proyecto activo                      |
| Q09 | E2E                         | Abrir/enfocar fuente, rango visible, redirección, permiso revocado y timeout                        |
| Q10 | Unitaria, integración y E2E | Ejemplo v1, ida y vuelta, copia repetida, versión futura, FK inválida y rollback                    |
| Q11 | E2E y manual                | Instalación MV3, panel, ausencia de acceso antes del gesto, revocación y registro persistente       |
| Q12 | Integración y E2E           | Índices, concurrencia, rollback, ACK perdido y worker reanudado                                     |
| Q13 | Unitaria e integración      | Límites, valores inesperados, mensajes forjados, colores y URLs hostiles, texto con HTML            |
| Q14 | E2E y manual                | Tráfico de extensión sin salidas, perfiles separados, Chrome y Brave                                |

Usar Vitest en Node para lógica y Dexie con fake-indexeddb para integración rápida. Confirmar IndexedDB, selección y pintura también en Chromium real. La prueba de producción usa `pnpm build` y `pnpm exec playwright install chromium`, después `pnpm test:e2e`. Crear un perfil temporal con `chromium.launchPersistentContext`, canal `chromium`, argumentos `--disable-extensions-except` y `--load-extension` apuntando a dist. Obtener ID del service worker. Abrir fixtures HTTP locales y la página real del panel para automatización. La apertura nativa del panel y el diálogo de permisos tienen validación manual adicional. Cerrar contexto y borrar perfil al terminar. Usar fixtures y trazas sin información privada. [Playwright para extensiones](https://playwright.dev/docs/chrome-extensions) · [Cobertura Vitest](https://vitest.dev/guide/coverage)

El [registro de validación de T013](release-validation.md) reúne la evidencia y el recorrido manual pendiente.

## Definición de terminado

- El PR enlaza al issue, pasa CI sobre la última revisión y completa la revisión antes del merge. Verificar el cierre al integrar.

- Cada CA cubierto tiene evidencia reproducible y traza hasta archivos de prueba y código.
- Lint, formato, tipos, compilación, unitarias, integración, E2E y cobertura pasan. La auditoría se revisa y se resuelven hallazgos aplicables.
- La E2E cubre solapamientos, notas y recarga, búsqueda, navegación y transferencia JSON. Registrar versiones de Chrome y Brave, sistema, resultados y fallos de las comprobaciones que requieren la interfaz nativa, incluidos el icono, el diálogo de permisos y la revocación.
- La revisión comprueba que el corpus queda en el perfil y que la extensión solo accede a sitios autorizados. No hay riesgos críticos abiertos ni criterios pendientes del incremento.
