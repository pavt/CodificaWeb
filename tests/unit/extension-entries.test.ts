import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

test('Q11: el gesto de la extensión abre el panel de la pestaña invocada', async () => {
  const addListener =
    vi.fn<(listener: (tab: { id: number }) => void) => void>();
  const open = vi.fn().mockResolvedValue(undefined);
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  const setPanelBehavior = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', {
    action: { onClicked: { addListener } },
    sidePanel: { setPanelBehavior, open },
    runtime: {
      sendMessage,
      onMessage: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
    },
    permissions: { onRemoved: { addListener: vi.fn() } },
  });
  await import('../../src/background');
  expect(setPanelBehavior).toHaveBeenCalledWith({
    openPanelOnActionClick: false,
  });
  expect(addListener).toHaveBeenCalledOnce();
  addListener.mock.calls[0]?.[0]({ id: 7 });
  expect(open).toHaveBeenCalledWith({ tabId: 7 });
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
    ['fragment-codes', { disabled: true, querySelector: () => null }],
    ['coding-options', { replaceChildren: vi.fn() }],
    ['coding-status', { textContent: '' }],
    ['highlight-filter', new EventTarget()],
    ['highlight-status', { textContent: '' }],
    ['fragment-note', { disabled: true }],
    ['note-text', { value: '' }],
    ['note-save', new EventTarget()],
    ['note-remove', new EventTarget()],
    ['note-status', { textContent: '' }],
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
  const title = { textContent: '' };
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
    ['selection-title', title],
    ['fragment-codes', { disabled: true, querySelector: () => null }],
    ['coding-options', { replaceChildren: vi.fn() }],
    ['coding-status', { textContent: '' }],
    ['highlight-filter', new EventTarget()],
    ['highlight-status', { textContent: '' }],
    ['fragment-note', { disabled: true }],
    ['note-text', { value: '' }],
    ['note-save', new EventTarget()],
    ['note-remove', new EventTarget()],
    ['note-status', { textContent: '' }],
    ['selection-source', source],
  ]);
  const executeScript = vi
    .fn()
    .mockResolvedValueOnce([{ result: true, documentId: 'documento' }])
    .mockResolvedValueOnce([]);
  const sendMessage = vi
    .fn()
    .mockResolvedValueOnce(true)
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
    .mockResolvedValueOnce({ kind: 'excluded' })
    .mockResolvedValueOnce({ kind: 'empty' });
  vi.stubGlobal('chrome', {
    permissions: { request: vi.fn().mockResolvedValue(true) },
    scripting: { executeScript },
    runtime: {
      sendMessage: vi
        .fn()
        .mockResolvedValueOnce({ enabled: true })
        .mockResolvedValue({ kind: 'error' }),
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
  expect(title.textContent).toBe('Texto seleccionado');
  expect(source.textContent).toBe(url);

  captureButton.dispatchEvent(new Event('click'));
  await vi.waitFor(() =>
    expect(status.textContent).toContain('contenido editable'),
  );
  expect(quote.textContent).toBe('');
  expect(source.textContent).toBe('');

  captureButton.dispatchEvent(new Event('click'));
  await vi.waitFor(() =>
    expect(status.textContent).toContain('Selecciona texto'),
  );
  expect(title.textContent).toBe('Sin selección');
  expect(quote.textContent).toBe('');
});

test('Q03 y Q11: actualiza la selección directa y descarta pestañas o documentos obsoletos', async () => {
  vi.resetModules();
  const form = new EventTarget();
  const captureButton = Object.assign(new EventTarget(), { disabled: true });
  const quote = { textContent: '' };
  const status = { textContent: '' };
  const urlField = { hidden: false };
  const url = 'https://example.test/articulo';
  const selection = (exact: string) => ({
    kind: 'selection',
    url,
    revision: 0,
    selectors: {
      profile: 'dom-text-v1',
      quote: { type: 'TextQuoteSelector', exact, prefix: '', suffix: '' },
      position: { type: 'TextPositionSelector', start: 0, end: exact.length },
    },
  });
  const elements = new Map<string, unknown>([
    ['site-access', form],
    ['site-url', { value: '' }],
    ['site-url-field', urlField],
    ['site-status', status],
    ['verify-site', { disabled: false, textContent: '' }],
    ['capture-selection', captureButton],
    ['capture-status', { textContent: '' }],
    ['selection-quote', quote],
    ['selection-source', { textContent: '' }],
    ['fragment-codes', { disabled: true, querySelector: () => null }],
    ['coding-options', { replaceChildren: vi.fn() }],
    ['coding-status', { textContent: '' }],
    ['highlight-filter', new EventTarget()],
    ['highlight-status', { textContent: '' }],
    ['fragment-note', { disabled: true }],
    ['note-text', { value: '' }],
    ['note-save', new EventTarget()],
    ['note-remove', new EventTarget()],
    ['note-status', { textContent: '' }],
  ]);
  const onActivated = vi.fn<(listener: () => void) => void>();
  const onUpdated =
    vi.fn<
      (
        listener: (
          id: number,
          change: { status?: string; url?: string },
        ) => void,
      ) => void
    >();
  const onRemoved = vi.fn<(listener: () => void) => void>();
  const onMessage =
    vi.fn<
      (
        listener: (
          message: unknown,
          sender: chrome.runtime.MessageSender,
        ) => void,
      ) => void
    >();
  const query = vi.fn().mockResolvedValue([{ id: 7, url }]);
  const executeScript = vi.fn().mockResolvedValue([{ documentId: 'doc' }]);
  const sendMessage = vi
    .fn()
    .mockImplementation((_tab, message) =>
      Promise.resolve(
        message.type === 'capture.prepare' ? true : selection('Cita inicial'),
      ),
    );
  vi.stubGlobal('chrome', {
    tabs: {
      getCurrent: vi.fn().mockResolvedValue(undefined),
      query,
      sendMessage,
      onActivated: { addListener: onActivated },
      onUpdated: { addListener: onUpdated },
    },
    scripting: { executeScript },
    permissions: { onRemoved: { addListener: onRemoved } },
    runtime: {
      id: 'extension',
      onMessage: { addListener: onMessage },
      sendMessage: vi.fn().mockResolvedValue({ kind: 'error' }),
    },
  });
  vi.stubGlobal('document', {
    getElementById: (id: string) => elements.get(id),
  });
  await import('../../src/panel/index');
  await vi.waitFor(() => expect(quote.textContent).toBe('Cita inicial'));
  expect(urlField.hidden).toBe(true);

  const notify = onMessage.mock.calls[0]?.[0];
  const activate = onActivated.mock.calls[0]?.[0];
  const update = onUpdated.mock.calls[0]?.[0];
  const remove = onRemoved.mock.calls[0]?.[0];
  sendMessage.mockResolvedValueOnce(selection('Cita nueva'));
  notify?.(null, { id: 'extension' });
  notify?.({ type: 'capture.changed' }, { id: 'other' });
  notify?.(
    { type: 'capture.changed' },
    { id: 'extension', tab: { id: 6 } as chrome.tabs.Tab, documentId: 'doc' },
  );
  notify?.(
    { type: 'capture.changed' },
    { id: 'extension', tab: { id: 7 } as chrome.tabs.Tab, documentId: 'viejo' },
  );
  expect(quote.textContent).toBe('Cita inicial');
  notify?.(
    { type: 'capture.changed' },
    { id: 'extension', tab: { id: 7 } as chrome.tabs.Tab, documentId: 'doc' },
  );
  await vi.waitFor(() => expect(quote.textContent).toBe('Cita nueva'));

  sendMessage.mockResolvedValueOnce({ kind: 'empty' });
  notify?.(
    { type: 'capture.changed' },
    { id: 'extension', tab: { id: 7 } as chrome.tabs.Tab, documentId: 'doc' },
  );
  await vi.waitFor(() => expect(quote.textContent).toBe(''));

  const currentSender = {
    id: 'extension',
    tab: { id: 7 } as chrome.tabs.Tab,
    documentId: 'doc',
  };
  sendMessage.mockResolvedValueOnce(selection('Cita recuperada'));
  notify?.({ type: 'capture.changed' }, currentSender);
  await vi.waitFor(() => expect(quote.textContent).toBe('Cita recuperada'));
  sendMessage.mockResolvedValueOnce({ kind: 'empty' });
  notify?.({ type: 'capture.changed', dismiss: true }, currentSender);
  await vi.waitFor(() => expect(quote.textContent).toBe(''));

  query.mockResolvedValue([{ id: 8 }]);
  activate?.();
  expect(quote.textContent).toBe('');
  await vi.waitFor(() => expect(captureButton.disabled).toBe(true));
  update?.(7, { status: 'complete' });
  update?.(8, {});
  query.mockResolvedValue([{ id: 8, url }]);
  executeScript.mockRejectedValueOnce(new Error('sin acceso'));
  update?.(8, { status: 'complete' });
  await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
  expect(captureButton.disabled).toBe(true);

  executeScript.mockResolvedValueOnce([]);
  notify?.({ type: 'capture.invoked' }, { id: 'extension' });
  await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(3));
  sendMessage.mockResolvedValueOnce(false);
  notify?.({ type: 'capture.invoked' }, { id: 'extension' });
  await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(4));
  expect(captureButton.disabled).toBe(true);

  notify?.({ type: 'capture.invoked' }, { id: 'extension' });
  await vi.waitFor(() => expect(quote.textContent).toBe('Cita inicial'));
  remove?.();
  expect(quote.textContent).toBe('');
  expect(captureButton.disabled).toBe(true);
  expect(status.textContent).toContain('recuperar el acceso');
  activate?.();
  expect(captureButton.disabled).toBe(true);
  notify?.({ type: 'capture.invoked' }, { id: 'extension' });
  await vi.waitFor(() => expect(quote.textContent).toBe('Cita inicial'));
});
