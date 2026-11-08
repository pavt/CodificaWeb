import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

test('Q11: el botón de la extensión abre el panel lateral', async () => {
  const setPanelBehavior = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', { sidePanel: { setPanelBehavior } });
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
