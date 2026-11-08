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

`format` aplica formato. `audit` consulta el registro npm. Los scripts `test`, `coverage`, `build` y `test:e2e` se activan al incorporar pruebas y puntos de entrada del producto. El plan requiere aprobación explícita antes de ese paso.
