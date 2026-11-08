import { decodeSelectors, isRecord } from '../capture-contract';
import type { CaptureResult, CaptureTarget } from '../capture-contract';

const stale = { kind: 'stale' } as const;

function decodeCapture(value: unknown, url: string): CaptureResult {
  if (!isRecord(value)) return stale;
  const { kind, revision } = value;
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
    revision < 0
  )
    return stale;

  const selectors = decodeSelectors(value.selectors);
  return selectors ? { kind, url, revision, selectors } : stale;
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
