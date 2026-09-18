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

O botão **Baixar PDF** gera a versão A4 formatada e abre a impressão do navegador. Escolha **Salvar como PDF** no destino da impressão. A versão do professor possui um botão separado com o gabarito em tabela.

A saída usa uma paleta monocromática adequada para impressão escolar. A folha de respostas é compacta, inclui nome completo, matrícula/RA, turma, data e assinatura, e identifica a variante para facilitar o arquivamento. Cada documento também exibe o controle de impressão **Página X de Y**; o total é calculado antes da abertura da impressão.

## Prévia dos resultados

Os cards da biblioteca exibem um trecho textual montado a partir do contexto, da introdução das alternativas e das alternativas da questão. A prévia remove imagens Markdown/HTML e reserva espaço visual para três linhas, mesmo quando o conteúdo é curto.

## Pré-visualização

Ao adicionar questões, a seção **Pré-visualização da prova** aparece no final da aplicação. Ela reutiliza o mesmo documento A4 das exportações, permite alternar entre aluno e professor e selecionar a variante para revisar a composição antes de abrir o PDF.
