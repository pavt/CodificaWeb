import type { CaptureTarget } from '../capture-contract';
import { createCodingControls } from './coding-controls';
import { readSelection } from './read-selection';
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
const coding = createCodingControls(
  document.getElementById('fragment-codes') as HTMLFieldSetElement,
  document.getElementById('coding-options') as HTMLElement,
  document.getElementById('coding-status') as HTMLElement,
);
let target: CaptureTarget | undefined;

const captureMessages = {
  empty: 'Selecciona texto en la página e inténtalo de nuevo.',
  excluded: 'Esta selección incluye contenido editable o excluido.',
  stale:
    'La pestaña o el documento cambió. Vuelve a comprobar el acceso y selecciona texto.',
  'too-large': 'La página o la selección supera el límite de captura.',
};

function clearPreview() {
  quote.textContent = '';
  source.textContent = '';
  captureStatus.textContent = '';
  coding.clear();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  button.disabled = true;
  status.textContent = '';
  target = undefined;
  captureButton.disabled = true;
  clearPreview();
  try {
    status.textContent = await verifySiteAccess(
      input.value,
      async (nextTarget) => {
        await chrome.scripting.executeScript({
          target: {
            tabId: nextTarget.tabId,
            documentIds: [nextTarget.documentId],
          },
          files: ['content.js'],
        });
        target = nextTarget;
        captureButton.disabled = false;
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
    quote.textContent = result.selectors.quote.exact;
    source.textContent = result.url;
    captureStatus.textContent = 'Selección capturada.';
    void coding.show(current, result);
  } else {
    captureStatus.textContent = captureMessages[result.kind];
  }
});
