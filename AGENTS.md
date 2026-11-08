# Reglas de CodificaWeb

- La entrega actual es de planificación y configuración. Espera aprobación explícita del usuario antes de crear issues, ramas o PRs, publicar, modificar configuración remota o comenzar la implementación.
- La fuente de verdad es [spec.md](specs/001-codificacion-web/spec.md). Usa Specify → Clarify → Plan → Tasks → Implement → Validate. Conserva IDs FR, CA, T y Q en la trazabilidad.
- Durante implementación usa la skill `codificaweb-tdd`. Prueba primero y registra el fallo esperado antes de modificar producción. Implementa el mínimo, vuelve a ejecutar y refactoriza. Todo defecto requiere regresión.
- TypeScript estricto. Separa dominio, DOM, adaptadores Chrome, panel y almacenamiento. Valida importaciones y mensajes en los límites. Escribe estado relacionado en transacciones atómicas.
- Privacidad local y mínimo privilegio. Sin telemetría, servicios externos, código remoto ni permisos globales obligatorios. Nunca uses datos reales de investigación en pruebas, MCP, capturas o registros.
- Usa Node y pnpm fijados. Mantén el lockfile y revisa licencia, procedencia y necesidad antes de añadir dependencias.
- Aplica [la definición de terminado](docs/quality.md) y actualiza la matriz. El soporte PDF se pospone.

## Issue-Driven Development y GitHub Flow

- Sigue [el flujo obligatorio](docs/github-flow.md). Spec Kit → GitHub Issue → Branch → TDD → Pull Request → CI → Review → Merge.
- Antes de implementar, vincula cada tarea T a un issue con alcance, FR/CA aplicables, dependencias, casos Q, etiquetas, milestone y prioridad. Empieza cuando los bloqueantes estén integrados.
- Usa una rama `codex/issue-<n>-<resumen>` por issue desde `origin/main`. Referencia el issue y el ID T en los commits. Abre un PR pequeño a `main` con `Closes #<n>` y evidencia de pruebas.
- Integra solo mediante PR. Exige checks en verde para la última revisión, conversaciones resueltas y revisión según la política del repositorio. Si falta un revisor independiente, espera una decisión explícita del usuario. No hagas bypass de controles.
- Registra issue, archivos de pruebas y PR en la matriz. Verifica el SHA integrado, el cierre del issue y CI en `main` antes de iniciar trabajo dependiente.
