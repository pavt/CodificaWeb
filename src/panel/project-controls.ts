import { isRecord } from '../capture-contract';

interface ProjectOption {
  id: string;
  name: string;
  description: string;
}

function isProject(value: unknown): value is ProjectOption {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.description === 'string'
  );
}

export function mountProjects(
  root: HTMLFieldSetElement,
  onActive: (id: string | null) => void,
) {
  const select = root.querySelector('#project-select') as HTMLSelectElement;
  const name = root.querySelector('#project-name') as HTMLInputElement;
  const description = root.querySelector(
    '#project-description',
  ) as HTMLTextAreaElement;
  const status = root.querySelector('#project-status') as HTMLElement;
  const save = root.querySelector('#project-save') as HTMLButtonElement;
  const remove = root.querySelector('#project-remove') as HTMLButtonElement;
  let active: string | null = null;

  async function request(message: Record<string, unknown>) {
    root.disabled = true;
    status.textContent = '';
    try {
      const result: unknown = await chrome.runtime.sendMessage(message);
      if (
        !isRecord(result) ||
        result.kind !== 'projects' ||
        !Array.isArray(result.projects) ||
        !result.projects.every(isProject) ||
        (result.activeId !== null && typeof result.activeId !== 'string')
      ) {
        throw new Error('Respuesta de proyectos no válida.');
      }
      const projects: ProjectOption[] = result.projects;
      const current = projects.find(({ id }) => id === result.activeId);
      select.replaceChildren(
        ...projects.map((project) => new Option(project.name, project.id)),
      );
      select.value = current?.id ?? '';
      name.value = current?.name ?? '';
      description.value = current?.description ?? '';
      save.disabled = remove.disabled = !current;
      active = current?.id ?? null;
      const subtitle = document.getElementById('active-project-label');
      if (subtitle)
        subtitle.textContent = current ? `Proyecto · ${current.name}` : '';
      onActive(active);
      if (message.type !== 'project.list')
        status.textContent = 'Proyecto actualizado.';
    } catch {
      select.value = active ?? '';
      status.textContent = 'No se pudo actualizar el proyecto.';
    } finally {
      root.disabled = false;
    }
  }

  select.addEventListener(
    'change',
    () => void request({ type: 'project.select', id: select.value }),
  );
  root.querySelector('#project-create')?.addEventListener(
    'click',
    () =>
      void request({
        type: 'project.create',
        name: name.value,
        description: description.value,
      }),
  );
  save.addEventListener(
    'click',
    () =>
      void request({
        type: 'project.update',
        id: active,
        name: name.value,
        description: description.value,
      }),
  );
  remove.addEventListener('click', () => {
    if (
      active &&
      window.confirm('¿Borrar el proyecto activo y todos sus datos?')
    ) {
      void request({ type: 'project.remove', id: active });
    }
  });
  chrome.runtime.onMessage.addListener((message: unknown, sender) => {
    if (
      sender.id === chrome.runtime.id &&
      !sender.tab &&
      isRecord(message) &&
      message.type === 'project.changed' &&
      !root.disabled
    ) {
      void request({ type: 'project.list' });
    }
  });
  void request({ type: 'project.list' });
}
