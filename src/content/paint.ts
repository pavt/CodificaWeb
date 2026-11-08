import { segmentHighlights } from '../domain/highlights';
import { excluded, maxDocumentLength } from './capture';

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

  function paint(entries: unknown): boolean {
    clear();
    if (
      typeof CSS === 'undefined' ||
      !CSS.highlights ||
      typeof Highlight === 'undefined' ||
      !document.body ||
      !Array.isArray(entries)
    )
      return false;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const nodes: { node: Text; start: number; end: number }[] = [];
    let text = '';
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest(excluded)) continue;
      const value = (node as Text).data;
      if (text.length + value.length > maxDocumentLength) return false;
      if (!value) continue;
      const start = text.length;
      text += value;
      nodes.push({ node: node as Text, start, end: text.length });
    }

    const ranges = entries.flatMap((entry) => {
      const { id, color, selectors } = entry ?? {};
      const { start, end } = selectors?.position ?? {};
      const { exact, prefix, suffix } = selectors?.quote ?? {};
      if (
        typeof id !== 'string' ||
        typeof color !== 'string' ||
        !/^#[0-9a-f]{6}$/i.test(color) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end <= start ||
        end > text.length ||
        typeof exact !== 'string' ||
        typeof prefix !== 'string' ||
        typeof suffix !== 'string' ||
        text.slice(start, end) !== exact ||
        text.slice(start - prefix.length, start) !== prefix ||
        text.slice(end, end + suffix.length) !== suffix
      )
        return [];
      return [{ id, start, end, color }];
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
    if (!colors.size) return true;

    sheet = new CSSStyleSheet();
    const rules: string[] = [];
    for (const [color, ranges] of colors) {
      let name = `codificaweb-${color.slice(1).toLowerCase()}`;
      while (CSS.highlights.has(name)) name += '-cw';
      const highlight = new Highlight();
      for (const range of ranges) highlight.add(range);
      CSS.highlights.set(name, highlight);
      owned.set(name, highlight);
      rules.push(`::highlight(${name}) { background-color: ${color}; }`);
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
    return true;
  }

  window.addEventListener('hashchange', clear);
  window.addEventListener('popstate', clear);
  window.addEventListener('pagehide', clear);
  return { paint, clear };
}
