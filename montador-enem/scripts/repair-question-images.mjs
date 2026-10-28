#!/usr/bin/env node

/**
 * Re-sync question_files + media for years that are already in the database.
 *
 * The first PDF extraction attached every image on a page to every question
 * whose heading appeared on that page, so a single figure could be listed on
 * up to five questions. The extractor now assigns each image to the question
 * that owns it (column-aware reading order) and this script applies that
 * corrected mapping to an existing database, without changing question ids,
 * alternatives or INEP enrichment.
 *
 * Usage:
 *   node scripts/repair-question-images.mjs --years 2024,2025 \
 *     --extract-root ../.cache/enem-extract --dry-run --verbose
 */

import { cp, mkdir, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const projectRoot = resolve(appRoot, '..');

const DEFAULT_DATABASE = resolve(projectRoot, 'enem.sqlite');
const DEFAULT_EXTRACT_ROOT = resolve(projectRoot, '.cache', 'enem-extract');
const DEFAULT_MEDIA_ROOT = resolve(appRoot, 'public', 'media');

class RepairError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'RepairError';
  }
}

function usage() {
  return `Uso: node scripts/repair-question-images.mjs [opções]

Opções:
  --years LISTA       Anos separados por vírgula (padrão: 2024,2025)
  --extract-root DIR  Raiz com <ano>/questions.json (padrão: ${DEFAULT_EXTRACT_ROOT})
  --database PATH     SQLite canônico (padrão: ${DEFAULT_DATABASE})
  --media-root DIR    Destino public/media (padrão: ${DEFAULT_MEDIA_ROOT})
  --prune-media       Remove arquivos de imagem não referenciados
  --dry-run           Mostra as mudanças sem gravar
  --verbose           Loga cada questão alterada
  --help              Esta ajuda
`;
}

function parseArgs(argv) {
  const options = {
    years: [2024, 2025],
    extractRoot: DEFAULT_EXTRACT_ROOT,
    database: DEFAULT_DATABASE,
    mediaRoot: DEFAULT_MEDIA_ROOT,
    pruneMedia: false,
    dryRun: false,
    verbose: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--prune-media') options.pruneMedia = true;
    else if (arg === '--verbose') options.verbose = true;
    else {
      const [flag, inline] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, null];
      const value = inline ?? argv[++index];
      if (!value) throw new RepairError(`${flag} exige um valor.`);
      if (flag === '--years') {
        options.years = value
          .split(',')
          .map((part) => Number(part.trim()))
          .filter((year) => Number.isInteger(year) && year > 1998);
      } else if (flag === '--extract-root') options.extractRoot = resolve(process.cwd(), value);
      else if (flag === '--database') options.database = resolve(process.cwd(), value);
      else if (flag === '--media-root') options.mediaRoot = resolve(process.cwd(), value);
      else throw new RepairError(`Opção desconhecida: ${flag}`);
    }
  }
  return options;
}

function questionKey(year, number, language) {
  return `${year}:${number}:${language ?? ''}`;
}

function assetKeyToRelative(key) {
  return String(key).replace(/^asset:/, '');
}

async function findExtractedMedia(extractRoot, year, file) {
  const rel = assetKeyToRelative(file);
  const candidates = [
    // The extractor writes <extract-root>/<year>/<year>/questions/...
    join(extractRoot, String(year), rel.replace(/^media\//, '')),
    // Older layout: <extract-root>/<year>/questions/...
    join(extractRoot, String(year), rel.replace(/^media\/\d{4}\//, '')),
    join(extractRoot, String(year), 'questions', ...rel.split('/').slice(3)),
  ];
  for (const candidate of candidates) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  throw new RepairError(`Mídia ausente para ${file} (procurado em ${candidates[0]})`);
}

async function loadYearFiles(options, year) {
  const questionsPath = join(options.extractRoot, String(year), 'questions.json');
  const questions = JSON.parse(await readFile(questionsPath, 'utf8'));
  const filesByKey = new Map();
  for (const question of questions) {
    filesByKey.set(
      questionKey(year, question.index, question.language),
      Array.isArray(question.files) ? question.files : [],
    );
  }
  return filesByKey;
}

function listCurrentFiles(db, questionId) {
  return db
    .prepare('SELECT position, url FROM question_files WHERE question_id = ? ORDER BY position, id')
    .all(questionId)
    .map((row) => row.url);
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function replaceFiles(db, questionId, files) {
  db.prepare('DELETE FROM question_files WHERE question_id = ?').run(questionId);
  const insert = db.prepare('INSERT INTO question_files (question_id, position, url) VALUES (?, ?, ?)');
  files.forEach((url, position) => insert.run(questionId, position, url));
}

function refreshSourceDocument(db, sourcePath, files) {
  const row = db.prepare('SELECT json_text FROM source_documents WHERE path = ?').get(sourcePath);
  if (!row) return;
  let parsed;
  try {
    parsed = JSON.parse(row.json_text);
  } catch {
    return;
  }
  parsed.files = files;
  db.prepare('UPDATE source_documents SET json_text = ? WHERE path = ?').run(
    JSON.stringify(parsed),
    sourcePath,
  );
}

async function copyMedia(options, year, files) {
  let copied = 0;
  for (const file of files) {
    const source = await findExtractedMedia(options.extractRoot, year, file);
    const dest = join(options.mediaRoot, assetKeyToRelative(file).replace(/^media\//, ''));
    if (options.dryRun) {
      copied += 1;
      continue;
    }
    await mkdir(dirname(dest), { recursive: true });
    await cp(source, dest);
    copied += 1;
  }
  return copied;
}

async function pruneQuestionFolders(options, year, folderFiles) {
  const questionsRoot = join(options.mediaRoot, String(year), 'questions');
  let pruned = 0;
  let folders;
  try {
    folders = await readdir(questionsRoot, { withFileTypes: true });
  } catch {
    return pruned;
  }
  for (const entry of folders) {
    if (!entry.isDirectory()) continue;
    const folder = entry.name;
    const keep = folderFiles.get(folder) ?? new Set();
    const folderPath = join(questionsRoot, folder);
    const files = await readdir(folderPath, { withFileTypes: true });
    let remaining = 0;
    for (const file of files) {
      if (!file.isFile()) {
        remaining += 1;
        continue;
      }
      if (keep.has(file.name)) {
        remaining += 1;
        continue;
      }
      if (!file.name.startsWith('img-')) {
        remaining += 1;
        continue;
      }
      if (!options.dryRun) await unlink(join(folderPath, file.name));
      pruned += 1;
    }
    if (remaining === 0 && !options.dryRun) {
      try {
        await rmdir(folderPath);
      } catch {
        // not empty or already removed
      }
    }
  }
  return pruned;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const db = new DatabaseSync(options.database);
  let totalChanged = 0;
  let totalAdded = 0;
  let totalRemoved = 0;
  let totalCopied = 0;
  let totalPruned = 0;

  try {
    if (!options.dryRun) db.exec('BEGIN');

    for (const year of options.years) {
      const filesByKey = await loadYearFiles(options, year);
      const rows = db
        .prepare('SELECT id, number, language, source_path FROM questions WHERE year = ? ORDER BY number, language')
        .all(year);
      const folderFiles = new Map();
      let changed = 0;
      let added = 0;
      let removed = 0;
      let copied = 0;

      for (const row of rows) {
        const key = questionKey(year, row.number, row.language);
        const desired = filesByKey.get(key);
        if (!desired) {
          throw new RepairError(`Questão ${key} não encontrada em ${year}/questions.json`);
        }
        folderFiles.set(
          row.language ? `${row.number}-${row.language}` : String(row.number),
          new Set(desired.map((url) => url.split('/').pop())),
        );

        const current = listCurrentFiles(db, row.id);
        if (arraysEqual(current, desired)) continue;

        changed += 1;
        const addedFiles = desired.filter((url) => !current.includes(url));
        const removedFiles = current.filter((url) => !desired.includes(url));
        added += addedFiles.length;
        removed += removedFiles.length;

        if (options.verbose) {
          console.error(
            `[repair-images] ${key}: ${current.length} → ${desired.length} imagem(ns)`,
          );
        }

        if (!options.dryRun) {
          replaceFiles(db, row.id, desired);
          refreshSourceDocument(db, row.source_path, desired);
        }
        copied += await copyMedia(options, year, desired);
      }

      const pruned = options.pruneMedia
        ? await pruneQuestionFolders(options, year, folderFiles)
        : 0;

      console.log(
        `${year}: questões alteradas=${changed} linhas +${added}/-${removed} mídias copiadas=${copied} arquivos removidos=${pruned}`,
      );
      totalChanged += changed;
      totalAdded += added;
      totalRemoved += removed;
      totalCopied += copied;
      totalPruned += pruned;
    }

    if (!options.dryRun) {
      const integrity = db.prepare('PRAGMA integrity_check').get();
      const integrityValue = Object.values(integrity ?? {})[0];
      if (integrityValue !== 'ok') {
        throw new RepairError(`PRAGMA integrity_check falhou: ${integrityValue}`);
      }
      db.exec('COMMIT');
    }
  } catch (error) {
    if (!options.dryRun) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // ignore
      }
    }
    throw error;
  } finally {
    db.close();
  }

  console.log(
    `Reparo ${options.dryRun ? '(dry-run) ' : ''}concluído: questões=${totalChanged} linhas +${totalAdded}/-${totalRemoved} mídias=${totalCopied} imagens órfãs=${totalPruned}`,
  );
  console.log(`Banco: ${options.database}`);
  console.log(`Media root: ${options.mediaRoot}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath && pathToFileURL(invokedPath).href === pathToFileURL(modulePath).href) {
  main().catch((error) => {
    console.error(`[repair-images] ${error.message}`);
    process.exitCode = 1;
  });
}
