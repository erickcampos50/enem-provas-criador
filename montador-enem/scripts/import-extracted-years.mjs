#!/usr/bin/env node

/**
 * Incrementally import extracted ENEM years into the canonical enem.sqlite.
 *
 * Never rebuilds the database: only inserts exams/questions/alternatives/
 * files/source_documents for the requested years and refreshes FTS rows.
 * Existing years and INEP enrichment tables are left untouched.
 *
 * Usage:
 *   node scripts/import-extracted-years.mjs --years 2024,2025 \
 *     --extract-root ../.cache/enem-extract --media-root public/media
 */

import { cp, mkdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const projectRoot = resolve(appRoot, '..');

const DEFAULT_DATABASE = resolve(projectRoot, 'enem.sqlite');
const DEFAULT_EXTRACT_ROOT = resolve(projectRoot, '.cache', 'enem-extract');
const DEFAULT_MEDIA_ROOT = resolve(appRoot, 'public', 'media');

class ImportError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'ImportError';
  }
}

function usage() {
  return `Uso: node scripts/import-extracted-years.mjs [opções]

Opções:
  --years LISTA       Anos separados por vírgula (padrão: 2024,2025)
  --extract-root DIR  Raiz com <ano>/exam.json e questions.json (padrão: ${DEFAULT_EXTRACT_ROOT})
  --database PATH     SQLite canônico (padrão: ${DEFAULT_DATABASE})
  --media-root DIR    Destino public/media (padrão: ${DEFAULT_MEDIA_ROOT})
  --dry-run           Valida e mostra contagens sem gravar
  --verbose           Loga progresso
  --help              Esta ajuda
`;
}

function parseArgs(argv) {
  const options = {
    years: [2024, 2025],
    extractRoot: DEFAULT_EXTRACT_ROOT,
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
      if (!value) throw new ImportError(`${flag} exige um valor.`);
      if (flag === '--years') {
        options.years = value
          .split(',')
          .map((part) => Number(part.trim()))
          .filter((year) => Number.isInteger(year) && year > 1998);
      } else if (flag === '--extract-root') options.extractRoot = resolve(process.cwd(), value);
      else if (flag === '--database') options.database = resolve(process.cwd(), value);
      else if (flag === '--media-root') options.mediaRoot = resolve(process.cwd(), value);
      else throw new ImportError(`Opção desconhecida: ${flag}`);
    }
  }
  return options;
}

function log(verbose, ...messages) {
  if (verbose) console.error('[import-years]', ...messages);
}

function openDatabase(path) {
  try {
    return new DatabaseSync(path);
  } catch (error) {
    throw new ImportError(`Não foi possível abrir ${path}: ${error.message}`, { cause: error });
  }
}

function questionKey(year, number, language) {
  return `${year}:${number}:${language ?? ''}`;
}

function normalizeLabel(value) {
  return String(value ?? '')
    .replace(/[\u00a0\u2007\u202f\u2009]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function assetKeyToRelative(key) {
  return String(key).replace(/^asset:/, '');
}

async function copyMediaForYear(year, questions, mediaRoot, extractRoot, dryRun) {
  let copied = 0;
  for (const question of questions) {
    for (const file of question.files ?? []) {
      const rel = assetKeyToRelative(file);
      const src = join(extractRoot, String(year), rel.replace(/^media\//, ''));
      // Extractor writes <extract>/<year>/questions/... while asset key is media/<year>/questions/...
      const srcAlt = join(extractRoot, String(year), rel.replace(/^media\/\d{4}\//, ''));
      const dest = join(mediaRoot, rel.replace(/^media\//, ''));
      let source = null;
      try {
        await readFile(src);
        source = src;
      } catch {
        try {
          await readFile(srcAlt);
          source = srcAlt;
        } catch {
          // try extractRoot/<year>/questions/...
          const src2 = join(extractRoot, String(year), `questions/${rel.split('/').slice(2).join('/')}`);
          try {
            await readFile(src2);
            source = src2;
          } catch {
            throw new ImportError(`Mídia ausente para ${file} (procurado em ${src})`);
          }
        }
      }
      if (dryRun) {
        copied += 1;
        continue;
      }
      await mkdir(dirname(dest), { recursive: true });
      await cp(source, dest);
      copied += 1;
    }
  }
  return copied;
}

function importYear(db, exam, questions, { verbose }) {
  const year = exam.year;
  const existing = db.prepare('SELECT 1 FROM exams WHERE year = ?').get(year);
  if (existing) {
    throw new ImportError(
      `Ano ${year} já existe no banco. Use dry-run/rollback manual ou remova o ano antes de reimportar.`,
    );
  }

  const nextQuestionIdRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM questions').get();
  const nextAltIdRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM alternatives').get();
  const nextFileIdRow = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS next FROM question_files').get();
  let nextQuestionId = Number(nextQuestionIdRow.next);
  let nextAltId = Number(nextAltIdRow.next);
  let nextFileId = Number(nextFileIdRow.next);

  const examPath = `${year}/details.json`;
  db.prepare(
    `INSERT INTO source_documents (path, kind, json_text) VALUES (?, 'exam', ?)`,
  ).run(examPath, JSON.stringify(exam));

  db.prepare(`INSERT INTO exams (year, title, source_path) VALUES (?, ?, ?)`).run(
    year,
    exam.title,
    examPath,
  );
  for (const discipline of exam.disciplines ?? []) {
    db.prepare(
      `INSERT OR IGNORE INTO exam_disciplines (year, value, label) VALUES (?, ?, ?)`,
    ).run(year, discipline.value, normalizeLabel(discipline.label));
  }
  for (const language of exam.languages ?? []) {
    db.prepare(
      `INSERT OR IGNORE INTO exam_languages (year, value, label) VALUES (?, ?, ?)`,
    ).run(year, language.value, normalizeLabel(language.label));
  }

  const idByNaturalKey = new Map();
  const insertQuestion = db.prepare(
    `INSERT INTO questions (
       id, year, number, language, title, discipline, context,
       alternatives_introduction, correct_alternative, source_path
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertAlt = db.prepare(
    `INSERT INTO alternatives (id, question_id, letter, text, file_url, is_correct)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertFile = db.prepare(
    `INSERT INTO question_files (id, question_id, position, url) VALUES (?, ?, ?, ?)`,
  );
  const insertSource = db.prepare(
    `INSERT INTO source_documents (path, kind, json_text) VALUES (?, 'question', ?)`,
  );
  const insertExamQuestion = db.prepare(
    `INSERT INTO exam_questions (year, position, number, language, title, discipline, question_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  for (const question of questions) {
    const sourcePath = `${question.year}/questions/${question.index}${
      question.language ? `-${question.language}` : ''
    }/details.json`;
    insertSource.run(sourcePath, JSON.stringify(question));
    insertQuestion.run(
      nextQuestionId,
      question.year,
      question.index,
      question.language,
      question.title,
      question.discipline,
      question.context,
      question.alternativesIntroduction,
      question.correctAlternative,
      sourcePath,
    );
    idByNaturalKey.set(questionKey(question.year, question.index, question.language), nextQuestionId);

    for (const alternative of question.alternatives ?? []) {
      insertAlt.run(
        nextAltId,
        nextQuestionId,
        alternative.letter,
        alternative.text,
        alternative.file,
        alternative.isCorrect ? 1 : 0,
      );
      nextAltId += 1;
    }

    const files = question.files ?? [];
    for (const [position, file] of files.entries()) {
      insertFile.run(nextFileId, nextQuestionId, position, file);
      nextFileId += 1;
    }

    nextQuestionId += 1;
    log(verbose, `questão ${question.index}${question.language ? `-${question.language}` : ''} ok`);
  }

  // exam_questions order = exam.questions order
  for (const [position, summary] of (exam.questions ?? []).entries()) {
    const questionId = idByNaturalKey.get(
      questionKey(year, summary.index, summary.language),
    );
    insertExamQuestion.run(
      year,
      position,
      summary.index,
      summary.language,
      summary.title,
      summary.discipline,
      questionId ?? null,
    );
  }

  return {
    questions: questions.length,
    alternatives: nextAltId - Number(nextAltIdRow.next),
    files: nextFileId - Number(nextFileIdRow.next),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const db = openDatabase(options.database);
  try {
    db.exec('BEGIN');
    let totalQuestions = 0;
    let totalFilesCopied = 0;

    for (const year of options.years) {
      const examPath = join(options.extractRoot, String(year), 'exam.json');
      const questionsPath = join(options.extractRoot, String(year), 'questions.json');
      const exam = JSON.parse(await readFile(examPath, 'utf8'));
      const questions = JSON.parse(await readFile(questionsPath, 'utf8'));
      if (exam.year !== year) {
        throw new ImportError(`exam.json year=${exam.year} diverge de ${year}`);
      }

      totalFilesCopied += await copyMediaForYear(
        year,
        questions,
        options.mediaRoot,
        join(options.extractRoot, String(year)),
        options.dryRun,
      );

      if (options.dryRun) {
        log(options.verbose, `dry-run ${year}: ${questions.length} questões`);
        totalQuestions += questions.length;
        continue;
      }

      const stats = importYear(db, exam, questions, options);
      totalQuestions += stats.questions;
      log(options.verbose, `importado ${year}:`, stats);
    }

    if (!options.dryRun) {
      const integrity = db.prepare('PRAGMA integrity_check').get();
      const integrityValue = Object.values(integrity ?? {})[0];
      if (integrityValue !== 'ok') {
        throw new ImportError(`PRAGMA integrity_check falhou: ${integrityValue}`);
      }
      db.exec('COMMIT');
    } else {
      db.exec('ROLLBACK');
    }

    console.log(
      `Importação ${options.dryRun ? '(dry-run) ' : ''}concluída: anos=${options.years.join(',')} questões=${totalQuestions} mídias copiadas=${totalFilesCopied}`,
    );
    console.log(`Banco: ${options.database}`);
    console.log(`Media root: ${options.mediaRoot}`);
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    db.close();
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath && pathToFileURL(invokedPath).href === pathToFileURL(modulePath).href) {
  main().catch((error) => {
    console.error(`[import-years] ${error.message}`);
    process.exitCode = 1;
  });
}

export { importYear, questionKey };
