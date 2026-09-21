let N,_,I,M=Promise.resolve();function R(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function u(e,t,n,i){const r=new Error(t);return r.name=e,n&&(r.code=n),i!==void 0&&(r.details=i),r}function D(e){const t=e instanceof Error?e:new Error(String(e)),n={name:typeof t.name=="string"?t.name:"Error",message:typeof t.message=="string"?t.message:String(t)};if((typeof t.code=="string"||typeof t.code=="number")&&(n.code=t.code),typeof t.resultCode=="number"&&(n.resultCode=t.resultCode),t.details!==void 0)try{JSON.stringify(t.details),n.details=t.details}catch{n.details=String(t.details)}return typeof t.stack=="string"&&(n.stack=t.stack),n}function x(e,t){self.postMessage({id:e??null,type:"response",ok:!0,result:t})}function O(e,t){self.postMessage({id:e??null,type:"response",ok:!1,error:D(t)})}async function C(){return N||(N=import("./index-DlV0y7TX.js").then(async e=>{const t=e.default??e.sqlite3InitModule;if(typeof t!="function")throw u("SQLiteLoadError","O módulo @sqlite.org/sqlite-wasm não exportou sqlite3InitModule.","SQLITE_MODULE_INVALID");return t()})),N}function L(){if(!I)throw u("DatabaseNotInitializedError","O banco SQLite ainda não foi inicializado.","DB_NOT_INITIALIZED");return I}function m(e,t,n){const i=[],r={sql:t,rowMode:"object",resultRows:i};return n!==void 0&&(r.bind=n),e.exec(r),i}function g(e){return typeof e=="bigint"?Number(e):e}function w(e){return e instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&e instanceof SharedArrayBuffer}function $(e){return w(e)?new Uint8Array(e):ArrayBuffer.isView(e)?new Uint8Array(e.buffer,e.byteOffset,e.byteLength):null}function U(e){const t=e?.payload,n=[t,t?.buffer,t?.arrayBuffer,e?.buffer,e?.arrayBuffer];for(const i of n){const r=$(i);if(r)return r}return null}function v(){const e=I;I=void 0,e&&e.close()}async function F(e){const t=U(e);if(!t||t.byteLength===0)throw u("InvalidArgumentError","init exige um ArrayBuffer não vazio contendo um banco SQLite.","INVALID_DATABASE_BUFFER");_=await C(),v();const n=new _.oo1.DB;let i,r=!1;try{i=_.wasm.allocFromTypedArray(t);const s=_.capi.sqlite3_deserialize(n.pointer,"main",i,t.byteLength,t.byteLength,0);n.checkRc(s),r=!0,n.onclose={after:()=>{i&&(_.wasm.dealloc(i),i=void 0)}};const p=m(n,`SELECT name
         FROM sqlite_schema
        WHERE type = 'table'
          AND name IN ('exams', 'questions', 'alternatives', 'question_files', 'search_index')`).map(a=>a.name),l=["exams","questions","alternatives","question_files","search_index"].filter(a=>!p.includes(a));if(l.length>0)throw u("DatabaseSchemaError",`O banco não contém as tabelas obrigatórias: ${l.join(", ")}.`,"DB_SCHEMA_INVALID",{missingTables:l});const o=m(n,"SELECT (SELECT count(*) FROM questions) AS question_count, (SELECT count(*) FROM exams) AS exam_count")[0];return I=n,{ready:!0,version:_.version?.libVersion??null,questionCount:Number(g(o?.question_count)??0),examCount:Number(g(o?.exam_count)??0)}}catch(s){throw r||i&&_.wasm.dealloc(i),n.close(),s}}function B(){const e=L(),t=m(e,`SELECT year AS value, CAST(year AS TEXT) AS label
       FROM exams
      ORDER BY year DESC`).map(r=>({value:Number(g(r.value)),label:r.label})),n=m(e,`SELECT value, label
       FROM exam_disciplines
      GROUP BY value, label
      ORDER BY label COLLATE NOCASE, value`),i=m(e,`SELECT value, label
       FROM exam_languages
      GROUP BY value, label
      ORDER BY label COLLATE NOCASE, value`);return{years:t,disciplines:n,languages:i}}function y(e,t,{min:n=Number.MIN_SAFE_INTEGER,max:i=Number.MAX_SAFE_INTEGER}={}){if(e==null||e==="")return;const r=typeof e=="number"?e:Number(e);if(!Number.isSafeInteger(r)||r<n||r>i)throw u("InvalidArgumentError",`${t} deve ser um inteiro válido.`,"INVALID_ARGUMENT",{field:t});return r}function q(e,t){if(e==null||e==="")return;if(typeof e!="string")throw u("InvalidArgumentError",`${t} deve ser uma string.`,"INVALID_ARGUMENT",{field:t});return e.trim()||void 0}function Q(e){if(!e)return{query:void 0,noMatches:!1};if(e.length>2048)throw u("InvalidArgumentError","q não pode exceder 2048 caracteres.","INVALID_ARGUMENT",{field:"q",maxLength:2048});const t=e.normalize("NFKC").trim();if(!t)return{query:void 0,noMatches:!1};const n=[];let i=0;const r=t.length;for(;i<r;){for(;i<r&&/\s/.test(t[i]);)i++;if(i>=r)break;const a=t[i];if(a==='"'){const E=t.indexOf('"',i+1);if(E===-1){const T=t.slice(i+1).trim();if(T){const b=T.replaceAll('"','""').replace(/\s+/g," ").trim();b&&/[\p{L}\p{N}]/u.test(b)&&n.push({type:"term",value:`"${b}"`})}break}const A=t.slice(i+1,E).replaceAll('"','""').trim().replace(/\s+/g," ");A&&/[\p{L}\p{N}]/u.test(A)&&n.push({type:"term",value:`"${A}"`}),i=E+1;continue}if(a==="("){n.push({type:"lparen",value:"("}),i++;continue}if(a===")"){n.push({type:"rparen",value:")"}),i++;continue}if(a==="-"){const E=t[i+1];if(E&&/[\p{L}\p{N}"]/u.test(E)){n.push({type:"op",value:"NOT"}),i++;continue}i++;continue}const d=t.slice(i),f=d.match(/^NEAR(\/\d+)?\b/i);if(f){n.push({type:"op",value:f[0].toUpperCase()}),i+=f[0].length;continue}const h=d.match(/^(AND|OR|NOT)\b/i);if(h){n.push({type:"op",value:h[1].toUpperCase()}),i+=h[1].length;continue}const c=d.match(/^[\p{L}\p{N}]+/u);if(c){const E=c[0],S=E.replaceAll('"','""');if(n.push({type:"term",value:`"${S}"`}),i+=E.length,i<r&&t[i]==="*"){const A=n[n.length-1];A.value=`"${S}"*`,i++}continue}i++}if(n.length===0)return{query:void 0,noMatches:!0};const s=[];for(const a of n){const d=s[s.length-1];if(d){const f=d.type==="term"||d.type==="rparen",h=a.type==="term"||a.type==="lparen",c=a.type==="op"&&a.value==="NOT";f&&(h||c)&&s.push({type:"op",value:"AND"})}s.push(a)}for(;s.length&&s[0].type==="op"&&["AND","OR"].includes(s[0].value);)s.shift();for(;s.length&&s[0].type==="op"&&s[0].value.startsWith("NEAR");)s.shift();for(;s.length&&s[s.length-1].type==="op";)s.pop();const p=s.filter((a,d,f)=>!(a.type==="lparen"&&f[d+1]?.type==="rparen"||a.type==="rparen"&&f[d-1]?.type==="lparen"));if(!p.some(a=>a.type==="term"))return{query:void 0,noMatches:!0};const o=p.map(a=>a.value).join(" ");return o?{query:o,noMatches:!1}:{query:void 0,noMatches:!0}}function G(e){const t=R(e)?e:{};if(t.q!==void 0&&t.q!==null&&typeof t.q!="string")throw u("InvalidArgumentError","q deve ser uma string.","INVALID_ARGUMENT",{field:"q"});const n=t.q?.trim()??"",i=Q(n),r=y(t.year,"year"),s=q(t.discipline,"discipline"),p=q(t.language,"language"),l=y(t.page,"page",{min:1})??1,o=y(t.pageSize,"pageSize",{min:1,max:100})??20;if(t.hasImages!==void 0&&t.hasImages!==null&&typeof t.hasImages!="boolean")throw u("InvalidArgumentError","hasImages deve ser booleano.","INVALID_ARGUMENT",{field:"hasImages"});const a=t.excludeIds??[];if(!Array.isArray(a))throw u("InvalidArgumentError","excludeIds deve ser um array.","INVALID_ARGUMENT",{field:"excludeIds"});if(a.length>1e3)throw u("InvalidArgumentError","excludeIds não pode conter mais de 1000 IDs.","INVALID_ARGUMENT",{field:"excludeIds",maxLength:1e3});const d=[...new Set(a.map(h=>y(h,"excludeIds",{min:1})))];if(d.some(h=>h===void 0))throw u("InvalidArgumentError","excludeIds contém um ID inválido.","INVALID_ARGUMENT",{field:"excludeIds"});const f=(l-1)*o;if(!Number.isSafeInteger(f))throw u("InvalidArgumentError","page é grande demais.","INVALID_ARGUMENT",{field:"page"});return{q:n,ftsQuery:i.query,noMatches:i.noMatches,year:r,discipline:s,language:p,hasImages:t.hasImages,excludeIds:d,limit:o,offset:f,page:l,pageSize:o}}function H(e){const t={},n=[];let i="";if(e.ftsQuery?(i=`
      JOIN (
        SELECT question_id
          FROM search_index
         WHERE search_index MATCH $fts
         GROUP BY question_id
      ) AS matched ON matched.question_id = q.id`,t.$fts=e.ftsQuery):e.noMatches&&n.push("0"),e.year!==void 0&&(n.push("q.year = $year"),t.$year=e.year),e.discipline!==void 0&&(n.push("q.discipline = $discipline"),t.$discipline=e.discipline),e.language!==void 0&&(n.push("q.language = $language"),t.$language=e.language),e.hasImages===!0&&n.push(`(EXISTS (SELECT 1 FROM question_files AS image_filter WHERE image_filter.question_id = q.id)
        OR EXISTS (SELECT 1 FROM alternatives AS alternative_image_filter
                   WHERE alternative_image_filter.question_id = q.id
                     AND alternative_image_filter.file_url IS NOT NULL))`),e.excludeIds.length>0){const s=e.excludeIds.map((p,l)=>{const o=`$exclude_${l}`;return t[o]=p,o});n.push(`q.id NOT IN (${s.join(", ")})`)}const r=n.length>0?`WHERE ${n.join(`
          AND `)}`:"";return{bind:t,join:i,where:r}}function X(e){return{id:Number(g(e.id)),year:Number(g(e.year)),number:Number(g(e.number)),language:e.language??null,title:e.title,discipline:e.discipline??null,hasImages:!!Number(g(e.has_images)),snippet:e.snippet??null}}function k(e){const t=L(),n=G(e),i=H(n),r=m(t,`SELECT count(*) AS total
       FROM questions AS q
       ${i.join}
       ${i.where}`,i.bind),s=Number(g(r[0]?.total)??0),p={...i.bind,$limit:n.limit,$offset:n.offset},l=n.ftsQuery?`(SELECT snippet(search_index, 3, '', '', '…', 18)
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
       ) AS snippet,`,o=m(t,`WITH paged AS MATERIALIZED (
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
           ${l}
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
      FROM paged`,p);return{total:s,page:n.page,pageSize:n.pageSize,results:o.map(X)}}function z(e){if(typeof e=="number"||typeof e=="string")return{id:e};if(!R(e))throw u("InvalidArgumentError","getQuestion exige um ID ou uma chave de questão.","INVALID_ARGUMENT");return e}function V(e){const t=L(),n=z(e),i=y(n.id??n.questionId,"id",{min:1}),r=y(n.year,"year"),s=y(n.number,"number",{min:1}),p=q(n.language,"language");if(i===void 0&&(r===void 0||s===void 0))throw u("InvalidArgumentError","getQuestion exige id/questionId ou o conjunto year + number.","INVALID_ARGUMENT");let l;if(i!==void 0)l=m(t,`SELECT id, year, number, language, title, discipline, context,
              alternatives_introduction, correct_alternative, source_path
         FROM questions
        WHERE id = $id`,{$id:i});else{const c={$year:r,$number:s},E=["year = $year","number = $number"];if(p!==void 0&&(E.push("language = $language"),c.$language=p),l=m(t,`SELECT id, year, number, language, title, discipline, context,
              alternatives_introduction, correct_alternative, source_path
         FROM questions
        WHERE ${E.join(" AND ")}
        LIMIT 2`,c),l.length>1)throw u("AmbiguousQuestionError","Mais de uma questão corresponde a year + number; informe language ou id.","AMBIGUOUS_QUESTION")}const o=l[0];if(!o)throw u("QuestionNotFoundError","Questão não encontrada.","QUESTION_NOT_FOUND");const a=Number(g(o.id)),d=m(t,`SELECT id, letter, text, file_url, is_correct
       FROM alternatives
      WHERE question_id = $questionId
      ORDER BY letter COLLATE NOCASE, id`,{$questionId:a}).map(c=>({id:Number(g(c.id)),letter:c.letter,text:c.text??null,file:c.file_url??null,fileUrl:c.file_url??null,isCorrect:!!Number(g(c.is_correct))})),f=m(t,`SELECT url
       FROM question_files
      WHERE question_id = $questionId
      ORDER BY position, id`,{$questionId:a}).map(c=>c.url);return{id:a,year:Number(g(o.year)),number:Number(g(o.number)),language:o.language??null,title:o.title,discipline:o.discipline??null,context:o.context??null,alternativesIntroduction:o.alternatives_introduction??null,correctAlternative:o.correct_alternative??null,sourcePath:o.source_path,alternatives:d,files:f,urls:f}}async function W(e){const t=e?.id??null;if(!R(e)||typeof e.type!="string"){O(t,u("InvalidMessageError","Mensagem de worker inválida.","INVALID_MESSAGE"));return}try{let n;switch(e.type){case"init":n=await F(e);break;case"getFilters":n=B(e.payload);break;case"searchQuestions":n=k(e.payload);break;case"getQuestion":n=V(e.payload);break;case"close":v(),n={closed:!0};break;default:throw u("UnknownMessageError",`Operação desconhecida: ${e.type}.`,"UNKNOWN_MESSAGE")}x(t,n)}catch(n){O(t,n)}}typeof self<"u"&&self.addEventListener("message",e=>{M=M.then(()=>W(e.data))});
