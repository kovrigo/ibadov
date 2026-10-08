import { execSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

// Browser checks run against this worktree's own dev server. Start it with
// `paneweb up`; without it the run stops here with paneweb's message.
const paneweb = execSync('paneweb url', { encoding: 'utf8' });
const baseURL = paneweb.match(/local: (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1];
if (!baseURL) throw new Error(`No local URL in \`paneweb url\` output: ${paneweb}`);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  timeout: 60_000,
  use: { ...devices['Desktop Chrome'], baseURL },
});
