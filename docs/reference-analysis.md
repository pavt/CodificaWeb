# Análisis de referencias

Revisión estática del código fuente el 8 de noviembre de 2026. Los enlaces de código fijan las revisiones examinadas.

## Penciled

La rama principal examinada contiene el paquete 0.5.3, con actividad al 4 de noviembre. El subpath ESM `penciled/headless` reexporta el motor y sus tipos. La API pública es `annotate(container, options)`, con `ready`, `create(Range, init)`, `getRange`, `update`, `remove`, `refresh`, `focus`, `annotationAt`, importación/exportación y eventos como `select`, `orphan` y `error`. También expone conversión W3C. El manifiesto del paquete declara `@floating-ui/dom` y React como peer opcional. Las importaciones del motor headless son internas al paquete. La licencia MIT exige conservar el aviso de copyright y licencia al redistribuir. [Paquete y fuentes](https://github.com/marcellosso/penciled/tree/feeb55e144f0a35c867fb2c0dcfd7c950af015d0/packages/penciled)

- **Captura y recuperación.** Lee selecciones DOM y conserva cita, contexto y offsets en texto con espacios colapsados. Prueba la posición con contexto, busca citas exactas y puede probar coincidencias aproximadas. Ante candidatos con puntuaciones cercanas deja huérfana la anotación. Observa cambios del contenedor cuando hay anotaciones. [Motor](https://github.com/marcellosso/penciled/blob/feeb55e144f0a35c867fb2c0dcfd7c950af015d0/packages/penciled/src/engine/annotate.ts) · [Anclaje](https://github.com/marcellosso/penciled/blob/feeb55e144f0a35c867fb2c0dcfd7c950af015d0/packages/penciled/src/engine/anchoring/selector.ts)
- **Persistencia y notas.** Guarda una nota opcional por selección y usa localStorage por defecto. Admite memoria o un adaptador async con carga, guardado y operaciones granulares opcionales. Las actualizaciones en memoria pueden preceder a la escritura, cuyos fallos se notifican por evento. La exportación describe un documento y sus anotaciones. [Contrato público](https://github.com/marcellosso/penciled/blob/feeb55e144f0a35c867fb2c0dcfd7c950af015d0/packages/penciled/src/engine/types.ts) · [Persistencia](https://github.com/marcellosso/penciled/blob/feeb55e144f0a35c867fb2c0dcfd7c950af015d0/packages/penciled/src/engine/storage.ts)
- **Solapamientos.** El pintor CSS divide en tramos disjuntos y asigna cada uno al intervalo más corto. En empate gana el posterior. El hit test elige la anotación interna y crear sobre el mismo intervalo devuelve la existente. El modelo tiene un color por anotación y el API no expone el segmentador ni una política de pintura. Usar metadatos para los códigos seguiría exigiendo un adaptador de dominio y otra política visual. [Pintor](https://github.com/marcellosso/penciled/blob/feeb55e144f0a35c867fb2c0dcfd7c950af015d0/packages/penciled/src/engine/render.ts) · [Contrato](https://github.com/marcellosso/penciled/blob/feeb55e144f0a35c867fb2c0dcfd7c950af015d0/packages/penciled/src/engine/types.ts)
- **MV3 y mantenimiento.** Incluye extensión WXT MV3 con mínimo Chrome 123, content script que importa la entrada completa y almacenamiento propio de extensión. Esto sustenta la viabilidad de empaquetar el motor, con el subpath headless y Brave pendientes de validación empírica. El repositorio contiene pruebas de anclaje y E2E. La actividad reciente no garantiza estabilidad futura del API. [Extensión](https://github.com/marcellosso/penciled/tree/feeb55e144f0a35c867fb2c0dcfd7c950af015d0/apps/extension) · [Pruebas](https://github.com/marcellosso/penciled/tree/feeb55e144f0a35c867fb2c0dcfd7c950af015d0/packages/penciled/test)

## Hypothesis

Cliente de anotación con anotador DOM, integraciones HTML/PDF y barra lateral conectada a un servicio. La revisión examinada es del 15 de octubre. BSD-2-Clause exige conservar aviso, condiciones y descargo, también en materiales que acompañen binarios. El manifiesto incluye Preact, Redux y otras herramientas del cliente. El núcleo HTML es código interno TypeScript, con utilidades XPath/rango y `approx-string-match` ^2.0.0 en el matcher de citas. [Licencia](https://github.com/hypothesis/client/blob/a7b7400d0d706d4357ec37c2a3610b25dcca89d5/LICENSE) · [Dependencias](https://github.com/hypothesis/client/blob/a7b7400d0d706d4357ec37c2a3610b25dcca89d5/package.json)

- `describe` genera selectores de rango estructural, posición textual y cita, entre otros. `anchor` prueba primero rango, después posición y finalmente cita. Comprueba la cita exacta para las dos primeras rutas cuando está disponible. La ruta de cita usa coincidencias exactas primero y luego distancia de edición, contexto y proximidad. Esto permite recuperar evidencia si cambian los nodos o se desplazan los offsets. La selección del mejor candidato sigue siendo heurística. [Anclaje HTML](https://github.com/hypothesis/client/blob/a7b7400d0d706d4357ec37c2a3610b25dcca89d5/src/annotator/anchoring/html.ts) · [Matcher](https://github.com/hypothesis/client/blob/a7b7400d0d706d4357ec37c2a3610b25dcca89d5/src/annotator/anchoring/match-quote.ts)
- El invitado vuelve a resolver selectores cuando ancla y maneja rangos fallidos. El observador de la integración HTML examinado se ocupa de cambios de URI de metadatos, por lo que el seguimiento genérico de mutaciones de texto requiere una política propia. El highlighter HTML envuelve nodos en elementos `hypothesis-highlight`. [Invitado](https://github.com/hypothesis/client/blob/a7b7400d0d706d4357ec37c2a3610b25dcca89d5/src/annotator/guest.ts) · [Integración HTML](https://github.com/hypothesis/client/blob/a7b7400d0d706d4357ec37c2a3610b25dcca89d5/src/annotator/integrations/html.ts) · [Highlighter](https://github.com/hypothesis/client/blob/a7b7400d0d706d4357ec37c2a3610b25dcca89d5/src/annotator/highlighter.ts)

## Decisión

| Alternativa           | Ventaja                                                                                    | Coste y límite                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Penciled headless     | Selección, observador, recuperación y pintura integrados. Evidencia upstream de uso en MV3 | Acopla la aplicación a un modelo monocolor, política de solapamiento fija y heurística de reanclaje. Adaptar proyectos y confirmación de guardado sigue siendo necesario |
| Anclaje de Hypothesis | Algoritmos probados y selectores complementarios                                           | Extraer código interno o adoptar el matcher añade mantenimiento y auditoría. Captura, política de confianza y pintura siguen siendo trabajo local                        |
| Motor propio          | Control de confianza, colores, presupuesto y privacidad con APIs estándar                  | Mayor coste inicial en mapeo DOM y pruebas con HTML dinámico                                                                                                             |

Se elige motor propio con Selection, Range, TreeWalker y CSS Custom Highlight. Adopta la idea de combinar cita, contexto y posición, con abstención explícita ante ambigüedad. En v1, el texto editado que ya no coincide queda sin ubicar. Se evita el coste y el riesgo de falsos positivos de una búsqueda aproximada automática. El coste inicial se concentra en fixtures de Unicode, límites DOM, coincidencias repetidas y solapamientos. La decisión y sus umbrales quedan sujetos a validar en los navegadores objetivo. [W3C Web Annotation](https://www.w3.org/TR/annotation-model/) · [CSS Custom Highlight API](https://www.w3.org/TR/css-highlight-api-1/)

## Validación de Penciled headless (T031)

Se usó el paquete de npm `penciled@0.5.3` con la extensión MV3 real y perfiles
temporales. Playwright sirvió los módulos de prueba desde el origen local del
fixture. Penciled se ejecutó en el contexto de la página, junto a los rangos que
registró el script de contenido de CodificaWeb. La prueba mide el registro CSS y
sus rangos. No carga la hoja de estilos de Penciled.

| Operación con la API pública                   | Resultado observado en Chrome y Brave                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Evento `select` sin anotaciones en memoria     | Devuelve el rango esperado y conserva el registro CSS                                                                 |
| `create(range)` sobre una cita categorizada    | Registra `penciled-yellow` y `penciled-active` sobre la misma cita                                                    |
| `clear()` seguido de `import()` y `getRange()` | Recupera la cita y registra `penciled-yellow`. El resaltado de categoría conserva sus rangos                          |
| `destroy()`                                    | Restablece el registro CSS anterior. Se conservan el HTML de la cita y las claves de almacenamiento local del fixture |

La prueba inicial exigía que importar y resolver dejara intacto el registro CSS.
Falló en ambos navegadores por `penciled-yellow`. La prueba de caracterización
registra ese resultado como parte del contrato observado. La captura sin
anotaciones puede entregar rangos por separado. En la versión evaluada,
`getRange()` requiere una anotación creada, importada o cargada y la API pública
no ofrece una opción para desactivar el pintor. La evaluación no demuestra
interferencia visual con la hoja de estilos actual. Sí demuestra que la API de
recuperación incorpora un segundo pintor, por lo que las etapas de integración
quedan detenidas en este punto.

Para reproducir en macOS, con Chrome y Brave instalados:

```sh
pnpm build
penciled_fixture=$(mktemp -d)
npm pack penciled@0.5.3 --pack-destination "$penciled_fixture"
tar -xzf "$penciled_fixture/penciled-0.5.3.tgz" -C "$penciled_fixture"
CODIFICAWEB_PENCILED_DIST="$penciled_fixture/package/dist" \
  pnpm test:e2e:branded --grep 'Google Chrome|Brave Browser'
```
