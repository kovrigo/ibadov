import { execSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

// Browser checks run against this worktree's built site, served by `paneweb up`
// (.paneweb.json builds, then previews). After a code change, `paneweb down`
// and `paneweb up` rebuild it. Without a server the run stops here.
const paneweb = execSync('paneweb url', { encoding: 'utf8' });
const baseURL = paneweb.match(/local: (http:\/\/127\.0\.0\.1:\d+\/)/)?.[1];
if (!baseURL) throw new Error(`No local URL in \`paneweb url\` output: ${paneweb}`);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  timeout: 60_000,
  use: { ...devices['Desktop Chrome'], baseURL },
  projects: [
    { name: 'layout', testIgnore: /(intro|calm|smooth)\.spec\.ts/ },
    // Timed checks (the intro's 1.5 s image window, frame lengths) run after the layout
    // checks and one at a time, so other browsers' load does not change what they measure.
    { name: 'timing', testMatch: /(intro|calm|smooth)\.spec\.ts/, dependencies: ['layout'], workers: 1 },
  ],
});
