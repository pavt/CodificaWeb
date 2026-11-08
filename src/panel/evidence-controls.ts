import { isRecord } from '../capture-contract';
import type { EvidenceResult } from '../domain/evidence-search';

function isSource(value: unknown): value is { id: string; url: string } {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.url === 'string'
  );
}

function isCode(value: unknown): value is { id: string; name: string } {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string'
  );
}

function isEvidence(value: unknown): value is EvidenceResult {
  return (
    isSource(value) &&
    'sourceId' in value &&
    typeof value.sourceId === 'string' &&
    'quote' in value &&
    typeof value.quote === 'string' &&
    'note' in value &&
    (value.note === null || typeof value.note === 'string') &&
    'codes' in value &&
    Array.isArray(value.codes) &&
    value.codes.every(isCode)
  );
}

function fillOptions(
  select: HTMLSelectElement,
  placeholder: string,
  items: HTMLOptionElement[],
) {
  const previous = select.value;
  select.replaceChildren(new Option(placeholder, ''), ...items);
  select.value = items.some(({ value }) => value === previous) ? previous : '';
}

export function mountEvidence(root: HTMLFormElement) {
  const fields = root.querySelector('fieldset') as HTMLFieldSetElement;
  const query = root.querySelector('#evidence-text') as HTMLInputElement;
  const code = root.querySelector('#evidence-code') as HTMLSelectElement;
  const source = root.querySelector('#evidence-source') as HTMLSelectElement;
  const status = root.querySelector('#evidence-status') as HTMLElement;
  const list = root.querySelector('#evidence-results') as HTMLElement;
  let projectId: string | null = null;
  let revision = 0;

  async function search() {
    if (!projectId || (details && !details.open)) return;
    const request = ++revision;
    list.replaceChildren();
    status.textContent = 'Buscando…';
    const codeId = code.value || null;
    const sourceId = source.value || null;
    try {
      const result: unknown = await chrome.runtime.sendMessage({
        type: 'evidence.search',
        projectId,
        text: query.value,
        codeId,
        sourceId,
      });
      if (request !== revision) return;
      if (
        !isRecord(result) ||
        result.kind !== 'evidence' ||
        !Array.isArray(result.sources) ||
        !result.sources.every(isSource) ||
        !Array.isArray(result.codes) ||
        !result.codes.every(isCode) ||
        !Array.isArray(result.results) ||
        !result.results.every(isEvidence)
      ) {
        throw new Error('Respuesta de búsqueda no válida.');
      }
      fillOptions(
        code,
        'Todos los códigos',
        result.codes.map(({ id, name }) => new Option(name, id)),
      );
      fillOptions(
        source,
        'Todas las fuentes',
        result.sources.map(({ id, url }) => new Option(url, id)),
      );
      if ((codeId && !code.value) || (sourceId && !source.value)) {
        void search();
        return;
      }
      for (const row of result.results) {
        const item = document.createElement('li');
        const quote = document.createElement('blockquote');
        quote.textContent = row.quote;
        const location = document.createElement('p');
        location.textContent = row.url;
        const labels = document.createElement('p');
        labels.textContent =
          row.codes.map(({ name }) => name).join(', ') || 'Sin código';
        item.append(quote, location, labels);
        if (row.note !== null) {
          const note = document.createElement('p');
          note.textContent = row.note;
          item.append(note);
        }
        list.append(item);
      }
      status.textContent = result.results.length
        ? `${result.results.length} evidencia(s)`
        : 'Sin resultados.';
    } catch {
      if (request === revision)
        status.textContent = 'No se pudo consultar la evidencia.';
    }
  }

  const details = root.closest('details');
  details?.addEventListener('toggle', () => {
    if (details.open) void search();
  });
  root.addEventListener('submit', (event) => {
    event.preventDefault();
    void search();
  });
  return (id: string | null) => {
    if (projectId !== id) {
      revision++;
      projectId = id;
      root.reset();
      list.replaceChildren();
      fillOptions(code, 'Todos los códigos', []);
      fillOptions(source, 'Todas las fuentes', []);
      status.textContent = '';
      fields.disabled = !id;
    }
    void search();
  };
}
