// @vitest-environment jsdom

import 'fake-indexeddb/auto';

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { initialProjectId } from '../../src/storage/database';
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
  const form = document.createElement('form');
  form.id = 'category-create';
  form.innerHTML =
    '<input name="name" required><textarea name="description"></textarea><input name="color" type="color" value="#fdd835"><button type="submit">Guardar y aplicar</button>';
  const assign = document.createElement('div');
  assign.id = 'category-assign';
  assign.append(options);
  const editor = document.createElement('form');
  editor.id = 'category-edit-definition';
  editor.hidden = true;
  editor.innerHTML =
    '<h3 id="definition-title"></h3><textarea></textarea><button id="definition-cancel" type="button">Cancelar</button>';
  fieldset.append(assign, form, editor, status);
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
  return { ...controls, fieldset, status, code, editor };
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

test('Q12: un fallo de transporte reintenta la misma mutación con el mismo identificador', async () => {
  const view = panel();
  await view.show(target, snapshot);
  sendMessage.mockImplementationOnce(async (message) => {
    const result = await handleCodingRequest(message);
    expect(result.kind).toBe('codings');
    throw new Error('Se perdió el ACK después del commit');
  });
  view.code('Tema').click();
  await vi.waitFor(() => expect(view.code('Tema').checked).toBe(true));
  const first = sendMessage.mock.calls[1]?.[0];
  const retry = sendMessage.mock.calls[2]?.[0];
  expect(first).toMatchObject({
    type: 'coding.set',
    operationId: expect.any(String),
  });
  expect(retry).toEqual(first);
  view.code('Tema').click();
  await vi.waitFor(() => expect(view.code('Tema').checked).toBe(false));
});

test('T016: conserva el formulario y reintenta con la misma operación', async () => {
  const view = panel();
  await view.show({ ...target, projectId: initialProjectId }, snapshot);
  const form = view.fieldset.querySelector('form');
  if (!form) throw new Error('Formulario ausente');
  const name = form.elements.namedItem('name') as HTMLInputElement;
  const definition = form.elements.namedItem(
    'description',
  ) as HTMLTextAreaElement;
  const color = form.elements.namedItem('color') as HTMLInputElement;
  name.value = 'Categoría tras reintento';
  definition.value = 'Definición local';
  color.value = '#126abc';

  sendMessage.mockResolvedValueOnce({ kind: 'error' });
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(view.status.textContent).toContain('Vuelve a intentarlo'),
  );
  expect(view.fieldset.disabled).toBe(false);
  expect(name.value).toBe('Categoría tras reintento');
  expect(definition.value).toBe('Definición local');
  expect(color.value).toBe('#126abc');
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  await vi.waitFor(() =>
    expect(view.code('Categoría tras reintento').checked).toBe(true),
  );
  expect(sendMessage.mock.calls[2]).toEqual(sendMessage.mock.calls[1]);
});

test('T016: permite añadir la definición después de aplicar y conserva el borrador si falla', async () => {
  const view = panel();
  await view.show({ ...target, projectId: initialProjectId }, snapshot);
  view.code('Tema').click();
  await vi.waitFor(() => expect(view.code('Tema').checked).toBe(true));
  const edit = view.fieldset.querySelector<HTMLButtonElement>(
    '[aria-label="Añadir definición de Tema"]',
  );
  if (!edit) throw new Error('Acción de definición ausente');
  edit.click();
  const cancel =
    view.editor.querySelector<HTMLButtonElement>('#definition-cancel');
  cancel?.click();
  expect(view.editor.hidden).toBe(true);
  edit.click();
  const field = view.editor.querySelector('textarea');
  if (!field) throw new Error('Campo de definición ausente');
  expect(field.value).toBe('');
  field.value = 'Concepto principal';
  sendMessage.mockResolvedValueOnce({ kind: 'error' });
  const submit = () =>
    view.editor.dispatchEvent(new Event('submit', { cancelable: true }));
  submit();
  await vi.waitFor(() =>
    expect(view.status.textContent).toContain('No se pudo guardar'),
  );
  expect(view.editor.hidden).toBe(false);
  expect(field.value).toBe('Concepto principal');
  submit();
  await vi.waitFor(() =>
    expect(view.status.textContent).toBe('Definición guardada.'),
  );
  expect(view.editor.hidden).toBe(true);
  await view.show({ ...target, projectId: initialProjectId }, snapshot);
  expect(view.fieldset.textContent).toContain('Concepto principal');
  expect(view.code('Tema').checked).toBe(true);
});

test('T017: no devuelve el foco a la categoría si el usuario pulsa fuera mientras guarda', async () => {
  const view = panel();
  await view.show(target, snapshot);
  const initial = view.code('Contexto').checked;
  let release!: () => void;
  read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve(snapshot);
      }),
  );
  view.code('Contexto').focus();
  view.code('Contexto').click();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  release();
  await vi.waitFor(() => expect(view.code('Contexto').checked).toBe(!initial));
  expect(document.activeElement).toBe(document.body);
});
