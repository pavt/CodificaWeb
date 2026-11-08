# Entorno y herramientas

Inventario revisado el 8 de noviembre de 2026. Las versiones JS exactas viven en package.json y el árbol resuelto en pnpm-lock.yaml.

| Herramienta                                             | Selección y uso                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node 24.22.2 LTS, Corepack 0.36.0, pnpm 12.18.0         | Versiones fijas. Corepack se ejecuta desde caché npm y selecciona pnpm desde packageManager. Instalación local con lockfile congelado. [Node LTS](https://nodejs.org/en/about/previous-releases) · [Corepack](https://github.com/nodejs/corepack) · [pnpm](https://pnpm.io/installation)                                                                                   |
| GitHub Spec Kit 1.3.3.dev0                              | CLI oficial desde revisión fija c43849408ac0de2ca6a52f14eaae71449776057b, inicializado en entorno Python temporal. Integración Codex mediante .agents/skills y .specify. [Código y licencia](https://github.com/github/spec-kit/tree/c43849408ac0de2ca6a52f14eaae71449776057b)                                                                                             |
| Skill Creator y codificaweb-tdd                         | Skill Creator disponible en esta sesión. La skill del repo documenta el ciclo obligatorio y se descubre junto con las de Spec Kit                                                                                                                                                                                                                                          |
| Playwright MCP 0.0.84                                   | Paquete oficial Microsoft fijado, perfil aislado headless de Chrome, uso exploratorio con fixtures. Configuración local en .codex/config.toml. Para estas exploraciones Codex ya ofrece control de navegador. Se incluye MCP porque se pidió para este repositorio, sin conectar plugins adicionales. [Servidor y requisitos](https://github.com/microsoft/playwright-mcp) |
| Playwright Test 1.65.0                                  | Pruebas repetibles y extensión cargada en Chromium de Playwright. La versión de navegador de E2E es independiente de Chrome usado por el MCP. [Extensiones](https://playwright.dev/docs/chrome-extensions)                                                                                                                                                                 |
| TypeScript 6.0.3, React 19.3.1, Vite 8.3.6, Dexie 4.4.7 | Stack propuesto. TypeScript 6 queda dentro del peer declarado por typescript-eslint 8.72.1. Vite se instala con peers estrictos en Node 24. [Vite](https://vite.dev/guide/) · [React](https://react.dev/) · [Dexie](<https://dexie.org/docs/Dexie/Dexie.transaction()>)                                                                                                    |
| Vitest 5.1.0 y cobertura V8                             | Unitarias e integración, con fake-indexeddb 6.2.7 para tests rápidos. [Vitest](https://vitest.dev/guide/coverage)                                                                                                                                                                                                                                                          |
| ESLint 10.14.0, Prettier 3.9.10 y pnpm audit            | Lint y formato separados. Auditoría integrada para evitar duplicar herramientas. Revisar transitivas y licencias antes de actualizaciones. [ESLint](https://eslint.org/docs/latest/use/configure/configuration-files) · [Prettier](https://prettier.io/docs/) · [pnpm audit](https://pnpm.io/cli/audit)                                                                    |

El MCP es para navegación exploratoria, con Chrome instalado y el proyecto abierto como raíz. Codex debe confiar en el proyecto y cargar su configuración de proyecto en una nueva sesión. La extensión de producción no depende del MCP ni de acceso a la red. Usar solo fixtures o sitios públicos autorizados durante desarrollo.

## Reproducir la instalación de Spec Kit

La infraestructura oficial ya está en el repositorio. Para regenerarla, crear un entorno aislado y generar primero en un directorio temporal para revisar el diff y conservar la constitución y especificaciones.

```sh
python3 -m venv .spec-kit-venv
.spec-kit-venv/bin/pip install 'git+https://github.com/github/spec-kit.git@c43849408ac0de2ca6a52f14eaae71449776057b'
specify_bin="$PWD/.spec-kit-venv/bin/specify"
specify_stage="$(mktemp -d)"
(cd "$specify_stage" && "$specify_bin" init --here --non-interactive --integration codex --integration-options=--skills)
```

Seleccionar el expediente existente sin crear rama mediante `SPECIFY_FEATURE_DIRECTORY=specs/001-codificacion-web` o un `.specify/feature.json` local. Durante planificación se completaron Specify, Clarify, Plan y Tasks. Tras aprobación, aplicar Implement con la skill TDD y validar contra CA, catálogo Q y definición de terminado.

## Resultado de auditoría inicial

`pnpm audit` detectó un aviso moderado para minimatch 10.2.6, dependencia de desarrollo de ESLint y typescript-eslint. El aviso indica corrección desde 11.0.1, fuera del major resuelto por esas herramientas. T013 volvió a revisar este aviso y auditó por separado el árbol de producción. Los resultados constan en el [registro de validación](release-validation.md). [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
