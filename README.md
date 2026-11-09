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

`format` aplica formato. `audit` consulta el registro npm. Para compilar y comprobar el paquete MV3 de T001, ejecuta `cw_pnpm coverage`, `cw_pnpm build`, `cw_pnpm exec playwright install chromium` y `cw_pnpm test:e2e`. El paquete queda en `dist/`. Carga la carpeta `dist/` como extensión descomprimida en Chrome o Brave. Si ya la cargaste, pulsa **Recargar** en la tarjeta de CodificaWeb. Selecciona texto en una página web y pulsa el icono de CodificaWeb. En **Crear categoría**, escribe el nombre y pulsa **Guardar y aplicar**. El color se asigna al guardar y aparece en la cita, la etiqueta y el resaltado. Las categorías ya guardadas conservan su color.

Tras capturar un fragmento, marca o desmarca **Tema** y **Contexto**. Las asociaciones del proyecto inicial se guardan en IndexedDB en el perfil local y se conservan al reiniciar el service worker. Para volver a consultarlas, comprueba el acceso y captura de nuevo el mismo fragmento.

Los fragmentos codificados se resaltan en la página. Usa **Filtrar resaltados por código** para inspeccionar un color cuando se solapan. En los sitios autorizados, el resaltado se restaura al volver a la fuente. Si cambia el texto, solo se pintan las citas que se pueden ubicar de forma inequívoca.

En **Proyectos** puedes crear, seleccionar, renombrar y borrar proyectos. Cada uno conserva sus propias fuentes, citas y notas. El **Catálogo de códigos** permite crear, editar y borrar los códigos del proyecto activo. Puedes reutilizar un código en distintas fuentes.

En **Buscar evidencias** puedes combinar texto de la cita o nota, código y fuente dentro del proyecto activo. La búsqueda incluye evidencias guardadas aunque su ubicación en la página no se pueda verificar.

Pulsa **Abrir fuente** junto a un resultado para abrir o enfocar su página y localizar el fragmento. Si el sitio no está autorizado o la cita ya no se puede localizar, el resultado conserva la cita y muestra el motivo.

En **Importar o exportar proyecto** puedes descargar un JSON del proyecto activo o cargar un archivo v1 como copia independiente. La importación valida todo el archivo antes de guardarlo.

Para vincular dos fuentes, guarda una cita en cada una dentro del mismo proyecto. En la primera cita pulsa **Relacionar con otra cita**; también puedes hacerlo desde **Buscar evidencias**. Busca la segunda cita por texto o URL, elige un tipo de relación o crea uno con tu propio nombre y definición, revisa la dirección y pulsa **Guardar vínculo**. El vínculo se puede consultar desde cualquiera de las dos citas.
