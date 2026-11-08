import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, platform, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

test('Q03–Q05: captura texto inline, asigna varios códigos y rechaza selecciones inválidas', async () => {
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

      const tema = panel.getByRole('checkbox', { name: 'Tema' });
      const contexto = panel.getByRole('checkbox', { name: 'Contexto' });
      await tema.click();
      await expect(tema).toBeChecked();
      await contexto.click();
      await expect(contexto).toBeChecked();
      await expect(tema).toBeChecked();

      await capture.click();
      await expect(tema).toBeChecked();
      await expect(contexto).toBeChecked();
      await tema.click();
      await expect(tema).not.toBeChecked();
      await expect(contexto).toBeChecked();

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

      // R2 measures rebuilding the registry with 200 overlaps, excluding message transport.
      await source.evaluate(() => {
        document.body.textContent = 'a'.repeat(100_000);
      });
      const p95 = await panel.evaluate(async () => {
        const [tab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (tab?.id === undefined || !tab.url)
          throw new Error('Fixture sin pestaña');
        const entries = Array.from({ length: 200 }, (_, id) => ({
          id: String(id),
          color: id % 2 ? '#FDD835' : '#81D4FA',
          selectors: {
            position: { start: id * 400, end: id * 400 + 800 },
            quote: { exact: 'a'.repeat(800), prefix: '', suffix: '' },
          },
        }));
        const samples: number[] = [];
        for (let i = 0; i < 30; i++) {
          const painted = await chrome.tabs.sendMessage(
            tab.id,
            {
              type: 'highlight.paint',
              url: tab.url,
              entries,
            },
            { frameId: 0 },
          );
          if (!painted?.painted || typeof painted.durationMs !== 'number')
            throw new Error('Falló el repintado de R2');
          samples.push(painted.durationMs);
        }
        return samples.sort((a, b) => a - b)[
          Math.ceil(samples.length * 0.95) - 1
        ];
      });
      console.log(`R2 p95=${p95} ms · ${platform()} · ${cpus()[0]?.model}`);
      expect(p95).toBeLessThanOrEqual(150);

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
