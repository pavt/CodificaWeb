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

CI ejecuta el recorrido funcional con `pnpm test:e2e` tras compilar el paquete. Incluye codificación, solapamientos, persistencia, búsqueda con filtros, navegación, transferencia JSON y observación automatizada de red en Chromium. El smoke en Chrome y Brave se ejecutó con perfiles separados.

En Chrome, la prueba manual mostró el panel abierto, la captura deshabilitada antes del permiso y la captura habilitada después de verificar el acceso. También mostró una búsqueda por nota que devolvió la evidencia con ambos códigos. El resultado del diálogo nativo queda pendiente de confirmar.

Queda por comprobar en la interfaz de cada navegador el rechazo y la concesión mediante el diálogo nativo, la revocación desde el administrador de extensiones y su efecto sobre la captura y los datos guardados. En Brave queda también la apertura desde el icono. La prueba por navegador recoge el tráfico observado durante la carga y el intento previo al permiso. La E2E de Chromium observa además el recorrido funcional con acceso. Sigue pendiente la evidencia durante un recorrido con permiso concedido en Chrome y Brave.
