import 'fake-indexeddb/auto';
import { afterEach, expect, test, vi } from 'vitest';
import { enableSite } from '../../src/background/sites';
import { openEvidence } from '../../src/background/open-evidence';

const url = 'https://example.test/cita';
const selectors = {
  profile: 'dom-text-v1',
  quote: { type: 'TextQuoteSelector', exact: 'cita', prefix: '', suffix: '' },
  position: { type: 'TextPositionSelector', start: 0, end: 4 },
} as const;
const projectId = 'proyecto';

function setup(allowed = true) {
  const query = vi.fn().mockResolvedValue([]);
  const create = vi.fn().mockResolvedValue({ id: 7 });
  const update = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn().mockResolvedValue({ status: 'complete', url });
  const sendMessage = vi.fn().mockResolvedValue({ kind: 'located' });
  vi.stubGlobal('chrome', {
    permissions: { contains: vi.fn().mockResolvedValue(allowed) },
    scripting: { getRegisteredContentScripts: vi.fn().mockResolvedValue([{}]) },
    windows: { update: vi.fn().mockResolvedValue(undefined) },
    tabs: { query, create, update, get, sendMessage },
  });
  return { query, create, update, get, sendMessage };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test('Q09: enfoca la fuente existente y envía sus selectores al frame principal', async () => {
  const chrome = setup();
  await enableSite(url);
  chrome.query.mockResolvedValue([{ id: 7, windowId: 2, url }]);
  await expect(openEvidence(projectId, url, selectors)).resolves.toEqual({
    kind: 'located',
  });
  expect(chrome.create).not.toHaveBeenCalled();
  expect(chrome.update).toHaveBeenCalledWith(7, { active: true });
  expect(chrome.sendMessage).toHaveBeenCalledWith(
    7,
    {
      type: 'evidence.locate',
      projectId,
      url,
      selectors,
    },
    { frameId: 0 },
  );
});

test('Q09: abre la fuente aunque falte permiso y conserva un estado explícito', async () => {
  const chrome = setup(false);
  await expect(openEvidence(projectId, url, selectors)).resolves.toEqual({
    kind: 'permission',
  });
  expect(chrome.create).toHaveBeenCalledWith({ url, active: true });
  expect(chrome.sendMessage).not.toHaveBeenCalled();
});

test('Q09: rechaza redirecciones y devuelve sin ubicar cuando la cita desaparece', async () => {
  const chrome = setup();
  await enableSite(url);
  chrome.get.mockResolvedValueOnce({
    status: 'complete',
    url: 'https://example.test/otra',
  });
  await expect(openEvidence(projectId, url, selectors)).resolves.toEqual({
    kind: 'redirected',
  });
  expect(chrome.sendMessage).not.toHaveBeenCalled();
  chrome.sendMessage.mockResolvedValue({ kind: 'unlocated' });
  await expect(openEvidence(projectId, url, selectors)).resolves.toEqual({
    kind: 'unlocated',
  });
});

test('Q09: limita la espera si el documento no responde', async () => {
  const chrome = setup();
  await enableSite(url);
  chrome.sendMessage.mockRejectedValue(new Error('Sin receptor'));
  vi.useFakeTimers();
  const result = openEvidence(projectId, url, selectors);
  await vi.advanceTimersByTimeAsync(5000);
  await expect(result).resolves.toEqual({ kind: 'timeout' });
});

test('Q09: no abre URLs inseguras ni expone fallos de la API de pestañas', async () => {
  const chrome = setup();
  for (const invalid of [
    'file:///tmp/test',
    'https://usuario@example.test/cita',
    'sin-url',
  ]) {
    await expect(openEvidence(projectId, invalid, selectors)).resolves.toEqual({
      kind: 'unavailable',
    });
  }
  expect(chrome.create).not.toHaveBeenCalled();
  chrome.create.mockResolvedValueOnce({});
  await expect(openEvidence(projectId, url, selectors)).resolves.toEqual({
    kind: 'unavailable',
  });
  chrome.create.mockRejectedValueOnce(new Error('Pestaña cerrada'));
  await expect(openEvidence(projectId, url, selectors)).resolves.toEqual({
    kind: 'unavailable',
  });
});

test('Q09: el documento destino puede detectar una navegación posterior a la consulta', async () => {
  const chrome = setup();
  await enableSite(url);
  chrome.sendMessage.mockResolvedValueOnce({ kind: 'redirected' });
  await expect(openEvidence(projectId, url, selectors)).resolves.toEqual({
    kind: 'redirected',
  });
});
