# Montador de Provas ENEM

Aplicação estática para professores pesquisarem questões do ENEM, montarem avaliações, criarem variantes e exportarem documentos para aluno e professor.

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
MONTADOR_TEST_URL=http://127.0.0.1:4173 npm run test:browser
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

O botão **Baixar PDF** prepara a versão A4 e abre a impressão do navegador. Escolha **Salvar como PDF** no destino da impressão.

- O documento usa uma folha A4 monocromática, com cabeçalho formal, folha de respostas e gabarito do professor.
- O marcador de variante e página fica em uma faixa reservada no alto da folha, fora do fluxo do cabeçalho e das questões.
- O navegador aguarda o carregamento das imagens antes de abrir a impressão; as URLs remotas permanecem preservadas.
- HTML e Markdown continuam disponíveis como formatos auxiliares; o ZIP mantém esses arquivos.

A pré-visualização usa o mesmo HTML/CSS da impressão para permitir a conferência antes de abrir a janela de impressão.
## Prévia dos resultados

Os cards da biblioteca exibem um trecho textual montado a partir do contexto, da introdução das alternativas e das alternativas da questão. A prévia remove imagens Markdown/HTML e reserva espaço visual para três linhas, mesmo quando o conteúdo é curto. A paginação consulta primeiro os 20 registros da página e só depois calcula snippets e imagens no SQLite local.

## Pré-visualização

Ao adicionar questões, a seção **Pré-visualização da prova** aparece no final da aplicação. Ela reutiliza o mesmo documento A4 das exportações, permite alternar entre aluno e professor e selecionar a variante para revisar a composição antes de abrir o PDF.
