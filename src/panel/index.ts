import type { CaptureTarget, SelectionSnapshot } from '../capture-contract';
import { mountCatalog } from './catalog-controls';
import { createCodingControls } from './coding-controls';
import { mountEvidence } from './evidence-controls';
import { createHighlightFilter } from './highlight-filter';
import { createNoteControls } from './note-controls';
import { mountProjects } from './project-controls';
import { readSelection } from './read-selection';
import { mountTransfer } from './transfer-controls';
import { verifySiteAccess } from './site-access';

const form = document.getElementById('site-access') as HTMLFormElement;
const input = document.getElementById('site-url') as HTMLInputElement;
const button = document.getElementById('verify-site') as HTMLButtonElement;
const status = document.getElementById('site-status') as HTMLElement;

const captureButton = document.getElementById(
  'capture-selection',
) as HTMLButtonElement;
const captureStatus = document.getElementById('capture-status') as HTMLElement;
const quote = document.getElementById('selection-quote') as HTMLElement;
const source = document.getElementById('selection-source') as HTMLElement;
const highlights = createHighlightFilter(
  document.getElementById('highlight-filter') as HTMLSelectElement,
  document.getElementById('highlight-status') as HTMLElement,
);
const coding = createCodingControls(
  document.getElementById('fragment-codes') as HTMLFieldSetElement,
  document.getElementById('coding-options') as HTMLElement,
  document.getElementById('coding-status') as HTMLElement,
  highlights.update,
);
const notes = createNoteControls(
  document.getElementById('fragment-note') as HTMLFieldSetElement,
  document.getElementById('note-text') as HTMLTextAreaElement,
  document.getElementById('note-save') as HTMLButtonElement,
  document.getElementById('note-remove') as HTMLButtonElement,
  document.getElementById('note-status') as HTMLElement,
);
let selected: SelectionSnapshot | undefined;
let target: CaptureTarget | undefined;
let projectId: string | null | undefined;

const captureMessages = {
  empty: 'Selecciona texto en la página e inténtalo de nuevo.',
  excluded: 'Esta selección incluye contenido editable o excluido.',
  stale:
    'La pestaña o el documento cambió. Vuelve a comprobar el acceso y selecciona texto.',
  'too-large': 'La página o la selección supera el límite de captura.',
};

function clearPreview() {
  selected = undefined;
  quote.textContent = '';
  source.textContent = '';
  captureStatus.textContent = '';
  coding.clear();
  notes.clear();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = '';
  target = undefined;
  highlights.clear();
  captureButton.disabled = true;
  clearPreview();
  try {
    status.textContent = await verifySiteAccess(
      input.value,
      async (nextTarget) => {
        const registration = await chrome.runtime.sendMessage({
          type: 'site.enable',
          url: nextTarget.url,
        });
        if (registration?.enabled !== true)
          throw new Error('No se pudo registrar el sitio.');

        await chrome.scripting.executeScript({
          target: {
            tabId: nextTarget.tabId,
            documentIds: [nextTarget.documentId],
          },
          files: ['content.js'],
        });
        const prepared = await chrome.tabs.sendMessage(
          nextTarget.tabId,
          { type: 'capture.prepare' },
          { documentId: nextTarget.documentId },
        );
        if (prepared !== true)
          throw new Error('El documento ya no está disponible.');
        target = projectId ? { ...nextTarget, projectId } : nextTarget;
        captureButton.disabled = Boolean(projects && !projectId);
      },
    );
  } catch {
    status.textContent = 'Chromium no permitió comprobar el acceso al sitio.';
  } finally {
    button.disabled = false;
  }
});

captureButton.addEventListener('click', async () => {
  const current = target;
  if (!current) return;
  captureButton.disabled = true;
  clearPreview();
  const result = await readSelection(current);
  if (target !== current) return;
  captureButton.disabled = false;

  if (result.kind === 'selection') {
    selected = result;
    quote.textContent = result.selectors.quote.exact;
    source.textContent = result.url;
    captureStatus.textContent = 'Selección capturada.';
    void coding.show(current, result);
    void notes.show(current, result);
  } else {
    captureStatus.textContent = captureMessages[result.kind];
  }
});

const evidence = document.getElementById(
  'evidence-search',
) as HTMLFormElement | null;
const refreshEvidence = evidence && mountEvidence(evidence);
const catalog = document.getElementById(
  'catalog',
) as HTMLFieldSetElement | null;
const setCatalogProject =
  catalog &&
  mountCatalog(catalog, () => {
    highlights.clear();
    refreshEvidence?.(projectId ?? null);
    if (target && selected) void coding.show(target, selected);
  });
const transfer = document.getElementById('project-transfer');
const setTransferProject = transfer && mountTransfer(transfer);
const projects = document.getElementById(
  'projects',
) as HTMLFieldSetElement | null;
if (projects) {
  mountProjects(projects, (id) => {
    if (projectId === id) return;
    projectId = id;
    setCatalogProject?.(id);
    setTransferProject?.(id);
    refreshEvidence?.(id);
    highlights.clear();
    clearPreview();
    if (target) {
      const { tabId, documentId, url } = target;
      target = { tabId, documentId, url, ...(id ? { projectId: id } : {}) };
      captureButton.disabled = id === null;
    }
  });
}
