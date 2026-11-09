import { isRecord } from '../capture-contract';
import type { CaptureTarget, SelectionSnapshot } from '../capture-contract';

export function mountDocumentSetup(
  form: HTMLFormElement,
  activate: (id: string, selection: SelectionSnapshot) => void,
  reportError: () => void,
) {
  const fields = form.querySelector(
    '#document-setup-project',
  ) as HTMLFieldSetElement;
  const choice = form.querySelector('#document-existing') as HTMLSelectElement;
  const name = form.querySelector('#document-project-name') as HTMLInputElement;
  const description = form.querySelector(
    '#document-project-description',
  ) as HTMLTextAreaElement;
  const status = form.querySelector('#document-setup-status') as HTMLElement;
  const title = form.querySelector('#document-setup-title') as HTMLElement;
  const submit = form.querySelector(
    '#document-setup-submit',
  ) as HTMLButtonElement;
  let pending:
    | { target: CaptureTarget; selection: SelectionSnapshot; add: boolean }
    | undefined;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const entry = pending;
    if (!entry || submit.disabled) return;
    const projectName = name.value.trim();
    if (!entry.add && !choice.value && !projectName) {
      status.textContent = 'Escribe un nombre o elige un proyecto guardado.';
      return;
    }
    submit.disabled = true;
    status.textContent = 'Guardando…';
    try {
      const reply: unknown = await chrome.runtime.sendMessage({
        type: 'project.document',
        url: entry.target.url,
        mode: entry.add ? 'add' : choice.value ? 'select' : 'create',
        id: entry.add ? entry.target.projectId : choice.value,
        name: projectName,
        description: description.value,
      });
      if (pending !== entry) return;
      if (
        !isRecord(reply) ||
        reply.kind !== 'ready' ||
        typeof reply.projectId !== 'string'
      )
        throw new Error('No se pudo agregar la página.');
      form.reset();
      activate(reply.projectId, entry.selection);
    } catch {
      if (pending === entry)
        status.textContent =
          'No se pudo agregar la página. Inténtalo de nuevo.';
    } finally {
      if (pending === entry) submit.disabled = false;
    }
  });

  return {
    get pending() {
      return pending !== undefined;
    },
    clear() {
      pending = undefined;
      form.hidden = true;
      status.textContent = '';
    },
    async check(
      target: CaptureTarget,
      selection: SelectionSnapshot,
      isCurrent: () => boolean,
    ) {
      try {
        const reply: unknown = await chrome.runtime.sendMessage({
          type: 'project.document',
          url: target.url,
        });
        if (!isCurrent()) return false;
        if (
          isRecord(reply) &&
          reply.kind === 'ready' &&
          typeof reply.projectId === 'string'
        ) {
          if (reply.projectId === target.projectId) return true;
          activate(reply.projectId, selection);
          return false;
        }
        if (
          !isRecord(reply) ||
          (reply.kind !== 'setup' && reply.kind !== 'unregistered')
        )
          throw new Error('No se pudo verificar la página.');

        const add = reply.kind === 'unregistered';
        if (add && typeof reply.projectId !== 'string')
          throw new Error('Falta el proyecto.');
        const page = add
          ? { ...target, projectId: reply.projectId as string }
          : target;
        pending = { target: page, selection, add };
        form.hidden = false;
        fields.hidden = add;
        title.textContent = add ? 'Agregar esta página' : 'Define un proyecto';
        submit.textContent = add
          ? 'Agregar esta página'
          : 'Guardar y agregar esta página';
        submit.disabled = false;
        choice.replaceChildren(new Option('Crear proyecto nuevo', ''));
        if (Array.isArray(reply.projects)) {
          for (const project of reply.projects as unknown[]) {
            if (
              isRecord(project) &&
              typeof project.id === 'string' &&
              typeof project.name === 'string'
            )
              choice.add(new Option(project.name, project.id));
          }
        }
      } catch {
        if (isCurrent()) reportError();
      }
      return false;
    },
  };
}
