import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const projectRoot = resolve(here, '..');
const distRoot = resolve(projectRoot, '..', 'docs');
const base = normalizeBase(process.env.VITE_BASE_PATH || '/enem-provas-criador/');
const args = new Map(process.argv.slice(2).map((value, index, values) => [value, values[index + 1]]));
const host = args.get('--host') || '127.0.0.1';
const port = Number(args.get('--port') || 4173);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.sqlite': 'application/vnd.sqlite3',
  '.wasm': 'application/wasm',
};

function normalizeBase(value) {
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
}

function safeFilePath(pathname) {
  if (pathname === base) return join(distRoot, 'index.html');
  if (!pathname.startsWith(base)) return null;
  const relativePath = pathname.slice(base.length);
  const filePath = resolve(distRoot, relativePath);
  return filePath === distRoot || filePath.startsWith(`${distRoot}/`) ? filePath : null;
}

const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    const filePath = safeFilePath(pathname);
    if (!filePath) {
      response.writeHead(404).end('Not found');
      return;
    }
    const metadata = await stat(filePath);
    if (!metadata.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream' });
    response.end(await readFile(filePath));
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, host, () => {
  console.log(`Pages preview: http://${host}:${port}${base}`);
});
