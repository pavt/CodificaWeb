import type { createPainter } from './paint';

export function startRestoration(
  painter: ReturnType<typeof createPainter>,
  onAllowed: () => void,
) {
  let url = location.href;
  let projectId: string | null | undefined;
  let filter: string | null = null;
  let entries: unknown[] = [];
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    if (entries.length)
      timer = setTimeout(() => {
        if (url === location.href) painter.paint(entries);
      }, 60);
  });

  function clear() {
    generation++;
    entries = [];
    clearTimeout(timer);
    observer.disconnect();
    painter.clear();
  }

  function paint(next: unknown[], nextFilter: string | null) {
    entries = next;
    filter = nextFilter;
    observer.observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['hidden', 'contenteditable'],
    });
    return painter.paint(entries);
  }

  async function restore(resetFilter = false) {
    if (resetFilter || url !== location.href) filter = null;
    url = location.href;
    clear();
    projectId = undefined;
    const id = generation;
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'highlight.restore',
        url,
        filter,
      });
      if (
        id !== generation ||
        url !== location.href ||
        result?.kind !== 'highlights' ||
        !Array.isArray(result.entries)
      )
        return false;
      projectId = result.projectId;
      onAllowed();
      paint(result.entries, filter);
      return true;
    } catch {
      // A removed permission or replaced worker can close the message channel.
      return false;
    }
  }

  window.navigation?.addEventListener(
    'currententrychange',
    () => void restore(),
  );
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void restore();
  });
  window.addEventListener('pagehide', clear);
  void restore();
  return {
    clear,
    restore,
    matchesProject(id: unknown) {
      return id === undefined || id === projectId;
    },
    paint(next: unknown[], selected: string | null) {
      generation++;
      clearTimeout(timer);
      return paint(next, selected);
    },
  };
}
