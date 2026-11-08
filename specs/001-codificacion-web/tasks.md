# Tareas verificables

Las tareas de producto comienzan con una prueba roja del comportamiento indicado. Cada tarea se vincula a un issue al aprobar el [flujo de trabajo](../../docs/github-flow.md). Las rutas son propuestas para la implementación aprobada.

- [ ] T000 · Integrar el plan, las plantillas y CI base mediante PR tras aprobación. Verificar que `CI / Verificación` pasa en planificación y revisar la protección de main con el mantenedor. Criterio técnico sin FR asociado.
- [ ] T001 · Empaquetar MV3 en `vite.config.ts`, `src/manifest.json` y entradas mínimas en `src/`. Probar contenido de dist, carga en Chromium y permiso por gesto, sin acceso previo. Incluir la suite Vitest inicial y el smoke E2E. Cambiar `CODIFICAWEB_CI_PHASE` a `product` en el mismo PR. Q11. Evidencia en `tests/integration/mv3-package.test.ts`, `tests/unit/site-access.test.ts`, `tests/unit/extension-entries.test.ts` y `tests/e2e/mv3.spec.ts`.
- [ ] T002 [US1] · Capturar Range y selectores, transferir instantánea identificada al panel. `src/content/`, `src/panel/`. Q03. Evidencia en `tests/unit/capture.test.ts`, `tests/unit/read-selection.test.ts`, `tests/unit/extension-entries.test.ts` y `tests/e2e/selection.spec.ts`.
- [ ] T003 [US1] · Gestionar asociaciones de un proyecto inicial y códigos iniciales, inicialmente en memoria. `src/domain/`, `src/background/`. Q04. Evidencia en `tests/integration/coding-storage.test.ts`, `tests/unit/coding-messages.test.ts`, `tests/unit/coding-controls.test.ts` y `tests/e2e/selection.spec.ts`.
- [ ] T004 [US1] · Segmentar y pintar rangos con prioridad y filtro. `src/content/`, `src/panel/`. Q05. Evidencia en `tests/unit/highlight-segments.test.ts`, `tests/unit/paint.test.ts`, `tests/unit/highlight-filter.test.ts` y `tests/e2e/selection.spec.ts`.
- [ ] T005 [US2] · Añadir esquema IndexedDB, repositorios y transacciones con ACK durable y reintentos. `src/storage/`, `src/background/`. Q12. Evidencia en `tests/integration/coding-storage.test.ts`, `tests/unit/coding-controls.test.ts` y `tests/e2e/selection.spec.ts`.
- [ ] T006 [US2] · Resolver selectores, limpiar y recuperar pintura en recargas, mutaciones, rutas y permisos revocados. `src/content/`, `src/background/`. Q06, Q11. Evidencia en `tests/unit/resolve-anchor.test.ts`, `tests/unit/paint.test.ts`, `tests/unit/sites.test.ts` y `tests/e2e/selection.spec.ts`.
- [ ] T007 [US2] · Crear, editar, consultar y borrar nota en texto plano. `src/storage/`, `src/background/`, `src/panel/`. Q07, Q13. Evidencia en `tests/integration/coding-storage.test.ts`, `tests/unit/note-controls.test.ts`, `tests/unit/coding-messages.test.ts` y `tests/e2e/selection.spec.ts`.
- [ ] T008 [US3] · CRUD de proyectos y cambio de proyecto activo. `src/storage/`, `src/background/`, `src/panel/`. Q01. Evidencia en `tests/integration/projects.test.ts`, `tests/unit/project-controls.test.ts` y `tests/e2e/selection.spec.ts`.
- [ ] T009 [US3] · CRUD de códigos y propagación de color. `src/storage/`, `src/background/`, `src/panel/`. Q02. Evidencia en `tests/integration/catalog.test.ts`, `tests/unit/catalog-controls.test.ts` y `tests/e2e/selection.spec.ts`.
- [ ] T010 [US3] · Buscar y combinar filtros de resultados. `src/domain/`, `src/storage/`, `src/background/`, `src/panel/`. Q08. Evidencia en `tests/unit/evidence-search.test.ts`, `tests/unit/evidence-controls.test.ts` y `tests/e2e/selection.spec.ts`.
- [ ] T011 [US3] · Abrir fuente, validar destino y ubicar rango o mostrar causa. `src/background/`, `src/content/`, `src/panel/`. Q09. Evidencia en `tests/unit/open-evidence.test.ts`, `tests/unit/locate-evidence.test.ts` y `tests/e2e/selection.spec.ts`.
- [ ] T012 [US4] · Exportar snapshot, validar e importar como copia transaccional. `src/domain/`, `src/storage/`, `src/panel/`. Q10, Q13.
- [ ] T013 · Validar versión en Chrome y Brave, ejecutar auditoría y revisar permisos y tráfico. `tests/`, `docs/quality.md`. Q11, Q14.

## Orden de implementación

Los IDs T son claves de planificación. Una celda vacía de issue o PR indica que todavía no existe enlace. Registrar URL o número real después de crearlo y añadir las rutas Q a la tarea correspondiente. Los bloqueantes son precondiciones de inicio y deben estar en `main` con CI en verde.

| Tarea | Bloqueantes directos | Milestone | Prioridad | Tipo    | Área      | Issue                                                | PR                                                 |
| ----- | -------------------- | --------- | --------- | ------- | --------- | ---------------------------------------------------- | -------------------------------------------------- |
| T000  | —                    | M0        | p0        | infra   | quality   | [#1](https://github.com/pavt/CodificaWeb/issues/1)   | [#15](https://github.com/pavt/CodificaWeb/pull/15) |
| T001  | T000                 | M1        | p0        | infra   | extension | [#2](https://github.com/pavt/CodificaWeb/issues/2)   | [#16](https://github.com/pavt/CodificaWeb/pull/16) |
| T002  | T001                 | M1        | p0        | feature | anchor    | [#3](https://github.com/pavt/CodificaWeb/issues/3)   | [#17](https://github.com/pavt/CodificaWeb/pull/17) |
| T003  | T002                 | M1        | p0        | feature | data      | [#4](https://github.com/pavt/CodificaWeb/issues/4)   | [#18](https://github.com/pavt/CodificaWeb/pull/18) |
| T004  | T003                 | M1        | p0        | feature | anchor    | [#5](https://github.com/pavt/CodificaWeb/issues/5)   | [#19](https://github.com/pavt/CodificaWeb/pull/19) |
| T005  | T004                 | M2        | p0        | feature | data      | [#6](https://github.com/pavt/CodificaWeb/issues/6)   | [#20](https://github.com/pavt/CodificaWeb/pull/20) |
| T006  | T005                 | M2        | p0        | feature | anchor    | [#7](https://github.com/pavt/CodificaWeb/issues/7)   | [#21](https://github.com/pavt/CodificaWeb/pull/21) |
| T007  | T005                 | M2        | p1        | feature | panel     | [#8](https://github.com/pavt/CodificaWeb/issues/8)   | [#22](https://github.com/pavt/CodificaWeb/pull/22) |
| T008  | T006, T007           | M3        | p1        | feature | data      | [#9](https://github.com/pavt/CodificaWeb/issues/9)   | [#23](https://github.com/pavt/CodificaWeb/pull/23) |
| T009  | T008                 | M3        | p1        | feature | data      | [#10](https://github.com/pavt/CodificaWeb/issues/10) | [#24](https://github.com/pavt/CodificaWeb/pull/24) |
| T010  | T009                 | M3        | p1        | feature | panel     | [#11](https://github.com/pavt/CodificaWeb/issues/11) | [#25](https://github.com/pavt/CodificaWeb/pull/25) |
| T011  | T010                 | M3        | p1        | feature | extension | [#12](https://github.com/pavt/CodificaWeb/issues/12) | [#26](https://github.com/pavt/CodificaWeb/pull/26) |
| T012  | T011                 | M4        | p1        | feature | data      | [#13](https://github.com/pavt/CodificaWeb/issues/13) |                                                    |
| T013  | T012                 | M4        | p0        | infra   | quality   | [#14](https://github.com/pavt/CodificaWeb/issues/14) |                                                    |

T006 y T007 quedan disponibles tras T005. Priorizar T006 y coordinar los cambios compartidos. T008 espera ambos resultados. T013 cierra la validación del conjunto.

## Matriz

| Requisito                   | Criterio                | Tareas     | Pruebas       | Issues                                                                                                   |
| --------------------------- | ----------------------- | ---------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| FR-01                       | CA-01                   | T008       | Q01           | [#9](https://github.com/pavt/CodificaWeb/issues/9)                                                       |
| FR-02                       | CA-02                   | T009       | Q02           | [#10](https://github.com/pavt/CodificaWeb/issues/10)                                                     |
| FR-03                       | CA-03                   | T001, T002 | Q03, Q11      | [#2](https://github.com/pavt/CodificaWeb/issues/2), [#3](https://github.com/pavt/CodificaWeb/issues/3)   |
| FR-04                       | CA-04                   | T003, T005 | Q04, Q12      | [#4](https://github.com/pavt/CodificaWeb/issues/4), [#6](https://github.com/pavt/CodificaWeb/issues/6)   |
| FR-05                       | CA-05                   | T004       | Q05           | [#5](https://github.com/pavt/CodificaWeb/issues/5)                                                       |
| FR-06                       | CA-06                   | T005, T006 | Q06, Q11, Q12 | [#6](https://github.com/pavt/CodificaWeb/issues/6), [#7](https://github.com/pavt/CodificaWeb/issues/7)   |
| FR-07                       | CA-07                   | T007       | Q07, Q13      | [#8](https://github.com/pavt/CodificaWeb/issues/8)                                                       |
| FR-08                       | CA-08                   | T010       | Q08           | [#11](https://github.com/pavt/CodificaWeb/issues/11)                                                     |
| FR-09                       | CA-09                   | T011       | Q09           | [#12](https://github.com/pavt/CodificaWeb/issues/12)                                                     |
| FR-10                       | CA-10                   | T012       | Q10, Q13      | [#13](https://github.com/pavt/CodificaWeb/issues/13)                                                     |
| Privacidad y compatibilidad | Definición de terminado | T001, T013 | Q11, Q14      | [#2](https://github.com/pavt/CodificaWeb/issues/2), [#14](https://github.com/pavt/CodificaWeb/issues/14) |
