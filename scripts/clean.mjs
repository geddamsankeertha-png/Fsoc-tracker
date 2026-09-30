import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

for (const target of ['dist', 'server.js']) {
  rmSync(path.join(projectRoot, target), { recursive: true, force: true });
}
