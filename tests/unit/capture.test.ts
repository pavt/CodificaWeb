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
