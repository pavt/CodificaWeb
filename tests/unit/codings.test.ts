import { expect, test } from 'vitest';
import { MemoryCodings } from '../../src/domain/codings';
import type { Fragment } from '../../src/domain/codings';

const fragment: Fragment = {
  url: 'https://example.test/articulo',
  selectors: {
    profile: 'dom-text-v1',
    quote: { type: 'TextQuoteSelector', exact: 'cita', prefix: '', suffix: '' },
    position: { type: 'TextPositionSelector', start: 0, end: 4 },
  },
};
const catalog = [
  { id: 'uno', projectId: 'local', name: 'Tema', color: '#FDD835' },
  { id: 'dos', projectId: 'local', name: 'Contexto', color: '#81D4FA' },
  { id: 'otro', projectId: 'externo', name: 'Otro', color: '#FF0000' },
];

test('Q04: permite dos códigos, repite sin duplicar y retira solo una asociación', () => {
  const codings = new MemoryCodings(catalog);
  expect(codings.read('local', fragment).map((code) => code.assigned)).toEqual([
    false,
    false,
  ]);
  codings.set('local', fragment, 'uno', true);
  codings.set('local', fragment, 'dos', true);
  codings.set('local', fragment, 'uno', true);
  expect(
    codings
      .read('local', structuredClone(fragment))
      .filter((code) => code.assigned)
      .map((code) => code.id),
  ).toEqual(['uno', 'dos']);
  codings.set('local', fragment, 'uno', false);
  codings.set('local', fragment, 'uno', false);
  expect(
    codings
      .read('local', fragment)
      .filter((code) => code.assigned)
      .map((code) => code.id),
  ).toEqual(['dos']);
});

test('Q04: aísla fuentes, posiciones y proyectos', () => {
  const codings = new MemoryCodings(catalog);
  codings.set('local', fragment, 'uno', true);
  const otherSource = { ...fragment, url: 'https://example.test/otra' };
  const otherRange = {
    ...fragment,
    selectors: {
      ...fragment.selectors,
      position: { ...fragment.selectors.position, start: 5, end: 9 },
    },
  };
  expect(codings.read('local', otherSource).some((code) => code.assigned)).toBe(
    false,
  );
  expect(codings.read('local', otherRange).some((code) => code.assigned)).toBe(
    false,
  );
  expect(
    codings.read('externo', fragment).map((code) => [code.id, code.assigned]),
  ).toEqual([['otro', false]]);
});

test('Q04: rechaza un código de otro proyecto o inexistente sin modificar asociaciones', () => {
  const codings = new MemoryCodings(catalog);
  for (const id of ['otro', 'inexistente']) {
    expect(() => codings.set('local', fragment, id, true)).toThrow(
      'Código fuera del proyecto.',
    );
  }
  expect(codings.read('local', fragment).every((code) => !code.assigned)).toBe(
    true,
  );
});
