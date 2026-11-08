import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test('Q11: el build genera una extensión MV3 con entradas locales y permisos opcionales', () => {
  const dist = mkdtempSync(join(tmpdir(), 'codificaweb-build-'));
  try {
    execFileSync(process.execPath, [
      'node_modules/vite/bin/vite.js',
      'build',
      '--outDir',
      dist,
    ]);
    const manifest = JSON.parse(
      readFileSync(join(dist, 'manifest.json'), 'utf8'),
    );
    expect(manifest).toMatchObject({
      manifest_version: 3,
      minimum_chrome_version: '123',
      permissions: ['sidePanel', 'scripting'],
      optional_host_permissions: ['http://*/*', 'https://*/*'],
      background: { type: 'module' },
    });
    expect(manifest).not.toHaveProperty('host_permissions');
    expect(manifest).not.toHaveProperty('content_scripts');
    expect(existsSync(join(dist, manifest.background.service_worker))).toBe(
      true,
    );
    const panel = readFileSync(
      join(dist, manifest.side_panel.default_path),
      'utf8',
    );
    const script = panel.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
    expect(script).toMatch(/^\/?assets\//);
    expect(existsSync(join(dist, script ?? 'missing'))).toBe(true);
  } finally {
    rmSync(dist, { recursive: true, force: true });
  }
}, 15_000);
