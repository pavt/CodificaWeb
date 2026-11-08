import { segmentHighlights } from '../domain/highlights';
import { resolveAnchor } from './resolve-anchor';
import { indexDocument } from './text-index';

export function createPainter() {
  const owned = new Map<string, Highlight>();
  let sheet: CSSStyleSheet | undefined;
  let observer: MutationObserver | undefined;

  function clear() {
    for (const [name, highlight] of owned) {
      if (CSS.highlights.get(name) === highlight) CSS.highlights.delete(name);
    }
    owned.clear();
    if (sheet)
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (item) => item !== sheet,
      );
    sheet = undefined;
    observer?.disconnect();
    observer = undefined;
  }

  function paint(entries: unknown) {
    clear();
    if (
      typeof CSS === 'undefined' ||
      !CSS.highlights ||
      typeof Highlight === 'undefined' ||
      !document.body ||
      !Array.isArray(entries)
    )
      return { painted: false, unresolved: 0 };

    const index = indexDocument();
    if (!index) return { painted: false, unresolved: 0 };
    const { nodes, text } = index;

    const ranges = entries.flatMap((entry) => {
      const { id, color, selectors } = entry ?? {};
      const { exact, prefix, suffix } = selectors?.quote ?? {};
      if (
        typeof id !== 'string' ||
        typeof color !== 'string' ||
        !/^#[0-9a-f]{6}$/i.test(color) ||
        typeof exact !== 'string' ||
        exact.length > 16_384 ||
        typeof prefix !== 'string' ||
        prefix.length > 32 ||
        typeof suffix !== 'string' ||
        suffix.length > 32
      )
        return [];
      const resolved = resolveAnchor(text, exact, prefix, suffix);
      return resolved ? [{ id, ...resolved, color }] : [];
    });

    const colors = new Map<string, Range[]>();
    let cursor = 0;
    for (const segment of segmentHighlights(ranges)) {
      while ((nodes[cursor]?.end ?? Infinity) <= segment.start) cursor++;
      for (let i = cursor; i < nodes.length; i++) {
        const span = nodes[i];
        if (!span || span.start >= segment.end) break;
        const range = document.createRange();
        range.setStart(
          span.node,
          Math.max(segment.start, span.start) - span.start,
        );
        range.setEnd(span.node, Math.min(segment.end, span.end) - span.start);
        const bucket = colors.get(segment.color) ?? [];
        bucket.push(range);
        colors.set(segment.color, bucket);
      }
    }
    const result = {
      painted: true,
      unresolved: entries.length - ranges.length,
    };
    if (!colors.size) return result;

    sheet = new CSSStyleSheet();
    const rules: string[] = [];
    for (const [color, ranges] of colors) {
      let name = `codificaweb-${color.slice(1).toLowerCase()}`;
      while (CSS.highlights.has(name)) name += '-cw';
      const highlight = new Highlight();
      for (const range of ranges) highlight.add(range);
      CSS.highlights.set(name, highlight);
      owned.set(name, highlight);
      rules.push(
        `::highlight(${name}) { text-decoration: underline solid ${color} 1px; }`,
      );
    }
    sheet.replaceSync(rules.join('\n'));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    observer = new MutationObserver(clear);
    observer.observe(document, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden', 'contenteditable'],
    });
    return result;
  }

  window.addEventListener('hashchange', clear);
  window.addEventListener('popstate', clear);
  window.addEventListener('pagehide', clear);
  return { paint, clear };
}
