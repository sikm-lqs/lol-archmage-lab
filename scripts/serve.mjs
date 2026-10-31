import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const port = portIndex >= 0 ? Number(args[portIndex + 1]) : 5173;
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args[baseIndex + 1].replace(/\/$/, '') : '';
if (base && !/^\/[\w/-]+$/.test(base)) throw new Error('base 必须是以 / 开头的安全路径');
const project = fileURLToPath(new URL('../', import.meta.url));
const production = args.includes('--dist');
const root = production ? resolve(project, 'dist') : resolve(project);
const types = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml' };

createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname.includes('\\') || pathname.split('/').some(part => part === '.' || part === '..')) {
      res.writeHead(404).end('Not found'); return;
    }
    if (base && pathname === base) { res.writeHead(302, { Location: `${base}/` }).end(); return; }
    if (base && !pathname.startsWith(`${base}/`)) { res.writeHead(404).end('Not found'); return; }
    if (base) pathname = pathname.slice(base.length);
    if (pathname === '/') pathname = '/index.html';
    const allowed = pathname === '/index.html' || /^\/(src|data|assets)\//.test(pathname);
    if (!allowed) { res.writeHead(404).end('Not found'); return; }
    const contentRoot = !production && /^\/(data|assets)\//.test(pathname) ? resolve(root, 'public') : root;
    const path = resolve(contentRoot, `.${pathname}`);
    if (!path.startsWith(contentRoot + sep) || !(await stat(path)).isFile()) throw new Error('Not found');
    const bytes = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }).end(bytes);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`本地预览：http://127.0.0.1:${port}${base}/`));
