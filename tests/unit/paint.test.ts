// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createPainter } from '../../src/content/paint';

const registry = new Map<string, Set<Range>>();
const url = location.href;
const entry = {
  id: 'a',
  color: '#FDD835',
  selectors: {
    position: { start: 0, end: 4 },
    quote: { exact: 'abcd', prefix: '', suffix: 'ef' },
  },
};

beforeEach(() => {
  registry.clear();
  document.body.innerHTML =
    '<strong>ab</strong><span hidden>oculto</span><em>cdef</em>';
  document.adoptedStyleSheets = [];
  vi.stubGlobal('CSS', { highlights: registry });
  vi.stubGlobal('Highlight', Set);
});
afterEach(() => vi.unstubAllGlobals());

test('Q05: pinta nodos admitidos, respeta otros resaltados y limpia tras cambios del DOM', async () => {
  const other = new Set<Range>();
  registry.set('otra-app', other);
  const initial = document.body.innerHTML;
  const painter = createPainter();
  expect(
    painter.paint([
      entry,
      {
        id: 'b',
        color: '#81D4FA',
        selectors: {
          position: { start: 1, end: 3 },
          quote: { exact: 'bc', prefix: 'a', suffix: 'def' },
        },
      },
    ]),
  ).toBe(true);
  expect([...(registry.get('codificaweb-fdd835') ?? [])].map(String)).toEqual([
    'a',
    'd',
  ]);
  expect([...(registry.get('codificaweb-81d4fa') ?? [])].map(String)).toEqual([
    'b',
    'c',
  ]);
  expect(document.body.innerHTML).toBe(initial);
  expect(document.adoptedStyleSheets).toHaveLength(1);
  document.querySelector('em')?.append('!');
  await Promise.resolve();
  expect([...registry]).toEqual([['otra-app', other]]);
  expect(document.adoptedStyleSheets).toHaveLength(0);
});

test('Q05: descarta rangos obsoletos, colores inválidos y páginas fuera del límite', () => {
  const painter = createPainter();
  expect(
    painter.paint([
      null,
      {},
      { ...entry, id: 2 },
      { ...entry, color: 'red' },
      {
        ...entry,
        selectors: {
          position: { start: 0, end: 4 },
          quote: { exact: 'xxxx', prefix: '', suffix: '' },
        },
      },
      {
        ...entry,
        selectors: {
          position: { start: -1, end: 4 },
          quote: entry.selectors.quote,
        },
      },
      {
        ...entry,
        selectors: {
          position: { start: 0, end: 4 },
          quote: { ...entry.selectors.quote, suffix: 'xx' },
        },
      },
    ]),
  ).toBe(true);
  expect(registry.size).toBe(0);
  expect(painter.paint(null)).toBe(false);
  document.body.textContent = 'x'.repeat(1_000_001);
  expect(painter.paint([entry])).toBe(false);
  vi.stubGlobal('CSS', undefined);
  expect(painter.paint([entry])).toBe(false);
});

test('Q05: el content script pinta solo para el panel y la URL autorizados', async () => {
  const listener = vi.fn();
  const panel = 'chrome-extension://id/src/panel/index.html';
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'id',
      getURL: () => panel,
      onMessage: { addListener: listener },
    },
  });
  await import('../../src/content/index');
  const handle = listener.mock.calls[0]?.[0];
  const respond = vi.fn();
  const sender = { id: 'id', url: panel };
  handle(
    { type: 'highlight.paint', url, entries: [entry] },
    { id: 'externo' },
    respond,
  );
  handle(null, sender, respond);
  expect(respond).not.toHaveBeenCalled();
  handle({ type: 'capture.read' }, sender, respond);
  expect(respond).toHaveBeenLastCalledWith({ kind: 'empty' });
  handle(
    { type: 'highlight.paint', url: 'https://otro.test/', entries: [entry] },
    sender,
    respond,
  );
  expect(respond).toHaveBeenLastCalledWith(
    expect.objectContaining({ painted: false }),
  );
  handle({ type: 'highlight.paint', url, entries: [entry] }, sender, respond);
  expect(respond).toHaveBeenLastCalledWith(
    expect.objectContaining({ painted: true }),
  );
  expect(registry.size).toBe(1);
  window.dispatchEvent(new Event('pagehide'));
  expect(registry.size).toBe(0);
});

test('Q05: no sobrescribe ni elimina un resaltado ajeno con el mismo nombre', () => {
  const original = new Set<Range>();
  registry.set('codificaweb-fdd835', original);
  const painter = createPainter();
  expect(painter.paint([entry])).toBe(true);
  expect(registry.get('codificaweb-fdd835')).toBe(original);
  const replacement = new Set<Range>();
  registry.set('codificaweb-fdd835-cw', replacement);
  painter.clear();
  expect(registry.get('codificaweb-fdd835')).toBe(original);
  expect(registry.get('codificaweb-fdd835-cw')).toBe(replacement);
});
