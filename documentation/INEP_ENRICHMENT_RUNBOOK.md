# Runbook — enriquecimento das questões com microdados do INEP

Este documento descreve o procedimento completo para repetir, auditar, aplicar e publicar o enriquecimento das questões do ENEM com os metadados de itens do INEP.

O objetivo do processo é vincular cada questão da base da aplicação a um item oficial do ENEM e, quando o vínculo é considerado seguro, acrescentar metadados como área oficial, habilidade, código do item, parâmetros TRI e um título pedagógico derivado da habilidade. Questões que não atingem os critérios de casamento permanecem sem enriquecimento; o pipeline não força uma classificação.

## 1. Visão geral do fluxo

A ordem recomendada é sempre:

1. atualizar a base de questões, se houver novos anos;
2. disponibilizar o arquivo `ITENS_PROVA_<ano>.csv` do INEP ou permitir o download oficial;
3. executar a auditoria em `--dry-run`;
4. analisar cobertura, precisão e questões não resolvidas;
5. aplicar o enriquecimento apenas aos anos aprovados;
6. executar testes;
7. sincronizar o SQLite utilizado pela aplicação;
8. publicar a versão atualizada;
9. conferir a versão online.

Nunca pule a auditoria quando estiver adicionando um ano novo ou substituindo a fonte de itens.

## 2. Arquivos envolvidos

Principais arquivos do processo:

- `enem.sqlite` — banco canônico da aplicação, na raiz do repositório;
- `montador-enem/scripts/enrich-inep.mjs` — orquestra auditoria e gravação;
- `montador-enem/scripts/inep-enrichment-lib.mjs` — casamento entre questões e itens;
- `montador-enem/scripts/inep-skill-labels.mjs` — rótulos pedagógicos por área/habilidade;
- `data/inep/ITENS_PROVA_<ano>.csv` — snapshots locais dos itens;
- `data/inep/README.md` — proveniência dos snapshots;
- `data/inep/audit/latest.json` — relatório detalhado, incluindo questões não resolvidas;
- `data/inep/audit/latest.md` — resumo humano da auditoria;
- `.github/workflows/audit-enrichment.yml` — auditoria automática;
- `.github/workflows/enrich-database.yml` — aplicação do enriquecimento;
- `.github/workflows/deploy-pages.yml` — build e publicação no GitHub Pages.

## 3. Pré-requisitos para execução local

A partir da pasta `montador-enem`:

- Node.js >= 20.19;
- npm >= 10;
- `sqlite3` disponível no `PATH`;
- `curl` disponível no `PATH`;
- em Linux, `unzip`;
- em Windows, PowerShell é usado para extrair o CSV do ZIP oficial quando necessário.

No Windows, confirme os comandos:

```powershell
node --version
npm --version
sqlite3 --version
curl --version
```

Instale as dependências do projeto:

```powershell
cd montador-enem
npm ci
```

## 4. Como o vínculo é feito

O casamento não confia na disciplina originalmente fornecida pela fonte da questão.

O algoritmo usa principalmente:

- número/posição da questão;
- gabarito;
- caderno/prova (`CO_PROVA`);
- área oficial (`SG_AREA`);
- língua estrangeira (`TP_LINGUA`);
- possíveis deslocamentos entre o número da questão na fonte e `CO_POSICAO`.

Para cada grupo candidato, o algoritmo procura o melhor caderno e deslocamento. Um grupo só é aceito se cumprir os critérios configurados.

Os valores padrão atuais são:

- precisão mínima do casamento: **85%**;
- cobertura mínima para um caderno comum: **15 questões**;
- intervalo de offsets: **-200 a +200**;
- cobertura mínima para classificar um ano como seguro na auditoria: **93%**.

Pools pequenos de língua estrangeira usam cobertura mínima proporcional ao tamanho do grupo.

### TP_LINGUA

Os snapshots normalizados podem representar a língua como `0.0` e `1.0`, enquanto os arquivos brutos ou outras fontes podem usar `0` e `1`.

O código normaliza essas representações antes da comparação:

- `0` / `0.0` = inglês;
- `1` / `1.0` = espanhol.

Essa normalização é importante. Antes dela, várias questões de língua estrangeira apareciam falsamente como não resolvidas.

## 5. Fonte dos dados do INEP

O pipeline procura os dados nesta ordem:

1. `data/inep/ITENS_PROVA_<ano>.csv`;
2. `data/inep/ITENS_PROVA_<ano>_AZUL.csv`;
3. cache local em `.cache/enem-microdados/`;
4. download do pacote oficial:
   `https://download.inep.gov.br/microdados/microdados_enem_<ano>.zip`.

Os snapshots versionados devem ter sua proveniência documentada em `data/inep/README.md`.

### Encoding

Há duas situações:

- snapshots locais normalizados: UTF-8;
- CSV extraído diretamente dos microdados oficiais: Latin-1.

O loader diferencia essas duas origens. Não converta um snapshot sem atualizar também sua documentação e, idealmente, seu hash de proveniência.

## 6. Auditoria de todos os anos

A auditoria não altera o SQLite.

A partir de `montador-enem`:

```powershell
npm run audit:inep
```

Esse comando equivale ao uso de `enrich-inep.mjs` com `--dry-run`, cobertura segura de 93% e geração dos dois relatórios.

Arquivos produzidos:

```text
data/inep/audit/latest.json
data/inep/audit/latest.md
```

### Auditorar apenas um ano

Exemplo para 2024:

```powershell
node scripts/enrich-inep.mjs --years 2024 --dry-run --safe-min-coverage 0.93 --report-json ../data/inep/audit/2024.json --report-md ../data/inep/audit/2024.md --verbose
```

### Auditorar vários anos específicos

```powershell
node scripts/enrich-inep.mjs --years "2022,2023,2024" --dry-run --safe-min-coverage 0.93 --report-json ../data/inep/audit/selected.json --report-md ../data/inep/audit/selected.md --verbose
```

## 7. Como interpretar o relatório

O Markdown apresenta, para cada ano:

- total de questões;
- questões mapeadas;
- cobertura;
- não resolvidas;
- divergências entre a disciplina da fonte e a área oficial;
- menor precisão encontrada entre os grupos aceitos;
- status `safe` ou `review`.

O JSON também contém:

- `unresolvedQuestions`;
- `minMatchPrecision`;
- `averageMatchPrecision`;
- `offsets`;
- amostras de títulos gerados;
- listas `safeYears` e `reviewYears`.

### Critério de decisão

Um ano só deve ser aplicado em lote quando:

1. aparece como `safe`;
2. a cobertura é compatível com o comportamento histórico;
3. a precisão não apresenta queda anormal;
4. os offsets são plausíveis;
5. as não resolvidas foram inspecionadas;
6. não há padrão que indique erro de encoding, língua ou caderno.

`review` significa: investigar antes de gravar.

Não reduza o limiar apenas para fazer um ano passar. Primeiro procure a causa da perda de cobertura.

## 8. Valores de referência da auditoria de 22/09/2026

Após a correção de `TP_LINGUA`, o conjunto 2009–2023 apresentou:

| Ano | Mapeadas | Total | Cobertura |
| ---: | ---: | ---: | ---: |
| 2009 | 178 | 179 | 99,4% |
| 2010 | 183 | 185 | 98,9% |
| 2011 | 178 | 184 | 96,7% |
| 2012 | 183 | 185 | 98,9% |
| 2013 | 185 | 185 | 100,0% |
| 2014 | 185 | 185 | 100,0% |
| 2015 | 183 | 184 | 99,5% |
| 2016 | 184 | 185 | 99,5% |
| 2017 | 185 | 185 | 100,0% |
| 2018 | 182 | 184 | 98,9% |
| 2019 | 181 | 181 | 100,0% |
| 2020 | 179 | 182 | 98,4% |
| 2021 | 177 | 185 | 95,7% |
| 2022 | 183 | 185 | 98,9% |
| 2023 | 176 | 183 | 96,2% |

Total: **2.722/2.757**, aproximadamente **98,7%**.

Esses números são referência, não uma regra permanente. Se a base de questões mudar, uma auditoria futura pode produzir totais diferentes.

## 9. Aplicar o enriquecimento localmente

Depois de aprovar os anos, execute sem `--dry-run`.

Exemplo:

```powershell
node scripts/enrich-inep.mjs --years "2022,2023" --verbose
```

Para todos os anos atualmente auditados:

```powershell
node scripts/enrich-inep.mjs --years "2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023" --verbose
```

O script:

1. cria as tabelas de enriquecimento se necessário;
2. remove os metadados gerados anteriormente apenas dos anos-alvo;
3. recalcula os vínculos;
4. grava `question_inep_metadata`;
5. grava `question_enrichment`;
6. atualiza os campos enriquecidos do índice FTS;
7. executa `PRAGMA integrity_check`.

As questões que não forem resolvidas ficam sem metadado INEP. Não são preenchidas por aproximação.

## 10. Validar depois da aplicação

Execute:

```powershell
npm test
npm run sync:database
npm run build
```

`npm run sync:database`:

- copia o banco canônico da raiz para `montador-enem/public/enem.sqlite`;
- calcula o SHA-256;
- atualiza `montador-enem/public/enem.sqlite.meta.json`.

O workflow de enriquecimento também copia o banco e o manifesto para `docs/`.

Verifique o hash no log e compare com:

```text
docs/enem.sqlite.meta.json
```

## 11. Executar pelo GitHub Actions

Esse é o caminho recomendado para uma execução reproduzível no repositório.

### Etapa A — auditoria

No GitHub:

1. abra **Actions**;
2. selecione **Audit ENEM Enrichment**;
3. clique em **Run workflow**;
4. aguarde o job terminar;
5. confira `data/inep/audit/latest.md`;
6. consulte `latest.json` para as questões não resolvidas.

A auditoria executa em dry-run e não altera o SQLite.

### Etapa B — enriquecimento

Depois de aprovar o relatório:

1. abra **Actions**;
2. selecione **Enrich ENEM Database**;
3. clique em **Run workflow**;
4. informe a lista de anos desejada, se não quiser usar o conjunto padrão;
5. aguarde testes, sincronização e commit do banco.

O workflow atual usa, por padrão, 2009–2023.

### Etapa C — publicação

O workflow **Deploy Montador ENEM to GitHub Pages** possui `workflow_dispatch`.

Depois de o commit do banco existir na `main`, execute manualmente esse workflow quando quiser garantir que a publicação foi construída sobre o banco recém-enriquecido.

Essa execução explícita é especialmente útil porque commits criados com o `GITHUB_TOKEN` de outro workflow nem sempre disparam novos workflows de `push`.

## 12. Adicionar um novo ano

Exemplo: incorporar ENEM 2024.

### 12.1 Garantir que as questões estejam no banco

Primeiro confirme que `enem.sqlite` contém o ano.

Com `sqlite3`:

```powershell
sqlite3 ..\enem.sqlite "SELECT year, COUNT(*) FROM questions GROUP BY year ORDER BY year;"
```

Se o ano não existir, atualize a base de questões antes do enriquecimento. O coletor principal pode ser executado com:

```powershell
npm run build:database -- --delay-ms 500 --verbose
```

Atenção: reconstruir o banco é uma operação diferente de enriquecê-lo. Faça backup/commit antes e audite novamente todos os anos afetados.

### 12.2 Disponibilizar ITENS_PROVA

Opção A — deixar o pipeline baixar o ZIP oficial automaticamente.

Opção B — adicionar um snapshot versionado:

```text
data/inep/ITENS_PROVA_2024.csv
```

Ao versionar um snapshot:

1. preserve as colunas necessárias;
2. use UTF-8;
3. documente origem, transformação e hash em `data/inep/README.md`;
4. nunca descreva uma cópia de transporte como se fosse o pacote oficial integral.

Campos utilizados ou preservados pelo pipeline incluem:

- `CO_POSICAO`;
- `SG_AREA`;
- `CO_ITEM`;
- `TX_GABARITO`;
- `CO_HABILIDADE`;
- `CO_PROVA`;
- `TP_LINGUA`;
- `TX_COR`;
- `IN_ITEM_ABAN`;
- `TX_MOTIVO_ABAN`;
- `IN_ITEM_ADAPTADO`;
- `NU_PARAM_A`;
- `NU_PARAM_B`;
- `NU_PARAM_C`.

### 12.3 Auditar o novo ano isoladamente

```powershell
node scripts/enrich-inep.mjs --years 2024 --dry-run --safe-min-coverage 0.93 --report-json ../data/inep/audit/2024.json --report-md ../data/inep/audit/2024.md --verbose
```

### 12.4 Investigar anomalias

Se a cobertura for baixa, verifique primeiro:

- língua estrangeira;
- encoding;
- formato decimal de campos numéricos;
- caderno correto;
- `CO_POSICAO`;
- offsets;
- questões anuladas;
- questões adaptadas;
- diferenças entre aplicação regular, reaplicação e PPL;
- divergências entre o gabarito da fonte e o INEP.

Não altere `minPrecision` ou `safeMinCoverage` antes de entender a causa.

### 12.5 Aplicar

Se o ano estiver seguro:

```powershell
node scripts/enrich-inep.mjs --years 2024 --verbose
npm test
npm run sync:database
npm run build
```

Depois atualize o valor padrão de anos em `.github/workflows/enrich-database.yml` para incluir o novo ano.

## 13. Títulos pedagógicos

O título exibido não é um título oficial fornecido pelo INEP.

A classificação oficial usada como base vem de:

- `SG_AREA`;
- `CO_HABILIDADE`;
- demais metadados do item.

O título pedagógico é gerado pela aplicação a partir da habilidade e, quando há uma âncora temática suficientemente conservadora no enunciado, ela é acrescentada.

Exemplo:

```text
Q52 2023 — Valores éticos e estruturação política: Paulo Freire e educação
```

O gerador não deve usar o texto da alternativa correta para inferir o título, evitando vazamento da resposta.

Quando não há âncora segura, o sistema prefere um título mais geral a inventar uma classificação específica.

## 14. Disciplina oficial versus disciplina da fonte

A auditoria conta `mismatchedDisciplines`.

Isso não significa automaticamente erro do casamento. Em vários casos, a fonte original das questões contém disciplina divergente, e a área oficial do INEP corrige essa classificação.

O comportamento da aplicação é:

- se houver metadado INEP válido, usar a área oficial;
- se não houver, manter a classificação original como fallback.

Por isso a quantidade de divergências deve ser monitorada, mas não é, isoladamente, motivo para rejeitar um ano.

## 15. Questões não resolvidas

Uma questão pode ficar não resolvida por:

- versão de língua não encontrada;
- gabarito divergente;
- posição incompatível;
- item anulado;
- questão ausente no snapshot;
- edição/reaplicação diferente;
- irregularidade na fonte da questão;
- caderno não coberto.

Use `data/inep/audit/latest.json` e procure por:

```json
"unresolvedQuestions"
```

A regra é: **não preencher à força**.

Se for necessário resolver manualmente uma exceção, primeiro encontre evidência documental suficiente e implemente uma regra reproduzível/testável. Evite editar diretamente o SQLite.

## 16. Diagnóstico rápido de problemas

### Cobertura de línguas caiu cerca de 10 questões

Verifique `TP_LINGUA`, especialmente `0.0` / `1.0` versus `0` / `1`.

### Caracteres acentuados aparecem corrompidos

Verifique se o arquivo é snapshot UTF-8 ou CSV bruto Latin-1.

### Um ano caiu muito abaixo dos demais

Inspecione:

- `offsets`;
- `minMatchPrecision`;
- lista de não resolvidas;
- código das provas/cadernos;
- se a fonte contém aplicação regular, PPL ou reaplicação diferente.

### Workflow falha no push

Os workflows que gravam relatórios e banco executam:

```bash
git pull --rebase origin main
git push
```

Isso reduz conflitos quando outro workflow atualizou a `main` durante a execução.

Se ainda houver conflito, não force o push. Atualize a branch, repita a auditoria e gere novamente o artefato.

### Banco atualizou, mas a UI parece antiga

Confirme:

1. SHA em `docs/enem.sqlite.meta.json`;
2. se o workflow de deploy executou depois do commit do banco;
3. se `docs/index.html` aponta para o bundle mais recente;
4. recarregamento forçado no navegador.

Se necessário, execute manualmente **Deploy Montador ENEM to GitHub Pages**.

## 17. Rollback

Antes de uma mudança grande, trabalhe sempre com commits identificáveis.

Se um enriquecimento publicado estiver errado:

1. reverta o commit que alterou `enem.sqlite`, `docs/enem.sqlite` e o manifesto;
2. execute os testes;
3. execute o deploy novamente;
4. investigue a causa em dry-run;
5. só então gere um novo banco.

Evite corrigir diretamente o binário SQLite publicado sem repetir o pipeline, pois isso quebra a rastreabilidade.

## 18. Checklist operacional

Antes de publicar um novo lote:

- [ ] questões do ano existem no `enem.sqlite`;
- [ ] fonte `ITENS_PROVA` disponível;
- [ ] proveniência documentada;
- [ ] auditoria executada em dry-run;
- [ ] ano classificado como `safe`;
- [ ] cobertura comparada com anos anteriores;
- [ ] precisão mínima conferida;
- [ ] offsets conferidos;
- [ ] questões não resolvidas inspecionadas;
- [ ] testes passaram;
- [ ] `PRAGMA integrity_check` passou;
- [ ] banco sincronizado;
- [ ] SHA-256 do banco registrado;
- [ ] commit do banco identificado;
- [ ] deploy executado depois do commit do banco;
- [ ] interface online conferida.

## 19. Princípio de segurança do processo

O objetivo não é alcançar 100% de cobertura a qualquer custo.

O objetivo é maximizar cobertura **sem atribuir metadados oficiais a uma questão errada**.

Por isso o pipeline foi construído para deixar questões sem enriquecimento quando a evidência não é suficiente. Uma questão sem título enriquecido é preferível a uma questão ligada ao item errado.
