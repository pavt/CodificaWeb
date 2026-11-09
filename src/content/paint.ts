import type { SelectionSnapshot } from '../capture-contract';
import {
  createMarginLabels,
  isPageMutation,
  readMarginCategories,
} from './margin-labels';
import { segmentHighlights } from '../domain/highlights';
import { resolveAnchor } from './resolve-anchor';
import { indexDocument } from './text-index';

export function createPainter() {
  const margin = createMarginLabels();
  const owned = new Map<string, Highlight>();
  const savedSelectors = new Map<
    string,
    SelectionSnapshot['selectors'] | null
  >();
  let paintedUrl: string | undefined;
  let sheet: CSSStyleSheet | undefined;
  let observer: MutationObserver | undefined;

  function clear() {
    margin.clear();
    savedSelectors.clear();
    paintedUrl = undefined;
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

    paintedUrl = location.href;
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
      if (resolved && selectors.profile === 'dom-text-v1') {
        const key = `${resolved.start}:${resolved.end}`;
        // Different saved citations can resolve to the same text. Do not pick one.
        savedSelectors.set(key, savedSelectors.has(key) ? null : selectors);
      }
      return resolved
        ? [
            {
              id,
              ...resolved,
              color,
              categories: readMarginCategories(entry.categories),
            },
          ]
        : [];
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
        `::highlight(${name}) { text-decoration: underline solid ${color} 3px; text-underline-offset: 0.14em; }`,
      );
    }
    sheet.replaceSync(rules.join('\n'));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    let anchorIndex = 0;
    margin.show(
      [...ranges]
        .sort((a, b) => a.start - b.start)
        .flatMap(({ id, start, end, categories }) => {
          if (!categories.length) return [];
          while ((nodes[anchorIndex]?.end ?? Infinity) <= start) anchorIndex++;
          const span = nodes[anchorIndex];
          if (!span) return [];
          const anchor = document.createRange();
          anchor.setStart(span.node, start - span.start);
          anchor.setEnd(span.node, Math.min(span.end, end) - span.start);
          const range = anchor.cloneRange();
          let low = anchorIndex;
          let high = nodes.length - 1;
          while (low < high) {
            const middle = (low + high) >>> 1;
            if ((nodes[middle]?.end ?? Infinity) < end) low = middle + 1;
            else high = middle;
          }
          const last = nodes[low];
          if (last) range.setEnd(last.node, end - last.start);
          return [{ id, anchor, range, length: end - start, categories }];
        }),
    );
    observer = new MutationObserver((records) => {
      if (records.some(isPageMutation)) clear();
    });
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
  return {
    paint,
    clear,
    restoreSelectionAnchor(selection: SelectionSnapshot): SelectionSnapshot {
      if (selection.url !== paintedUrl) return selection;
      const { start, end } = selection.selectors.position;
      const original = savedSelectors.get(`${start}:${end}`);
      return original?.quote.exact === selection.selectors.quote.exact
        ? { ...selection, selectors: original }
        : selection;
    },
  };
}
