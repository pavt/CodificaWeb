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
