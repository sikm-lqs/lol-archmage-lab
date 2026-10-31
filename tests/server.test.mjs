import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

test('development server serves the homepage, data and scripts while denying private files', { timeout: 5000 }, async t => {
  const server = spawn(process.execPath, ['scripts/serve.mjs', '--port', '19573'], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => server.kill());
  await once(server.stdout, 'data');
  for (const path of ['/', '/src/app.mjs', '/data/champions.json', '/assets/champion0.png']) {
    const response = await fetch(`http://127.0.0.1:19573${path}`);
    assert.equal(response.status, 200, path);
  }
  for (const path of ['/AGENTS.md', '/archive/file.zip', '/reference/config.json', '/.git/config',
    '/src%2f..%2fAGENTS.md', '/src/%2e%2e%2fAGENTS.md']) {
    const response = await fetch(`http://127.0.0.1:19573${path}`);
    assert.equal(response.status, 404, path);
  }
});
