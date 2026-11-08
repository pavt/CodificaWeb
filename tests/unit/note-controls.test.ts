// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { createNoteControls } from '../../src/panel/note-controls';
import type { SelectionSnapshot } from '../../src/capture-contract';

const target = {
  tabId: 7,
  documentId: 'doc',
  url: 'https://example.test/nota',
};
const snapshot: SelectionSnapshot = {
  kind: 'selection',
  url: target.url,
  revision: 1,
  selectors: {
    profile: 'dom-text-v1',
    quote: { type: 'TextQuoteSelector', exact: 'cita', prefix: '', suffix: '' },
    position: { type: 'TextPositionSelector', start: 0, end: 4 },
  },
};

afterEach(() => vi.unstubAllGlobals());

test('Q07: carga una nota, guarda el texto literal, reintenta el ACK y borra', async () => {
  const input = document.createElement('textarea');
  const field = document.createElement('fieldset');
  const save = document.createElement('button');
  const remove = document.createElement('button');
  const status = document.createElement('p');
  const sendMessage = vi
    .fn()
    .mockResolvedValueOnce({ kind: 'note', note: 'Anterior' })
    .mockRejectedValueOnce(new Error('ACK perdido'))
    .mockResolvedValueOnce({ kind: 'note', note: '<b>literal</b>' })
    .mockResolvedValueOnce({ kind: 'note', note: null });
  vi.stubGlobal('chrome', {
    runtime: { sendMessage },
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: target.tabId, url: target.url }]),
      sendMessage: vi.fn().mockResolvedValue(snapshot),
    },
  });
  const controls = createNoteControls(field, input, save, remove, status);
  await controls.show(target, snapshot);
  expect(input.value).toBe('Anterior');
  input.value = ' ';
  save.click();
  expect(status.textContent).toContain('Escribe una nota');
  expect(sendMessage).toHaveBeenCalledOnce();
  input.value = '<b>literal</b>';
  save.click();
  await vi.waitFor(() => expect(status.textContent).toBe('Nota guardada.'));
  expect(input.value).toBe('<b>literal</b>');
  expect(sendMessage.mock.calls[1]).toEqual(sendMessage.mock.calls[2]);
  remove.click();
  await vi.waitFor(() => expect(status.textContent).toBe('Nota borrada.'));
  expect(input.value).toBe('');
  expect(remove.disabled).toBe(true);
});
