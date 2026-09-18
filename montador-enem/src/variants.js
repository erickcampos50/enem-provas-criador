const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function deterministicOrder(items, seed) {
  return [...items].sort((left, right) => {
    const leftHash = hash(`${seed}:${left.letter}:${left.id ?? left.text ?? ''}`);
    const rightHash = hash(`${seed}:${right.letter}:${right.id ?? right.text ?? ''}`);
    return leftHash - rightHash;
  });
}

export function buildVariant(question, variantIndex, shuffleIncorrect = false) {
  const alternatives = (question.alternatives ?? []).map((alternative, index) => ({
    ...alternative,
    originalIndex: index,
    isCorrect: Boolean(alternative.isCorrect) || alternative.letter === question.correctAlternative,
  }));
  const correct = alternatives.find((alternative) => alternative.isCorrect);
  if (!correct || alternatives.length === 0) {
    return { ...question, alternatives, correctAlternative: question.correctAlternative ?? null };
  }

  const incorrect = alternatives.filter((alternative) => !alternative.isCorrect);
  const orderedIncorrect = shuffleIncorrect && variantIndex > 0
    ? deterministicOrder(incorrect, `${question.id}:${variantIndex}`)
    : incorrect;
  const targetIndex = (alternatives.indexOf(correct) + variantIndex) % alternatives.length;
  const result = [];
  let incorrectIndex = 0;
  for (let index = 0; index < alternatives.length; index += 1) {
    result.push(index === targetIndex ? correct : orderedIncorrect[incorrectIndex++]);
  }

  return {
    ...question,
    alternatives: result.map((alternative, index) => ({
      ...alternative,
      letter: LETTERS[index] ?? alternative.letter,
      isCorrect: alternative === correct,
    })),
    correctAlternative: LETTERS[targetIndex] ?? correct.letter,
  };
}

export function buildVariants(questions, count, shuffleIncorrect = false) {
  return Array.from({ length: Math.min(5, Math.max(1, Number(count) || 1)) }, (_, index) => ({
    label: String.fromCharCode(65 + index),
    index,
    questions: questions.map((question) => buildVariant(question, index, shuffleIncorrect)),
  }));
}

export function buildAnswerKey(variant) {
  return variant.questions.map((question, index) => ({
    number: index + 1,
    answer: question.correctAlternative ?? '?',
  }));
}
