import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { CodingDatabase, initialProjectId } from '../../src/storage/database';
import { IndexedCatalog } from '../../src/storage/indexed-catalog';
import { IndexedCodings } from '../../src/storage/indexed-codings';
import type { Fragment } from '../../src/domain/codings';

test('Q02: reutiliza un código en dos fuentes, cambia el color y elimina solo las asociaciones', async () => {
  const db = new CodingDatabase(`catalog-${crypto.randomUUID()}`);
  try {
    const catalog = new IndexedCatalog(db);
    const codings = new IndexedCodings(db);
    const code = await catalog.create(initialProjectId, {
      name: '  Café ',
      description: 'Descripción',
      color: '#aabbcc',
    });
    await expect(
      catalog.create(initialProjectId, {
        name: 'CAFE\u0301',
        description: '',
        color: '#000000',
      }),
    ).rejects.toMatchObject({ name: 'ConstraintError' });
    expect(await catalog.list(initialProjectId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: code, name: 'Café', color: '#AABBCC' }),
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
        color: '#111111',
      }),
    ).rejects.toThrow();
    await expect(catalog.remove('ajeno', code)).rejects.toThrow();
    await catalog.update(initialProjectId, code, {
      name: 'Editado',
      description: 'Nueva',
      color: '#112233',
    });
    for (const fragment of fragments) {
      expect(
        await codings.highlights(initialProjectId, fragment.url, code),
      ).toMatchObject([{ color: '#112233' }]);
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
