// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { locateEvidence } from '../../src/content/locate-evidence';

afterEach(() => vi.restoreAllMocks());

test('Q09: resuelve el texto desplazado y centra el rango sin alterar el DOM', () => {
  document.body.innerHTML = '<p>Nuevo <em>cita</em> después</p>';
  const original = document.body.innerHTML;
  const rect = { top: 700 } as DOMRect;
  const scrollIntoView = vi.fn();
  Object.defineProperty(document.querySelector('em'), 'scrollIntoView', {
    value: scrollIntoView,
  });
  const range = document.createRange();
  Object.defineProperties(range, {
    getClientRects: { value: () => [rect] },
    getBoundingClientRect: { value: () => rect },
  });
  vi.spyOn(document, 'createRange').mockReturnValue(range);
  const scroll = vi
    .spyOn(window, 'scrollBy')
    .mockImplementation(() => undefined);
  expect(
    locateEvidence({ quote: { exact: 'cita', prefix: '', suffix: '' } }),
  ).toBe(true);
  expect(range.toString()).toBe('cita');
  expect(scrollIntoView).toHaveBeenCalledOnce();
  expect(scroll).toHaveBeenCalledWith({
    top: 700 - window.innerHeight / 2,
    behavior: 'instant',
  });
  expect(document.body.innerHTML).toBe(original);
});

test('Q09: evita desplazar ante selectores inválidos, cita ausente o ambigua', () => {
  document.body.textContent = 'cita y cita';
  for (const selectors of [
    null,
    {},
    { quote: null },
    { quote: { exact: 'cita' } },
    { quote: { exact: 'ausente', prefix: '', suffix: '' } },
    { quote: { exact: 'cita', prefix: '', suffix: '' } },
    { quote: { exact: 'cita', prefix: 'a'.repeat(33), suffix: '' } },
  ])
    expect(locateEvidence(selectors)).toBe(false);
});
