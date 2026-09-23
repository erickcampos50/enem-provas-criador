import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { buildRewriteSql, assetKeyFor, isImageFile } from '../scripts/localize-question-images.mjs';
import { importYear } from '../scripts/import-extracted-years.mjs';

test('assetKeyFor maps year media under media/ and leaves root assets alone', () => {
  assert.equal(assetKeyFor('2009/questions/1/a.png'), 'asset:media/2009/questions/1/a.png');
  assert.equal(assetKeyFor('broken-image.svg'), 'asset:broken-image.svg');
});

test('isImageFile recognizes hosted extensions', () => {
  assert.equal(isImageFile('a.PNG'), true);
  assert.equal(isImageFile('a.jpg'), true);
  assert.equal(isImageFile('details.json'), false);
});

test('buildRewriteSql emits transactional replace statements', () => {
  const sql = buildRewriteSql([{ remote: 'https://enem.dev/2009/questions/1/a.png', asset: 'asset:media/2009/questions/1/a.png' }]);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /COMMIT;/);
  assert.match(sql, /replace\(url/);
});

test('importYear inserts exam, questions, alternatives and files incrementally', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'enem-import-'));
  const dbPath = join(dir, 'test.sqlite');
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE source_documents (path TEXT PRIMARY KEY, kind TEXT NOT NULL, json_text TEXT NOT NULL);
      CREATE TABLE exams (year INTEGER PRIMARY KEY, title TEXT NOT NULL, source_path TEXT NOT NULL);
      CREATE TABLE exam_disciplines (year INTEGER NOT NULL, value TEXT NOT NULL, label TEXT NOT NULL, PRIMARY KEY (year, value));
      CREATE TABLE exam_languages (year INTEGER NOT NULL, value TEXT NOT NULL, label TEXT NOT NULL, PRIMARY KEY (year, value));
      CREATE TABLE questions (
        id INTEGER PRIMARY KEY, year INTEGER NOT NULL, number INTEGER NOT NULL, language TEXT,
        title TEXT NOT NULL, discipline TEXT, context TEXT, alternatives_introduction TEXT,
        correct_alternative TEXT, source_path TEXT NOT NULL
      );
      CREATE TABLE exam_questions (
        year INTEGER NOT NULL, position INTEGER NOT NULL, number INTEGER NOT NULL, language TEXT,
        title TEXT NOT NULL, discipline TEXT, question_id INTEGER
      );
      CREATE TABLE alternatives (
        id INTEGER PRIMARY KEY, question_id INTEGER NOT NULL, letter TEXT NOT NULL,
        text TEXT, file_url TEXT, is_correct INTEGER NOT NULL
      );
      CREATE TABLE question_files (
        id INTEGER PRIMARY KEY, question_id INTEGER NOT NULL, position INTEGER NOT NULL, url TEXT NOT NULL
      );
    `);

    const exam = {
      title: 'ENEM 2099',
      year: 2099,
      disciplines: [{ label: 'Linguagens', value: 'linguagens' }],
      languages: [{ label: 'Inglês', value: 'ingles' }],
      questions: [
        { title: 'Questão 1 - ENEM 2099', index: 1, discipline: 'linguagens', language: 'ingles' },
      ],
    };
    const questions = [
      {
        title: 'Questão 1 - ENEM 2099',
        index: 1,
        year: 2099,
        language: 'ingles',
        discipline: 'linguagens',
        context: 'Texto',
        files: ['asset:media/2099/questions/1-ingles/img-0.png'],
        correctAlternative: 'B',
        alternativesIntroduction: 'Intro',
        alternatives: [
          { letter: 'A', text: 'a', file: null, isCorrect: false },
          { letter: 'B', text: 'b', file: null, isCorrect: true },
          { letter: 'C', text: null, file: null, isCorrect: false },
          { letter: 'D', text: 'd', file: null, isCorrect: false },
          { letter: 'E', text: 'e', file: null, isCorrect: false },
        ],
      },
    ];

    const stats = importYear(db, exam, questions, { verbose: false });
    assert.equal(stats.questions, 1);
    assert.equal(stats.alternatives, 5);
    assert.equal(stats.files, 1);

    const question = db.prepare('SELECT * FROM questions WHERE year = 2099').get();
    assert.equal(question.correct_alternative, 'B');
    const correct = db
      .prepare('SELECT letter FROM alternatives WHERE question_id = ? AND is_correct = 1')
      .get(question.id);
    assert.equal(correct.letter, 'B');
    const file = db.prepare('SELECT url FROM question_files WHERE question_id = ?').get(question.id);
    assert.equal(file.url, 'asset:media/2099/questions/1-ingles/img-0.png');

    assert.throws(() => importYear(db, exam, questions, { verbose: false }), /já existe/);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true });
  }
});
