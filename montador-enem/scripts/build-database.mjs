#!/usr/bin/env node

import { spawn } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  open,
  rename,
  rm,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..', '..');

const DEFAULT_API_BASE = 'https://api.enem.dev/v1';
const DEFAULT_DELAY_MS = 1_000;
const DEFAULT_MAX_RETRIES = 5;
const PAGE_LIMIT = 50;
const MAX_BACKOFF_MS = 5 * 60 * 1_000;

const VALID_ALTERNATIVE_LETTERS = new Set(['A', 'B', 'C', 'D', 'E']);

const SQLITE_SCHEMA = `
PRAGMA encoding = 'UTF-8';
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = DELETE;
PRAGMA user_version = 1;

CREATE TABLE source_documents (
    path TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('exam_catalog', 'exam', 'question')),
    json_text TEXT NOT NULL
);

CREATE TABLE exams (
    year INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    source_path TEXT NOT NULL REFERENCES source_documents(path)
);

CREATE TABLE exam_disciplines (
    year INTEGER NOT NULL REFERENCES exams(year) ON DELETE CASCADE,
    value TEXT NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (year, value)
);

CREATE TABLE exam_languages (
    year INTEGER NOT NULL REFERENCES exams(year) ON DELETE CASCADE,
    value TEXT NOT NULL,
    label TEXT NOT NULL,
    PRIMARY KEY (year, value)
);

CREATE TABLE questions (
    id INTEGER PRIMARY KEY,
    year INTEGER NOT NULL REFERENCES exams(year),
    number INTEGER NOT NULL,
    language TEXT,
    title TEXT NOT NULL,
    discipline TEXT,
    context TEXT,
    alternatives_introduction TEXT,
    correct_alternative TEXT,
    source_path TEXT NOT NULL REFERENCES source_documents(path)
);

CREATE TABLE exam_questions (
    year INTEGER NOT NULL REFERENCES exams(year) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    number INTEGER NOT NULL,
    language TEXT,
    title TEXT NOT NULL,
    discipline TEXT,
    question_id INTEGER REFERENCES questions(id),
    PRIMARY KEY (year, position)
);

CREATE TABLE alternatives (
    id INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    letter TEXT NOT NULL,
    text TEXT,
    file_url TEXT,
    is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
    UNIQUE (question_id, letter)
);

CREATE TABLE question_files (
    id INTEGER PRIMARY KEY,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    url TEXT NOT NULL,
    UNIQUE (question_id, position, url)
);

CREATE VIRTUAL TABLE search_index USING fts5(
    question_id UNINDEXED,
    field UNINDEXED,
    alternative_id UNINDEXED,
    content,
    tokenize = 'unicode61 remove_diacritics 2'
);

CREATE UNIQUE INDEX questions_natural_key
    ON questions(year, number, ifnull(language, ''));
CREATE INDEX questions_year_number ON questions(year, number);
CREATE INDEX questions_discipline ON questions(discipline);
CREATE INDEX questions_language ON questions(language);
CREATE INDEX exam_questions_lookup
    ON exam_questions(year, number, ifnull(language, ''));
CREATE INDEX alternatives_question ON alternatives(question_id);

CREATE TRIGGER questions_ai_search AFTER INSERT ON questions BEGIN
    INSERT INTO search_index(question_id, field, alternative_id, content)
        SELECT NEW.id, 'context', NULL, NEW.context WHERE NEW.context IS NOT NULL;
    INSERT INTO search_index(question_id, field, alternative_id, content)
        SELECT NEW.id, 'alternativesIntroduction', NULL, NEW.alternatives_introduction
        WHERE NEW.alternatives_introduction IS NOT NULL;
END;

CREATE TRIGGER alternatives_ai_search AFTER INSERT ON alternatives
    WHEN NEW.text IS NOT NULL BEGIN
        INSERT INTO search_index(question_id, field, alternative_id, content)
            VALUES (NEW.question_id, 'alternatives.text', NEW.id, NEW.text);
END;
`;

class CollectorError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'CollectorError';
  }
}

function usage() {
  return `Uso: node scripts/build-database.mjs [opções]

Opções:
  --api-base URL       Base da API (padrão: ${DEFAULT_API_BASE})
  --output PATH        SQLite de saída (padrão: ${resolve(projectRoot, 'enem.sqlite')})
  --delay-ms N         Intervalo mínimo entre requisições (padrão: ${DEFAULT_DELAY_MS})
  --max-retries N      Retentativas de rede/429/5xx (padrão: ${DEFAULT_MAX_RETRIES})
  --verbose            Exibe progresso e detalhes de retentativas
  --help               Exibe esta ajuda
`;
}

function parseNonNegativeInteger(value, flag) {
  if (!/^\d+$/.test(value)) {
    throw new CollectorError(`${flag} deve ser um inteiro não negativo: ${value}`);
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new CollectorError(`${flag} excede o limite de inteiro seguro: ${value}`);
  }

  return parsed;
}

function parseArgs(argv) {
  const options = {
    apiBase: DEFAULT_API_BASE,
    output: resolve(projectRoot, 'enem.sqlite'),
    delayMs: DEFAULT_DELAY_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
    verbose: false,
    help: false,
  };

  const valueFlags = new Map([
    ['--api-base', 'apiBase'],
    ['--output', 'output'],
    ['--delay-ms', 'delayMs'],
    ['--max-retries', 'maxRetries'],
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }

    if (argument === '--verbose') {
      options.verbose = true;
      continue;
    }

    const equalsIndex = argument.indexOf('=');
    const flag = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    if (!valueFlags.has(flag)) {
      throw new CollectorError(`Opção desconhecida: ${argument}`);
    }

    const optionName = valueFlags.get(flag);
    let value = equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);
    if (value === undefined) {
      index += 1;
      value = argv[index];
    }

    if (!value) {
      throw new CollectorError(`${flag} exige um valor`);
    }

    if (optionName === 'apiBase') {
      options.apiBase = value.replace(/\/+$/, '');
    } else if (optionName === 'output') {
      options.output = resolve(process.cwd(), value);
    } else if (optionName === 'delayMs') {
      options.delayMs = parseNonNegativeInteger(value, flag);
    } else if (optionName === 'maxRetries') {
      options.maxRetries = parseNonNegativeInteger(value, flag);
    }
  }

  if (!options.apiBase) {
    throw new CollectorError('--api-base não pode ser vazio');
  }

  try {
    const parsedApiBase = new URL(options.apiBase);
    if (!['http:', 'https:'].includes(parsedApiBase.protocol)) {
      throw new Error('protocolo');
    }
  } catch {
    throw new CollectorError(`--api-base não é uma URL HTTP(S) válida: ${options.apiBase}`);
  }

  return options;
}

function sleep(milliseconds) {
  if (milliseconds <= 0) {
    return Promise.resolve();
  }

  return new Promise(resolveSleep => setTimeout(resolveSleep, milliseconds));
}

function log(verbose, ...messages) {
  if (verbose) {
    console.error('[build-database]', ...messages);
  }
}

function truncate(value, maximum = 400) {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}

function parseRetryAfter(headerValue) {
  if (!headerValue) {
    return null;
  }

  const numeric = Number(headerValue.trim());
  if (Number.isFinite(numeric) && numeric >= 0) {
    // O formato numérico padrão de Retry-After representa segundos.
    return Math.min(numeric * 1_000, MAX_BACKOFF_MS);
  }

  const timestamp = Date.parse(headerValue);
  if (Number.isFinite(timestamp)) {
    return Math.max(0, Math.min(timestamp - Date.now(), MAX_BACKOFF_MS));
  }

  return null;
}

function exponentialBackoff(attempt, delayMs) {
  const base = Math.max(250, delayMs);
  return Math.min(base * 2 ** attempt, MAX_BACKOFF_MS);
}

function buildUrl(apiBase, path, query = {}) {
  const url = new URL(`${apiBase.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function isTransientStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function assertObject(value, path) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new CollectorError(`${path} deve ser um objeto JSON`);
  }
}

function assertArray(value, path) {
  if (!Array.isArray(value)) {
    throw new CollectorError(`${path} deve ser um array JSON`);
  }
}

function assertString(value, path, { nullable = false } = {}) {
  if (nullable && value === null) {
    return;
  }
  if (typeof value !== 'string') {
    throw new CollectorError(`${path} deve ser ${nullable ? 'string ou null' : 'string'}`);
  }
  if (value.includes('\0')) {
    throw new CollectorError(`${path} contém um caractere NUL não suportado pelo SQLite`);
  }
}

function assertPositiveInteger(value, path) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new CollectorError(`${path} deve ser um inteiro positivo`);
  }
}

function assertNonNegativeInteger(value, path) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new CollectorError(`${path} deve ser um inteiro não negativo`);
  }
}

function validateDisciplineOrLanguageList(value, path) {
  assertArray(value, path);
  const values = new Set();
  for (const [index, item] of value.entries()) {
    assertObject(item, `${path}[${index}]`);
    assertString(item.value, `${path}[${index}].value`);
    assertString(item.label, `${path}[${index}].label`);
    if (values.has(item.value)) {
      throw new CollectorError(`${path} contém o valor duplicado ${item.value}`);
    }
    values.add(item.value);
  }
}

function validateExamMetadata(value, path) {
  assertObject(value, path);
  assertString(value.title, `${path}.title`);
  assertPositiveInteger(value.year, `${path}.year`);
  validateDisciplineOrLanguageList(value.disciplines, `${path}.disciplines`);
  validateDisciplineOrLanguageList(value.languages, `${path}.languages`);
}

function questionKey(year, number, language) {
  return `${year}:${number}:${language ?? ''}`;
}

function validateExamSummary(value, path) {
  validateExamMetadata(value, path);
}

function validateExamDetail(value, path) {
  validateExamMetadata(value, path);
  assertArray(value.questions, `${path}.questions`);

  for (const [index, question] of value.questions.entries()) {
    const questionPath = `${path}.questions[${index}]`;
    assertObject(question, questionPath);
    assertString(question.title, `${questionPath}.title`);
    assertPositiveInteger(question.index, `${questionPath}.index`);
    assertString(question.discipline, `${questionPath}.discipline`, { nullable: true });
    assertString(question.language, `${questionPath}.language`, { nullable: true });
    // A API pode repetir uma mesma questão na lista ordenada da prova
    // (por exemplo, o ENEM 2011/95). A posição da lista é preservada em
    // exam_questions; a questão normalizada continua sendo única.
  }
}

function validateQuestionDetail(value, path, expectedYear) {
  assertObject(value, path);
  assertString(value.title, `${path}.title`);
  assertPositiveInteger(value.index, `${path}.index`);
  assertPositiveInteger(value.year, `${path}.year`);
  if (value.year !== expectedYear) {
    throw new CollectorError(`${path}.year=${value.year} não corresponde ao ano ${expectedYear}`);
  }
  assertString(value.language, `${path}.language`, { nullable: true });
  assertString(value.discipline, `${path}.discipline`, { nullable: true });
  assertString(value.context, `${path}.context`, { nullable: true });
  assertArray(value.files, `${path}.files`);
  for (const [index, file] of value.files.entries()) {
    assertString(file, `${path}.files[${index}]`);
  }
  assertString(value.correctAlternative, `${path}.correctAlternative`);
  if (!VALID_ALTERNATIVE_LETTERS.has(value.correctAlternative)) {
    throw new CollectorError(`${path}.correctAlternative contém uma letra inválida`);
  }
  assertString(value.alternativesIntroduction, `${path}.alternativesIntroduction`, {
    nullable: true,
  });
  assertArray(value.alternatives, `${path}.alternatives`);

  const letters = new Set();
  for (const [index, alternative] of value.alternatives.entries()) {
    const alternativePath = `${path}.alternatives[${index}]`;
    assertObject(alternative, alternativePath);
    assertString(alternative.letter, `${alternativePath}.letter`);
    if (!VALID_ALTERNATIVE_LETTERS.has(alternative.letter)) {
      throw new CollectorError(`${alternativePath}.letter contém uma letra inválida`);
    }
    if (letters.has(alternative.letter)) {
      throw new CollectorError(`${path}.alternatives contém a letra duplicada ${alternative.letter}`);
    }
    letters.add(alternative.letter);
    assertString(alternative.text, `${alternativePath}.text`, { nullable: true });
    assertString(alternative.file, `${alternativePath}.file`, { nullable: true });
    if (typeof alternative.isCorrect !== 'boolean') {
      throw new CollectorError(`${alternativePath}.isCorrect deve ser booleano`);
    }
  }
}

function validateQuestionPage(value, path, expectedYear, requestedLanguage, requestedOffset) {
  assertObject(value, path);
  assertObject(value.metadata, `${path}.metadata`);
  assertPositiveInteger(value.metadata.limit, `${path}.metadata.limit`);
  if (value.metadata.limit > PAGE_LIMIT) {
    throw new CollectorError(`${path}.metadata.limit excede ${PAGE_LIMIT}`);
  }
  assertNonNegativeInteger(value.metadata.offset, `${path}.metadata.offset`);
  if (value.metadata.offset !== requestedOffset) {
    throw new CollectorError(
      `${path}.metadata.offset=${value.metadata.offset} não corresponde ao offset solicitado ${requestedOffset}`,
    );
  }
  assertNonNegativeInteger(value.metadata.total, `${path}.metadata.total`);
  if (typeof value.metadata.hasMore !== 'boolean') {
    throw new CollectorError(`${path}.metadata.hasMore deve ser booleano`);
  }

  assertArray(value.questions, `${path}.questions`);
  const keys = new Set();
  for (const [index, question] of value.questions.entries()) {
    const questionPath = `${path}.questions[${index}]`;
    validateQuestionDetail(question, questionPath, expectedYear);
    if (requestedLanguage === null) {
      if (question.language !== null) {
        throw new CollectorError(
          `${questionPath}.language=${question.language} não era esperado em uma prova sem idiomas`,
        );
      }
    } else if (question.language !== null && question.language !== requestedLanguage) {
      throw new CollectorError(
        `${questionPath}.language=${question.language} não corresponde ao idioma solicitado ${requestedLanguage}`,
      );
    }
    const key = questionKey(expectedYear, question.index, question.language);
    if (keys.has(key)) {
      throw new CollectorError(`${path}.questions contém a questão duplicada ${key}`);
    }
    keys.add(key);
  }
}

function validateCatalog(value) {
  assertArray(value, 'GET /exams');
  const years = new Set();
  for (const [index, exam] of value.entries()) {
    const path = `GET /exams[${index}]`;
    validateExamSummary(exam, path);
    if (years.has(exam.year)) {
      throw new CollectorError(`GET /exams contém o ano duplicado ${exam.year}`);
    }
    years.add(exam.year);
  }
}

function jsonForSource(value) {
  const json = JSON.stringify(value);
  if (typeof json !== 'string') {
    throw new CollectorError('Não foi possível serializar uma resposta JSON para source_documents');
  }
  return json;
}

function sqlValue(value) {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new CollectorError(`Número não inteiro não suportado no SQLite: ${value}`);
    }
    return String(value);
  }
  if (typeof value !== 'string') {
    throw new CollectorError(`Tipo de valor não suportado no SQLite: ${typeof value}`);
  }
  if (value.includes('\0')) {
    throw new CollectorError('Valor de texto contém NUL e não pode ser gravado no SQLite');
  }
  return `'${value.replaceAll("'", "''")}'`;
}

function insertSql(table, columns, values) {
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.map(sqlValue).join(', ')});`;
}

function createDatabaseSql(catalogPayload, exams) {
  const statements = [SQLITE_SCHEMA, 'BEGIN;'];

  statements.push(
    insertSql('source_documents', ['path', 'kind', 'json_text'], [
      'exams.json',
      'exam_catalog',
      jsonForSource(catalogPayload),
    ]),
  );

  for (const exam of exams) {
    const examPath = `${exam.detail.year}/details.json`;
    statements.push(
      insertSql('source_documents', ['path', 'kind', 'json_text'], [
        examPath,
        'exam',
        jsonForSource(exam.detail),
      ]),
    );
  }

  for (const exam of exams) {
    const examPath = `${exam.detail.year}/details.json`;
    statements.push(
      insertSql('exams', ['year', 'title', 'source_path'], [
        exam.detail.year,
        exam.detail.title,
        examPath,
      ]),
    );
    for (const discipline of exam.detail.disciplines) {
      statements.push(
        insertSql('exam_disciplines', ['year', 'value', 'label'], [
          exam.detail.year,
          discipline.value,
          discipline.label,
        ]),
      );
    }
    for (const language of exam.detail.languages) {
      statements.push(
        insertSql('exam_languages', ['year', 'value', 'label'], [
          exam.detail.year,
          language.value,
          language.label,
        ]),
      );
    }
  }

  let nextQuestionId = 1;
  let nextAlternativeId = 1;
  let nextFileId = 1;
  const questionIds = new Map();

  for (const exam of exams) {
    for (const record of exam.records) {
      const question = record.detail;
      const sourcePath = `${question.year}/questions/${question.index}${
        question.language ? `-${question.language}` : ''
      }/details.json`;
      statements.push(
        insertSql('source_documents', ['path', 'kind', 'json_text'], [
          sourcePath,
          'question',
          jsonForSource(question),
        ]),
      );
      statements.push(
        insertSql(
          'questions',
          [
            'id',
            'year',
            'number',
            'language',
            'title',
            'discipline',
            'context',
            'alternatives_introduction',
            'correct_alternative',
            'source_path',
          ],
          [
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
          ],
        ),
      );
      questionIds.set(questionKey(question.year, question.index, question.language), nextQuestionId);

      for (const alternative of question.alternatives) {
        statements.push(
          insertSql(
            'alternatives',
            ['id', 'question_id', 'letter', 'text', 'file_url', 'is_correct'],
            [
              nextAlternativeId,
              nextQuestionId,
              alternative.letter,
              alternative.text,
              alternative.file,
              alternative.isCorrect,
            ],
          ),
        );
        nextAlternativeId += 1;
      }

      for (const [position, file] of question.files.entries()) {
        statements.push(
          insertSql('question_files', ['id', 'question_id', 'position', 'url'], [
            nextFileId,
            nextQuestionId,
            position,
            file,
          ]),
        );
        nextFileId += 1;
      }

      nextQuestionId += 1;
    }
  }

  for (const exam of exams) {
    for (const [position, summary] of exam.detail.questions.entries()) {
      statements.push(
        insertSql(
          'exam_questions',
          ['year', 'position', 'number', 'language', 'title', 'discipline', 'question_id'],
          [
            exam.detail.year,
            position,
            summary.index,
            summary.language,
            summary.title,
            summary.discipline,
            questionIds.get(questionKey(exam.detail.year, summary.index, summary.language)),
          ],
        ),
      );
    }
  }

  statements.push('COMMIT;');
  return statements.join('\n');
}

function runSqlite(databasePath, sql) {
  return new Promise((resolveProcess, rejectProcess) => {
    const child = spawn('sqlite3', ['-batch', databasePath], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', error => {
      rejectProcess(
        new CollectorError(
          `Não foi possível executar sqlite3: ${error.message}. Instale o CLI sqlite3 e tente novamente.`,
          { cause: error },
        ),
      );
    });
    child.on('close', code => {
      if (code !== 0) {
        rejectProcess(new CollectorError(`sqlite3 terminou com código ${code}: ${truncate(stderr)}`));
        return;
      }
      resolveProcess({ stdout, stderr });
    });
    child.stdin.on('error', error => {
      rejectProcess(new CollectorError(`Falha ao enviar SQL ao sqlite3: ${error.message}`, { cause: error }));
    });
    child.stdin.end(sql);
  });
}

async function fetchJsonFactory(options) {
  if (typeof fetch !== 'function') {
    throw new CollectorError('Este Node.js não oferece fetch global; use Node.js 18 ou mais recente.');
  }

  let lastRequestAt = 0;
  let requestNumber = 0;

  return async function fetchJson(url) {
    for (let attempt = 0; ; attempt += 1) {
      const elapsed = Date.now() - lastRequestAt;
      const throttleWait = Math.max(0, options.delayMs - elapsed);
      if (lastRequestAt > 0 && throttleWait > 0) {
        await sleep(throttleWait);
      }
      lastRequestAt = Date.now();
      requestNumber += 1;
      log(options.verbose, `GET ${url} (requisição ${requestNumber}, tentativa ${attempt + 1})`);

      let response;
      try {
        response = await fetch(url, {
          headers: {
            accept: 'application/json',
            'user-agent': 'montador-enem-database-builder/1.0',
          },
        });
      } catch (error) {
        if (attempt >= options.maxRetries) {
          throw new CollectorError(`Falha de rede ao consultar ${url}: ${error.message}`, {
            cause: error,
          });
        }
        const waitMs = exponentialBackoff(attempt, options.delayMs);
        log(options.verbose, `Falha de rede; nova tentativa em ${waitMs} ms`);
        await sleep(waitMs);
        continue;
      }

      const body = await response.text();
      if (!response.ok) {
        if (isTransientStatus(response.status) && attempt < options.maxRetries) {
          const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
          const waitMs = retryAfter ?? exponentialBackoff(attempt, options.delayMs);
          log(
            options.verbose,
            `HTTP ${response.status}; nova tentativa em ${waitMs} ms`,
          );
          await sleep(waitMs);
          continue;
        }

        throw new CollectorError(
          `HTTP ${response.status} ao consultar ${url}: ${truncate(body || response.statusText)}`,
        );
      }

      try {
        return JSON.parse(body);
      } catch (error) {
        throw new CollectorError(`Resposta não é JSON válido em ${url}: ${error.message}`, {
          cause: error,
        });
      }
    }
  };
}

async function collectData(options) {
  const fetchJson = await fetchJsonFactory(options);
  const catalogPayload = await fetchJson(buildUrl(options.apiBase, '/exams'));
  validateCatalog(catalogPayload);

  const catalog = [...catalogPayload].sort((left, right) => left.year - right.year);
  const exams = [];

  for (const [examIndex, catalogExam] of catalog.entries()) {
    log(options.verbose, `Coletando ENEM ${catalogExam.year} (${examIndex + 1}/${catalog.length})`);
    const detailPayload = await fetchJson(
      buildUrl(options.apiBase, `/exams/${encodeURIComponent(catalogExam.year)}`),
    );
    validateExamDetail(detailPayload, `GET /exams/${catalogExam.year}`);
    if (detailPayload.year !== catalogExam.year || detailPayload.title !== catalogExam.title) {
      throw new CollectorError(
        `Os metadados de ENEM ${catalogExam.year} divergem entre /exams e /exams/${catalogExam.year}`,
      );
    }

    const expected = new Map(
      detailPayload.questions.map(question => [
        questionKey(detailPayload.year, question.index, question.language),
        question,
      ]),
    );
    const fetched = new Map();
    const languages = detailPayload.languages.length
      ? detailPayload.languages.map(language => language.value)
      : [null];

    for (const language of languages) {
      let offset = 0;
      let hasMore = true;
      let pageNumber = 0;

      while (hasMore) {
        pageNumber += 1;
        const query = { limit: PAGE_LIMIT, offset };
        if (language !== null) {
          query.language = language;
        }
        const pagePayload = await fetchJson(
          buildUrl(
            options.apiBase,
            `/exams/${encodeURIComponent(detailPayload.year)}/questions`,
            query,
          ),
        );
        const pagePath = `GET /exams/${detailPayload.year}/questions?language=${language ?? 'default'}&offset=${offset}`;
        validateQuestionPage(pagePayload, pagePath, detailPayload.year, language, offset);
        log(
          options.verbose,
          `  idioma ${language ?? 'padrão'} página ${pageNumber}: ${pagePayload.questions.length} questões`,
        );

        for (const question of pagePayload.questions) {
          const key = questionKey(question.year, question.index, question.language);
          if (!expected.has(key)) {
            throw new CollectorError(
              `${pagePath} retornou a questão ${key}, ausente em /exams/${detailPayload.year}`,
            );
          }
          const previous = fetched.get(key);
          if (previous && JSON.stringify(previous) !== JSON.stringify(question)) {
            throw new CollectorError(`${pagePath} retornou dados divergentes para a questão ${key}`);
          }
          fetched.set(key, question);
        }

        hasMore = pagePayload.metadata.hasMore;
        if (hasMore && pagePayload.questions.length === 0) {
          throw new CollectorError(`${pagePath} marcou hasMore=true sem retornar questões`);
        }
        if (hasMore) {
          const nextOffset = offset + pagePayload.metadata.limit;
          if (nextOffset <= offset) {
            throw new CollectorError(`${pagePath} não avançou a paginação`);
          }
          offset = nextOffset;
        }
      }
    }

    for (const key of expected.keys()) {
      if (!fetched.has(key)) {
        throw new CollectorError(`A questão ${key} não foi retornada pelas páginas da API`);
      }
    }

    exams.push({
      detail: detailPayload,
      records: detailPayload.questions.map(summary => ({
        summary,
        detail: fetched.get(questionKey(detailPayload.year, summary.index, summary.language)),
      })),
    });
  }

  return { catalogPayload, exams };
}

async function buildDatabase(options, data) {
  await mkdir(dirname(options.output), { recursive: true });
  const temporaryDirectory = await mkdtemp(
    join(dirname(options.output), `.${basename(options.output)}.tmp-`),
  );
  const temporaryDatabase = join(temporaryDirectory, basename(options.output));
  let moved = false;

  try {
    const sql = createDatabaseSql(data.catalogPayload, data.exams);
    await runSqlite(temporaryDatabase, sql);

    const integrity = await runSqlite(temporaryDatabase, 'PRAGMA integrity_check;');
    if (integrity.stdout.trim() !== 'ok') {
      throw new CollectorError(`PRAGMA integrity_check falhou: ${truncate(integrity.stdout)}`);
    }

    const foreignKeys = await runSqlite(temporaryDatabase, 'PRAGMA foreign_key_check;');
    if (foreignKeys.stdout.trim() !== '') {
      throw new CollectorError(`PRAGMA foreign_key_check falhou: ${truncate(foreignKeys.stdout)}`);
    }

    const handle = await open(temporaryDatabase, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }

    await rename(temporaryDatabase, options.output);
    moved = true;
    return {
      output: options.output,
      exams: data.exams.length,
      questions: data.exams.reduce((total, exam) => total + exam.records.length, 0),
    };
  } finally {
    if (!moved) {
      await rm(temporaryDatabase, { force: true }).catch(() => {});
    }
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

export {
  buildDatabase,
  collectData,
  createDatabaseSql,
  parseArgs,
  validateCatalog,
  validateExamDetail,
  validateQuestionDetail,
  validateQuestionPage,
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const data = await collectData(options);
  const result = await buildDatabase(options, data);
  console.log(
    `Banco gerado atomicamente em ${result.output}: ${result.exams} provas, ${result.questions} questões.`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
const modulePath = resolve(fileURLToPath(import.meta.url));
if (invokedPath && pathToFileURL(invokedPath).href === pathToFileURL(modulePath).href) {
  main().catch(error => {
    console.error(`[build-database] ${error.message}`);
    process.exitCode = 1;
  });
}
