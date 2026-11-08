import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import manifest from './src/manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    {
      name: 'codificaweb-manifest',
      apply: 'build',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'manifest.json',
          source: JSON.stringify(manifest, null, 2),
        });
      },
    },
  ],
  build: {
    target: 'chrome123',
    rolldownOptions: {
      input: {
        panel: fileURLToPath(
          new URL(manifest.side_panel.default_path, import.meta.url),
        ),
        background: fileURLToPath(
          new URL('./src/background.ts', import.meta.url),
        ),
      },
      output: {
        entryFileNames: (entry) =>
          entry.name === 'background'
            ? manifest.background.service_worker
            : 'assets/[name]-[hash].js',
      },
    },
  },
});
