import type { Fragment } from './domain/codings';

export interface CaptureTarget {
  tabId: number;
  documentId: string;
  url: string;
}

export interface SelectionSnapshot extends Fragment {
  kind: 'selection';
  revision: number;
}

export type CaptureResult =
  SelectionSnapshot | { kind: 'empty' | 'excluded' | 'stale' | 'too-large' };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function decodeSelectors(
  selectors: unknown,
): Fragment['selectors'] | undefined {
  if (!isRecord(selectors) || selectors.profile !== 'dom-text-v1')
    return undefined;
  const { quote, position } = selectors;
  if (
    !isRecord(quote) ||
    quote.type !== 'TextQuoteSelector' ||
    typeof quote.exact !== 'string' ||
    quote.exact.length > 16_384 ||
    !quote.exact.trim() ||
    typeof quote.prefix !== 'string' ||
    quote.prefix.length > 32 ||
    typeof quote.suffix !== 'string' ||
    quote.suffix.length > 32 ||
    !isRecord(position) ||
    position.type !== 'TextPositionSelector'
  )
    return undefined;

  const { start, end } = position;
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end - start !== quote.exact.length
  )
    return undefined;

  return {
    profile: selectors.profile,
    quote: {
      type: quote.type,
      exact: quote.exact,
      prefix: quote.prefix,
      suffix: quote.suffix,
    },
    position: { type: position.type, start, end },
  };
}
