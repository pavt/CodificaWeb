import { decodeSelectors, isRecord } from '../capture-contract';
import { CodingDatabase } from '../storage/database';
import { IndexedProjects } from '../storage/indexed-projects';
import { IndexedCodings } from '../storage/indexed-codings';
import type {
  CodeAssignment,
  Fragment,
  HighlightEntry,
} from '../domain/codings';

export const database = new CodingDatabase();
export const projects = new IndexedProjects(database);
const codings = new IndexedCodings(database);
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
  | { kind: 'highlights'; entries: HighlightEntry[]; projectId: string | null }
  | { kind: 'citation'; id: string | null }
  | { kind: 'note'; note: string | null }
  | { kind: 'error' }
> {
  const error = { kind: 'error' } as const;
  if (!isRecord(message)) return error;
  const activeId = await projects.activeId();
  const projectId =
    typeof message.projectId === 'string' ? message.projectId : activeId;
  if (projectId !== activeId) return error;
  if (message.type === 'highlight.read') {
    const { url, filter } = message;
    if (
      typeof url !== 'string' ||
      (filter !== null && typeof filter !== 'string')
    )
      return error;
    return {
      kind: 'highlights',
      projectId,
      entries: projectId
        ? await codings.highlights(projectId, url, filter)
        : [],
    };
  }
  if (!projectId) return error;
  const fragment = decodeFragment(message.fragment);
  if (!fragment) return error;
  if (message.type === 'coding.citation')
    return {
      kind: 'citation',
      id: await codings.citationId(projectId, fragment),
    };
  if (message.type === 'note.read') {
    return {
      kind: 'note',
      note: await codings.readNote(projectId, fragment),
    };
  }
  if (message.type === 'note.set') {
    const { note, operationId } = message;
    if (
      (note !== null &&
        (typeof note !== 'string' || note.length > 16_384 || !note.trim())) ||
      typeof operationId !== 'string' ||
      !operationIdPattern.test(operationId)
    )
      return error;
    try {
      return {
        kind: 'note',
        note: await codings.setNote(projectId, fragment, note, operationId),
      };
    } catch {
      return error;
    }
  }
  if (message.type === 'coding.read')
    return {
      kind: 'codings',
      codes: await codings.read(projectId, fragment),
    };
  if (message.type === 'coding.updateDefinition') {
    const { codeId, description } = message;
    if (
      typeof message.projectId !== 'string' ||
      typeof codeId !== 'string' ||
      typeof description !== 'string' ||
      description.length > 16_384
    )
      return error;
    return database.transaction('rw', database.tables, async () => {
      if ((await projects.activeId()) !== projectId) return error;
      if ((await database.codes.get(codeId))?.projectId !== projectId)
        return error;
      await database.codes.update(codeId, {
        description,
        updatedAt: new Date().toISOString(),
      });
      return {
        kind: 'codings' as const,
        codes: await codings.read(projectId, fragment),
      };
    });
  }
  if (message.type === 'coding.createAndApply') {
    const { name, description, operationId } = message;
    if (
      typeof message.projectId !== 'string' ||
      typeof name !== 'string' ||
      typeof description !== 'string' ||
      typeof operationId !== 'string' ||
      !operationIdPattern.test(operationId)
    )
      return error;
    try {
      return {
        kind: 'codings',
        codes: await codings.createAndApply(
          projectId,
          fragment,
          { name, description },
          operationId,
        ),
      };
    } catch {
      return error;
    }
  }
  if (
    message.type !== 'coding.set' ||
    typeof message.codeId !== 'string' ||
    typeof message.assigned !== 'boolean' ||
    typeof message.operationId !== 'string' ||
    !operationIdPattern.test(message.operationId)
  )
    return error;
  const { codeId, assigned, operationId } = message;
  try {
    return await database.transaction('rw', database.tables, async () => {
      if ((await projects.activeId()) !== projectId) return error;
      return {
        kind: 'codings' as const,
        codes: await codings.set(
          projectId,
          fragment,
          codeId,
          assigned,
          operationId,
        ),
      };
    });
  } catch {
    return error;
  }
}
