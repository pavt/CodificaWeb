import { createPainter } from './paint';
import { observeSelection } from './capture';

const world = globalThis as typeof globalThis & {
  codificawebCaptureInstalled?: boolean;
};
if (!world.codificawebCaptureInstalled) {
  world.codificawebCaptureInstalled = true;
  const capture = observeSelection();
  const painter = createPainter();
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (
      sender.id === chrome.runtime.id &&
      sender.url === chrome.runtime.getURL('src/panel/index.html') &&
      typeof message === 'object' &&
      message !== null &&
      'type' in message
    ) {
      if (message.type === 'capture.read') respond(capture.read());
      if (
        message.type === 'highlight.paint' &&
        'url' in message &&
        'entries' in message
      ) {
        const start = performance.now();
        const painted =
          message.url === location.href && painter.paint(message.entries);
        respond({ painted, durationMs: performance.now() - start });
      }
    }
  });
}
