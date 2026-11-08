import { isMarginInteraction } from './margin-labels';
import type { CaptureResult } from '../capture-contract';

const editable =
  '[contenteditable]:not([contenteditable="false" i]),input,textarea,select';
export const excluded = `script,style,template,noscript,[hidden],${editable}`;
export const maxDocumentLength = 1_000_000;
const maxQuoteLength = 16_384;
const contextLength = 32;

// The native selection can omit text excluded by CSS. Keep the existing DOM
// offsets by matching its visible text inside the raw range, ignoring spacing
// added or collapsed by the browser. A discontinuous match is unsafe to save.
function visibleBounds(raw: string, visible: string) {
  const compact = raw.replace(/\s/g, '').toUpperCase();
  const expected = visible.toUpperCase();
  if (compact === expected) return { start: 0, end: raw.length };
  const first = compact.indexOf(expected);
  if (first < 0 || compact.indexOf(expected, first + 1) !== -1)
    return undefined;

  let offset = 0;
  let start: number | undefined;
  for (const match of raw.matchAll(/\S/gu)) {
    const character = match[0];
    if (offset === first) start = match.index;
    offset += character.toUpperCase().length;
    if (offset === first + expected.length && start !== undefined)
      return { start, end: match.index + character.length };
    if (offset > first + expected.length) return undefined;
  }
}

function captureRange(
  range: Range | undefined,
  revision: number,
  visible: string,
): CaptureResult {
  if (!range || range.collapsed) return { kind: 'empty' };
  const body = document.body;
  if (!body?.contains(range.commonAncestorContainer))
    return { kind: 'excluded' };

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let text = '';
  let start: number | undefined;
  let end = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = (node as Text).data;
    const parent = node.parentElement;
    const skip = parent?.closest(excluded);
    if (range.intersectsNode(node)) {
      const from = range.startContainer === node ? range.startOffset : 0;
      const to = range.endContainer === node ? range.endOffset : value.length;
      if (to > from) {
        if (skip) {
          if (parent?.closest(editable)) return { kind: 'excluded' };
          continue;
        }
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
  if (start === undefined || !visible) return { kind: 'empty' };
  const bounds = visibleBounds(text.slice(start, end), visible);
  if (!bounds) return { kind: 'excluded' };
  end = start + bounds.end;
  start += bounds.start;
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

function sameAnchor(first: CaptureResult, second: CaptureResult) {
  return (
    first.kind === 'selection' &&
    second.kind === 'selection' &&
    first.url === second.url &&
    JSON.stringify(first.selectors) === JSON.stringify(second.selectors)
  );
}

export function observeSelection(onCommit?: () => void) {
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
  let snapshot: CaptureResult = { kind: 'empty' };
  let range: Range | undefined;
  let validatedRevision = 0;
  let visible = '';
  const update = () => {
    const selection = window.getSelection();
    const selected =
      selection?.rangeCount === 1 ? selection.getRangeAt(0) : undefined;
    validatedRevision = currentRevision();
    visible = selection?.toString().replace(/\s/g, '') ?? '';
    const latest: CaptureResult =
      !selected || selected.collapsed
        ? document.activeElement?.closest(editable)
          ? { kind: 'excluded' }
          : { kind: 'empty' }
        : captureRange(selected, validatedRevision, visible);
    if (!sameAnchor(snapshot, latest)) snapshot = latest;
    range = snapshot.kind === 'selection' ? selected?.cloneRange() : undefined;
  };
  update();
  let published: CaptureResult = snapshot;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const publish = () => {
    clearTimeout(pending);
    if (
      published === snapshot ||
      (published.kind !== 'selection' && published.kind === snapshot.kind)
    )
      return;
    published = snapshot;
    onCommit?.();
  };
  const onSelectionChange = () => {
    // Chrome may collapse the DOM selection as focus moves to the side panel.
    const selection = window.getSelection();
    if (!document.hasFocus() && (!selection || selection.isCollapsed)) return;
    update();
    // Selection can settle after pointerup or change without a key or pointer.
    if (onCommit) {
      clearTimeout(pending);
      pending = setTimeout(publish, 80);
    }
  };

  const commit = (event: Event) => {
    if (isMarginInteraction(event)) return;
    update();
    publish();
  };
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('pointerup', commit, true);
  document.addEventListener('keyup', commit, true);
  return {
    read(): CaptureResult {
      const revision = currentRevision();
      if (snapshot.kind !== 'selection') return snapshot;
      if (snapshot.url !== location.href) return { kind: 'stale' };
      if (validatedRevision !== revision) {
        // Reproject the original range. Background UI changes are safe only
        // if the text, context and position still describe the same fragment.
        const latest = captureRange(range, revision, visible);
        if (!sameAnchor(snapshot, latest)) return { kind: 'stale' };
        validatedRevision = revision;
      }
      return snapshot;
    },
    stop() {
      clearTimeout(pending);
      observer.disconnect();
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('pointerup', commit, true);
      document.removeEventListener('keyup', commit, true);
    },
  };
}
