# Plan de implementación

**Estado** Propuesto, pendiente de aprobación del usuario.

La [especificación](spec.md) gobierna alcance y criterios. [Arquitectura](../../docs/architecture.md) define módulos y límites de confianza. [Modelo](../../docs/data-model.md) define integridad y transferencia. Las fases son incrementos de desarrollo. Para la primera entrega, un proyecto y código predefinidos permiten probar el flujo sin esperar a los CRUD.

| Fase | Objetivo y requisitos                                 | Depende de           | Tareas y pruebas               | Riesgos    | Criterio de salida                                                                                                                     |
| ---- | ----------------------------------------------------- | -------------------- | ------------------------------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | Integrar plan, plantillas y CI base                   | Aprobación explícita | T000                           | R7         | PR revisado con check base en verde                                                                                                    |
| 1    | Seleccionar, asignar y pintar · FR-03 a FR-05         | T000 integrado       | T001–T004 · Q03–Q05, Q11       | R1, R2, R3 | Chromium carga MV3. Selección entre nodos, código, color y solapamiento demostrados en extensión real                                  |
| 2    | Persistir y anotar · FR-06 y FR-07                    | Fase 1               | T005–T007 · Q06, Q07, Q12, Q13 | R1, R3, R4 | Recarga, nueva visita y suspensión del worker recuperan el corpus. Evidencia ambigua queda sin ubicar. Nota persiste tras confirmación |
| 3    | Organizar y consultar · FR-01, FR-02, FR-08, FR-09    | Fase 2               | T008–T011 · Q01, Q02, Q08, Q09 | R3, R4, R5 | CRUD transaccionales, búsqueda aislada y navegación con resultado explícito                                                            |
| 4    | Transferir y validar · FR-10, regresión FR-01 a FR-09 | Fase 3               | T012–T013 · Q10, Q11, Q14      | R5, R6     | Ida y vuelta JSON, rechazo atómico y definición de terminado de la versión                                                             |

## Flujo de entrega

Cada incremento se ejecuta mediante [Issue-Driven Development y GitHub Flow](../../docs/github-flow.md). [El orden de issues](tasks.md#orden-de-implementación) fija los bloqueantes. La publicación inicial del plan y CI corresponde a T000 tras aprobación. T001 activa CI de producto en su propio PR. El avance requiere revisión y checks exitosos.

## Control de constitución

Cada fase mantiene aislamiento del dominio, acceso local, pruebas antes de código y mínimo privilegio. T001 valida permisos y empaquetado. T005 valida integridad transaccional. T013 exige revisión de trazabilidad, cobertura, auditoría y navegadores. No se planifican excepciones.

## Riesgos

| ID  | Riesgo                                                           | Mitigación y verificación                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | Falso anclaje tras edición o duplicado                           | Cita exacta con contexto inequívoco. Fixtures con copia, movimiento, pérdida de cita y HTML nuevo. T006                                                                                                                 |
| R2  | Solapamiento ilegible o coste elevado                            | Segmentación determinista, filtro por código, leyenda y límites. Medir repintado en fixture de 100 000 caracteres y 200 anotaciones, con presupuesto inicial de p95 ≤ 150 ms en 30 repintados y equipo registrado. T004 |
| R3  | Diferencias Chromium/Brave, permisos y rutas SPA                 | Probar APIs, revocación, URL y documento activos. Agrupar mutaciones, evitar bucles y detectar cambio de URL. T001, T006, T013                                                                                          |
| R4  | Suspensión MV3, carreras y cuota                                 | ACK tras commit, operaciones idempotentes, transacciones, pruebas con recarga, reintento, rollback y varias pestañas. T005                                                                                              |
| R5  | Entrada hostil o filtración                                      | Validación, esquemas acotados, permisos opcionales, sin transmisión ni HTML interpretado. Fixtures maliciosos y tráfico local controlado. T011–T013                                                                     |
| R6  | Pérdida de compatibilidad del archivo o dependencias vulnerables | Sobre versionado, fixtures estables, copia atómica y auditoría del lockfile. T012–T013                                                                                                                                  |
| R7  | Integración sin CI o revisión                                    | Check estable en PR, activación obligatoria desde T001 y protección de main cuando esté disponible. T000, T001                                                                                                          |
