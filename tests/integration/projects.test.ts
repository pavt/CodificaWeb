import 'fake-indexeddb/auto';
import { seedHistoricalNote } from '../fixtures/historical-note';
import { Dexie } from 'dexie';
import { expect, test } from 'vitest';
import { CodingDatabase, initialProjectId } from '../../src/storage/database';
import { IndexedProjects } from '../../src/storage/indexed-projects';
import { IndexedCodings } from '../../src/storage/indexed-codings';
import type { Fragment } from '../../src/domain/codings';

test('Q01: persiste el proyecto activo, separa el corpus y borra solo el proyecto elegido', async () => {
  const db = new CodingDatabase(`codificaweb-projects-${crypto.randomUUID()}`);
  try {
    const projects = new IndexedProjects(db);
    const codings = new IndexedCodings(db);
    const fragment: Fragment = {
      url: 'https://example.test/',
      selectors: {
        profile: 'dom-text-v1',
        quote: {
          type: 'TextQuoteSelector',
          exact: 'cita',
          prefix: '',
          suffix: '',
        },
        position: { type: 'TextPositionSelector', start: 0, end: 4 },
      },
    };
    expect(await projects.activeId()).toBe(initialProjectId);
    await seedHistoricalNote(
      db,
      initialProjectId,
      fragment,
      'Proyecto inicial',
    );
    const second = await projects.create('Proyecto B', '');
    await projects.update(second, 'Renombrado', 'Descripción');
    await projects.select(second);
    expect(await projects.activeId()).toBe(second);
    const reopened = new CodingDatabase(db.name);
    try {
      expect(await new IndexedProjects(reopened).activeId()).toBe(second);
    } finally {
      reopened.close();
    }
    expect(await db.annotations.where('projectId').equals(second).count()).toBe(
      0,
    );
    await seedHistoricalNote(db, second, fragment, 'Proyecto B');
    expect(
      (await db.annotations.where('projectId').equals(initialProjectId).first())
        ?.note,
    ).toBe('Proyecto inicial');
    expect(await projects.list()).toMatchObject({
      activeId: second,
      projects: expect.arrayContaining([
        expect.objectContaining({
          id: second,
          name: 'Renombrado',
          description: 'Descripción',
        }),
      ]),
    });
    const [starter] = await db.codes.toArray();
    if (!starter) throw new Error('Catálogo inicial ausente');
    const code = { ...starter, id: crypto.randomUUID(), projectId: second };
    await db.codes.add(code);
    await codings.set(second, fragment, code.id, true, crypto.randomUUID());
    await projects.remove(second);
    expect(await db.codings.count()).toBe(0);
    expect(await db.codes.get(code.id)).toBeUndefined();
    expect(await projects.activeId()).toBe(initialProjectId);
    expect(await db.sources.count()).toBe(1);
    expect(await db.annotations.count()).toBe(1);
    expect(await db.operations.count()).toBe(0);
    expect(
      (await db.annotations.where('projectId').equals(initialProjectId).first())
        ?.note,
    ).toBe('Proyecto inicial');
    expect(await db.annotations.where('projectId').equals(second).count()).toBe(
      0,
    );
  } finally {
    await db.delete();
  }
});

test('Q01: migra recibos v2 y conserva los proyectos existentes', async () => {
  const name = `codificaweb-v2-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(2).stores({ projects: 'id', operations: 'id' });
  await legacy
    .table('projects')
    .add({ id: initialProjectId, name: 'Existente' });
  await legacy.table('operations').bulkAdd([
    {
      id: 'codigo',
      fingerprint: JSON.stringify([
        initialProjectId,
        'fragmento',
        'codigo',
        true,
      ]),
    },
    {
      id: 'nota',
      fingerprint: JSON.stringify([
        'note',
        initialProjectId,
        'fragmento',
        'nota',
      ]),
    },
  ]);
  legacy.close();
  const db = new CodingDatabase(name);
  try {
    const projects = new IndexedProjects(db);
    expect(await projects.list()).toMatchObject({
      activeId: initialProjectId,
      projects: [{ name: 'Existente' }],
    });
    expect(
      await db.operations.where('projectId').equals(initialProjectId).count(),
    ).toBe(2);
    await projects.remove(initialProjectId);
    expect(await db.operations.count()).toBe(0);
    expect(await projects.activeId()).toBeNull();
  } finally {
    await db.delete();
  }
});

test('Q18: exige elegir proyecto y registra cada página una sola vez', async () => {
  const db = new CodingDatabase(`codificaweb-documents-${crypto.randomUUID()}`);
  const url = 'https://example.test/issues/1';
  try {
    const projects = new IndexedProjects(db);
    expect((await projects.document(url)).kind).toBe('setup');
    const first = await projects.document(url, { id: initialProjectId });
    expect(first).toEqual({ kind: 'ready', projectId: initialProjectId });
    const next = 'https://example.test/issues/2';
    expect((await projects.document(next)).kind).toBe('unregistered');
    await Promise.all([
      projects.document(next, { add: initialProjectId }),
      projects.document(next, { add: initialProjectId }),
    ]);
    expect(await db.sources.count()).toBe(2);
    expect((await projects.document(next)).kind).toBe('ready');
    const created = await projects.document(url, {
      name: 'Nuevo',
      description: '',
    });
    expect(created.kind).toBe('ready');
    expect(await db.projects.count()).toBe(2);
    expect(await db.sources.count()).toBe(3);
    expect(
      await projects.document(url, { name: 'NUEVO', description: '' }),
    ).toEqual(created);
    expect(await db.projects.count()).toBe(2);
    expect(await projects.document(next)).toMatchObject({
      kind: 'unregistered',
      projects: expect.arrayContaining([
        { id: initialProjectId, name: expect.any(String), containsPage: true },
      ]),
    });
  } finally {
    await db.delete();
  }
});

test('Q18: valida la URL y la acción antes de registrar el documento', async () => {
  const { handleProjectRequest } =
    await import('../../src/background/project-messages');
  const url = 'https://example.test/issues/2';
  for (const data of [
    {},
    { url: 'x'.repeat(2049) },
    { url: 'incorrecta' },
    { url: 'file:///local' },
    { url: 'https://user@example.test/' },
    { url: 'https://:password@example.test/' },
    { url, mode: 'create', name: ' ', description: '' },
    { url, mode: 'create', name: 'x'.repeat(257), description: '' },
    { url, mode: 'create', name: 'Caso', description: null },
    { url, mode: 'create', name: 'Caso', description: 'x'.repeat(16385) },
  ])
    expect(
      await handleProjectRequest({ type: 'project.document', ...data }),
    ).toEqual({ kind: 'error' });
  expect(
    await handleProjectRequest({
      type: 'project.document',
      url,
      mode: 'create',
      name: ' Caso ',
      description: '',
    }),
  ).toMatchObject({ kind: 'ready' });
  expect(
    await handleProjectRequest({ type: 'project.document', url }),
  ).toMatchObject({ kind: 'ready' });
  expect(
    await handleProjectRequest({
      type: 'project.document',
      url,
      mode: 'select',
      id: initialProjectId,
    }),
  ).toEqual({ kind: 'ready', projectId: initialProjectId });
  expect(
    await handleProjectRequest({
      type: 'project.document',
      url,
      mode: 'add',
      id: initialProjectId,
    }),
  ).toEqual({ kind: 'ready', projectId: initialProjectId });
  expect(
    await handleProjectRequest({
      type: 'project.document',
      url,
      mode: 'add',
      id: 'incorrecto',
    }),
  ).toEqual({ kind: 'error' });
});
