import { isRecord } from './capture-contract';
import { handleCodingRequest } from './background/coding-messages';
import { handleCodeRequest } from './background/code-messages';
import {
  handleEvidenceOpen,
  handleEvidenceSearch,
} from './background/evidence-messages';
import { handleTransferRequest } from './background/transfer-messages';
import { handleRelationRequest } from './background/relation-messages';
import { handleProjectRequest } from './background/project-messages';
import { canRestore, enableSite, reconcileSites } from './background/sites';

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
chrome.action.onClicked.addListener(({ id }) => {
  if (id === undefined) return;
  void chrome.sidePanel
    .open({ tabId: id })
    .then(() => chrome.runtime.sendMessage({ type: 'capture.invoked' }))
    .catch(() => undefined);
});
const reconcile = () => void reconcileSites().catch(() => undefined);
chrome.runtime.onStartup.addListener(reconcile);
chrome.runtime.onInstalled.addListener(reconcile);
chrome.permissions.onRemoved.addListener(reconcile);

async function handle(
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
) {
  const panelUrl = chrome.runtime.getURL('src/panel/index.html');
  if (sender.url === panelUrl || sender.url === panelUrl + '#proyecto') {
    if (message.type === 'site.enable')
      return { enabled: await enableSite(message.url) };
    if (typeof message.type === 'string' && message.type.startsWith('project.'))
      return handleProjectRequest(message);
    if (typeof message.type === 'string' && message.type.startsWith('code.'))
      return handleCodeRequest(message);
    if (
      typeof message.type === 'string' &&
      (message.type.startsWith('relations.') ||
        message.type.startsWith('relationTypes.'))
    )
      return handleRelationRequest(message, sender);
    if (message.type === 'evidence.search')
      return handleEvidenceSearch(message);
    if (message.type === 'evidence.open') return handleEvidenceOpen(message);
    if (
      message.type === 'transfer.import' ||
      message.type === 'transfer.export'
    )
      return handleTransferRequest(message);
    return handleCodingRequest(message);
  }
  if (
    message.type === 'highlight.restore' &&
    (await canRestore(sender, message.url))
  ) {
    return handleCodingRequest({ ...message, type: 'highlight.read' });
  }
  return { kind: 'error' };
}

chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (sender.id === chrome.runtime.id && isRecord(message)) {
    if (
      message.type === 'citation.preview' ||
      message.type === 'citation.preview.end' ||
      message.type === 'citation.open'
    )
      return;
    void handle(message, sender).then(respond, () =>
      respond({ kind: 'error' }),
    );
    return true;
  }
});
