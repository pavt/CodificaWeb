import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { CodingDatabase, initialProjectId } from '../../src/storage/database';
import { IndexedCodings } from '../../src/storage/indexed-codings';
import type { Fragment } from '../../src/domain/codings';

const theme = '00000000-0000-4000-8000-000000000003';
const context = '00000000-0000-4000-8000-000000000004';
const fragment: Fragment = {
  url: 'https://example.test/articulo',
  selectors: {
    profile: 'dom-text-v1',
    quote: { type: 'TextQuoteSelector', exact: 'cita', prefix: '', suffix: '' },
    position: { type: 'TextPositionSelector', start: 0, end: 4 },
  },
};
let db: CodingDatabase;
let repository: IndexedCodings;

beforeEach(() => {
  db = new CodingDatabase(`codificaweb-test-${crypto.randomUUID()}`);
  repository = new IndexedCodings(db);
});
afterEach(async () => {
  await db.delete();
});

const set = (
  codeId: string,
  assigned: boolean,
  operationId = crypto.randomUUID(),
) => repository.set(initialProjectId, fragment, codeId, assigned, operationId);

test('Q12: conserva códigos y procedencia al cerrar y reabrir la conexión', async () => {
  await set(theme, true);
  const reopened = new CodingDatabase(db.name);
  db.close();
  try {
    const restored = new IndexedCodings(reopened);
    expect(await restored.read(initialProjectId, fragment)).toMatchObject([
      { id: theme, assigned: true },
      { id: context, assigned: false },
    ]);
    expect(
      await restored.highlights(initialProjectId, fragment.url, theme),
    ).toMatchObject([{ color: '#FDD835', selectors: fragment.selectors }]);
    expect(await reopened.sources.toArray()).toMatchObject([
      { projectId: initialProjectId, url: fragment.url },
    ]);
  } finally {
    reopened.close();
  }
});

test('Q12: las escrituras concurrentes comparten fuente y anotación y mantienen asociaciones únicas', async () => {
  const otherDb = new CodingDatabase(db.name);
  try {
    const other = new IndexedCodings(otherDb);
    await Promise.all([
      set(theme, true),
      other.set(initialProjectId, fragment, context, true, crypto.randomUUID()),
      set(theme, true),
    ]);
    expect(await db.sources.count()).toBe(1);
    expect(await db.annotations.count()).toBe(1);
    expect(await db.codings.count()).toBe(2);
    const [coding] = await db.codings.toArray();
    if (!coding) throw new Error('Asociación ausente');
    await expect(
      db.codings.add({ ...coding, id: crypto.randomUUID() }),
    ).rejects.toMatchObject({ name: 'ConstraintError' });
  } finally {
    otherDb.close();
  }
});

test('Q12: el reintento de un ACK perdido no deshace una retirada posterior', async () => {
  const operation = crypto.randomUUID();
  await set(theme, true, operation);
  await set(theme, false);
  expect(await set(theme, true, operation)).toMatchObject([
    { assigned: false },
    { assigned: false },
  ]);
  expect(await db.codings.count()).toBe(0);
  expect(await db.annotations.count()).toBe(1);
  await expect(set(context, true, operation)).rejects.toThrow(
    'Operación reutilizada',
  );
});

test('Q12: revierte fuente, anotación, asociación y recibo cuando falla la transacción', async () => {
  const operation = crypto.randomUUID();
  const fail = () => {
    throw new Error('Fallo al escribir el recibo');
  };
  db.operations.hook('creating', fail);
  await expect(set(theme, true, operation)).rejects.toThrow(
    'Fallo al escribir el recibo',
  );
  for (const table of [db.sources, db.annotations, db.codings, db.operations]) {
    expect(await table.count()).toBe(0);
  }
  db.operations.hook('creating').unsubscribe(fail);
  await expect(set(theme, true, operation)).resolves.toMatchObject([
    { assigned: true },
    { assigned: false },
  ]);
});

test('Q12: rechaza códigos fuera del proyecto y no crea registros huérfanos', async () => {
  const catalog = await db.codes.get(theme);
  if (!catalog) throw new Error('Catálogo ausente');
  await db.codes.add({ ...catalog, id: 'externo', projectId: 'otro-proyecto' });
  await expect(set('externo', true)).rejects.toThrow(
    'Código fuera del proyecto.',
  );
  expect(await db.sources.count()).toBe(0);
  expect(await db.operations.count()).toBe(0);
});

test('Q04–Q05: aísla fuentes y posiciones y aplica el filtro al catálogo persistido', async () => {
  await set(theme, true);
  await set(context, true);
  const otherSource = { ...fragment, url: 'https://example.test/otra' };
  const otherRange = {
    ...fragment,
    selectors: {
      ...fragment.selectors,
      position: { ...fragment.selectors.position, start: 5, end: 9 },
    },
  };
  expect(
    (await repository.read(initialProjectId, otherSource)).every(
      (code) => !code.assigned,
    ),
  ).toBe(true);
  expect(
    (await repository.read(initialProjectId, otherRange)).every(
      (code) => !code.assigned,
    ),
  ).toBe(true);
  expect(
    await repository.highlights(initialProjectId, fragment.url, null),
  ).toMatchObject([{ color: '#FDD835' }]);
  expect(
    await repository.highlights(initialProjectId, fragment.url, context),
  ).toMatchObject([{ color: '#81D4FA' }]);
  expect(
    await repository.highlights(initialProjectId, fragment.url, 'ajeno'),
  ).toEqual([]);
  await set(theme, false);
  await set(theme, false);
  expect(
    await repository.highlights(initialProjectId, fragment.url, null),
  ).toMatchObject([{ color: '#81D4FA' }]);
});

test('Q12: retirar un código de una fuente nueva no crea una anotación', async () => {
  await set(theme, false);
  expect(await db.sources.count()).toBe(0);
  expect(await db.annotations.count()).toBe(0);
  expect(await db.codings.count()).toBe(0);
});
