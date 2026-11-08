import { isRecord } from '../capture-contract';
import { isEvidence } from './evidence-controls';

interface Citation {
  id: string;
  quote: string;
  url: string;
}

const newType = '__new__';

function button(label: string, run: (button: HTMLButtonElement) => void) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', () => run(element));
  return element;
}

function excerpt({ quote, url }: Citation, label?: string) {
  const element = document.createElement('div');
  const text = document.createElement('blockquote');
  const source = document.createElement('small');
  text.textContent = quote;
  source.textContent = url;
  if (label) {
    const heading = document.createElement('strong');
    heading.textContent = label;
    element.append(heading);
  }
  element.append(text, source);
  return element;
}

function readCitation(value: unknown): Citation | undefined {
  if (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.quote === 'string' &&
    isRecord(value.source) &&
    typeof value.source.url === 'string'
  )
    return { id: value.id, quote: value.quote, url: value.source.url };
}

export function mountRelations(root: HTMLElement) {
  function find<T extends HTMLElement = HTMLElement>(id: string) {
    const element = root.querySelector<T>('#relation-' + id);
    if (!element) throw new Error('Falta el control de relación: ' + id);
    return element;
  }
  const heading = find('heading');
  const origin = find('origin');
  const status = find('status');
  const search = find<HTMLFormElement>('search');
  const query = find<HTMLInputElement>('query');
  const searchStatus = find('search-status');
  const results = find('results');
  const save = find<HTMLFormElement>('save');
  const fields = find<HTMLFieldSetElement>('fields');
  const review = find('review');
  const types = find<HTMLSelectElement>('type');
  const newFields = find('new-type');
  const name = find<HTMLInputElement>('type-name');
  const definition = find<HTMLTextAreaElement>('definition');
  const direction = find<HTMLSelectElement>('direction');
  const reverse = find<HTMLButtonElement>('reverse');
  const links = find('links');
  const close = find<HTMLButtonElement>('close');
  let projectId: string | null = null;
  interface Draft {
    projectId: string;
    first: Citation;
    second?: Citation;
    opener: HTMLButtonElement;
    reversed: boolean;
    searchVersion: number;
    loadingTypes?: boolean;
  }
  let draft: Draft | undefined;

  async function send(current: Draft, message: Record<string, unknown>) {
    const response: unknown = await chrome.runtime.sendMessage({
      ...message,
      projectId: current.projectId,
    });
    if (!isRecord(response)) throw new Error('Respuesta inválida.');
    return response;
  }

  function directed() {
    return types.value === newType
      ? direction.value === 'directed'
      : types.selectedOptions[0]?.dataset.direction === 'directed';
  }

  function renderReview() {
    if (!draft?.second) return;
    newFields.hidden = types.value !== newType;
    name.required = !newFields.hidden;
    reverse.hidden = !directed();
    const [from, to] =
      directed() && draft.reversed
        ? [draft.second, draft.first]
        : [draft.first, draft.second];
    review.replaceChildren(
      excerpt(from, directed() ? 'Desde' : 'Primera cita'),
      excerpt(to, directed() ? 'Hacia' : 'Segunda cita'),
    );
  }

  async function loadTypes(current: Draft) {
    if (current.loadingTypes) return;
    current.loadingTypes = true;
    try {
      const result = await send(current, { type: 'relationTypes.list' });
      if (draft !== current) return;
      if (result.kind !== 'relationTypes' || !Array.isArray(result.types))
        throw new Error();
      const options = result.types.flatMap((type: unknown) => {
        if (
          !isRecord(type) ||
          typeof type.id !== 'string' ||
          typeof type.name !== 'string' ||
          (type.direction !== 'directed' && type.direction !== 'symmetric')
        )
          return [];
        const option = new Option(type.name, type.id);
        option.dataset.direction = type.direction;
        return [option];
      });
      types.replaceChildren(
        new Option('Elige un tipo', ''),
        ...options,
        new Option('+ Crear tipo de relación', newType),
      );
      renderReview();
    } catch {
      if (draft === current)
        status.textContent =
          'No se pudieron cargar los tipos. Vuelve a elegir la segunda cita para reintentar.';
    } finally {
      current.loadingTypes = false;
    }
  }

  async function findCitations(current: Draft) {
    const version = ++current.searchVersion;
    const needle = query.value.trim().toLowerCase().normalize('NFC');
    searchStatus.textContent = 'Buscando…';
    results.replaceChildren();
    try {
      const result = await send(current, {
        type: 'evidence.search',
        text: '',
        codeId: null,
        sourceId: null,
      });
      if (draft !== current || current.searchVersion !== version) return;
      if (result.kind !== 'evidence' || !Array.isArray(result.results))
        throw new Error();
      for (const row of result.results.filter(isEvidence)) {
        if (
          row.id === current.first.id ||
          row.url === current.first.url ||
          ![row.quote, row.url].some((text) =>
            text.toLowerCase().normalize('NFC').includes(needle),
          )
        )
          continue;
        const item = document.createElement('li');
        item.append(
          excerpt(row),
          button('Elegir esta cita', () => {
            current.second = row;
            current.reversed = false;
            status.textContent = '';
            save.hidden = false;
            renderReview();
            types.focus();
            if (types.options.length === 1) void loadTypes(current);
          }),
        );
        results.append(item);
      }
      searchStatus.textContent = results.children.length
        ? `${results.children.length} cita(s) de otras fuentes.`
        : 'No hay citas de otras fuentes que coincidan.';
    } catch {
      if (draft === current && current.searchVersion === version)
        searchStatus.textContent =
          'No se pudieron buscar citas. Inténtalo de nuevo.';
    }
  }

  async function listLinks(current: Draft) {
    links.replaceChildren();
    try {
      const result = await send(current, {
        type: 'relations.listByCitation',
        id: current.first.id,
      });
      if (draft !== current) return;
      if (result.kind !== 'relations' || !Array.isArray(result.links))
        throw new Error();
      const list = document.createElement('ul');
      for (const value of result.links as unknown[]) {
        if (
          !isRecord(value) ||
          !isRecord(value.type) ||
          typeof value.type.name !== 'string'
        )
          continue;
        const from = readCitation(value.from);
        const to = readCitation(value.to);
        if (!from || !to) continue;
        const related = from.id === current.first.id ? to : from;
        const label = document.createElement('strong');
        const orientation =
          value.direction === 'symmetric'
            ? 'En ambos sentidos'
            : value.direction === 'outgoing'
              ? 'Desde esta cita'
              : 'Hacia esta cita';
        label.textContent = `${value.type.name} · ${orientation}`;
        const item = document.createElement('li');
        const navigation = document.createElement('p');
        navigation.setAttribute('role', 'status');
        item.append(
          label,
          excerpt(related),
          button('Abrir fuente relacionada', async (open) => {
            open.disabled = true;
            try {
              const result = await send(current, {
                type: 'evidence.open',
                id: related.id,
              });
              navigation.textContent =
                result.kind === 'located'
                  ? 'Cita localizada.'
                  : ['unlocated', 'permission', 'timeout'].includes(
                        String(result.kind),
                      )
                    ? 'Fuente abierta. No se pudo ubicar la cita.'
                    : 'No se pudo abrir la fuente relacionada.';
            } catch {
              navigation.textContent =
                'No se pudo abrir la fuente relacionada.';
            } finally {
              open.disabled = false;
            }
          }),
          navigation,
        );
        list.append(item);
      }
      if (list.children.length) {
        const title = document.createElement('h3');
        title.textContent = 'Vínculos de esta cita';
        links.append(title, list);
      }
    } catch {
      if (draft === current)
        links.textContent = 'No se pudieron consultar los vínculos.';
    }
  }

  function clear(restoreFocus = false) {
    const opener = draft?.opener;
    draft = undefined;
    root.hidden = true;
    if (restoreFocus) opener?.focus();
  }

  function start(first: Citation, opener: HTMLButtonElement) {
    if (!projectId || fields.disabled) return;
    if (draft && !search.hidden) {
      heading.focus();
      return;
    }
    const current: Draft = {
      projectId,
      first,
      opener,
      reversed: false,
      searchVersion: 0,
    };
    draft = current;
    origin.replaceChildren(excerpt(first, 'Cita de partida'));
    status.textContent = '';
    search.reset();
    save.reset();
    types.replaceChildren(new Option('Cargando tipos…', ''));
    save.hidden = true;
    search.hidden = false;
    close.textContent = 'Cancelar';
    root.hidden = false;
    heading.focus();
    void findCitations(current);
    void listLinks(current);
  }

  types.addEventListener('change', renderReview);
  direction.addEventListener('change', renderReview);
  reverse.addEventListener('click', () => {
    if (!draft) return;
    draft.reversed = !draft.reversed;
    renderReview();
  });
  search.addEventListener('submit', (event) => {
    event.preventDefault();
    if (draft && !fields.disabled) void findCitations(draft);
  });
  close.addEventListener('click', () => clear(true));
  save.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = draft;
    if (!current?.second || !types.value || fields.disabled) return;
    const [from, to] =
      directed() && current.reversed
        ? [current.second, current.first]
        : [current.first, current.second];
    const message = {
      fromAnnotationId: from.id,
      toAnnotationId: to.id,
      ...(types.value === newType
        ? {
            type: 'relations.createWithType',
            fields: {
              name: name.value,
              description: definition.value,
              direction: direction.value,
            },
          }
        : { type: 'relations.create', relationTypeId: types.value }),
    };
    fields.disabled = close.disabled = true;
    status.textContent = 'Guardando vínculo…';
    try {
      const result = await send(current, message);
      if (draft !== current) return;
      if (result.kind !== 'relation') throw new Error();
      save.hidden = search.hidden = true;
      close.textContent = 'Cerrar';
      status.textContent = 'Vínculo guardado.';
      heading.focus();
      void listLinks(current);
    } catch {
      if (draft === current)
        status.textContent =
          'No se pudo guardar el vínculo. Revisa el tipo y vuelve a intentarlo.';
    } finally {
      fields.disabled = close.disabled = false;
    }
  });

  return {
    action(citation: Citation) {
      return button('Relacionar con otra cita', (opener) =>
        start(citation, opener),
      );
    },
    setProject(id: string | null) {
      if (projectId !== id) clear();
      projectId = id;
    },
  };
}
