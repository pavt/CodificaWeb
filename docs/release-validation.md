# Validación de versión · T013

Registro del 8 de noviembre de 2026 sobre el paquete compilado desde T012, con datos sintéticos y perfiles temporales. [Issue #14](https://github.com/pavt/CodificaWeb/issues/14) · [Matriz de trazabilidad](../specs/001-codificacion-web/tasks.md) · [Definición de terminado](quality.md)

## Compatibilidad observada

Entorno macOS 26.6.2 (25G83), Apple M1 Max.

| Navegador     | Versión       | Resultado del smoke automatizado                                                                                                                 |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google Chrome | 156.0.8078.80 | Carga de MV3, arranque del worker, renderizado del panel, configuración de apertura desde el icono y ausencia de permiso inicial para localhost. |
| Brave Browser | 156.1.98.60   | Mismas comprobaciones, en un perfil independiente.                                                                                               |

Para repetir el smoke, ejecutar `pnpm build` e iniciar cada binario con un `--user-data-dir` temporal y los argumentos `--headless --remote-debugging-port=0 --enable-unsafe-extension-debugging`. Conectar CDP al puerto anunciado en `DevToolsActivePort`, abrir una sesión del navegador y enviar `Extensions.loadUnpacked` con la ruta absoluta de `dist`. Identificar el worker por el ID devuelto. Comprobar MV3 en `chrome.runtime.getManifest()`, `openPanelOnActionClick` en `chrome.sidePanel.getPanelBehavior()` y la ausencia de permiso para `http://127.0.0.1/*` en `chrome.permissions.contains()`. Abrir la URL del panel indicada en el manifiesto, verificar el encabezado y borrar el perfil al salir. [Protocolo CDP](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/)

## Permisos y privacidad

- El paquete declara `sidePanel` y `scripting`, con orígenes HTTP(S) opcionales. Q11 usa el paquete intacto, comprueba que la API impide la inyección antes de otorgar acceso y simula el rechazo de la solicitud emitida por un clic.
- Q14 observa las solicitudes HTTP(S) notificadas por Playwright y las aperturas WebSocket interceptadas durante la E2E del corpus sintético. Solo admite las navegaciones a los fixtures locales; las demás solicitudes interceptables se abortan. Se comprobó la aserción con un `GET` sintético deliberado desde el panel que produjo un fallo y se retiró después. El recorrido posterior pasó con cero solicitudes inesperadas observadas. La observación se limita al contexto y al intervalo de la prueba.
- La E2E de Chromium ejercita captura, solapamientos, proyectos, notas, reanudación del worker, búsqueda, navegación y transferencia JSON. Usa una copia con acceso concedido al host del fixture. Las pruebas y los criterios relacionados constan en la matriz. [Q11](../tests/e2e/mv3.spec.ts) · [Q14 y recorrido](../tests/e2e/selection.spec.ts)

## Auditoría

`pnpm audit --prod` informó cero vulnerabilidades conocidas. `pnpm audit` detectó un aviso moderado de `minimatch@10.2.6` en las herramientas de lint. La corrección empieza en 11.0.1, fuera del major del árbol actual. Se registra como hallazgo de desarrollo: el paquete de la extensión carece de esa dependencia y el lint usa patrones del repositorio. [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)

## Recorrido manual pendiente en ambos navegadores

1. Crear un perfil temporal separado para cada navegador y cargar `dist` desde su administrador de extensiones con «Cargar descomprimida». Abrir el panel desde el icono.
2. Abrir un fixture HTML servido en loopback. Comprobar ausencia de captura previa al permiso. Rechazar y después conceder el permiso mediante el diálogo nativo. Al final, revocarlo desde la interfaz del navegador y comprobar que deja de capturar y que conserva el registro local.
3. Crear fragmentos solapados, aplicar varios códigos, escribir una nota y recargar. Comprobar la persistencia, buscar con filtros, abrir la fuente y comprobar la ubicación. Exportar JSON e importarlo como copia. Verificar que un perfil limpio comienza sin ese corpus.
4. Observar la red durante el recorrido en las herramientas de desarrollo del panel, la página y el worker. Registrar por navegador el resultado, las solicitudes observadas y cualquier fallo, usando solo datos sintéticos.

El smoke automatizado cargó el panel como página de extensión. La apertura desde el icono, los diálogos nativos y la evidencia manual de tráfico siguen pendientes de registro.
