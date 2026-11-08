import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import fixture from '../../docs/examples/project-v1.json' with { type: 'json' };
import { IndexedRelations } from '../../src/storage/indexed-relations';
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

test('Q10: exporta v2 y remapea los tipos y extremos al importar una copia', async () => {
  const db = new CodingDatabase(crypto.randomUUID());
  try {
    const transfer = new ProjectTransfer(db);
    const projectId = await transfer.importCopy(JSON.stringify(fixture));
    const original = await transfer.exportProject(projectId);
    expect(original).toMatchObject({
      schemaVersion: 2,
      relationTypes: [],
      quotationLinks: [],
    });
    const [source] = original.sources;
    const [citation] = original.annotations;
    if (!source || !citation) throw new Error('Fixture incompleto');
    const otherSource = {
      ...source,
      id: crypto.randomUUID(),
      url: 'https://example.test/otra',
    };
    const otherCitation = {
      ...citation,
      id: crypto.randomUUID(),
      sourceId: otherSource.id,
    };
    await db.sources.add(otherSource);
    await db.annotations.add({
      ...otherCitation,
      start: citation.selectors.position.start,
      end: citation.selectors.position.end,
    });
    const relations = new IndexedRelations(db);
    const endpoints = {
      fromAnnotationId: citation.id,
      toAnnotationId: otherCitation.id,
    };
    const direct = await relations.createWithType(
      projectId,
      { ...endpoints, note: 'Razón' },
      { name: 'Matiza', direction: 'directed', description: 'Añade contexto' },
    );
    const symmetric = await relations.createWithType(projectId, endpoints, {
      name: 'Coincide',
      direction: 'symmetric',
    });
    const exported = await transfer.exportProject(projectId);
    expect(exported.relationTypes).toHaveLength(2);
    expect(exported.relationTypes.every((type) => !('nameKey' in type))).toBe(
      true,
    );

    const portable = {
      ...exported,
      relationTypes: exported.relationTypes.map((type) =>
        type.direction === 'symmetric'
          ? { ...type, description: undefined }
          : type,
      ),
      quotationLinks: exported.quotationLinks.map((link) =>
        link.id === symmetric.id ? { ...link, note: undefined } : link,
      ),
    };
    const copyId = await transfer.importCopy(JSON.stringify(portable));
    const copy = await transfer.exportProject(copyId);
    const copyType = copy.relationTypes.find(({ name }) => name === 'Matiza');
    const copyDirect = copy.quotationLinks.find(
      ({ relationTypeId }) => relationTypeId === copyType?.id,
    );
    expect(copyDirect).toMatchObject({ projectId: copyId, note: 'Razón' });
    expect(copyDirect?.id).not.toBe(direct.id);
    expect(copyType?.id).not.toBe(direct.relationTypeId);
    expect(copyType?.description).toBe('Añade contexto');
    expect(copyDirect?.fromAnnotationId).not.toBe(citation.id);
    const copyLinks = await relations.listByCitation(
      copyId,
      copyDirect?.fromAnnotationId ?? '',
    );
    expect(copyLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          direction: 'outgoing',
          from: expect.objectContaining({
            source: expect.objectContaining({ url: source.url }),
          }),
          to: expect.objectContaining({
            source: expect.objectContaining({ url: otherSource.url }),
          }),
        }),
        expect.objectContaining({ direction: 'symmetric' }),
      ]),
    );
    const [copySymmetric] = copy.quotationLinks.filter(
      ({ id }) => id !== copyDirect?.id,
    );
    if (!copySymmetric) throw new Error('Falta vínculo simétrico');
    expect(copySymmetric.id).not.toBe(symmetric.id);
    expect(copySymmetric.fromAnnotationId < copySymmetric.toAnnotationId).toBe(
      true,
    );

    const [link] = exported.quotationLinks;
    const [type] = exported.relationTypes;
    if (!link || !type) throw new Error('Exportación incompleta');
    const invalid = [
      { ...exported, relationTypes: undefined },
      { ...exported, quotationLinks: undefined },
      { ...exported, relationTypes: [{ ...type, direction: 'arbitraria' }] },
      {
        ...exported,
        relationTypes: [
          type,
          {
            ...type,
            id: crypto.randomUUID(),
            name: ' ' + type.name.toUpperCase(),
          },
        ],
      },
      { ...exported, relationTypes: [...exported.relationTypes, type] },
      {
        ...exported,
        quotationLinks: [{ ...link, fromAnnotationId: crypto.randomUUID() }],
      },
      {
        ...exported,
        quotationLinks: [{ ...link, toAnnotationId: crypto.randomUUID() }],
      },
      {
        ...exported,
        quotationLinks: [{ ...link, toAnnotationId: link.fromAnnotationId }],
      },
      {
        ...exported,
        quotationLinks: [{ ...link, relationTypeId: crypto.randomUUID() }],
      },
      {
        ...exported,
        quotationLinks: [{ ...link, projectId: crypto.randomUUID() }],
      },
      { ...exported, quotationLinks: [...exported.quotationLinks, link] },
      {
        ...exported,
        quotationLinks: [
          ...exported.quotationLinks,
          {
            ...symmetric,
            id: crypto.randomUUID(),
            fromAnnotationId: symmetric.toAnnotationId,
            toAnnotationId: symmetric.fromAnnotationId,
          },
        ],
      },
    ];
    const tables = [
      db.projects,
      db.sources,
      db.annotations,
      db.relationTypes,
      db.quotationLinks,
    ];
    const counts = await Promise.all(tables.map((table) => table.count()));
    for (const value of invalid)
      await expect(
        transfer.importCopy(JSON.stringify(value)),
      ).rejects.toThrow();
    db.quotationLinks.hook('creating', () => {
      throw new Error('Fallo al guardar vínculo');
    });
    await expect(
      transfer.importCopy(JSON.stringify(exported)),
    ).rejects.toThrow();
    expect(await Promise.all(tables.map((table) => table.count()))).toEqual(
      counts,
    );
  } finally {
    await db.delete();
  }
});
