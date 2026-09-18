import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDatabaseSql,
  parseArgs,
  validateExamDetail,
  validateQuestionDetail,
} from '../scripts/build-database.mjs';

const exam = {
  title: 'ENEM 2099',
  year: 2099,
  disciplines: [{ label: 'Linguagens', value: 'linguagens' }],
  languages: [],
  questions: [
    { title: 'Questão 1 - ENEM 2099', index: 1, discipline: 'linguagens', language: null },
    { title: 'Questão 1 - ENEM 2099', index: 1, discipline: 'linguagens', language: null },
  ],
};

const question = {
  title: 'Questão 1 - ENEM 2099',
  index: 1,
  year: 2099,
  language: null,
  discipline: 'linguagens',
  context: 'Texto de teste.',
  files: ['https://enem.dev/2099/questions/1/example.png'],
  correctAlternative: 'A',
  alternativesIntroduction: 'Escolha a alternativa correta.',
  alternatives: [
    { letter: 'A', text: 'Correta', file: null, isCorrect: true },
    { letter: 'B', text: 'Incorreta', file: null, isCorrect: false },
  ],
};

test('aceita posições duplicadas no resumo da prova', () => {
  assert.doesNotThrow(() => validateExamDetail(exam, 'fixture.exam'));
});

test('rejeita alternativa com letra inválida', () => {
  assert.throws(() => validateQuestionDetail({ ...question, alternatives: [{ ...question.alternatives[0], letter: 'F' }] }, 'fixture.question', 2099), /letra inválida/);
});

test('parseArgs normaliza flags e mantém saída canônica por padrão', () => {
  const options = parseArgs(['--delay-ms', '250', '--max-retries=3', '--verbose']);
  assert.equal(options.delayMs, 250);
  assert.equal(options.maxRetries, 3);
  assert.equal(options.verbose, true);
  assert.match(options.output, /enem\.sqlite$/);
});

test('schema gerado contém FTS5, URLs e transação', () => {
  const sql = createDatabaseSql(
    [{ title: exam.title, year: exam.year, disciplines: exam.disciplines, languages: [] }],
    [{ detail: exam, records: [{ summary: exam.questions[0], detail: question }] }],
  );
  assert.match(sql, /CREATE VIRTUAL TABLE search_index USING fts5/);
  assert.match(sql, /question_files/);
  assert.match(sql, /https:\/\/enem\.dev/);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
});
