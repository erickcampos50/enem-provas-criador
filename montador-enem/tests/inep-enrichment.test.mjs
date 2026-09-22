import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDisplayTitle,
  matchQuestionsToItems,
  normalizeLanguageCode,
  parseDelimited,
} from '../scripts/inep-enrichment-lib.mjs';

test('parseDelimited lê o cabeçalho oficial com ponto e vírgula', () => {
  const rows = parseDelimited(
    'CO_POSICAO;SG_AREA;CO_ITEM;TX_GABARITO;CO_HABILIDADE;CO_PROVA;TP_LINGUA\n' +
    '91;CN;84422;D;4;1221;\n' +
    '92;CN;83378;B;3;1221;\n',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].CO_ITEM, '84422');
  assert.equal(rows[1].CO_HABILIDADE, '3');
});


test('normaliza TP_LINGUA decimal dos snapshots', () => {
  assert.equal(normalizeLanguageCode('0.0'), '0');
  assert.equal(normalizeLanguageCode('1.0'), '1');
  assert.equal(normalizeLanguageCode(1), '1');
  assert.equal(normalizeLanguageCode(''), '');
});

test('casamento de língua aceita TP_LINGUA 0.0 e 1.0', () => {
  const questions = [
    { id: 1, number: 1, language: 'ingles', correctAlternative: 'C' },
    { id: 2, number: 2, language: 'ingles', correctAlternative: 'A' },
    { id: 3, number: 3, language: 'ingles', correctAlternative: 'B' },
  ];
  const items = [
    { CO_POSICAO: '1', SG_AREA: 'LC', CO_ITEM: '1', TX_GABARITO: 'C', CO_HABILIDADE: '7', CO_PROVA: '889', TP_LINGUA: '0.0' },
    { CO_POSICAO: '2', SG_AREA: 'LC', CO_ITEM: '2', TX_GABARITO: 'A', CO_HABILIDADE: '8', CO_PROVA: '889', TP_LINGUA: '0.0' },
    { CO_POSICAO: '3', SG_AREA: 'LC', CO_ITEM: '3', TX_GABARITO: 'B', CO_HABILIDADE: '5', CO_PROVA: '889', TP_LINGUA: '0.0' },
  ];
  const result = matchQuestionsToItems(questions, items, {
    minCovered: 3,
    minPrecision: 1,
    offsetRange: 0,
  });
  assert.equal(result.assigned.size, 3);
  assert.equal(result.unresolved.length, 0);
});

test('casamento usa gabarito e posição e não confia na disciplina da fonte', () => {
  const questions = [
    { id: 1, number: 91, language: null, discipline: 'ciencias-natureza', correctAlternative: 'D' },
    { id: 2, number: 92, language: null, discipline: 'ciencias-natureza', correctAlternative: 'B' },
    { id: 3, number: 93, language: null, discipline: 'ciencias-humanas', correctAlternative: 'E' },
    { id: 4, number: 94, language: null, discipline: 'ciencias-humanas', correctAlternative: 'A' },
    { id: 5, number: 95, language: null, discipline: 'ciencias-natureza', correctAlternative: 'B' },
  ];
  const items = [
    { CO_POSICAO: '91', SG_AREA: 'CN', CO_ITEM: '84422', TX_GABARITO: 'D', CO_HABILIDADE: '4', CO_PROVA: '1221', TP_LINGUA: '' },
    { CO_POSICAO: '92', SG_AREA: 'CN', CO_ITEM: '83378', TX_GABARITO: 'B', CO_HABILIDADE: '3', CO_PROVA: '1221', TP_LINGUA: '' },
    { CO_POSICAO: '93', SG_AREA: 'CN', CO_ITEM: '117887', TX_GABARITO: 'E', CO_HABILIDADE: '12', CO_PROVA: '1221', TP_LINGUA: '' },
    { CO_POSICAO: '94', SG_AREA: 'CN', CO_ITEM: '66330', TX_GABARITO: 'A', CO_HABILIDADE: '7', CO_PROVA: '1221', TP_LINGUA: '' },
    { CO_POSICAO: '95', SG_AREA: 'CN', CO_ITEM: '48492', TX_GABARITO: 'B', CO_HABILIDADE: '28', CO_PROVA: '1221', TP_LINGUA: '' },
  ];

  const result = matchQuestionsToItems(questions, items, {
    minCovered: 5,
    minPrecision: 1,
    offsetRange: 0,
  });

  assert.equal(result.assigned.size, 5);
  assert.equal(result.assigned.get(93).area, 'CN');
  assert.equal(result.assigned.get(93).item.CO_ITEM, '117887');
  assert.equal(result.assigned.get(93).precision, 1);
  assert.equal(result.unresolved.length, 0);
});

test('casamento suporta deslocamento entre índice da fonte e posição oficial', () => {
  const questions = [
    { id: 1, number: 136, language: null, correctAlternative: 'A' },
    { id: 2, number: 137, language: null, correctAlternative: 'C' },
    { id: 3, number: 138, language: null, correctAlternative: 'D' },
  ];
  const items = [
    { CO_POSICAO: '1', SG_AREA: 'MT', CO_ITEM: '1', TX_GABARITO: 'A', CO_HABILIDADE: '1', CO_PROVA: '999', TP_LINGUA: '' },
    { CO_POSICAO: '2', SG_AREA: 'MT', CO_ITEM: '2', TX_GABARITO: 'C', CO_HABILIDADE: '2', CO_PROVA: '999', TP_LINGUA: '' },
    { CO_POSICAO: '3', SG_AREA: 'MT', CO_ITEM: '3', TX_GABARITO: 'D', CO_HABILIDADE: '3', CO_PROVA: '999', TP_LINGUA: '' },
  ];

  const result = matchQuestionsToItems(questions, items, {
    minCovered: 3,
    minPrecision: 1,
    offsetRange: 140,
  });

  assert.equal(result.assigned.size, 3);
  assert.equal(result.assigned.get(136).offset, 135);
});

test('título pedagógico usa apenas o enunciado, sem consultar alternativa correta', () => {
  const question = {
    context: 'Um professor lança uma esfera verticalmente para cima e ela retorna ao ponto de lançamento.',
    alternativesIntroduction: 'Analise velocidade e aceleração quando a esfera atinge a altura máxima.',
    correctAlternative: 'C',
    alternatives: [
      { letter: 'C', text: 'V = 0 e aceleração para baixo.', isCorrect: true },
    ],
  };

  const generated = buildDisplayTitle(question, 'CN', 20);
  assert.equal(generated.subject, 'Física');
  assert.equal(generated.topic, 'Movimentos de partículas, objetos e corpos');
  assert.match(generated.displayTitle, /^Movimentos de partículas, objetos e corpos: lançamento vertical$/);
  assert.doesNotMatch(generated.displayTitle, /para baixo/i);
});

test('amostra de questão de vacina recebe assunto e tópico úteis', () => {
  const generated = buildDisplayTitle({
    context: 'A tecnologia de vacinas de RNA mensageiro (RNAm) foi usada contra um vírus de RNA.',
    alternativesIntroduction: 'A imunização produzida por esse tipo de vacina é alcançada por meio da ação do RNAm.',
  }, 'CN', 11);

  assert.equal(generated.subject, 'Biologia');
  assert.equal(generated.topic, 'Biotecnologia: benefícios, limites e ética');
  assert.match(generated.displayTitle, /vacinas de RNAm$/);
});

test('título de Humanas não sofre falso positivo de tópicos de outras áreas', () => {
  const generated = buildDisplayTitle({
    number: 52,
    context: 'Paulo Freire discute a leitura do mundo e os valores que orientam a vida em sociedade.',
    alternativesIntroduction: 'A reflexão apresentada destaca uma dimensão ética da organização social.',
  }, 'CH', 23);

  assert.equal(generated.subject, 'Ciências Humanas');
  assert.equal(generated.topic, 'Valores éticos e estruturação política');
  assert.match(generated.displayTitle, /Paulo Freire e educação$/);
  assert.doesNotMatch(generated.displayTitle, /genética|biologia|tradução/i);
});


test('título enriquecido sem âncora não repete o número da questão', () => {
  const generated = buildDisplayTitle({
    number: 46,
    context: 'Texto genérico sem âncora temática específica.',
    alternativesIntroduction: '',
  }, 'CH', 6);
  assert.equal(generated.displayTitle, 'Representações gráficas e cartográficas do espaço');
  assert.doesNotMatch(generated.displayTitle, /Quest[aã]o\s+46/i);
});
