// @vitest-environment jsdom

import { beforeEach, expect, test, vi } from 'vitest';
import { observeSelection } from '../../src/content/capture';

function select(
  selector: string,
  offset = 0,
  endSelector = selector,
  end?: number,
) {
  const start = document.querySelector(selector)?.firstChild;
  const finish = document.querySelector(endSelector)?.firstChild;
  if (!start || !finish) throw new Error('Fixture sin texto');
  const selection = window.getSelection();
  selection?.setBaseAndExtent(
    start,
    offset,
    finish,
    end ?? finish.textContent?.length ?? 0,
  );
  document.dispatchEvent(new Event('selectionchange'));
}

beforeEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML =
    '<p><span>Antes </span><strong>🙂 hola</strong><em> mundo</em><span> después</span></p>';
});

test('Q03: proyecta una cita entre nodos inline con offsets UTF-16', () => {
  const capture = observeSelection();
  try {
    select('strong', 0, 'em');
    expect(capture.read()).toEqual({
      kind: 'selection',
      url: location.href,
      revision: 0,
      selectors: {
        profile: 'dom-text-v1',
        quote: {
          type: 'TextQuoteSelector',
          exact: '🙂 hola mundo',
          prefix: 'Antes ',
          suffix: ' después',
        },
        position: { type: 'TextPositionSelector', start: 6, end: 19 },
      },
    });
  } finally {
    capture.stop();
  }
});

test('Q03: mantiene la cita al perder foco y rechaza una selección vacía explícita', () => {
  const focus = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  const capture = observeSelection();
  try {
    expect(capture.read()).toEqual({ kind: 'empty' });
    select('strong');
    window.getSelection()?.removeAllRanges();
    document.dispatchEvent(new Event('selectionchange'));
    expect(capture.read().kind).toBe('selection');

    focus.mockReturnValue(true);
    document.dispatchEvent(new Event('pointerup'));
    expect(capture.read()).toEqual({ kind: 'empty' });
  } finally {
    capture.stop();
    focus.mockRestore();
  }
});

test('Q03: rechaza texto editable y rangos que cruzan contenido excluido', () => {
  document.body.innerHTML =
    '<span>Inicio</span><b hidden>Secreto</b><em>Fin</em><div contenteditable><strong>Editar</strong></div>';
  const capture = observeSelection();
  try {
    select('strong');
    expect(capture.read()).toEqual({ kind: 'excluded' });
    select('span', 0, 'em');
    expect(capture.read()).toEqual({ kind: 'excluded' });
    select('em');
    expect(capture.read().kind).toBe('selection');
  } finally {
    capture.stop();
  }
});

test('Q03: invalida la instantánea tras una mutación o cambio de URL', () => {
  const capture = observeSelection();
  const originalUrl = location.href;
  try {
    select('strong');
    document.querySelector('em')?.append('!');
    expect(capture.read()).toEqual({ kind: 'stale' });

    select('strong');
    expect(capture.read()).toMatchObject({ kind: 'selection', revision: 1 });
    history.replaceState(null, '', '#nueva-fuente');
    expect(capture.read()).toEqual({ kind: 'stale' });
  } finally {
    capture.stop();
    history.replaceState(null, '', originalUrl);
  }
});

test('Q03: una página que consume pointerup aún entrega la selección al panel', () => {
  const onCommit = vi.fn();
  const capture = observeSelection(onCommit);
  try {
    const selected = document.querySelector('strong');
    selected?.addEventListener('pointerup', (event) => event.stopPropagation());
    select('strong');
    selected?.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(onCommit).toHaveBeenCalledOnce();
  } finally {
    capture.stop();
  }
});

test('Q03: conserva la cita cuando una actualización ajena deja el anclaje intacto', () => {
  const capture = observeSelection();
  try {
    select('strong');
    const selected = capture.read();
    const activity = document.createElement('span');
    activity.hidden = true;
    activity.textContent = 'Actividad de fondo';
    document.body.append(activity);
    expect(capture.read()).toEqual(selected);
    document.dispatchEvent(new Event('selectionchange'));
    expect(capture.read()).toEqual(selected);

    document.querySelector('strong')?.append(' modificado');
    expect(capture.read()).toEqual({ kind: 'stale' });
  } finally {
    capture.stop();
  }
});

test('Q03: el contexto de 32 unidades no parte pares sustitutos', () => {
  document.body.innerHTML = `<span>🙂${'a'.repeat(31)}</span><strong>cita</strong><em>${'b'.repeat(31)}🙂</em>`;
  const capture = observeSelection();
  try {
    select('strong');
    expect(capture.read()).toMatchObject({
      selectors: { quote: { prefix: 'a'.repeat(31), suffix: 'b'.repeat(31) } },
    });
  } finally {
    capture.stop();
  }
});

test.each([
  [
    'FirmaTitularCréditos',
    'Titular',
    {
      kind: 'selection',
      selectors: {
        quote: { exact: 'Titular' },
        position: { start: 5, end: 12 },
      },
    },
  ],
  [
    'FirmaStraßeCréditos',
    'STRASSE',
    {
      kind: 'selection',
      selectors: {
        quote: { exact: 'Straße' },
        position: { start: 5, end: 11 },
      },
    },
  ],
  ['TitularFirmaBajada', 'Titular\nBajada', { kind: 'excluded' }],
  ['TitularFirmaTitular', 'Titular', { kind: 'excluded' }],
  ['Firma', '', { kind: 'empty' }],
])(
  'Q03: limita la cita al texto que selecciona el navegador (%s)',
  (raw, visible, expected) => {
    document.body.innerHTML = '<p></p>';
    const paragraph = document.querySelector('p');
    if (!paragraph) throw new Error('Fixture ausente');
    paragraph.textContent = raw;
    const selection = window.getSelection();
    if (!selection) throw new Error('Selección ausente');
    const stringifier = vi
      .spyOn(selection, 'toString')
      .mockReturnValue(visible);
    const capture = observeSelection();
    try {
      select('p');
      expect(capture.read()).toMatchObject(expected);
    } finally {
      capture.stop();
      stringifier.mockRestore();
    }
  },
);

test('Q03: ignora metadatos ocultos y usa el rango, aunque un campo conserve el foco', () => {
  document.body.innerHTML =
    '<input value="Consulta"><p><strong>Texto </strong><span hidden>Metadatos</span><em>visible</em></p>';
  const selection = window.getSelection();
  if (!selection) throw new Error('Selección ausente');
  const rendered = vi
    .spyOn(selection, 'toString')
    .mockReturnValue('Texto visible');
  document.querySelector('input')?.focus();
  const capture = observeSelection();
  try {
    expect(capture.read()).toEqual({ kind: 'excluded' });
    select('strong', 0, 'em');
    expect(capture.read()).toMatchObject({
      kind: 'selection',
      selectors: {
        quote: { exact: 'Texto visible' },
        position: { start: 0, end: 13 },
      },
    });
  } finally {
    capture.stop();
    rendered.mockRestore();
  }
});
