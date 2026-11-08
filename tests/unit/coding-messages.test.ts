import { expect, test } from 'vitest';
import { handleCodingRequest } from '../../src/background/coding-messages';

const fragment = {
  url: 'https://example.test/articulo',
  selectors: {
    profile: 'dom-text-v1',
    quote: { type: 'TextQuoteSelector', exact: 'cita', prefix: '', suffix: '' },
    position: { type: 'TextPositionSelector', start: 0, end: 4 },
  },
};
const request = { type: 'coding.read', fragment };

test('Q04: el adaptador devuelve el catálogo inicial y conserva asociaciones entre mensajes', () => {
  const initial = handleCodingRequest(request);
  expect(initial).toMatchObject({
    kind: 'codings',
    codes: [{ assigned: false }, { assigned: false }],
  });
  if (initial.kind !== 'codings' || !initial.codes[0])
    throw new Error('Catálogo inicial ausente');
  const codeId = initial.codes[0].id;
  expect(
    handleCodingRequest({
      ...request,
      type: 'coding.set',
      codeId,
      assigned: true,
    }),
  ).toMatchObject({
    kind: 'codings',
    codes: [{ assigned: true }, { assigned: false }],
  });
  expect(handleCodingRequest(request)).toMatchObject({
    kind: 'codings',
    codes: [{ assigned: true }, { assigned: false }],
  });
  expect(
    handleCodingRequest({
      ...request,
      type: 'coding.set',
      codeId,
      assigned: false,
    }),
  ).toMatchObject({
    kind: 'codings',
    codes: [{ assigned: false }, { assigned: false }],
  });
});

test.each([
  null,
  { ...request, type: 'desconocido' },
  { ...request, fragment: { ...fragment, url: 'file:///privado' } },
  { ...request, fragment: { ...fragment, selectors: {} } },
  { ...request, type: 'coding.set', codeId: 'ajeno', assigned: true },
  { ...request, type: 'coding.set', codeId: 'ajeno', assigned: 'sí' },
])('Q04: rechaza solicitudes inválidas %j', (message) => {
  expect(handleCodingRequest(message)).toEqual({ kind: 'error' });
});

test('Q05: el worker entrega únicamente los fragmentos del filtro solicitado', () => {
  expect(
    handleCodingRequest({
      type: 'highlight.read',
      url: fragment.url,
      filter: null,
    }),
  ).toEqual({ kind: 'highlights', entries: [] });
  expect(
    handleCodingRequest({
      type: 'highlight.read',
      url: fragment.url,
      filter: true,
    }),
  ).toEqual({ kind: 'error' });
});
