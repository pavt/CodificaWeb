# Plan de implementación · Seleccionar y categorizar

**Estado** · Borrador para aprobación. [Especificación](spec.md) · [Maqueta 02](https://www.figma.com/design/HtpYQ4Cfy5lKDcs61xO16l?node-id=4-2) · [Tareas](tasks.md)

**Objetivo** · Habilitar el flujo selección → categoría → resaltado en Chrome y Brave mediante el panel lateral existente.

## Diseño técnico

- **Acceso y selección.** Implementar la entrada probada en T014. En el gesto del icono, `chrome.action.onClicked` abre el panel mediante `chrome.sidePanel.open({ tabId })` y usa `activeTab` para leer la selección existente de esa pestaña. Usar el acceso temporal para codificar en la pestaña invocada y verificar el documento antes de aceptar la cita. Con el panel abierto, mostrar selecciones nuevas en páginas autorizadas, sin escribir una URL. Ante una pestaña nueva sin acceso, ofrecer una acción contextual. El ensayo comparativo y la comprobación nativa pendiente constan en el [registro de T014](research.md).
- **Restauración.** Mantener la autorización por sitio para restaurar automáticamente resaltados en visitas posteriores. Mostrar esa opción en contexto y conservar los permisos ya otorgados. `activeTab` limita el acceso al contexto de la pestaña invocada, por lo que no sustituye por sí solo la autorización persistente. Evitar permisos globales obligatorios y validar el gesto requerido al pedir autorización opcional. [Acceso temporal](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab) · [Permisos opcionales](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- **Panel.** Reorganizar `src/panel/index.html` e `index.ts` para que la cita y las categorías aparezcan primero. Reusar `read-selection.ts`, `site-access.ts`, `coding-controls.ts` y `catalog-controls.ts` en sus responsabilidades actuales. La búsqueda y las acciones de proyecto, catálogo y transferencia siguen accesibles desde el panel. Verificar teclado, foco visible y anchos de 320 y 480 px.
- **Datos.** La categoría visual usa el código existente. Nombre, color y definición corresponden a los campos actuales, con la definición en `description`. Reusar las validaciones y el aislamiento por proyecto. Para **Guardar y aplicar**, usar una operación de fondo que confirme categoría y asociación en una sola transacción de IndexedDB. Confirmar la persistencia antes de pintar o mostrar éxito. La aplicación de una categoría existente sigue siendo idempotente. Conservar el esquema y el formato JSON vigentes.
- **Trazabilidad.** Cada PR apunta a su issue, criterio, archivo de prueba y diseño cuando aplique. El CI existente conserva sus comprobaciones. Las pruebas automatizadas distinguen qué se ejecuta en Chromium y qué se observa en los binarios instalados de Chrome y Brave. La comprobación nativa de T013 sigue su propio registro.

## Verificación y entrega

- **Flujo completo.** En el fixture sintético, invocar CodificaWeb, seleccionar una cita, crear una categoría con color y definición, guardarla y aplicarla a una segunda cita. Comprobar que ambas se muestran con el color elegido y que el panel conserva la definición.
- **Regresiones.** Probar selección anterior a la apertura, selección vacía y cambios de pestaña o proyecto, permiso revocado, fallo y reintento de guardado, solapamientos, recuperación, filtros y JSON existente. Mantener las pruebas de privacidad.
- **Entrega.** Ejecutar formato, lint, tipos, cobertura, build y E2E de Chromium. Ejecutar también `pnpm test:e2e:branded` en un entorno con Chrome y Brave y registrar lo que cubre. Preparar un `dist` instalable con instrucciones de carga y un recorrido de verificación reproducible. Observar a una persona completar la tarea principal sin indicarle dónde pulsar.

El plan conserva el requisito de privacidad local, la integridad de la evidencia y el desarrollo guiado por pruebas. Cualquier cambio de permisos deberá revisarse explícitamente en el PR que lo introduzca. [Constitución](../../.specify/memory/constitution.md)
