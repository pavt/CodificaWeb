import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { CodingDatabase, initialProjectId } from '../../src/storage/database';
import { IndexedCodings } from '../../src/storage/indexed-codings';
import { IndexedProjects } from '../../src/storage/indexed-projects';
import { IndexedRelations } from '../../src/storage/indexed-relations';

const projectId = initialProjectId;
const codeId = '00000000-0000-4000-8000-000000000003';
const fields = { name: 'Amplía', direction: 'directed' } as const;
let db: CodingDatabase;
let relations: IndexedRelations;

beforeEach(() => {
  db = new CodingDatabase(crypto.randomUUID());
  relations = new IndexedRelations(db);
});
afterEach(() => db.delete());

async function quote(page: string, start = 0) {
  const url = 'https://example.test/' + page;
  await new IndexedCodings(db).set(
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
        position: { type: 'TextPositionSelector', start, end: start + 4 },
      },
    },
    codeId,
    true,
    crypto.randomUUID(),
  );
  const source = await db.sources.get({ '[projectId+url]': [projectId, url] });
  const annotation =
    source &&
    (await db.annotations.get({
      '[sourceId+start+end]': [source.id, start, start + 4],
    }));
  if (!annotation) throw new Error('No se guardó la cita');
  return annotation.id;
}

test('Q15: el catálogo empieza vacío y los nombres se normalizan por proyecto', async () => {
  expect(await relations.listTypes(projectId)).toEqual([]);
  const type = await relations.createType(projectId, {
    ...fields,
    name: ' Amplía ',
  });
  await expect(
    relations.createType(projectId, { ...fields, name: 'AMPLÍA' }),
  ).rejects.toThrow();
  const other = await new IndexedProjects(db).create('Otro', '');
  await relations.createType(other, fields);
  await expect(
    relations.createType(other, { ...fields, name: '' }),
  ).rejects.toThrow();
  await expect(relations.createType('ausente', fields)).rejects.toThrow();
  await expect(relations.updateType(other, type.id, fields)).rejects.toThrow();
  await expect(relations.removeType(other, type.id)).rejects.toThrow();
  expect(await relations.listTypes(projectId)).toMatchObject([
    { id: type.id, name: 'Amplía' },
  ]);
});

test('Q15: la identidad del vínculo depende del tipo y del orden cuando es dirigido', async () => {
  const a = await quote('a');
  const b = await quote('b');
  const directed = await relations.createType(projectId, fields);
  const symmetric = await relations.createType(projectId, {
    name: 'Coincide',
    direction: 'symmetric',
  });
  const endpoints = { fromAnnotationId: a, toAnnotationId: b };
  const reverse = { fromAnnotationId: b, toAnnotationId: a };
  const link = await relations.createLink(projectId, {
    ...endpoints,
    relationTypeId: directed.id,
    note: 'Original',
  });
  expect(
    await relations.createLink(projectId, {
      ...endpoints,
      relationTypeId: directed.id,
      note: 'Otro',
    }),
  ).toEqual(link);
  expect(
    (
      await relations.createLink(projectId, {
        ...reverse,
        relationTypeId: directed.id,
      })
    ).id,
  ).not.toBe(link.id);
  const twins = await Promise.all([
    relations.createLink(projectId, {
      ...endpoints,
      relationTypeId: symmetric.id,
    }),
    relations.createLink(projectId, {
      ...reverse,
      relationTypeId: symmetric.id,
    }),
  ]);
  expect(twins[0]?.id).toBe(twins[1]?.id);
  await expect(
    relations.updateLink(projectId, link.id, { relationTypeId: symmetric.id }),
  ).rejects.toThrow();
  await expect(relations.removeType(projectId, directed.id)).rejects.toThrow();
  await expect(
    relations.updateType(projectId, directed.id, {
      ...fields,
      direction: 'symmetric',
    }),
  ).rejects.toThrow();
  await relations.updateType(projectId, directed.id, {
    ...fields,
    name: 'Matiza',
    description: 'Agrega contexto',
  });
  expect(
    await relations.updateLink(projectId, link.id, {
      relationTypeId: directed.id,
      note: 'Editada',
    }),
  ).toMatchObject({ id: link.id, note: 'Editada' });
  expect(await db.quotationLinks.count()).toBe(3);
  await relations.removeLink(projectId, link.id);
  expect(await db.quotationLinks.get(link.id)).toBeUndefined();
  const spare = await relations.createType(projectId, {
    ...fields,
    name: 'Libre',
  });
  await relations.removeType(projectId, spare.id);
  expect(await db.relationTypes.get(spare.id)).toBeUndefined();
  await new IndexedProjects(db).remove(projectId);
  expect(await db.quotationLinks.count()).toBe(0);
  expect(await db.relationTypes.count()).toBe(0);
});

test('Q15: rechaza extremos o tipos inválidos sin guardar vínculos', async () => {
  const a = await quote('a');
  const sameSource = await quote('a', 4);
  const b = await quote('b');
  const type = await relations.createType(projectId, fields);
  const other = await new IndexedProjects(db).create('Otro', '');
  const foreignType = await relations.createType(other, fields);
  const endpoints = {
    fromAnnotationId: a,
    toAnnotationId: b,
    relationTypeId: type.id,
  };
  for (const input of [
    { ...endpoints, toAnnotationId: 'ausente' },
    { ...endpoints, fromAnnotationId: 'ausente' },
    { ...endpoints, toAnnotationId: sameSource },
    { ...endpoints, relationTypeId: foreignType.id },
    { ...endpoints, note: 'x'.repeat(16_385) },
  ])
    await expect(relations.createLink(projectId, input)).rejects.toThrow();
  await expect(
    relations.createLink(other, {
      ...endpoints,
      relationTypeId: foreignType.id,
    }),
  ).rejects.toThrow();
  await expect(
    relations.updateLink(projectId, 'ausente', { relationTypeId: type.id }),
  ).rejects.toThrow();
  await expect(relations.removeLink(projectId, 'ausente')).rejects.toThrow();
  expect(await db.quotationLinks.count()).toBe(0);
});

test('Q12: al migrar desde v3 conserva las citas y abre un catálogo vacío', async () => {
  const annotationId = await quote('legado');
  const legacy = new Dexie(db.name + '-v3');
  legacy.version(3).stores({
    projects: 'id',
    sources: 'id, &[projectId+url], projectId',
    codes: 'id, &[projectId+nameKey], projectId',
    annotations: 'id, [projectId+sourceId], [sourceId+start+end], projectId',
    codings:
      'id, &[annotationId+codeId], [projectId+codeId], [projectId+annotationId], annotationId',
    operations: 'id, projectId',
    sites: 'origin',
    preferences: 'key',
  });
  const upgraded = new CodingDatabase(legacy.name);
  try {
    await legacy.table('projects').bulkAdd(await db.projects.toArray());
    await legacy.table('sources').bulkAdd(await db.sources.toArray());
    await legacy.table('annotations').bulkAdd(await db.annotations.toArray());
    legacy.close();
    expect(await upgraded.annotations.get(annotationId)).toEqual(
      await db.annotations.get(annotationId),
    );
    expect(await new IndexedRelations(upgraded).listTypes(projectId)).toEqual(
      [],
    );
    expect(await upgraded.quotationLinks.count()).toBe(0);
  } finally {
    legacy.close();
    await upgraded.delete();
  }
});

test('Q15: valida límites, fuentes e identidad al modificar registros existentes', async () => {
  await expect(
    relations.createType(projectId, { ...fields, name: 'x'.repeat(257) }),
  ).rejects.toThrow();
  await expect(
    relations.createType(projectId, {
      ...fields,
      description: 'x'.repeat(16_385),
    }),
  ).rejects.toThrow();
  await expect(
    relations.createType(projectId, {
      ...fields,
      direction: 'inválida' as 'directed',
    }),
  ).rejects.toThrow();
  const type = await relations.createType(projectId, fields);
  await relations.updateType(projectId, type.id, {
    ...fields,
    direction: 'symmetric',
  });
  const a = await quote('a');
  const b = await quote('b');
  const endpoints = {
    fromAnnotationId: a,
    toAnnotationId: b,
    relationTypeId: type.id,
  };
  const link = await relations.createLink(projectId, endpoints);
  const other = await new IndexedProjects(db).create('Otro', '');
  await expect(relations.removeLink(other, link.id)).rejects.toThrow();
  const source = await db.sources.get({
    '[projectId+url]': [projectId, 'https://example.test/b'],
  });
  if (!source) throw new Error('Fuente ausente');
  await db.sources.delete(source.id);
  await expect(relations.createLink(projectId, endpoints)).rejects.toThrow(
    'Fuentes fuera',
  );
  expect(await db.quotationLinks.get(link.id)).toEqual(link);
});
