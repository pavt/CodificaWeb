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
