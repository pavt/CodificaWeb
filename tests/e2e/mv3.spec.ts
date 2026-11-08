import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

test('Q11: abre el panel MV3 y Chromium bloquea la inyección previa al permiso', async () => {
  const profile = await mkdtemp(resolve(tmpdir(), 'codificaweb-chromium-'));
  const dist = resolve('dist');
  try {
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    try {
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker'));
      await expect
        .poll(() =>
          worker.evaluate(
            async () =>
              (await chrome.sidePanel.getPanelBehavior())
                .openPanelOnActionClick,
          ),
        )
        .toBe(false);

      const url = 'http://127.0.0.1:32145/fixture';
      await context.route(url, (route) =>
        route.fulfill({ body: 'Evidencia local de prueba' }),
      );
      const source = await context.newPage();
      await source.goto(url);

      const panelPath = await worker.evaluate(
        () => chrome.runtime.getManifest().side_panel?.default_path,
      );
      const panel = await context.newPage();
      if (!panelPath)
        throw new Error('El manifiesto no declara un panel lateral');
      await panel.goto(new URL(panelPath, worker.url()).href);
      await expect(
        panel.getByRole('heading', { name: 'CodificaWeb' }),
      ).toBeVisible();
      await source.bringToFront();
      const access = await panel.evaluate(async () => {
        const hasPermission = await chrome.permissions.contains({
          origins: ['http://127.0.0.1/*'],
        });
        const [source] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (source?.id === undefined)
          throw new Error('No se encontró la pestaña sin permiso');
        const injection = await chrome.scripting
          .executeScript({
            target: { tabId: source.id },
            func: () => location.origin,
          })
          .then(
            () => 'permitida',
            (error: Error) => error.message,
          );
        return { hasPermission, injection };
      });
      expect(access.hasPermission).toBe(false);
      expect(access.injection).toMatch(/cannot access/i);

      // The native permission dialog is covered manually. Observe the real click
      // and simulate a refusal without opening browser chrome in headless CI.
      await panel.evaluate(() => {
        chrome.permissions.request = async ({ origins }) => {
          document.body.dataset.permissionRequest = JSON.stringify({
            origins,
            userGesture: navigator.userActivation.isActive,
          });
          return false;
        };
      });
      await panel.getByLabel('URL del sitio').fill(url);
      await panel.getByRole('button', { name: 'Comprobar acceso' }).click();
      await expect(panel.getByRole('status')).toHaveText('Permiso denegado.');
      await expect(panel.locator('body')).toHaveAttribute(
        'data-permission-request',
        '{"origins":["http://127.0.0.1/*"],"userGesture":true}',
      );
    } finally {
      await context.close();
    }
  } finally {
    await rm(profile, { recursive: true, force: true });
  }
});
