import { database } from './coding-messages';

let siteChanges = Promise.resolve();

function changeSites<T>(change: () => Promise<T>): Promise<T> {
  const result = siteChanges.then(change);
  siteChanges = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function parseSite(value: unknown) {
  if (typeof value !== 'string' || !URL.canParse(value)) return undefined;
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return undefined;
  return { origin: url.origin, pattern: `${url.protocol}//${url.hostname}/*` };
}

function scriptId(origin: string) {
  return `cw-${btoa(origin).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')}`;
}

async function register(origin: string, pattern: string) {
  const id = scriptId(origin);
  if (
    (await chrome.scripting.getRegisteredContentScripts({ ids: [id] })).length
  )
    return;
  try {
    await chrome.scripting.registerContentScripts([
      {
        id,
        matches: [pattern],
        js: ['content.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ]);
  } catch (error) {
    if (
      !(await chrome.scripting.getRegisteredContentScripts({ ids: [id] }))
        .length
    )
      throw error;
  }
}

export function enableSite(value: unknown) {
  return changeSites(async () => {
    const site = parseSite(value);
    if (
      !site ||
      !(await chrome.permissions.contains({ origins: [site.pattern] }))
    )
      return false;
    await register(site.origin, site.pattern);
    await database.sites.put({ origin: site.origin });
    return true;
  });
}

export async function hasSiteAccess(value: unknown) {
  const site = parseSite(value);
  return (
    site !== undefined &&
    Boolean(await database.sites.get(site.origin)) &&
    (await chrome.permissions.contains({ origins: [site.pattern] }))
  );
}

export async function canRestore(
  sender: chrome.runtime.MessageSender,
  value: unknown,
) {
  const site = parseSite(value);
  return (
    sender.frameId === 0 &&
    sender.tab?.id !== undefined &&
    site !== undefined &&
    parseSite(sender.url)?.origin === site.origin &&
    (await hasSiteAccess(value))
  );
}

export function reconcileSites() {
  return changeSites(reconcile);
}

async function reconcile() {
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const revoked = new Set<string>();
  const sites = await database.sites.toArray();
  const owned = new Set(sites.map(({ origin }) => scriptId(origin)));
  const orphans = registered.filter(
    ({ id }) => id.startsWith('cw-') && !owned.has(id),
  );
  if (orphans.length) {
    await chrome.scripting.unregisterContentScripts({
      ids: orphans.map(({ id }) => id),
    });
  }
  for (const { origin } of sites) {
    const site = parseSite(origin);
    if (
      site &&
      (await chrome.permissions.contains({ origins: [site.pattern] }))
    ) {
      await register(origin, site.pattern);
    } else {
      revoked.add(origin);
      await database.sites.delete(origin);
      const id = scriptId(origin);
      if (registered.some((script) => script.id === id)) {
        await chrome.scripting.unregisterContentScripts({ ids: [id] });
      }
    }
  }
  if (!revoked.size) return;
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs.flatMap(({ id }) =>
      id === undefined
        ? []
        : [
            chrome.tabs.sendMessage(
              id,
              {
                type: 'highlight.revoke',
                origins: [...revoked],
              },
              { frameId: 0 },
            ),
          ],
    ),
  );
}
