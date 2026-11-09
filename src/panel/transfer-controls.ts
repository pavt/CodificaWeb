import { createProjectZip } from '../domain/project-zip';
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
  const download = root.querySelector<HTMLButtonElement>('#project-download');
  const status = root.querySelector('#transfer-status') as HTMLElement;
  let projectId: string | null = null;
  let busy = false;

  function updateButtons() {
    importButton.disabled = busy || !file.files?.length;
    exportButton.disabled = busy || !projectId;
    if (download) download.disabled = exportButton.disabled;
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
        'No se pudo importar el archivo. Comprueba que sea un proyecto JSON v1 o v2 válido.';
    } finally {
      busy = false;
      updateButtons();
    }
  });

  async function exportProject(zip: boolean) {
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
      const archive = zip ? createProjectZip(reply.json) : undefined;
      const url = URL.createObjectURL(
        archive
          ? new Blob([Uint8Array.from(archive.bytes)], {
              type: 'application/zip',
            })
          : new Blob([reply.json], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = archive?.filename ?? 'codificaweb-proyecto-v2.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = 'Proyecto exportado.';
    } catch {
      status.textContent = 'No se pudo exportar el proyecto.';
    } finally {
      busy = false;
      updateButtons();
    }
  }
  exportButton.addEventListener('click', () => void exportProject(false));
  download?.addEventListener('click', () => void exportProject(true));

  return (id: string | null) => {
    projectId = id;
    updateButtons();
  };
}
