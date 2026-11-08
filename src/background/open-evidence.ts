import type { Fragment } from '../domain/codings';
import { hasSiteAccess } from './sites';

export async function openEvidence(
  projectId: string,
  url: string,
  selectors: Fragment['selectors'],
) {
  try {
    const target = new URL(url);
    if (
      !['http:', 'https:'].includes(target.protocol) ||
      target.username ||
      target.password
    ) {
      return { kind: 'unavailable' };
    }
    const existing = (await chrome.tabs.query({})).find(
      (tab) => tab.url === target.href,
    );
    let tabId = existing?.id;
    if (tabId !== undefined && existing) {
      await chrome.tabs.update(tabId, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      tabId = (await chrome.tabs.create({ url: target.href, active: true })).id;
    }
    if (tabId === undefined) return { kind: 'unavailable' };
    if (!(await hasSiteAccess(target.href))) return { kind: 'permission' };

    for (let attempt = 0; attempt < 20; attempt++) {
      const tab = await chrome.tabs.get(tabId);
      if (tab.status === 'complete' && !tab.pendingUrl) {
        if (!(await hasSiteAccess(target.href))) return { kind: 'permission' };
        if (tab.url !== target.href) return { kind: 'redirected' };
        try {
          const result = await chrome.tabs.sendMessage(
            tabId,
            {
              type: 'evidence.locate',
              projectId,
              url: target.href,
              selectors,
            },
            { frameId: 0 },
          );
          if (result?.kind === 'located' || result?.kind === 'unlocated')
            return { kind: result.kind };
          if (result?.kind === 'redirected') return { kind: 'redirected' };
        } catch {
          // A registered script can start after the tab reports complete.
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
    return { kind: 'timeout' };
  } catch {
    return { kind: 'unavailable' };
  }
}
