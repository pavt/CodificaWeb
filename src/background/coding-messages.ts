import { decodeSelectors, isRecord } from '../capture-contract';
import { MemoryCodings } from '../domain/codings';
import type { CodeAssignment, Fragment } from '../domain/codings';

const projectId = '00000000-0000-4000-8000-000000000001';
const codings = new MemoryCodings([
  {
    id: '00000000-0000-4000-8000-000000000003',
    projectId,
    name: 'Tema',
    color: '#FDD835',
  },
  {
    id: '00000000-0000-4000-8000-000000000004',
    projectId,
    name: 'Contexto',
    color: '#81D4FA',
  },
]);

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

export function handleCodingRequest(
  message: unknown,
): { kind: 'codings'; codes: CodeAssignment[] } | { kind: 'error' } {
  const error = { kind: 'error' } as const;
  if (!isRecord(message)) return error;
  const fragment = decodeFragment(message.fragment);
  if (!fragment) return error;
  if (message.type === 'coding.read')
    return { kind: 'codings', codes: codings.read(projectId, fragment) };
  if (
    message.type !== 'coding.set' ||
    typeof message.codeId !== 'string' ||
    typeof message.assigned !== 'boolean'
  )
    return error;
  try {
    return {
      kind: 'codings',
      codes: codings.set(projectId, fragment, message.codeId, message.assigned),
    };
  } catch {
    return error;
  }
}
