# Validación de versión · T013

Registro del 8 de noviembre de 2026 sobre el paquete compilado desde T012, con datos sintéticos y perfiles temporales. [Issue #14](https://github.com/pavt/CodificaWeb/issues/14) · [Matriz de trazabilidad](../specs/001-codificacion-web/tasks.md) · [Definición de terminado](quality.md)

## Compatibilidad observada

Entorno macOS 26.6.2 (25G83), Apple M1 Max.

| Navegador     | Versión       | Resultado del smoke automatizado                                                                                                                 |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Google Chrome | 156.0.8078.80 | Carga de MV3, arranque del worker, renderizado del panel, configuración de apertura desde el icono y ausencia de permiso inicial para localhost. |
| Brave Browser | 156.1.98.60   | Mismas comprobaciones, en un perfil independiente.                                                                                               |

Para repetir la prueba en macOS, ejecutar `pnpm build` y `pnpm test:e2e:branded`. La suite usa los binarios instalados en /Applications y permite indicar otras rutas mediante `CODIFICAWEB_CHROME_BIN` y `CODIFICAWEB_BRAVE_BIN`. Carga `dist` mediante CDP en dos perfiles temporales. Comprueba la ausencia de permiso inicial para loopback, el bloqueo real de la inyección y la ausencia de solicitudes HTTP(S) o WebSocket inesperadas observadas en el contexto de la prueba. [Prueba reproducible](../tests/branded/permissions.spec.ts) · [Protocolo CDP](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/)

## Permisos y privacidad

- El paquete declara `sidePanel` y `scripting`, con orígenes HTTP(S) opcionales. Q11 usa el paquete intacto, comprueba que la API impide la inyección antes de otorgar acceso y simula el rechazo de la solicitud emitida por un clic.
- Q14 observa las solicitudes HTTP(S) notificadas por Playwright y las aperturas WebSocket interceptadas durante la E2E del corpus sintético. Solo admite las navegaciones a los fixtures locales; las demás solicitudes interceptables se abortan. Se comprobó la aserción con un `GET` sintético deliberado desde el panel que produjo un fallo y se retiró después. El recorrido posterior pasó con cero solicitudes inesperadas observadas. La observación se limita al contexto y al intervalo de la prueba.
- La E2E de Chromium ejercita captura, solapamientos, proyectos, notas, reanudación del worker, búsqueda, navegación y transferencia JSON. Usa una copia con acceso concedido al host del fixture. Las pruebas y los criterios relacionados constan en la matriz. [Q11](../tests/e2e/mv3.spec.ts) · [Q14 y recorrido](../tests/e2e/selection.spec.ts)

## Auditoría

`pnpm audit --prod` informó cero vulnerabilidades conocidas. `pnpm audit` detectó un aviso moderado de `minimatch@10.2.6` en las herramientas de lint. La corrección empieza en 11.0.1, fuera del major del árbol actual. Se registra como hallazgo de desarrollo: el paquete de la extensión carece de esa dependencia y el lint usa patrones del repositorio. [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)

## Comprobaciones de la interfaz nativa

El paquete de T013 se verificó con Chrome 157.0.8103.38 y Brave 157.1.99.55 en Ubuntu 24.04 arm64, en un escritorio X11 dentro de Docker. Cada binario usó un directorio de perfil nuevo y el fixture sintético de loopback. El panel se abrió mediante un clic real en el icono de la barra de cada navegador.

| Comprobación                                      | Chrome                                         | Brave                                          |
| ------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Captura previa al permiso                         | Deshabilitada                                  | Deshabilitada                                  |
| Rechazo en el diálogo nativo                      | «Permiso denegado»                             | «Permiso denegado»                             |
| Concesión y captura                               | Cita capturada                                 | Cita capturada                                 |
| Recarga con permiso                               | Resaltado restaurado                           | Resaltado restaurado                           |
| Revocación desde el menú de extensiones y recarga | Captura bloqueada y evidencia guardada visible | Captura bloqueada y evidencia guardada visible |

Se observaron solicitudes HTTP(S) y WebSocket mediante CDP en los destinos de página y service worker durante el recorrido. En cada navegador se registró solo la navegación al fixture de loopback. La observación corresponde al intervalo y los destinos instrumentados. Los perfiles comenzaron separados y el resultado de Chrome no apareció en Brave.

CI cubre el flujo funcional ampliado en Chromium, incluidos solapamientos, notas, búsqueda, navegación y transferencia JSON. La prueba nativa verificó el comportamiento del navegador y la conservación de la evidencia tras revocar el permiso.
