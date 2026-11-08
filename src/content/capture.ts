import type { CaptureResult } from '../capture-contract';

export const excluded =
  'script,style,template,noscript,[hidden],[contenteditable]:not([contenteditable="false" i]),input,textarea,select';
export const maxDocumentLength = 1_000_000;
const maxQuoteLength = 16_384;
const contextLength = 32;

function captureSelection(
  selection: Selection | null,
  revision: number,
): CaptureResult {
  if (document.activeElement?.closest(excluded)) return { kind: 'excluded' };
  if (selection?.rangeCount !== 1 || selection.isCollapsed)
    return { kind: 'empty' };

  const range = selection.getRangeAt(0);
  const body = document.body;
  if (!body?.contains(range.commonAncestorContainer))
    return { kind: 'excluded' };

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let text = '';
  let start: number | undefined;
  let end = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = (node as Text).data;
    const skip = node.parentElement?.closest(excluded);
    if (range.intersectsNode(node)) {
      const from = range.startContainer === node ? range.startOffset : 0;
      const to = range.endContainer === node ? range.endOffset : value.length;
      if (to > from) {
        if (skip) return { kind: 'excluded' };
        start ??= text.length + from;
        end = text.length + to;
      }
    }
    if (!skip) {
      if (text.length + value.length > maxDocumentLength)
        return { kind: 'too-large' };
      text += value;
    }
  }
  if (start === undefined || !text.slice(start, end).trim())
    return { kind: 'empty' };
  if (end - start > maxQuoteLength) return { kind: 'too-large' };

  return {
    kind: 'selection',
    url: location.href,
    revision,
    selectors: {
      profile: 'dom-text-v1',
      quote: {
        type: 'TextQuoteSelector',
        exact: text.slice(start, end),
        prefix: text
          .slice(Math.max(0, start - contextLength), start)
          .replace(/^[\uDC00-\uDFFF]/u, ''),
        suffix: text
          .slice(end, end + contextLength)
          .replace(/[\uD800-\uDBFF]$/u, ''),
      },
      position: { type: 'TextPositionSelector', start, end },
    },
  };
}

export function observeSelection() {
  let revision = 0;
  const observer = new MutationObserver(() => revision++);
  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['hidden', 'contenteditable'],
  });

  const currentRevision = () => {
    if (observer.takeRecords().length) revision++;
    return revision;
  };
  let snapshot = captureSelection(window.getSelection(), currentRevision());
  const update = () => {
    snapshot = captureSelection(window.getSelection(), currentRevision());
  };
  const onSelectionChange = () => {
    // Chrome may collapse the DOM selection as focus moves to the side panel.
    const selection = window.getSelection();
    if (document.hasFocus() || (selection && !selection.isCollapsed)) update();
  };

  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('pointerup', update);
  document.addEventListener('keyup', update);
  return {
    read(): CaptureResult {
      const revision = currentRevision();
      if (
        snapshot.kind === 'selection' &&
        (snapshot.revision !== revision || snapshot.url !== location.href)
      ) {
        return { kind: 'stale' };
      }
      return snapshot;
    },
    stop() {
      observer.disconnect();
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerup', update);
      document.removeEventListener('keyup', update);
    },
  };
}
