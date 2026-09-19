# Diário de Desenvolvimento — Montador de Provas ENEM

Este log registra decisões, verificações e mudanças relevantes do desenvolvimento. Entradas devem ser objetivas, reproduzíveis quando possível e separadas de alterações de código feitas por outras pessoas.

## 18/09/2026 — Inicialização documental

**Escopo desta atividade:** documentação de desenvolvimento apenas. Foram criados os artefatos de planejamento e nenhum código, configuração de pacote, banco ou API foi alterado.

**Contexto observado no Git raiz:**

- Raiz confirmada em `/home/erick/enem-provas-criador`.
- O diretório raiz já possui Git.
- O estado inicial contém `.gitignore` e `enem.sqlite` como arquivos não rastreados, além de arquivos existentes em `montador-enem`; esse estado foi preservado.
- `enem-api` é um repositório separado dentro do workspace e já está excluída pelo `.gitignore` raiz (`/enem-api/`).
- A organização adotada para o produto é: aplicação independente em `montador-enem`, documentação em `.planning/` e `docs/`, dados canônicos em `enem.sqlite` na raiz.

**Banco canônico:**

- `enem.sqlite` existe na raiz e foi identificado como um arquivo SQLite 3 válido.
- O arquivo não foi movido, recriado, migrado, compactado ou modificado.
- A inspeção detalhada de schema e FTS5 fica planejada para a Fase 1.

**Decisões registradas:**

1. O montador não depende de `enem-api` em runtime.
2. A interface será construída com jQuery, Bootstrap 5 e Vite.
3. SQLite WASM será usado para leitura/pesquisa local no navegador.
4. O `enem.sqlite` na raiz será a fonte canônica para app, coletor e backups.
5. Um coletor CLI será o caminho controlado para ingestão e atualização dos dados.
6. A busca textual usará FTS5.
7. Exportações e backup fazem parte do escopo inicial e terão critérios de aceite próprios.

**Arquivos criados nesta entrada:**

- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `docs/DEVELOPMENT_LOG.md`

**Não alterado por esta atividade:** `montador-enem`, `montador-enem/package.json`, `enem.sqlite`, `enem-api` e qualquer outro código existente.

**Próximo marco:** iniciar a Fase 1 pela leitura do schema de `enem.sqlite`, definição do contrato de dados e verificação de inicialização independente do app.

---
*Entrada inicial criada em 18/09/2026.*

## 18/09/2026 — Implementação inicial independente

**Escopo:** criação da primeira implementação do Montador em `montador-enem`, mantendo `enem-api` fora do Git raiz.

**Entregas:**

- Projeto Vite com jQuery e Bootstrap 5.
- Sincronização do `enem.sqlite` canônico para os artefatos estáticos com manifesto SHA-256.
- Cache versionado do banco no navegador.
- Cliente e Web Worker SQLite WASM com `init`, filtros, busca FTS5, paginação, exclusão de selecionadas, carregamento de questão e fechamento.
- Busca corrigida para não usar `bm25()` agregado, incompatível com o SQLite local; a ordenação atual é determinística por ano, número e ID.
- Biblioteca de questões, filtros, seleção individual/lote, preview, montagem, pontuação, reordenação e rascunho.
- Variantes determinísticas de 1 a 5, com gabarito recalculado.
- Exportação HTML/Markdown para aluno/professor, download individual, ZIP e impressão.
- Backup JSON e restauração com validação de versão.
- CLI de coleta com paginação, validação, retries, tratamento de 429 e substituição atômica.
- Testes unitários iniciais do algoritmo de variantes.

**Evidências executadas:**

- `sqlite3 -readonly enem.sqlite 'PRAGMA integrity_check;'` retornou `ok`.
- `PRAGMA foreign_key_check` não retornou violações.
- Busca FTS5 nativa por `fotossintese` retornou 15 questões distintas.
- `git diff --check` não encontrou erros de whitespace.

**Bloqueios:**

- O ambiente atual não possui Node.js, npm, Deno ou Bun; por isso `npm install`, `npm test`, `npm run build` e a validação em navegador ainda não foram executados.
- A validação final precisa confirmar a API de desserialização do SQLite WASM, a cópia do banco pelo Vite e o carregamento das imagens remotas.

**Correção de dados incorporada:** o coletor permite posições duplicadas na lista `exam_questions` quando a API repete uma questão, preservando a questão normalizada única e as posições originais.

**Revisões posteriores da mesma rodada:**

- O ranking `bm25()` foi removido da consulta FTS5 porque o SQLite local retorna `unable to use function bm25 in the requested context` quando ele é agregado; a busca permanece agrupada por `question_id`.
- A interface foi adaptada ao contrato final do worker, que retorna a questão completa no nível superior, com `files` e `alternatives` já normalizados.
- O filtro “somente com imagens” agora só restringe quando marcado; desmarcado significa todos os resultados.
- A Variante A mantém a ordem original mesmo quando o embaralhamento determinístico das alternativas incorretas está ativo.
- `Retry-After` numérico é interpretado como segundos, conforme o padrão HTTP, e não como milissegundos.
- O filtro de imagens considera tanto `question_files` quanto `alternatives.file_url`; na base atual há 1.042 questões com algum tipo de imagem e 1.715 sem imagem.
- Foram adicionados testes de contrato do coletor em `montador-enem/tests/collector.test.mjs`, cobrindo duplicidade de posições, validação, flags e schema FTS5.

## 18/09/2026 — Validação com Node portátil

Para concluir a validação sem instalar runtime no sistema, foi usado temporariamente Node.js 26.9.0 em `/tmp`.

**Resultados:**

- `npm install --no-audit --no-fund`: concluído; `montador-enem/package-lock.json` gerado.
- `npm test`: 7 testes aprovados, 0 falhas.
- `npm run build`: aprovado; Vite transformou 78 módulos e empacotou o SQLite WASM (`sqlite3-Con_VOcu.wasm`, 868,91 kB).
- O build gerou `dist/enem.sqlite` com 16.031.744 bytes e manifesto SHA-256 correspondente.
- `npm run build:database -- --help`: aprovado, com flags documentadas.
- Servidor Vite temporário: HTML, `enem.sqlite.meta.json` e o cabeçalho SQLite foram servidos corretamente via HTTP.
- O app continua sem dependência runtime de `enem-api`.

**Smoke test de navegador:** Chromium headless temporário foi instalado em `/tmp` e `MONTADOR_TEST_URL=http://127.0.0.1:5181 npm run test:browser` passou. O teste confirmou carregamento do WASM, estado de banco pronto, busca por `fotossíntese`, seleção de uma questão, abertura do preview e ausência de erros de página/console.


## 18/09/2026 — Validação final do fluxo exportável

**Escopo:** repetir a validação depois dos ajustes finais e registrar o estado real do projeto.

**Resultados finais:**

- `npm test`: 7 testes aprovados, 0 falhas.
- `npm run build`: aprovado; sincronizou `enem.sqlite`, gerou o manifesto SHA-256 e empacotou 78 módulos do Vite.
- `MONTADOR_TEST_URL=http://127.0.0.1:5182 npm run test:browser`: aprovado; além da busca, seleção e preview, confirmou exportação do ZIP e do backup JSON.
- `npm run build:database -- --help`: aprovado anteriormente; as opções do coletor permanecem documentadas.
- O banco canônico continuou na raiz e não foi substituído pelo coletor durante os testes.

**Git e limites do projeto:**

- `enem-api/` continua ignorada pela regra `/enem-api/` do `.gitignore` raiz e não foi alterada.
- `montador-enem/` permanece independente, sem imports ou dependências de runtime de `enem-api`.
- `montador-enem/package-lock.json` foi gerado para reprodutibilidade das dependências.
- Node.js e Chromium foram usados apenas em diretórios temporários de `/tmp`; nenhuma instalação global foi feita.

**Pendência operacional conhecida:** a coleta contra a API real não foi executada para evitar substituir a base canônica sem uma janela explícita de atualização. O coletor possui testes simulados de validação, paginação e flags; uma atualização real deve ser feita separadamente e validada antes da troca atômica.


## 18/09/2026 — Correções de impressão e renderização visual

**Problemas corrigidos:**

- A impressão não dependia mais de uma janela aberta com `noopener,noreferrer`, combinação que fazia alguns navegadores retornar `null` e produzir o erro de bloqueio. A abertura agora usa uma janela compatível com o gesto do usuário e possui fallback por iframe.
- Alternativas passaram a usar `align-items: flex-start`, largura flexível para o conteúdo e remoção de margens verticais indevidas dos parágrafos Markdown.
- Imagens presentes no Markdown e também em `question_files` agora são deduplicadas no preview, HTML e Markdown exportados; URLs de alternativas continuam preservadas.

**Validação:**

- A suíte passou com 9 testes.
- O smoke test de Chromium confirmou impressão, alinhamento, filtro de imagens, ausência de URLs duplicadas, ZIP e backup.
- `npm run build` passou após as alterações.


## 18/09/2026 — Redesign formal da prova e PDF como ação principal

**Entregas:**

- Cabeçalho A4 estruturado com instituição, título, variante, disciplina, professor, turma, data, período, duração e valor.
- Campo de identificação do aluno, instruções destacadas e numeração visual das questões.
- Pontuação individual exibida nas questões e total de pontos no gabarito.
- Folha de respostas dimensionada para preenchimento manual.
- Gabarito do professor convertido em tabela compacta com questão, resposta e pontos.
- Botão principal **Baixar PDF**, abrindo a versão A4 pronta para o comando **Salvar como PDF** do navegador.
- HTML e Markdown mantidos como formatos auxiliares; ZIP continua disponível.
- Carregamento das imagens aguardado antes da impressão, com limite de espera para URLs remotas indisponíveis.

**Validação:**

- 9 testes automatizados aprovados.
- Smoke test de Chromium confirmou cabeçalho, folha de respostas, tabela de gabarito, PDF do aluno, PDF do professor, ZIP e backup.
- Build de produção aprovado.

## 18/09/2026 — Pré-visualização contínua da prova

**Entregas:**

- Nova seção **Pré-visualização da prova** no final da aplicação.
- Renderização em iframe com o mesmo HTML/CSS A4 usado pelo PDF, evitando divergência entre revisão e impressão.
- Atualização com debounce ao alterar questões, ordem, pontuação, cabeçalho, quantidade de variantes, embaralhamento ou folha de respostas.
- Alternância entre versão do aluno e do professor, incluindo a tabela de gabarito.
- Seletor da variante visualizada e botão para baixar o PDF exatamente da variante atual.
- Se a prova estiver vazia, a seção mostra uma orientação sem manter conteúdo antigo.
- Smoke test atualizado para validar a pré-visualização nos dois modos e a variante impressa.

**Validação:** `npm test` (9 aprovados), `npm run build` e `npm run test:browser` aprovados.


## 18/09/2026 — Folha de respostas monocromática e controle de paginação

**Entregas:**

- A prova exportada passou a usar uma paleta em tons de cinza, preservando contraste e hierarquia visual para impressão sem depender de tinta colorida.
- A folha de respostas foi compactada e ganhou identificação arquivável do aluno: nome completo, matrícula/RA, turma, data e assinatura, além da variante e da quantidade de questões.
- O rodapé de cada documento informa a variante e o controle **Página X de Y**. O total é calculado antes da abertura da impressão e aplicado tanto ao PDF do aluno quanto ao PDF do professor.
- O smoke test passou a verificar os campos de identificação, o rodapé e o total numérico de páginas.

**Validação:** `npm test` (9 aprovados), `npm run build` e `MONTADOR_TEST_URL=http://127.0.0.1:5190 npm run test:browser` aprovados.


## 18/09/2026 — Correção da prévia textual na biblioteca

**Problema:** a busca inicial, sem termo digitado, retornava `NULL AS snippet` e todos os cards exibiam “Sem trecho textual disponível.”.

**Correção:**

- O worker passou a montar a prévia a partir dos registros textuais do FTS5, priorizando `context`, `alternativesIntroduction` e `alternatives.text` e concatenando até três trechos.
- A interface remove marcações de imagens e links Markdown antes de exibir o resumo.
- Cada card reserva visualmente três linhas e aplica truncamento seguro para manter a lista uniforme.
- O smoke test passou a validar a busca inicial, a ausência do fallback e o mínimo de três linhas.

**Validação:** `npm test`, `npm run build` e `MONTADOR_TEST_URL=http://127.0.0.1:5191 npm run test:browser` aprovados.


## 18/09/2026 — Otimização da paginação SQLite

**Diagnóstico:** o snippet era calculado por uma subconsulta FTS correlacionada antes do `LIMIT 20`, fazendo o worker varrer praticamente todas as 2.757 questões. A troca de página levava aproximadamente 4,3–4,4 segundos no Chromium.

**Correção:**

- A consulta passou a materializar primeiro a página solicitada em uma CTE `paged AS MATERIALIZED`.
- Snippets sem termo usam diretamente `context`, `alternatives_introduction` e alternativas indexadas, sem varrer a tabela FTS.
- Snippets com termo e verificações de imagens são executados somente nos registros da página.
- A interface preserva os resultados durante a consulta, desabilita a paginação enquanto aguarda e ignora respostas fora de ordem.

**Resultado:** a troca para a página 2 passou a levar aproximadamente 61 ms no Chromium local, contra mais de 4 segundos antes da otimização.

**Validação:** `npm test` (9 aprovados), smoke test de navegador com limite de 2 segundos e `npm run build` aprovados.


## 18/09/2026 — Geração direta de PDF com margens fixas

**Problema:** o fluxo anterior abria uma página e dependia de window.print(). Escala, margens, cabeçalhos e destino configurados no navegador podiam alterar o resultado final para usuários sem conhecimento de impressão.

**Correção:**

- Adicionadas as dependências jspdf e html2canvas.
- O HTML formal da prova é renderizado em um iframe isolado e convertido diretamente para PDF A4.
- O gerador usa área útil de 180 mm, margens fixas de 15 mm laterais, 13 mm no topo e 20 mm na base, quebra automática orientada a texto e break-inside: avoid para cabeçalhos, questões, figuras, folha e gabarito.
- Figuras ficam limitadas a 72 mm de altura no modo PDF, aguardam carregamento e usam useCORS; as URLs originais continuam preservadas.
- Rodapés com variante e Página X de Y são desenhados depois da paginação, diretamente em todas as páginas do arquivo.
- Os botões de aluno, professor e pré-visualização baixam o PDF renderizado, sem popup e sem chamada de impressão.

**Validação:** npm test (9 aprovados), npm run build e smoke test Chromium (downloads PDF reais com cabeçalho %PDF-, tamanho válido e páginas detectadas) aprovados.


## 18/09/2026 — Publicação no GitHub Pages

**Entregas:**

- Adicionado o workflow .github/workflows/deploy-pages.yml, acionado por push na main ou manualmente, usando GitHub Actions Pages.
- O Vite aceita VITE_BASE_PATH e calcula automaticamente o prefixo do repositório no Actions.
- O cache do SQLite deixou de usar caminhos absolutos no domínio e passou a resolver manifesto e banco relativos a document.baseURI.
- O build continua sincronizando o banco canônico da raiz; enem-api permanece fora do Git e fora do processo de publicação.
- Adicionado preview:pages para testar localmente a aplicação em /enem-provas-criador/.

**Validação:** npm test, build com VITE_BASE_PATH=/enem-provas-criador/ e smoke test completo no subdiretório aprovados.


## 19/09/2026 — Artefato do Pages movido para docs/

**Entregas:**

- O Vite passou a gerar diretamente em docs/, que agora contém index.html, assets, WASM, manifesto e cópia publicada do SQLite.
- O build limpa somente os artefatos publicados anteriores e preserva docs/DEVELOPMENT_LOG.md.
- O workflow do GitHub Pages passou a enviar docs/ como artefato; a mesma pasta pode ser selecionada no GitHub em Deploy from a branch → main → /docs.
- O servidor preview:pages foi ajustado para servir o conteúdo de docs/ no subdiretório do projeto.

**Validação:** npm test, build com VITE_BASE_PATH=/enem-provas-criador/ e smoke test completo diretamente sobre docs/ aprovados.
