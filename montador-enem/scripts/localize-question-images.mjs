#!/usr/bin/env node

/**
 * Host 2009–2023 question images locally and rewrite DB references to the
 * portable `asset:media/...` scheme.
 *
 * Source layout (yunger7/enem-api public/):
 *   <year>/questions/<index>[-lang]/<uuid>.<ext>
 *
 * Dest layout (served with the app):
 *   montador-enem/public/media/<year>/questions/<index>[-lang]/<filename>
 *
 * Stored URL form:
 *   asset:media/<year>/questions/<index>[-lang]>/<filename>
 */

import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const projectRoot = resolve(appRoot, '..');

const DEFAULT_SOURCE = '/tmp/enem-api-src/public';
const DEFAULT_DATABASE = resolve(projectRoot, 'enem.sqlite');
const DEFAULT_MEDIA_ROOT = resolve(appRoot, 'public', 'media');

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.latex',
]);

const REMOTE_PREFIX = 'https://enem.dev/';

class LocalizeError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'LocalizeError';
  }
}

function usage() {
  return `Uso: node scripts/localize-question-images.mjs [opções]

Opções:
  --source PATH       Raiz public/ do yunger7/enem-api (padrão: ${DEFAULT_SOURCE})
  --database PATH     SQLite a atualizar (padrão: ${DEFAULT_DATABASE})
  --media-root PATH   Destino public/media (padrão: ${DEFAULT_MEDIA_ROOT})
  --dry-run           Mostra o plano sem copiar nem gravar
  --verbose           Loga progresso
  --help              Esta ajuda
`;
}

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE,
    database: DEFAULT_DATABASE,
    mediaRoot: DEFAULT_MEDIA_ROOT,
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--verbose') options.verbose = true;
    else {
      const [flag, inline] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, null];
      const value = inline ?? argv[++index];
      if (!value) throw new LocalizeError(`${flag} exige um valor.`);
      if (flag === '--source') options.source = resolve(process.cwd(), value);
      else if (flag === '--database') options.database = resolve(process.cwd(), value);
      else if (flag === '--media-root') options.mediaRoot = resolve(process.cwd(), value);
      else throw new LocalizeError(`Opção desconhecida: ${flag}`);
    }
  }

  return options;
}

function log(verbose, ...messages) {
  if (verbose) {
    console.error('[localize-images]', ...messages);
  }
}

function isImageFile(name) {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return false;
  return IMAGE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

async function walkImages(root) {
  const found = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile() || !isImageFile(entry.name)) {
        continue;
      }
      const rel = relative(root, full).split('\\').join('/');
      // Only question media: <year>/questions/...
      if (!/^\d{4}\/questions\//.test(rel)) {
        continue;
      }
      found.push({ rel, full });
    }
  }

  await walk(root);
  found.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  return found;
}

function assetKeyFor(rel) {
  // Only year-scoped question media lives under media/.
  if (/^\d{4}\//.test(rel)) {
    return `asset:media/${rel}`;
  }
  return `asset:${rel}`;
}

function remoteUrlFor(rel) {
  return `${REMOTE_PREFIX}${rel}`;
}

function openDatabase(databasePath) {
  try {
    return new DatabaseSync(databasePath);
  } catch (error) {
    throw new LocalizeError(`Não foi possível abrir ${databasePath}: ${error.message}`, {
      cause: error,
    });
  }
}

function buildRewriteSql(pairs) {
  // pairs: [{ remote, asset }] — generated for debugging/tests; runtime uses bound updates.
  const statements = ['BEGIN;'];
  for (const { remote, asset } of pairs) {
    statements.push(
      `UPDATE question_files SET url = replace(url, '${remote.replaceAll("'", "''")}', '${asset.replaceAll("'", "''")}');`,
    );
    statements.push(
      `UPDATE alternatives SET file_url = replace(file_url, '${remote.replaceAll("'", "''")}', '${asset.replaceAll("'", "''")}');`,
    );
    statements.push(
      `UPDATE questions SET context = replace(context, '${remote.replaceAll("'", "''")}', '${asset.replaceAll("'", "''")}');`,
    );
  }
  statements.push('COMMIT;');
  return statements.join('\n');
}

function rewriteDatabaseReferences(databasePath, pairs) {
  const db = openDatabase(databasePath);
  try {
    db.exec('BEGIN');
    const updateFiles = db.prepare(
      'UPDATE question_files SET url = replace(url, ?, ?) WHERE instr(url, ?) > 0',
    );
    const updateAlts = db.prepare(
      'UPDATE alternatives SET file_url = replace(file_url, ?, ?) WHERE file_url IS NOT NULL AND instr(file_url, ?) > 0',
    );
    const updateContext = db.prepare(
      'UPDATE questions SET context = replace(context, ?, ?) WHERE context IS NOT NULL AND instr(context, ?) > 0',
    );
    for (const { remote, asset } of pairs) {
      updateFiles.run(remote, asset, remote);
      updateAlts.run(remote, asset, remote);
      updateContext.run(remote, asset, remote);
    }
    // Catch-all only for year-scoped media paths (avoids minting asset:media/broken-image.svg).
    updateFiles.run(REMOTE_PREFIX, 'asset:media/', REMOTE_PREFIX);
    updateAlts.run(REMOTE_PREFIX, 'asset:media/', REMOTE_PREFIX);
    // Context may reference non-media paths (broken-image.svg); leave those for explicit pairs.
    updateContext.run(REMOTE_PREFIX, 'asset:media/', REMOTE_PREFIX);
    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback failure
    }
    throw new LocalizeError(`Falha ao reescrever URLs no banco: ${error.message}`, { cause: error });
  } finally {
    db.close();
  }
}

function countReferences(databasePath) {
  const db = openDatabase(databasePath);
  try {
    const remote = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM question_files WHERE url LIKE 'https://enem.dev/%') +
           (SELECT COUNT(*) FROM alternatives WHERE file_url LIKE 'https://enem.dev/%') +
           (SELECT COUNT(*) FROM questions WHERE context LIKE '%https://enem.dev/%') AS n`,
      )
      .get();
    const assets = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM question_files WHERE url LIKE 'asset:%') +
           (SELECT COUNT(*) FROM alternatives WHERE file_url LIKE 'asset:%') AS n`,
      )
      .get();
    return { remote: Number(remote?.n ?? 0), assets: Number(assets?.n ?? 0) };
  } finally {
    db.close();
  }
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const images = await walkImages(options.source);
  if (images.length === 0) {
    throw new LocalizeError(`Nenhuma imagem de questão encontrada em ${options.source}`);
  }

  let copied = 0;
  let skipped = 0;
  for (const image of images) {
    const dest = join(options.mediaRoot, image.rel);
    if (options.dryRun) {
      log(options.verbose, `COPIAR ${image.rel}`);
      copied += 1;
      continue;
    }
    await mkdir(dirname(dest), { recursive: true });
    if (await fileExists(dest)) {
      skipped += 1;
      continue;
    }
    await copyFile(image.full, dest);
    copied += 1;
    if (options.verbose && copied % 200 === 0) {
      log(true, `copiadas ${copied} imagens…`);
    }
  }

  // Distinct remote→asset pairs for precise rewrite (also covers markdown).
  const pairs = images.map((image) => ({
    remote: remoteUrlFor(image.rel),
    asset: assetKeyFor(image.rel),
  }));

  if (!options.dryRun) {
    rewriteDatabaseReferences(options.database, pairs);
  }

  const counts = options.dryRun ? { remote: -1, assets: -1 } : countReferences(options.database);

  console.log(
    `Imagens localizadas: ${images.length} arquivos; copiadas ${copied}; já existiam ${skipped}; dryRun=${options.dryRun}`,
  );
  if (!options.dryRun) {
    console.log(`Referências remotas restantes (enem.dev): ${counts.remote}`);
    console.log(`Referências asset: em files/alternatives: ${counts.assets}`);
  }
  console.log(`Media root: ${options.mediaRoot}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath && pathToFileURL(invokedPath).href === pathToFileURL(modulePath).href) {
  main().catch((error) => {
    console.error(`[localize-images] ${error.message}`);
    process.exitCode = 1;
  });
}

export { assetKeyFor, buildRewriteSql, isImageFile, remoteUrlFor, walkImages };
