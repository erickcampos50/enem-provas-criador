let S,g,_,q=Promise.resolve();function b(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function s(e,t,n,i){const r=new Error(t);return r.name=e,n&&(r.code=n),i!==void 0&&(r.details=i),r}function M(e){const t=e instanceof Error?e:new Error(String(e)),n={name:typeof t.name=="string"?t.name:"Error",message:typeof t.message=="string"?t.message:String(t)};if((typeof t.code=="string"||typeof t.code=="number")&&(n.code=t.code),typeof t.resultCode=="number"&&(n.resultCode=t.resultCode),t.details!==void 0)try{JSON.stringify(t.details),n.details=t.details}catch{n.details=String(t.details)}return typeof t.stack=="string"&&(n.stack=t.stack),n}function T(e,t){self.postMessage({id:e??null,type:"response",ok:!0,result:t})}function R(e,t){self.postMessage({id:e??null,type:"response",ok:!1,error:M(t)})}async function D(){return S||(S=import("./index-DlV0y7TX.js").then(async e=>{const t=e.default??e.sqlite3InitModule;if(typeof t!="function")throw s("SQLiteLoadError","O módulo @sqlite.org/sqlite-wasm não exportou sqlite3InitModule.","SQLITE_MODULE_INVALID");return t()})),S}function h(){if(!_)throw s("DatabaseNotInitializedError","O banco SQLite ainda não foi inicializado.","DB_NOT_INITIALIZED");return _}function f(e,t,n){const i=[],r={sql:t,rowMode:"object",resultRows:i};return n!==void 0&&(r.bind=n),e.exec(r),i}function l(e){return typeof e=="bigint"?Number(e):e}function O(e){return e instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&e instanceof SharedArrayBuffer}function v(e){return O(e)?new Uint8Array(e):ArrayBuffer.isView(e)?new Uint8Array(e.buffer,e.byteOffset,e.byteLength):null}function x(e){const t=e?.payload,n=[t,t?.buffer,t?.arrayBuffer,e?.buffer,e?.arrayBuffer];for(const i of n){const r=v(i);if(r)return r}return null}function L(){const e=_;_=void 0,e&&e.close()}async function C(e){const t=x(e);if(!t||t.byteLength===0)throw s("InvalidArgumentError","init exige um ArrayBuffer não vazio contendo um banco SQLite.","INVALID_DATABASE_BUFFER");g=await D(),L();const n=new g.oo1.DB;let i,r=!1;try{i=g.wasm.allocFromTypedArray(t);const u=g.capi.sqlite3_deserialize(n.pointer,"main",i,t.byteLength,t.byteLength,0);n.checkRc(u),r=!0,n.onclose={after:()=>{i&&(g.wasm.dealloc(i),i=void 0)}};const E=f(n,`SELECT name
         FROM sqlite_schema
        WHERE type = 'table'
          AND name IN ('questions', 'alternatives', 'question_files', 'search_index')`).map(d=>d.name),o=["questions","alternatives","question_files","search_index"].filter(d=>!E.includes(d));if(o.length>0)throw s("DatabaseSchemaError",`O banco não contém as tabelas obrigatórias: ${o.join(", ")}.`,"DB_SCHEMA_INVALID",{missingTables:o});const a=f(n,"SELECT count(*) AS total FROM questions")[0]?.total;return _=n,{ready:!0,version:g.version?.libVersion??null,questionCount:Number(l(a)??0)}}catch(u){throw r||i&&g.wasm.dealloc(i),n.close(),u}}function $(){const e=h(),t=f(e,`SELECT year AS value, CAST(year AS TEXT) AS label
       FROM exams
      ORDER BY year DESC`).map(r=>({value:Number(l(r.value)),label:r.label})),n=f(e,`SELECT value, label
       FROM exam_disciplines
      GROUP BY value, label
      ORDER BY label COLLATE NOCASE, value`),i=f(e,`SELECT value, label
       FROM exam_languages
      GROUP BY value, label
      ORDER BY label COLLATE NOCASE, value`);return{years:t,disciplines:n,languages:i}}function m(e,t,{min:n=Number.MIN_SAFE_INTEGER,max:i=Number.MAX_SAFE_INTEGER}={}){if(e==null||e==="")return;const r=typeof e=="number"?e:Number(e);if(!Number.isSafeInteger(r)||r<n||r>i)throw s("InvalidArgumentError",`${t} deve ser um inteiro válido.`,"INVALID_ARGUMENT",{field:t});return r}function y(e,t){if(e==null||e==="")return;if(typeof e!="string")throw s("InvalidArgumentError",`${t} deve ser uma string.`,"INVALID_ARGUMENT",{field:t});return e.trim()||void 0}function w(e){if(!e)return{query:void 0,noMatches:!1};if(e.length>2048)throw s("InvalidArgumentError","q não pode exceder 2048 caracteres.","INVALID_ARGUMENT",{field:"q",maxLength:2048});const n=e.normalize("NFKC").match(/[\p{L}\p{N}]+/gu)??[];return n.length===0?{query:void 0,noMatches:!0}:{query:n.map(i=>`"${i.replaceAll('"','""')}"`).join(" AND "),noMatches:!1}}function U(e){const t=b(e)?e:{};if(t.q!==void 0&&t.q!==null&&typeof t.q!="string")throw s("InvalidArgumentError","q deve ser uma string.","INVALID_ARGUMENT",{field:"q"});const n=t.q?.trim()??"",i=w(n),r=m(t.year,"year"),u=y(t.discipline,"discipline"),E=y(t.language,"language"),o=m(t.page,"page",{min:1})??1,a=m(t.pageSize,"pageSize",{min:1,max:100})??20;if(t.hasImages!==void 0&&t.hasImages!==null&&typeof t.hasImages!="boolean")throw s("InvalidArgumentError","hasImages deve ser booleano.","INVALID_ARGUMENT",{field:"hasImages"});const d=t.excludeIds??[];if(!Array.isArray(d))throw s("InvalidArgumentError","excludeIds deve ser um array.","INVALID_ARGUMENT",{field:"excludeIds"});if(d.length>1e3)throw s("InvalidArgumentError","excludeIds não pode conter mais de 1000 IDs.","INVALID_ARGUMENT",{field:"excludeIds",maxLength:1e3});const I=[...new Set(d.map(A=>m(A,"excludeIds",{min:1})))];if(I.some(A=>A===void 0))throw s("InvalidArgumentError","excludeIds contém um ID inválido.","INVALID_ARGUMENT",{field:"excludeIds"});const p=(o-1)*a;if(!Number.isSafeInteger(p))throw s("InvalidArgumentError","page é grande demais.","INVALID_ARGUMENT",{field:"page"});return{q:n,ftsQuery:i.query,noMatches:i.noMatches,year:r,discipline:u,language:E,hasImages:t.hasImages,excludeIds:I,limit:a,offset:p,page:o,pageSize:a}}function F(e){const t={},n=[];let i="";if(e.ftsQuery?(i=`
      JOIN (
        SELECT question_id
          FROM search_index
         WHERE search_index MATCH $fts
         GROUP BY question_id
      ) AS matched ON matched.question_id = q.id`,t.$fts=e.ftsQuery):e.noMatches&&n.push("0"),e.year!==void 0&&(n.push("q.year = $year"),t.$year=e.year),e.discipline!==void 0&&(n.push("q.discipline = $discipline"),t.$discipline=e.discipline),e.language!==void 0&&(n.push("q.language = $language"),t.$language=e.language),e.hasImages===!0&&n.push(`(EXISTS (SELECT 1 FROM question_files AS image_filter WHERE image_filter.question_id = q.id)
        OR EXISTS (SELECT 1 FROM alternatives AS alternative_image_filter
                   WHERE alternative_image_filter.question_id = q.id
                     AND alternative_image_filter.file_url IS NOT NULL))`),e.excludeIds.length>0){const u=e.excludeIds.map((E,o)=>{const a=`$exclude_${o}`;return t[a]=E,a});n.push(`q.id NOT IN (${u.join(", ")})`)}const r=n.length>0?`WHERE ${n.join(`
          AND `)}`:"";return{bind:t,join:i,where:r}}function B(e){return{id:Number(l(e.id)),year:Number(l(e.year)),number:Number(l(e.number)),language:e.language??null,title:e.title,discipline:e.discipline??null,hasImages:!!Number(l(e.has_images)),snippet:e.snippet??null}}function Q(e){const t=h(),n=U(e),i=F(n),r=f(t,`SELECT count(*) AS total
       FROM questions AS q
       ${i.join}
       ${i.where}`,i.bind),u=Number(l(r[0]?.total)??0),E={...i.bind,$limit:n.limit,$offset:n.offset},o=n.ftsQuery?`(SELECT snippet(search_index, 3, '', '', '…', 18)
         FROM search_index
        WHERE search_index.question_id = paged.id
          AND search_index MATCH $fts
        LIMIT 1) AS snippet,`:`trim(
         substr(coalesce(paged.context, ''), 1, 480) || char(32) ||
         substr(coalesce(paged.alternatives_introduction, ''), 1, 480) || char(32) ||
         coalesce((
           SELECT group_concat(alternative_preview.text, char(32))
             FROM (
               SELECT substr(trim(alternative_preview.text), 1, 480) AS text
                 FROM alternatives AS alternative_preview
                WHERE alternative_preview.question_id = paged.id
                  AND alternative_preview.text IS NOT NULL
                ORDER BY alternative_preview.id
                LIMIT 3
             ) AS alternative_preview
         ), '')
       ) AS snippet,`,a=f(t,`WITH paged AS MATERIALIZED (
       SELECT q.id,
              q.year,
              q.number,
              q.language,
              q.title,
              q.discipline,
              q.context,
              q.alternatives_introduction
         FROM questions AS q
         ${i.join}
         ${i.where}
        ORDER BY q.year DESC, q.number ASC, q.id ASC
        LIMIT $limit OFFSET $offset
    )
    SELECT paged.id,
           paged.year,
           paged.number,
           paged.language,
           paged.title,
           paged.discipline,
           ${o}
           EXISTS (
             SELECT 1
               FROM question_files AS result_images
              WHERE result_images.question_id = paged.id
           ) OR EXISTS (
             SELECT 1
               FROM alternatives AS result_alternative_images
              WHERE result_alternative_images.question_id = paged.id
                AND result_alternative_images.file_url IS NOT NULL
           ) AS has_images
      FROM paged`,E);return{total:u,page:n.page,pageSize:n.pageSize,results:a.map(B)}}function G(e){if(typeof e=="number"||typeof e=="string")return{id:e};if(!b(e))throw s("InvalidArgumentError","getQuestion exige um ID ou uma chave de questão.","INVALID_ARGUMENT");return e}function H(e){const t=h(),n=G(e),i=m(n.id??n.questionId,"id",{min:1}),r=m(n.year,"year"),u=m(n.number,"number",{min:1}),E=y(n.language,"language");if(i===void 0&&(r===void 0||u===void 0))throw s("InvalidArgumentError","getQuestion exige id/questionId ou o conjunto year + number.","INVALID_ARGUMENT");let o;if(i!==void 0)o=f(t,`SELECT id, year, number, language, title, discipline, context,
              alternatives_introduction, correct_alternative, source_path
         FROM questions
        WHERE id = $id`,{$id:i});else{const c={$year:r,$number:u},N=["year = $year","number = $number"];if(E!==void 0&&(N.push("language = $language"),c.$language=E),o=f(t,`SELECT id, year, number, language, title, discipline, context,
              alternatives_introduction, correct_alternative, source_path
         FROM questions
        WHERE ${N.join(" AND ")}
        LIMIT 2`,c),o.length>1)throw s("AmbiguousQuestionError","Mais de uma questão corresponde a year + number; informe language ou id.","AMBIGUOUS_QUESTION")}const a=o[0];if(!a)throw s("QuestionNotFoundError","Questão não encontrada.","QUESTION_NOT_FOUND");const d=Number(l(a.id)),I=f(t,`SELECT id, letter, text, file_url, is_correct
       FROM alternatives
      WHERE question_id = $questionId
      ORDER BY letter COLLATE NOCASE, id`,{$questionId:d}).map(c=>({id:Number(l(c.id)),letter:c.letter,text:c.text??null,file:c.file_url??null,fileUrl:c.file_url??null,isCorrect:!!Number(l(c.is_correct))})),p=f(t,`SELECT url
       FROM question_files
      WHERE question_id = $questionId
      ORDER BY position, id`,{$questionId:d}).map(c=>c.url);return{id:d,year:Number(l(a.year)),number:Number(l(a.number)),language:a.language??null,title:a.title,discipline:a.discipline??null,context:a.context??null,alternativesIntroduction:a.alternatives_introduction??null,correctAlternative:a.correct_alternative??null,sourcePath:a.source_path,alternatives:I,files:p,urls:p}}async function X(e){const t=e?.id??null;if(!b(e)||typeof e.type!="string"){R(t,s("InvalidMessageError","Mensagem de worker inválida.","INVALID_MESSAGE"));return}try{let n;switch(e.type){case"init":n=await C(e);break;case"getFilters":n=$(e.payload);break;case"searchQuestions":n=Q(e.payload);break;case"getQuestion":n=H(e.payload);break;case"close":L(),n={closed:!0};break;default:throw s("UnknownMessageError",`Operação desconhecida: ${e.type}.`,"UNKNOWN_MESSAGE")}T(t,n)}catch(n){R(t,n)}}typeof self<"u"&&self.addEventListener("message",e=>{q=q.then(()=>X(e.data))});
