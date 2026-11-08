import fixture from '../../docs/examples/project-v1.json' with { type: 'json' };
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, platform, tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, expect, test } from '@playwright/test';

test('Q01–Q10, Q12, Q14 y Q16: flujo de proyectos, evidencias y privacidad local', async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), 'codificaweb-selection-'));
  const dist = resolve(workspace, 'extension');
  const url = 'http://127.0.0.1:32146/articulo';
  const fixtureUrls = new Set([
    url,
    ...['uno', 'dos'].map((path) => new URL(`/catalogo-${path}`, url).href),
  ]);
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
      const unexpectedTraffic: string[] = [];
      await context.route(/^https?:\/\//, (route) => route.abort());
      context.on('request', (request) => {
        const address = request.url();
        if (!/^https?:\/\//.test(address)) return;
        if (fixtureUrls.has(address) && request.isNavigationRequest()) return;
        unexpectedTraffic.push(`${request.method()} ${address}`);
      });
      await context.routeWebSocket(/^wss?:\/\//, async (socket) => {
        unexpectedTraffic.push(socket.url());
        await socket.close();
      });
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
      await expect(panel.locator('#selection-quote')).toHaveText(
        '🙂 hola mundo',
      );
      await expect(panel.locator('#selection-source')).toHaveText(url);
      await expect(panel.locator('#category-create')).toBeHidden();
      await panel.getByLabel('Buscar categorías').fill('Patrón rápido');
      await panel.getByRole('button', { name: 'Crear categoría' }).click();
      await expect(panel.locator('#selection-quote')).toHaveText(
        '🙂 hola mundo',
      );
      await expect(panel.getByLabel('Nombre de la categoría')).toHaveValue(
        'Patrón rápido',
        { timeout: 2000 },
      );
      await panel
        .getByLabel('Definición de la categoría')
        .fill('Una definición sintética');
      await expect(
        panel.getByText('El proyecto asigna el color automáticamente.'),
      ).toBeVisible();
      await panel.getByRole('button', { name: 'Guardar y aplicar' }).click();
      await expect(panel.locator('#coding-status')).toHaveText(
        'Categoría guardada y aplicada.',
      );
      await expect(panel.locator('#category-create')).toBeHidden();
      await expect(
        panel.getByRole('heading', { name: 'Cita guardada', exact: true }),
      ).toBeVisible();
      await expect(
        panel.getByRole('heading', { name: 'Categoría aplicada' }),
      ).toBeVisible();
      await expect(
        panel.getByText('Selecciona otro fragmento para seguir.'),
      ).toBeVisible();
      const assignedColor = panel
        .locator('#quote-card')
        .getByText('Color asignado', { exact: true });
      await expect(assignedColor).toBeVisible({ timeout: 2500 });
      await expect(panel.locator('#saved-color-swatch')).toHaveCSS(
        'background-color',
        'rgb(253, 192, 134)',
      );
      const savedRelation = panel.locator('#quote-card').getByRole('button', {
        name: 'Relacionar con otra cita',
      });
      await savedRelation.press('Enter');
      await expect(panel.locator('#relation-origin')).toContainText(
        '🙂 hola mundo',
      );
      await panel
        .getByRole('button', { name: 'Cancelar', exact: true })
        .press('Enter');
      await expect(savedRelation).toBeFocused();
      const finding = panel.getByRole('checkbox', { name: 'Patrón rápido' });
      await expect(finding).toBeChecked();
      await expect(finding.locator('..')).toHaveCSS(
        '--category-color',
        '#FDC086',
      );
      await expect(panel.getByText('Una definición sintética')).toBeVisible();
      await panel
        .getByRole('button', { name: 'Editar definición de Patrón rápido' })
        .click();
      const definition = panel.getByLabel(
        'Definición guardada de la categoría',
      );
      await expect(definition).toHaveValue('Una definición sintética');
      await definition.fill('Definición revisada');
      await panel.getByRole('button', { name: 'Guardar definición' }).click();
      await expect(panel.locator('#coding-status')).toHaveText(
        'Definición guardada.',
      );
      await capture.click();
      await expect(
        panel.getByText('Definición revisada', { exact: true }),
      ).toBeVisible();
      await expect(finding).toBeChecked();

      await expect
        .poll(() =>
          source.evaluate(() =>
            Array.from(
              CSS.highlights.get('codificaweb-fdc086') ?? [],
              (range) => range.toString(),
            ).join(''),
          ),
        )
        .toBe('🙂 hola mundo');
      await expect
        .poll(() =>
          source.locator('#text strong').evaluate((element) => {
            const style = getComputedStyle(
              element,
              '::highlight(codificaweb-fdc086)',
            );
            return [
              style.textDecorationLine,
              style.textDecorationThickness,
              style.textDecorationColor,
              style.backgroundColor,
            ];
          }),
        )
        .toEqual([
          'underline',
          '3px',
          'rgb(253, 192, 134)',
          'rgba(0, 0, 0, 0)',
        ]);
      const pageCitations = panel.locator('#page-citations');
      await pageCitations.locator('summary').click();
      await expect(pageCitations.locator('li')).toContainText('🙂 hola mundo');
      await expect(pageCitations.locator('.citation-category')).toHaveText(
        'Patrón rápido',
      );
      await source.locator('#text').evaluate((element) => {
        element.style.maxWidth = '350px';
      });
      await source.setViewportSize({ width: 900, height: 600 });
      const marginCdp = await context.newCDPSession(source);
      const marginContent = async () => {
        const { root } = await marginCdp.send('DOM.getDocument', {
          depth: -1,
          pierce: true,
        });
        return JSON.stringify(root);
      };
      await expect.poll(marginContent).toContain('Patrón rápido');
      await source.setViewportSize({ width: 320, height: 600 });
      await expect.poll(marginContent).not.toContain('Patrón rápido');
      await expect(pageCitations.locator('.citation-category')).toHaveText(
        'Patrón rápido',
      );
      await source.setViewportSize({ width: 900, height: 600 });
      await marginCdp.detach();
      await panel.getByLabel('Buscar categorías').fill('patrón');
      await expect(panel.getByRole('checkbox', { name: 'Tema' })).toHaveCount(
        0,
      );
      await panel.getByLabel('Buscar categorías').clear();
      await finding.focus();
      await panel.keyboard.press('Space');
      await expect(finding).not.toBeChecked();
      await expect(assignedColor).toBeHidden();
      await expect(finding).toBeFocused();
      await expect(finding).toHaveCSS('outline-style', 'solid');
      await panel.keyboard.press('Space');
      await expect(finding).toBeChecked();
      await expect(finding).toBeFocused();
      await panel.keyboard.press('Space');
      await expect(finding).not.toBeChecked();
      await panel.keyboard.press('Tab');
      await expect(
        panel.getByRole('button', { name: 'Crear categoría' }),
      ).toBeFocused();
      await expect(
        panel.getByText('Selecciona otro fragmento para seguir.'),
      ).toBeHidden();

      const note = panel.getByLabel('Nota en texto plano');
      const saveNote = panel.getByRole('button', { name: 'Guardar nota' });
      const removeNote = panel.getByRole('button', { name: 'Borrar nota' });
      await note.fill('<b>Observación literal</b>');
      await saveNote.click();
      await expect(panel.locator('#note-status')).toHaveText('Nota guardada.');

      const tema = panel.getByRole('checkbox', { name: 'Tema' });
      const contexto = panel.getByRole('checkbox', { name: 'Contexto' });
      await tema.click();
      await expect(tema).toBeChecked();
      await contexto.click();
      await expect(contexto).toBeChecked();
      await expect(tema).toBeChecked();

      // Q12 explicitly stop the MV3 worker while retaining the browser profile.
      const cdp = await context.newCDPSession(panel);
      await cdp.send('ServiceWorker.enable');
      const workerTargets = async () =>
        (await cdp.send('Target.getTargets')).targetInfos.filter(
          (target) =>
            target.type === 'service_worker' && target.url === worker.url(),
        );
      const [originalWorker] = await workerTargets();
      expect(originalWorker).toBeDefined();
      await cdp.send('ServiceWorker.stopAllWorkers');
      await expect
        .poll(async () =>
          (await workerTargets()).map(({ targetId }) => targetId),
        )
        .not.toContain(originalWorker?.targetId);

      await capture.click();
      await expect(tema).toBeChecked();
      await expect(contexto).toBeChecked();
      await expect.poll(async () => (await workerTargets()).length).toBe(1);
      await cdp.detach();
      await expect(note).toHaveValue('<b>Observación literal</b>');
      await note.fill('Nota editada');
      await saveNote.click();
      await expect(panel.locator('#note-status')).toHaveText('Nota guardada.');
      await capture.click();
      await expect(note).toHaveValue('Nota editada');
      await removeNote.click();
      await expect(panel.locator('#note-status')).toHaveText('Nota borrada.');
      await expect(note).toHaveValue('');
      await expect(tema).toBeChecked();
      await expect(contexto).toBeChecked();
      await expect(panel.locator('#selection-quote')).toHaveText(
        '🙂 hola mundo',
      );

      await tema.click();
      await expect(tema).not.toBeChecked();
      await expect(contexto).toBeChecked();

      await source.bringToFront();
      await source.evaluate(() => {
        const text = document.querySelector('strong')?.firstChild;
        if (!text) throw new Error('Fixture sin texto');
        window.getSelection()?.collapse(text, 0);
      });
      for (let i = 0; i < 6; i++)
        await source.keyboard.press('Shift+ArrowRight');
      await expect
        .poll(() => source.evaluate(() => window.getSelection()?.toString()))
        .toBe('🙂 hola');
      await panel.bringToFront();
      await capture.click();
      await expect(panel.locator('#selection-quote')).toHaveText('🙂 hola');
      const original = await source.locator('#text').innerHTML();
      await tema.click();
      await expect(tema).toBeChecked();
      const paintedText = (name: string) =>
        source.evaluate(
          (name) => [...(CSS.highlights.get(name) ?? [])].map(String).join(''),
          name,
        );
      await expect
        .poll(() => paintedText('codificaweb-7fc97f'))
        .toBe('🙂 hola');
      await expect.poll(() => paintedText('codificaweb-beaed4')).toBe(' mundo');
      const filter = panel.getByLabel('Filtrar resaltados por código');
      await filter.selectOption({ label: 'Contexto' });
      await expect
        .poll(() => paintedText('codificaweb-beaed4'))
        .toBe('🙂 hola mundo');
      await expect.poll(() => paintedText('codificaweb-7fc97f')).toBe('');
      await filter.selectOption({ label: 'Tema' });
      await expect
        .poll(() => paintedText('codificaweb-7fc97f'))
        .toBe('🙂 hola');
      await expect.poll(() => paintedText('codificaweb-beaed4')).toBe('');
      await expect(source.locator('#text')).toHaveJSProperty(
        'innerHTML',
        original,
      );

      await panel.getByText('Gestionar proyectos', { exact: true }).click();
      const project = panel.getByLabel('Proyecto activo');
      const projectName = panel.getByLabel('Nombre del proyecto');
      await projectName.fill('Proyecto B');
      await panel.getByRole('button', { name: 'Crear proyecto' }).click();
      await project.selectOption({ label: 'Proyecto B' });
      await expect(project).toBeEnabled();
      await expect(project.locator('option:checked')).toHaveText('Proyecto B');
      await expect.poll(() => paintedText('codificaweb-7fc97f')).toBe('');
      await capture.click();
      await expect(note).toBeEnabled();
      await expect(tema).toHaveCount(0);
      await note.fill('Nota del segundo proyecto');
      await saveNote.click();
      await expect(panel.locator('#note-status')).toHaveText('Nota guardada.');
      await projectName.fill('Proyecto B editado');
      await panel.getByRole('button', { name: 'Guardar proyecto' }).click();
      await expect(project.locator('option:checked')).toHaveText(
        'Proyecto B editado',
      );
      panel.once('dialog', (dialog) => void dialog.dismiss());
      await panel.getByRole('button', { name: 'Borrar proyecto' }).click();
      await expect(project.locator('option')).toHaveCount(2);
      panel.once('dialog', (dialog) => void dialog.accept());
      await panel.getByRole('button', { name: 'Borrar proyecto' }).click();
      await expect(project.locator('option')).toHaveCount(1);
      await expect(project.locator('option:checked')).toHaveText(
        'Proyecto inicial',
      );
      await expect
        .poll(() => paintedText('codificaweb-7fc97f'))
        .toBe('🙂 hola');
      await capture.click();
      await expect(tema).toBeChecked();
      await expect(note).toHaveValue('');

      await source.evaluate(() =>
        history.replaceState(null, '', '#otra-fuente'),
      );
      await capture.click();
      await expect(panel.locator('#capture-status')).toContainText(
        'documento cambió',
      );
      await expect(panel.locator('#selection-quote')).toBeEmpty();

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
      await expect(panel.locator('#selection-quote')).toBeEmpty();

      // R2 measures rebuilding the registry with 200 overlaps, excluding message transport.
      const benchmarkText = Array.from(
        { length: 250 },
        (_, i) => String(i).padStart(3, '0') + 'a'.repeat(397),
      ).join('');
      await source.evaluate((text) => {
        document.body.textContent = text;
      }, benchmarkText);
      const p95 = await panel.evaluate(async (text) => {
        const [tab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (tab?.id === undefined || !tab.url)
          throw new Error('Fixture sin pestaña');
        const entries = Array.from({ length: 200 }, (_, id) => ({
          id: String(id),
          color: id % 2 ? '#7FC97F' : '#BEAED4',
          selectors: {
            position: { start: id * 400, end: id * 400 + 800 },
            quote: {
              exact: text.slice(id * 400, id * 400 + 800),
              prefix: '',
              suffix: '',
            },
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
      }, benchmarkText);
      console.log(`R2 p95=${p95} ms · ${platform()} · ${cpus()[0]?.model}`);
      expect(p95).toBeLessThanOrEqual(150);

      await source.reload();
      await capture.click();
      await expect(panel.locator('#capture-status')).toContainText(
        'documento cambió',
      );

      // Q06 restores without reopening or reauthorizing the panel.
      await source.goto(url);
      await expect
        .poll(() => paintedText('codificaweb-7fc97f'))
        .toBe('🙂 hola');
      await source.reload();
      await expect.poll(() => paintedText('codificaweb-beaed4')).toBe(' mundo');
      await source.evaluate(() => {
        const paragraph = document.querySelector('#text');
        if (paragraph)
          paragraph.innerHTML =
            'Nuevo <span>🙂</span><span> hola</span><em> mundo</em>';
      });
      await expect
        .poll(() => paintedText('codificaweb-7fc97f'))
        .toBe('🙂 hola');
      await source.evaluate(() => {
        document.body.textContent = '🙂 hola mundo. 🙂 hola mundo';
      });
      await expect.poll(() => paintedText('codificaweb-7fc97f')).toBe('');
      await expect.poll(() => paintedText('codificaweb-beaed4')).toBe('');
      await source.evaluate(() => {
        document.body.textContent = '🙂 hola mundo';
      });
      await expect
        .poll(() => paintedText('codificaweb-7fc97f'))
        .toBe('🙂 hola');
      await source.evaluate(() => history.pushState(null, '', '/otra-ruta'));
      await expect.poll(() => paintedText('codificaweb-7fc97f')).toBe('');
      // Q02: one user-created code is reused in two independent sources.
      await panel.getByText('Gestionar categorías', { exact: true }).click();
      const catalog = panel.getByLabel('Código del catálogo');
      const codeName = panel.getByLabel('Nombre del código');
      const codeColor = panel.getByLabel('Color asignado');
      await codeName.fill('Hallazgo');
      await panel.getByRole('button', { name: 'Crear código' }).click();
      await expect(
        catalog.locator('option', { hasText: 'Hallazgo' }),
      ).toHaveCount(1);
      const sources = ['uno', 'dos'].map(
        (path) => new URL(`/catalogo-${path}`, url).href,
      );
      async function captureSource(address: string) {
        await source.goto(address);
        await panel.getByLabel('URL del sitio').fill(address);
        await panel.getByRole('button', { name: 'Comprobar acceso' }).click();
        await expect(panel.getByRole('status')).toHaveText(
          'Acceso al sitio verificado.',
        );
        await source.bringToFront();
        await source
          .locator('#catalog-fixture')
          .evaluate((node) => window.getSelection()?.selectAllChildren(node));
        await panel.bringToFront();
        await capture.click();
        await expect(panel.locator('#selection-quote')).toHaveText(
          'Evidencia del catálogo',
        );
      }
      for (const address of sources) {
        await context.route(address, (route) =>
          route.fulfill({
            contentType: 'text/html; charset=utf-8',
            body: '<p id="catalog-fixture">Evidencia del catálogo</p>',
          }),
        );
        await captureSource(address);
        const finding = panel.getByRole('checkbox', { name: 'Hallazgo' });
        await finding.click();
        await expect(finding).toBeChecked();
        await expect
          .poll(() => paintedText('codificaweb-ffff99'))
          .toBe('Evidencia del catálogo');
        await note.fill('Nota conservada');
        await saveNote.click();
        await expect(panel.locator('#note-status')).toHaveText(
          'Nota guardada.',
        );
      }
      await catalog.selectOption({ label: 'Hallazgo' });
      await expect(codeColor).toHaveValue('#FFFF99');
      await codeName.fill('Hallazgo editado');
      await panel
        .getByLabel('Descripción del código')
        .fill('Descripción nueva');
      await panel.getByRole('button', { name: 'Guardar código' }).click();
      await expect(
        panel.getByRole('checkbox', { name: 'Hallazgo editado' }),
      ).toBeChecked();
      await expect
        .poll(() => paintedText('codificaweb-ffff99'))
        .toBe('Evidencia del catálogo');
      await captureSource(sources[0] ?? '');
      await expect
        .poll(() => paintedText('codificaweb-ffff99'))
        .toBe('Evidencia del catálogo');
      await catalog.selectOption({ label: 'Hallazgo editado' });
      panel.once('dialog', (dialog) => void dialog.accept());
      await panel.getByRole('button', { name: 'Borrar código' }).click();
      await expect(
        panel.getByRole('checkbox', { name: 'Hallazgo editado' }),
      ).toHaveCount(0);
      await expect.poll(() => paintedText('codificaweb-ffff99')).toBe('');
      await expect(note).toHaveValue('Nota conservada');
      // Q08: search stored evidence after the current page loses its text.
      await tema.click();
      await expect(tema).toBeChecked();
      await source.evaluate(() => {
        document.body.textContent = 'Sin cita en esta página';
      });
      const tools = panel.locator('#panel-tools');
      await tools.locator(':scope > summary').click();
      const evidenceEntry = panel.getByText('Buscar evidencias', {
        exact: true,
      });
      await expect(evidenceEntry).toBeVisible();
      await evidenceEntry.click();
      const search = panel.getByRole('button', { name: 'Buscar', exact: true });
      await search.click();
      const evidence = panel.locator('#evidence-results');
      await expect(evidence).toContainText('Evidencia del catálogo');
      await panel
        .getByLabel('Texto de la cita o nota')
        .fill('EVIDENCIA DEL CATA\u0301LOGO');
      await panel
        .getByLabel('Código de la evidencia')
        .selectOption({ label: 'Tema' });
      await panel
        .getByLabel('Fuente de la evidencia')
        .selectOption({ label: sources[0] ?? '' });
      await search.click();
      await expect(evidence.locator('li')).toHaveCount(1);
      await expect(evidence).toContainText('Nota conservada');
      await panel
        .getByLabel('Fuente de la evidencia')
        .selectOption({ label: sources[1] ?? '' });
      await search.click();
      await expect(panel.locator('#evidence-status')).toHaveText(
        'Sin resultados.',
      );
      await panel
        .getByLabel('Fuente de la evidencia')
        .selectOption({ label: sources[0] ?? '' });
      await search.click();
      const open = evidence.getByRole('button', { name: 'Abrir fuente' });
      await open.click();
      await expect(evidence).toContainText('No se pudo ubicar la cita.');
      await expect(evidence).toContainText('Evidencia del catálogo');

      const firstSource = sources[0] ?? '';
      await source.close();
      await context.unroute(firstSource);
      await context.route(firstSource, (route) =>
        route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: '<div style="height: 2200px"></div><p id="catalog-fixture">Evidencia del catálogo</p>',
        }),
      );
      const [destination] = await Promise.all([
        context.waitForEvent('page'),
        open.click(),
      ]);
      await expect(evidence).toContainText(
        'Fragmento localizado en la fuente.',
      );
      await expect(destination).toHaveURL(firstSource);
      await expect(destination.locator('#catalog-fixture')).toBeInViewport();
      // Q10: round-trip the published fixture through the actual file controls.
      await tools.locator(':scope > summary').click();
      await panel
        .getByText('Importar o exportar proyecto', { exact: true })
        .click();
      const file = panel.getByLabel('Archivo de proyecto JSON');
      const importProject = panel.getByRole('button', {
        name: 'Importar como copia',
      });
      await file.setInputFiles({
        name: 'invalido.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ ...fixture, schemaVersion: 3 })),
      });
      await importProject.click();
      await expect(panel.locator('#transfer-status')).toContainText(
        'No se pudo importar',
      );
      await file.setInputFiles({
        name: 'proyecto.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(fixture)),
      });
      await importProject.click();
      await expect(panel.locator('#transfer-status')).toHaveText(
        'Copia del proyecto importada.',
      );
      await project.selectOption({ label: 'Movilidad' });
      await expect(project).toBeEnabled();
      const [download] = await Promise.all([
        panel.waitForEvent('download'),
        panel.getByRole('button', { name: 'Exportar proyecto activo' }).click(),
      ]);
      const output = await download.path();
      if (!output) throw new Error('No se descargó el proyecto');
      const transferred = JSON.parse(await readFile(output, 'utf8'));
      expect(download.suggestedFilename()).toBe('codificaweb-proyecto-v2.json');
      expect(transferred).toMatchObject({
        schemaVersion: 2,
        relationTypes: [],
        quotationLinks: [],
      });
      expect(transferred.project.id).not.toBe(fixture.project.id);
      expect(transferred.annotations[0]?.note).toBe(
        fixture.annotations[0]?.note,
      );
      expect(transferred.codings).toHaveLength(2);
      await file.setInputFiles(output);
      await importProject.click();
      await expect(panel.locator('#transfer-status')).toHaveText(
        'Copia del proyecto importada.',
      );
      await expect(
        project.locator('option', { hasText: 'Movilidad' }),
      ).toHaveCount(2);
      for (const width of [320, 480]) {
        await panel.setViewportSize({ width, height: 700 });
        await expect
          .poll(() =>
            panel.evaluate(
              () =>
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
            ),
          )
          .toBe(0);
      }
      // Q16: relate citations from two sources using the panel at 320 px.
      await panel.setViewportSize({ width: 320, height: 700 });
      const secondUrl = 'https://example.org/informe';
      const secondId = '00000000-0000-4000-8000-000000000010';
      const secondQuote = 'Instalaron rampas';
      const annotation = fixture.annotations[0];
      if (!annotation) throw new Error('Falta la primera cita del ejemplo.');
      await file.setInputFiles({
        name: 'relaciones.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
          JSON.stringify({
            ...fixture,
            project: { ...fixture.project, name: 'Relaciones' },
            sources: [
              ...fixture.sources,
              { ...fixture.sources[0], id: secondId, url: secondUrl },
            ],
            annotations: [
              ...fixture.annotations,
              {
                ...annotation,
                id: '00000000-0000-4000-8000-000000000011',
                sourceId: secondId,
                selectors: {
                  ...annotation.selectors,
                  quote: { ...annotation.selectors.quote, exact: secondQuote },
                  position: {
                    ...annotation.selectors.position,
                    end: secondQuote.length,
                  },
                },
              },
            ],
          }),
        ),
      });
      await importProject.click();
      await expect(panel.locator('#transfer-status')).toHaveText(
        'Copia del proyecto importada.',
      );
      await project.selectOption({ label: 'Relaciones' });
      if (!(await panel.locator('#evidence-search').isVisible()))
        await evidenceEntry.click();
      await panel.getByLabel('Texto de la cita o nota').fill('');
      await panel
        .locator('#evidence-search')
        .getByRole('button', { name: 'Buscar', exact: true })
        .click();
      const origin = panel
        .locator('#evidence-results li')
        .filter({ hasText: 'Faltan rampas' });
      const relate = origin.getByRole('button', {
        name: 'Relacionar con otra cita',
      });
      await expect(relate).toBeVisible();
      await relate.press('Enter');
      const relation = panel.getByRole('region', { name: 'Relacionar citas' });
      await expect(relation.getByText('Paso 2 de 4')).toBeVisible();
      await expect(panel.locator('#panel-evidence')).toBeHidden();
      await relation.getByLabel('Buscar citas guardadas').fill('informe');
      await relation
        .getByRole('button', { name: 'Elegir cita' })
        .press('Enter');
      await relation
        .getByLabel('Tipo de relación', { exact: true })
        .selectOption('__new__');
      await relation
        .getByLabel('Nombre del tipo')
        .fill('Actualiza el diagnóstico');
      await relation
        .getByLabel('Definición')
        .fill('Aporta información posterior');
      await expect(relation.getByText('Paso 3 de 4')).toBeVisible();
      await relation
        .getByRole('button', { name: 'Revisar vínculo' })
        .press('Enter');
      await expect(relation.getByText('Paso 4 de 4')).toBeVisible();
      await expect(relation.getByText('Cita A → Cita B')).toBeVisible();
      await relation
        .getByRole('button', { name: 'Invertir citas' })
        .press('Enter');
      await panel.evaluate(() => {
        const send = chrome.runtime.sendMessage.bind(chrome.runtime);
        chrome.runtime.sendMessage = ((message: { type?: string }) => {
          if (message.type === 'relations.createWithType') {
            chrome.runtime.sendMessage = send;
            return Promise.resolve({ kind: 'error' });
          }
          return send(message);
        }) as typeof chrome.runtime.sendMessage;
      });
      const save = relation.getByRole('button', { name: 'Guardar relación' });
      await save.press('Enter');
      await expect(relation.getByRole('status').first()).toHaveText(
        /No se pudo guardar/,
      );
      await expect(relation.getByLabel('Nombre del tipo')).toHaveValue(
        'Actualiza el diagnóstico',
      );
      await save.press('Enter');
      await expect(relation.getByRole('status').first()).toHaveText(
        'Vínculo guardado.',
      );
      await expect(
        relation.getByText('Actualiza el diagnóstico · Hacia esta cita'),
      ).toBeVisible();
      await relation
        .getByRole('button', { name: 'Cerrar', exact: true })
        .press('Enter');
      const other = panel
        .locator('#evidence-results li')
        .filter({ hasText: secondQuote });
      await other
        .getByRole('button', { name: 'Relacionar con otra cita' })
        .press('Enter');
      await expect(
        relation.getByText('Actualiza el diagnóstico · Desde esta cita'),
      ).toBeVisible();
      expect(
        await panel.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(320);
      expect(unexpectedTraffic).toEqual([]);
    } finally {
      await context.close();
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
