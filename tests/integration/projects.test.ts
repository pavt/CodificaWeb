import 'fake-indexeddb/auto';
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
    await codings.setNote(
      initialProjectId,
      fragment,
      'Proyecto inicial',
      crypto.randomUUID(),
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
    expect(await codings.readNote(second, fragment)).toBeNull();
    await codings.setNote(second, fragment, 'Proyecto B', crypto.randomUUID());
    expect(await codings.readNote(initialProjectId, fragment)).toBe(
      'Proyecto inicial',
    );
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
    expect(await db.operations.count()).toBe(1);
    expect(await codings.readNote(initialProjectId, fragment)).toBe(
      'Proyecto inicial',
    );
    expect(await codings.readNote(second, fragment)).toBeNull();
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
