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

## Atualização do banco

```bash
npm run build:database -- --delay-ms 500 --verbose
```

O coletor gera um arquivo temporário e só substitui `../enem.sqlite` depois de validar o conteúdo e o `integrity_check`.

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
