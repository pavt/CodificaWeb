import { isRecord } from '../capture-contract';
import type { CaptureTarget, SelectionSnapshot } from '../capture-contract';
import { mountCatalog } from './catalog-controls';
import { createCodingControls } from './coding-controls';
import { mountDocumentSetup } from './document-setup';
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
const selectionTitle = document.getElementById('selection-title');
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
  (id, quote, url, explicit) => {
    if (inspectionRelation) inspectionRelation.hidden = !explicit;
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
      citationLookup = updateSelectionRelation(selected, projectId);
    const applied = codes.find(({ assigned }) => assigned);
    const card = document.getElementById('quote-card');
    if (card && selectionTitle) {
      card.toggleAttribute('data-saved', Boolean(applied));
      if (applied) card.style.setProperty('--category-color', applied.color);
      selectionTitle.textContent = applied
        ? 'Cita guardada'
        : 'Texto seleccionado';
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
let previewed: SelectionSnapshot | undefined;
let codingRead: Promise<void> | undefined;
let citationLookup: Promise<void> | undefined;
let target: CaptureTarget | undefined;
let readyTarget: CaptureTarget | undefined;
let projectId: string | null | undefined;
let direct = false;
let activeTabId: number | undefined;
let requiresInvocation = false;
let accessRequest = 0;
let captureRequest = 0;
const setupForm = document.getElementById(
  'document-setup',
) as HTMLFormElement | null;
const setup =
  setupForm &&
  mountDocumentSetup(
    setupForm,
    (id) => {
      const selection = previewed;
      applyProject(id, false);
      readyTarget = target;
      if (target && selection) showSelection(target, selection, true);
      else void captureCurrent();
    },
    () => {
      captureStatus.textContent =
        'No se pudo verificar si la página pertenece al proyecto. Vuelve a abrir la página.';
      captureStatus.classList.add('capture-error');
    },
  );

const captureMessages = {
  empty: 'Selecciona texto en la página para asignarle una categoría.',
  excluded: 'Esta selección incluye contenido editable o excluido.',
  stale:
    'La pestaña o el documento cambió. Vuelve a comprobar el acceso y selecciona texto.',
  'too-large': 'La página o la selección supera el límite de captura.',
};

function clearPreview() {
  captureRequest++;
  selected = previewed = undefined;
  codingRead = citationLookup = undefined;
  if (selectionRelation) selectionRelation.hidden = true;
  quote.textContent = '';
  document.getElementById('quote-card')?.removeAttribute('data-saved');
  if (selectionTitle) selectionTitle.textContent = 'Sin selección';
  source.textContent = '';
  captureStatus.textContent = '';
  captureStatus.classList?.remove('capture-error');
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
        if (direct) {
          checkPage();
          void captureCurrent();
        }
      }
    }
  } catch {
    if (request === accessRequest)
      status.textContent = 'Chromium no permitió comprobar el acceso al sitio.';
  } finally {
    if (request === accessRequest) button.disabled = direct && !target;
  }
});

async function captureCurrent(fromUserSelection = false, dismiss = false) {
  const current = target;
  if (!current) return;
  captureButton.disabled = true;
  const request = ++captureRequest;
  const result = await readSelection(current);
  if (target !== current || request !== captureRequest) return;
  captureButton.disabled = false;
  if (
    fromUserSelection &&
    !dismiss &&
    result.kind === 'empty' &&
    previewed &&
    !selected
  )
    return;
  if (fromUserSelection && !dismiss && result.kind === 'empty' && selected) {
    // Let the saved citation lookup finish before deciding whether to keep it.
    await codingRead;
    await citationLookup;
    if (target !== current || request !== captureRequest) return;
    if (selectionRelation?.hidden === false) return;
  }
  clearPreview();

  if (result.kind === 'selection') {
    presentSelection(result, fromUserSelection);
    if (direct && setup && readyTarget !== current) return;
    showSelection(current, result, fromUserSelection);
  } else {
    captureStatus.textContent = captureMessages[result.kind];
  }
}

function showSelection(
  current: CaptureTarget,
  result: SelectionSnapshot,
  fromUserSelection: boolean,
) {
  if (previewed !== result) presentSelection(result, fromUserSelection);
  selected = result;
  captureStatus.textContent = 'Selección capturada.';
  codingRead = coding.show(current, result);
  void notes.show(current, result);
}

function presentSelection(
  result: SelectionSnapshot,
  fromUserSelection: boolean,
) {
  previewed = result;
  if (selectionTitle) selectionTitle.textContent = 'Texto seleccionado';
  quote.textContent = result.selectors.quote.exact;
  source.textContent = result.url;
  if (fromUserSelection && relations?.hasSavedView()) {
    relations.dismissSavedView();
    document.getElementById('quote-card')?.scrollIntoView({ block: 'nearest' });
  }
}

captureButton.addEventListener('click', () => void captureCurrent(true));

function resetTarget() {
  setup?.clear();
  target = readyTarget = undefined;
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
    if (projectId) highlights.track(target);
    checkPage();
    void captureCurrent();
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
function checkPage() {
  const page = target;
  if (!page || !setup) return;
  setup.clear();
  void setup.check(page, () => target === page);
}

function applyProject(id: string | null, recapture = true) {
  const initialProject = projectId === undefined;
  const changed = projectId !== id;
  if (changed) {
    projectId = id;
    relations?.setProject(id);
    setCatalogProject?.(id);
    setTransferProject?.(id);
    refreshEvidence?.(id);
    highlights.clear();
  }
  clearPreview();
  if (target) {
    const { tabId, documentId, url } = target;
    target = { tabId, documentId, url, ...(id ? { projectId: id } : {}) };
    captureButton.disabled = id === null && !direct;
    if (direct && id) highlights.track(target);
    if (direct && recapture) {
      checkPage();
      if (initialProject) void captureCurrent();
    }
  }
}
if (projects)
  mountProjects(projects, (id) => {
    if (projectId !== id) applyProject(id);
  });

if (chrome.tabs?.onActivated) {
  // Opening the panel HTML in a tab keeps the original explicit controls.
  void chrome.tabs
    .getCurrent()
    .then((tab) => {
      if (tab) {
        for (const control of document.querySelectorAll<HTMLElement>(
          '[data-tab-only]',
        )) {
          control.hidden = false;
        }
        return;
      }
      direct = true;
      const citations = document.getElementById('page-citations');
      const filter = document.getElementById('highlight-filter');
      const quoteCard = document.getElementById('quote-card');
      const note = document.getElementById('fragment-note');
      const noteStatus = document.getElementById('note-status');
      if (citations && filter) {
        const label = filter.previousElementSibling;
        const list = document.getElementById('page-citation-list');
        const filterStatus = document.getElementById('highlight-status');
        if (label && list && filterStatus)
          list.before(label, filter, filterStatus);
      }
      if (quoteCard && note && noteStatus) {
        note.classList.add('page-note');
        (setupForm ?? quoteCard).after(note, noteStatus);
      }
      citations?.append(form);
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
      sender.url === target.url
    ) {
      if (message.type === 'citation.preview.end') highlights.endPreview();
      const categoryId =
        message.type === 'citation.open' &&
        typeof message.categoryId === 'string'
          ? message.categoryId
          : undefined;
      if (
        typeof message.id === 'string' &&
        (message.type === 'citation.preview' || categoryId !== undefined)
      ) {
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
      void captureCurrent(true, message.dismiss === true);
  });
}
