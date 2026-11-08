import { isRecord } from '../capture-contract';

interface CatalogCode {
  id: string;
  name: string;
  description: string;
  color: string;
}

function isCode(value: unknown): value is CatalogCode {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    typeof value.color === 'string' &&
    /^#[0-9a-f]{6}$/i.test(value.color)
  );
}

export function mountCatalog(root: HTMLFieldSetElement, onChanged: () => void) {
  const select = root.querySelector('#catalog-select') as HTMLSelectElement;
  const name = root.querySelector('#catalog-name') as HTMLInputElement;
  const description = root.querySelector(
    '#catalog-description',
  ) as HTMLTextAreaElement;
  const color = root.querySelector('#catalog-color') as HTMLInputElement;
  const status = root.querySelector('#catalog-status') as HTMLElement;
  const save = root.querySelector('#catalog-save') as HTMLButtonElement;
  const remove = root.querySelector('#catalog-remove') as HTMLButtonElement;
  let projectId: string | null = null;
  let generation = 0;
  let codes: CatalogCode[] = [];

  function showFields() {
    const code = codes.find(({ id }) => id === select.value);
    name.value = code?.name ?? '';
    description.value = code?.description ?? '';
    color.value = code?.color ?? 'Automático al crear';
    color.style.borderInlineStartColor = code?.color ?? '';
    save.disabled = remove.disabled = !code;
  }

  async function request(message: Record<string, unknown>) {
    if (!projectId) return;
    const requestId = ++generation;
    const selected = select.value;
    root.disabled = true;
    status.textContent = '';
    try {
      const result: unknown = await chrome.runtime.sendMessage({
        ...message,
        projectId,
      });
      if (requestId !== generation) return;
      if (
        !isRecord(result) ||
        result.kind !== 'catalog' ||
        !Array.isArray(result.codes) ||
        !result.codes.every(isCode)
      )
        throw new Error('Respuesta de catálogo no válida.');
      codes = result.codes;
      select.replaceChildren(
        new Option('Nuevo código', ''),
        ...codes.map((code) => new Option(code.name, code.id)),
      );
      select.value = codes.some(({ id }) => id === selected) ? selected : '';
      showFields();
      if (message.type !== 'code.list') {
        status.textContent = 'Catálogo actualizado.';
        onChanged();
      }
    } catch {
      if (requestId === generation)
        status.textContent =
          'No se pudo actualizar el catálogo. Comprueba el nombre.';
    } finally {
      if (requestId === generation) root.disabled = false;
    }
  }

  const values = () => ({
    id: select.value,
    name: name.value,
    description: description.value,
  });
  select.addEventListener('change', showFields);
  root
    .querySelector('#catalog-create')
    ?.addEventListener(
      'click',
      () => void request({ type: 'code.create', ...values() }),
    );
  save.addEventListener(
    'click',
    () => void request({ type: 'code.update', ...values() }),
  );
  remove.addEventListener('click', () => {
    if (
      select.value &&
      window.confirm(
        '¿Borrar el código y sus asociaciones? Las citas y notas se conservarán.',
      )
    ) {
      void request({ type: 'code.remove', id: select.value });
    }
  });
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (
      sender.id === chrome.runtime.id &&
      !sender.tab &&
      isRecord(message) &&
      message.type === 'code.changed' &&
      message.projectId === projectId &&
      !root.disabled
    ) {
      void request({ type: 'code.list' });
      onChanged();
    }
  });

  return (id: string | null) => {
    generation++;
    projectId = id;
    codes = [];
    select.replaceChildren();
    showFields();
    root.disabled = true;
    status.textContent = '';
    if (id) void request({ type: 'code.list' });
  };
}
