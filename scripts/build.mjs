import { cp, mkdir, rm, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
await readFile(join(root, 'public/data/champions.json'));
await rm(join(root, 'dist'), { recursive: true, force: true });
await mkdir(join(root, 'dist'), { recursive: true });
for (const entry of ['index.html', 'src']) await cp(join(root, entry), join(root, 'dist', entry), { recursive: true });
await cp(join(root, 'public'), join(root, 'dist'), { recursive: true });
console.log('静态构建完成：dist/（不含 ZIP、参考程序或采集缓存）');
