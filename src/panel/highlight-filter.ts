import {
  categoryLabel,
  readHighlightCategories,
} from '../highlight-categories';
import { isRecord } from '../capture-contract';
import type { CaptureTarget } from '../capture-contract';
import type { CodeAssignment } from '../domain/codings';

export function createHighlightFilter(
  filter: HTMLSelectElement,
  status: HTMLElement,
) {
  const citations = document.getElementById('page-citations');
  const list = document.getElementById('page-citation-list');

  function showCitations(entries: unknown[]) {
    if (!citations || !list) return;
    const rows = entries
      .flatMap((entry) => {
        if (!isRecord(entry) || !isRecord(entry.selectors)) return [];
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
        const row = document.createElement('li');
        const excerpt = document.createElement('p');
        excerpt.textContent =
          quote.exact.length > 180
            ? quote.exact.slice(0, 180) + '…'
            : quote.exact;
        row.append(excerpt, ...categories.map(categoryLabel));
        return [{ start: position.start, row }];
      })
      .sort((a, b) => a.start - b.start);
    list.replaceChildren(...rows.map(({ row }) => row));
    citations.hidden = !rows.length;
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
    clear() {
      target = undefined;
      request++;
      filter.disabled = true;
      status.textContent = '';
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
