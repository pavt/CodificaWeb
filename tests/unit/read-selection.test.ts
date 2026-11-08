import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { readSelection } from '../../src/panel/read-selection';

const target = {
  tabId: 7,
  documentId: 'documento',
  url: 'https://example.test/page',
};
const query = vi.fn();
const sendMessage = vi.fn();
const snapshot = {
  kind: 'selection',
  url: target.url,
  revision: 3,
  selectors: {
    profile: 'dom-text-v1',
    quote: {
      type: 'TextQuoteSelector',
      exact: '🙂 cita',
      prefix: '',
      suffix: '',
    },
    position: { type: 'TextPositionSelector', start: 1, end: 8 },
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('chrome', { tabs: { query, sendMessage } });
  query.mockResolvedValue([{ id: target.tabId, url: target.url }]);
});
afterEach(() => vi.unstubAllGlobals());

test('Q03: consulta únicamente la pestaña y el documento autorizados', async () => {
  sendMessage.mockResolvedValue(snapshot);
  await expect(readSelection(target)).resolves.toEqual(snapshot);
  expect(sendMessage).toHaveBeenCalledWith(
    target.tabId,
    { type: 'capture.read' },
    { documentId: target.documentId },
  );
});

test('Q03: descarta pestaña, URL y documento obsoletos', async () => {
  query
    .mockResolvedValueOnce([{ id: 8, url: target.url }])
    .mockResolvedValueOnce([{ id: 7, url: target.url + '#otra' }]);
  await expect(readSelection(target)).resolves.toEqual({ kind: 'stale' });
  await expect(readSelection(target)).resolves.toEqual({ kind: 'stale' });
  expect(sendMessage).not.toHaveBeenCalled();

  sendMessage.mockRejectedValue(new Error('Document not found'));
  await expect(readSelection(target)).resolves.toEqual({ kind: 'stale' });
});

test.each([{ kind: 'empty' }, { kind: 'excluded' }, { kind: 'stale' }])(
  'Q03: conserva el estado de captura %j',
  async (result) => {
    sendMessage.mockResolvedValue(result);
    await expect(readSelection(target)).resolves.toEqual(result);
  },
);

test.each([
  null,
  { kind: 'unknown' },
  { ...snapshot, url: 'https://otro.test/' },
  { ...snapshot, revision: -1 },
  {
    ...snapshot,
    selectors: {
      ...snapshot.selectors,
      position: { ...snapshot.selectors.position, end: 9 },
    },
  },
])('Q03: rechaza una respuesta inválida %j', async (result) => {
  sendMessage.mockResolvedValue(result);
  await expect(readSelection(target)).resolves.toEqual({ kind: 'stale' });
});
