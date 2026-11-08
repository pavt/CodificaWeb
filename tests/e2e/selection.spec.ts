import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

test('Q03: captura texto inline con Unicode y rechaza selección vacía, editable u obsoleta', async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'codificaweb-selection-'));
  const dist = resolve(workspace, 'extension');
  const url = 'http://127.0.0.1:32146/articulo';
  try {
    await cp(resolve('dist'), dist, { recursive: true });
    // Grant only the synthetic fixture host in this copy. Q11 loads the unmodified package.
    const manifestPath = resolve(dist, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.host_permissions = ['http://127.0.0.1/*'];
    await writeFile(manifestPath, JSON.stringify(manifest));
    const profile = resolve(workspace, 'profile', 'Default');
    await mkdir(profile, { recursive: true });
    await writeFile(
      resolve(profile, 'Preferences'),
      JSON.stringify({
        settings: { a11y: { caretbrowsing: { enabled: true } } },
      }),
    );
    const context = await chromium.launchPersistentContext(
      resolve(workspace, 'profile'),
      {
        channel: 'chromium',
        args: [
          `--disable-extensions-except=${dist}`,
          `--load-extension=${dist}`,
        ],
      },
    );
    try {
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker'));
      const panel = await context.newPage();
      await panel.goto(
        new URL(manifest.side_panel.default_path, worker.url()).href,
      );
      await context.route(url, (route) =>
        route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: '<p id="text"><strong>🙂 hola</strong><em> mundo</em></p><p id="editable" contenteditable>Editar aquí</p>',
        }),
      );
      const source = await context.newPage();
      await source.goto(url);

      // Playwright opens the panel as a separate tab. Point its active-tab query at the
      // fixture tab, as the browser does when the panel is attached to that tab.
      await panel.evaluate(async (url) => {
        const [tab] = await chrome.tabs.query({ url });
        if (!tab) throw new Error('No se encontró la pestaña de prueba');
        const tabId = tab.id;
        if (tabId === undefined)
          throw new Error('La pestaña de prueba no tiene identificador');
        chrome.tabs.query = async () => [await chrome.tabs.get(tabId)];
      }, url);

      await panel.getByLabel('URL del sitio').fill(url);
      await panel.getByRole('button', { name: 'Comprobar acceso' }).click();
      await expect(panel.getByRole('status')).toHaveText(
        'Acceso al sitio verificado.',
      );
      const capture = panel.getByRole('button', { name: 'Capturar selección' });

      await capture.click();
      await expect(panel.locator('#capture-status')).toContainText(
        'Selecciona texto',
      );

      await source.bringToFront();
      const [start, end] = await source
        .locator('#text')
        .evaluate((paragraph) => {
          const first = paragraph.querySelector('strong')?.firstChild;
          const last = paragraph.querySelector('em')?.firstChild;
          if (!first || !last) throw new Error('Fixture sin texto');
          const range = document.createRange();
          range.setStart(first, 0);
          range.setEnd(last, last.textContent?.length ?? 0);
          const rect = range.getBoundingClientRect();
          const y = rect.y + rect.height / 2;
          return [
            { x: rect.x, y },
            { x: rect.right + 1, y },
          ] as const;
        });
      await source.mouse.move(start.x, start.y);
      await source.mouse.down();
      await source.mouse.move(end.x, end.y, { steps: 8 });
      await source.mouse.up();
      await expect
        .poll(() => source.evaluate(() => window.getSelection()?.toString()))
        .toBe('🙂 hola mundo');
      await panel.bringToFront();
      await capture.click();
      await expect(panel.locator('blockquote')).toHaveText('🙂 hola mundo');
      await expect(panel.locator('#selection-source')).toHaveText(url);

      await source.evaluate(() =>
        history.replaceState(null, '', '#otra-fuente'),
      );
      await capture.click();
      await expect(panel.locator('#capture-status')).toContainText(
        'documento cambió',
      );
      await expect(panel.locator('blockquote')).toBeEmpty();

      await panel.getByRole('button', { name: 'Comprobar acceso' }).click();
      await expect(panel.getByRole('status')).toHaveText(
        'Acceso al sitio verificado.',
      );
      await source.bringToFront();
      await source.locator('#editable').click();
      await source.keyboard.press('Home');
      await source.keyboard.press('Shift+End');
      await panel.bringToFront();
      await capture.click();
      await expect(panel.locator('#capture-status')).toContainText(
        'contenido editable',
      );
      await expect(panel.locator('blockquote')).toBeEmpty();

      await source.reload();
      await capture.click();
      await expect(panel.locator('#capture-status')).toContainText(
        'documento cambió',
      );
    } finally {
      await context.close();
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
