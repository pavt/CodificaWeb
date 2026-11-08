import { createPainter } from './paint';
import { observeSelection } from './capture';
import { startRestoration } from './restoration';

const world = globalThis as typeof globalThis & {
  codificawebCaptureInstalled?: boolean;
};
if (!world.codificawebCaptureInstalled) {
  world.codificawebCaptureInstalled = true;
  let capture: ReturnType<typeof observeSelection> | undefined;
  const restoration = startRestoration(createPainter(), () => {
    capture ??= observeSelection();
  });
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (
      sender.id !== chrome.runtime.id ||
      typeof message !== 'object' ||
      message === null ||
      !('type' in message)
    )
      return;
    if (
      message.type === 'highlight.revoke' &&
      !sender.tab &&
      'origins' in message &&
      Array.isArray(message.origins) &&
      message.origins.includes(location.origin)
    ) {
      restoration.clear();
      capture?.stop();
      capture = undefined;
    }
    if (message.type === 'highlight.project' && !sender.tab) {
      void restoration.restore(true);
    }
    if (sender.url !== chrome.runtime.getURL('src/panel/index.html')) return;
    if (message.type === 'capture.prepare') {
      void restoration.restore().then(respond);
      return true;
    }
    if (message.type === 'capture.read')
      respond(capture?.read() ?? { kind: 'stale' });
    if (
      message.type === 'highlight.paint' &&
      'url' in message &&
      'entries' in message
    ) {
      const start = performance.now();
      const result =
        capture &&
        restoration.matchesProject(
          'projectId' in message ? message.projectId : undefined,
        ) &&
        message.url === location.href &&
        Array.isArray(message.entries)
          ? restoration.paint(
              message.entries,
              'filter' in message && typeof message.filter === 'string'
                ? message.filter
                : null,
            )
          : { painted: false, unresolved: 0 };
      respond({ ...result, durationMs: performance.now() - start });
    }
  });
}
