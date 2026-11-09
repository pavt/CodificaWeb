import { projects } from './coding-messages';

export async function handleProjectRequest(message: Record<string, unknown>) {
  const { type, id, name, description } = message;
  if (type === 'project.document') {
    const { url, mode } = message;
    if (typeof url !== 'string' || url.length > 2048 || !URL.canParse(url))
      return { kind: 'error' };
    const address = new URL(url);
    if (
      !['http:', 'https:'].includes(address.protocol) ||
      address.username ||
      address.password ||
      address.href.length > 2048
    )
      return { kind: 'error' };
    if (mode === undefined) return projects.document(address.href);
    if (mode === 'add' && typeof id === 'string')
      return projects.document(address.href, { add: id });
    if (mode === 'select' && typeof id === 'string')
      return projects.document(address.href, { id });
    if (
      mode === 'create' &&
      typeof name === 'string' &&
      name.trim() &&
      name.length <= 256 &&
      typeof description === 'string' &&
      description.length <= 16_384
    )
      return projects.document(address.href, {
        name: name.trim(),
        description,
      });
    return { kind: 'error' };
  }
  if (type === 'project.list')
    return { kind: 'projects', ...(await projects.list()) };
  if (type === 'project.create' || type === 'project.update') {
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      name.length > 256 ||
      typeof description !== 'string' ||
      description.length > 16_384
    )
      return { kind: 'error' };
    if (type === 'project.create')
      await projects.create(name.trim(), description);
    else if (typeof id === 'string')
      await projects.update(id, name.trim(), description);
    else return { kind: 'error' };
  } else if (type === 'project.select' || type === 'project.remove') {
    if (typeof id !== 'string') return { kind: 'error' };
    if (type === 'project.select') await projects.select(id);
    else await projects.remove(id);
    await refreshProjectHighlights();
  } else return { kind: 'error' };
  void chrome.runtime
    .sendMessage({ type: 'project.changed' })
    .catch(() => undefined);
  return { kind: 'projects', ...(await projects.list()) };
}

export async function refreshProjectHighlights() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(
    tabs.flatMap(({ id: tabId }) =>
      tabId === undefined
        ? []
        : [
            chrome.tabs.sendMessage(
              tabId,
              { type: 'highlight.project' },
              { frameId: 0 },
            ),
          ],
    ),
  );
}
