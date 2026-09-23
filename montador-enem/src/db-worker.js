/* global self */

const MAX_QUERY_LENGTH = 2_048;
const MAX_EXCLUDED_IDS = 1_000;
const MAX_PAGE_SIZE = 100;

let sqlite3Promise;
let sqlite3;
let database;
let databaseFeatures = { inepMetadata: false, enrichment: false };
let messageQueue = Promise.resolve();

function optionalQuestionJoins(alias = 'q') {
  let joins = '';
  if (databaseFeatures.inepMetadata) {
    joins += `\nLEFT JOIN question_inep_metadata AS im ON im.question_id = ${alias}.id`;
  }
  if (databaseFeatures.enrichment) {
    joins += `\nLEFT JOIN question_enrichment AS qe ON qe.question_id = ${alias}.id`;
  }
  return joins;
}

function effectiveDisciplineSql(alias = 'q') {
  if (!databaseFeatures.inepMetadata) return `${alias}.discipline`;
  return `COALESCE(
    CASE im.area
      WHEN 'LC' THEN 'linguagens'
      WHEN 'CH' THEN 'ciencias-humanas'
      WHEN 'CN' THEN 'ciencias-natureza'
      WHEN 'MT' THEN 'matematica'
    END,
    ${alias}.discipline
  )`;
}

function effectiveTitleSql(alias = 'q') {
  return databaseFeatures.enrichment
    ? `COALESCE(qe.display_title, ${alias}.title)`
    : `${alias}.title`;
}

function optionalInepSelectSql() {
  if (!databaseFeatures.inepMetadata) {
    return `NULL AS inep_item_code,
            NULL AS inep_area,
            NULL AS inep_skill_code,
            NULL AS inep_exam_code,
            NULL AS inep_position,
            NULL AS inep_book_color,
            NULL AS inep_tri_a,
            NULL AS inep_tri_b,
            NULL AS inep_tri_c,
            NULL AS inep_match_score`;
  }
  return `im.item_code AS inep_item_code,
          im.area AS inep_area,
          im.skill_code AS inep_skill_code,
          im.exam_code AS inep_exam_code,
          im.position AS inep_position,
          im.book_color AS inep_book_color,
          im.tri_a AS inep_tri_a,
          im.tri_b AS inep_tri_b,
          im.tri_c AS inep_tri_c,
          im.match_score AS inep_match_score`;
}

function optionalEnrichmentSelectSql() {
  if (!databaseFeatures.enrichment) {
    return `NULL AS enrichment_subject,
            NULL AS enrichment_topic,
            NULL AS enrichment_source`;
  }
  return `qe.subject AS enrichment_subject,
          qe.topic AS enrichment_topic,
          qe.source AS enrichment_source`;
}

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
  databaseFeatures = { inepMetadata: false, enrichment: false };
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
          AND name IN ('exams', 'questions', 'alternatives', 'question_files', 'search_index')`,
    ).map((row) => row.name);

    const missingTables = ['exams', 'questions', 'alternatives', 'question_files', 'search_index'].filter(
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

    const optionalTables = executeRows(
      nextDatabase,
      `SELECT name
         FROM sqlite_schema
        WHERE type = 'table'
          AND name IN ('question_inep_metadata', 'question_enrichment')`,
    ).map((row) => row.name);
    databaseFeatures = {
      inepMetadata: optionalTables.includes('question_inep_metadata'),
      enrichment: optionalTables.includes('question_enrichment'),
    };

    const counts = executeRows(nextDatabase, 'SELECT (SELECT count(*) FROM questions) AS question_count, (SELECT count(*) FROM exams) AS exam_count')[0];
    database = nextDatabase;

    return {
      ready: true,
      version: sqlite3.version?.libVersion ?? null,
      questionCount: Number(asNumber(counts?.question_count) ?? 0),
      examCount: Number(asNumber(counts?.exam_count) ?? 0),
      features: { ...databaseFeatures },
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

  // One option per value: labels may differ only by NBSP vs space across years.
  const disciplines = executeRows(
    db,
    `SELECT value, MIN(label) AS label
       FROM exam_disciplines
      GROUP BY value
      ORDER BY label COLLATE NOCASE, value`,
  );

  const languages = executeRows(
    db,
    `SELECT value, MIN(label) AS label
       FROM exam_languages
      GROUP BY value
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

  const normalized = value.normalize('NFKC').trim();
  if (!normalized) return { query: undefined, noMatches: false };

  const rawTokens = [];
  let i = 0;
  const len = normalized.length;

  while (i < len) {
    while (i < len && /\s/.test(normalized[i])) i++;
    if (i >= len) break;
    const ch = normalized[i];

    if (ch === '"') {
      const closing = normalized.indexOf('"', i + 1);
      if (closing === -1) {
        const phrase = normalized.slice(i + 1).trim();
        if (phrase) {
          const escaped = phrase.replaceAll('"', '""').replace(/\s+/g, ' ').trim();
          if (escaped && /[\p{L}\p{N}]/u.test(escaped)) rawTokens.push({ type: 'term', value: `"${escaped}"` });
        }
        break;
      }
      const phrase = normalized.slice(i + 1, closing);
      const escaped = phrase.replaceAll('"', '""').trim().replace(/\s+/g, ' ');
      if (escaped && /[\p{L}\p{N}]/u.test(escaped)) rawTokens.push({ type: 'term', value: `"${escaped}"` });
      i = closing + 1;
      continue;
    }

    if (ch === '(') { rawTokens.push({ type: 'lparen', value: '(' }); i++; continue; }
    if (ch === ')') { rawTokens.push({ type: 'rparen', value: ')' }); i++; continue; }

    if (ch === '-') {
      const next = normalized[i + 1];
      if (next && /[\p{L}\p{N}"]/u.test(next)) {
        rawTokens.push({ type: 'op', value: 'NOT' });
        i++;
        continue;
      }
      i++;
      continue;
    }

    const rest = normalized.slice(i);
    const nearMatch = rest.match(/^NEAR(\/\d+)?\b/i);
    if (nearMatch) {
      rawTokens.push({ type: 'op', value: nearMatch[0].toUpperCase() });
      i += nearMatch[0].length;
      continue;
    }
    const opMatch = rest.match(/^(AND|OR|NOT)\b/i);
    if (opMatch) {
      rawTokens.push({ type: 'op', value: opMatch[1].toUpperCase() });
      i += opMatch[1].length;
      continue;
    }

    const wordMatch = rest.match(/^[\p{L}\p{N}]+/u);
    if (wordMatch) {
      const word = wordMatch[0];
      const escaped = word.replaceAll('"', '""');
      rawTokens.push({ type: 'term', value: `"${escaped}"` });
      i += word.length;
      if (i < len && normalized[i] === '*') {
        const last = rawTokens[rawTokens.length - 1];
        last.value = `"${escaped}"*`;
        i++;
      }
      continue;
    }

    i++;
  }

  if (rawTokens.length === 0) return { query: undefined, noMatches: true };

  const output = [];
  for (const cur of rawTokens) {
    const prev = output[output.length - 1];
    if (prev) {
      const prevIsTermLike = prev.type === 'term' || prev.type === 'rparen';
      const curIsTermLike = cur.type === 'term' || cur.type === 'lparen';
      const curIsNot = cur.type === 'op' && cur.value === 'NOT';
      if (prevIsTermLike && (curIsTermLike || curIsNot)) {
        output.push({ type: 'op', value: 'AND' });
      }
    }
    output.push(cur);
  }

  while (output.length && output[0].type === 'op' && ['AND', 'OR'].includes(output[0].value)) output.shift();
  while (output.length && output[0].type === 'op' && output[0].value.startsWith('NEAR')) output.shift();
  while (output.length && output[output.length - 1].type === 'op') output.pop();

  // Remove empty parentheses pairs like ()
  const filtered = output.filter((tok, idx, arr) => {
    if (tok.type === 'lparen' && arr[idx + 1]?.type === 'rparen') return false;
    if (tok.type === 'rparen' && arr[idx - 1]?.type === 'lparen') return false;
    return true;
  });

  const hasTerm = filtered.some((t) => t.type === 'term');
  if (!hasTerm) return { query: undefined, noMatches: true };

  const query = filtered.map((t) => t.value).join(' ');
  if (!query) return { query: undefined, noMatches: true };
  return { query, noMatches: false };
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
    conditions.push(`${effectiveDisciplineSql('q')} = $discipline`);
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
    sourceTitle: row.source_title ?? row.title,
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
       ${optionalQuestionJoins('q')}
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
              ${effectiveTitleSql('q')} AS title,
              q.title AS source_title,
              ${effectiveDisciplineSql('q')} AS discipline,
              q.context,
              q.alternatives_introduction
         FROM questions AS q
         ${optionalQuestionJoins('q')}
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
           paged.source_title,
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
      `SELECT q.id, q.year, q.number, q.language,
              ${effectiveTitleSql('q')} AS title,
              q.title AS source_title,
              ${effectiveDisciplineSql('q')} AS discipline,
              q.context, q.alternatives_introduction, q.correct_alternative, q.source_path,
              ${optionalInepSelectSql()},
              ${optionalEnrichmentSelectSql()}
         FROM questions AS q
         ${optionalQuestionJoins('q')}
        WHERE q.id = $id`,
      { $id: id },
    );
  } else {
    const bind = { $year: year, $number: number };
    const conditions = ['q.year = $year', 'q.number = $number'];
    if (language !== undefined) {
      conditions.push('q.language = $language');
      bind.$language = language;
    }
    rows = executeRows(
      db,
      `SELECT q.id, q.year, q.number, q.language,
              ${effectiveTitleSql('q')} AS title,
              q.title AS source_title,
              ${effectiveDisciplineSql('q')} AS discipline,
              q.context, q.alternatives_introduction, q.correct_alternative, q.source_path,
              ${optionalInepSelectSql()},
              ${optionalEnrichmentSelectSql()}
         FROM questions AS q
         ${optionalQuestionJoins('q')}
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
    sourceTitle: questionRow.source_title ?? questionRow.title,
    discipline: questionRow.discipline ?? null,
    context: questionRow.context ?? null,
    alternativesIntroduction: questionRow.alternatives_introduction ?? null,
    correctAlternative: questionRow.correct_alternative ?? null,
    sourcePath: questionRow.source_path,
    alternatives,
    files: urls,
    urls,
    inep: questionRow.inep_item_code == null ? null : {
      itemCode: Number(asNumber(questionRow.inep_item_code)),
      area: questionRow.inep_area,
      skillCode: questionRow.inep_skill_code == null ? null : Number(asNumber(questionRow.inep_skill_code)),
      examCode: Number(asNumber(questionRow.inep_exam_code)),
      position: Number(asNumber(questionRow.inep_position)),
      bookColor: questionRow.inep_book_color ?? null,
      tri: {
        a: questionRow.inep_tri_a == null ? null : Number(asNumber(questionRow.inep_tri_a)),
        b: questionRow.inep_tri_b == null ? null : Number(asNumber(questionRow.inep_tri_b)),
        c: questionRow.inep_tri_c == null ? null : Number(asNumber(questionRow.inep_tri_c)),
      },
      matchScore: questionRow.inep_match_score == null ? null : Number(asNumber(questionRow.inep_match_score)),
    },
    enrichment: questionRow.enrichment_source == null ? null : {
      subject: questionRow.enrichment_subject ?? null,
      topic: questionRow.enrichment_topic ?? null,
      source: questionRow.enrichment_source,
    },
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
