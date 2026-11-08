import { isRecord } from '../capture-contract';
import type { CaptureTarget, SelectionSnapshot } from '../capture-contract';
import { fragmentKey } from '../domain/codings';
import type { CodeAssignment } from '../domain/codings';
import { readSelection } from './read-selection';

function isAssignment(value: unknown): value is CodeAssignment {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.projectId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.color === 'string' &&
    /^#[0-9a-f]{6}$/i.test(value.color) &&
    typeof value.assigned === 'boolean'
  );
}

async function requestCodes(
  message: Record<string, unknown>,
): Promise<CodeAssignment[]> {
  const response: unknown = await chrome.runtime.sendMessage(message);
  if (
    !isRecord(response) ||
    response.kind !== 'codings' ||
    !Array.isArray(response.codes) ||
    !response.codes.every(isAssignment)
  ) {
    throw new Error('Respuesta de codificación no válida.');
  }
  return response.codes;
}

export function createCodingControls(
  fieldset: HTMLFieldSetElement,
  options: HTMLElement,
  status: HTMLElement,
  onCodes?: (target: CaptureTarget, codes: readonly CodeAssignment[]) => void,
) {
  let active:
    { target: CaptureTarget; snapshot: SelectionSnapshot } | undefined;

  function clear() {
    active = undefined;
    fieldset.disabled = true;
    options.replaceChildren();
    status.textContent = '';
  }

  function render(codes: readonly CodeAssignment[]) {
    options.replaceChildren();
    for (const code of codes) {
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = code.assigned;
      checkbox.addEventListener('change', () => {
        const assigned = checkbox.checked;
        checkbox.checked = code.assigned;
        void change(code.id, assigned);
      });
      const swatch = document.createElement('span');
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.cssText =
        'display:inline-block;width:0.8em;height:0.8em;margin:0 0.3em;border:1px solid currentColor';
      swatch.style.backgroundColor = code.color;
      label.append(checkbox, swatch, code.name);
      const row = document.createElement('div');
      row.append(label);
      options.append(row);
    }
    fieldset.disabled = false;
  }

  async function change(codeId: string, assigned: boolean) {
    const current = active;
    if (!current || fieldset.disabled) return;
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
      const codes = await requestCodes({
        type: 'coding.set',
        fragment: latest,
        codeId,
        assigned,
      });
      if (active === current) {
        render(codes);
        onCodes?.(current.target, codes);
        status.textContent = 'Códigos actualizados en memoria.';
      }
    } catch {
      if (active === current) {
        clear();
        status.textContent =
          'No se pudieron actualizar los códigos. Vuelve a capturar el fragmento.';
      }
    }
  }

  async function show(target: CaptureTarget, snapshot: SelectionSnapshot) {
    clear();
    const current = { target, snapshot };
    active = current;
    try {
      const codes = await requestCodes({
        type: 'coding.read',
        fragment: snapshot,
      });
      if (active === current) {
        render(codes);
        onCodes?.(target, codes);
      }
    } catch {
      if (active === current)
        status.textContent = 'No se pudieron consultar los códigos.';
    }
  }

  return { clear, show };
}
