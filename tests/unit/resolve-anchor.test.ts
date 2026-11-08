import { expect, test } from 'vitest';
import { resolveAnchor } from '../../src/content/resolve-anchor';

test('Q06: recupera una cita única desplazada sin cambiar el texto histórico', () => {
  expect(
    resolveAnchor('Nuevo. Antes cita después', 'cita', 'Antes ', ' después'),
  ).toEqual({ start: 13, end: 17 });
});
test('Q06: solo el contexto inequívoco puede resolver citas repetidas', () => {
  expect(resolveAnchor('A cita B; C cita D', 'cita', 'C ', ' D')).toEqual({
    start: 12,
    end: 16,
  });
  expect(
    resolveAnchor('A cita B; A cita B', 'cita', 'A ', ' B'),
  ).toBeUndefined();
  expect(resolveAnchor('cita cita', 'cita', '', '')).toBeUndefined();
  expect(resolveAnchor('cita cita', 'cita', 'X', '')).toBeUndefined();
});
test('Q06: se abstiene cuando la cita desaparece', () => {
  expect(
    resolveAnchor('Antes nueva después', 'cita', 'Antes ', ' después'),
  ).toBeUndefined();
  expect(
    resolveAnchor('Antes nueva después', '', 'Antes ', ' después'),
  ).toBeUndefined();
});
