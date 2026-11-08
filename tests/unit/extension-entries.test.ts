import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

test('Q11: el botón de la extensión abre el panel lateral', async () => {
  const setPanelBehavior = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', {
    sidePanel: { setPanelBehavior },
    runtime: { onMessage: { addListener: vi.fn() } },
  });
  await import('../../src/background');
  expect(setPanelBehavior).toHaveBeenCalledWith({
    openPanelOnActionClick: true,
  });
});

test('Q11: solicita acceso al enviar el formulario y muestra errores de Chromium', async () => {
  const form = new EventTarget();
  const input = { value: 'https://example.test/' };
  const status = { textContent: '' };
  const button = { disabled: false };
  const elements = new Map<string, unknown>([
    ['site-access', form],
    ['site-url', input],
    ['site-status', status],
    ['verify-site', button],
    ['capture-selection', new EventTarget()],
    ['capture-status', { textContent: '' }],
    ['selection-quote', { textContent: '' }],
    ['fragment-codes', { disabled: true }],
    ['coding-options', { replaceChildren: vi.fn() }],
    ['coding-status', { textContent: '' }],
    ['selection-source', { textContent: '' }],
  ]);
  const request = vi
    .fn()
    .mockResolvedValueOnce(false)
    .mockRejectedValueOnce(new Error('restricted'));
  vi.stubGlobal('chrome', { permissions: { request } });
  vi.stubGlobal('document', {
    getElementById: (id: string) => elements.get(id),
  });
  await import('../../src/panel/index');

  const submit = new Event('submit', { cancelable: true });
  form.dispatchEvent(submit);
  expect(submit.defaultPrevented).toBe(true);
  expect(request).toHaveBeenCalledOnce();
  expect(button.disabled).toBe(true);
  await vi.waitFor(() => expect(status.textContent).toBe('Permiso denegado.'));
  expect(button.disabled).toBe(false);

  form.dispatchEvent(new Event('submit'));
  await vi.waitFor(() =>
    expect(status.textContent).toBe(
      'Chromium no permitió comprobar el acceso al sitio.',
    ),
  );
  expect(button.disabled).toBe(false);
});

test('Q03: instala la captura en el documento autorizado y muestra la cita como texto', async () => {
  vi.resetModules();
  const form = new EventTarget();
  const captureButton = Object.assign(new EventTarget(), { disabled: true });
  const status = { textContent: '' };
  const quote = { textContent: '' };
  const source = { textContent: '' };
  const url = 'https://example.test/articulo';
  const elements = new Map<string, unknown>([
    ['site-access', form],
    ['site-url', { value: url }],
    ['site-status', { textContent: '' }],
    ['verify-site', { disabled: false }],
    ['capture-selection', captureButton],
    ['capture-status', status],
    ['selection-quote', quote],
    ['fragment-codes', { disabled: true }],
    ['coding-options', { replaceChildren: vi.fn() }],
    ['coding-status', { textContent: '' }],
    ['selection-source', source],
  ]);
  const executeScript = vi
    .fn()
    .mockResolvedValueOnce([{ result: true, documentId: 'documento' }])
    .mockResolvedValueOnce([]);
  const sendMessage = vi
    .fn()
    .mockResolvedValueOnce({
      kind: 'selection',
      url,
      revision: 0,
      selectors: {
        profile: 'dom-text-v1',
        quote: {
          type: 'TextQuoteSelector',
          exact: '<b>cita</b>',
          prefix: '',
          suffix: '',
        },
        position: { type: 'TextPositionSelector', start: 0, end: 11 },
      },
    })
    .mockResolvedValueOnce({ kind: 'excluded' });
  vi.stubGlobal('chrome', {
    permissions: { request: vi.fn().mockResolvedValue(true) },
    scripting: { executeScript },
    runtime: {
      sendMessage: vi.fn().mockResolvedValue({ kind: 'codings', codes: [] }),
    },
    tabs: { query: vi.fn().mockResolvedValue([{ id: 7, url }]), sendMessage },
  });
  vi.stubGlobal('document', {
    getElementById: (id: string) => elements.get(id),
  });
  await import('../../src/panel/index');
  form.dispatchEvent(new Event('submit'));
  await vi.waitFor(() => expect(captureButton.disabled).toBe(false));
  expect(executeScript).toHaveBeenLastCalledWith({
    target: { tabId: 7, documentIds: ['documento'] },
    files: ['content.js'],
  });

  captureButton.dispatchEvent(new Event('click'));
  await vi.waitFor(() =>
    expect(status.textContent).toBe('Selección capturada.'),
  );
  expect(quote.textContent).toBe('<b>cita</b>');
  expect(source.textContent).toBe(url);

  captureButton.dispatchEvent(new Event('click'));
  await vi.waitFor(() =>
    expect(status.textContent).toContain('contenido editable'),
  );
  expect(quote.textContent).toBe('');
  expect(source.textContent).toBe('');
});
