import { readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const pagesRoot = resolve(projectRoot, '..', 'docs');
const preservedFiles = new Set(['DEVELOPMENT_LOG.md', 'compose']);

for (const entry of await readdir(pagesRoot, { withFileTypes: true })) {
  if (preservedFiles.has(entry.name)) continue;
  await rm(join(pagesRoot, entry.name), { recursive: true, force: true });
}

console.log(`Pasta de publicação limpa: ${pagesRoot}`);
