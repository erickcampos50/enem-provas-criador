import { findConservativeAnchor, officialSkillLabel, officialSubject } from './inep-skill-labels.mjs';

const AREA_TO_DISCIPLINE = Object.freeze({
  LC: 'linguagens',
  CH: 'ciencias-humanas',
  CN: 'ciencias-natureza',
  MT: 'matematica',
});

const SUBJECT_RULES = {
  CN: [
    ['Física', [
      /\b(f[oó]ton|onda|frequ[eê]ncia|comprimento de onda|refra[cç][aã]o|reflex[aã]o|lente|espelho)\b/i,
      /\b(corrente el[eé]trica|tens[aã]o|resist[eê]ncia|circuito|campo magn[eé]tico|indu[cç][aã]o|eletromagn[eé]tic)\w*/i,
      /\b(velocidade|acelera[cç][aã]o|lan[cç]amento|for[cç]a|polia|energia cin[eé]tica|energia potencial|press[aã]o|empuxo)\b/i,
      /\b(calor|temperatura|termodin[aâ]mic|dilata[cç][aã]o)\w*/i,
    ]],
    ['Química', [
      /\b(mol|molar|estequiometr|precipita[cç][aã]o|solubilidade|solu[cç][aã]o|concentra[cç][aã]o|pH|[aá]cido|base)\w*/i,
      /\b(oxida[cç][aã]o|redu[cç][aã]o|eletroqu[ií]mic|equil[ií]brio qu[ií]mico|rea[cç][aã]o qu[ií]mica)\b/i,
      /\b([aá]lcool|cetona|alde[ií]do|hidrocarboneto|fun[cç][aã]o org[aâ]nica|pol[ií]mero)\b/i,
      /\b(cloreto|nitrato|sulfato|carbonato|[ií]on|met[aá]lic[oa]|massa molar)\b/i,
    ]],
    ['Biologia', [
      /\b(DNA|RNA|RNAm|gene|gen[eé]tic|cromossom|muta[cç][aã]o|hereditar)\w*/i,
      /\b(vacina|v[ií]rus|bact[eé]ri|protozo[aá]ri|doen[cç]a|parasita|imun|anticorpo)\w*/i,
      /\b(planta|vegetal|floema|xilema|cloroplast|fotoss[ií]ntese|fruto|semente|pol[ií]nico|etileno)\w*/i,
      /\b(ecolog|ecossistema|cadeia alimentar|biodiversidade|poliniza[cç][aã]o|abelha|popula[cç][aã]o)\w*/i,
      /\b(horm[oô]nio|menstrua[cç][aã]o|fecunda[cç][aã]o|gameta|m[uú]sculo|sangue|metabolismo)\w*/i,
    ]],
  ],
  CH: [
    ['Geografia', [
      /\b(clima|relevo|territ[oó]rio|urbaniza[cç][aã]o|migra[cç][aã]o|globaliza[cç][aã]o|cartograf|geopol[ií]tic)\w*/i,
      /\b(agricultura|industrializa[cç][aã]o|demografia|popula[cç][aã]o|cidade|campo)\b/i,
    ]],
    ['História', [
      /\b(colonial|imp[eé]rio|rep[uú]blica|escravid[aã]o|revolu[cç][aã]o|guerra|ditadura|medieval|antiguidade)\w*/i,
    ]],
    ['Filosofia', [
      /\b([eé]tica|moral|epistemolog|raz[aã]o|conhecimento|filosof|metaf[ií]sic|contrato social)\w*/i,
    ]],
    ['Sociologia', [
      /\b(sociedade|cultura|classe social|trabalho|cidadania|movimento social|desigualdade|identidade)\b/i,
    ]],
  ],
  LC: [
    ['Literatura', [/\b(poema|romance|conto|narrador|personagem|liter[aá]ri|modernismo|barroco|arcadismo)\w*/i]],
    ['Língua Portuguesa', [/\b(g[eê]nero textual|coes[aã]o|varia[cç][aã]o lingu[ií]stica|argumenta[cç][aã]o|linguagem|texto|discurso)\b/i]],
    ['Artes', [/\b(pintura|escultura|m[uú]sica|teatro|dan[cç]a|arte|art[ií]stic)\w*/i]],
    ['Educação Física', [/\b(esporte|atividade f[ií]sica|corpo|jogo|atleta)\b/i]],
  ],
  MT: [['Matemática', [/.*/]]],
};

const TOPIC_RULES = [
  ['Indução eletromagnética', /\b(indu[cç][aã]o|campo magn[eé]tico vari[aá]vel|fog[aã]o por indu[cç][aã]o)\b/i],
  ['Cinemática', /\b(lan[cç]amento vertical|velocidade|acelera[cç][aã]o|movimento uniforme|movimento uniformemente)\b/i],
  ['Máquinas simples e polias', /\b(polia|roldana|vantagem mec[aâ]nica)\w*/i],
  ['Energia nuclear', /\b(energia nuclear|chernobyl|fukushima|radioativ)\w*/i],
  ['Estequiometria', /\b(estequiometr|massa molar|mol\b|propor[cç][aã]o molar)\w*/i],
  ['Equilíbrio químico', /\b(equil[ií]brio qu[ií]mico|deslocamento do equil[ií]brio)\b/i],
  ['Química orgânica', /\b(cetona|[aá]lcool|alde[ií]do|[aá]cido carbox[ií]lico|hidrocarboneto)\b/i],
  ['Soluções e solubilidade', /\b(dureza da [aá]gua|solubilidade|solu[cç][aã]o|precipita[cç][aã]o|sais pouco sol[uú]veis)\b/i],
  ['Genética e biologia molecular', /\b(DNA|RNA|RNAm|gene|gen[eé]tic|tradu[cç][aã]o|ribossomo)\w*/i],
  ['Imunologia e vacinas', /\b(vacina|imuniza[cç][aã]o|resposta antig[eê]nica|anticorpo|ant[ií]geno)\w*/i],
  ['Reprodução humana', /\b(fecunda[cç][aã]o|fertiliza[cç][aã]o in vitro|espermatozoide|ov[oó]cito|acrossomo|gameta)\w*/i],
  ['Fisiologia humana', /\b(horm[oô]nio|menstrua[cç][aã]o|m[uú]sculo|metabolismo|sangue|anemia)\w*/i],
  ['Botânica', /\b(floema|xilema|vegetal|planta|fruto|semente|tubo pol[ií]nico|amadurecimento)\w*/i],
  ['Fotossíntese', /\b(cloroplast|fotoss[ií]ntese)\w*/i],
  ['Ecologia', /\b(ecolog|abelha|poliniza[cç][aã]o|biodiversidade|ecossistema|preserva[cç][aã]o)\w*/i],
  ['Parasitologia', /\b(leishmani|protozo[aá]ri|parasita|vetor|zoonose)\w*/i],
  ['Probabilidade e estatística', /\b(probabilidade|m[eé]dia|mediana|desvio padr[aã]o|frequ[eê]ncia relativa|amostra)\b/i],
  ['Geometria', /\b([aá]rea|per[ií]metro|volume|circunfer[eê]ncia|tri[aâ]ngulo|pol[ií]gono|prisma|cilindro|cone|esfera)\b/i],
  ['Funções', /\b(fun[cç][aã]o|gr[aá]fico|taxa de varia[cç][aã]o|crescimento exponencial|fun[cç][aã]o afim|fun[cç][aã]o quadr[aá]tica)\b/i],
  ['Razão, proporção e porcentagem', /\b(porcentagem|percentual|propor[cç][aã]o|raz[aã]o|regra de tr[eê]s)\b/i],
  ['Interpretação de texto', /\b(texto|argumento|efeito de sentido|g[eê]nero textual|estrat[eé]gia argumentativa)\b/i],
];

const STOPWORDS = new Set(
  `a o as os um uma uns umas de da do das dos e em no na nos nas por para com sem sob sobre entre
  que qual quais como quando onde quem cujo cuja seus suas seu sua esse essa esses essas isso isto
  ao aos à às se ser estar foi foram é são tem têm pode podem deve devem mais menos muito muita
  muitos muitas mesmo mesma cada outro outra outros outras partir apresenta apresentam apresenta-se
  seguinte segundo conforme considere considerando questão alternativa objetivo processo forma meio
  tipo caso relação resultado exemplo disponível acesso adaptado figura tabela gráfico`.split(/\s+/),
);

function normalizeForRules(value) {
  return String(value ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[*_>#`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countRuleHits(text, rules) {
  let hits = 0;
  for (const rule of rules) {
    if (rule.test(text)) hits += 1;
    rule.lastIndex = 0;
  }
  return hits;
}

function inferSubject(area, text, skillCode = null) {
  return officialSubject(area, skillCode);
}

function inferTopic(text, subject, area = null, skillCode = null) {
  return officialSkillLabel(area, skillCode) ?? subject;
}

function tokenizeKeywords(text) {
  const cleaned = normalizeForRules(text)
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ');
  const counts = new Map();
  for (const token of cleaned.split(/\s+/)) {
    if (!token || token.length < 4 || STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0], 'pt-BR'))
    .map(([token]) => token);
}

function titleCaseTerm(term) {
  return term ? term.charAt(0).toLocaleUpperCase('pt-BR') + term.slice(1) : term;
}

function buildDisplayTitle(question, officialArea, skillCode = null) {
  const stem = normalizeForRules(
    [question.context, question.alternativesIntroduction ?? question.alternatives_introduction]
      .filter(Boolean)
      .join(' '),
  );
  const subject = officialSubject(officialArea, skillCode);
  const topic = officialSkillLabel(officialArea, skillCode) ?? subject;
  const anchor = findConservativeAnchor(officialArea, stem);
  const number = Number(question.number ?? question.index);
  const suffix = Number.isFinite(number) ? `Questão ${number}` : null;

  let displayTitle = topic;
  if (anchor && anchor.toLocaleLowerCase('pt-BR') !== topic.toLocaleLowerCase('pt-BR')) {
    displayTitle = `${topic}: ${anchor}`;
  } else if (suffix) {
    displayTitle = `${topic} · ${suffix}`;
  }

  return { subject, topic, displayTitle, anchor };
}

function parseDelimited(text) {
  const firstLine = String(text).split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  row.push(field.replace(/\r$/, ''));
  if (row.some((value) => value !== '')) rows.push(row);
  if (rows.length === 0) return [];

  const header = rows[0].map((value) => value.trim());
  return rows.slice(1).map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

function languageCodeForQuestion(language) {
  const normalized = String(language ?? '').toLocaleLowerCase('pt-BR');
  if (!normalized) return '';
  if (normalized.includes('espan')) return '1';
  if (normalized.includes('ingl') || normalized.includes('english')) return '0';
  return normalized;
}

function groupCandidates(items, languageCode = '') {
  const groups = new Map();
  for (const item of items) {
    const rowLanguage = String(item.TP_LINGUA ?? '').trim();
    if (String(languageCode) !== rowLanguage) continue;
    const answer = String(item.TX_GABARITO ?? '').trim().toUpperCase();
    if (!/^[A-E]$/.test(answer)) continue;
    const area = String(item.SG_AREA ?? '').trim();
    const examCode = String(item.CO_PROVA ?? '').trim();
    if (!AREA_TO_DISCIPLINE[area] || !examCode) continue;
    const key = `${area}::${examCode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function matchQuestionsToItems(questions, items, {
  minCovered = 15,
  minPrecision = 0.85,
  offsetRange = 200,
} = {}) {
  const remaining = new Map(questions.map((question) => [Number(question.number ?? question.index), question]));
  const assigned = new Map();
  const groups = groupCandidates(items, languageCodeForQuestion(questions[0]?.language));
  const availableGroups = new Map(groups);
  const offsets = Array.from({ length: offsetRange * 2 + 1 }, (_, index) => index - offsetRange);

  while (remaining.size > 0 && availableGroups.size > 0) {
    let best = null;
    for (const [key, rows] of availableGroups) {
      const [area, examCode] = key.split('::');
      const byPosition = new Map(rows.map((row) => [Number(row.CO_POSICAO), row]));

      for (const offset of offsets) {
        let covered = 0;
        const hits = new Map();
        for (const [number, question] of remaining) {
          const item = byPosition.get(number - offset);
          if (!item) continue;
          covered += 1;
          const expected = String(question.correctAlternative ?? question.correct_alternative ?? '').trim().toUpperCase();
          const actual = String(item.TX_GABARITO ?? '').trim().toUpperCase();
          if (expected && expected === actual) hits.set(number, item);
        }
        if (covered < minCovered) continue;
        const precision = hits.size / covered;
        if (precision < minPrecision) continue;
        if (
          !best ||
          hits.size > best.hits.size ||
          (hits.size === best.hits.size && precision > best.precision)
        ) {
          best = { key, area, examCode, offset, covered, precision, hits };
        }
      }
    }

    if (!best) break;
    availableGroups.delete(best.key);
    for (const [number, item] of best.hits) {
      assigned.set(number, {
        item,
        area: best.area,
        examCode: best.examCode,
        offset: best.offset,
        precision: best.precision,
        covered: best.covered,
      });
      remaining.delete(number);
    }
  }

  return { assigned, unresolved: [...remaining.values()] };
}

function sqlValue(value) {
  if (value === null || value === undefined || value === '') return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replaceAll("'", "''")}'`;
}

export {
  AREA_TO_DISCIPLINE,
  buildDisplayTitle,
  groupCandidates,
  inferSubject,
  inferTopic,
  languageCodeForQuestion,
  matchQuestionsToItems,
  normalizeForRules,
  officialSkillLabel,
  officialSubject,
  parseDelimited,
  sqlValue,
  tokenizeKeywords,
};
