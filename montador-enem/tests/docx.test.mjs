import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { buildDocumentXml, buildDocxBuffer, collectImageUrls, fetchImageParts } from '../src/docx.js';

function sample() {
  const header = {
    title: 'Simulado ENEM',
    institution: 'Escola Teste',
    subject: 'Biologia',
    teacher: 'Prof. Teste',
    className: '3º A',
    date: '25/09/2026',
    instructions: 'Leia com atenção.',
  };
  const variant = {
    label: 'A',
    questions: [
      {
        number: 52,
        year: 2023,
        title: 'Questão 52 - ENEM 2023',
        context: 'Texto da questão com **negrito**.',
        alternativesIntroduction: 'Escolha uma opção.',
        files: [],
        points: 2,
        correctAlternative: 'B',
        alternatives: [
          { letter: 'A', text: 'Texto A', isCorrect: false },
          { letter: 'B', text: 'Texto B', isCorrect: true },
        ],
      },
    ],
  };
  return { header, variant };
}

test('document.xml traz cabeçalho, questão e alternativa', () => {
  const { header, variant } = sample();
  const xml = buildDocumentXml(header, variant, false, false);
  assert.match(xml, /Simulado ENEM/);
  assert.match(xml, /Questão 01/);
  assert.match(xml, /Texto da questão/);
  assert.match(xml, /A\) Texto A/);
});

test('versão do professor marca resposta e gabarito', () => {
  const { header, variant } = sample();
  const xml = buildDocumentXml(header, variant, true, false);
  assert.match(xml, /Resposta correta/);
  assert.match(xml, /Gabarito/);
});

test('tabela de metadados tem grade de 2 colunas com larguras', () => {
  const { header, variant } = sample();
  const xml = buildDocumentXml(header, variant, false, false);
  const table = xml.match(/<w:tbl>.*?<\/w:tbl>/s)[0];
  assert.equal(table.match(/<w:gridCol/g).length, 2);
  assert.match(table, /<w:tblW w:w="10204" w:type="dxa"\/>/);
  assert.match(table, /<w:shd w:val="clear" w:fill="222222"\/>/);
  const bodyRows = table.match(/<w:tr>.*?<\/w:tr>/gs).slice(1);
  assert.ok(bodyRows.every(row => !row.includes('<w:b/>')), 'valores de metadados não ficam todos em negrito');
});

test('não permite gerar documento com imagem ausente', () => {
  const { header, variant } = sample();
  variant.questions[0].files = ['asset:media/2023/questions/127/img.png'];
  assert.throws(() => buildDocumentXml(header, variant, false, false), /imagem.*não foi carregada/);
});

test('imagem embutida vira desenho DrawingML com relId', () => {
  const { header, variant } = sample();
  const images = new Map([['https://example.test/q.png', {
    url: 'https://example.test/q.png', alt: 'gráfico', bytes: new Uint8Array([1, 2, 3]),
    ext: 'png', contentType: 'image/png', fileName: 'image1.png',
    cx: 1000, cy: 800, relId: 'rIdImage1', docId: 1001,
  }]]);
  variant.questions[0].context += '\n\n![](https://example.test/q.png)';
  const xml = buildDocumentXml(header, variant, false, false, images);
  assert.match(xml, /<w:drawing>/);
  assert.match(xml, /r:embed="rIdImage1"/);
  assert.doesNotMatch(xml, /\[Imagem: https:\/\/example\.test\/q\.png/);
});

test('collectImageUrls ordena inline, extras e alternativas sem duplicar', () => {
  const question = {
    context: 'Ver ![](https://example.test/a.png) e ![](https://example.test/a.png).',
    alternativesIntroduction: '',
    files: ['https://example.test/a.png', 'https://example.test/b.png'],
    alternatives: [{ letter: 'A', text: 'ok', file: 'https://example.test/c.png' }],
  };
  assert.deepEqual(collectImageUrls(question).map((image) => image.url), [
    'https://example.test/a.png',
    'https://example.test/b.png',
    'https://example.test/c.png',
  ]);
});

test('fetchImageParts baixa data URL e detecta png', async () => {
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const parts = await fetchImageParts([{ url: dataUrl, alt: 'pixel' }]);
  const part = parts.get(dataUrl);
  assert.ok(part);
  assert.equal(part.ext, 'png');
  assert.equal(part.fileName, 'image1.png');
  assert.ok(part.cx > 0 && part.cy > 0);
});

test('buffer gerado é um ZIP docx válido com document.xml', async () => {
  const { header, variant } = sample();
  const buffer = await buildDocxBuffer(header, variant, false, true);
  assert.equal(buffer[0], 0x50);
  assert.equal(buffer[1], 0x4b);
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);
  assert.ok(names.includes('word/document.xml'));
  assert.ok(names.includes('[Content_Types].xml'));
  const documentXml = await zip.file('word/document.xml').async('string');
  assert.match(documentXml, /Folha de respostas/);
});

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('preserva ordem texto/imagem/legenda e rotula alternativa exclusivamente visual sem duplicar', async () => {
  const { header, variant } = sample();
  variant.questions[0].context = 'Antes.\n\n![](' + pixel + ')\n\nLegenda depois.';
  variant.questions[0].alternatives[0] = { letter: 'A', text: '![](' + pixel + ')', file: pixel };
  const zip = await JSZip.loadAsync(await buildDocxBuffer(header, variant, false, false));
  const xml = await zip.file('word/document.xml').async('string');
  assert.ok(xml.indexOf('Antes.') < xml.indexOf('<w:drawing>'));
  assert.ok(xml.indexOf('<w:drawing>') < xml.indexOf('Legenda depois.'));
  assert.equal((xml.match(/<w:drawing>/g) || []).length, 2);
  assert.ok(xml.includes('A) '));
  const ids = [...xml.matchAll(/wp:docPr id="(\d+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(Object.keys(zip.files).filter(name => /word\/media\/[^/]+$/.test(name)).length, 1);
});

test('preserva tabela, entidades e índices científicos', () => {
  const { header, variant } = sample();
  variant.questions[0].context = '**Título** e *ênfase* H<sub>2</sub>O x<sup>2</sup> &amp; &#176;\n\n| Coluna | Valor |\n| --- | --- |\n| Água | 10 |';
  const xml = buildDocumentXml(header, variant, false, false);
  assert.match(xml, /w:val="subscript"/);
  assert.match(xml, /w:val="superscript"/);
  assert.match(xml, /<w:i\/>/);
  assert.match(xml, /&amp; °/);
  assert.equal((xml.match(/<w:tbl>/g) || []).length, 2);
  assert.doesNotMatch(xml, /\*\*Título/);
});

test('imagem que retorna HTML com status 200 não vira mídia corrompida', async () => {
  await assert.rejects(fetchImageParts([{ url: 'data:text/html,<html>oops</html>' }]), /Não foi possível carregar/);
});

test('rejeita pontuação e gabarito inconsistentes', async () => {
  const { header, variant } = sample();
  variant.questions[0].points = -1;
  await assert.rejects(buildDocxBuffer(header, variant, false, false), /pontos/);
  variant.questions[0].points = 1;
  variant.questions[0].correctAlternative = 'A';
  await assert.rejects(buildDocxBuffer(header, variant, false, false), /gabarito/);
});

test('folha de respostas e gabarito iniciam em nova página, aluno não recebe respostas', () => {
  const { header, variant } = sample();
  const student = buildDocumentXml(header, variant, false, true);
  assert.match(student, /<w:pageBreakBefore\/>/);
  assert.doesNotMatch(student, /Resposta correta|Gabarito/);
  const teacher = buildDocumentXml(header, variant, true, false);
  assert.match(teacher, /<w:pageBreakBefore\/>/);
  assert.doesNotMatch(teacher, /Folha de respostas/);
});

test('equação com imagem pequena permanece no mesmo parágrafo que a fórmula', async () => {
  const { header, variant } = sample();
  variant.questions[0].context = 'Potencial ![](' + pixel + ') (Fe/Fe²⁺).';
  const zip = await JSZip.loadAsync(await buildDocxBuffer(header, variant, false, false));
  const xml = await zip.file('word/document.xml').async('string');
  const paragraph = xml.match(/<w:p>.*?<\/w:p>/gs).find(p => p.includes('Potencial'));
  assert.ok(paragraph.includes('<w:drawing>') && paragraph.includes('(Fe/Fe²⁺).'));
});

test('imagens das instruções também são empacotadas', async () => {
  const { header, variant } = sample();
  header.instructions = '![](' + pixel + ')';
  const zip = await JSZip.loadAsync(await buildDocxBuffer(header, variant, false, false));
  assert.match(await zip.file('word/document.xml').async('string'), /<w:drawing>/);
});
