import { isRecord } from '../capture-contract';
import type { CaptureTarget, SelectionSnapshot } from '../capture-contract';
import { fragmentKey } from '../domain/codings';
import { readSelection } from './read-selection';

function decodeNote(value: unknown): string | null {
  if (
    !isRecord(value) ||
    value.kind !== 'note' ||
    (value.note !== null &&
      (typeof value.note !== 'string' || value.note.length > 16_384))
  ) {
    throw new Error('Respuesta de nota no válida.');
  }
  return value.note;
}

export function createNoteControls(
  fieldset: HTMLFieldSetElement,
  input: HTMLTextAreaElement,
  save: HTMLButtonElement,
  remove: HTMLButtonElement,
  status: HTMLElement,
) {
  let active:
    { target: CaptureTarget; snapshot: SelectionSnapshot } | undefined;

  function clear() {
    active = undefined;
    input.value = '';
    fieldset.disabled = true;
    status.textContent = '';
  }

  function display(note: string | null) {
    input.value = note ?? '';
    remove.disabled = note === null;
    fieldset.disabled = false;
  }

  async function change(note: string | null) {
    const current = active;
    if (!current || fieldset.disabled) return;
    if (note !== null && (!note.trim() || note.length > 16_384)) {
      status.textContent =
        'Escribe una nota de hasta 16 384 caracteres o usa Borrar nota.';
      return;
    }
    fieldset.disabled = true;
    status.textContent = '';
    const latest = await readSelection(current.target);
    if (active !== current) return;
    if (
      latest.kind !== 'selection' ||
      latest.revision !== current.snapshot.revision ||
      fragmentKey(latest) !== fragmentKey(current.snapshot)
    ) {
      clear();
      status.textContent =
        'La selección cambió. Vuelve a capturar el fragmento.';
      return;
    }

    try {
      const message = {
        type: 'note.set',
        ...(current.target.projectId
          ? { projectId: current.target.projectId }
          : {}),
        fragment: latest,
        note,
        operationId: crypto.randomUUID(),
      };
      const reply: unknown = await chrome.runtime
        .sendMessage(message)
        .catch(() => chrome.runtime.sendMessage(message));
      const stored = decodeNote(reply);
      if (active === current) {
        display(stored);
        status.textContent =
          stored === null ? 'Nota borrada.' : 'Nota guardada.';
      }
    } catch {
      if (active === current) {
        fieldset.disabled = false;
        status.textContent = 'No se pudo guardar el cambio.';
      }
    }
  }

  save.addEventListener('click', () => void change(input.value));
  remove.addEventListener('click', () => void change(null));

  return {
    clear,
    async show(target: CaptureTarget, snapshot: SelectionSnapshot) {
      clear();
      const current = { target, snapshot };
      active = current;
      try {
        const note = decodeNote(
          await chrome.runtime.sendMessage({
            type: 'note.read',
            ...(current.target.projectId
              ? { projectId: current.target.projectId }
              : {}),
            fragment: snapshot,
          }),
        );
        if (active === current) display(note);
      } catch {
        if (active === current)
          status.textContent = 'No se pudo consultar la nota.';
      }
    },
  };
}
