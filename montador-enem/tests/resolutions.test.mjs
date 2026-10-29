import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { parseCsv, matchResolutions, importResolutions } from '../scripts/import-poliedro-resolutions.mjs';
import { hasResolution, renderResolution } from '../src/resolutions.js';

const statement = 'Uma empresa de transportes comprou três veículos novos para melhorar o atendimento aos moradores do bairro.';
const record = {
  ano: '2025', tipo: 'questao', numero: '165', idioma: '', caderno: 'amarelo', resposta: 'B',
  enunciado: statement, resolucao: '36 + 20/100 · 36 = 43,20',
  url: 'https://poliedroresolve.sistemapoliedro.com.br/vestibulares/enem/2025/questao-165',
};
const question = {
  id: 17, year: 2025, number: 158, language: null, context: statement,
  alternatives_introduction: null, correct_alternative: 'B',
};

test('CSV preserva parágrafos, vírgulas, aspas e CRLF', () => {
  const csv = '\uFEFFano,tipo,numero,idioma,caderno,resposta,enunciado,resolucao,url\r\n2025,questao,1,,amarelo,B,"Texto, com vírgula","Linha 1\n""Linha 2""",https://example.test\r\n';
  const [row] = parseCsv(csv);
  assert.equal(row.enunciado, 'Texto, com vírgula');
  assert.equal(row.resolucao, 'Linha 1\n"Linha 2"');
  assert.throws(() => parseCsv(csv + '"incompleto'), /não terminado/);
  assert.throws(() => parseCsv('ano\n2025'), /Coluna ausente/);
});

test('associa pelo enunciado, não pela numeração de cadernos distintos', () => {
  const [match] = matchResolutions([record], [question]);
  assert.equal(match.questionId, 17);
  assert.equal(match.number, 158);
  assert.equal(match.sourceNumber, 165);
  assert.equal(match.matchScore, 1);
});

test('rejeita ambiguidade, duplicidade, baixa similaridade e gabarito divergente', () => {
  assert.throws(() => matchResolutions([record], [question, { ...question, id: 18 }]), /insegura/);
  assert.throws(() => matchResolutions([record, record], [question]), /duplicado/);
  assert.throws(() => matchResolutions([{ ...record, enunciado: 'outra questão' }], [question]), /insegura/);
  assert.throws(() => matchResolutions([{ ...record, resposta: 'C' }], [question]), /Gabarito divergente/);
  assert.throws(() => matchResolutions([{ ...record, resposta: '' }], [question]), /Gabarito divergente/);
});

test('separa idiomas e anos, ignora redações e resoluções vazias', () => {
  const english = { ...record, idioma: 'Inglês' };
  const spanish = { ...question, id: 18, language: 'espanhol' };
  assert.throws(() => matchResolutions([english], [spanish, question]), /insegura/);
  const [match] = matchResolutions([english], [spanish, { ...question, language: 'ingles' }]);
  assert.equal(match.language, 'ingles');
  assert.deepEqual(matchResolutions([{ ...record, ano: '2023' }, { ...record, tipo: 'redacao' }, { ...record, resolucao: ' ' }], [question]), []);
});

test('permite resolução de anulada sem sobrescrever o gabarito', () => {
  const [match] = matchResolutions([{ ...record, resposta: 'ANL' }], [{ ...question, correct_alternative: '' }]);
  assert.equal(match.sourceAnswer, 'ANL');
  assert.match(renderResolution(match, true), /Questão anulada/);
});

test('importação é idempotente, preserva dados e reverte integralmente em caso de erro', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE questions (id INTEGER PRIMARY KEY, context TEXT); INSERT INTO questions VALUES (17, 'original');
      CREATE TABLE question_inep_metadata (question_id INTEGER, item_code INTEGER); INSERT INTO question_inep_metadata VALUES (17, 123);`);
    const matches = matchResolutions([record], [question]);
    importResolutions(db, matches);
    importResolutions(db, matches);
    assert.equal(db.prepare('SELECT count(*) AS n FROM question_resolutions').get().n, 1);
    assert.equal(db.prepare('SELECT context FROM questions').get().context, 'original');
    assert.equal(db.prepare('SELECT item_code FROM question_inep_metadata').get().item_code, 123);
    assert.throws(() => importResolutions(db, [{ ...matches[0], body: 'changed' }, { ...matches[0], questionId: 999 }]), /FOREIGN KEY/);
    assert.equal(db.prepare('SELECT body FROM question_resolutions').get().body, record.resolucao);
  } finally { db.close(); }
});

test('resolução e URLs das imagens não entram no HTML antes do clique', () => {
  const resolution = { body: 'Segredo [imagem: https://azstgpoliedroresolveprd.blob.core.windows.net/a.png]' };
  assert.equal(hasResolution(resolution), true);
  assert.equal(hasResolution(null), false);
  assert.equal(hasResolution({ body: ' ' }), false);
  assert.equal(renderResolution(resolution), '');
  assert.equal(renderResolution(resolution, false), '');
  assert.equal(renderResolution(null, true), '');
});

test('renderiza literalmente fórmulas e apenas imagens da resolução, escapando conteúdo e URLs perigosas', () => {
  const resolution = {
    ...matchResolutions([record], [question])[0],
    body: 'n_1 = 24\n50 ≤ P < 60\n<script>alert(1)</script>\n[imagem: https://azstgpoliedroresolveprd.blob.core.windows.net/a b.png]\n[imagem: javascript:alert(1)]',
  };
  const html = renderResolution(resolution, true);
  assert.match(html, /n_1 = 24\n50 ≤ P &lt; 60/);
  assert.doesNotMatch(html, /<script|<img[^>]*javascript:/);
  assert.match(html, /a%20b.png/);
  assert.doesNotMatch(html, /<a |Poliedro|Fonte:|caderno amarelo|questão 165/);
  assert.doesNotMatch(html, /poliedroresolve.sistemapoliedro.com.br/);
});

test('CSV real de 2024/2025 produz 370 vínculos únicos, com idiomas e gabaritos conferidos', async () => {
  const records = parseCsv(await readFile(new URL('../../data/poliedro/resolucoes-enem-2009-2025.csv', import.meta.url), 'utf8'));
  const db = new DatabaseSync(new URL('../../enem.sqlite', import.meta.url), { readOnly: true });
  try {
    const matches = matchResolutions(records, db.prepare('SELECT * FROM questions').all());
    assert.equal(matches.length, 370);
    assert.equal(new Set(matches.map((match) => match.questionId)).size, 370);
    for (const year of [2024, 2025]) {
      const items = matches.filter((match) => match.year === year);
      assert.equal(items.length, 185);
      assert.equal(items.filter((match) => match.language === 'ingles').length, 5);
      assert.equal(items.filter((match) => match.language === 'espanhol').length, 5);
    }
    const clinical = matches.find((match) => match.year === 2025 && match.number === 165);
    assert.match(clinical.body, /grupo|mulheres/i);
    assert.notEqual(clinical.sourceNumber, 165);
  } finally { db.close(); }
});
