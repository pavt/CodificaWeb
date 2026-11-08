// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import {
  createMarginLabels,
  isPageMutation,
  readMarginCategories,
} from '../../src/content/margin-labels';

afterEach(() => vi.restoreAllMocks());

test('Q05: posiciona etiquetas privadas y deja el espacio ocupado para el panel', () => {
  document.body.innerHTML = '<p><em>Cita</em></p><aside>Columna</aside>';
  const viewport = document.documentElement;
  const block = document.querySelector('p') as HTMLElement;
  const inline = document.querySelector('em') as HTMLElement;
  inline.style.display = 'inline';
  const sidebar = document.querySelector('aside') as HTMLElement;
  const range = document.createRange();
  range.selectNodeContents(inline);
  let box: DOMRect | undefined = new DOMRect(10, 20, 60, 20);
  Object.defineProperty(range, 'getClientRects', {
    value: () => (box ? [box] : []),
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 148, 24),
  );
  vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 100, 60),
  );
  const width = vi.spyOn(viewport, 'clientWidth', 'get').mockReturnValue(500);
  const height = vi.spyOn(viewport, 'clientHeight', 'get').mockReturnValue(300);
  let background: Element[] = [document.body, viewport];
  Object.defineProperty(document, 'elementsFromPoint', {
    configurable: true,
    value: () => background,
  });
  let render: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    render = callback;
    return 1;
  });
  const attach = vi.spyOn(Element.prototype, 'attachShadow');
  const records = new MutationObserver(() => {});
  records.observe(viewport, { childList: true });
  const margin = createMarginLabels();
  const categories = [{ id: 'a', name: 'Contexto', color: '#BEAED4' }];
  try {
    margin.clear();
    margin.show([]);
    margin.show([
      { anchor: range, categories },
      { anchor: range, categories },
    ]);
    const shadow = attach.mock.results[0]?.value as ShadowRoot;
    expect(shadow.mode).toBe('closed');
    expect(records.takeRecords().map(isPageMutation)).toEqual([false]);
    render?.(0);
    expect(shadow.querySelectorAll('.citation-row')).toHaveLength(1);
    expect(shadow.textContent).toBe('Contexto');
    background = [sidebar, document.body, viewport];
    render?.(0);
    expect(shadow.querySelector('.citation-row')).toBeNull();
    background = [document.body, viewport];
    width.mockReturnValue(200);
    render?.(0);
    expect(shadow.querySelector('.citation-row')).toBeNull();
    width.mockReturnValue(500);
    height.mockReturnValue(15);
    render?.(0);
    expect(shadow.querySelector('.citation-row')).toBeNull();
    height.mockReturnValue(300);
    box = new DOMRect(10, -40, 60, 20);
    render?.(0);
    expect(shadow.querySelector('.citation-row')).toBeNull();
    box = undefined;
    render?.(0);
    expect(shadow.querySelector('.citation-row')).toBeNull();
    window.dispatchEvent(new Event('resize'));
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2);
  } finally {
    margin.clear();
    expect(records.takeRecords().map(isPageMutation)).toEqual([false]);
    records.disconnect();
    Reflect.deleteProperty(document, 'elementsFromPoint');
  }
});

test('Q05: admite solo etiquetas con identidad, nombre y color válidos', () => {
  const category = { id: 'a', name: 'Contexto', color: '#BEAED4' };
  expect(readMarginCategories(null)).toEqual([]);
  expect(
    readMarginCategories([
      null,
      {},
      { id: 'x' },
      { id: 'x', name: 'X' },
      { ...category, color: 'red' },
      category,
    ]),
  ).toEqual([category]);
});
