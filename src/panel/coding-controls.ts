import { isRecord } from '../capture-contract';
import type { CaptureTarget, SelectionSnapshot } from '../capture-contract';
import { codeNameKey, fragmentKey } from '../domain/codings';
import type { CodeAssignment } from '../domain/codings';
import { readSelection } from './read-selection';

function isAssignment(value: unknown): value is CodeAssignment {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.projectId === 'string' &&
    typeof value.name === 'string' &&
    (value.description === undefined ||
      typeof value.description === 'string') &&
    typeof value.color === 'string' &&
    /^#[0-9a-f]{6}$/i.test(value.color) &&
    typeof value.assigned === 'boolean'
  );
}

async function requestCodes(
  message: Record<string, unknown>,
): Promise<CodeAssignment[]> {
  let response: unknown;
  try {
    response = await chrome.runtime.sendMessage(message);
  } catch (error) {
    if (
      message.type !== 'coding.set' &&
      message.type !== 'coding.createAndApply'
    )
      throw error;
    // A closed message channel does not reveal whether the worker committed.
    response = await chrome.runtime.sendMessage(message);
  }
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
  onCatalogChanged?: (target: CaptureTarget) => void,
) {
  let active:
    { target: CaptureTarget; snapshot: SelectionSnapshot } | undefined;

  const search = fieldset.querySelector<HTMLInputElement>('#category-search');
  const form = fieldset.querySelector<HTMLFormElement>('#category-create');
  let available: readonly CodeAssignment[] = [];
  let draft: { key: string; operationId: string } | undefined;

  const assign = fieldset.querySelector<HTMLElement>('#category-assign');
  const open = fieldset.querySelector<HTMLButtonElement>('#category-open');
  const cancel = fieldset.querySelector<HTMLButtonElement>('#category-cancel');
  const color = form?.querySelector<HTMLInputElement>('#category-color');
  const presets = form?.querySelectorAll<HTMLButtonElement>('[data-color]');

  const definitionForm = fieldset.querySelector<HTMLFormElement>(
    '#category-edit-definition',
  );
  const definitionInput =
    definitionForm?.querySelector<HTMLTextAreaElement>('textarea');
  const definitionTitle =
    definitionForm?.querySelector<HTMLElement>('#definition-title');
  let editingCode: CodeAssignment | undefined;

  function closeDefinition() {
    editingCode = undefined;
    if (definitionForm) definitionForm.hidden = true;
    if (assign) assign.hidden = false;
  }

  definitionForm
    ?.querySelector('#definition-cancel')
    ?.addEventListener('click', () => {
      const id = editingCode?.id;
      closeDefinition();
      definitionButton(id)?.focus();
    });

  function definitionButton(id: string | undefined) {
    return [
      ...options.querySelectorAll<HTMLButtonElement>('.definition-edit'),
    ].find((button) => button.dataset.codeId === id);
  }

  definitionForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = active;
    const code = editingCode;
    if (!current || !code || !definitionInput || fieldset.disabled) return;
    fieldset.disabled = true;
    status.textContent = '';
    try {
      const codes = await requestCodes({
        type: 'coding.updateDefinition',
        projectId: code.projectId,
        codeId: code.id,
        fragment: current.snapshot,
        description: definitionInput.value,
      });
      if (active !== current) return;
      available = codes;
      closeDefinition();
      render();
      onCatalogChanged?.(current.target);
      status.textContent = 'Definición guardada.';
    } catch {
      if (active === current)
        status.textContent =
          'No se pudo guardar la definición. Vuelve a intentarlo.';
    } finally {
      if (active === current) {
        fieldset.disabled = false;
        if (!editingCode) definitionButton(code.id)?.focus();
      }
    }
  });

  function syncColor() {
    presets?.forEach((preset) =>
      preset.setAttribute(
        'aria-pressed',
        String(preset.dataset.color === color?.value),
      ),
    );
  }

  function setEditing(editing: boolean) {
    if (form) form.hidden = !editing;
    if (assign) assign.hidden = editing;
  }

  open?.addEventListener('click', () => {
    setEditing(true);
    status.textContent = '';
    form?.querySelector<HTMLInputElement>('#category-name')?.focus();
  });
  cancel?.addEventListener('click', () => {
    form?.reset();
    syncColor();
    draft = undefined;
    setEditing(false);
    status.textContent = '';
    open?.focus();
  });
  color?.addEventListener('input', syncColor);
  presets?.forEach((preset) =>
    preset.addEventListener('click', () => {
      if (color && preset.dataset.color) color.value = preset.dataset.color;
      syncColor();
    }),
  );

  function clear() {
    active = undefined;
    draft = undefined;
    available = [];
    form?.reset();
    syncColor();
    setEditing(false);
    closeDefinition();
    if (search) search.value = '';
    fieldset.disabled = true;
    options.replaceChildren();
    status.textContent = '';
  }

  function render(focusCodeId?: string) {
    options.replaceChildren();
    const query = codeNameKey(search?.value ?? '');
    for (const code of available) {
      if (!codeNameKey(code.name).includes(query)) continue;
      const label = document.createElement('label');
      label.style.setProperty('--category-color', code.color);
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = code.assigned;
      checkbox.addEventListener('change', () => {
        const assigned = checkbox.checked;
        checkbox.checked = code.assigned;
        const interaction = new AbortController();
        let focusCodeId =
          document.activeElement === checkbox ? code.id : undefined;
        const abandonFocus = () => {
          focusCodeId = undefined;
        };
        const options = { capture: true, signal: interaction.signal };
        document.addEventListener('pointerdown', abandonFocus, options);
        document.addEventListener('focusin', abandonFocus, options);
        void change(
          {
            type: 'coding.set',
            codeId: code.id,
            assigned,
            operationId: crypto.randomUUID(),
          },
          () => focusCodeId,
        ).finally(() => interaction.abort());
      });
      const swatch = document.createElement('span');
      swatch.setAttribute('aria-hidden', 'true');
      swatch.style.cssText =
        'display:inline-block;width:0.8em;height:0.8em;margin:0 0.3em;border:1px solid currentColor';
      swatch.style.backgroundColor = code.color;
      label.append(checkbox, swatch, code.name);
      const row = document.createElement('div');
      row.append(label);
      if (code.description) {
        const definition = document.createElement('small');
        definition.style.display = 'block';
        definition.style.overflowWrap = 'anywhere';
        definition.textContent = code.description;
        row.append(definition);
      }
      if (
        code.assigned &&
        definitionForm &&
        definitionInput &&
        definitionTitle
      ) {
        const edit = document.createElement('button');
        edit.className = 'definition-edit';
        edit.type = 'button';
        edit.dataset.codeId = code.id;
        edit.textContent = code.description
          ? 'Editar definición'
          : 'Añadir definición';
        edit.setAttribute('aria-label', `${edit.textContent} de ${code.name}`);
        edit.addEventListener('click', () => {
          editingCode = code;
          definitionTitle.textContent = `Definición de ${code.name}`;
          definitionInput.value = code.description ?? '';
          definitionForm.hidden = false;
          if (assign) assign.hidden = true;
          status.textContent = '';
          definitionInput.focus();
        });
        row.append(edit);
      }
      options.append(row);
      if (code.id === focusCodeId) checkbox.focus();
    }
  }

  search?.addEventListener('input', () => render());
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const fields = new FormData(form);
    const name = String(fields.get('name')).trim();
    if (!name) {
      status.textContent = 'Escribe un nombre para la categoría.';
      return;
    }
    const description = String(fields.get('description'));
    const color = String(fields.get('color'));
    const key = JSON.stringify([name, description, color]);
    if (draft?.key !== key) draft = { key, operationId: crypto.randomUUID() };
    void change({
      type: 'coding.createAndApply',
      name,
      description,
      color,
      operationId: draft.operationId,
    });
  });

  async function change(
    message: Record<string, unknown>,
    focusAfterSave?: () => string | undefined,
  ) {
    const current = active;
    if (!current || fieldset.disabled) return;
    const creating = message.type === 'coding.createAndApply';
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
        ...message,
        ...(current.target.projectId
          ? { projectId: current.target.projectId }
          : {}),
        fragment: latest,
      });
      if (active === current) {
        if (creating) {
          draft = undefined;
          form?.reset();
          syncColor();
          setEditing(false);
          if (search) search.value = '';
        }
        available = codes;
        fieldset.disabled = false;
        render(focusAfterSave?.());
        onCodes?.(current.target, codes);
        if (creating) {
          onCatalogChanged?.(current.target);
          open?.focus();
        }
        status.textContent = creating
          ? 'Categoría guardada y aplicada.'
          : 'Códigos guardados en este navegador.';
      }
    } catch {
      if (active === current) {
        if (creating) {
          fieldset.disabled = false;
          status.textContent =
            'No se pudo guardar la categoría. Comprueba el nombre. Vuelve a intentarlo desde este formulario.';
        } else {
          clear();
          status.textContent =
            'No se pudieron actualizar los códigos. Vuelve a capturar el fragmento.';
        }
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
        ...(current.target.projectId
          ? { projectId: current.target.projectId }
          : {}),
        fragment: snapshot,
      });
      if (active === current) {
        available = codes;
        render();
        fieldset.disabled = false;
        onCodes?.(target, codes);
      }
    } catch {
      if (active === current)
        status.textContent = 'No se pudieron consultar los códigos.';
    }
  }

  return { clear, show };
}
