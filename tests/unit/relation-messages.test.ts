import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { database, projects } from '../../src/background/coding-messages';
import { handleRelationRequest } from '../../src/background/relation-messages';
import { initialProjectId as projectId } from '../../src/storage/database';
import { IndexedCodings } from '../../src/storage/indexed-codings';

const panel = {
  id: 'test',
  url: 'chrome-extension://test/src/panel/index.html',
};
const fields = { name: 'Matiza', direction: 'directed' };
const request = (type: string, values: Record<string, unknown> = {}) =>
  handleRelationRequest({ type, projectId, ...values }, panel);

beforeEach(async () => {
  await database.open();
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'test',
      getURL: (path: string) => 'chrome-extension://test/' + path,
    },
  });
});
afterEach(async () => {
  await database.delete();
  vi.unstubAllGlobals();
});

async function saved(page: string) {
  const url = 'https://example.test/' + page;
  await new IndexedCodings(database).set(
    projectId,
    {
      url,
      selectors: {
        profile: 'dom-text-v1',
        quote: {
          type: 'TextQuoteSelector',
          exact: 'Cita',
          prefix: '',
          suffix: '',
        },
        position: { type: 'TextPositionSelector', start: 0, end: 4 },
      },
    },
    '00000000-0000-4000-8000-000000000003',
    true,
    crypto.randomUUID(),
  );
  const source = await database.sources.get({
    '[projectId+url]': [projectId, url],
  });
  const annotation =
    source &&
    (await database.annotations.get({
      '[sourceId+start+end]': [source.id, 0, 4],
    }));
  if (!source || !annotation) throw new Error('Cita no guardada');
  return { source, annotation };
}

test('Q15: el panel consulta y modifica vínculos con las dos evidencias', async () => {
  const [a, b] = await Promise.all([saved('a'), saved('b')]);
  const endpoints = {
    fromAnnotationId: a.annotation.id,
    toAnnotationId: b.annotation.id,
  };
  const created = await request('relations.createWithType', {
    ...endpoints,
    fields,
  });
  if (created.kind !== 'relation') throw new Error('Vínculo ausente');
  const { id, relationTypeId } = created.link;
  expect(await request('relationTypes.list')).toMatchObject({
    kind: 'relationTypes',
    types: [{ id: relationTypeId }],
  });
  expect(
    await request('relationTypes.update', {
      id: relationTypeId,
      fields: { ...fields, name: 'Amplía', description: 'Contexto adicional' },
    }),
  ).toEqual({ kind: 'ok' });
  expect(
    await request('relations.update', { id, relationTypeId, note: 'Una nota' }),
  ).toMatchObject({ link: { id, note: 'Una nota' } });
  expect(
    await request('relations.create', { ...endpoints, relationTypeId }),
  ).toMatchObject({ link: { id } });
  expect(
    await request('relations.listByCitation', { id: a.annotation.id }),
  ).toMatchObject({
    links: [
      {
        id,
        direction: 'outgoing',
        type: { name: 'Amplía' },
        to: { source: { url: b.source.url } },
      },
    ],
  });
  expect(
    await request('relations.listBySource', { id: b.source.id }),
  ).toMatchObject({
    sources: [
      { source: { id: a.source.id }, links: [{ id, direction: 'incoming' }] },
    ],
  });
  expect(await request('relationTypes.remove', { id: relationTypeId })).toEqual(
    { kind: 'error' },
  );
  expect(await request('relations.remove', { id })).toEqual({ kind: 'ok' });
  expect(await request('relationTypes.remove', { id: relationTypeId })).toEqual(
    { kind: 'ok' },
  );
  expect(
    await request('relations.listByCitation', { id: a.annotation.id }),
  ).toMatchObject({ links: [] });
  expect(await request('relationTypes.create', { fields })).toMatchObject({
    kind: 'relationType',
    value: { name: 'Matiza' },
  });
});

test('Q13: rechaza remitentes, proyectos y argumentos inválidos', async () => {
  const message = { type: 'relationTypes.list', projectId };
  expect(
    await handleRelationRequest(message, { ...panel, id: 'otra' }),
  ).toEqual({ kind: 'error' });
  expect(
    await handleRelationRequest(message, {
      ...panel,
      url: 'https://example.test/',
    }),
  ).toEqual({ kind: 'error' });
  const other = await projects.create('Otro', '');
  await projects.select(other);
  expect(await request('relationTypes.list')).toEqual({ kind: 'error' });
  await projects.select(projectId);
  const a = { fromAnnotationId: 'a', toAnnotationId: 'b', relationTypeId: 'c' };
  for (const [type, values] of [
    ['relationTypes.list', { projectId: '' }],
    ['relationTypes.list', { projectId: 'x'.repeat(129) }],
    ['relationTypes.create', {}],
    ['relationTypes.create', { fields: { ...fields, name: 1 } }],
    ['relationTypes.create', { fields: { ...fields, description: 1 } }],
    ['relationTypes.create', { fields: { ...fields, direction: '?' } }],
    ['relationTypes.update', { fields }],
    ['relationTypes.remove', {}],
    ['relations.listBySource', {}],
    ['relations.listByCitation', {}],
    ['relations.listBySource', { id: 'missing' }],
    ['relations.listByCitation', { id: 'missing' }],
    ['relations.create', {}],
    ['relations.create', { fromAnnotationId: 'a' }],
    ['relations.create', { ...a, note: 1 }],
    ['relations.create', { ...a, relationTypeId: undefined }],
    ['relations.createWithType', a],
    ['relations.update', {}],
    ['relations.update', { id: 'a' }],
    ['relations.update', { id: 'a', relationTypeId: 'b', note: 1 }],
    ['relations.remove', {}],
    ['relations.unknown', {}],
  ] as const)
    expect(await request(type, values)).toEqual({ kind: 'error' });
});
