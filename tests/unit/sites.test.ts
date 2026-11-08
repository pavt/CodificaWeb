import 'fake-indexeddb/auto';
import { afterEach, expect, test, vi } from 'vitest';
import { database } from '../../src/background/coding-messages';
import {
  canRestore,
  enableSite,
  reconcileSites,
} from '../../src/background/sites';

afterEach(async () => {
  await database.sites.clear();
  vi.unstubAllGlobals();
});

test('Q11: registra el host tras el permiso, restringe el puerto y limpia al revocar', async () => {
  const scripts: chrome.scripting.RegisteredContentScript[] = [];
  const contains = vi.fn().mockResolvedValue(true);
  const unregisterContentScripts = vi.fn();
  const sendMessage = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('chrome', {
    permissions: { contains },
    scripting: {
      getRegisteredContentScripts: async ({ ids }: { ids?: string[] } = {}) =>
        ids ? scripts.filter((script) => ids.includes(script.id)) : scripts,
      registerContentScripts: async (
        entries: chrome.scripting.RegisteredContentScript[],
      ) => scripts.push(...entries),
      unregisterContentScripts,
    },
    tabs: { query: async () => [{ id: 7 }, {}], sendMessage },
  });
  const url = 'https://example.test:8443/cita';
  const sender = {
    frameId: 0,
    url,
    tab: { id: 7 },
  } as chrome.runtime.MessageSender;
  expect(await enableSite('file:///tmp/doc')).toBe(false);
  expect(await enableSite(url)).toBe(true);
  expect(await enableSite(url)).toBe(true);
  expect(scripts).toMatchObject([
    { matches: ['https://example.test/*'], persistAcrossSessions: true },
  ]);
  expect(await canRestore(sender, url)).toBe(true);
  expect(await canRestore({ ...sender, frameId: 1 }, url)).toBe(false);
  expect(
    await canRestore(
      { ...sender, url: 'https://example.test:9443/' },
      'https://example.test:9443/',
    ),
  ).toBe(false);

  contains.mockResolvedValue(false);
  await reconcileSites();
  expect(await canRestore(sender, url)).toBe(false);
  expect(unregisterContentScripts).toHaveBeenCalledWith({
    ids: [scripts[0]?.id],
  });
  expect(sendMessage).toHaveBeenCalledWith(
    7,
    {
      type: 'highlight.revoke',
      origins: ['https://example.test:8443'],
    },
    { frameId: 0 },
  );
});
