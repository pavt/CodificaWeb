// @vitest-environment jsdom

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { handleCodingRequest } from '../../src/background/coding-messages';
import type { SelectionSnapshot } from '../../src/capture-contract';
import { createCodingControls } from '../../src/panel/coding-controls';

const snapshot: SelectionSnapshot = {
  kind: 'selection',
  revision: 1,
  url: 'https://example.test/panel',
  selectors: {
    profile: 'dom-text-v1',
    quote: { type: 'TextQuoteSelector', exact: 'cita', prefix: '', suffix: '' },
    position: { type: 'TextPositionSelector', start: 0, end: 4 },
  },
};
const target = { tabId: 7, documentId: 'documento', url: snapshot.url };
const sendMessage = vi.fn();
const read = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  document.body.replaceChildren();

  sendMessage.mockImplementation(async (request) =>
    handleCodingRequest(request),
  );
  read.mockResolvedValue(snapshot);
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    tabs: {
      sendMessage: read,
      query: vi.fn().mockResolvedValue([{ id: 7, url: snapshot.url }]),
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

function panel() {
  const fieldset = document.createElement('fieldset');
  const options = document.createElement('div');
  const status = document.createElement('p');
  fieldset.append(options, status);
  document.body.append(fieldset);

  const controls = createCodingControls(fieldset, options, status);
  function code(name: string) {
    const label = [...options.querySelectorAll('label')].find(
      (label) => label.textContent === name,
    );
    const checkbox = label?.querySelector('input');
    if (!checkbox) throw new Error('Código inicial ausente');
    return checkbox;
  }
  return { ...controls, fieldset, status, code };
}

test('Q04: el panel consulta y modifica dos códigos mediante el adaptador del worker', async () => {
  const view = panel();
  await view.show(target, snapshot);
  expect(view.fieldset.disabled).toBe(false);
  view.code('Tema').click();
  await vi.waitFor(() => expect(view.code('Tema').checked).toBe(true));
  view.code('Contexto').click();
  await vi.waitFor(() => expect(view.code('Contexto').checked).toBe(true));
  expect(view.code('Tema').checked).toBe(true);

  await view.show(target, snapshot);
  expect(view.code('Tema').checked).toBe(true);
  expect(view.code('Contexto').checked).toBe(true);
  view.code('Tema').click();
  await vi.waitFor(() => expect(view.code('Tema').checked).toBe(false));
  expect(view.code('Contexto').checked).toBe(true);
  view.code('Contexto').click();
  await vi.waitFor(() => expect(view.code('Contexto').checked).toBe(false));
});

test('Q04: rechaza una asignación si cambió la revisión y no envía la mutación', async () => {
  const view = panel();
  await view.show(target, snapshot);
  read.mockResolvedValue({ ...snapshot, revision: 2 });
  view.code('Tema').click();
  await vi.waitFor(() =>
    expect(view.status.textContent).toContain('La selección cambió'),
  );
  expect(view.fieldset.disabled).toBe(true);
  expect(sendMessage).toHaveBeenCalledOnce();
});

test('Q04: muestra error si falla la actualización o el catálogo no es válido', async () => {
  const view = panel();
  await view.show(target, snapshot);
  sendMessage.mockResolvedValueOnce({ kind: 'error' });
  view.code('Tema').click();
  await vi.waitFor(() =>
    expect(view.status.textContent).toContain('No se pudieron actualizar'),
  );
  expect(view.fieldset.disabled).toBe(true);
  sendMessage.mockResolvedValueOnce({
    kind: 'codings',
    codes: [{ id: 'incompleto' }],
  });
  await view.show(target, snapshot);
  expect(view.status.textContent).toContain('No se pudieron consultar');
  expect(view.fieldset.disabled).toBe(true);
});
