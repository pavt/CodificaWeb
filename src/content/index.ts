import { observeSelection } from './capture';

const world = globalThis as typeof globalThis & {
  codificawebCaptureInstalled?: boolean;
};
if (!world.codificawebCaptureInstalled) {
  world.codificawebCaptureInstalled = true;
  const capture = observeSelection();
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (
      sender.id === chrome.runtime.id &&
      sender.url === chrome.runtime.getURL('src/panel/index.html') &&
      typeof message === 'object' &&
      message !== null &&
      'type' in message &&
      message.type === 'capture.read'
    ) {
      respond(capture.read());
    }
  });
}
