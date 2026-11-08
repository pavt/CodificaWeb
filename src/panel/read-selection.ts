import type { CaptureResult, CaptureTarget } from '../capture-contract';

const stale = { kind: 'stale' } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeCapture(value: unknown, url: string): CaptureResult {
  if (!isRecord(value)) return stale;
  const { kind, selectors, revision } = value;
  if (
    kind === 'empty' ||
    kind === 'excluded' ||
    kind === 'stale' ||
    kind === 'too-large'
  )
    return { kind };
  if (
    kind !== 'selection' ||
    value.url !== url ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !isRecord(selectors) ||
    selectors.profile !== 'dom-text-v1'
  )
    return stale;

  const { quote, position } = selectors;
  if (
    !isRecord(quote) ||
    quote.type !== 'TextQuoteSelector' ||
    typeof quote.exact !== 'string' ||
    !quote.exact.trim() ||
    quote.exact.length > 16_384 ||
    typeof quote.prefix !== 'string' ||
    quote.prefix.length > 32 ||
    typeof quote.suffix !== 'string' ||
    quote.suffix.length > 32 ||
    !isRecord(position) ||
    position.type !== 'TextPositionSelector'
  )
    return stale;

  const { start, end } = position;
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end - start !== quote.exact.length
  )
    return stale;

  return {
    kind,
    url,
    revision,
    selectors: {
      profile: selectors.profile,
      quote: {
        type: quote.type,
        exact: quote.exact,
        prefix: quote.prefix,
        suffix: quote.suffix,
      },
      position: { type: position.type, start, end },
    },
  };
}

async function isCurrentTab(target: CaptureTarget): Promise<boolean> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab?.id === target.tabId && tab.url === target.url;
}

export async function readSelection(
  target: CaptureTarget,
): Promise<CaptureResult> {
  try {
    if (!(await isCurrentTab(target))) return stale;
    const result: unknown = await chrome.tabs.sendMessage(
      target.tabId,
      { type: 'capture.read' },
      { documentId: target.documentId },
    );
    return (await isCurrentTab(target))
      ? decodeCapture(result, target.url)
      : stale;
  } catch {
    return stale;
  }
}
