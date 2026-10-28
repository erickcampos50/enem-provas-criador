#!/usr/bin/env node

/**
 * Re-sync question text (context, prompt and alternatives) for years that are
 * already in the database.
 *
 * The first PDF parser treated any stem line starting with "A " as option A
 * (e.g. "A cúpula pentagonal..."), losing part of the statement. It also
 * overwrote option A when the real alternatives appeared later, so affected
 * questions ended up with empty or truncated context. The extractor now only
 * accepts option A when B-E follow it in order.
 *
 * This script applies the corrected text to an existing database without
 * changing question ids, alternatives ids or INEP enrichment, and refreshes
 * the FTS index for the changed questions.
 *
 * Usage:
 *   node scripts/repair-question-text.mjs --years 2024,2025 \
 *     --extract-root ../.cache/enem-extract --dry-run --verbose
 */

import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const projectRoot = resolve(appRoot, '..');

const DEFAULT_DATABASE = resolve(projectRoot, 'enem.sqlite');
const DEFAULT_EXTRACT_ROOT = resolve(projectRoot, '.cache', 'enem-extract');

class RepairError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'RepairError';
  }
}

function usage() {
  return `Uso: node scripts/repair-question-text.mjs [opções]

Opções:
  --years LISTA       Anos separados por vírgula (padrão: 2024,2025)
  --extract-root DIR  Raiz com <ano>/questions.json (padrão: ${DEFAULT_EXTRACT_ROOT})
  --database PATH     SQLite canônico (padrão: ${DEFAULT_DATABASE})
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
      if (!value) throw new RepairError(`${flag} exige um valor.`);
      if (flag === '--years') {
        options.years = value
          .split(',')
          .map((part) => Number(part.trim()))
          .filter((year) => Number.isInteger(year) && year > 1998);
      } else if (flag === '--extract-root') options.extractRoot = resolve(process.cwd(), value);
      else if (flag === '--database') options.database = resolve(process.cwd(), value);
      else throw new RepairError(`Opção desconhecida: ${flag}`);
    }
  }
  return options;
}

function questionKey(year, number, language) {
  return `${year}:${number}:${language ?? ''}`;
}

function textOrNull(value) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.trim() ? text : null;
}

async function loadYearQuestions(options, year) {
  const questionsPath = join(options.extractRoot, String(year), 'questions.json');
  const questions = JSON.parse(await readFile(questionsPath, 'utf8'));
  const byKey = new Map();
  for (const question of questions) {
    byKey.set(questionKey(year, question.index, question.language), question);
  }
  return byKey;
}

function refreshSearchIndex(db, questionId, context, intro, alternatives) {
  db.prepare(
    "DELETE FROM search_index WHERE question_id = ? AND field IN ('context', 'alternativesIntroduction', 'alternatives.text')",
  ).run(questionId);
  const insert = db.prepare(
    'INSERT INTO search_index (question_id, field, alternative_id, content) VALUES (?, ?, ?, ?)',
  );
  if (context) insert.run(questionId, 'context', null, context);
  if (intro) insert.run(questionId, 'alternativesIntroduction', null, intro);
  for (const alternative of alternatives) {
    if (alternative.text) {
      insert.run(questionId, 'alternatives.text', alternative.id, alternative.text);
    }
  }
}

function refreshSourceDocument(db, sourcePath, payload) {
  const row = db.prepare('SELECT json_text FROM source_documents WHERE path = ?').get(sourcePath);
  if (!row) return;
  let parsed;
  try {
    parsed = JSON.parse(row.json_text);
  } catch {
    return;
  }
  parsed.context = textOrNull(payload.context);
  parsed.alternativesIntroduction = textOrNull(payload.alternativesIntroduction);
  const desiredByLetter = new Map(
    (payload.alternatives ?? []).map((alternative) => [alternative.letter, alternative]),
  );
  parsed.alternatives = (parsed.alternatives ?? []).map((alternative) => {
    const desired = desiredByLetter.get(alternative.letter);
    return desired ? { ...alternative, text: textOrNull(desired.text) } : alternative;
  });
  db.prepare('UPDATE source_documents SET json_text = ? WHERE path = ?').run(
    JSON.stringify(parsed),
    sourcePath,
  );
}

function repairQuestion(db, row, payload, options) {
  const context = textOrNull(payload.context);
  const intro = textOrNull(payload.alternativesIntroduction);
  const desiredByLetter = new Map(
    (payload.alternatives ?? []).map((alternative) => [alternative.letter, alternative]),
  );

  const currentAlternatives = db
    .prepare('SELECT id, letter, text FROM alternatives WHERE question_id = ? ORDER BY letter')
    .all(row.id);
  const updatedAlternatives = currentAlternatives.map((alternative) => {
    const desired = desiredByLetter.get(alternative.letter);
    const text = desired ? textOrNull(desired.text) : textOrNull(alternative.text);
    return { id: alternative.id, letter: alternative.letter, text };
  });

  const contextChanged = textOrNull(row.context) !== context;
  const introChanged = textOrNull(row.alternatives_introduction) !== intro;
  const alternativesChanged = currentAlternatives.some((alternative, index) => {
    return textOrNull(alternative.text) !== updatedAlternatives[index].text;
  });

  if (!contextChanged && !introChanged && !alternativesChanged) return false;

  if (!options.dryRun) {
    if (contextChanged || introChanged) {
      db.prepare('UPDATE questions SET context = ?, alternatives_introduction = ? WHERE id = ?').run(
        context,
        intro,
        row.id,
      );
    }
    const updateAlternative = db.prepare('UPDATE alternatives SET text = ? WHERE id = ?');
    for (const alternative of updatedAlternatives) {
      if (textOrNull(currentAlternatives.find((item) => item.id === alternative.id)?.text) !== alternative.text) {
        updateAlternative.run(alternative.text, alternative.id);
      }
    }
    refreshSearchIndex(db, row.id, context, intro, updatedAlternatives);
    refreshSourceDocument(db, row.source_path, payload);
  }

  if (options.verbose) {
    console.error(`[repair-text] ${questionKey(row.year, row.number, row.language)}: texto atualizado`);
  }
  return true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const db = new DatabaseSync(options.database);
  let totalChanged = 0;

  try {
    if (!options.dryRun) db.exec('BEGIN');

    for (const year of options.years) {
      const questionsByKey = await loadYearQuestions(options, year);
      const rows = db
        .prepare(
          'SELECT id, year, number, language, context, alternatives_introduction, source_path FROM questions WHERE year = ? ORDER BY number, language',
        )
        .all(year);
      let changed = 0;

      for (const row of rows) {
        const key = questionKey(year, row.number, row.language);
        const payload = questionsByKey.get(key);
        if (!payload) throw new RepairError(`Questão ${key} não encontrada em ${year}/questions.json`);
        if (repairQuestion(db, row, payload, options)) changed += 1;
      }

      console.log(`${year}: questões com texto atualizado=${changed}`);
      totalChanged += changed;
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
    `Reparo de texto ${options.dryRun ? '(dry-run) ' : ''}concluído: questões=${totalChanged}`,
  );
  console.log(`Banco: ${options.database}`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath && pathToFileURL(invokedPath).href === pathToFileURL(modulePath).href) {
  main().catch((error) => {
    console.error(`[repair-text] ${error.message}`);
    process.exitCode = 1;
  });
}
