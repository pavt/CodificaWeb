import { isRecord } from '../capture-contract';
import { isEvidence } from './evidence-controls';

interface Citation {
  id: string;
  quote: string;
  url: string;
  title?: string;
  codes?: readonly { name: string }[];
  note?: string | null;
  context?: string;
}

const newType = '__new__';

function button(label: string, run: (button: HTMLButtonElement) => void) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', () => run(element));
  return element;
}

function sourceLabel(url: string) {
  const address = new URL(url);
  return address.hostname + (address.pathname === '/' ? '' : address.pathname);
}

function excerpt(
  { quote, url, title, codes, note, context }: Citation,
  label?: string,
) {
  const element = document.createElement('div');
  element.className = 'relation-quote';
  const text = document.createElement('blockquote');
  const source = document.createElement('small');
  source.className = 'relation-source';
  const compact = sourceLabel(url);
  const titleText = title?.trim();
  text.textContent = `«${quote}»`;
  source.textContent =
    titleText && !URL.canParse(titleText) ? titleText : compact;
  source.title = compact;
  if (label) {
    const heading = document.createElement('small');
    heading.textContent = label;
    element.append(heading);
  }
  element.append(text, source);
  const metadata = [
    codes?.map(({ name }) => name).join(' · '),
    typeof context === 'string' &&
    quote.length < 80 &&
    context.trim() !== quote.trim()
      ? context
      : '',
    note,
  ];
  for (const value of metadata) {
    if (!value) continue;
    const detail = document.createElement('p');
    detail.className = 'relation-context';
    detail.textContent = value;
    element.append(detail);
  }
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
    return {
      id: value.id,
      quote: value.quote,
      url: value.source.url,
      ...(typeof value.source.title === 'string'
        ? { title: value.source.title }
        : {}),
    };
}

export function mountRelations(root: HTMLElement) {
  function find<T extends HTMLElement = HTMLElement>(id: string) {
    const element = root.querySelector<T>('#relation-' + id);
    if (!element) throw new Error('Falta el control de relación: ' + id);
    return element;
  }
  const heading = find('heading');
  const step = find('step');
  const origin = find('origin');
  const editor = find('editor');
  const confirm = find('confirm');
  const confirmActions = find('confirm-actions');
  const summary = find('summary');
  const submit = find('submit');
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
    stage: 'search' | 'type' | 'review' | 'saved';
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
    const isDirected = directed();
    reverse.hidden = !isDirected;
    const [from, to] =
      isDirected && draft.reversed
        ? [draft.second, draft.first]
        : [draft.first, draft.second];
    review.replaceChildren(
      excerpt(from, 'Cita A · Origen'),
      excerpt(to, 'Cita B · Destino'),
    );
    const label = document.createElement('small');
    label.textContent = 'Tipo de relación';
    const typeName = document.createElement('strong');
    typeName.textContent =
      types.value === newType
        ? name.value.trim()
        : (types.selectedOptions[0]?.text ?? '');
    const sentence = document.createElement('p');
    sentence.textContent = isDirected ? 'Cita A → Cita B' : 'Cita A ↔ Cita B';
    const description = document.createElement('small');
    description.textContent =
      types.value === newType
        ? definition.value
        : (types.selectedOptions[0]?.dataset.description ?? '');
    summary.replaceChildren(label, typeName, sentence, description);
  }

  function showStage(current: Draft, stage: Draft['stage']) {
    current.stage = stage;
    step.textContent = {
      search: 'Paso 2 de 4',
      type: 'Paso 3 de 4',
      review: 'Paso 4 de 4',
      saved: 'Guardada',
    }[stage];
    origin.hidden = search.hidden = stage !== 'search';
    save.hidden = stage === 'search';
    editor.hidden = stage !== 'type';
    confirm.hidden = stage === 'search' || stage === 'type';
    confirmActions.hidden = stage === 'saved';
    links.hidden = stage === 'type' || stage === 'review';
    renderReview();
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
        if (typeof type.description === 'string')
          option.dataset.description = type.description;
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
      const titles = new Map<string, string>();
      if (Array.isArray(result.sources)) {
        for (const source of result.sources as unknown[]) {
          if (
            isRecord(source) &&
            typeof source.url === 'string' &&
            typeof source.title === 'string'
          )
            titles.set(source.url, source.title);
        }
      }
      const rows = result.results.filter(isEvidence);
      const originRow = rows.find((row) => row.id === current.first.id);
      current.first = {
        ...current.first,
        ...originRow,
        title: titles.get(current.first.url) ?? current.first.url,
      };
      origin.replaceChildren(excerpt(current.first, 'Cita A · Origen'));
      const matches = rows.filter(
        (row) =>
          row.id !== current.first.id &&
          row.url !== current.first.url &&
          [
            row.quote,
            row.url,
            titles.get(row.url) ?? '',
            row.note ?? '',
            ...row.codes.map(({ name }) => name),
          ].some((text) =>
            text.toLowerCase().normalize('NFC').includes(needle),
          ),
      );
      let shown = 0;
      const more = button('Mostrar más citas', () => appendPage());
      function appendPage() {
        const page = matches.slice(shown, shown + 5);
        const wasPaging = shown > 0;
        for (const row of page) {
          const rowTitle = titles.get(row.url);
          const citation = rowTitle ? { ...row, title: rowTitle } : row;
          const item = document.createElement('li');
          const card = excerpt(citation, 'Cita guardada');
          card.append(
            button('Elegir cita', () => {
              current.second = citation;
              current.reversed = false;
              status.textContent = '';
              showStage(current, 'type');
              types.focus();
              if (types.options.length === 1) void loadTypes(current);
            }),
          );
          item.append(card);
          results.insertBefore(
            item,
            moreRow.parentElement === results ? moreRow : null,
          );
        }
        shown += page.length;
        moreRow.hidden = shown >= matches.length;
        if (wasPaging)
          results.children[shown - page.length]
            ?.querySelector('button')
            ?.focus();
      }
      const moreRow = document.createElement('li');
      moreRow.append(more);
      if (matches.length > 5) results.append(moreRow);
      appendPage();
      searchStatus.textContent = matches.length
        ? `${matches.length} ${matches.length === 1 ? 'cita disponible' : 'citas disponibles'}`
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
    if (draft && draft.stage !== 'saved') {
      heading.focus();
      return;
    }
    const current: Draft = {
      projectId,
      first,
      opener,
      reversed: false,
      searchVersion: 0,
      stage: 'search',
    };
    draft = current;
    origin.replaceChildren(excerpt(first, 'Cita A · Origen'));
    status.textContent = '';
    search.reset();
    save.reset();
    types.replaceChildren(new Option('Cargando tipos…', ''));
    showStage(current, 'search');
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
  let searchTimer: ReturnType<typeof setTimeout>;
  query.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const current = draft;
    if (!current) return;
    current.searchVersion++;
    searchTimer = setTimeout(() => {
      if (draft === current && current.stage === 'search')
        void findCitations(current);
    }, 180);
  });
  find('change').addEventListener('click', () => {
    if (!draft) return;
    showStage(draft, 'search');
    query.focus();
  });
  find('edit').addEventListener('click', () => {
    if (!draft) return;
    status.textContent = '';
    showStage(draft, 'type');
    types.focus();
  });
  close.addEventListener('click', () => clear(true));
  save.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = draft;
    if (!current?.second || !types.value || fields.disabled) return;
    if (current.stage === 'type') {
      if (types.value === newType && !name.value.trim()) {
        name.value = '';
        name.reportValidity();
        return;
      }
      showStage(current, 'review');
      submit.focus();
      return;
    }
    if (current.stage !== 'review') return;
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
              name: name.value.trim(),
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
      showStage(current, 'saved');
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
