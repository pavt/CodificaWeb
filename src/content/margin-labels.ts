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
  const label = document.createElement('button');
  label.type = 'button';
  const swatch = document.createElement('span');
  swatch.className = 'citation-swatch';
  swatch.style.backgroundColor = color;
  label.className = 'citation-category';
  label.append(swatch, name);
  return label;
}

interface MarginCitation {
  id: string;
  anchor: Range;
  range: Range;
  length: number;
  categories: HighlightCategory[];
}

const hosts = new WeakSet<EventTarget>();

export function isMarginInteraction(event: Event) {
  return event.composedPath().some((item) => hosts.has(item));
}

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
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastPreview: string | undefined;
  let priority: MarginCitation[] = [];
  let popup: HTMLElement | undefined;
  let opener: HTMLButtonElement | undefined;

  function dismiss() {
    popup?.remove();
    popup = undefined;
    opener?.focus({ preventScroll: true });
    opener = undefined;
  }

  async function activate(
    id: string,
    category: HighlightCategory,
    button: HTMLButtonElement,
  ) {
    const currentHost = host;
    let response: unknown;
    try {
      response = await chrome.runtime.sendMessage({
        type: 'citation.open',
        id,
        categoryId: category.id,
      });
    } catch {
      // With the panel closed, show the detail beside the label.
    }
    if (response === true || host !== currentHost || !button.isConnected)
      return;
    popup?.remove();
    opener = button;
    const box = button.getBoundingClientRect();
    const detail = document.createElement('section');
    detail.className = 'citation-popup';
    detail.setAttribute('role', 'dialog');
    detail.setAttribute('aria-label', category.name);
    detail.style.left =
      Math.max(
        4,
        Math.min(box.left, document.documentElement.clientWidth - 232),
      ) + 'px';
    detail.style.top =
      Math.max(
        4,
        Math.min(box.bottom + 4, document.documentElement.clientHeight - 128),
      ) + 'px';
    const definition = document.createElement('p');
    definition.textContent =
      typeof category.description === 'string' && category.description.trim()
        ? category.description
        : 'Sin definición';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Cerrar';
    close.addEventListener('click', dismiss);
    detail.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        dismiss();
      }
    });
    const title = document.createElement('strong');
    title.textContent = category.name;
    detail.append(title, definition, close);
    list?.after(detail);
    popup = detail;
    close.focus({ preventScroll: true });
  }

  function stopPreview() {
    clearTimeout(timer);
    if (!lastPreview) return;
    lastPreview = undefined;
    void chrome.runtime
      .sendMessage({ type: 'citation.preview.end' })
      .catch(() => undefined);
  }

  function pointerOut(event: PointerEvent) {
    if (event.relatedTarget === null) stopPreview();
  }

  function pointerMove(event: PointerEvent) {
    clearTimeout(timer);
    if (event.buttons || isMarginInteraction(event)) {
      stopPreview();
      return;
    }
    const { clientX: x, clientY: y } = event;
    timer = setTimeout(() => {
      let underline: MarginCitation | undefined;
      const text = priority.find((citation) => {
        for (const rect of citation.range.getClientRects()) {
          if (x < rect.left || x > rect.right || y < rect.top) continue;
          if (y <= rect.bottom) return true;
          // The 3 px decoration and its font-relative offset can extend
          // below the text rectangle reported by the browser.
          if (y <= rect.bottom + 3 + rect.height * 0.14) underline ??= citation;
        }
        return false;
      });
      const match = text ?? underline;
      if (!match?.id) {
        stopPreview();
        return;
      }
      if (match.id === lastPreview) return;
      lastPreview = match.id;
      void chrome.runtime
        .sendMessage({ type: 'citation.preview', id: match.id })
        .catch(() => undefined);
    }, 120);
  }
  const width = 148;
  const gap = 8;

  function render() {
    if (!list) return;
    if (popup || host?.matches(':focus-within')) return;
    list.replaceChildren();
    const viewport = document.documentElement;
    const candidates = citations
      .flatMap(({ id, anchor, categories }) => {
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
        return [
          { id, x, y: Math.max(0, Math.floor(rect.top)), block, categories },
        ];
      })
      .sort((a, b) => a.y - b.y);

    const occupied: { x: number; y: number; bottom: number }[] = [];
    for (const { id, x, y, block, categories } of candidates) {
      const row = document.createElement('div');
      row.className = 'citation-row';
      row.style.left = x + 'px';
      row.style.top = y + 'px';
      row.append(
        ...categories.map((category) => {
          const label = marginLabel(category);
          label.addEventListener('pointerdown', (event) =>
            event.preventDefault(),
          );
          label.addEventListener('click', () => {
            void activate(id, category, label);
          });
          return label;
        }),
      );
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
              .every((element) => element === host || element.contains(block)),
          ),
        );
      if (fits) {
        row.classList.add('citation-row-ready');
        occupied.push({ x, y, bottom });
      } else row.remove();
    }
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(render);
  }

  function viewportChanged() {
    stopPreview();
    schedule();
  }

  return {
    clear() {
      if (!host) return;
      stopPreview();
      window.removeEventListener('pointermove', pointerMove, true);
      window.removeEventListener('pointerout', pointerOut);
      popup = undefined;
      opener = undefined;
      priority = [];
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', viewportChanged, true);
      window.removeEventListener('resize', viewportChanged);
      host.remove();
      host = undefined;
      list = undefined;
      citations = [];
    },
    show(next: MarginCitation[]) {
      if (!next.length) return;
      citations = next;
      priority = [...next].sort(
        (a, b) =>
          (a.length ?? 0) - (b.length ?? 0) ||
          ((a.id ?? '') < (b.id ?? '') ? -1 : Number(a.id !== b.id)),
      );
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
        .citation-row-ready button, .citation-popup { pointer-events:auto; }
        .citation-category { text-align:start; cursor:pointer; font:inherit; }
        .citation-popup { position:absolute; box-sizing:border-box; width:228px; max-height:120px; overflow:auto; overflow-wrap:anywhere; padding:8px; font:13px/1.4 system-ui; background:Canvas; color:CanvasText; border:1px solid GrayText; border-radius:6px; }
        .citation-popup p { margin:4px 0; }
        .citation-swatch { display:inline-block; width:8px; height:8px; border:1px solid GrayText; flex:none; }
      `);
      shadow.adoptedStyleSheets = [style];
      list = document.createElement('div');
      list.setAttribute('aria-label', 'Categorías al margen');
      shadow.append(list);
      shadow.addEventListener('focusout', schedule);
      document.documentElement.append(host);
      window.addEventListener('pointermove', pointerMove, {
        capture: true,
        passive: true,
      });
      window.addEventListener('pointerout', pointerOut);
      window.addEventListener('scroll', viewportChanged, true);
      window.addEventListener('resize', viewportChanged);
      schedule();
    },
  };
}
