---
name: codificaweb-tdd
description: Aplica Red–Green–Refactor a funcionalidades y defectos aprobados de CodificaWeb. Úsala al implementar una tarea trazada a un criterio de aceptación.
---

Localiza la tarea en specs/001-codificacion-web/tasks.md y su criterio en spec.md. Si sigue pendiente la aprobación del usuario para implementar, conserva el trabajo en planificación.

1. Escribe una prueba del comportamiento observable. Usa Vitest para dominio e IndexedDB y Playwright Test con la extensión real para selección, pintura y permisos. En un defecto, reproduce la regresión.
2. Ejecuta la prueba aislada. Confirma que falla por el comportamiento ausente. Corrige primero errores de entorno o fixtures.
3. Implementa lo mínimo y repite la prueba hasta que pase. Refactoriza con la prueba en verde.
4. Ejecuta el conjunto relevante, lint y tipos. Antes de cerrar la tarea, actualiza la trazabilidad y registra los comandos y resultados. Aplica la definición de terminado de docs/quality.md.
