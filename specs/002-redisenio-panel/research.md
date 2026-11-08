# T014 · Referentes y prueba de acceso

[Issue #29](https://github.com/pavt/CodificaWeb/issues/29) · [Prototipo navegable](https://www.figma.com/proto/HtpYQ4Cfy5lKDcs61xO16l?node-id=10-3)

## Decisiones de diseño

- **ATLAS.ti.** Seleccionar un pasaje abre la posibilidad de aplicar un código existente o crear uno. La definición se registra en el código, que tiene su propio color. Adoptar este orden y reunir nombre, color y definición opcional en **Guardar y aplicar**. [Creación y aplicación](https://manuals.atlasti.com/Win/en/manual/Codes/CodingData.html) · [Definición y color](https://manuals.atlasti.com/Win/en/manual/Codes/CodesWorkingWith.html)
- **Hypothesis.** La selección ofrece una acción contextual, y la barra lateral presenta el pasaje asociado. Mantener la cita visible al asignar o crear una categoría. [Flujo de anotación](https://web.hypothes.is/help/annotation-basics/)
- **Penciled.** La selección lleva directamente a las acciones de resaltar o anotar. Mantener la selección como punto de entrada y mostrar el resaltado tras confirmar la persistencia. [Penciled](https://github.com/marcellosso/penciled)

El recorrido navegable enlaza **Crear categoría**, **Guardar y aplicar** y el regreso a una nueva selección. Los campos y la página son simulados en Figma.

## Ensayo con perfiles aislados

Se ensayó en Google Chrome 156.0.8078.80 y Brave 156.1.98.60. Se copió el paquete compilado a un directorio temporal y se añadió `activeTab` al manifiesto de esa copia. Se cargó con `Extensions.loadUnpacked` y se abrió un fixture HTTP en loopback. Con una cita seleccionada, se guardó el ID de la pestaña del fixture y se intentó leer la selección mediante `chrome.scripting.executeScript` antes y después de `Extensions.triggerAction`. Para la acción, se obtuvo el destino de tipo `tab` con `Target.getTargets` y el filtro de ese tipo.

Con la apertura automática actual, ambos navegadores crearon el destino del panel y rechazaron la inyección antes y después de la invocación por CDP, incluso al apuntar al mismo ID de pestaña. En una segunda copia, se reemplazó el worker por un manejador de `chrome.action.onClicked`. El manejador invocó `chrome.sidePanel.open({ tabId })` durante el gesto y ejecutó una lectura de la selección sobre esa pestaña. Chrome y Brave rechazaron la inyección previa, abrieron el panel y devolvieron exactamente «Cita sintética T014» tras la acción. El fixture se sirvió como `text/html; charset=utf-8`. El ensayo solo usó el acceso temporal y mantuvo intactos los binarios y perfiles habituales.

Se elige el manejador explícito para T015. La prueba por CDP demuestra el comportamiento del evento y el acceso temporal en los binarios instalados. El clic real en el icono de la barra se verificó también en Chrome 157.0.8103.38 y Brave 157.1.99.55, en perfiles nuevos de Ubuntu 24.04 arm64. En ambos se seleccionó «Alfa beta gamma delta.» en la página sintética antes de hacer clic. El panel abrió y el worker devolvió exactamente esa cita, sin diálogo de permiso persistente. CDP solo leyó el resultado del worker después del clic. [Protocolo CDP](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/) · [Gestos de activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)

T015 depende de la integración de T013 y T014. La validación nativa de T013 está documentada en el PR #28. [Issue #14](https://github.com/pavt/CodificaWeb/issues/14) · [PR #28](https://github.com/pavt/CodificaWeb/pull/28)
