// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { mountDocumentSetup } from '../../src/panel/document-setup';

afterEach(() => vi.unstubAllGlobals());

test('Q18: conserva la selección, permite elegir o crear y descarta respuestas obsoletas', async () => {
  document.body.innerHTML = readFileSync('src/panel/index.html', 'utf8');
  const form = document.querySelector<HTMLFormElement>('#document-setup');
  if (!form) throw new Error('Falta el formulario');
  const input = form.querySelector(
    '#document-project-name',
  ) as HTMLInputElement;

  const status = form.querySelector('#document-setup-status') as HTMLElement;
  const send = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
  const activate = vi.fn();
  const reportError = vi.fn();
  const setup = mountDocumentSetup(form, activate, reportError);
  const target = { tabId: 1, documentId: 'doc', url: 'https://example.test/' };
  const current = () => true;
  const project = { kind: 'ready', projectId: 'p' };
  const existing = {
    kind: 'setup',
    projects: [
      null,
      {},
      { id: 'p' },
      { id: 'p', name: 'Guardado', containsPage: false },
    ],
  };
  form.requestSubmit();
  send.mockResolvedValueOnce(existing);
  await setup.check(target, current);

  expect(form.hidden).toBe(false);
  form.requestSubmit();
  expect(status.textContent).toContain('Escribe un nombre');
  input.value = 'Nuevo';
  send.mockResolvedValueOnce(null);
  form.requestSubmit();
  form.requestSubmit();
  await vi.waitFor(() =>
    expect(status.textContent).toContain('No se pudo agregar'),
  );
  send.mockResolvedValueOnce(project);
  form.requestSubmit();
  await vi.waitFor(() => expect(activate).toHaveBeenCalledWith('p'));
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: 'create', name: 'Nuevo' }),
  );
  setup.clear();
  expect(form.hidden).toBe(true);

  send.mockResolvedValueOnce(existing).mockResolvedValueOnce(project);
  await setup.check(target, current);
  input.value = 'gua';
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
  expect(document.activeElement?.textContent).toBe('Guardado');
  (document.activeElement as HTMLButtonElement).click();
  form.requestSubmit();
  await vi.waitFor(() => expect(activate).toHaveBeenCalledTimes(2));
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: 'select', id: 'p' }),
  );

  send
    .mockResolvedValueOnce({
      kind: 'unregistered',
      projectId: 'p',
      projects: existing.projects,
    })
    .mockResolvedValueOnce(project);
  await setup.check(target, current);
  form.requestSubmit();
  await vi.waitFor(() => expect(activate).toHaveBeenCalledTimes(3));
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: 'add', id: 'p' }),
  );
  send.mockResolvedValueOnce({
    kind: 'unregistered',
    projectId: 'p',
    projects: [
      { id: 'p', name: 'Guardado', containsPage: false },
      { id: 'q', name: 'Con citas', containsPage: true },
    ],
  });
  await setup.check(target, current);
  expect(form.querySelector('#document-setup-title')?.textContent).toBe(
    'Continuar en «Con citas»',
  );
  form.querySelector<HTMLButtonElement>('#document-change-project')?.click();
  expect(document.activeElement).toBe(input);
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(
    form.querySelector('#document-project-suggestions')?.children,
  ).toHaveLength(0);

  send.mockResolvedValueOnce(project);
  await setup.check({ ...target, projectId: 'p' }, current);
  expect(activate).toHaveBeenCalledTimes(4);

  for (const reply of [null, {}, { kind: 'unregistered' }]) {
    send.mockResolvedValueOnce(reply);
    await setup.check(target, current);
  }
  expect(reportError).toHaveBeenCalledTimes(3);
  send.mockRejectedValueOnce(Error('respuesta antigua'));
  await setup.check(target, () => false);
  send.mockResolvedValueOnce(project);
  await setup.check(target, () => false);
  expect(reportError).toHaveBeenCalledTimes(3);

  send.mockResolvedValueOnce(existing);
  await setup.check(target, current);
  input.value = 'Pendiente';
  send.mockResolvedValueOnce(project);
  form.requestSubmit();
  setup.clear();
  await Promise.resolve();
  expect(activate).toHaveBeenCalledTimes(4);
});
