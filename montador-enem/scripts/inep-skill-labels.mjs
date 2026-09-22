const SKILL_LABELS = Object.freeze({
  LC: Object.freeze({
    1: "Uso social das linguagens e da comunicação",
    2: "Linguagens dos sistemas de comunicação",
    3: "Informação e função social da comunicação",
    4: "Crítica aos usos sociais da comunicação",
    5: "Vocabulário e tema em língua estrangeira",
    6: "Língua estrangeira como acesso a informação e cultura",
    7: "Relações entre textos em língua estrangeira e portuguesa",
    8: "Diversidade cultural em língua estrangeira",
    9: "Manifestações corporais e práticas sociais",
    10: "Hábitos corporais e necessidades cinestésicas",
    11: "Linguagem corporal e interação social",
    12: "Funções sociais e culturais da arte",
    13: "Produções artísticas e diversidade cultural",
    14: "Diversidade artística e identidades sociais",
    15: "Literatura e contexto histórico-social",
    16: "Procedimentos de construção do texto literário",
    17: "Valores sociais e humanos na literatura",
    18: "Progressão temática e estrutura textual",
    19: "Funções da linguagem em situações comunicativas",
    20: "Patrimônio linguístico, memória e identidade",
    21: "Recursos persuasivos verbais e não verbais",
    22: "Relações entre opiniões, temas e recursos linguísticos",
    23: "Objetivos, público-alvo e argumentação",
    24: "Estratégias argumentativas de convencimento",
    25: "Marcas de variedades linguísticas",
    26: "Variedades linguísticas e uso social",
    27: "Norma-padrão em situações de comunicação",
    28: "Função e impacto social das tecnologias da informação",
    29: "Linguagens das tecnologias da informação",
    30: "Tecnologia da informação e desenvolvimento social",
  }),
  MT: Object.freeze({
    1: "Significados e representações dos números",
    2: "Padrões numéricos e princípios de contagem",
    3: "Resolução de problemas numéricos",
    4: "Razoabilidade de resultados numéricos",
    5: "Intervenção na realidade com conhecimentos numéricos",
    6: "Localização e movimento no espaço",
    7: "Características de figuras planas e espaciais",
    8: "Resolução de problemas geométricos",
    9: "Argumentação com conhecimentos geométricos",
    10: "Grandezas e unidades de medida",
    11: "Escalas e representação do cotidiano",
    12: "Resolução de problemas com medidas",
    13: "Avaliação de resultados de medição",
    14: "Grandezas e medidas em propostas de intervenção",
    15: "Dependência entre grandezas",
    16: "Variação direta e inversamente proporcional",
    17: "Argumentação com variação de grandezas",
    18: "Intervenção envolvendo variação de grandezas",
    19: "Representações algébricas entre grandezas",
    20: "Interpretação de gráficos cartesianos",
    21: "Modelagem e resolução de problemas algébricos",
    22: "Argumentação algébrica e geométrica",
    23: "Intervenção com conhecimentos algébricos",
    24: "Inferências a partir de gráficos e tabelas",
    25: "Resolução de problemas com tabelas e gráficos",
    26: "Argumentação com gráficos e tabelas",
    27: "Tendência central e dispersão",
    28: "Estatística e probabilidade",
    29: "Argumentação com estatística e probabilidade",
    30: "Intervenção com estatística e probabilidade",
  }),
  CN: Object.freeze({
    1: "Fenômenos ondulatórios e oscilatórios",
    2: "Desenvolvimento científico e tecnológico",
    3: "Ciência, senso comum e diferentes culturas",
    4: "Conservação ambiental e biodiversidade",
    5: "Circuitos e dispositivos elétricos",
    6: "Uso de aparelhos e sistemas tecnológicos",
    7: "Testes e propriedades físico-químicas de materiais",
    8: "Transformação e uso de recursos naturais",
    9: "Ciclos biogeoquímicos e fluxo de energia",
    10: "Poluentes e perturbações ambientais",
    11: "Biotecnologia: benefícios, limites e ética",
    12: "Impactos ambientais de atividades produtivas",
    13: "Transmissão da vida e características dos seres vivos",
    14: "Herança e expressão gênica",
    15: "Transmissão de doenças, higiene e saneamento",
    16: "Evolução, diversidade e ambiente",
    17: "Linguagens e representações nas ciências naturais",
    18: "Propriedades e finalidades de produtos e tecnologias",
    19: "Métodos científicos para diagnosticar e resolver problemas",
    20: "Movimentos de partículas, objetos e corpos",
    21: "Leis físicas e químicas em processos cotidianos",
    22: "Interação entre radiação e matéria",
    23: "Geração, uso e transformação de energia",
    24: "Códigos e nomenclatura da química",
    25: "Materiais, substâncias e processos de produção",
    26: "Implicações do uso de materiais e substâncias",
    27: "Intervenção ambiental com conhecimentos químicos",
    28: "Adaptações dos organismos ao ambiente",
    29: "Experimentos e técnicas com seres vivos",
    30: "Saúde individual, coletiva e ambiental",
  }),
  CH: Object.freeze({
    1: "Fontes históricas e geográficas sobre a cultura",
    2: "Memória e sociedades humanas",
    3: "Manifestações culturais e processos históricos",
    4: "Comparação de pontos de vista sobre cultura",
    5: "Patrimônio cultural e diversidade",
    6: "Representações gráficas e cartográficas do espaço",
    7: "Relações de poder entre nações",
    8: "Estados, fluxos populacionais e questões sociais",
    9: "Organizações políticas e socioeconômicas",
    10: "Movimentos sociais e transformação da realidade",
    11: "Práticas de grupos sociais no tempo e no espaço",
    12: "Justiça e organização das sociedades",
    13: "Movimentos sociais e disputas de poder",
    14: "Pontos de vista sobre instituições sociais e políticas",
    15: "Conflitos culturais, sociais, políticos e ambientais",
    16: "Técnicas, tecnologias, trabalho e vida social",
    17: "Tecnologia e territorialização da produção",
    18: "Produção, circulação de riquezas e espaço",
    19: "Tecnologia e apropriação dos espaços rural e urbano",
    20: "Tecnologia, vida social e mundo do trabalho",
    21: "Meios de comunicação e vida social",
    22: "Lutas sociais, legislação e políticas públicas",
    23: "Valores éticos e estruturação política",
    24: "Cidadania e democracia",
    25: "Estratégias de inclusão social",
    26: "Ocupação dos meios físicos e paisagem",
    27: "Sociedade e meio físico",
    28: "Tecnologia e impactos socioambientais",
    29: "Recursos naturais e produção do espaço geográfico",
    30: "Preservação e degradação da vida no planeta",
  }),
});

const ANCHOR_RULES = Object.freeze({
  CN: [
    ["abelhas e polinização", /\b(abelha|poliniza[cç][aã]o)\w*/i],
    ["ferro e prevenção da anemia", /\b(anemia|panela de ferro|prego enferrujado)\b/i],
    ["energia nuclear", /\b(energia nuclear|chernobyl|fukushima|radioativ)\w*/i],
    ["dureza da água e incrustações", /\b(dureza da [aá]gua|incrusta[cç][aã]o|caldeira)\w*/i],
    ["músculos vermelhos em aves migratórias", /\b(aves migrat[oó]rias|m[uú]sculos vermelhos)\b/i],
    ["hidratação do cloreto de cálcio", /\b(cloreto de c[aá]lcio|CaCl|antimofo)\w*/i],
    ["etileno e amadurecimento de frutos", /\b(etileno|amadurecimento.*frut|abacate)\w*/i],
    ["cloroplastos e fotossíntese", /\b(cloroplast|fotoss[ií]ntese|lesmas?-do-mar)\w*/i],
    ["leishmaniose visceral", /\b(leishmaniose|Leishmania)\w*/i],
    ["lançamento vertical", /\b(lan[cç]amento vertical|lan[cç]a uma esfera verticalmente)\b/i],
    ["ciclo menstrual e hormônios ovarianos", /\b(tens[aã]o pr[eé]-menstrual|menstrua[cç][aã]o|horm[oô]nios ovarianos)\w*/i],
    ["oxidação de álcoois e formação de cetonas", /\b(hexan-3-ona|cetona|oxidar.*[aá]lcool)\w*/i],
    ["tubo polínico e fecundação vegetal", /\b(tubo pol[ií]nico|fecunda[cç][aã]o.*plant)\w*/i],
    ["equilíbrio químico e contaminação por alumínio", /\b(gluconato de c[aá]lcio|contamina[cç][aã]o por alum[ií]nio|equil[ií]brio qu[ií]mico)\b/i],
    ["floema e anelamento do caule", /\b(floema|barbatim[aã]o|anel completo.*casca)\w*/i],
    ["vacinas de RNAm", /\b(vacina.*RNAm|RNA mensageiro|SARS-CoV-2)\b/i],
    ["reação acrossômica e fecundação", /\b(acrossomo|fertiliza[cç][aã]o in vitro)\w*/i],
    ["indução eletromagnética", /\b(fog[aã]o por indu[cç][aã]o|indu[cç][aã]o eletromagn[eé]tica|campo magn[eé]tico vari[aá]vel)\b/i],
    ["polias e vantagem mecânica", /\b(polia|roldana)\w*/i],
    ["precipitação de mercúrio", /\b(nitrato de merc[uú]rio|Hg2|precipita[cç][aã]o.*merc[uú]rio)\w*/i],
    ["seleção natural e evolução", /\b(sele[cç][aã]o natural|evolu[cç][aã]o biol[oó]gica)\b/i],
    ["DNA, genes e hereditariedade", /\b(DNA|gene|hereditariedade|cromossomo)\w*/i],
    ["respiração celular e metabolismo energético", /\b(respira[cç][aã]o celular|ATP|mitoc[oô]ndria)\w*/i],
    ["ecologia e relações entre organismos", /\b(ecossistema|cadeia alimentar|teia alimentar|rela[cç][aã]o ecol[oó]gica)\w*/i],
    ["ácidos, bases e pH", /\b(pH|neutraliza[cç][aã]o|[aá]cido.*base|base.*[aá]cido)\b/i],
    ["estequiometria e relações molares", /\b(estequiometr|massa molar|propor[cç][aã]o molar)\w*/i],
    ["circuitos elétricos", /\b(circuito el[eé]trico|resist[eê]ncia el[eé]trica|corrente el[eé]trica)\b/i],
    ["ondas e fenômenos ondulatórios", /\b(comprimento de onda|frequ[eê]ncia|onda eletromagn[eé]tica|onda sonora)\b/i],
  ],
  CH: [
    ["cartografia e representação espacial", /\b(cartograf|mapa|proje[cç][aã]o cartogr[aá]fica)\w*/i],
    ["Palestina e Declaração Balfour", /\b(Palestina|Balfour)\b/i],
    ["Paulo Freire e educação", /\b(Paulo Freire|Freire)\b/i],
    ["escravidão e relações sociais", /\b(escravid[aã]o|escravizad)\w*/i],
    ["industrialização e mundo do trabalho", /\b(industrializa[cç][aã]o|revolu[cç][aã]o industrial|mundo do trabalho)\b/i],
    ["urbanização e espaço urbano", /\b(urbaniza[cç][aã]o|espa[cç]o urbano|cidade)\w*/i],
    ["migrações e fluxos populacionais", /\b(migra[cç][aã]o|imigra[cç][aã]o|emigra[cç][aã]o|fluxo populacional)\w*/i],
    ["globalização e redes", /\b(globaliza[cç][aã]o|rede mundial|fluxos globais)\w*/i],
    ["cidadania e direitos", /\b(cidadania|direitos civis|direitos sociais|direitos pol[ií]ticos)\b/i],
    ["movimentos sociais", /\b(movimento social|movimentos sociais|mobiliza[cç][aã]o social)\w*/i],
    ["democracia e participação política", /\b(democracia|participa[cç][aã]o pol[ií]tica|sufr[aá]gio|voto)\w*/i],
    ["território e relações de poder", /\b(territ[oó]rio|territorialidade|geopol[ií]tica)\w*/i],
    ["agricultura e espaço agrário", /\b(agroneg[oó]cio|agricultura|espa[cç]o agr[aá]rio|quest[aã]o agr[aá]ria)\w*/i],
    ["recursos naturais e impactos ambientais", /\b(recursos naturais|impacto socioambiental|degrada[cç][aã]o ambiental)\w*/i],
  ],
  LC: [
    ["poesia e linguagem literária", /\b(poema|poesia|eu l[ií]rico)\w*/i],
    ["romance e narrativa", /\b(romance|narrador|personagem)\w*/i],
    ["variação linguística", /\b(varia[cç][aã]o lingu[ií]stica|variedade lingu[ií]stica|registro lingu[ií]stico)\w*/i],
    ["gêneros textuais", /\b(g[eê]nero textual|g[eê]neros textuais)\b/i],
    ["publicidade e persuasão", /\b(publicidade|propaganda|an[uú]ncio publicit[aá]rio)\w*/i],
    ["tecnologias da comunicação", /\b(rede social|internet|tecnologia da informa[cç][aã]o|comunica[cç][aã]o digital)\w*/i],
    ["arte e expressão estética", /\b(pintura|escultura|instala[cç][aã]o art[ií]stica|obra de arte)\w*/i],
    ["práticas corporais e esporte", /\b(esporte|atividade f[ií]sica|pr[aá]tica corporal)\w*/i],
  ],
  MT: [
    ["porcentagem e proporcionalidade", /\b(porcentagem|percentual|propor[cç][aã]o|regra de tr[eê]s)\w*/i],
    ["probabilidade", /\b(probabilidade|evento aleat[oó]rio)\w*/i],
    ["estatística e medidas de tendência central", /\b(m[eé]dia aritm[eé]tica|mediana|moda|desvio padr[aã]o)\b/i],
    ["geometria espacial", /\b(prisma|cilindro|cone|esfera|volume)\w*/i],
    ["geometria plana", /\b(tri[aâ]ngulo|quadril[aá]tero|circunfer[eê]ncia|per[ií]metro|[aá]rea)\w*/i],
    ["funções e gráficos", /\b(fun[cç][aã]o afim|fun[cç][aã]o quadr[aá]tica|gr[aá]fico cartesiano)\w*/i],
    ["escala e representação", /\b(escala|planta baixa|mapa)\w*/i],
    ["análise combinatória e contagem", /\b(combina[cç][aã]o|permuta[cç][aã]o|arranjo|princ[ií]pio fundamental da contagem)\w*/i],
  ],
});

function normalizeSkillCode(skillCode) {
  if (skillCode === null || skillCode === undefined || skillCode === "") return null;
  const match = String(skillCode).toUpperCase().match(/(\d{1,2})/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 1 && value <= 30 ? value : null;
}

function officialSkillLabel(area, skillCode) {
  const code = normalizeSkillCode(skillCode);
  return code ? SKILL_LABELS[area]?.[code] ?? null : null;
}

function officialSubject(area, skillCode) {
  const code = normalizeSkillCode(skillCode);
  if (area === "MT") return "Matemática";
  if (area === "CH") return "Ciências Humanas";
  if (area === "LC") {
    if (code >= 5 && code <= 8) return "Língua Estrangeira";
    if (code >= 9 && code <= 11) return "Educação Física";
    if (code >= 12 && code <= 14) return "Artes";
    if (code >= 15 && code <= 17) return "Literatura";
    return "Linguagens";
  }
  if (area === "CN") {
    if (code === 1 || code === 5 || code === 6 || (code >= 20 && code <= 23)) return "Física";
    if (code >= 24 && code <= 27) return "Química";
    if (code === 11 || (code >= 13 && code <= 16) || (code >= 28 && code <= 30)) return "Biologia";
    return "Ciências da Natureza";
  }
  return "ENEM";
}

function findConservativeAnchor(area, text) {
  for (const [label, rule] of ANCHOR_RULES[area] ?? []) {
    if (rule.test(text)) {
      rule.lastIndex = 0;
      return label;
    }
    rule.lastIndex = 0;
  }
  return null;
}

export {
  SKILL_LABELS,
  findConservativeAnchor,
  normalizeSkillCode,
  officialSkillLabel,
  officialSubject,
};
