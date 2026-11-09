// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { mountLibrary } from '../../src/panel/library';

const html = readFileSync('src/panel/index.html', 'utf8');
const a = {
  id: 'a',
  format: 'web',
  title: 'Movilidad',
  url: 'https://example.test/a',
};
const b = { ...a, id: 'b', title: '', url: 'https://example.test/b' };
const category = { id: 'c', name: 'Acceso', color: '#7fc97f' };
const q = {
  ...a,
  id: 'q',
  sourceId: 'a',
  quote: 'Una rampa',
  note: 'Nota de campo',
  codes: [category],
};
const r = {
  ...q,
  id: 'r',
  sourceId: 'b',
  quote: 'Otra vía',
  note: null,
  codes: [],
};
const type = { name: 'Apoya' };

function setup() {
  document.body.innerHTML = html;
  const find = <T extends HTMLElement = HTMLElement>(id: string) => {
    const node = document.querySelector<T>(id);
    if (!node) throw new Error(`Falta el elemento ${id}`);
    return node;
  };
  const send = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
  const load = mountLibrary(find('#project-library'));
  return { find, send, load };
}

afterEach(() => vi.unstubAllGlobals());

test('Q17: filtra documentos, presenta sus citas y sigue sus vínculos en ambas direcciones', async () => {
  const { find, send, load } = setup();
  send.mockImplementation(async ({ type: message, id }) => {
    if (message === 'evidence.search')
      return {
        kind: 'evidence',
        sources: [
          null,
          {},
          { ...a, id: 1 },
          { ...a, title: null },
          { ...a, url: null },
          { ...a, url: 'file:///a' },
          { ...a, url: 'https://[' },
          a,
          b,
        ],
        results: [null, q, r],
      };
    if (message === 'evidence.open') return { kind: 'located' };
    return {
      sources: [
        null,
        {},
        { source: b },
        { source: { id: 'missing' }, links: [] },
        {
          source: id === 'a' ? b : a,
          links: [
            null,
            {},
            { type: { name: false } },
            { type },
            { type, from: { id: false } },
            {
              type,
              direction: id === 'a' ? 'outgoing' : 'incoming',
              from: q,
              to: r,
            },
            {
              type: { name: 'Coincide' },
              direction: 'symmetric',
              from: q,
              to: r,
            },
          ],
        },
      ],
    };
  });
  await load('project');
  expect(find('#document-title').textContent).toBe('Movilidad');
  expect(find('#document-quotes blockquote').textContent).toBe('Una rampa');
  expect(
    find('.document-category').style.getPropertyValue(
      '--document-category-color',
    ),
  ).toBe(category.color);
  expect(find('#document-quotes').textContent).toContain('Nota de campo');
  expect(find<HTMLAnchorElement>('#document-original').href).toBe(a.url);
  find('#document-quotes button').click();
  await vi.waitFor(() =>
    expect(find('#library-status').textContent).toBe('Cita localizada.'),
  );
  find<HTMLButtonElement>('#document-quotes button:nth-last-child(2)').click();
  expect(find('#document-quotes blockquote').textContent).toBe('Otra vía');
  await vi.waitFor(() =>
    expect(find('#document-quotes').textContent).toContain(
      'Coincide · Movilidad',
    ),
  );

  const code = find<HTMLSelectElement>('#document-code');
  code.value = 'c';
  code.dispatchEvent(new Event('change'));
  expect(find('#document-list').textContent).toBe('Movilidad');
  code.value = '';
  const query = find<HTMLInputElement>('#document-query');
  for (const [value, expected] of [
    ['example.test/b', 'Otra vía'],
    ['NOTA DE CAMPO', 'Una rampa'],
    ['otra vía', 'Otra vía'],
  ] as const) {
    query.value = value;
    query.dispatchEvent(new Event('input'));
    expect(find('#document-quotes blockquote').textContent).toBe(expected);
  }
  query.value = 'sin resultados';
  query.dispatchEvent(new Event('input'));
  expect(find('#document-detail').hidden).toBe(true);
  query.value = '';
  query.dispatchEvent(new Event('input'));
  find('#document-list button:last-child').click();
  expect(find('#document-title').textContent).toBe('example.test/b');
  find('[data-view="categories"]').click();
  expect(find('[data-section="categories"]').hidden).toBe(false);
  expect(find('[data-section="documents"]').hidden).toBe(true);
});

test('Q17: descarta respuestas de un proyecto anterior y comunica fallos', async () => {
  const { find, send, load } = setup();
  const status = find('#library-status');
  let resolvePrevious: (value: unknown) => void = () => {};
  const pending = new Promise((resolve) => {
    resolvePrevious = resolve;
  });
  send.mockReturnValueOnce(pending);
  const previous = load('previous');
  await load(null);
  resolvePrevious({ kind: 'evidence', sources: [a], results: [q] });
  await previous;
  expect(status.textContent).toBe('Selecciona un proyecto en Ajustes.');
  for (const invalid of [
    null,
    {},
    { kind: 'evidence' },
    { kind: 'evidence', sources: [] },
  ]) {
    send.mockResolvedValueOnce(invalid);
    await load('project');
    expect(status.textContent).toBe('No se pudieron cargar los documentos.');
  }
  send.mockImplementation(async ({ type: message }) => {
    if (message === 'evidence.search')
      return { kind: 'evidence', sources: [a], results: [q] };
    throw Error('sin servicio');
  });
  await load('project');
  await vi.waitFor(() =>
    expect(status.textContent).toBe('No se pudieron consultar los vínculos.'),
  );
  find('#document-quotes button').click();
  await vi.waitFor(() =>
    expect(status.textContent).toBe('No se pudo abrir la cita.'),
  );
  send.mockResolvedValueOnce({ kind: 'unlocated' });
  find('#document-quotes button').click();
  await vi.waitFor(() =>
    expect(status.textContent).toBe(
      'No se pudo confirmar la ubicación de la cita.',
    ),
  );
  send.mockRejectedValueOnce(new Error('proyecto anterior'));
  await Promise.all([load('previous'), load(null)]);
  expect(status.textContent).toBe('Selecciona un proyecto en Ajustes.');
});
