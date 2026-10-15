let T,h,N,A={inepMetadata:!1,enrichment:!1},$=Promise.resolve();function b(e="q"){let t="";return A.inepMetadata&&(t+=`
LEFT JOIN question_inep_metadata AS im ON im.question_id = ${e}.id`),A.enrichment&&(t+=`
LEFT JOIN question_enrichment AS qe ON qe.question_id = ${e}.id`),t}function I(e="q"){return A.inepMetadata?`COALESCE(
    CASE im.area
      WHEN 'LC' THEN 'linguagens'
      WHEN 'CH' THEN 'ciencias-humanas'
      WHEN 'CN' THEN 'ciencias-natureza'
      WHEN 'MT' THEN 'matematica'
    END,
    ${e}.discipline
  )`:`${e}.discipline`}function M(e="q"){return A.enrichment?`COALESCE(qe.display_title, ${e}.title)`:`${e}.title`}function C(){return A.inepMetadata?`im.item_code AS inep_item_code,
          im.area AS inep_area,
          im.skill_code AS inep_skill_code,
          im.exam_code AS inep_exam_code,
          im.position AS inep_position,
          im.book_color AS inep_book_color,
          im.tri_a AS inep_tri_a,
          im.tri_b AS inep_tri_b,
          im.tri_c AS inep_tri_c,
          im.match_score AS inep_match_score`:`NULL AS inep_item_code,
            NULL AS inep_area,
            NULL AS inep_skill_code,
            NULL AS inep_exam_code,
            NULL AS inep_position,
            NULL AS inep_book_color,
            NULL AS inep_tri_a,
            NULL AS inep_tri_b,
            NULL AS inep_tri_c,
            NULL AS inep_match_score`}function x(){return A.enrichment?`qe.subject AS enrichment_subject,
          qe.topic AS enrichment_topic,
          qe.source AS enrichment_source`:`NULL AS enrichment_subject,
            NULL AS enrichment_topic,
            NULL AS enrichment_source`}function O(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function c(e,t,n,i){const a=new Error(t);return a.name=e,n&&(a.code=n),i!==void 0&&(a.details=i),a}function F(e){const t=e instanceof Error?e:new Error(String(e)),n={name:typeof t.name=="string"?t.name:"Error",message:typeof t.message=="string"?t.message:String(t)};if((typeof t.code=="string"||typeof t.code=="number")&&(n.code=t.code),typeof t.resultCode=="number"&&(n.resultCode=t.resultCode),t.details!==void 0)try{JSON.stringify(t.details),n.details=t.details}catch{n.details=String(t.details)}return typeof t.stack=="string"&&(n.stack=t.stack),n}function H(e,t){self.postMessage({id:e??null,type:"response",ok:!0,result:t})}function U(e,t){self.postMessage({id:e??null,type:"response",ok:!1,error:F(t)})}async function B(){return T||(T=import("./index-DlV0y7TX.js").then(async e=>{const t=e.default??e.sqlite3InitModule;if(typeof t!="function")throw c("SQLiteLoadError","O módulo @sqlite.org/sqlite-wasm não exportou sqlite3InitModule.","SQLITE_MODULE_INVALID");return t()})),T}function v(){if(!N)throw c("DatabaseNotInitializedError","O banco SQLite ainda não foi inicializado.","DB_NOT_INITIALIZED");return N}function E(e,t,n){const i=[],a={sql:t,rowMode:"object",resultRows:i};return n!==void 0&&(a.bind=n),e.exec(a),i}function l(e){return typeof e=="bigint"?Number(e):e}function k(e){return e instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&e instanceof SharedArrayBuffer}function Q(e){return k(e)?new Uint8Array(e):ArrayBuffer.isView(e)?new Uint8Array(e.buffer,e.byteOffset,e.byteLength):null}function G(e){const t=e?.payload,n=[t,t?.buffer,t?.arrayBuffer,e?.buffer,e?.arrayBuffer];for(const i of n){const a=Q(i);if(a)return a}return null}function w(){const e=N;N=void 0,A={inepMetadata:!1,enrichment:!1},e&&e.close()}async function W(e){const t=G(e);if(!t||t.byteLength===0)throw c("InvalidArgumentError","init exige um ArrayBuffer não vazio contendo um banco SQLite.","INVALID_DATABASE_BUFFER");h=await B(),w();const n=new h.oo1.DB;let i,a=!1;try{i=h.wasm.allocFromTypedArray(t);const s=h.capi.sqlite3_deserialize(n.pointer,"main",i,t.byteLength,t.byteLength,0);n.checkRc(s),a=!0,n.onclose={after:()=>{i&&(h.wasm.dealloc(i),i=void 0)}};const m=E(n,`SELECT name
         FROM sqlite_schema
        WHERE type = 'table'
          AND name IN ('exams', 'questions', 'alternatives', 'question_files', 'search_index')`).map(u=>u.name),d=["exams","questions","alternatives","question_files","search_index"].filter(u=>!m.includes(u));if(d.length>0)throw c("DatabaseSchemaError",`O banco não contém as tabelas obrigatórias: ${d.join(", ")}.`,"DB_SCHEMA_INVALID",{missingTables:d});const r=E(n,`SELECT name
         FROM sqlite_schema
        WHERE type = 'table'
          AND name IN ('question_inep_metadata', 'question_enrichment')`).map(u=>u.name);A={inepMetadata:r.includes("question_inep_metadata"),enrichment:r.includes("question_enrichment")};const o=E(n,"SELECT (SELECT count(*) FROM questions) AS question_count, (SELECT count(*) FROM exams) AS exam_count")[0];return N=n,{ready:!0,version:h.version?.libVersion??null,questionCount:Number(l(o?.question_count)??0),examCount:Number(l(o?.exam_count)??0),features:{...A}}}catch(s){throw a||i&&h.wasm.dealloc(i),n.close(),s}}function X(){const e=v(),t=E(e,`SELECT year AS value, CAST(year AS TEXT) AS label
       FROM exams
      ORDER BY year DESC`).map(a=>({value:Number(l(a.value)),label:a.label})),n=E(e,`SELECT value, MIN(label) AS label
       FROM exam_disciplines
      GROUP BY value
      ORDER BY label COLLATE NOCASE, value`),i=E(e,`SELECT value, MIN(label) AS label
       FROM exam_languages
      GROUP BY value
      ORDER BY label COLLATE NOCASE, value`);return{years:t,disciplines:n,languages:i}}function S(e,t,{min:n=Number.MIN_SAFE_INTEGER,max:i=Number.MAX_SAFE_INTEGER}={}){if(e==null||e==="")return;const a=typeof e=="number"?e:Number(e);if(!Number.isSafeInteger(a)||a<n||a>i)throw c("InvalidArgumentError",`${t} deve ser um inteiro válido.`,"INVALID_ARGUMENT",{field:t});return a}function R(e,t){if(e==null||e==="")return;if(typeof e!="string")throw c("InvalidArgumentError",`${t} deve ser uma string.`,"INVALID_ARGUMENT",{field:t});return e.trim()||void 0}function z(e){if(!e)return{query:void 0,noMatches:!1};if(e.length>2048)throw c("InvalidArgumentError","q não pode exceder 2048 caracteres.","INVALID_ARGUMENT",{field:"q",maxLength:2048});const t=e.normalize("NFKC").trim();if(!t)return{query:void 0,noMatches:!1};const n=[];let i=0;const a=t.length;for(;i<a;){for(;i<a&&/\s/.test(t[i]);)i++;if(i>=a)break;const o=t[i];if(o==='"'){const _=t.indexOf('"',i+1);if(_===-1){const D=t.slice(i+1).trim();if(D){const L=D.replaceAll('"','""').replace(/\s+/g," ").trim();L&&/[\p{L}\p{N}]/u.test(L)&&n.push({type:"term",value:`"${L}"`})}break}const q=t.slice(i+1,_).replaceAll('"','""').trim().replace(/\s+/g," ");q&&/[\p{L}\p{N}]/u.test(q)&&n.push({type:"term",value:`"${q}"`}),i=_+1;continue}if(o==="("){n.push({type:"lparen",value:"("}),i++;continue}if(o===")"){n.push({type:"rparen",value:")"}),i++;continue}if(o==="-"){const _=t[i+1];if(_&&/[\p{L}\p{N}"]/u.test(_)){n.push({type:"op",value:"NOT"}),i++;continue}i++;continue}const u=t.slice(i),f=u.match(/^NEAR(\/\d+)?\b/i);if(f){n.push({type:"op",value:f[0].toUpperCase()}),i+=f[0].length;continue}const g=u.match(/^(AND|OR|NOT)\b/i);if(g){n.push({type:"op",value:g[1].toUpperCase()}),i+=g[1].length;continue}const p=u.match(/^[\p{L}\p{N}]+/u);if(p){const _=p[0],y=_.replaceAll('"','""');if(n.push({type:"term",value:`"${y}"`}),i+=_.length,i<a&&t[i]==="*"){const q=n[n.length-1];q.value=`"${y}"*`,i++}continue}i++}if(n.length===0)return{query:void 0,noMatches:!0};const s=[];for(const o of n){const u=s[s.length-1];if(u){const f=u.type==="term"||u.type==="rparen",g=o.type==="term"||o.type==="lparen",p=o.type==="op"&&o.value==="NOT";f&&(g||p)&&s.push({type:"op",value:"AND"})}s.push(o)}for(;s.length&&s[0].type==="op"&&["AND","OR"].includes(s[0].value);)s.shift();for(;s.length&&s[0].type==="op"&&s[0].value.startsWith("NEAR");)s.shift();for(;s.length&&s[s.length-1].type==="op";)s.pop();const m=s.filter((o,u,f)=>!(o.type==="lparen"&&f[u+1]?.type==="rparen"||o.type==="rparen"&&f[u-1]?.type==="lparen"));if(!m.some(o=>o.type==="term"))return{query:void 0,noMatches:!0};const r=m.map(o=>o.value).join(" ");return r?{query:r,noMatches:!1}:{query:void 0,noMatches:!0}}function j(e){const t=O(e)?e:{};if(t.q!==void 0&&t.q!==null&&typeof t.q!="string")throw c("InvalidArgumentError","q deve ser uma string.","INVALID_ARGUMENT",{field:"q"});const n=t.q?.trim()??"",i=z(n),a=S(t.year,"year"),s=R(t.discipline,"discipline"),m=R(t.language,"language"),d=S(t.page,"page",{min:1})??1,r=S(t.pageSize,"pageSize",{min:1,max:100})??20;if(t.hasImages!==void 0&&t.hasImages!==null&&typeof t.hasImages!="boolean")throw c("InvalidArgumentError","hasImages deve ser booleano.","INVALID_ARGUMENT",{field:"hasImages"});const o=t.excludeIds??[];if(!Array.isArray(o))throw c("InvalidArgumentError","excludeIds deve ser um array.","INVALID_ARGUMENT",{field:"excludeIds"});if(o.length>1e3)throw c("InvalidArgumentError","excludeIds não pode conter mais de 1000 IDs.","INVALID_ARGUMENT",{field:"excludeIds",maxLength:1e3});const u=[...new Set(o.map(g=>S(g,"excludeIds",{min:1})))];if(u.some(g=>g===void 0))throw c("InvalidArgumentError","excludeIds contém um ID inválido.","INVALID_ARGUMENT",{field:"excludeIds"});const f=(d-1)*r;if(!Number.isSafeInteger(f))throw c("InvalidArgumentError","page é grande demais.","INVALID_ARGUMENT",{field:"page"});return{q:n,ftsQuery:i.query,noMatches:i.noMatches,year:a,discipline:s,language:m,hasImages:t.hasImages,excludeIds:u,limit:r,offset:f,page:d,pageSize:r}}function V(e){const t={},n=[];let i="";if(e.ftsQuery?(i=`
      JOIN (
        SELECT question_id
          FROM search_index
         WHERE search_index MATCH $fts
         GROUP BY question_id
      ) AS matched ON matched.question_id = q.id`,t.$fts=e.ftsQuery):e.noMatches&&n.push("0"),e.year!==void 0&&(n.push("q.year = $year"),t.$year=e.year),e.discipline!==void 0&&(n.push(`${I("q")} = $discipline`),t.$discipline=e.discipline),e.language!==void 0&&(n.push("q.language = $language"),t.$language=e.language),e.hasImages===!0&&n.push(`(EXISTS (SELECT 1 FROM question_files AS image_filter WHERE image_filter.question_id = q.id)
        OR EXISTS (SELECT 1 FROM alternatives AS alternative_image_filter
                   WHERE alternative_image_filter.question_id = q.id
                     AND alternative_image_filter.file_url IS NOT NULL))`),e.excludeIds.length>0){const s=e.excludeIds.map((m,d)=>{const r=`$exclude_${d}`;return t[r]=m,r});n.push(`q.id NOT IN (${s.join(", ")})`)}const a=n.length>0?`WHERE ${n.join(`
          AND `)}`:"";return{bind:t,join:i,where:a}}function Y(e){return{id:Number(l(e.id)),year:Number(l(e.year)),number:Number(l(e.number)),language:e.language??null,title:e.title,sourceTitle:e.source_title??e.title,discipline:e.discipline??null,hasImages:!!Number(l(e.has_images)),snippet:e.snippet??null}}function P(e){const t=v(),n=j(e),i=V(n),a=E(t,`SELECT count(*) AS total
       FROM questions AS q
       ${b("q")}
       ${i.join}
       ${i.where}`,i.bind),s=Number(l(a[0]?.total)??0),m={...i.bind,$limit:n.limit,$offset:n.offset},d=n.ftsQuery?`(SELECT snippet(search_index, 3, '', '', '…', 18)
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
       ) AS snippet,`,r=E(t,`WITH paged AS MATERIALIZED (
       SELECT q.id,
              q.year,
              q.number,
              q.language,
              ${M("q")} AS title,
              q.title AS source_title,
              ${I("q")} AS discipline,
              q.context,
              q.alternatives_introduction
         FROM questions AS q
         ${b("q")}
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
           paged.source_title,
           paged.discipline,
           ${d}
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
      FROM paged`,m);return{total:s,page:n.page,pageSize:n.pageSize,results:r.map(Y)}}function J(e){if(typeof e=="number"||typeof e=="string")return{id:e};if(!O(e))throw c("InvalidArgumentError","getQuestion exige um ID ou uma chave de questão.","INVALID_ARGUMENT");return e}function Z(e){const t=v(),n=J(e),i=S(n.id??n.questionId,"id",{min:1}),a=S(n.year,"year"),s=S(n.number,"number",{min:1}),m=R(n.language,"language");if(i===void 0&&(a===void 0||s===void 0))throw c("InvalidArgumentError","getQuestion exige id/questionId ou o conjunto year + number.","INVALID_ARGUMENT");let d;if(i!==void 0)d=E(t,`SELECT q.id, q.year, q.number, q.language,
              ${M("q")} AS title,
              q.title AS source_title,
              ${I("q")} AS discipline,
              q.context, q.alternatives_introduction, q.correct_alternative, q.source_path,
              ${C()},
              ${x()}
         FROM questions AS q
         ${b("q")}
        WHERE q.id = $id`,{$id:i});else{const p={$year:a,$number:s},_=["q.year = $year","q.number = $number"];if(m!==void 0&&(_.push("q.language = $language"),p.$language=m),d=E(t,`SELECT q.id, q.year, q.number, q.language,
              ${M("q")} AS title,
              q.title AS source_title,
              ${I("q")} AS discipline,
              q.context, q.alternatives_introduction, q.correct_alternative, q.source_path,
              ${C()},
              ${x()}
         FROM questions AS q
         ${b("q")}
        WHERE ${_.join(" AND ")}
        LIMIT 2`,p),d.length>1)throw c("AmbiguousQuestionError","Mais de uma questão corresponde a year + number; informe language ou id.","AMBIGUOUS_QUESTION")}const r=d[0];if(!r)throw c("QuestionNotFoundError","Questão não encontrada.","QUESTION_NOT_FOUND");const o=Number(l(r.id)),u=E(t,`SELECT id, letter, text, file_url, is_correct
       FROM alternatives
      WHERE question_id = $questionId
      ORDER BY letter COLLATE NOCASE, id`,{$questionId:o}).map(p=>({id:Number(l(p.id)),letter:p.letter,text:p.text??null,file:p.file_url??null,fileUrl:p.file_url??null,isCorrect:!!Number(l(p.is_correct))})),f=E(t,`SELECT url
       FROM question_files
      WHERE question_id = $questionId
      ORDER BY position, id`,{$questionId:o}).map(p=>p.url);return{id:o,year:Number(l(r.year)),number:Number(l(r.number)),language:r.language??null,title:r.title,sourceTitle:r.source_title??r.title,discipline:r.discipline??null,context:r.context??null,alternativesIntroduction:r.alternatives_introduction??null,correctAlternative:r.correct_alternative??null,sourcePath:r.source_path,alternatives:u,files:f,urls:f,inep:r.inep_item_code==null?null:{itemCode:Number(l(r.inep_item_code)),area:r.inep_area,skillCode:r.inep_skill_code==null?null:Number(l(r.inep_skill_code)),examCode:Number(l(r.inep_exam_code)),position:Number(l(r.inep_position)),bookColor:r.inep_book_color??null,tri:{a:r.inep_tri_a==null?null:Number(l(r.inep_tri_a)),b:r.inep_tri_b==null?null:Number(l(r.inep_tri_b)),c:r.inep_tri_c==null?null:Number(l(r.inep_tri_c))},matchScore:r.inep_match_score==null?null:Number(l(r.inep_match_score))},enrichment:r.enrichment_source==null?null:{subject:r.enrichment_subject??null,topic:r.enrichment_topic??null,source:r.enrichment_source}}}async function K(e){const t=e?.id??null;if(!O(e)||typeof e.type!="string"){U(t,c("InvalidMessageError","Mensagem de worker inválida.","INVALID_MESSAGE"));return}try{let n;switch(e.type){case"init":n=await W(e);break;case"getFilters":n=X(e.payload);break;case"searchQuestions":n=P(e.payload);break;case"getQuestion":n=Z(e.payload);break;case"close":w(),n={closed:!0};break;default:throw c("UnknownMessageError",`Operação desconhecida: ${e.type}.`,"UNKNOWN_MESSAGE")}H(t,n)}catch(n){U(t,n)}}typeof self<"u"&&self.addEventListener("message",e=>{$=$.then(()=>K(e.data))});
