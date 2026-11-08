import { expect, test } from 'vitest';
import { segmentHighlights } from '../../src/domain/highlights';

const wide = { id: 'a', start: 0, end: 10, color: '#FDD835' };
const narrow = { id: 'b', start: 3, end: 7, color: '#81D4FA' };

test('Q05: el rango menor gana dentro del mayor, sin perder sus extremos', () => {
  expect(segmentHighlights([wide, narrow])).toEqual([
    { start: 0, end: 3, color: wide.color },
    { start: 3, end: 7, color: narrow.color },
    { start: 7, end: 10, color: wide.color },
  ]);
});

test('Q05: resuelve tramos iguales y parciales por identidad, sin depender del orden de entrada', () => {
  const equal = { ...wide, id: 'z', color: narrow.color };
  const partial = { ...narrow, start: 6, end: 12 };
  expect(segmentHighlights([equal, partial, wide])).toEqual([
    { start: 0, end: 6, color: wide.color },
    { start: 6, end: 12, color: narrow.color },
  ]);
});

test('Q05: conserva huecos y une tramos contiguos del mismo color', () => {
  expect(
    segmentHighlights([
      { ...wide, end: 2 },
      { ...wide, id: 'b', start: 2, end: 3 },
      { ...wide, id: 'c', start: 5, end: 6 },
    ]),
  ).toEqual([
    { start: 0, end: 3, color: wide.color },
    { start: 5, end: 6, color: wide.color },
  ]);
});
