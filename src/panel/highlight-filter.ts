import {
  categoryLabel,
  readHighlightCategories,
} from '../highlight-categories';
import { isRecord } from '../capture-contract';
import type { CaptureTarget } from '../capture-contract';
import type { CodeAssignment, HighlightCategory } from '../domain/codings';

export function createHighlightFilter(
  filter: HTMLSelectElement,
  status: HTMLElement,
  onInspect: (id: string, quote: string, url: string) => void,
) {
  const citations = document.getElementById('page-citations');
  const list = document.getElementById('page-citation-list');

  const inspection = document.getElementById('citation-inspection');
  const inspectedQuote = document.getElementById('citation-inspection-quote');
  const inspectedCategories = document.getElementById(
    'citation-inspection-categories',
  );
  const detail = document.getElementById('citation-inspection-detail');
  const name = document.getElementById('citation-inspection-name');
  const definition = document.getElementById('citation-inspection-definition');
  const entriesById = new Map<
    string,
    { quote: string; categories: HighlightCategory[] }
  >();
  let shown: { id: string; categoryId: string | undefined } | undefined;
  let opener: HTMLElement | undefined;

  function clearInspection() {
    shown = undefined;
    if (inspection) inspection.hidden = true;
    if (inspectedQuote) inspectedQuote.textContent = '';
    opener = undefined;
  }

  inspection?.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const previous = opener;
    clearInspection();
    previous?.focus({ preventScroll: true });
  });

  function inspect(
    id: string,
    categoryId?: string,
    replacePinned = false,
  ): boolean {
    const entry = entriesById.get(id);
    if (
      !entry ||
      !inspection ||
      !inspectedQuote ||
      !inspectedCategories ||
      !detail ||
      !name ||
      !definition
    )
      return false;
    const selected = entry.categories.find(
      (category) => category.id === categoryId,
    );
    if (categoryId && !selected) return false;
    if (!categoryId && shown?.categoryId && !replacePinned) return true;
    shown = { id, categoryId };
    inspectedQuote.textContent = entry.quote;
    if (inspectedCategories.dataset.citation !== id) {
      inspectedCategories.dataset.citation = id;
      inspectedCategories.replaceChildren(
        ...entry.categories.map((category) =>
          categoryLabel(category, () => inspect(id, category.id)),
        ),
      );
    }
    for (const button of inspectedCategories.querySelectorAll('button'))
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.category === categoryId),
      );
    detail.hidden = !selected;
    name.textContent = selected?.name ?? '';
    definition.textContent = selected
      ? selected.description?.trim() || 'Sin definición'
      : '';
    inspection.hidden = false;
    if (target) onInspect(id, entry.quote, target.url);
    return true;
  }

  function showCitations(entries: unknown[]) {
    if (!citations || !list) return;
    entriesById.clear();
    if (inspectedCategories) delete inspectedCategories.dataset.citation;
    const rows = entries
      .flatMap((entry) => {
        if (
          !isRecord(entry) ||
          typeof entry.id !== 'string' ||
          !isRecord(entry.selectors)
        )
          return [];
        const { id } = entry;
        const { quote, position } = entry.selectors;
        if (
          !isRecord(quote) ||
          typeof quote.exact !== 'string' ||
          !isRecord(position) ||
          typeof position.start !== 'number'
        )
          return [];
        const categories = readHighlightCategories(entry.categories);
        if (!categories.length) return [];
        entriesById.set(id, { quote: quote.exact, categories });
        const row = document.createElement('li');
        const excerpt = document.createElement('p');
        excerpt.textContent =
          quote.exact.length > 180
            ? quote.exact.slice(0, 180) + '…'
            : quote.exact;
        row.append(
          excerpt,
          ...categories.map((category) => {
            const button = categoryLabel(category, () => {
              opener = button;
              inspect(id, category.id);
            });
            return button;
          }),
        );
        return [{ start: position.start, row }];
      })
      .sort((a, b) => a.start - b.start);
    list.replaceChildren(...rows.map(({ row }) => row));
    citations.hidden = !rows.length;
    if (shown && !inspect(shown.id, shown.categoryId)) clearInspection();
  }

  let target: CaptureTarget | undefined;
  let request = 0;

  async function refresh() {
    const current = target;
    if (!current) return;
    const id = ++request;
    status.textContent = '';
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (id !== request) return;
      if (tab?.id !== current.tabId || tab.url !== current.url) {
        throw new Error('Documento obsoleto.');
      }
      const result: unknown = await chrome.runtime.sendMessage({
        type: 'highlight.read',
        ...(current.projectId ? { projectId: current.projectId } : {}),
        url: current.url,
        filter: filter.value || null,
      });
      if (id !== request) return;
      if (
        !isRecord(result) ||
        result.kind !== 'highlights' ||
        !Array.isArray(result.entries)
      ) {
        throw new Error('Respuesta de resaltado no válida.');
      }
      const painted: unknown = await chrome.tabs.sendMessage(
        current.tabId,
        {
          type: 'highlight.paint',
          ...(current.projectId ? { projectId: current.projectId } : {}),
          filter: filter.value || null,
          url: current.url,
          entries: result.entries,
        },
        { documentId: current.documentId },
      );
      if (id === request && isRecord(painted) && painted.painted === true)
        showCitations(result.entries);
      if (id === request && (!isRecord(painted) || painted.painted !== true))
        status.textContent = 'No se pudo aplicar el resaltado en esta página.';
      else if (
        id === request &&
        isRecord(painted) &&
        typeof painted.unresolved === 'number' &&
        painted.unresolved > 0
      )
        status.textContent = `${painted.unresolved} fragmento(s) sin ubicar.`;
    } catch {
      if (id === request)
        status.textContent = 'No se pudo aplicar el resaltado en esta página.';
    }
  }

  filter.addEventListener('change', () => void refresh());
  return {
    inspect,
    endPreview() {
      if (shown && !shown.categoryId) clearInspection();
    },
    clear() {
      target = undefined;
      request++;
      filter.disabled = true;
      status.textContent = '';
      clearInspection();
      showCitations([]);
    },
    track(next: CaptureTarget) {
      target = next;
      filter.value = '';
      void refresh();
    },
    update(next: CaptureTarget, codes: readonly CodeAssignment[]) {
      const selected = target === next ? filter.value : '';
      target = next;
      filter.replaceChildren(new Option('Todos los códigos', ''));
      for (const code of codes) filter.add(new Option(code.name, code.id));
      filter.value = codes.some((code) => code.id === selected) ? selected : '';
      filter.disabled = false;
      void refresh();
    },
  };
}
