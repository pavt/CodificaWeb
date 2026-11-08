import { IndexedCatalog } from '../storage/indexed-catalog';
import { database, projects } from './coding-messages';
import { refreshProjectHighlights } from './project-messages';

const catalog = new IndexedCatalog(database);

export async function handleCodeRequest(message: Record<string, unknown>) {
  const { type, projectId, id, name, description, color } = message;
  const error = { kind: 'error' } as const;
  if (
    typeof projectId !== 'string' ||
    projectId !== (await projects.activeId())
  )
    return error;
  if (type === 'code.list')
    return { kind: 'catalog', codes: await catalog.list(projectId) };

  if (type === 'code.remove') {
    if (typeof id !== 'string') return error;
    await catalog.remove(projectId, id);
  } else if (type === 'code.create' || type === 'code.update') {
    if (
      typeof name !== 'string' ||
      typeof description !== 'string' ||
      typeof color !== 'string'
    )
      return error;
    const fields = { name, description, color };
    if (type === 'code.create') await catalog.create(projectId, fields);
    else if (typeof id === 'string')
      await catalog.update(projectId, id, fields);
    else return error;
  } else return error;

  await refreshProjectHighlights();
  void chrome.runtime
    .sendMessage({ type: 'code.changed', projectId })
    .catch(() => undefined);
  return { kind: 'catalog', codes: await catalog.list(projectId) };
}
