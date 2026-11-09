import 'fake-indexeddb/auto';
import { expect, test, vi } from 'vitest';
import {
  database,
  handleCodingRequest,
  projects,
} from '../../src/background/coding-messages';
import { initialProjectId } from '../../src/storage/database';

const fragment = {
  url: 'https://example.test/articulo',
  selectors: {
    profile: 'dom-text-v1',
    quote: { type: 'TextQuoteSelector', exact: 'cita', prefix: '', suffix: '' },
    position: { type: 'TextPositionSelector', start: 0, end: 4 },
  },
};
const request = { type: 'coding.read', fragment };

test('Q04: el adaptador devuelve el catálogo inicial y conserva asociaciones entre mensajes', async () => {
  const initial = await handleCodingRequest(request);
  expect(initial).toMatchObject({
    kind: 'codings',
    codes: [{ assigned: false }, { assigned: false }],
  });
  if (initial.kind !== 'codings' || !initial.codes[0])
    throw new Error('Catálogo inicial ausente');
  const codeId = initial.codes[0].id;
  expect(
    await handleCodingRequest({
      ...request,
      type: 'coding.set',
      codeId,
      assigned: true,
      operationId: crypto.randomUUID(),
    }),
  ).toMatchObject({
    kind: 'codings',
    codes: [{ assigned: true }, { assigned: false }],
  });
  expect(await handleCodingRequest(request)).toMatchObject({
    kind: 'codings',
    codes: [{ assigned: true }, { assigned: false }],
  });
  expect(
    await handleCodingRequest({
      ...request,
      type: 'coding.set',
      codeId,
      assigned: false,
      operationId: crypto.randomUUID(),
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
  {
    ...request,
    type: 'coding.set',
    codeId: 'ajeno',
    assigned: true,
    operationId: crypto.randomUUID(),
  },
  { ...request, type: 'coding.set', codeId: 'ajeno', assigned: 'sí' },
  {
    ...request,
    type: 'coding.set',
    codeId: 'ajeno',
    assigned: true,
    operationId: 'inválido',
  },
])('Q04: rechaza solicitudes inválidas %j', async (message) => {
  expect(await handleCodingRequest(message)).toEqual({ kind: 'error' });
});

test('Q05: el worker entrega únicamente los fragmentos del filtro solicitado', async () => {
  expect(
    await handleCodingRequest({
      type: 'highlight.read',
      url: fragment.url,
      filter: null,
    }),
  ).toMatchObject({ kind: 'highlights', entries: [] });
  expect(
    await handleCodingRequest({
      type: 'highlight.read',
      url: fragment.url,
      filter: true,
    }),
  ).toEqual({ kind: 'error' });
});

test('el worker rechaza el acceso al editor retirado', async () => {
  for (const type of ['note.read', 'note.set']) {
    expect(
      await handleCodingRequest({
        ...request,
        type,
        note: 'Nota',
        operationId: crypto.randomUUID(),
      }),
    ).toEqual({ kind: 'error' });
  }
});

test('T016: descarta una aplicación si el proyecto cambia antes de la escritura', async () => {
  const initial = await handleCodingRequest(request);
  if (initial.kind !== 'codings' || !initial.codes[0])
    throw new Error('Catálogo inicial ausente');
  const otherId = await projects.create('Otro proyecto', '');
  const activeId = vi
    .spyOn(projects, 'activeId')
    .mockImplementationOnce(async () => {
      await projects.select(otherId);
      return initialProjectId;
    });
  try {
    expect(
      await handleCodingRequest({
        ...request,
        type: 'coding.set',
        projectId: initialProjectId,
        codeId: initial.codes[0].id,
        assigned: true,
        operationId: crypto.randomUUID(),
      }),
    ).toEqual({ kind: 'error' });
    expect(await database.codings.count()).toBe(0);
  } finally {
    activeId.mockRestore();
    await projects.select(initialProjectId);
    await projects.remove(otherId);
  }
});
