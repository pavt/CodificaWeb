import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/branded',
  workers: 1,
  use: { trace: 'retain-on-failure' },
});
