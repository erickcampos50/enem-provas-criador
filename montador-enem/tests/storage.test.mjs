import assert from 'node:assert/strict';
import test from 'node:test';
import { encodeProofLink, exportProof, parseProof, parseProofLink } from '../src/storage.js';

const state = {
  header: { institution: 'Escola', title: 'Avaliação 1' },
  selected: [{ id: 12, points: 2 }, { id: 34, points: 1 }],
  variantsCount: 2,
  shuffleIncorrect: true,
  includeAnswerSheet: true,
  database: { sha256: 'abc123' },
};

test('codifica e decodifica links de prova com acentos', () => {
  const link = encodeProofLink(state, state.database.sha256, 'https://example.test/montador/');
  assert.match(link, /#prova=/);
  const parsed = parseProofLink(link);
  assert.deepEqual(parsed.header, state.header);
  assert.deepEqual(parsed.selected, state.selected);
  assert.equal(parsed.databaseHash, 'abc123');
  assert.equal(parsed.shuffleIncorrect, true);
});

test('aceita o arquivo novo e o formato antigo de prova', () => {
  const parsed = parseProof(exportProof(state));
  assert.equal(parsed.type, 'montador-enem-proof');
  const legacy = JSON.stringify({
    type: 'montador-enem-backup',
    version: 1,
    header: state.header,
    selected: state.selected,
    variantsCount: 1,
    shuffleIncorrect: false,
    includeAnswerSheet: true,
  });
  assert.equal(parseProof(legacy).header.title, 'Avaliação 1');
});

test('rejeita links corrompidos e payloads inválidos', () => {
  assert.throws(() => parseProofLink('https://example.test/#prova=corrompido'), /corrompido|incompatível/);
  assert.throws(() => parseProof(JSON.stringify({ type: 'montador-enem-proof', version: 1, header: {}, selected: [{ id: -1 }] })), /identificador inválido/);
});
