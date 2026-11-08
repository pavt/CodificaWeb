import type { HighlightCategory } from '../domain/codings';

export function readMarginCategories(value: unknown): HighlightCategory[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (category): category is HighlightCategory =>
      typeof category?.id === 'string' &&
      typeof category.name === 'string' &&
      typeof category.color === 'string' &&
      /^#[0-9a-f]{6}$/i.test(category.color),
  );
}

function marginLabel({ name, color }: HighlightCategory) {
  const label = document.createElement('span');
  const swatch = document.createElement('span');
  swatch.className = 'citation-swatch';
  swatch.style.backgroundColor = color;
  label.className = 'citation-category';
  label.append(swatch, name);
  return label;
}

interface MarginCitation {
  anchor: Range;
  categories: HighlightCategory[];
}

const hosts = new WeakSet<Node>();

export function isPageMutation(record: MutationRecord) {
  return (
    record.type !== 'childList' ||
    [...record.addedNodes, ...record.removedNodes].some(
      (node) => !hosts.has(node),
    )
  );
}

export function createMarginLabels() {
  let host: HTMLElement | undefined;
  let list: HTMLElement | undefined;
  let citations: MarginCitation[] = [];
  let frame = 0;
  const width = 148;
  const gap = 8;

  function render() {
    if (!list) return;
    list.replaceChildren();
    const viewport = document.documentElement;
    const candidates = citations
      .flatMap(({ anchor, categories }) => {
        const rect = anchor.getClientRects()[0];
        let block = anchor.startContainer.parentElement;
        while (block && getComputedStyle(block).display.startsWith('inline'))
          block = block.parentElement;
        if (
          !rect ||
          !block ||
          rect.bottom <= 0 ||
          rect.top >= viewport.clientHeight
        )
          return [];
        const x =
          Math.ceil(Math.max(rect.right, block.getBoundingClientRect().right)) +
          gap;
        if (x + width + gap > viewport.clientWidth) return [];
        return [{ x, y: Math.max(0, Math.floor(rect.top)), block, categories }];
      })
      .sort((a, b) => a.y - b.y);

    const occupied: { x: number; y: number; bottom: number }[] = [];
    for (const { x, y, block, categories } of candidates) {
      const row = document.createElement('div');
      row.className = 'citation-row';
      row.style.left = x + 'px';
      row.style.top = y + 'px';
      row.append(...categories.map(marginLabel));
      list.append(row);
      const bottom = y + row.getBoundingClientRect().height;
      const fits =
        bottom <= viewport.clientHeight &&
        !occupied.some(
          (other) =>
            x < other.x + width &&
            other.x < x + width &&
            y < other.bottom &&
            bottom > other.y,
        ) &&
        [x, x + width / 2, x + width - 1].every((left) =>
          [y, (y + bottom) / 2, bottom - 1].every((top) =>
            document
              .elementsFromPoint(left, top)
              .every((element) => element.contains(block)),
          ),
        );
      if (fits) occupied.push({ x, y, bottom });
      else row.remove();
    }
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  return {
    clear() {
      if (!host) return;
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      host.remove();
      host = undefined;
      list = undefined;
      citations = [];
    },
    show(next: MarginCitation[]) {
      if (!next.length) return;
      citations = next;
      host = document.createElement('div');
      hosts.add(host);
      host.style.cssText =
        'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483646!important';
      const shadow = host.attachShadow({ mode: 'closed' });
      const style = new CSSStyleSheet();
      style.replaceSync(`
        :host { color-scheme: light dark; }
        .citation-row { position: absolute; width: ${width}px; display: grid; gap: 2px; font: 12px/1.4 system-ui; }
        .citation-category { display:flex; align-items:baseline; gap:5px; padding:2px 5px; border-radius:4px; overflow-wrap:anywhere; background:Canvas; color:CanvasText; border:1px solid GrayText; }
        .citation-swatch { display:inline-block; width:8px; height:8px; border:1px solid GrayText; flex:none; }
      `);
      shadow.adoptedStyleSheets = [style];
      list = document.createElement('div');
      list.setAttribute('aria-label', 'Categorías al margen');
      shadow.append(list);
      document.documentElement.append(host);
      window.addEventListener('scroll', schedule, true);
      window.addEventListener('resize', schedule);
      schedule();
    },
  };
}
