// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { mountRelations } from '../../src/panel/relation-controls';

const a = { id: 'a', url: 'https://example.test/a', quote: '<b>Uno</b>' };
const b = { id: 'b', url: 'https://example.test/b', quote: 'Dos' };
const sameSource = { ...a, id: 'c', quote: 'Misma fuente' };
const results = [a, b, sameSource].map((citation) => ({
  ...citation,
  sourceId: citation.url,
  codes: [],
  note: null,
}));
const types = [{ id: 'type', name: 'Complementa', direction: 'symmetric' }];
const link = {
  type: types[0],
  direction: 'symmetric',
  from: { ...a, source: { url: a.url } },
  to: { ...b, source: { url: b.url } },
};

afterEach(() => vi.unstubAllGlobals());

function setup(sendMessage: ReturnType<typeof vi.fn>) {
  document.body.innerHTML = readFileSync('src/panel/index.html', 'utf8');
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const root = document.querySelector('#citation-relation') as HTMLElement;
  const controls = mountRelations(root);
  controls.setProject('project');
  const opener = controls.action(a);
  document.body.append(opener);
  opener.click();
  return {
    ...controls,
    root,
    opener,
    find<T extends HTMLElement = HTMLElement>(name: string) {
      return root.querySelector('#relation-' + name) as T;
    },
  };
}

test('Q16: excluye citas de la misma fuente, reutiliza un tipo simétrico y abre la cita vinculada', async () => {
  let saved = false;
  const send = vi.fn(async (message: { type: string }) => {
    switch (message.type) {
      case 'evidence.search':
        return { kind: 'evidence', results };
      case 'relationTypes.list':
        return { kind: 'relationTypes', types };
      case 'relations.listByCitation':
        return { kind: 'relations', links: saved ? [link] : [] };
      case 'relations.create':
        saved = true;
        return { kind: 'relation', link };
      case 'evidence.open':
        return { kind: 'located' };
      default:
        throw new Error();
    }
  });
  const { root, opener, find, hasSavedView, dismissSavedView } = setup(send);
  await vi.waitFor(() => expect(find('results').children).toHaveLength(1));
  dismissSavedView();
  expect(hasSavedView()).toBe(false);
  expect(root.hidden).toBe(false);
  expect(root.textContent).toContain(a.quote);
  expect(root.querySelector('b')).toBeNull();
  find('results').querySelector('button')?.click();
  const type = find<HTMLSelectElement>('type');
  await vi.waitFor(() => expect(type.options).toHaveLength(3));
  type.value = 'type';
  type.dispatchEvent(new Event('change'));
  find<HTMLButtonElement>('review-button').click();
  expect(find('step').textContent).toBe('Paso 4 de 4');
  expect(find('summary').textContent).toContain('Cita A ↔ Cita B');
  expect(find('reverse').hidden).toBe(true);
  find<HTMLFormElement>('save').requestSubmit();
  expect(send).toHaveBeenCalledWith({
    type: 'relations.create',
    projectId: 'project',
    fromAnnotationId: 'a',
    toAnnotationId: 'b',
    relationTypeId: 'type',
  });
  await vi.waitFor(() =>
    expect(find('links').textContent).toContain(
      'Complementa · En ambos sentidos',
    ),
  );
  find('links').querySelector('button')?.click();
  expect(send).toHaveBeenLastCalledWith({
    type: 'evidence.open',
    projectId: 'project',
    id: 'b',
  });
  await vi.waitFor(() =>
    expect(find('links').textContent).toContain('Cita localizada.'),
  );
  expect(hasSavedView()).toBe(true);
  dismissSavedView();
  expect(root.hidden).toBe(true);
  expect(document.activeElement).not.toBe(opener);
});

test('Q16: un cambio de proyecto descarta la cita y bloquea resultados pendientes del proyecto anterior', async () => {
  let finishSearch!: (result: unknown) => void;
  const send = vi.fn((message: { type: string }) =>
    message.type === 'evidence.search'
      ? new Promise((resolve) => {
          finishSearch = resolve;
        })
      : Promise.resolve({ kind: 'relations', links: [] }),
  );
  const { root, setProject, find } = setup(send);
  expect(root.hidden).toBe(false);
  setProject('other');
  finishSearch({ kind: 'evidence', results });
  await Promise.resolve();
  await Promise.resolve();
  expect(root.hidden).toBe(true);
  expect(find('results').children).toHaveLength(0);
});

test('Q16: conserva el borrador al fallar el guardado de un tipo nuevo dirigido', async () => {
  let attempts = 0;
  const send = vi.fn(async (message: { type: string }) => {
    switch (message.type) {
      case 'evidence.search':
        return { kind: 'evidence', results: [...results, null] };
      case 'relationTypes.list':
        return {
          kind: 'relationTypes',
          types: [null, { id: 'bad', name: 'Bad', direction: 'bad' }],
        };
      case 'relations.listByCitation':
        return { kind: 'relations', links: [] };
      case 'relations.createWithType':
        return ++attempts === 1
          ? { kind: 'error' }
          : { kind: 'relation', link };
      default:
        throw new Error();
    }
  });
  const { root, find, action } = setup(send);
  const query = find<HTMLInputElement>('query');
  query.value = 'ausente';
  find<HTMLFormElement>('search').requestSubmit();
  await vi.waitFor(() =>
    expect(find('search-status').textContent).toContain('No hay citas'),
  );
  query.value = 'DOS';
  find<HTMLFormElement>('search').requestSubmit();
  await vi.waitFor(() => expect(find('results').children).toHaveLength(1));
  find('results').querySelector('button')?.click();
  const type = find<HTMLSelectElement>('type');
  await vi.waitFor(() => expect(type.options).toHaveLength(2));
  type.value = '__new__';
  type.dispatchEvent(new Event('change'));
  const name = find<HTMLInputElement>('type-name');
  name.value = 'Responde';
  find<HTMLTextAreaElement>('definition').value = 'Segunda fuente';
  find<HTMLButtonElement>('review-button').click();
  find('reverse').click();
  expect(find('review').textContent).toMatch(/Cita A.*Dos.*Cita B.*<b>Uno/);
  action(b).click();
  expect(find('origin').textContent).toContain(a.quote);
  find<HTMLFormElement>('save').requestSubmit();
  await vi.waitFor(() =>
    expect(find('status').textContent).toContain('No se pudo guardar'),
  );
  expect(name.value).toBe('Responde');
  find<HTMLFormElement>('save').requestSubmit();
  await vi.waitFor(() =>
    expect(find('status').textContent).toBe('Vínculo guardado.'),
  );
  expect(
    send.mock.calls.filter(
      ([request]) => request.type === 'relations.createWithType',
    ),
  ).toEqual(
    Array.from({ length: 2 }, () => [
      {
        type: 'relations.createWithType',
        projectId: 'project',
        fromAnnotationId: 'b',
        toAnnotationId: 'a',
        fields: {
          name: 'Responde',
          description: 'Segunda fuente',
          direction: 'directed',
        },
      },
    ]),
  );
  expect(root.hidden).toBe(false);
});

test('Q16: un error al cargar citas o tipos se puede reintentar en el panel', async () => {
  const search = vi
    .fn()
    .mockResolvedValueOnce({ kind: 'error' })
    .mockResolvedValue({ kind: 'evidence', results });
  const loadTypes = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValue({ kind: 'relationTypes', types });
  const send = vi.fn(async (message: { type: string }) => {
    if (message.type === 'evidence.search') return search();
    if (message.type === 'relationTypes.list') return loadTypes();
    return { kind: 'error' };
  });
  const { find } = setup(send);
  await vi.waitFor(() =>
    expect(find('search-status').textContent).toContain(
      'No se pudieron buscar',
    ),
  );
  expect(find('links').textContent).toContain('No se pudieron consultar');
  find<HTMLFormElement>('search').requestSubmit();
  await vi.waitFor(() => expect(find('results').children).toHaveLength(1));
  const choose = find('results').querySelector('button');
  choose?.click();
  await vi.waitFor(() =>
    expect(find('status').textContent).toContain('No se pudieron cargar'),
  );
  choose?.click();
  await vi.waitFor(() =>
    expect(find<HTMLSelectElement>('type').options).toHaveLength(3),
  );
});

test('Q16: muestra tarjetas compactas, limita los resultados iniciales y conserva el tipo al volver a editar', async () => {
  const longUrl = 'https://example.test/informe?tracking=parametro-largo';
  const legacyUrl = 'https://example.test/busqueda?tracking=secreto#largo';
  const page = Array.from({ length: 7 }, (_, index) => ({
    ...results[1],
    id: String(index),
    url: index === 0 ? legacyUrl : longUrl,
    quote: `Cita ${index}`,
    codes: [{ id: 'movilidad', name: 'Movilidad', color: '#7FC97F' }],
    note: 'Registro de terreno',
    context: { prefix: 'Esperamos el bus. ', suffix: ' describe la espera.' },
  }));
  const send = vi.fn(async (message: { type: string }) => {
    if (message.type === 'evidence.search')
      return {
        kind: 'evidence',
        sources: [
          { url: a.url, title: 'Entrevista' },
          { url: longUrl, title: 'Informe municipal' },
          { url: legacyUrl, title: legacyUrl },
          null,
        ],
        results: page,
      };
    if (message.type === 'relationTypes.list')
      return {
        kind: 'relationTypes',
        types: [{ ...types[0], description: 'Completa la evidencia' }],
      };
    return { kind: 'relations', links: [] };
  });
  const { root, find } = setup(send);
  const resultList = find('results');
  await vi.waitFor(() =>
    expect(resultList.querySelectorAll('blockquote')).toHaveLength(5),
  );
  expect(find('origin').textContent).toContain('Entrevista');
  expect(resultList.textContent).not.toContain('tracking=');
  const firstCard = resultList.querySelector('li');
  expect(firstCard?.textContent).toMatch(/Cita 0.*example.test\/busqueda/);
  expect(firstCard?.textContent).toContain('Movilidad');
  const badge = firstCard?.querySelector('.citation-category');
  expect(badge?.textContent).toBe('Movilidad');
  expect(
    badge?.querySelector<HTMLElement>('.citation-swatch')?.style
      .backgroundColor,
  ).toBe('rgb(127, 201, 127)');
  expect(
    firstCard?.querySelector('.relation-exact blockquote')?.textContent,
  ).toBe('«Cita 0»');
  const context = firstCard?.querySelector('details');
  expect(context?.open).toBe(false);
  expect(context?.querySelector('mark')?.textContent).toBe('Cita 0');
  expect(context?.textContent).toContain('Esperamos el bus');
  expect(firstCard?.textContent).toContain('Registro de terreno');
  const more = [...resultList.querySelectorAll('button')].find(
    (button) => button.textContent === 'Mostrar más citas',
  );
  more?.click();
  expect(resultList.querySelectorAll('blockquote')).toHaveLength(7);
  expect(document.activeElement?.closest('li')?.textContent).toContain(
    'Cita 5',
  );
  const query = find<HTMLInputElement>('query');
  query.value = 'Municipal';
  query.dispatchEvent(new Event('input'));
  await vi.waitFor(() =>
    expect(resultList.querySelectorAll('blockquote')).toHaveLength(5),
  );
  resultList.querySelector('button')?.click();
  expect(find('search').hidden).toBe(true);
  const type = find<HTMLSelectElement>('type');
  await vi.waitFor(() => expect(type.options).toHaveLength(3));
  type.value = 'type';
  type.dispatchEvent(new Event('change'));
  find<HTMLButtonElement>('review-button').click();
  expect(find('summary').textContent).toContain('Completa la evidencia');
  find('edit').click();
  expect(type.value).toBe('type');
  expect(find('confirm').hidden).toBe(true);
  find('change').click();
  expect(find('step').textContent).toBe('Paso 2 de 4');
  expect(root.hidden).toBe(false);
});
