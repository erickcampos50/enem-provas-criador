#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = 'Poliedro Resolve';

// CSV quoted fields can contain commas, escaped quotes and multiple paragraphs.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = []; field = '';
    } else field += ch;
  }
  if (quoted) throw new Error('CSV com campo entre aspas não terminado.');
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift() ?? [];
  for (const name of ['ano', 'tipo', 'numero', 'idioma', 'caderno', 'resposta', 'enunciado', 'resolucao', 'url']) {
    if (!headers.includes(name)) throw new Error(`Coluna ausente no CSV: ${name}`);
  }
  return rows.filter((values) => values.some(Boolean)).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Registro CSV ${index + 2} tem número incorreto de campos.`);
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}

function normalize(text) {
  return String(text ?? '').replace(/\[imagem:[^\]]*\]/gi, ' ')
    .normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function trigrams(text) {
  const words = normalize(text);
  return new Set(words.slice(0, -2).map((word, i) => `${word} ${words[i + 1]} ${words[i + 2]}`));
}

export function matchResolutions(records, questions, years = [2024, 2025]) {
  const candidates = questions.map((question) => ({
    ...question,
    grams: trigrams(`${question.context ?? ''} ${question.alternatives_introduction ?? ''}`),
  }));
  const used = new Set();
  return records.filter((record) => years.includes(Number(record.ano)) && record.tipo === 'questao' && record.resolucao.trim())
    .map((record) => {
      const label = `${record.ano}/${record.numero}/${record.idioma || 'geral'}`;
      const language = normalize(record.idioma).join('');
      if (!['', 'ingles', 'espanhol'].includes(language)) throw new Error(`Idioma desconhecido: ${label}`);
      const sourceUrl = new URL(record.url);
      if (sourceUrl.protocol !== 'https:' || sourceUrl.hostname !== 'poliedroresolve.sistemapoliedro.com.br') {
        throw new Error(`URL de origem inválida: ${label}`);
      }
      const grams = trigrams(record.enunciado);
      const ranked = candidates.filter((question) => question.year === Number(record.ano) &&
        (question.language ?? '') === language).map((question) => {
        const shared = [...grams].filter((gram) => question.grams.has(gram)).length;
        return { question, shared, score: 2 * shared / Math.max(1, grams.size + question.grams.size) };
      }).sort((a, b) => b.score - a.score);
      const best = ranked[0];
      const margin = (best?.score ?? 0) - (ranked[1]?.score ?? 0);
      // Never guess from numbering or answer alone: different book colors reorder items.
      if (!best || best.score < 0.4 || best.shared < 6 || margin < 0.2) {
        throw new Error(`Correspondência insegura: ${label} (score=${best?.score ?? 0}, margem=${margin}). Revise antes de importar.`);
      }
      const answer = record.resposta.trim().toUpperCase();
      if (!['A', 'B', 'C', 'D', 'E', 'ANL'].includes(answer) ||
          (answer !== 'ANL' && answer !== best.question.correct_alternative)) {
        throw new Error(`Gabarito divergente: ${label} → questão ${best.question.number}. Revise antes de importar.`);
      }
      if (used.has(best.question.id)) throw new Error(`Vínculo duplicado para a questão ${best.question.id}: ${label}`);
      used.add(best.question.id);
      return {
        questionId: best.question.id, year: best.question.year, number: best.question.number, language: language || null,
        source: SOURCE, sourceNumber: Number(record.numero), sourceBookColor: record.caderno,
        sourceAnswer: answer, sourceUrl: sourceUrl.href, body: record.resolucao.trim(),
        matchMethod: 'enunciado-trigram-dice-v1', matchScore: best.score, matchMargin: margin,
      };
    });
}

export function importResolutions(db, matches) {
  db.exec('PRAGMA foreign_keys = ON; BEGIN');
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS question_resolutions (
      question_id INTEGER PRIMARY KEY REFERENCES questions(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      source_url TEXT NOT NULL,
      source_number INTEGER NOT NULL,
      source_book_color TEXT NOT NULL,
      source_answer TEXT NOT NULL,
      body TEXT NOT NULL CHECK (length(trim(body)) > 0),
      match_method TEXT NOT NULL,
      match_score REAL NOT NULL CHECK (match_score BETWEEN 0 AND 1),
      match_margin REAL NOT NULL CHECK (match_margin BETWEEN 0 AND 1)
    )`);
    const upsert = db.prepare(`INSERT INTO question_resolutions
      (question_id, source, source_url, source_number, source_book_color, source_answer, body, match_method, match_score, match_margin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(question_id) DO UPDATE SET source=excluded.source, source_url=excluded.source_url,
      source_number=excluded.source_number, source_book_color=excluded.source_book_color,
      source_answer=excluded.source_answer, body=excluded.body, match_method=excluded.match_method,
      match_score=excluded.match_score, match_margin=excluded.match_margin`);
    for (const item of matches) {
      upsert.run(item.questionId, item.source, item.sourceUrl, item.sourceNumber, item.sourceBookColor,
        item.sourceAnswer, item.body, item.matchMethod, item.matchScore, item.matchMargin);
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Falha na integridade referencial.');
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Falha no integrity_check.');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

async function main() {
  const options = {
    database: resolve(projectRoot, 'enem.sqlite'),
    csv: resolve(projectRoot, 'data/poliedro/resolucoes-enem-2009-2025.csv'),
    years: [2024, 2025], dryRun: false, report: null,
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--help') {
      console.log('Uso: npm run import:poliedro -- [--csv PATH] [--database PATH] [--years 2024,2025] [--dry-run] [--report PATH]');
      return;
    } else if (['--database', '--csv', '--report', '--years'].includes(flag)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw new Error(`${flag} exige um valor.`);
      if (flag === '--years') {
        options.years = value.split(',').map(Number);
        if (options.years.some((year) => !Number.isInteger(year) || year < 1998)) throw new Error('Anos inválidos.');
      } else options[flag.slice(2)] = resolve(value);
    } else throw new Error(`Opção desconhecida: ${flag}`);
  }
  const records = parseCsv(await readFile(options.csv, 'utf8'));
  const db = new DatabaseSync(options.database, { readOnly: options.dryRun });
  try {
    const matches = matchResolutions(records, db.prepare('SELECT * FROM questions').all(), options.years);
    if (!matches.length) throw new Error('Nenhuma resolução disponível para importar.');
    if (!options.dryRun) importResolutions(db, matches);
    if (options.report) {
      const links = matches.map(({ body, ...link }) => link);
      await writeFile(options.report, `${JSON.stringify({ dryRun: options.dryRun, count: matches.length, links }, null, 2)}\n`);
    }
    for (const year of options.years) console.log(`${year}: ${matches.filter((item) => item.year === year).length} resoluções vinculadas`);
    console.log(`${options.dryRun ? 'Simulação' : 'Importação'} concluída: ${matches.length} resoluções; IDs e metadados preservados.`);
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[import-poliedro] ${error.message}`); process.exitCode = 1; });
}
