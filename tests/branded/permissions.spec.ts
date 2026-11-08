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
        path: resolve('dist'),
      });
      const [context] = browser.contexts();
      if (!context) throw new Error('No se encontró el perfil temporal');

      const unexpected: string[] = [];
      await context.route(/^https?:\/\//, (route) => route.abort());
      await context.route(url, (route) =>
        route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: `<p>${citation}</p><p>Otra cita.</p>`,
        }),
      );
      context.on('request', (request) => {
        if (
          /^https?:\/\//.test(request.url()) &&
          !(request.url() === url && request.isNavigationRequest())
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
      await page
        .locator('p')
        .first()
        .evaluate((node) => window.getSelection()?.selectAllChildren(node));
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
        await page
          .locator('p')
          .last()
          .evaluate((node) => {
            window.getSelection()?.selectAllChildren(node);
            node.dispatchEvent(new Event('pointerup', { bubbles: true }));
          });
        await expect.poll(quote).toBe('Otra cita.');
        const other = await context.newPage();
        await other.bringToFront();
        await expect.poll(quote).toBe('');
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
