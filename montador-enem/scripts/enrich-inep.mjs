#!/usr/bin/env node

import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  AREA_TO_DISCIPLINE,
  buildDisplayTitle,
  languageCodeForQuestion,
  matchQuestionsToItems,
  parseDelimited,
  sqlValue,
} from './inep-enrichment-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..', '..');
const DEFAULT_DATABASE = resolve(projectRoot, 'enem.sqlite');
const DEFAULT_CACHE_DIR = resolve(projectRoot, '.cache', 'enem-microdados');
const DEFAULT_OFFSET_RANGE = 200;
const DEFAULT_MIN_COVERED = 15;
const DEFAULT_MIN_PRECISION = 0.85;

class EnrichmentError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'EnrichmentError';
  }
}

function usage() {
  return `Uso: node scripts/enrich-inep.mjs [opções]

Opções:
  --database PATH        SQLite a enriquecer (padrão: ${DEFAULT_DATABASE})
  --years LISTA          Anos separados por vírgula; sem a opção, usa todos do banco
  --cache-dir PATH       Cache dos ITENS_PROVA_AAAA.csv (padrão: ${DEFAULT_CACHE_DIR})
  --offset-range N       Testa deslocamentos -N..N entre índice e CO_POSICAO (padrão: ${DEFAULT_OFFSET_RANGE})
  --min-covered N        Cobertura mínima para aceitar um caderno (padrão: ${DEFAULT_MIN_COVERED})
  --min-precision N      Precisão mínima do casamento, entre 0 e 1 (padrão: ${DEFAULT_MIN_PRECISION})
  --keep-zip             Mantém o ZIP oficial após extrair ITENS_PROVA
  --dry-run              Faz download/casamento e mostra relatório sem gravar no SQLite
  --no-titles            Grava só metadados oficiais, sem título pedagógico heurístico
  --verbose              Exibe detalhes de download e casamento
  --help                 Exibe esta ajuda
`;
}

function parseInteger(value, flag, { min = 0 } = {}) {
  if (!/^\d+$/.test(String(value ?? ''))) {
    throw new EnrichmentError(`${flag} deve ser um inteiro.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min) {
    throw new EnrichmentError(`${flag} fora do intervalo permitido.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    database: DEFAULT_DATABASE,
    years: null,
    cacheDir: DEFAULT_CACHE_DIR,
    offsetRange: DEFAULT_OFFSET_RANGE,
    minCovered: DEFAULT_MIN_COVERED,
    minPrecision: DEFAULT_MIN_PRECISION,
    keepZip: false,
    dryRun: false,
    titles: true,
    verbose: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--keep-zip') options.keepZip = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--no-titles') options.titles = false;
    else if (arg === '--verbose') options.verbose = true;
    else {
      const [flag, inline] = arg.includes('=') ? arg.split(/=(.*)/s, 2) : [arg, null];
      const value = inline ?? argv[++index];
      if (!value) throw new EnrichmentError(`${flag} exige um valor.`);
      if (flag === '--database') options.database = resolve(process.cwd(), value);
      else if (flag === '--cache-dir') options.cacheDir = resolve(process.cwd(), value);
      else if (flag === '--offset-range') options.offsetRange = parseInteger(value, flag);
      else if (flag === '--min-covered') options.minCovered = parseInteger(value, flag, { min: 1 });
      else if (flag === '--min-precision') {
        const precision = Number(value);
        if (!Number.isFinite(precision) || precision <= 0 || precision > 1) {
          throw new EnrichmentError('--min-precision deve estar entre 0 e 1.');
        }
        options.minPrecision = precision;
      } else if (flag === '--years') {
        const years = value.split(',').map((part) => parseInteger(part.trim(), '--years', { min: 1998 }));
        options.years = [...new Set(years)].sort((a, b) => a - b);
      } else {
        throw new EnrichmentError(`Opção desconhecida: ${flag}`);
      }
    }
  }

  return options;
}

function log(options, ...messages) {
  if (options.verbose) console.error('[enrich-inep]', ...messages);
}

function runProcess(command, args, { input, allowFailure = false } = {}) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      rejectProcess(new EnrichmentError(`Não foi possível executar ${command}: ${error.message}`, { cause: error }));
    });
    child.on('close', (code) => {
      if (code !== 0 && !allowFailure) {
        rejectProcess(new EnrichmentError(`${command} terminou com código ${code}: ${stderr.trim()}`));
      } else {
        resolveProcess({ code, stdout, stderr });
      }
    });
    child.stdin.end(input ?? '');
  });
}

async function runSqlite(databasePath, sql, { json = false } = {}) {
  const args = ['-batch'];
  if (json) args.push('-json');
  args.push(databasePath, sql);
  const result = await runProcess('sqlite3', args);
  if (!json) return result.stdout;
  const body = result.stdout.trim();
  if (!body) return [];
  try {
    return JSON.parse(body);
  } catch (error) {
    throw new EnrichmentError(`sqlite3 não retornou JSON válido: ${error.message}`, { cause: error });
  }
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function downloadFile(url, destination, options) {
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  log(options, `Baixando ${url}`);
  const response = await fetch(url, {
    headers: { 'user-agent': 'enem-criador-inep-enrichment/1.0' },
  });
  if (!response.ok || !response.body) {
    throw new EnrichmentError(`HTTP ${response.status} ao baixar ${url}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  await rename(temporary, destination);
}

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function extractItemsCsv(zipPath, csvPath, year) {
  await mkdir(dirname(csvPath), { recursive: true });
  if (process.platform === 'win32') {
    const script = [
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `$zip=[System.IO.Compression.ZipFile]::OpenRead(${psQuote(zipPath)})`,
      `$entry=$zip.Entries | Where-Object { $_.FullName -match 'ITENS_PROVA_${year}\\.csv$' } | Select-Object -First 1`,
      'if ($null -eq $entry) { $zip.Dispose(); exit 42 }',
      `[System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, ${psQuote(csvPath)}, $true)`,
      '$zip.Dispose()',
    ].join('; ');
    const result = await runProcess('powershell.exe', ['-NoProfile', '-Command', script], { allowFailure: true });
    if (result.code === 42) throw new EnrichmentError(`ITENS_PROVA_${year}.csv não encontrado no ZIP oficial.`);
    if (result.code !== 0) throw new EnrichmentError(`Falha ao extrair ITENS_PROVA_${year}.csv: ${result.stderr.trim()}`);
    return;
  }

  const listing = await runProcess('unzip', ['-Z1', zipPath]);
  const entry = listing.stdout.split(/\r?\n/).find((line) => new RegExp(`ITENS_PROVA_${year}\\.csv$`, 'i').test(line));
  if (!entry) throw new EnrichmentError(`ITENS_PROVA_${year}.csv não encontrado no ZIP oficial.`);
  const extracted = await runProcess('unzip', ['-p', zipPath, entry]);
  await writeFile(csvPath, extracted.stdout, 'latin1');
}

async function loadOfficialItems(year, options) {
  const csvPath = join(options.cacheDir, `ITENS_PROVA_${year}.csv`);
  if (!await fileExists(csvPath)) {
    const zipPath = join(options.cacheDir, `microdados_enem_${year}.zip`);
    if (!await fileExists(zipPath)) {
      await downloadFile(
        `https://download.inep.gov.br/microdados/microdados_enem_${year}.zip`,
        zipPath,
        options,
      );
    }
    log(options, `Extraindo ITENS_PROVA_${year}.csv`);
    await extractItemsCsv(zipPath, csvPath, year);
    if (!options.keepZip) await rm(zipPath, { force: true });
  }

  const buffer = await readFile(csvPath);
  const text = buffer.toString('latin1');
  const rows = parseDelimited(text);
  if (!rows.length || !('CO_POSICAO' in rows[0]) || !('TX_GABARITO' in rows[0])) {
    throw new EnrichmentError(`ITENS_PROVA_${year}.csv não contém as colunas esperadas.`);
  }
  return rows;
}

const ENRICHMENT_SCHEMA = `
CREATE TABLE IF NOT EXISTS question_inep_metadata (
  question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  item_code INTEGER NOT NULL,
  area TEXT NOT NULL CHECK (area IN ('LC', 'CH', 'CN', 'MT')),
  skill_code INTEGER,
  exam_code INTEGER NOT NULL,
  position INTEGER NOT NULL,
  book_color TEXT,
  language_code INTEGER,
  item_abandoned INTEGER NOT NULL DEFAULT 0 CHECK (item_abandoned IN (0, 1)),
  abandon_reason TEXT,
  item_adapted INTEGER NOT NULL DEFAULT 0 CHECK (item_adapted IN (0, 1)),
  tri_a REAL,
  tri_b REAL,
  tri_c REAL,
  match_method TEXT NOT NULL,
  match_score REAL NOT NULL CHECK (match_score >= 0 AND match_score <= 1),
  position_offset INTEGER NOT NULL DEFAULT 0,
  source_year INTEGER NOT NULL,
  source_url TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS question_inep_area_skill
  ON question_inep_metadata(area, skill_code);
CREATE INDEX IF NOT EXISTS question_inep_exam_position
  ON question_inep_metadata(exam_code, position);

CREATE TABLE IF NOT EXISTS question_enrichment (
  question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
  subject TEXT,
  topic TEXT,
  subtopic TEXT,
  display_title TEXT NOT NULL,
  source TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS question_enrichment_subject_topic
  ON question_enrichment(subject, topic);
`;

function numberOrNull(value) {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function integerOrNull(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}

function metadataInsert(question, match, year) {
  const item = match.item;
  return `INSERT OR REPLACE INTO question_inep_metadata (
    question_id, item_code, area, skill_code, exam_code, position, book_color,
    language_code, item_abandoned, abandon_reason, item_adapted,
    tri_a, tri_b, tri_c, match_method, match_score, position_offset,
    source_year, source_url
  ) VALUES (
    ${sqlValue(question.id)},
    ${sqlValue(integerOrNull(item.CO_ITEM))},
    ${sqlValue(match.area)},
    ${sqlValue(integerOrNull(item.CO_HABILIDADE))},
    ${sqlValue(integerOrNull(item.CO_PROVA))},
    ${sqlValue(integerOrNull(item.CO_POSICAO))},
    ${sqlValue(String(item.TX_COR ?? '').trim() || null)},
    ${sqlValue(integerOrNull(item.TP_LINGUA))},
    ${sqlValue(integerOrNull(item.IN_ITEM_ABAN) ?? 0)},
    ${sqlValue(String(item.TX_MOTIVO_ABAN ?? '').trim() || null)},
    ${sqlValue(integerOrNull(item.IN_ITEM_ADAPTADO) ?? 0)},
    ${sqlValue(numberOrNull(item.NU_PARAM_A))},
    ${sqlValue(numberOrNull(item.NU_PARAM_B))},
    ${sqlValue(numberOrNull(item.NU_PARAM_C))},
    'gabarito+posicao',
    ${sqlValue(match.precision)},
    ${sqlValue(match.offset)},
    ${sqlValue(year)},
    ${sqlValue(`https://download.inep.gov.br/microdados/microdados_enem_${year}.zip`)}
  );`;
}

function enrichmentInsert(question, match) {
  const generated = buildDisplayTitle(question, match.area);
  return {
    ...generated,
    sql: `INSERT INTO question_enrichment (
      question_id, subject, topic, subtopic, display_title, source, generated_at
    ) VALUES (
      ${sqlValue(question.id)},
      ${sqlValue(generated.subject)},
      ${sqlValue(generated.topic)},
      NULL,
      ${sqlValue(generated.displayTitle)},
      'heuristic-v1+inep-area',
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(question_id) DO UPDATE SET
      subject=excluded.subject,
      topic=excluded.topic,
      subtopic=excluded.subtopic,
      display_title=excluded.display_title,
      source=excluded.source,
      generated_at=CURRENT_TIMESTAMP
    WHERE question_enrichment.source LIKE 'heuristic%';`,
  };
}

async function questionsForYear(database, year) {
  return runSqlite(
    database,
    `SELECT id, year, number, language, title, discipline, context,
            alternatives_introduction, correct_alternative
       FROM questions
      WHERE year = ${Number(year)}
      ORDER BY number, ifnull(language, ''), id;`,
    { json: true },
  );
}

function languagePools(questions) {
  const pools = new Map();
  for (const question of questions) {
    const code = languageCodeForQuestion(question.language);
    if (!pools.has(code)) pools.set(code, []);
    pools.get(code).push({
      ...question,
      id: Number(question.id),
      year: Number(question.year),
      number: Number(question.number),
    });
  }
  return pools;
}

async function processYear(database, year, options) {
  const [questions, items] = await Promise.all([
    questionsForYear(database, year),
    loadOfficialItems(year, options),
  ]);
  if (!questions.length) return { year, total: 0, mapped: 0, mismatchedDisciplines: 0, samples: [] };

  const assignments = [];
  const unresolved = [];
  for (const [, pool] of languagePools(questions)) {
    const smallLanguagePool = pool.length <= 10;
    const result = matchQuestionsToItems(pool, items, {
      minCovered: smallLanguagePool ? Math.min(3, pool.length) : options.minCovered,
      minPrecision: options.minPrecision,
      offsetRange: options.offsetRange,
    });
    for (const [number, match] of result.assigned) {
      const question = pool.find((candidate) => candidate.number === number);
      if (question) assignments.push({ question, match });
    }
    unresolved.push(...result.unresolved);
  }

  let mismatchedDisciplines = 0;
  const samples = [];
  const statements = ['BEGIN;', ENRICHMENT_SCHEMA];
  statements.push(
    `DELETE FROM search_index
      WHERE field IN ('display_title', 'subject', 'topic')
        AND question_id IN (SELECT id FROM questions WHERE year = ${Number(year)});`,
    `DELETE FROM question_inep_metadata
      WHERE question_id IN (SELECT id FROM questions WHERE year = ${Number(year)});`,
    `DELETE FROM question_enrichment
      WHERE source LIKE 'heuristic%'
        AND question_id IN (SELECT id FROM questions WHERE year = ${Number(year)});`,
  );

  for (const { question, match } of assignments) {
    const officialDiscipline = AREA_TO_DISCIPLINE[match.area];
    if (question.discipline !== officialDiscipline) mismatchedDisciplines += 1;
    statements.push(metadataInsert(question, match, year));

    let generated = null;
    if (options.titles) {
      generated = enrichmentInsert(question, match);
      statements.push(generated.sql);
      statements.push(
        `INSERT INTO search_index(question_id, field, alternative_id, content)
         VALUES (${sqlValue(question.id)}, 'display_title', NULL, ${sqlValue(generated.displayTitle)});`,
        `INSERT INTO search_index(question_id, field, alternative_id, content)
         VALUES (${sqlValue(question.id)}, 'subject', NULL, ${sqlValue(generated.subject)});`,
        `INSERT INTO search_index(question_id, field, alternative_id, content)
         VALUES (${sqlValue(question.id)}, 'topic', NULL, ${sqlValue(generated.topic)});`,
      );
    }

    if (samples.length < 8) {
      samples.push({
        number: question.number,
        sourceDiscipline: question.discipline,
        officialDiscipline,
        itemCode: integerOrNull(match.item.CO_ITEM),
        skill: integerOrNull(match.item.CO_HABILIDADE),
        title: generated?.displayTitle ?? question.title,
        score: match.precision,
      });
    }
  }
  statements.push('COMMIT;');

  if (!options.dryRun) {
    await runSqlite(database, statements.join('\n'));
    const integrity = (await runSqlite(database, 'PRAGMA integrity_check;')).trim();
    if (integrity !== 'ok') throw new EnrichmentError(`PRAGMA integrity_check falhou após ${year}: ${integrity}`);
  }

  return {
    year,
    total: questions.length,
    mapped: assignments.length,
    unresolved: unresolved.length,
    mismatchedDisciplines,
    samples,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!await fileExists(options.database)) {
    throw new EnrichmentError(`Banco não encontrado: ${options.database}`);
  }

  // Falha cedo com uma mensagem clara caso o CLI não esteja instalado.
  await runProcess('sqlite3', ['-version']);

  if (!options.dryRun) await runSqlite(options.database, ENRICHMENT_SCHEMA);

  const years = options.years ?? (await runSqlite(
    options.database,
    'SELECT DISTINCT year FROM questions ORDER BY year;',
    { json: true },
  )).map((row) => Number(row.year));

  console.log(`Enriquecimento INEP: ${years.length} ano(s) — ${years.join(', ')}`);
  const reports = [];
  for (const year of years) {
    console.log(`\nENEM ${year}`);
    const report = await processYear(options.database, year, options);
    reports.push(report);
    const percentage = report.total ? ((report.mapped / report.total) * 100).toFixed(1) : '0.0';
    console.log(`  mapeadas: ${report.mapped}/${report.total} (${percentage}%)`);
    console.log(`  não resolvidas: ${report.unresolved ?? 0}`);
    if (report.mismatchedDisciplines) {
      console.log(`  disciplina divergente da área oficial: ${report.mismatchedDisciplines}`);
    }
    for (const sample of report.samples) {
      console.log(
        `  #${sample.number}: item ${sample.itemCode ?? '—'} H${sample.skill ?? '—'} | ${sample.title}`,
      );
    }
  }

  const total = reports.reduce((sum, report) => sum + report.total, 0);
  const mapped = reports.reduce((sum, report) => sum + report.mapped, 0);
  console.log(`\nTotal: ${mapped}/${total} questões vinculadas a itens oficiais.`);
  if (options.dryRun) console.log('DRY RUN: nenhuma alteração foi gravada.');
}

export {
  ENRICHMENT_SCHEMA,
  parseArgs,
  processYear,
};

const invoked = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invoked === modulePath) {
  main().catch((error) => {
    console.error(`[enrich-inep] ${error.message}`);
    process.exitCode = 1;
  });
}
