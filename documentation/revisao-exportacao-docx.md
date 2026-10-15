# Revisão da geração de provas e exportação DOCX

Data: 15/10/2026. Branch: `teste/export-docx`.

## Parecer

O protótipo inicial de DOCX tinha falhas de conteúdo e diagramação, além de cobertura de testes insuficiente. Foram corrigidas as falhas descritas abaixo. A validação realizada confirma o funcionamento dos cenários testados no Chrome e no LibreOffice; não constitui validação de todas as questões nem de todas as versões do Microsoft Word.

**Ainda não recomendar publicação geral sem revisar a qualidade dos dados importados e conferir os documentos no Word utilizado pelo público.** Foi encontrado um erro semântico na própria base durante a inspeção visual, descrito em “Pendências”.

## Falhas corrigidas

- Grade, larguras e bordas explícitas nas tabelas; cabeçalho repetido em tabelas multipágina e linhas sem divisão entre páginas.
- Metadados não recebem negrito indevido por confusão com `String.prototype.bold`.
- Imagens reais incorporadas ao pacote DOCX, com relacionamentos e tipos de mídia; proporção preservada e tamanho limitado à página A4.
- Preservação da ordem de leitura (texto, imagem, legenda), inclusive imagens pequenas dentro de equações.
- Letras das alternativas visuais preservadas; imagem repetida no texto e no campo de arquivo não é duplicada.
- Identificadores de desenho únicos mesmo quando a mesma imagem aparece várias vezes.
- Imagens nas instruções e na introdução das alternativas incluídas.
- Negrito, itálico, entidades HTML, subscrito, sobrescrito, listas e tabelas Markdown preservados.
- Títulos ligados ao conteúdo seguinte; alternativas visuais mantidas junto de suas letras. Folha de respostas e gabarito iniciam em página própria.
- Identificação de aluno/turma/data na folha de respostas.
- Verificação de integridade do gabarito e dos pontos antes do DOCX; questões anuladas ou incompletas são informadas ao professor.
- Falha de rede, imagem inválida ou resposta HTML em lugar de imagem interrompem a geração, sem baixar prova incompleta. Requisições possuem tempo limite.
- Imagens carregadas uma vez por exportação e compartilhadas entre variantes; sem cache global permanente de imagens.
- Estado da prova copiado antes da operação assíncrona; botão informa preparação, impede cliques repetidos e se recupera após erro.
- PDF também verifica se as imagens realmente carregaram antes de abrir a impressão.
- Ausência de questão no cache deixa de produzir silenciosamente uma questão vazia.

## Evidências

- `npm test`: 51 testes aprovados na suíte após a ampliação de cobertura DOCX.
- `CHROME_PATH=/usr/bin/google-chrome npm run test:docx:browser`: exercício da interface, erro sem seleção, recuperação do botão, download dos dez documentos das cinco variantes e bloqueio da impressão PDF quando uma imagem não carrega.
- `npm run build`: aprovado.
- Amostra adicional de oito questões reais: 2023/Q127 (exemplo relatado), 2018/Q93, 2012/Q59, 2023/Q110, 2009/Q1, 2016/Q1, 2024/Q1 e 2025/Q1.
- Geração das cinco variantes da amostra: dez DOCX, cada um com 13 ocorrências de imagem. XML, relacionamentos, existência da mídia e unicidade dos identificadores verificados. Gabaritos dos cinco documentos do professor conferidos contra a ordem efetiva das alternativas.
- Dez DOCX convertidos pelo LibreOffice 26.2.5.2, sem erro de abertura; inspeção visual de páginas com enunciados, equações, alternativas gráficas e folha de respostas.
- Inventário dos dados: 3.127 questões; 2.359 referências únicas de imagens locais, sem arquivo local ausente. Isso verifica existência, não pertinência ou legibilidade de cada imagem.
- Quatro questões sem gabarito, todas identificadas como anuladas: 2024/Q129 e 2025/Q123, Q132, Q174.

## Pendências para publicação

### Alta: conteúdo importado de 2024

A questão 1 de espanhol de 2024 apresenta o texto “El virus de la cancelación”, mas tem uma imagem de carta em inglês (“The Color Purple”) associada. Há também texto de rodapé do caderno junto à alternativa E. O DOCX reproduz os dados que recebeu; o problema está na associação/segmentação da importação.

É necessário revisar a extração e a associação de imagens e alternativas dos anos importados de PDF, conferir com os cadernos oficiais e corrigir os dados na origem. Remover imagens automaticamente no exportador mascararia o problema e poderia eliminar imagens legítimas.

### Compatibilidade Word ainda não homologada

Os arquivos foram abertos e renderizados pelo LibreOffice. Microsoft Word desktop e Word Online não foram executados nesta revisão. Conferir documentos representativos nesses programas antes de anunciar suporte homologado.

### Conteúdos fora da cobertura

Tabelas HTML, SVG/MathML e imagens dentro de células de tabelas não possuem conversão DOCX implementada. Quando reconhecidos, interrompem a exportação com orientação para usar PDF, em vez de perder conteúdo silenciosamente. Não foi realizada revisão pedagógica de todas as 3.127 questões.

## Repetição dos testes

Na pasta `montador-enem`, com a aplicação de teste em execução:

```sh
npm test
MONTADOR_TEST_URL=http://localhost:5173 CHROME_PATH=/usr/bin/google-chrome npm run test:docx:browser
npm run build
```

`CHROME_PATH` é opcional quando o Chromium do Playwright está instalado. O teste de navegador cria um contexto isolado e não modifica a prova salva no navegador do professor.
