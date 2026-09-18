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

## PDF

O botão principal **Baixar PDF** gera o arquivo diretamente no navegador, sem abrir a janela de impressão e sem depender das configurações de escala, margens ou cabeçalho do usuário.

- O documento é renderizado em A4 retrato com área útil fixa de 180 mm.
- As margens usadas no arquivo são 15 mm à esquerda/direita, 13 mm no topo e 20 mm na base.
- Cabeçalhos, questões, figuras, folha de respostas e gabarito respeitam quebras de página controladas; figuras são limitadas à largura útil e a 72 mm de altura para não empurrar o conteúdo para fora da área imprimível.
- Cada página recebe no próprio PDF o rodapé **Variante X · Página Y de Z**.
- As imagens continuam referenciadas pelas URLs remotas. O renderizador aguarda o carregamento delas e usa CORS quando o servidor da imagem permite.
- HTML e Markdown continuam disponíveis como formatos auxiliares; o ZIP mantém esses arquivos.

A impressão do PDF fica a cargo do visualizador de PDF, mas o arquivo já está paginado e não requer que o usuário corrija as opções de impressão do navegador.

## Prévia dos resultados

Os cards da biblioteca exibem um trecho textual montado a partir do contexto, da introdução das alternativas e das alternativas da questão. A prévia remove imagens Markdown/HTML e reserva espaço visual para três linhas, mesmo quando o conteúdo é curto. A paginação consulta primeiro os 20 registros da página e só depois calcula snippets e imagens no SQLite local.

## Pré-visualização

Ao adicionar questões, a seção **Pré-visualização da prova** aparece no final da aplicação. Ela reutiliza o mesmo documento A4 das exportações, permite alternar entre aluno e professor e selecionar a variante para revisar a composição antes de abrir o PDF.
