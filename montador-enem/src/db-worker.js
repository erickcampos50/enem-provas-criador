/* global self */

const MAX_QUERY_LENGTH = 2_048;
const MAX_EXCLUDED_IDS = 1_000;
const MAX_PAGE_SIZE = 100;

let sqlite3Promise;
let sqlite3;
let database;
let messageQueue = Promise.resolve();

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createError(name, message, code, details) {
  const error = new Error(message);
  error.name = name;
  if (code) error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function serializeError(error) {
  const source = error instanceof Error ? error : new Error(String(error));
  const serialized = {
    name: typeof source.name === 'string' ? source.name : 'Error',
    message: typeof source.message === 'string' ? source.message : String(source),
  };

  if (typeof source.code === 'string' || typeof source.code === 'number') {
    serialized.code = source.code;
  }
  if (typeof source.resultCode === 'number') {
    serialized.resultCode = source.resultCode;
  }
  if (source.details !== undefined) {
    try {
      JSON.stringify(source.details);
      serialized.details = source.details;
    } catch {
      serialized.details = String(source.details);
    }
  }
  if (typeof source.stack === 'string') serialized.stack = source.stack;
  return serialized;
}

function postResponse(id, result) {
  self.postMessage({ id: id ?? null, type: 'response', ok: true, result });
}

function postError(id, error) {
  self.postMessage({
    id: id ?? null,
    type: 'response',
    ok: false,
    error: serializeError(error),
  });
}

async function loadSqlite() {
  if (!sqlite3Promise) {
    sqlite3Promise = import('@sqlite.org/sqlite-wasm').then(async (module) => {
      const initialize = module.default ?? module.sqlite3InitModule;
      if (typeof initialize !== 'function') {
        throw createError(
          'SQLiteLoadError',
          'O módulo @sqlite.org/sqlite-wasm não exportou sqlite3InitModule.',
          'SQLITE_MODULE_INVALID',
        );
      }
      return initialize();
    });
  }
  return sqlite3Promise;
}

function assertDatabase() {
  if (!database) {
    throw createError(
      'DatabaseNotInitializedError',
      'O banco SQLite ainda não foi inicializado.',
      'DB_NOT_INITIALIZED',
    );
  }
  return database;
}

function executeRows(db, sql, bind) {
  const rows = [];
  const options = { sql, rowMode: 'object', resultRows: rows };
  if (bind !== undefined) options.bind = bind;
  db.exec(options);
  return rows;
}

function asNumber(value) {
  return typeof value === 'bigint' ? Number(value) : value;
}

function isArrayBuffer(value) {
  return (
    value instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer)
  );
}

function asBytes(value) {
  if (isArrayBuffer(value)) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function getInitBytes(message) {
  const payload = message?.payload;
  const candidates = [
    payload,
    payload?.buffer,
    payload?.arrayBuffer,
    message?.buffer,
    message?.arrayBuffer,
  ];

  for (const candidate of candidates) {
    const bytes = asBytes(candidate);
    if (bytes) return bytes;
  }
  return null;
}

function closeDatabase() {
  const current = database;
  database = undefined;
  if (current) current.close();
}

async function initDatabase(message) {
  const bytes = getInitBytes(message);
  if (!bytes || bytes.byteLength === 0) {
    throw createError(
      'InvalidArgumentError',
      'init exige um ArrayBuffer não vazio contendo um banco SQLite.',
      'INVALID_DATABASE_BUFFER',
    );
  }

  sqlite3 = await loadSqlite();
  closeDatabase();

  const nextDatabase = new sqlite3.oo1.DB();
  let pointer;
  let pointerOwnedByDatabase = false;

  try {
    pointer = sqlite3.wasm.allocFromTypedArray(bytes);
    const resultCode = sqlite3.capi.sqlite3_deserialize(
      nextDatabase.pointer,
      'main',
      pointer,
      bytes.byteLength,
      bytes.byteLength,
      0,
    );
    nextDatabase.checkRc(resultCode);

    pointerOwnedByDatabase = true;
    nextDatabase.onclose = {
      after: () => {
        if (pointer) {
          sqlite3.wasm.dealloc(pointer);
          pointer = undefined;
        }
      },
    };

    const requiredTables = executeRows(
      nextDatabase,
      `SELECT name
         FROM sqlite_schema
        WHERE type = 'table'
          AND name IN ('questions', 'alternatives', 'question_files', 'search_index')`,
    ).map((row) => row.name);

    const missingTables = ['questions', 'alternatives', 'question_files', 'search_index'].filter(
      (name) => !requiredTables.includes(name),
    );
    if (missingTables.length > 0) {
      throw createError(
        'DatabaseSchemaError',
        `O banco não contém as tabelas obrigatórias: ${missingTables.join(', ')}.`,
        'DB_SCHEMA_INVALID',
        { missingTables },
      );
    }

    const count = executeRows(nextDatabase, 'SELECT count(*) AS total FROM questions')[0]?.total;
    database = nextDatabase;

    return {
      ready: true,
      version: sqlite3.version?.libVersion ?? null,
      questionCount: Number(asNumber(count) ?? 0),
    };
  } catch (error) {
    if (pointerOwnedByDatabase) {
      nextDatabase.close();
    } else {
      if (pointer) sqlite3.wasm.dealloc(pointer);
      nextDatabase.close();
    }
    throw error;
  }
}

function getFilters() {
  const db = assertDatabase();
  const years = executeRows(
    db,
    `SELECT year AS value, CAST(year AS TEXT) AS label
       FROM exams
      ORDER BY year DESC`,
  ).map((row) => ({ value: Number(asNumber(row.value)), label: row.label }));

  const disciplines = executeRows(
    db,
    `SELECT value, label
       FROM exam_disciplines
      GROUP BY value, label
      ORDER BY label COLLATE NOCASE, value`,
  );

  const languages = executeRows(
    db,
    `SELECT value, label
       FROM exam_languages
      GROUP BY value, label
      ORDER BY label COLLATE NOCASE, value`,
  );

  return { years, disciplines, languages };
}

function parseInteger(value, name, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw createError('InvalidArgumentError', `${name} deve ser um inteiro válido.`, 'INVALID_ARGUMENT', {
      field: name,
    });
  }
  return number;
}

function parseOptionalString(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw createError('InvalidArgumentError', `${name} deve ser uma string.`, 'INVALID_ARGUMENT', {
      field: name,
    });
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function makeSafeFtsQuery(value) {
  if (!value) return { query: undefined, noMatches: false };
  if (value.length > MAX_QUERY_LENGTH) {
    throw createError(
      'InvalidArgumentError',
      `q não pode exceder ${MAX_QUERY_LENGTH} caracteres.`,
      'INVALID_ARGUMENT',
      { field: 'q', maxLength: MAX_QUERY_LENGTH },
    );
  }

  const normalized = value.normalize('NFKC');
  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (tokens.length === 0) return { query: undefined, noMatches: true };

  return {
    query: tokens
      .map((token) => `"${token.replaceAll('"', '""')}"`)
      .join(' AND '),
    noMatches: false,
  };
}

function parseSearchOptions(payload) {
  const input = isRecord(payload) ? payload : {};
  if (input.q !== undefined && input.q !== null && typeof input.q !== 'string') {
    throw createError('InvalidArgumentError', 'q deve ser uma string.', 'INVALID_ARGUMENT', {
      field: 'q',
    });
  }

  const q = input.q?.trim() ?? '';
  const fts = makeSafeFtsQuery(q);
  const year = parseInteger(input.year, 'year');
  const discipline = parseOptionalString(input.discipline, 'discipline');
  const language = parseOptionalString(input.language, 'language');
  const page = parseInteger(input.page, 'page', { min: 1 }) ?? 1;
  const pageSize = parseInteger(input.pageSize, 'pageSize', { min: 1, max: MAX_PAGE_SIZE }) ?? 20;

  if (input.hasImages !== undefined && input.hasImages !== null && typeof input.hasImages !== 'boolean') {
    throw createError('InvalidArgumentError', 'hasImages deve ser booleano.', 'INVALID_ARGUMENT', {
      field: 'hasImages',
    });
  }

  const excludeIds = input.excludeIds ?? [];
  if (!Array.isArray(excludeIds)) {
    throw createError('InvalidArgumentError', 'excludeIds deve ser um array.', 'INVALID_ARGUMENT', {
      field: 'excludeIds',
    });
  }
  if (excludeIds.length > MAX_EXCLUDED_IDS) {
    throw createError(
      'InvalidArgumentError',
      `excludeIds não pode conter mais de ${MAX_EXCLUDED_IDS} IDs.`,
      'INVALID_ARGUMENT',
      { field: 'excludeIds', maxLength: MAX_EXCLUDED_IDS },
    );
  }

  const normalizedExcludeIds = [...new Set(
    excludeIds.map((id) => parseInteger(id, 'excludeIds', { min: 1 })),
  )];
  if (normalizedExcludeIds.some((id) => id === undefined)) {
    throw createError('InvalidArgumentError', 'excludeIds contém um ID inválido.', 'INVALID_ARGUMENT', {
      field: 'excludeIds',
    });
  }
  const offset = (page - 1) * pageSize;
  if (!Number.isSafeInteger(offset)) {
    throw createError('InvalidArgumentError', 'page é grande demais.', 'INVALID_ARGUMENT', {
      field: 'page',
    });
  }

  return {
    q,
    ftsQuery: fts.query,
    noMatches: fts.noMatches,
    year,
    discipline,
    language,
    hasImages: input.hasImages,
    excludeIds: normalizedExcludeIds,
    limit: pageSize,
    offset,
    page,
    pageSize,
  };
}

function buildSearchQuery(options) {
  const bind = {};
  const conditions = [];
  let join = '';

  if (options.ftsQuery) {
    join = `
      JOIN (
        SELECT question_id
          FROM search_index
         WHERE search_index MATCH $fts
         GROUP BY question_id
      ) AS matched ON matched.question_id = q.id`;
    bind.$fts = options.ftsQuery;
  } else if (options.noMatches) {
    conditions.push('0');
  }

  if (options.year !== undefined) {
    conditions.push('q.year = $year');
    bind.$year = options.year;
  }
  if (options.discipline !== undefined) {
    conditions.push('q.discipline = $discipline');
    bind.$discipline = options.discipline;
  }
  if (options.language !== undefined) {
    conditions.push('q.language = $language');
    bind.$language = options.language;
  }
  if (options.hasImages === true) {
    conditions.push(
      `(EXISTS (SELECT 1 FROM question_files AS image_filter WHERE image_filter.question_id = q.id)
        OR EXISTS (SELECT 1 FROM alternatives AS alternative_image_filter
                   WHERE alternative_image_filter.question_id = q.id
                     AND alternative_image_filter.file_url IS NOT NULL))`,
    );
  }

  if (options.excludeIds.length > 0) {
    const placeholders = options.excludeIds.map((id, index) => {
      const parameter = `$exclude_${index}`;
      bind[parameter] = id;
      return parameter;
    });
    conditions.push(`q.id NOT IN (${placeholders.join(', ')})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join('\n          AND ')}` : '';
  return { bind, join, where };
}

function mapSearchResult(row) {
  return {
    id: Number(asNumber(row.id)),
    year: Number(asNumber(row.year)),
    number: Number(asNumber(row.number)),
    language: row.language ?? null,
    title: row.title,
    discipline: row.discipline ?? null,
    hasImages: Boolean(Number(asNumber(row.has_images))),
    snippet: row.snippet ?? null,
  };
}

function searchQuestions(payload) {
  const db = assertDatabase();
  const options = parseSearchOptions(payload);
  const query = buildSearchQuery(options);

  const countRows = executeRows(
    db,
    `SELECT count(*) AS total
       FROM questions AS q
       ${query.join}
       ${query.where}`,
    query.bind,
  );
  const total = Number(asNumber(countRows[0]?.total) ?? 0);

  const resultBind = { ...query.bind, $limit: options.limit, $offset: options.offset };
  const snippetSelect = options.ftsQuery
    ? `(SELECT snippet(search_index, 3, '', '', '…', 18)
         FROM search_index
        WHERE search_index.question_id = paged.id
          AND search_index MATCH $fts
        LIMIT 1) AS snippet,`
    : `trim(
         substr(coalesce(paged.context, ''), 1, 480) || char(32) ||
         substr(coalesce(paged.alternatives_introduction, ''), 1, 480) || char(32) ||
         coalesce((
           SELECT group_concat(alternative_preview.text, char(32))
             FROM (
               SELECT substr(trim(alternative_preview.text), 1, 480) AS text
                 FROM alternatives AS alternative_preview
                WHERE alternative_preview.question_id = paged.id
                  AND alternative_preview.text IS NOT NULL
                ORDER BY alternative_preview.id
                LIMIT 3
             ) AS alternative_preview
         ), '')
       ) AS snippet,`;
  const rows = executeRows(
    db,
    `WITH paged AS MATERIALIZED (
       SELECT q.id,
              q.year,
              q.number,
              q.language,
              q.title,
              q.discipline,
              q.context,
              q.alternatives_introduction
         FROM questions AS q
         ${query.join}
         ${query.where}
        ORDER BY q.year DESC, q.number ASC, q.id ASC
        LIMIT $limit OFFSET $offset
    )
    SELECT paged.id,
           paged.year,
           paged.number,
           paged.language,
           paged.title,
           paged.discipline,
           ${snippetSelect}
           EXISTS (
             SELECT 1
               FROM question_files AS result_images
              WHERE result_images.question_id = paged.id
           ) OR EXISTS (
             SELECT 1
               FROM alternatives AS result_alternative_images
              WHERE result_alternative_images.question_id = paged.id
                AND result_alternative_images.file_url IS NOT NULL
           ) AS has_images
      FROM paged`,
    resultBind,
  );

  return {
    total,
    page: options.page,
    pageSize: options.pageSize,
    results: rows.map(mapSearchResult),
  };
}

function getQuestionKey(payload) {
  if (typeof payload === 'number' || typeof payload === 'string') return { id: payload };
  if (!isRecord(payload)) {
    throw createError('InvalidArgumentError', 'getQuestion exige um ID ou uma chave de questão.', 'INVALID_ARGUMENT');
  }
  return payload;
}

function getQuestion(payload) {
  const db = assertDatabase();
  const input = getQuestionKey(payload);
  const id = parseInteger(input.id ?? input.questionId, 'id', { min: 1 });
  const year = parseInteger(input.year, 'year');
  const number = parseInteger(input.number, 'number', { min: 1 });
  const language = parseOptionalString(input.language, 'language');

  if (id === undefined && (year === undefined || number === undefined)) {
    throw createError(
      'InvalidArgumentError',
      'getQuestion exige id/questionId ou o conjunto year + number.',
      'INVALID_ARGUMENT',
    );
  }

  let rows;
  if (id !== undefined) {
    rows = executeRows(
      db,
      `SELECT id, year, number, language, title, discipline, context,
              alternatives_introduction, correct_alternative, source_path
         FROM questions
        WHERE id = $id`,
      { $id: id },
    );
  } else {
    const bind = { $year: year, $number: number };
    const conditions = ['year = $year', 'number = $number'];
    if (language !== undefined) {
      conditions.push('language = $language');
      bind.$language = language;
    }
    rows = executeRows(
      db,
      `SELECT id, year, number, language, title, discipline, context,
              alternatives_introduction, correct_alternative, source_path
         FROM questions
        WHERE ${conditions.join(' AND ')}
        LIMIT 2`,
      bind,
    );
    if (rows.length > 1) {
      throw createError(
        'AmbiguousQuestionError',
        'Mais de uma questão corresponde a year + number; informe language ou id.',
        'AMBIGUOUS_QUESTION',
      );
    }
  }

  const questionRow = rows[0];
  if (!questionRow) {
    throw createError('QuestionNotFoundError', 'Questão não encontrada.', 'QUESTION_NOT_FOUND');
  }

  const questionId = Number(asNumber(questionRow.id));
  const alternatives = executeRows(
    db,
    `SELECT id, letter, text, file_url, is_correct
       FROM alternatives
      WHERE question_id = $questionId
      ORDER BY letter COLLATE NOCASE, id`,
    { $questionId: questionId },
  ).map((row) => ({
    id: Number(asNumber(row.id)),
    letter: row.letter,
    text: row.text ?? null,
    file: row.file_url ?? null,
    fileUrl: row.file_url ?? null,
    isCorrect: Boolean(Number(asNumber(row.is_correct))),
  }));

  const urls = executeRows(
    db,
    `SELECT url
       FROM question_files
      WHERE question_id = $questionId
      ORDER BY position, id`,
    { $questionId: questionId },
  ).map((row) => row.url);

  const question = {
    id: questionId,
    year: Number(asNumber(questionRow.year)),
    number: Number(asNumber(questionRow.number)),
    language: questionRow.language ?? null,
    title: questionRow.title,
    discipline: questionRow.discipline ?? null,
    context: questionRow.context ?? null,
    alternativesIntroduction: questionRow.alternatives_introduction ?? null,
    correctAlternative: questionRow.correct_alternative ?? null,
    sourcePath: questionRow.source_path,
    alternatives,
    files: urls,
    urls,
  };

  return question;
}

async function handleMessage(message) {
  const id = message?.id ?? null;
  if (!isRecord(message) || typeof message.type !== 'string') {
    postError(id, createError('InvalidMessageError', 'Mensagem de worker inválida.', 'INVALID_MESSAGE'));
    return;
  }

  try {
    let result;
    switch (message.type) {
      case 'init':
        result = await initDatabase(message);
        break;
      case 'getFilters':
        result = getFilters(message.payload);
        break;
      case 'searchQuestions':
        result = searchQuestions(message.payload);
        break;
      case 'getQuestion':
        result = getQuestion(message.payload);
        break;
      case 'close':
        closeDatabase();
        result = { closed: true };
        break;
      default:
        throw createError('UnknownMessageError', `Operação desconhecida: ${message.type}.`, 'UNKNOWN_MESSAGE');
    }
    postResponse(id, result);
  } catch (error) {
    postError(id, error);
  }
}

if (typeof self !== 'undefined') {
  self.addEventListener('message', (event) => {
    messageQueue = messageQueue.then(() => handleMessage(event.data));
  });
}
