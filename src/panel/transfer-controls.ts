import { isRecord } from '../capture-contract';
import { maxProjectBytes } from '../domain/project-file-limits';

export function mountTransfer(root: HTMLElement) {
  const file = root.querySelector('#project-file') as HTMLInputElement;
  const importButton = root.querySelector(
    '#project-import',
  ) as HTMLButtonElement;
  const exportButton = root.querySelector(
    '#project-export',
  ) as HTMLButtonElement;
  const status = root.querySelector('#transfer-status') as HTMLElement;
  let projectId: string | null = null;
  let busy = false;

  function updateButtons() {
    importButton.disabled = busy || !file.files?.length;
    exportButton.disabled = busy || !projectId;
  }

  file.addEventListener('change', updateButtons);
  importButton.addEventListener('click', async () => {
    const selected = file.files?.[0];
    if (!selected || busy) return;
    if (selected.size > maxProjectBytes) {
      status.textContent = 'El archivo supera el límite de 10 MiB.';
      return;
    }
    busy = true;
    updateButtons();
    status.textContent = 'Importando…';
    try {
      const json = new TextDecoder('utf-8', { fatal: true }).decode(
        await selected.arrayBuffer(),
      );
      const reply: unknown = await chrome.runtime.sendMessage({
        type: 'transfer.import',
        json,
      });
      if (!isRecord(reply) || reply.kind !== 'imported')
        throw new Error('Archivo no válido.');
      file.value = '';
      status.textContent = 'Copia del proyecto importada.';
    } catch {
      status.textContent =
        'No se pudo importar el archivo. Comprueba que sea un proyecto JSON v1 válido.';
    } finally {
      busy = false;
      updateButtons();
    }
  });

  exportButton.addEventListener('click', async () => {
    if (!projectId || busy) return;
    busy = true;
    updateButtons();
    status.textContent = 'Exportando…';
    try {
      const reply: unknown = await chrome.runtime.sendMessage({
        type: 'transfer.export',
        projectId,
      });
      if (
        !isRecord(reply) ||
        reply.kind !== 'exported' ||
        typeof reply.json !== 'string'
      ) {
        throw new Error('Exportación no válida.');
      }
      const url = URL.createObjectURL(
        new Blob([reply.json], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'codificaweb-proyecto-v1.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Proyecto exportado.';
    } catch {
      status.textContent = 'No se pudo exportar el proyecto.';
    } finally {
      busy = false;
      updateButtons();
    }
  });

  return (id: string | null) => {
    projectId = id;
    updateButtons();
  };
}
