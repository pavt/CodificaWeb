import { handleCodingRequest } from './background/coding-messages';

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (
    sender.id === chrome.runtime.id &&
    sender.url === chrome.runtime.getURL('src/panel/index.html')
  ) {
    void handleCodingRequest(message).then(respond, () =>
      respond({ kind: 'error' }),
    );
    return true;
  }
});
