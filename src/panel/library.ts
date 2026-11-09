import { isRecord } from '../capture-contract';
import type { EvidenceResult } from '../domain/evidence-search';
import type { ProjectDocument } from '../domain/project-document';
import { isEvidence } from './evidence-controls';

function isDocument(value: unknown): value is ProjectDocument {
  return (
    isRecord(value) &&
    value.format === 'web' &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.url === 'string' &&
    /^https?:\/\//.test(value.url) &&
    URL.canParse(value.url)
  );
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function action(label: string, run: () => void) {
  const button = element('button', label);
  button.type = 'button';
  button.addEventListener('click', run);
  return button;
}

function title(source: ProjectDocument) {
  const url = new URL(source.url);
  return source.title && source.title !== source.url
    ? source.title
    : url.hostname + url.pathname;
}

export function mountLibrary(root: HTMLElement) {
  const find = <T extends HTMLElement>(id: string) =>
    root.querySelector<T>(id) as T;
  const query = find<HTMLInputElement>('#document-query');
  const list = find('#document-list');
  const detail = find('#document-detail');
  const heading = find('#document-title');
  const sourceLink = find<HTMLAnchorElement>('#document-original');
  const quotes = find('#document-quotes');
  const status = find('#library-status');
  const code = find<HTMLSelectElement>('#document-code');
  let projectId: string | null = null;
  let sources: ProjectDocument[] = [];
  const rowsBySource = new Map<string, EvidenceResult[]>();
  let selected: string | undefined;
  let revision = 0;

  for (const button of root.querySelectorAll<HTMLButtonElement>(
    '[data-view]',
  )) {
    button.addEventListener('click', () => {
      for (const view of root.querySelectorAll<HTMLElement>('[data-section]'))
        view.hidden = view.dataset.section !== button.dataset.view;
      for (const item of root.querySelectorAll('[data-view]'))
        item.setAttribute('aria-pressed', String(item === button));
    });
  }

  function showLinks(result: unknown, cards: Map<string, HTMLElement>) {
    if (!isRecord(result) || !Array.isArray(result.sources)) return;
    for (const group of result.sources as unknown[]) {
      if (
        !isRecord(group) ||
        !isRecord(group.source) ||
        !Array.isArray(group.links)
      )
        continue;
      const { id: relatedId } = group.source;
      const related = sources.find(({ id }) => id === relatedId);
      if (!related) continue;
      for (const link of group.links as unknown[]) {
        if (
          !isRecord(link) ||
          !isRecord(link.type) ||
          typeof link.type.name !== 'string'
        )
          continue;
        const endpoint = link.direction === 'incoming' ? link.to : link.from;
        const alternate = link.direction === 'symmetric' ? link.to : undefined;
        for (const candidate of [endpoint, alternate]) {
          if (!isRecord(candidate) || typeof candidate.id !== 'string')
            continue;
          cards.get(candidate.id)?.append(
            action(`${link.type.name} · ${title(related)}`, () => {
              query.value = code.value = '';
              render(related.id);
              heading.focus();
            }),
          );
        }
      }
    }
  }

  function render(preferred = selected) {
    const request = ++revision;
    const term = query.value.trim().normalize('NFC').toLowerCase();
    const matches = (value: string) =>
      value.normalize('NFC').toLowerCase().includes(term);
    const documents = sources.flatMap((source) => {
      const citations = (rowsBySource.get(source.id) ?? []).filter(
        (row) =>
          (!code.value ||
            row.codes.some((category) => category.id === code.value)) &&
          (matches(title(source)) ||
            matches(source.url) ||
            matches(row.quote) ||
            matches(row.note ?? '')),
      );
      return citations.length ||
        (!code.value && (matches(title(source)) || matches(source.url)))
        ? [{ source, citations }]
        : [];
    });
    const current =
      documents.find(({ source }) => source.id === preferred) ?? documents[0];
    selected = current?.source.id;
    list.replaceChildren(
      ...documents.map(({ source }) => {
        const button = action(title(source), () => {
          render(source.id);
          heading.focus();
        });
        button.setAttribute('aria-pressed', String(source.id === selected));
        return button;
      }),
    );
    detail.hidden = !current;
    status.textContent = current ? '' : 'No hay documentos que mostrar.';
    if (!current) return;
    heading.textContent = title(current.source);
    sourceLink.href = current.source.url;
    const cards = new Map<string, HTMLElement>();
    quotes.replaceChildren(
      ...current.citations.map((row) => {
        const card = element('article', '');
        card.className = 'card';
        cards.set(row.id, card);
        card.append(element('blockquote', row.quote));
        const labels = element('div', '');
        for (const category of row.codes) {
          const label = element('span', category.name);
          label.className = 'document-category';
          label.style.setProperty('--document-category-color', category.color);
          labels.append(label);
        }
        card.append(labels);
        if (row.note) card.append(element('p', row.note));
        card.append(
          action('Abrir cita en la página', () => {
            void chrome.runtime
              .sendMessage({ type: 'evidence.open', projectId, id: row.id })
              .then((reply: unknown) => {
                if (request !== revision) return;
                status.textContent =
                  isRecord(reply) && reply.kind === 'located'
                    ? 'Cita localizada.'
                    : 'No se pudo confirmar la ubicación de la cita.';
              })
              .catch(() => {
                if (request === revision)
                  status.textContent = 'No se pudo abrir la cita.';
              });
          }),
        );
        return card;
      }),
    );
    void chrome.runtime
      .sendMessage({ type: 'relations.listBySource', projectId, id: selected })
      .then((result: unknown) => {
        if (request === revision) showLinks(result, cards);
      })
      .catch(() => {
        if (request === revision)
          status.textContent = 'No se pudieron consultar los vínculos.';
      });
  }

  query.addEventListener('input', () => render());
  code.addEventListener('change', () => render());
  return async (id: string | null) => {
    if (projectId !== id) {
      query.value = '';
      selected = undefined;
    }
    const previousCode = projectId === id ? code.value : '';
    projectId = id;
    const request = ++revision;
    sources = [];
    rowsBySource.clear();
    list.replaceChildren();
    detail.hidden = true;
    status.textContent = id
      ? 'Cargando documentos…'
      : 'Selecciona un proyecto en Ajustes.';
    query.disabled = code.disabled = true;
    code.replaceChildren(new Option('Todas las categorías', ''));
    if (!id) return;
    try {
      const result: unknown = await chrome.runtime.sendMessage({
        type: 'evidence.search',
        projectId: id,
        text: '',
        codeId: null,
        sourceId: null,
      });
      if (request !== revision) return;
      if (
        !isRecord(result) ||
        result.kind !== 'evidence' ||
        !Array.isArray(result.sources) ||
        !Array.isArray(result.results)
      )
        throw new Error('Biblioteca no disponible');
      sources = result.sources.filter(isDocument);
      const rows = result.results.filter(isEvidence);
      for (const row of rows) {
        const group = rowsBySource.get(row.sourceId);
        if (group) group.push(row);
        else rowsBySource.set(row.sourceId, [row]);
      }
      const categories = new Map(
        rows.flatMap((row) =>
          row.codes.map((category) => [category.id, category.name] as const),
        ),
      );
      for (const [value, name] of categories) code.add(new Option(name, value));
      if (categories.has(previousCode)) code.value = previousCode;
      query.disabled = code.disabled = false;
      render();
    } catch {
      if (request === revision)
        status.textContent = 'No se pudieron cargar los documentos.';
    }
  };
}
