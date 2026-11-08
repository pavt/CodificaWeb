import { resolveAnchor } from './resolve-anchor';
import { indexDocument } from './text-index';

export function locateEvidence(selectors: unknown): boolean {
  if (
    typeof selectors !== 'object' ||
    selectors === null ||
    !('quote' in selectors)
  )
    return false;
  const { quote } = selectors;
  if (
    typeof quote !== 'object' ||
    quote === null ||
    !('exact' in quote) ||
    !('prefix' in quote) ||
    !('suffix' in quote) ||
    typeof quote.exact !== 'string' ||
    quote.exact.length > 16_384 ||
    typeof quote.prefix !== 'string' ||
    quote.prefix.length > 32 ||
    typeof quote.suffix !== 'string' ||
    quote.suffix.length > 32
  )
    return false;
  const index = indexDocument();
  if (!index) return false;
  const resolved = resolveAnchor(
    index.text,
    quote.exact,
    quote.prefix,
    quote.suffix,
  );
  if (!resolved) return false;
  const span = index.nodes.find(
    ({ start, end }) => start <= resolved.start && end > resolved.start,
  );
  if (!span) return false;
  const range = document.createRange();
  range.setStart(span.node, resolved.start - span.start);
  range.setEnd(span.node, Math.min(resolved.end, span.end) - span.start);
  if (!range.getClientRects().length) return false;
  span.node.parentElement?.scrollIntoView({
    block: 'center',
    behavior: 'instant',
  });
  const rect = range.getBoundingClientRect();
  window.scrollBy({
    top: rect.top - window.innerHeight / 2,
    behavior: 'instant',
  });
  return true;
}
