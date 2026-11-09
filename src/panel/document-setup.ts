import { isRecord } from '../capture-contract';
import type { CaptureTarget } from '../capture-contract';

interface ProjectOption {
  id: string;
  name: string;
  containsPage: boolean;
}

function isProject(value: unknown): value is ProjectOption {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.containsPage === 'boolean'
  );
}

const nameKey = (name: string) => name.trim().normalize('NFC').toLowerCase();

export function mountDocumentSetup(
  form: HTMLFormElement,
  activate: (id: string) => void,
  reportError: () => void,
) {
  const fields = form.querySelector('#document-setup-project') as HTMLElement;
  const name = form.querySelector('#document-project-name') as HTMLInputElement;
  const suggestions = form.querySelector(
    '#document-project-suggestions',
  ) as HTMLElement;
  const change = form.querySelector(
    '#document-change-project',
  ) as HTMLButtonElement;
  const status = form.querySelector('#document-setup-status') as HTMLElement;
  const title = form.querySelector('#document-setup-title') as HTMLElement;
  const submit = form.querySelector(
    '#document-setup-submit',
  ) as HTMLButtonElement;
  let current: CaptureTarget | undefined;
  let projects: ProjectOption[] = [];
  let chosen: ProjectOption | undefined;
  let activeId: string | undefined;

  function choice() {
    const key = nameKey(name.value);
    return chosen ?? projects.find((project) => nameKey(project.name) === key);
  }

  function updateButton() {
    const project = choice();
    submit.textContent = project?.containsPage
      ? 'Continuar en este proyecto'
      : project
        ? 'Agregar página y seguir'
        : 'Crear proyecto y agregar página';
  }

  function suggest() {
    const query = nameKey(name.value);
    const matches = projects.filter((project) =>
      nameKey(project.name).includes(query),
    );
    suggestions.replaceChildren(
      ...matches.map((project) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.textContent = project.containsPage
          ? project.name + ' · Página guardada'
          : project.name;
        option.addEventListener('click', () => {
          chosen = project;
          name.value = project.name;
          suggestions.replaceChildren();
          updateButton();
          submit.focus();
        });
        return option;
      }),
    );
    updateButton();
  }

  name.addEventListener('focus', suggest);
  name.addEventListener('input', () => {
    chosen = undefined;
    suggest();
  });
  name.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') suggestions.replaceChildren();
    if (event.key === 'ArrowDown') {
      const first = suggestions.querySelector('button');
      if (first) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  change.addEventListener('click', () => {
    fields.hidden = false;
    change.hidden = true;
    title.textContent = 'Elige un proyecto';
    chosen = undefined;
    name.value = '';
    name.focus();
  });

  function clear() {
    current = undefined;
    form.hidden = true;
    form.reset();
    status.textContent = '';
    suggestions.replaceChildren();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const entry = current;
    if (!entry || submit.disabled) return;
    const project = choice();
    const projectName = name.value.trim();
    if (!project && !projectName) {
      status.textContent = 'Escribe un nombre o elige un proyecto guardado.';
      name.focus();
      return;
    }
    submit.disabled = true;
    status.textContent = 'Guardando…';
    try {
      const reply: unknown = await chrome.runtime.sendMessage({
        type: 'project.document',
        url: entry.url,
        mode: !project ? 'create' : project.id === activeId ? 'add' : 'select',
        id: project?.id,
        name: projectName,
        description: '',
      });
      if (current !== entry) return;
      if (
        !isRecord(reply) ||
        reply.kind !== 'ready' ||
        typeof reply.projectId !== 'string'
      )
        throw new Error('No se pudo agregar la página.');
      clear();
      activate(reply.projectId);
    } catch {
      if (current === entry)
        status.textContent =
          'No se pudo agregar la página. Inténtalo de nuevo.';
    } finally {
      if (current === entry) submit.disabled = false;
    }
  });

  return {
    clear,
    async check(target: CaptureTarget, isCurrent: () => boolean) {
      try {
        const reply: unknown = await chrome.runtime.sendMessage({
          type: 'project.document',
          url: target.url,
        });
        if (!isCurrent()) return;
        if (
          isRecord(reply) &&
          reply.kind === 'ready' &&
          typeof reply.projectId === 'string'
        ) {
          activate(reply.projectId);
          return;
        }
        if (
          !isRecord(reply) ||
          !Array.isArray(reply.projects) ||
          (reply.kind !== 'setup' && reply.kind !== 'unregistered')
        )
          throw new Error('No se pudo verificar la página.');
        clear();
        current = target;
        projects = reply.projects.filter(isProject);
        activeId =
          typeof reply.projectId === 'string' ? reply.projectId : undefined;
        const owners = projects.filter(({ containsPage }) => containsPage);
        chosen = owners[0] ?? projects.find(({ id }) => id === activeId);
        title.textContent =
          owners.length === 1
            ? 'Continuar en «' + owners[0]?.name + '»'
            : owners.length > 1
              ? 'Elige dónde continuar'
              : chosen
                ? 'Agregar al proyecto «' + chosen.name + '»'
                : 'Elige un proyecto';
        fields.hidden = Boolean(chosen) && owners.length <= 1;
        change.hidden = !fields.hidden || (projects.length <= 1 && !activeId);
        name.value = chosen?.name ?? '';
        if (!fields.hidden && owners.length > 1) {
          name.value = '';
          chosen = undefined;
          suggest();
        }
        form.hidden = false;
        submit.disabled = false;
        updateButton();
      } catch {
        if (isCurrent()) reportError();
      }
    },
  };
}
