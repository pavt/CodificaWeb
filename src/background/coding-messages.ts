import { decodeSelectors, isRecord } from '../capture-contract';
import { CodingDatabase, initialProjectId } from '../storage/database';
import { IndexedCodings } from '../storage/indexed-codings';
import type {
  CodeAssignment,
  Fragment,
  HighlightEntry,
} from '../domain/codings';

const codings = new IndexedCodings(new CodingDatabase());
const operationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function decodeFragment(value: unknown): Fragment | undefined {
  if (
    !isRecord(value) ||
    typeof value.url !== 'string' ||
    value.url.length > 2048 ||
    !URL.canParse(value.url)
  )
    return undefined;
  const url = new URL(value.url);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  )
    return undefined;
  const selectors = decodeSelectors(value.selectors);
  return selectors ? { url: url.href, selectors } : undefined;
}

export async function handleCodingRequest(
  message: unknown,
): Promise<
  | { kind: 'codings'; codes: CodeAssignment[] }
  | { kind: 'highlights'; entries: HighlightEntry[] }
  | { kind: 'error' }
> {
  const error = { kind: 'error' } as const;
  if (!isRecord(message)) return error;
  if (message.type === 'highlight.read') {
    const { url, filter } = message;
    if (
      typeof url !== 'string' ||
      (filter !== null && typeof filter !== 'string')
    )
      return error;
    return {
      kind: 'highlights',
      entries: await codings.highlights(initialProjectId, url, filter),
    };
  }
  const fragment = decodeFragment(message.fragment);
  if (!fragment) return error;
  if (message.type === 'coding.read')
    return {
      kind: 'codings',
      codes: await codings.read(initialProjectId, fragment),
    };
  if (
    message.type !== 'coding.set' ||
    typeof message.codeId !== 'string' ||
    typeof message.assigned !== 'boolean' ||
    typeof message.operationId !== 'string' ||
    !operationIdPattern.test(message.operationId)
  )
    return error;
  try {
    return {
      kind: 'codings',
      codes: await codings.set(
        initialProjectId,
        fragment,
        message.codeId,
        message.assigned,
        message.operationId,
      ),
    };
  } catch {
    return error;
  }
}
