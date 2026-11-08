# CodificaWeb

Planificación de una extensión local para codificación cualitativa de páginas web en Chrome y Brave.

- [Especificación y criterios](specs/001-codificacion-web/spec.md)
- [Plan por fases y riesgos](specs/001-codificacion-web/plan.md)
- [Tareas y matriz de trazabilidad](specs/001-codificacion-web/tasks.md)
- [Arquitectura](docs/architecture.md), [referencias](docs/reference-analysis.md) y [modelo de datos](docs/data-model.md)
- [Issue-Driven Development, GitHub Flow y CI](docs/github-flow.md)
- [Herramientas](docs/tooling.md) y [calidad](docs/quality.md)

## Entorno local

Activa Node 24.22.2 con tu gestor de versiones o con el binario oficial de Node en PATH. Ejecuta desde la raíz. Corepack usa la versión de pnpm declarada en package.json.

```sh
cw_pnpm() { npm exec --yes --package=corepack@0.36.0 -- corepack pnpm "$@"; }
cw_pnpm install --frozen-lockfile --strict-peer-dependencies --ignore-scripts
cw_pnpm lint
cw_pnpm format:check
cw_pnpm typecheck
```

`format` aplica formato. `audit` consulta el registro npm. Para compilar y comprobar el paquete MV3 de T001, ejecuta `cw_pnpm coverage`, `cw_pnpm build`, `cw_pnpm exec playwright install chromium` y `cw_pnpm test:e2e`. El paquete queda en `dist/`. En el panel, indica la URL de la pestaña activa y comprueba el acceso. Selecciona texto en esa página y pulsa **Capturar selección** para ver la cita y su fuente. Si la pestaña navega o se recarga, vuelve a comprobar el acceso antes de capturar.

Tras capturar un fragmento, marca o desmarca **Tema** y **Contexto**. Las asociaciones del proyecto inicial viven en la memoria del service worker y se pierden cuando este se reinicia.
