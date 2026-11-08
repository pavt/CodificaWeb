import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

const browsers = [
  ['Google Chrome', process.env.CODIFICAWEB_CHROME_BIN],
  ['Brave Browser', process.env.CODIFICAWEB_BRAVE_BIN],
] as const;
const url = 'http://127.0.0.1:32147/fixture';
const nextUrl = new URL('/siguiente', url).href;
const slowImage = new URL('/carga-lenta.svg', url).href;
const otherSite = 'http://localhost:32147/otro';
const citation = 'Cita sintética T015';
const origins = ['http://127.0.0.1/*'];

for (const [name, executable] of browsers) {
  test(`Q11 y Q14 · paquete MV3 en ${name}`, async () => {
    const profile = await mkdtemp(resolve(tmpdir(), 'codificaweb-branded-'));
    const child = spawn(
      executable ?? `/Applications/${name}.app/Contents/MacOS/${name}`,
      [
        `--user-data-dir=${profile}`,
        '--headless',
        '--remote-debugging-port=0',
        '--enable-unsafe-extension-debugging',
        '--no-first-run',
        '--disable-background-networking',
        'about:blank',
      ],
      { stdio: 'ignore' },
    );
    const closed = once(child, 'close').catch(() => {});
    let browser:
      Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
    try {
      let port = '';
      await expect
        .poll(
          async () => {
            const info = await readFile(
              resolve(profile, 'DevToolsActivePort'),
              'utf8',
            ).catch(() => '');
            port = info.split('\n')[0] ?? '';
            return port;
          },
          { timeout: 8000, message: `Puerto CDP de ${name}` },
        )
        .toMatch(/^\d+$/);
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
        timeout: 8000,
      });
      const cdp = await browser.newBrowserCDPSession();
      const { product } = await cdp.send('Browser.getVersion');
      const { id } = await cdp.send('Extensions.loadUnpacked', {
        path: resolve(process.env.CODIFICAWEB_DIST ?? 'dist'),
      });
      const [context] = browser.contexts();
      if (!context) throw new Error('No se encontró el perfil temporal');

      const unexpected: string[] = [];
      await context.route(/^https?:\/\//, (route) => route.abort());
      await context.route(url, (route) =>
        route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: `<p>${citation}</p><aside style="user-select:none">Firma que no se selecciona</aside><p>Otra cita.</p>`,
        }),
      );
      let releaseImage: (() => void) | undefined;
      const imageReady = new Promise<void>((resolve) => {
        releaseImage = resolve;
      });
      await context.route(slowImage, async (route) => {
        await imageReady;
        await route.fulfill({
          contentType: 'image/svg+xml',
          body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
        });
      });
      await context.route(nextUrl, (route) =>
        route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: '<p>Página siguiente.</p><img src="/carga-lenta.svg" alt="">',
        }),
      );
      await context.route(otherSite, (route) =>
        route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: '<p>Otro sitio.</p>',
        }),
      );
      context.on('request', (request) => {
        if (
          /^https?:\/\//.test(request.url()) &&
          !(
            request.url() === slowImage &&
            request.resourceType() === 'image' &&
            request.frame().url() === nextUrl
          ) &&
          !(
            [url, nextUrl, otherSite].includes(request.url()) &&
            request.isNavigationRequest()
          )
        ) {
          unexpected.push(request.url());
        }
      });
      await context.routeWebSocket(/^wss?:\/\//, async (socket) => {
        unexpected.push(socket.url());
        await socket.close();
      });

      const prefix = `chrome-extension://${id}/`;
      const worker =
        context
          .serviceWorkers()
          .find((candidate) => candidate.url().startsWith(prefix)) ??
        (await context.waitForEvent('serviceworker', {
          predicate: (candidate) => candidate.url().startsWith(prefix),
          timeout: 5000,
        }));
      const manifest = await worker.evaluate(() =>
        chrome.runtime.getManifest(),
      );
      expect(manifest.manifest_version).toBe(3);
      expect(
        await worker.evaluate(
          (origins) => chrome.permissions.contains({ origins }),
          origins,
        ),
      ).toBe(false);

      const page = await context.newPage();
      await page.goto(url);
      const panel = await context.newPage();
      const panelPath = manifest.side_panel?.default_path;
      if (!panelPath) throw new Error('Falta el panel en el manifiesto');
      await panel.goto(new URL(panelPath, prefix).href);
      await expect(
        panel.getByRole('heading', { name: 'CodificaWeb' }),
      ).toBeVisible();
      await expect(
        panel.getByRole('button', { name: 'Capturar selección' }),
      ).toBeDisabled();
      await page.bringToFront();
      const blocked = await panel.evaluate(async () => {
        const [tab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (tab?.id === undefined)
          throw new Error('Falta la pestaña del fixture');
        return chrome.scripting
          .executeScript({
            target: { tabId: tab.id },
            func: () => location.origin,
          })
          .then(
            () => 'permitida',
            (error: Error) => error.message,
          );
      });
      expect(blocked).toMatch(/cannot access/i);
      await panel.close();
      await page.bringToFront();
      async function dragQuote(index: number, expected: string) {
        await page.evaluate(() => window.getSelection()?.removeAllRanges());
        const box = await page
          .locator('p')
          .nth(index)
          .evaluate((paragraph) => {
            const range = document.createRange();
            range.selectNodeContents(paragraph);
            const rect = range.getBoundingClientRect();
            return {
              x: rect.left,
              right: rect.right,
              y: rect.top + rect.height / 2,
            };
          });
        await page.mouse.move(box.x, box.y);
        await page.mouse.down();
        await page.mouse.move(box.right + 2, box.y, { steps: 10 });
        await page.mouse.up();
        await expect
          .poll(() => page.evaluate(() => window.getSelection()?.toString()))
          .toBe(expected);
      }
      await dragQuote(0, citation);
      // The browser can leave a range endpoint past text excluded by CSS.
      const visible = await page.evaluate(() => {
        const end = document.querySelectorAll('p')[1]?.firstChild;
        const selection = window.getSelection();
        if (!end || !selection) throw new Error('Falta el rango de prueba');
        selection.extend(end, 0);
        return selection.toString().trim();
      });
      expect(visible).toBe(citation);

      const { targetInfos } = await cdp.send('Target.getTargets', {
        filter: [{ type: 'tab' }, { exclude: true }],
      });
      const tab = targetInfos.find((candidate) => candidate.url === url);
      if (!tab) throw new Error('Falta el destino de la pestaña');
      await cdp.send('Extensions.triggerAction', {
        id,
        targetId: tab.targetId,
      });
      const panelUrl = new URL(panelPath, prefix).href;
      let panelTargetId: string | undefined;
      await expect
        .poll(async () => {
          const { targetInfos } = await cdp.send('Target.getTargets');
          panelTargetId = targetInfos.find(
            (target) => target.url === panelUrl,
          )?.targetId;
          return panelTargetId;
        })
        .toBeTruthy();
      // Browser-owned side panels are not surfaced as pages by Playwright.
      const endpoint = (
        await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')
      ).split('\n')[1];
      const socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = reject;
      });
      let messageId = 0;
      function send(method: string, params: object, sessionId?: string) {
        const id = ++messageId;
        return new Promise<Record<string, unknown>>((resolve, reject) => {
          const listener = ({ data }: MessageEvent<string>) => {
            const reply = JSON.parse(data);
            if (reply.id !== id) return;
            socket.removeEventListener('message', listener);
            if (reply.error) reject(new Error(reply.error.message));
            else resolve(reply.result);
          };
          socket.addEventListener('message', listener);
          socket.send(JSON.stringify({ id, method, params, sessionId }));
        });
      }
      try {
        const { sessionId } = await send('Target.attachToTarget', {
          targetId: panelTargetId,
          flatten: true,
        });
        if (typeof sessionId !== 'string')
          throw new Error('Falta la sesión del panel');
        const readPanel = async (expression: string) => {
          const { result } = await send(
            'Runtime.evaluate',
            { expression, returnByValue: true },
            sessionId,
          );
          return (result as { value?: unknown }).value;
        };
        const quote = () =>
          readPanel("document.querySelector('#selection-quote')?.textContent");
        await expect.poll(quote).toBe(citation);
        expect(
          await readPanel("document.querySelector('#site-url-field').hidden"),
        ).toBe(true);
        await expect
          .poll(() =>
            readPanel("document.querySelector('#fragment-codes').disabled"),
          )
          .toBe(false);
        // Simulate declining at the browser API boundary, without granting access.
        await readPanel(`(() => {
          chrome.permissions.request = async () => false;
          document.querySelector('#site-access').requestSubmit();
        })()`);
        await expect
          .poll(() =>
            readPanel("document.querySelector('#site-status').textContent"),
          )
          .toContain('Permiso denegado');
        expect(await quote()).toBe(citation);
        expect(
          await readPanel("document.querySelector('#fragment-codes').disabled"),
        ).toBe(false);
        expect(
          await readPanel("document.querySelector('#verify-site').disabled"),
        ).toBe(false);
        expect(
          await worker.evaluate(
            (origins) => chrome.permissions.contains({ origins }),
            origins,
          ),
        ).toBe(false);
        // A live page can update unrelated UI while the category is being edited.
        await page.evaluate(() => {
          const activity = document.createElement('span');
          activity.hidden = true;
          activity.textContent = 'Actualización de fondo';
          document.body.append(activity);
        });
        await readPanel(`(() => {
          const search = document.querySelector('#category-search');
          search.value = 'Categoría sintética';
          search.dispatchEvent(new Event('input'));
          document.querySelector('#category-open').click();
        })()`);
        expect(
          await readPanel("document.querySelector('#category-name').value"),
        ).toBe('Categoría sintética');
        await readPanel(`(() => {
          document.querySelector('#category-definition').value = 'Definición sintética';
          document.querySelector('#category-create').requestSubmit();
        })()`);
        await expect
          .poll(() =>
            readPanel("document.querySelector('#coding-status').textContent"),
          )
          .toBe('Categoría guardada y aplicada.');
        expect(
          await readPanel(
            "document.querySelector('#selection-title').textContent",
          ),
        ).toBe('Cita guardada');
        expect(
          await readPanel(
            "getComputedStyle(document.querySelector('.saved-category')).display",
          ),
        ).not.toBe('none');
        expect(
          await readPanel(
            "getComputedStyle(document.querySelector('.saved-next-step')).display",
          ),
        ).not.toBe('none');

        await readPanel(`(() => {
          document.querySelector('.definition-edit').click();
          document.querySelector('#category-saved-definition').value = 'Definición revisada';
          document.querySelector('#category-edit-definition').requestSubmit();
        })()`);
        await expect
          .poll(() =>
            readPanel("document.querySelector('#coding-status').textContent"),
          )
          .toBe('Definición guardada.');

        await page
          .locator('p')
          .last()
          .evaluate((node) => {
            node.addEventListener('pointerup', (event) =>
              event.stopPropagation(),
            );
          });
        await dragQuote(1, 'Otra cita.');
        await expect.poll(quote).toBe('Otra cita.');
        expect(
          await readPanel(
            "getComputedStyle(document.querySelector('.saved-next-step')).display",
          ),
        ).toBe('none');

        await expect
          .poll(() =>
            readPanel("document.querySelector('#coding-options').textContent"),
          )
          .toContain('Definición revisada');
        await readPanel(`Array.from(document.querySelectorAll('#coding-options label'))
          .find(label => label.textContent === 'Categoría sintética').querySelector('input').click()`);
        await expect
          .poll(() =>
            readPanel(`Array.from(document.querySelectorAll('#coding-options label'))
          .find(label => label.textContent === 'Categoría sintética')?.querySelector('input').checked`),
          )
          .toBe(true);
        await expect
          .poll(() =>
            page.evaluate(() =>
              Array.from(
                CSS.highlights.get('codificaweb-fdc086') ?? [],
                (range) => range.toString(),
              ),
            ),
          )
          .toEqual([citation, 'Otra cita.']);
        await readPanel(`(() => {
          document.querySelector('#project-name').value = 'Otro proyecto';
          document.querySelector('#project-create').click();
        })()`);
        await expect
          .poll(() =>
            readPanel(`Array.from(document.querySelector('#project-select').options)
          .some(option => option.text === 'Otro proyecto')`),
          )
          .toBe(true);
        await readPanel(`(() => {
          const projects = document.querySelector('#project-select');
          projects.value = Array.from(projects.options).find(option => option.text === 'Otro proyecto').value;
          projects.dispatchEvent(new Event('change'));
        })()`);
        await expect.poll(quote).toBe('');
        await expect
          .poll(() =>
            readPanel("document.querySelector('#fragment-codes').disabled"),
          )
          .toBe(true);

        await page.evaluate(() => {
          const third = document.createElement('p');
          third.textContent = 'Tercera cita.';
          document.body.append(third);
        });
        const newProjectColors = [
          [citation, '#7FC97F'],
          ['Otra cita.', '#BEAED4'],
          ['Tercera cita.', '#FDC086'],
        ] as const;
        for (const [index, [text, color]] of newProjectColors.entries()) {
          await dragQuote(index, text);
          await expect.poll(quote).toBe(text);
          await expect
            .poll(() =>
              readPanel("document.querySelector('#fragment-codes').disabled"),
            )
            .toBe(false);
          await readPanel(`(() => {
            document.querySelector('#category-open').click();
            document.querySelector('#category-name').value = 'Categoría ${index + 1}';
            document.querySelector('#category-definition').value = 'Definición de prueba';
            document.querySelector('#category-create').requestSubmit();
          })()`);
          await expect
            .poll(() =>
              readPanel("document.querySelector('#coding-status').textContent"),
            )
            .toBe('Categoría guardada y aplicada.');
          expect(
            await readPanel(
              "document.querySelector('#quote-card').style.getPropertyValue('--category-color')",
            ),
          ).toBe(color);
          expect(
            await readPanel(
              `Array.from(document.querySelectorAll('#coding-options label')).find(label => label.textContent === 'Categoría ${index + 1}').style.getPropertyValue('--category-color')`,
            ),
          ).toBe(color);
          await expect
            .poll(() =>
              page.evaluate(
                (color) =>
                  Array.from(
                    CSS.highlights.get(
                      'codificaweb-' + color.slice(1).toLowerCase(),
                    ) ?? [],
                    (range) => range.toString(),
                  ).join(''),
                color,
              ),
            )
            .toBe(text);
        }
        console.log(
          'Proyecto nuevo: verde #7FC97F, lila #BEAED4, naranja #FDC086 verificados en la cita, la etiqueta y el resaltado.',
        );
        await page.goto(nextUrl, { waitUntil: 'domcontentloaded' });
        await expect.poll(quote).toBe('');
        await dragQuote(0, 'Página siguiente.');
        await expect.poll(quote).toBe('Página siguiente.');
        await expect
          .poll(() =>
            readPanel("document.querySelector('#fragment-codes').disabled"),
          )
          .toBe(false);
        await readPanel(`(() => {
          document.querySelector('#category-open').click();
          document.querySelector('#category-name').value = 'Tras navegar';
        })()`);
        releaseImage?.();
        await page.waitForLoadState('load');
        expect(
          await readPanel("document.querySelector('#category-name').value"),
        ).toBe('Tras navegar');
        await readPanel(
          "document.querySelector('#category-create').requestSubmit()",
        );
        await expect
          .poll(() =>
            readPanel("document.querySelector('#coding-status').textContent"),
          )
          .toBe('Categoría guardada y aplicada.');
        const other = await context.newPage();
        await other.bringToFront();
        await expect.poll(quote).toBe('');
        await other.goto(otherSite);
        await other
          .locator('p')
          .evaluate((node) => window.getSelection()?.selectAllChildren(node));
        await expect
          .poll(() =>
            readPanel("document.querySelector('#fragment-codes').disabled"),
          )
          .toBe(true);
        const { targetInfos: nextTabs } = await cdp.send('Target.getTargets', {
          filter: [{ type: 'tab' }, { exclude: true }],
        });
        const otherTab = nextTabs.find(
          (candidate) => candidate.url === otherSite,
        );
        if (!otherTab) throw new Error('Falta la pestaña del otro sitio');
        await cdp.send('Extensions.triggerAction', {
          id,
          targetId: otherTab.targetId,
        });
        await expect.poll(quote).toBe('Otro sitio.');
        await expect
          .poll(() =>
            readPanel("document.querySelector('#fragment-codes').disabled"),
          )
          .toBe(false);
        await readPanel(`(() => {
          document.querySelector('#category-open').click();
          document.querySelector('#category-name').value = 'En otro sitio';
          document.querySelector('#category-create').requestSubmit();
        })()`);
        await expect
          .poll(() =>
            readPanel("document.querySelector('#coding-status').textContent"),
          )
          .toBe('Categoría guardada y aplicada.');
      } finally {
        socket.close();
      }
      expect(unexpected).toEqual([]);
      console.log(
        `${name} · ${product} · permiso inicial ausente, inyección bloqueada y sin tráfico inesperado`,
      );
    } finally {
      child.kill('SIGKILL');
      await closed;
      await browser?.close().catch(() => {});
      await rm(profile, { recursive: true, force: true, maxRetries: 5 });
    }
  });
}
