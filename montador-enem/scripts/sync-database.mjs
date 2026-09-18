import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const projectRoot = resolve(appRoot, '..');
const source = resolve(projectRoot, 'enem.sqlite');
const publicDir = resolve(appRoot, 'public');
const destination = resolve(publicDir, 'enem.sqlite');
const manifestPath = resolve(publicDir, 'enem.sqlite.meta.json');

const bytes = await readFile(source);
const sha256 = createHash('sha256').update(bytes).digest('hex');

await mkdir(publicDir, { recursive: true });
await copyFile(source, destination);
await writeFile(
  manifestPath,
  `${JSON.stringify({ schemaVersion: 1, sha256, bytes: bytes.byteLength }, null, 2)}\n`,
  'utf8',
);

console.log(`SQLite sincronizado: ${destination}`);
console.log(`SHA-256: ${sha256}`);
