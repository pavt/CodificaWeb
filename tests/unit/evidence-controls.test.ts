// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { seedHistoricalNote } from '../fixtures/historical-note';
import { afterEach, expect, test, vi } from 'vitest';
import { database, projects } from '../../src/background/coding-messages';
import {
  handleEvidenceOpen,
  handleEvidenceSearch,
} from '../../src/background/evidence-messages';
import { initialProjectId } from '../../src/storage/database';
import { IndexedCodings } from '../../src/storage/indexed-codings';
import { mountEvidence } from '../../src/panel/evidence-controls';
import type { Fragment } from '../../src/domain/codings';

afterEach(() => vi.unstubAllGlobals());

test('Q08: busca en IndexedDB, combina filtros y limpia resultados al cambiar de proyecto', async () => {
  const codings = new IndexedCodings(database);
  const fragment = (path: string): Fragment => ({
    url: `https://example.test/${path}`,
    selectors: {
      profile: 'dom-text-v1',
      quote: {
        type: 'TextQuoteSelector',
        exact: 'Café',
        prefix: '',
        suffix: '',
      },
      position: { type: 'TextPositionSelector', start: 0, end: 4 },
    },
  });
  const theme = '00000000-0000-4000-8000-000000000003';
  await codings.set(
    initialProjectId,
    fragment('a'),
    theme,
    true,
    crypto.randomUUID(),
  );
  await seedHistoricalNote(
    database,
    initialProjectId,
    fragment('a'),
    '<b>literal</b>',
  );
  await seedHistoricalNote(
    database,
    initialProjectId,
    fragment('b'),
    'Otra nota',
  );
  const other = await projects.create('Otro', '');
  await seedHistoricalNote(database, other, fragment('ajena'), 'Otra nota');

  const saved = await database.annotations
    .where('projectId')
    .equals(initialProjectId)
    .first();
  if (!saved) throw new Error('Anotación ausente');
  const create = vi.fn().mockResolvedValue({ id: 7 });
  vi.stubGlobal('chrome', {
    tabs: { query: vi.fn().mockResolvedValue([]), create },
  });
  expect(
    await handleEvidenceOpen({ projectId: 'ajeno', id: saved.id }),
  ).toEqual({ kind: 'unavailable' });
  expect(await handleEvidenceOpen({ projectId: initialProjectId })).toEqual({
    kind: 'unavailable',
  });
  expect(
    await handleEvidenceOpen({ projectId: initialProjectId, id: 'ausente' }),
  ).toEqual({ kind: 'unavailable' });
  expect(
    await handleEvidenceOpen({ projectId: initialProjectId, id: saved.id }),
  ).toEqual({ kind: 'permission' });
  expect(create).toHaveBeenCalledOnce();

  const sendMessage = vi.fn(handleEvidenceSearch);
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  document.body.innerHTML = `<form><fieldset><input id="evidence-text">
    <select id="evidence-code"></select><select id="evidence-source"></select>
    </fieldset><p id="evidence-status"></p><ul id="evidence-results"></ul></form>`;
  const root = document.querySelector('form') as HTMLFormElement;
  const query = root.querySelector('input') as HTMLInputElement;
  const code = root.querySelector('#evidence-code') as HTMLSelectElement;
  const source = root.querySelector('#evidence-source') as HTMLSelectElement;
  const list = root.querySelector('ul') as HTMLUListElement;
  const status = root.querySelector('#evidence-status') as HTMLElement;
  const show = mountEvidence(root);
  show(initialProjectId);
  await vi.waitFor(() => expect(list.children).toHaveLength(2));
  expect(list.textContent).toContain('<b>literal</b>');
  expect(list.querySelector('b')).toBeNull();

  const sourceId = [...source.options].find((option) =>
    option.text.endsWith('/a'),
  )?.value;
  if (!sourceId) throw new Error('Fuente no encontrada');
  source.value = sourceId;
  code.value = theme;
  query.value = 'CAFE\u0301';
  root.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(list.children).toHaveLength(1));
  expect(list.textContent).toContain('/a');

  sendMessage.mockResolvedValueOnce({ kind: 'permission' });
  list.querySelector('button')?.click();
  await vi.waitFor(() =>
    expect(list.textContent).toContain('Autoriza el sitio'),
  );
  expect(sendMessage).toHaveBeenLastCalledWith({
    type: 'evidence.open',
    projectId: initialProjectId,
    id: expect.any(String),
  });
  expect(list.textContent).toContain('Café');

  query.value = 'no encontrado';
  root.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(status.textContent).toBe('Sin resultados.'));
  sendMessage.mockResolvedValueOnce({ kind: 'error' });
  root.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() => expect(status.textContent).toContain('No se pudo'));

  await projects.select(other);
  expect(
    await handleEvidenceSearch({
      projectId: initialProjectId,
      text: '',
      codeId: null,
      sourceId: null,
    }),
  ).toEqual({ kind: 'error' });
  show(other);
  await vi.waitFor(() => expect(list.children).toHaveLength(1));
  expect(list.textContent).toContain('/ajena');
  expect(query.value).toBe('');
  show(null);
  expect(list.children).toHaveLength(0);
});
