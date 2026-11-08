import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import fixture from '../../docs/examples/project-v1.json' with { type: 'json' };
import { IndexedCatalog } from '../../src/storage/indexed-catalog';
import { CodingDatabase } from '../../src/storage/database';
import { ProjectTransfer } from '../../src/storage/project-transfer';

test('Q10: importa el ejemplo, remapea vínculos y exporta una copia que se puede volver a importar', async () => {
  const db = new CodingDatabase(`transfer-${crypto.randomUUID()}`);
  try {
    const transfer = new ProjectTransfer(db);
    const original = structuredClone(fixture);
    const firstCode = original.codes[0];
    if (!firstCode) throw new Error('Categoría de ejemplo ausente');
    firstCode.color = '#7FC97F';
    const id = await transfer.importCopy(JSON.stringify(original));
    expect(id).not.toBe(fixture.project.id);
    const catalog = new IndexedCatalog(db);
    const added = await catalog.create(id, {
      name: 'Nueva categoría',
      description: '',
    });
    const result = await transfer.exportProject(id);
    expect(result.codes.find(({ id }) => id === added)?.color).toBe('#BEAED4');
    for (const code of original.codes) {
      expect(result.codes.find(({ name }) => name === code.name)?.color).toBe(
        code.color,
      );
    }
    expect(result.project).toEqual({ ...fixture.project, id });
    expect(result.sources[0]).toMatchObject({
      projectId: id,
      url: fixture.sources[0]?.url,
    });
    expect(result.annotations[0]).toMatchObject({
      sourceId: result.sources[0]?.id,
      note: fixture.annotations[0]?.note,
      selectors: fixture.annotations[0]?.selectors,
    });
    expect(result.codings.map(({ codeId }) => codeId).sort()).toEqual(
      result.codes
        .filter(({ id }) => id !== added)
        .map(({ id }) => id)
        .sort(),
    );
    expect(
      result.codings.every(
        ({ annotationId }) => annotationId === result.annotations[0]?.id,
      ),
    ).toBe(true);
    const copyId = await transfer.importCopy(JSON.stringify(result));
    expect(copyId).not.toBe(id);
    const copy = await transfer.exportProject(copyId);
    expect(copy.sources[0]?.id).not.toBe(result.sources[0]?.id);
    expect(copy.codings).toHaveLength(2);
  } finally {
    await db.delete();
  }
});

test('Q10: rechaza referencias rotas y revierte un fallo en la última escritura', async () => {
  const db = new CodingDatabase(`transfer-${crypto.randomUUID()}`);
  try {
    const transfer = new ProjectTransfer(db);
    const invalid = structuredClone(fixture);
    const coding = invalid.codings[0];
    if (!coding) throw new Error('Fixture sin asociación');
    coding.codeId = '00000000-0000-4000-8000-000000000099';
    await expect(
      transfer.importCopy(JSON.stringify(invalid)),
    ).rejects.toThrow();
    const fail = () => {
      throw new Error('Fallo simulado de escritura');
    };
    db.codings.hook('creating', fail);
    await expect(
      transfer.importCopy(JSON.stringify(fixture)),
    ).rejects.toThrow();
    expect(await db.projects.count()).toBe(1);
    expect(await db.sources.count()).toBe(0);
    expect(await db.codes.count()).toBe(2);
    expect(await db.annotations.count()).toBe(0);
    expect(await db.codings.count()).toBe(0);
  } finally {
    await db.delete();
  }
});
