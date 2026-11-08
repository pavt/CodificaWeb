// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, test, vi } from 'vitest';
import fixture from '../../docs/examples/project-v1.json' with { type: 'json' };
import { handleTransferRequest } from '../../src/background/transfer-messages';
import { initialProjectId } from '../../src/storage/database';
import { mountTransfer } from '../../src/panel/transfer-controls';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test('Q10: importa como copia desde el selector y descarga el proyecto activo', async () => {
  document.body.innerHTML = `<div><input id="project-file" type="file">
    <button id="project-import"></button><button id="project-export"></button>
    <p id="transfer-status"></p></div>`;
  const sendMessage = vi.fn(async (message: Record<string, unknown>) =>
    message.type === 'project.changed'
      ? undefined
      : handleTransferRequest(message),
  );
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  const root = document.querySelector('div') as HTMLElement;
  const file = root.querySelector('input') as HTMLInputElement;
  const importButton = root.querySelector(
    '#project-import',
  ) as HTMLButtonElement;
  const exportButton = root.querySelector(
    '#project-export',
  ) as HTMLButtonElement;
  const status = root.querySelector('p') as HTMLElement;
  const setProject = mountTransfer(root);
  setProject(null);
  expect(exportButton.disabled).toBe(true);
  expect(importButton.disabled).toBe(true);

  function selectFile(json: string) {
    const buffer = new TextEncoder().encode(json);
    Object.defineProperty(file, 'files', {
      configurable: true,
      value: [{ size: buffer.byteLength, arrayBuffer: async () => buffer }],
    });
    file.dispatchEvent(new Event('change'));
  }
  selectFile('inválido');
  importButton.click();
  await vi.waitFor(() =>
    expect(status.textContent).toContain('No se pudo importar'),
  );
  selectFile(JSON.stringify(fixture));
  importButton.click();
  await vi.waitFor(() =>
    expect(status.textContent).toBe('Copia del proyecto importada.'),
  );

  const createObjectURL = vi.fn().mockReturnValue('blob:fixture');
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = vi.fn();
    },
  );
  const download = vi
    .spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  setProject(initialProjectId);
  exportButton.click();
  await vi.waitFor(() =>
    expect(status.textContent).toBe('Proyecto exportado.'),
  );
  expect(createObjectURL).toHaveBeenCalledOnce();
  expect(download).toHaveBeenCalledOnce();
  expect(
    await handleTransferRequest({
      type: 'transfer.export',
      projectId: 'ajeno',
    }),
  ).toEqual({ kind: 'error' });
});
