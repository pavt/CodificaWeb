import { expect, test } from 'vitest';
import { filterEvidence } from '../../src/domain/evidence-search';

const evidence = [
  {
    id: 'a',
    sourceId: 'uno',
    quote: 'Café de la mañana',
    note: null,
    codes: [{ id: 'tema', name: 'Tema' }],
  },
  {
    id: 'b',
    sourceId: 'dos',
    quote: 'Café de la tarde',
    note: null,
    codes: [{ id: 'tema', name: 'Tema' }],
  },
  {
    id: 'c',
    sourceId: 'uno',
    quote: 'Otra cita',
    note: 'CAFE\u0301 en la nota',
    codes: [],
  },
  {
    id: 'd',
    sourceId: 'uno',
    quote: 'Texto desaparecido de la página',
    note: null,
    codes: [],
  },
];

test('Q08: combina código, fuente y texto por intersección y normaliza NFC', () => {
  expect(
    filterEvidence(evidence, {
      codeId: 'tema',
      sourceId: 'uno',
      text: ' CAFE\u0301 ',
    }),
  ).toEqual([evidence[0]]);
  expect(
    filterEvidence(evidence, { codeId: null, sourceId: 'uno', text: 'café' }),
  ).toEqual([evidence[0], evidence[2]]);
});

test('Q08: incluye citas persistidas sin exigir un código o una ubicación en el DOM', () => {
  expect(
    filterEvidence(evidence, {
      codeId: null,
      sourceId: null,
      text: 'desaparecido',
    }),
  ).toEqual([evidence[3]]);
});
