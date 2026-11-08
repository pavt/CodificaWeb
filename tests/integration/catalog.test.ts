import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { CodingDatabase, initialProjectId } from '../../src/storage/database';
import { IndexedCatalog } from '../../src/storage/indexed-catalog';
import { IndexedProjects } from '../../src/storage/indexed-projects';
import { IndexedCodings } from '../../src/storage/indexed-codings';
import type { Fragment } from '../../src/domain/codings';

test('Q02: reutiliza un código en dos fuentes, conserva el color al editar y elimina solo las asociaciones', async () => {
  const db = new CodingDatabase(`catalog-${crypto.randomUUID()}`);
  try {
    const catalog = new IndexedCatalog(db);
    const codings = new IndexedCodings(db);
    const code = await catalog.create(initialProjectId, {
      name: '  Café ',
      description: 'Descripción',
    });
    await expect(
      catalog.create(initialProjectId, {
        name: 'CAFE\u0301',
        description: '',
      }),
    ).rejects.toMatchObject({ name: 'ConstraintError' });
    expect(await catalog.list(initialProjectId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: code, name: 'Café', color: '#FDC086' }),
      ]),
    );
    const fragments: Fragment[] = ['a', 'b'].map((path) => ({
      url: `https://example.test/${path}`,
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
    }));
    for (const fragment of fragments) {
      await codings.set(
        initialProjectId,
        fragment,
        code,
        true,
        crypto.randomUUID(),
      );
      await codings.setNote(
        initialProjectId,
        fragment,
        'Nota',
        crypto.randomUUID(),
      );
    }
    await expect(
      catalog.update('ajeno', code, {
        name: 'Otro',
        description: '',
      }),
    ).rejects.toThrow();
    await expect(catalog.remove('ajeno', code)).rejects.toThrow();
    await catalog.update(initialProjectId, code, {
      name: 'Editado',
      description: 'Nueva',
    });
    for (const fragment of fragments) {
      expect(
        await codings.highlights(initialProjectId, fragment.url, code),
      ).toMatchObject([{ color: '#FDC086' }]);
    }
    await catalog.remove(initialProjectId, code);
    expect(await db.codings.count()).toBe(0);
    expect(await db.annotations.count()).toBe(2);
    for (const fragment of fragments) {
      expect(await codings.readNote(initialProjectId, fragment)).toBe('Nota');
      expect(
        await codings.highlights(initialProjectId, fragment.url, code),
      ).toEqual([]);
    }
  } finally {
    await db.delete();
  }
});

test('T019: amplía Accent con colores únicos, estables y aislados por proyecto', async () => {
  const db = new CodingDatabase(`palette-${crypto.randomUUID()}`);
  try {
    const projects = new IndexedProjects(db);
    const catalog = new IndexedCatalog(db);
    const project = await projects.create('Paleta', '');
    const other = await projects.create('Otra paleta', '');
    const create = (name: string) =>
      catalog.create(project, { name, description: '' });
    const ids = [];
    for (let i = 1; i <= 3; i++) ids.push(await create(`Categoría ${i}`));
    const [firstId, secondId, thirdId] = ids;
    if (!firstId || !secondId || !thirdId)
      throw new Error('Categorías ausentes');
    const first = await db.codes.bulkGet(ids);
    expect(first.map((code) => code?.color)).toEqual([
      '#7FC97F',
      '#BEAED4',
      '#FDC086',
    ]);
    await Promise.all(
      Array.from({ length: 22 }, (_, i) => create(`Nueva ${i}`)),
    );
    const colors = (await catalog.list(project)).map(({ color }) => color);
    expect(colors).toHaveLength(25);
    expect(new Set(colors).size).toBe(25);
    await catalog.update(project, firstId, {
      name: 'Renombrada',
      description: 'Definición',
    });
    await catalog.remove(project, secondId);
    expect(
      (await db.codes.bulkGet([firstId, thirdId])).map((code) => code?.color),
    ).toEqual(['#7FC97F', '#FDC086']);
    const otherId = await catalog.create(other, {
      name: 'Primera',
      description: '',
    });
    expect((await db.codes.get(otherId))?.color).toBe('#7FC97F');
  } finally {
    await db.delete();
  }
});
