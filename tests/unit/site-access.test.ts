import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { verifySiteAccess } from '../../src/panel/site-access';

const request = vi.fn();
const query = vi.fn();
const executeScript = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('chrome', {
    permissions: { request },
    tabs: { query },
    scripting: { executeScript },
  });
});

afterEach(() => vi.unstubAllGlobals());

test.each([
  'sin URL',
  'file:///tmp/fixture.html',
  'https://user@example.test/',
])('Q11: rechaza un origen inválido o no permitido (%s)', async (value) => {
  await expect(verifySiteAccess(value)).resolves.toBe(
    'Introduce una URL HTTP(S) sin credenciales.',
  );
  expect(request).not.toHaveBeenCalled();
  expect(executeScript).not.toHaveBeenCalled();
});

test('Q11: solicita permiso antes de consultar o acceder a la pestaña', async () => {
  request.mockResolvedValue(false);
  const verification = verifySiteAccess('https://example.test:8443/articulo');
  expect(request).toHaveBeenCalledWith({ origins: ['https://example.test/*'] });
  expect(query).not.toHaveBeenCalled();
  await expect(verification).resolves.toBe('Permiso denegado.');
  expect(executeScript).not.toHaveBeenCalled();
});

test.each([
  { tabs: [] },
  { tabs: [{ id: 7, url: 'https://example.test:9443/' }] },
])(
  'Q11: omite la inyección si falta la pestaña o no coincide el origen (%j)',
  async ({ tabs }) => {
    request.mockResolvedValue(true);
    query.mockResolvedValue(tabs);
    await expect(verifySiteAccess('https://example.test:8443/')).resolves.toBe(
      'Abre una pestaña del origen indicado e inténtalo de nuevo.',
    );
    expect(executeScript).not.toHaveBeenCalled();
  },
);

test('Q11: comprueba únicamente el origen indicado en el frame principal', async () => {
  request.mockResolvedValue(true);
  query.mockResolvedValue([
    { id: 7, url: 'http://example.test:8080/articulo' },
  ]);
  executeScript.mockImplementation(async ({ func, args }) => {
    vi.stubGlobal('location', new URL('http://example.test:8080/articulo'));
    return [{ result: func(...args) }];
  });
  await expect(verifySiteAccess('http://example.test:8080/')).resolves.toBe(
    'Acceso al sitio verificado.',
  );
  expect(executeScript).toHaveBeenCalledWith(
    expect.objectContaining({
      target: { tabId: 7 },
      args: ['http://example.test:8080'],
    }),
  );

  executeScript.mockResolvedValue([{ result: false }]);
  await expect(verifySiteAccess('http://example.test:8080/')).resolves.toBe(
    'La pestaña cambió antes de comprobar el acceso.',
  );
});
