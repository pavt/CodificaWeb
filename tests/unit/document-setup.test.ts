// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, test, vi } from 'vitest';
import { mountDocumentSetup } from '../../src/panel/document-setup';
import type { SelectionSnapshot } from '../../src/capture-contract';

afterEach(() => vi.unstubAllGlobals());

test('Q18: conserva la selección, permite elegir o crear y descarta respuestas obsoletas', async () => {
  document.body.innerHTML = readFileSync('src/panel/index.html', 'utf8');
  const form = document.querySelector<HTMLFormElement>('#document-setup');
  if (!form) throw new Error('Falta el formulario');
  const input = form.querySelector(
    '#document-project-name',
  ) as HTMLInputElement;
  const choice = form.querySelector('#document-existing') as HTMLSelectElement;
  const status = form.querySelector('#document-setup-status') as HTMLElement;
  const send = vi.fn();
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
  const activate = vi.fn();
  const reportError = vi.fn();
  const setup = mountDocumentSetup(form, activate, reportError);
  const target = { tabId: 1, documentId: 'doc', url: 'https://example.test/' };
  const selection: SelectionSnapshot = {
    kind: 'selection',
    revision: 0,
    url: target.url,
    selectors: {
      profile: 'dom-text-v1',
      quote: {
        type: 'TextQuoteSelector',
        exact: 'Cita',
        prefix: '',
        suffix: '',
      },
      position: { type: 'TextPositionSelector', start: 0, end: 4 },
    },
  };
  const current = () => true;
  const project = { kind: 'ready', projectId: 'p' };
  const existing = {
    kind: 'setup',
    projects: [null, {}, { id: 'p' }, { id: 'p', name: 'Guardado' }],
  };
  form.requestSubmit();
  send.mockResolvedValueOnce(existing);
  await setup.check(target, selection, current);
  expect(setup.pending).toBe(true);
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
  await vi.waitFor(() => expect(activate).toHaveBeenCalledWith('p', selection));
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: 'create', name: 'Nuevo' }),
  );
  setup.clear();
  expect(setup.pending).toBe(false);

  send.mockResolvedValueOnce(existing).mockResolvedValueOnce(project);
  await setup.check(target, selection, current);
  choice.value = 'p';
  form.requestSubmit();
  await vi.waitFor(() => expect(activate).toHaveBeenCalledTimes(2));
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: 'select', id: 'p' }),
  );

  send
    .mockResolvedValueOnce({ kind: 'unregistered', projectId: 'p' })
    .mockResolvedValueOnce(project);
  await setup.check(target, selection, current);
  form.requestSubmit();
  await vi.waitFor(() => expect(activate).toHaveBeenCalledTimes(3));
  expect(send).toHaveBeenLastCalledWith(
    expect.objectContaining({ mode: 'add', id: 'p' }),
  );
  send.mockResolvedValueOnce(project);
  expect(
    await setup.check({ ...target, projectId: 'p' }, selection, current),
  ).toBe(true);
  send.mockResolvedValueOnce(project);
  expect(await setup.check(target, selection, current)).toBe(false);
  expect(activate).toHaveBeenCalledTimes(4);

  for (const reply of [null, {}, { kind: 'unregistered' }]) {
    send.mockResolvedValueOnce(reply);
    await setup.check(target, selection, current);
  }
  expect(reportError).toHaveBeenCalledTimes(3);
  send.mockRejectedValueOnce(Error('respuesta antigua'));
  await setup.check(target, selection, () => false);
  send.mockResolvedValueOnce(project);
  await setup.check(target, selection, () => false);
  expect(reportError).toHaveBeenCalledTimes(3);

  send.mockResolvedValueOnce(existing);
  await setup.check(target, selection, current);
  input.value = 'Pendiente';
  send.mockResolvedValueOnce(project);
  form.requestSubmit();
  setup.clear();
  await Promise.resolve();
  expect(activate).toHaveBeenCalledTimes(4);
});
