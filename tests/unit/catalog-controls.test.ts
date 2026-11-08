// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, test, vi } from 'vitest';
import { handleCodeRequest } from '../../src/background/code-messages';
import { initialProjectId } from '../../src/storage/database';
import { mountCatalog } from '../../src/panel/catalog-controls';

afterEach(() => vi.unstubAllGlobals());

test('Q02: el panel crea, edita y elimina un código tras confirmar', async () => {
  document.body.innerHTML = `<fieldset><select id="catalog-select"></select>
    <input id="catalog-name"><textarea id="catalog-description"></textarea>
    <input id="catalog-color" readonly><p id="catalog-status"></p>
    <button id="catalog-create"></button><button id="catalog-save"></button>
    <button id="catalog-remove"></button></fieldset>`;
  const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  vi.stubGlobal('confirm', confirm);
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: async (message: Record<string, unknown>) =>
        message.type === 'code.changed'
          ? undefined
          : handleCodeRequest(message),
      onMessage: { addListener: vi.fn() },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 7 }]),
      sendMessage: vi.fn(),
    },
  });
  const root = document.querySelector('fieldset') as HTMLFieldSetElement;
  const select = root.querySelector('select') as HTMLSelectElement;
  const name = root.querySelector('#catalog-name') as HTMLInputElement;
  const color = root.querySelector('#catalog-color') as HTMLInputElement;
  const button = (id: string) => root.querySelector(id) as HTMLButtonElement;
  const onChanged = vi.fn();
  const setProject = mountCatalog(root, onChanged);
  setProject(initialProjectId);
  await vi.waitFor(() => expect(select.options).toHaveLength(3));
  button('#catalog-create').click();
  await vi.waitFor(() =>
    expect(root.querySelector('#catalog-status')?.textContent).toContain(
      'No se pudo',
    ),
  );
  name.value = 'Nuevo tema';
  button('#catalog-create').click();
  await vi.waitFor(() => expect(select.options).toHaveLength(4));
  const id = [...select.options].find(
    (option) => option.text === 'Nuevo tema',
  )?.value;
  if (!id) throw new Error('Código de prueba ausente');
  select.value = id;
  select.dispatchEvent(new Event('change'));
  expect(color.value).toBe('#FDC086');
  name.value = 'Editado';
  button('#catalog-save').click();
  await vi.waitFor(() =>
    expect(select.selectedOptions[0]?.text).toBe('Editado'),
  );
  expect(color.value).toBe('#FDC086');
  button('#catalog-remove').click();
  expect(select.options).toHaveLength(4);
  button('#catalog-remove').click();
  await vi.waitFor(() => expect(select.options).toHaveLength(3));
  expect(onChanged).toHaveBeenCalledTimes(3);
  expect(
    await handleCodeRequest({ type: 'code.list', projectId: 'ajeno' }),
  ).toEqual({ kind: 'error' });
  expect(
    await handleCodeRequest({
      type: 'code.update',
      projectId: initialProjectId,
    }),
  ).toEqual({ kind: 'error' });
  setProject(null);
  expect(root.disabled).toBe(true);
});
