import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatQuestionSource, getUniqueQuestionFiles } from '../src/exports.js';

const contextImage = 'https://example.test/context.png';
const extraImage = 'https://example.test/extra.png';
const alternativeImage = 'https://example.test/alternative.png';

function question() {
  return {
    title: 'Questão com imagem',
    context: ['Texto.', '', '![](' + contextImage + ')'].join('\n'),
    alternativesIntroduction: 'Escolha uma opção.',
    files: [contextImage, extraImage, contextImage],
    alternatives: [
      { letter: 'A', text: '![](' + alternativeImage + ')', file: alternativeImage, isCorrect: true },
      { letter: 'B', text: 'Texto B', file: null, isCorrect: false },
    ],
  };
}

test('não duplica arquivos já embutidos no Markdown', () => {
  assert.deepEqual(getUniqueQuestionFiles(question()), [extraImage]);
});

test('mantém o alinhamento das alternativas no preview e na impressão', () => {
  const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const exportsSource = fs.readFileSync(new URL('../src/exports.js', import.meta.url), 'utf8');
  assert.match(styles, /\.question-preview \.alternative \{ display: flex; align-items: flex-start;/);
  assert.match(exportsSource, /\.alternative \{ display: flex; align-items: flex-start;/);
});


test('exibe a fonte da questão de forma discreta e sem repetir o identificador', () => {
  assert.equal(formatQuestionSource('Questão 42 - ENEM 2023'), 'ENEM 2023');
  assert.equal(formatQuestionSource('Banco externo'), 'Banco externo');
});
