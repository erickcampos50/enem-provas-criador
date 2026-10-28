# Provas ENEM para Professores

Aplicação estática para professores pesquisarem questões do ENEM, criarem rapidamente avaliações fundamentadas, gerarem variantes e exportarem documentos para aluno e professor.

## Desenvolvimento

Requer Node.js 20.19 ou mais recente e npm 10 ou mais recente.

O banco canônico está em `../enem.sqlite`. Para instalar as dependências e preparar a cópia usada pelo Vite:

```bash
npm install
npm run sync:database
npm run dev
```

O navegador carrega o SQLite WASM em um Web Worker. O texto das questões funciona localmente depois do carregamento; as imagens continuam usando as URLs remotas gravadas no banco.

## Filtros na URL

A busca e os filtros aplicados ficam gravados na URL, então recarregar a página ou compartilhar o endereço restaura a mesma visualização. Os parâmetros usados são:

| Parâmetro | Conteúdo |
| --- | --- |
| `q` | termos da busca |
| `ano` | ano da prova |
| `area` | área/disciplina ou `lang:<idioma>` |
| `dificuldade` | faixa de dificuldade (`facil`, `medio`, `dificil`, etc.) |
| `imagens` | `1` para somente questões com imagens |
| `ocultar` | `1` para ocultar questões já selecionadas |
| `pagina` | página de resultados (omitida na primeira) |

O botão **Limpar buscas** remove os parâmetros. O navegador também restaura o estado ao usar os botões voltar/avançar, e links de prova (`#prova=...`) preservam os filtros da URL.

## Atualização do banco

```bash
npm run build:database -- --delay-ms 500 --verbose
```

O coletor gera um arquivo temporário e só substitui `../enem.sqlite` depois de validar o conteúdo e o `integrity_check`.

## Imagens locais (esquema `asset:`)

As figuras ficam em `public/media/<ano>/questions/...` e são referenciadas no SQLite como `asset:media/...`. A resolução é multi-host (`src/assets.js`):

1. `VITE_ASSET_BASE_URL` (CDN/espelho), se definido;
2. `BASE_URL` do Vite (ex. `/enem-provas-criador/` no GitHub Pages);
3. fallback `https://erickcampos50.github.io/enem-provas-criador/`.

Para republicar as imagens 2009–2023 a partir de `yunger7/enem-api`:

```bash
npm run localize:images -- --source /caminho/do/enem-api/public --verbose
```

## Anos novos via PDF oficial (2024+)

A API enem.dev só cobre 2009–2023. Para anos posteriores, extraia dos PDFs Azul do INEP e importe incrementalmente (sem rebuild):

```bash
npm run extract:years -- --years 2024,2025
npm run import:years -- --years 2024,2025
npm test
npm run sync:database
```

`extract:years` baixa `*_PV_impresso_D1_CD1` / `*_PV_impresso_D2_CD7` e gabaritos em `.cache/enem-pdf` e gera JSON+media em `.cache/enem-extract/<ano>/`. `import:years` grava só os anos pedidos e preserva enriquecimento INEP.

As figuras são associadas à questão dona do bloco pela ordem de leitura do caderno (coluna esquerda e depois direita), ignorando capa, proposta de redação e folha de respostas. Imagens JPEG 2000 (`jpx`) são convertidas para PNG porque os navegadores não as decodificam.

No texto, uma linha só é tratada como alternativa A quando B, C, D e E aparecem em seguida. Isso evita que enunciados iniciados por “A ...” (por exemplo, “A cúpula pentagonal...”) sejam confundidos com a alternativa A e desapareçam do contexto.

Se um ano já importado precisar ter as associações de imagem ou os textos recalculados (sem alterar IDs de questão nem enriquecimento INEP):

```bash
npm run repair:images -- --years 2024,2025 --extract-root ../.cache/enem-extract --prune-media
npm run repair:text -- --years 2024,2025 --extract-root ../.cache/enem-extract
```

**Procedimento passo a passo para ENEM 2026+ (PDFs, microdados, enriquecimento e deploy):**  
[`../documentation/NEW_YEAR_RUNBOOK.md`](../documentation/NEW_YEAR_RUNBOOK.md)

## Enriquecimento com microdados do INEP

O procedimento completo para auditar, aplicar e publicar o enriquecimento das questões está documentado em:

`../documentation/INEP_ENRICHMENT_RUNBOOK.md`

O guia cobre execução local e via GitHub Actions, inclusão de novos anos, critérios de segurança, relatórios, `TP_LINGUA`, encoding, deploy e rollback.

## Dificuldade das questões (TRI)

A dificuldade exibida na biblioteca e no modal é derivada do parâmetro `b` da TRI (modelo 3PL) publicado pelo Inep em `ITENS_PROVA` e já gravado em `question_inep_metadata.tri_b`. Não é necessário baixar os microdados completos de respostas: os snapshots atuais cobrem 3.002 das 3.127 questões.

As faixas ficam em `src/difficulty.js` e usam os percentis da base 2009–2025:

| Faixa | `b` |
| --- | --- |
| Muito fácil | < 0,5 |
| Fácil | 0,5 – 1,2 |
| Médio | 1,2 – 1,9 |
| Difícil | 1,9 – 2,5 |
| Muito difícil | ≥ 2,5 |

Um item fica **Sem classificação** quando não há metadado INEP, quando `b` está ausente, quando `a < 0,5` (discriminação baixa torna `b` não identificável) ou quando `b > 5` (outlier de calibração). Hoje são 125 questões nessa condição.

O filtro **Dificuldade** consulta `tri_a`/`tri_b` no worker e combina com os demais filtros. Na lista, cada questão recebe um contorno colorido em escala verde→vermelho e uma tag com o grau; no modal aparece apenas a tag. O valor numérico de `b` não é exibido nas tags — fica disponível no tooltip.

## Testes

```bash
npm test
npm run build
```

Com um servidor Vite já iniciado em outra janela, o smoke test de navegador pode ser executado com Chromium:

```bash
MONTADOR_TEST_URL=http://127.0.0.1:4173/enem-provas-criador/ npm run test:browser
```

`enem-api/` é um projeto legado separado e está excluído do Git da raiz.

## Publicação no GitHub Pages

O workflow [deploy-pages.yml](../.github/workflows/deploy-pages.yml) publica automaticamente a aplicação quando há um push na branch `main`. No GitHub, você pode configurar Settings → Pages → Deploy from a branch → `main` → `/docs` para usar o padrão nativo. O workflow de Actions também continua disponível para publicação automática por artefato.

Depois da publicação, a aplicação ficará disponível em:

`https://erickcampos50.github.io/enem-provas-criador/`

O build instala as dependências, executa os testes, sincroniza o `enem.sqlite` canônico da raiz e gera a aplicação publicada diretamente em `docs/`, com o caminho-base correto. O banco e o WASM são carregados pelo subdiretório do projeto; nenhum arquivo de `enem-api/` participa do build. A pasta `montador-enem/` contém o código-fonte e `docs/` contém o artefato que o Pages publica.

Para testar localmente o mesmo caminho-base do Pages:

```bash
VITE_BASE_PATH=/enem-provas-criador/ npm run build
npm run preview:pages -- --host 127.0.0.1 --port 4173
```

## PDF

O botão **Baixar prova em PDF** prepara a versão A4 e abre a impressão do navegador. Escolha **Salvar como PDF** no destino da impressão.

- O documento usa uma folha A4 monocromática, com cabeçalho formal, folha de respostas e gabarito do professor.
- A variante é identificada no cabeçalho da prova; não há faixa fixa sobre o conteúdo.
- O navegador aguarda o carregamento das imagens antes de abrir a impressão; as URLs remotas permanecem preservadas.
- A versão ZIP inclui os arquivos HTML e Markdown como formatos auxiliares.

## Salvar e compartilhar

A prova é salva automaticamente neste navegador. O botão **Salvar e compartilhar prova** permite salvar agora, baixar um arquivo JSON para uso futuro e gerar um link contendo a composição da prova, sem duplicar o banco ou as imagens.

## Gerar variantes

As variantes mantêm as mesmas questões, mas mudam a ordem das alternativas e geram gabaritos próprios. A opção de embaralhar incorretas também altera a ordem relativa das alternativas erradas de forma determinística; a folha de respostas compacta pode ser incluída na versão do aluno.

A pré-visualização usa o mesmo HTML/CSS da impressão para permitir a conferência antes de abrir a janela de impressão.
## Prévia dos resultados

Os cards da biblioteca exibem um trecho textual montado a partir do contexto, da introdução das alternativas e das alternativas da questão. A prévia remove imagens Markdown/HTML e reserva espaço visual para três linhas, mesmo quando o conteúdo é curto. A paginação consulta primeiro os 20 registros da página e só depois calcula snippets e imagens no SQLite local.

## Pré-visualização

Ao adicionar questões, a seção **Pré-visualização da prova** aparece no final da aplicação. Ela reutiliza o mesmo documento A4 das exportações, permite alternar entre aluno e professor e selecionar a variante para revisar a composição antes de abrir o PDF.
