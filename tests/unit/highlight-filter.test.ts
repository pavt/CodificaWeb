// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { createHighlightFilter } from '../../src/panel/highlight-filter';

afterEach(() => vi.unstubAllGlobals());

test('Q05: filtra por código y limita la pintura al documento autorizado', async () => {
  const request = vi
    .fn()
    .mockResolvedValue({ kind: 'highlights', entries: [] });
  const paint = vi.fn().mockResolvedValue({ painted: true });
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: request },
    tabs: {
      sendMessage: paint,
      query: vi
        .fn()
        .mockResolvedValue([{ id: 7, url: 'https://example.test/' }]),
    },
  });
  const filter = document.createElement('select');
  const status = document.createElement('p');
  const controls = createHighlightFilter(filter, status);
  const target = { tabId: 7, documentId: 'doc', url: 'https://example.test/' };
  const codes = [
    {
      id: 'tema',
      name: 'Tema',
      projectId: 'p',
      color: '#FDD835',
      assigned: true,
    },
  ];
  controls.update(target, codes);
  await vi.waitFor(() =>
    expect(paint).toHaveBeenCalledWith(
      7,
      {
        type: 'highlight.paint',
        filter: null,
        url: target.url,
        entries: [],
      },
      { documentId: 'doc' },
    ),
  );
  filter.value = 'tema';
  filter.dispatchEvent(new Event('change'));
  await vi.waitFor(() =>
    expect(request).toHaveBeenLastCalledWith({
      type: 'highlight.read',
      url: target.url,
      filter: 'tema',
    }),
  );
  paint.mockResolvedValueOnce(false);
  controls.update(target, codes);
  await vi.waitFor(() => expect(status.textContent).toContain('No se pudo'));
  expect(filter.value).toBe('tema');
  request.mockResolvedValueOnce({ kind: 'error' });
  filter.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(status.textContent).toContain('No se pudo'));
  controls.clear();
  filter.dispatchEvent(new Event('change'));
  expect(filter.disabled).toBe(true);
  expect(request).toHaveBeenCalledTimes(4);
});

test('Q05: conserva el orden de las citas y limpia el panel al cambiar de documento', async () => {
  document.body.innerHTML =
    '<select></select><p id="status"></p><details id="page-citations" hidden><ol id="page-citation-list"></ol></details>';
  const filter = document.querySelector('select') as HTMLSelectElement;
  const status = document.querySelector('#status') as HTMLElement;
  const citations = document.querySelector('#page-citations') as HTMLElement;
  const target = { tabId: 1, documentId: 'doc', url: 'https://example.test/' };
  const category = { id: 'x', name: '<Contexto>', color: '#BEAED4' };
  const entry = (start: number, exact: string, categories: unknown) => ({
    selectors: { position: { start }, quote: { exact } },
    categories,
  });
  const entries = [
    entry(9, 'B'.repeat(200), [category]),
    null,
    {},
    { selectors: {} },
    { selectors: { quote: {}, position: {} } },
    { selectors: { quote: { exact: 'a' } } },
    { selectors: { quote: { exact: 'a' }, position: {} } },
    entry(7, 'Sin categorías', [
      null,
      {},
      { id: 'x' },
      { id: 'x', name: 'X' },
      { ...category, color: 'red' },
    ]),
    entry(4, 'Sin categorías', null),
    entry(0, 'Primera cita', [category]),
  ];
  const query = vi.fn().mockResolvedValue([{ id: 1, url: target.url }]);
  const read = vi.fn().mockResolvedValue({ kind: 'highlights', entries });
  const paint = vi.fn().mockResolvedValue({ painted: true, unresolved: 1 });
  vi.stubGlobal('chrome', {
    tabs: { query, sendMessage: paint },
    runtime: { sendMessage: read },
  });
  const controller = createHighlightFilter(filter, status);
  controller.track(target);
  await vi.waitFor(() => expect(citations.hidden).toBe(false));
  expect(
    [...citations.querySelectorAll('li p')].map((row) => row.textContent),
  ).toEqual(['Primera cita', 'B'.repeat(180) + '…']);
  expect(citations.querySelector('.citation-category')?.textContent).toBe(
    '<Contexto>',
  );
  expect(status.textContent).toContain('sin ubicar');
  controller.update(target, [
    { ...category, description: '', projectId: 'p', assigned: true },
  ]);
  filter.value = 'x';
  filter.dispatchEvent(new Event('change'));
  await vi.waitFor(() =>
    expect(read).toHaveBeenLastCalledWith(
      expect.objectContaining({ filter: 'x' }),
    ),
  );
  controller.clear();
  expect(citations.hidden).toBe(true);
  expect(citations.querySelector('li')).toBeNull();
  query.mockResolvedValueOnce([{ id: 2, url: target.url }]);
  controller.track(target);
  await vi.waitFor(() => expect(status.textContent).toContain('No se pudo'));
  paint.mockResolvedValueOnce(null);
  controller.track(target);
  await vi.waitFor(() => expect(status.textContent).toContain('No se pudo'));
});
