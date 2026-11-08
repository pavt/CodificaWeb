import { openEvidence } from './open-evidence';
import { IndexedEvidence } from '../storage/indexed-evidence';
import { database, projects } from './coding-messages';

const evidence = new IndexedEvidence(database);

export async function handleEvidenceSearch(message: Record<string, unknown>) {
  const { projectId, text, codeId, sourceId } = message;
  if (
    typeof projectId !== 'string' ||
    typeof text !== 'string' ||
    text.length > 16_384 ||
    (codeId !== null && typeof codeId !== 'string') ||
    (sourceId !== null && typeof sourceId !== 'string') ||
    projectId !== (await projects.activeId())
  )
    return { kind: 'error' };
  return {
    kind: 'evidence',
    ...(await evidence.search(projectId, { text, codeId, sourceId })),
  };
}

export async function handleEvidenceOpen(message: Record<string, unknown>) {
  const { projectId, id } = message;
  if (
    typeof id !== 'string' ||
    typeof projectId !== 'string' ||
    projectId !== (await projects.activeId())
  )
    return { kind: 'unavailable' };
  const fragment = await evidence.getFragment(projectId, id);
  if (!fragment) return { kind: 'unavailable' };
  return openEvidence(projectId, fragment.url, fragment.selectors);
}
