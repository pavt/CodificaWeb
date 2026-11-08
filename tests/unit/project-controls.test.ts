// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, test, vi } from 'vitest';
import { handleProjectRequest } from '../../src/background/project-messages';
import { handleCodingRequest } from '../../src/background/coding-messages';
import { mountProjects } from '../../src/panel/project-controls';

afterEach(() => vi.unstubAllGlobals());

test('Q01: crea, cambia, edita y confirma la eliminación del proyecto activo', async () => {
  document.body.innerHTML = `<fieldset id="projects">
    <select id="project-select"></select><input id="project-name">
    <textarea id="project-description"></textarea><p id="project-status"></p>
    <button id="project-create"></button><button id="project-save"></button>
    <button id="project-remove"></button></fieldset>`;
  const sendMessage = vi.fn(handleProjectRequest);
  const broadcast = vi.fn().mockResolvedValue(true);
  const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  vi.stubGlobal('confirm', confirm);
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: (message: Record<string, unknown>) =>
        message.type === 'project.changed'
          ? broadcast(message)
          : sendMessage(message),
      onMessage: { addListener: vi.fn() },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 7 }]),
      sendMessage: broadcast,
    },
  });
  const root = document.querySelector('fieldset') as HTMLFieldSetElement;
  const select = root.querySelector('select') as HTMLSelectElement;
  const name = root.querySelector('input') as HTMLInputElement;
  const button = (id: string) => root.querySelector(id) as HTMLButtonElement;
  const onActive = vi.fn();
  mountProjects(root, onActive);
  await vi.waitFor(() => expect(select.options).toHaveLength(1));
  const initial = select.value;
  name.value = 'Proyecto B';
  button('#project-create').click();
  await vi.waitFor(() => expect(select.options).toHaveLength(2));
  const second = [...select.options].find(
    (option) => option.value !== initial,
  )?.value;
  if (!second) throw new Error('Proyecto B no creado');
  select.value = second;
  select.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(onActive).toHaveBeenLastCalledWith(second));
  expect(
    await handleCodingRequest({
      type: 'highlight.read',
      projectId: initial,
      url: 'https://example.test/',
      filter: null,
    }),
  ).toEqual({ kind: 'error' });
  name.value = 'Renombrado';
  button('#project-save').click();
  await vi.waitFor(() =>
    expect(select.selectedOptions[0]?.text).toBe('Renombrado'),
  );
  button('#project-remove').click();
  expect(select.options).toHaveLength(2);
  button('#project-remove').click();
  await vi.waitFor(() => expect(select.options).toHaveLength(1));
  expect(onActive).toHaveBeenLastCalledWith(initial);
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(broadcast).toHaveBeenCalledWith(
    7,
    { type: 'highlight.project' },
    { frameId: 0 },
  );
  expect(
    await handleProjectRequest({
      type: 'project.update',
      name: ' ',
      description: '',
    }),
  ).toEqual({ kind: 'error' });
  expect(await handleProjectRequest({ type: 'project.select' })).toEqual({
    kind: 'error',
  });
  expect(await handleProjectRequest({ type: 'project.unknown' })).toEqual({
    kind: 'error',
  });
});
