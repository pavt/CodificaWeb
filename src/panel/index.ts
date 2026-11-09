import { isRecord } from '../capture-contract';
import type { CaptureTarget, SelectionSnapshot } from '../capture-contract';
import { mountCatalog } from './catalog-controls';
import { createCodingControls } from './coding-controls';
import { mountEvidence } from './evidence-controls';
import { createHighlightFilter } from './highlight-filter';
import { createNoteControls } from './note-controls';
import { mountProjects } from './project-controls';
import { mountRelations } from './relation-controls';
import { readSelection } from './read-selection';
import { mountTransfer } from './transfer-controls';
import { verifySiteAccess } from './site-access';

const form = document.getElementById('site-access') as HTMLFormElement;
const input = document.getElementById('site-url') as HTMLInputElement;
const button = document.getElementById('verify-site') as HTMLButtonElement;
const status = document.getElementById('site-status') as HTMLElement;
const urlField = document.getElementById('site-url-field');

const captureButton = document.getElementById(
  'capture-selection',
) as HTMLButtonElement;
const captureStatus = document.getElementById('capture-status') as HTMLElement;
const quote = document.getElementById('selection-quote') as HTMLElement;
const source = document.getElementById('selection-source') as HTMLElement;
const relationRoot = document.getElementById('citation-relation');
const relations = relationRoot && mountRelations(relationRoot);
const selectionRelation = document.getElementById('selection-relation');
const inspectionRelation = document.getElementById('inspection-relation');

async function updateSelectionRelation(
  snapshot: SelectionSnapshot,
  id: string,
) {
  if (!selectionRelation || !relations) return;
  selectionRelation.hidden = true;
  try {
    const response: unknown = await chrome.runtime.sendMessage({
      type: 'coding.citation',
      projectId: id,
      fragment: snapshot,
    });
    if (selected !== snapshot || projectId !== id) return;
    if (
      isRecord(response) &&
      response.kind === 'citation' &&
      typeof response.id === 'string'
    ) {
      selectionRelation.replaceChildren(
        relations.action({
          id: response.id,
          quote: snapshot.selectors.quote.exact,
          url: snapshot.url,
        }),
      );
      selectionRelation.hidden = false;
    }
  } catch {
    // Saved citations are also available through evidence search.
  }
}

const highlights = createHighlightFilter(
  document.getElementById('highlight-filter') as HTMLSelectElement,
  document.getElementById('highlight-status') as HTMLElement,
  (id, quote, url) => {
    if (
      !relations ||
      !inspectionRelation ||
      inspectionRelation.dataset.citation === id
    )
      return;
    inspectionRelation.dataset.citation = id;
    inspectionRelation.replaceChildren(relations.action({ id, quote, url }));
  },
);
const coding = createCodingControls(
  document.getElementById('fragment-codes') as HTMLFieldSetElement,
  document.getElementById('coding-options') as HTMLElement,
  document.getElementById('coding-status') as HTMLElement,
  (target, codes) => {
    highlights.update(target, codes);
    if (selected && projectId)
      void updateSelectionRelation(selected, projectId);
    const applied = codes.find(({ assigned }) => assigned);
    const card = document.getElementById('quote-card');
    const title = document.getElementById('selection-title');
    if (card && title) {
      card.toggleAttribute('data-saved', Boolean(applied));
      if (applied) card.style.setProperty('--category-color', applied.color);
      title.textContent = applied ? 'Cita guardada' : 'Texto seleccionado';
    }
  },
  ({ projectId }) => {
    if (!projectId) return;
    setCatalogProject?.(projectId);
    refreshEvidence?.(projectId);
  },
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
let direct = false;
let activeTabId: number | undefined;
let requiresInvocation = false;
let accessRequest = 0;
let captureRequest = 0;

const captureMessages = {
  empty: 'Selecciona texto en la página e inténtalo de nuevo.',
  excluded: 'Esta selección incluye contenido editable o excluido.',
  stale:
    'La pestaña o el documento cambió. Vuelve a comprobar el acceso y selecciona texto.',
  'too-large': 'La página o la selección supera el límite de captura.',
};

function clearPreview() {
  captureRequest++;
  selected = undefined;
  if (selectionRelation) selectionRelation.hidden = true;
  quote.textContent = '';
  document.getElementById('quote-card')?.removeAttribute('data-saved');
  const title = document.getElementById('selection-title');
  if (title) title.textContent = 'Texto seleccionado';
  source.textContent = '';
  captureStatus.textContent = '';
  coding.clear();
  notes.clear();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const request = ++accessRequest;
  button.disabled = true;
  status.textContent = '';
  // The optional permission must not discard the activeTab capture.
  const url = input.value;
  if (!direct) {
    target = undefined;
    highlights.clear();
    captureButton.disabled = true;
    clearPreview();
  }
  let preparedTarget: CaptureTarget | undefined;
  try {
    const result = await verifySiteAccess(url, async (nextTarget) => {
      if (request !== accessRequest) return;
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
      if (request !== accessRequest) return;
      preparedTarget = nextTarget;
    });
    if (request === accessRequest) {
      status.textContent = result;
      if (preparedTarget) {
        target = projectId ? { ...preparedTarget, projectId } : preparedTarget;
        captureButton.disabled = Boolean(projects && !projectId);
        if (direct) void captureCurrent();
      }
    }
  } catch {
    if (request === accessRequest)
      status.textContent = 'Chromium no permitió comprobar el acceso al sitio.';
  } finally {
    if (request === accessRequest) button.disabled = direct && !target;
  }
});

async function captureCurrent() {
  const current = target;
  if (!current) return;
  captureButton.disabled = true;
  clearPreview();
  const request = captureRequest;
  const result = await readSelection(current);
  if (target !== current || request !== captureRequest) return;
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
}

captureButton.addEventListener('click', () => void captureCurrent());

function resetTarget() {
  target = undefined;
  highlights.clear();
  clearPreview();
  captureButton.disabled = true;
  input.value = '';
}

async function attachActiveTab() {
  if (requiresInvocation) return;
  const request = ++accessRequest;
  resetTarget();
  if (urlField) urlField.hidden = true;
  button.disabled = true;
  button.textContent = 'Conservar resaltados al volver';
  status.textContent =
    'Pulsa el icono de CodificaWeb en la página que quieras codificar.';
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    if (request !== accessRequest) return;
    activeTabId = tab?.id;
    if (tab?.id === undefined || !tab.url || !/^https?:\/\//.test(tab.url))
      return;
    const [script] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
    if (!script?.documentId || request !== accessRequest) return;
    const prepared: unknown = await chrome.tabs.sendMessage(
      tab.id,
      { type: 'capture.prepare', temporary: true, url: tab.url },
      { documentId: script.documentId },
    );
    if (prepared !== true || request !== accessRequest) return;
    target = {
      tabId: tab.id,
      documentId: script.documentId,
      url: tab.url,
      ...(projectId ? { projectId } : {}),
    };
    input.value = tab.url;
    button.disabled = false;
    status.textContent = '';
    captureButton.disabled = projectId === null;
    if (projectId !== null) {
      highlights.track(target);
      void captureCurrent();
    }
  } catch {
    // Restricted pages and tabs without access leave the capture disabled.
  }
}

const evidence = document.getElementById(
  'evidence-search',
) as HTMLFormElement | null;
const refreshEvidence = evidence && mountEvidence(evidence, relations?.action);
const catalog = document.getElementById(
  'catalog',
) as HTMLFieldSetElement | null;
const setCatalogProject =
  catalog &&
  mountCatalog(catalog, () => {
    highlights.clear();
    refreshEvidence?.(projectId ?? null);
    if (target && selected) void coding.show(target, selected);
    else if (direct && target) highlights.track(target);
  });
const transfer = document.getElementById('project-transfer');
const setTransferProject = transfer && mountTransfer(transfer);
const projects = document.getElementById(
  'projects',
) as HTMLFieldSetElement | null;
if (projects) {
  mountProjects(projects, (id) => {
    if (projectId === id) return;
    const loadingInitialProject = projectId === undefined;
    projectId = id;
    relations?.setProject(id);
    setCatalogProject?.(id);
    setTransferProject?.(id);
    refreshEvidence?.(id);
    highlights.clear();
    clearPreview();
    if (target) {
      const { tabId, documentId, url } = target;
      target = { tabId, documentId, url, ...(id ? { projectId: id } : {}) };
      captureButton.disabled = id === null;
      if (direct && id) highlights.track(target);
      if (direct && id && loadingInitialProject) void captureCurrent();
    }
  });
}

if (chrome.tabs?.onActivated) {
  // Opening the panel HTML in a tab keeps the original explicit controls.
  void chrome.tabs
    .getCurrent()
    .then((tab) => {
      if (tab) return;
      direct = true;
      document.getElementById('panel-tools')?.removeAttribute('open');
      if (accessRequest === 0) void attachActiveTab();
    })
    .catch(() => undefined);
  chrome.tabs.onActivated.addListener(() => {
    if (direct) void attachActiveTab();
  });
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    if (
      direct &&
      tabId === activeTabId &&
      (change.url ||
        change.status === 'loading' ||
        (change.status === 'complete' && !target))
    ) {
      void attachActiveTab();
    }
  });
  chrome.permissions.onRemoved.addListener(() => {
    if (!direct) return;
    requiresInvocation = true;
    accessRequest++;
    resetTarget();
    button.disabled = true;
    status.textContent =
      'Pulsa el icono de CodificaWeb para recuperar el acceso.';
  });
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !isRecord(message)) return;
    if (message.type === 'capture.invoked' && direct && !sender.tab) {
      requiresInvocation = false;
      void attachActiveTab();
    }
    if (
      direct &&
      target &&
      sender.tab?.id === target.tabId &&
      sender.documentId === target.documentId &&
      sender.url === target.url &&
      typeof message.id === 'string'
    ) {
      const categoryId =
        message.type === 'citation.open' &&
        typeof message.categoryId === 'string'
          ? message.categoryId
          : undefined;
      if (message.type === 'citation.preview' || categoryId !== undefined) {
        const savedView = relations?.hasSavedView() === true;
        const inspected = highlights.inspect(message.id, categoryId, savedView);
        if (inspected && savedView) {
          relations?.dismissSavedView();
          document
            .getElementById('citation-inspection')
            ?.scrollIntoView({ block: 'nearest' });
        }
        if (categoryId !== undefined) respond(inspected);
      }
    }
    if (
      message.type === 'capture.changed' &&
      direct &&
      target &&
      sender.tab?.id === target.tabId &&
      sender.documentId === target.documentId
    )
      void captureCurrent();
  });
}
