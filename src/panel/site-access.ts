import type { CaptureTarget } from '../capture-contract';

export async function verifySiteAccess(
  value: string,
  prepareCapture?: (target: CaptureTarget) => Promise<void>,
): Promise<string> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return 'Introduce una URL HTTP(S) sin credenciales.';
  }

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    return 'Introduce una URL HTTP(S) sin credenciales.';
  }

  const granted = await chrome.permissions.request({
    origins: [`${url.protocol}//${url.hostname}/*`],
  });
  if (!granted) return 'Permiso denegado.';

  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (
    tab?.id === undefined ||
    !tab.url ||
    new URL(tab.url).origin !== url.origin
  ) {
    return 'Abre una pestaña del origen indicado e inténtalo de nuevo.';
  }

  const [probe] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    args: [url.origin],
    func: (origin: string) => location.origin === origin,
  });
  if (!probe?.result) return 'La pestaña cambió antes de comprobar el acceso.';
  if (prepareCapture) {
    await prepareCapture({
      tabId: tab.id,
      documentId: probe.documentId,
      url: tab.url,
    });
  }
  return 'Acceso al sitio verificado.';
}
