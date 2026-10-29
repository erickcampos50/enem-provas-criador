const y=Object.freeze([Object.freeze({key:"muito-facil",label:"Muito fácil",min:null,max:.5,color:"#1e7a35"}),Object.freeze({key:"facil",label:"Fácil",min:.5,max:1.2,color:"#4c7a1a"}),Object.freeze({key:"medio",label:"Médio",min:1.2,max:1.9,color:"#9a5b00"}),Object.freeze({key:"dificil",label:"Difícil",min:1.9,max:2.5,color:"#c2410c"}),Object.freeze({key:"muito-dificil",label:"Muito difícil",min:2.5,max:null,color:"#b3261e"})]),H=Object.freeze({key:"sem",label:"Sem classificação",color:"#6b7280"});function D(e){if(typeof e=="number")return Number.isFinite(e)?e:null;if(typeof e=="string"&&e.trim()!==""){const t=Number(e);return Number.isFinite(t)?t:null}return null}function z({a:e,b:t}={}){const i=D(e),n=D(t);return!(n===null||n>5||i===null||i<.5)}function Q({a:e,b:t}={}){if(!z({a:e,b:t}))return null;const i=D(t);return{...y.find(s=>(s.min===null||i>=s.min)&&(s.max===null||i<s.max))??y[y.length-1],b:i}}function G(e){return e===H.key||y.some(t=>t.key===e)}const R=2048,O=1e3,W=100;let $,h,I,E={inepMetadata:!1,enrichment:!1,resolutions:!1},F=Promise.resolve();function L(e="q"){let t="";return E.inepMetadata&&(t+=`
LEFT JOIN question_inep_metadata AS im ON im.question_id = ${e}.id`),E.enrichment&&(t+=`
LEFT JOIN question_enrichment AS qe ON qe.question_id = ${e}.id`),t}function M(e="q"){return E.inepMetadata?`COALESCE(
    CASE im.area
      WHEN 'LC' THEN 'linguagens'
      WHEN 'CH' THEN 'ciencias-humanas'
      WHEN 'CN' THEN 'ciencias-natureza'
      WHEN 'MT' THEN 'matematica'
    END,
    ${e}.discipline
  )`:`${e}.discipline`}function x(e="q"){return E.enrichment?`COALESCE(qe.display_title, ${e}.title)`:`${e}.title`}function w(){return E.inepMetadata?`im.item_code AS inep_item_code,
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
            NULL AS inep_match_score`}function V(e="im"){return E.inepMetadata?`${e}.tri_a AS inep_tri_a,
              ${e}.tri_b AS inep_tri_b`:`NULL AS inep_tri_a,
              NULL AS inep_tri_b`}function k(){return E.enrichment?`qe.subject AS enrichment_subject,
          qe.topic AS enrichment_topic,
          qe.source AS enrichment_source`:`NULL AS enrichment_subject,
            NULL AS enrichment_topic,
            NULL AS enrichment_source`}function C(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function f(e,t,i,n){const s=new Error(t);return s.name=e,i&&(s.code=i),n!==void 0&&(s.details=n),s}function X(e){const t=e instanceof Error?e:new Error(String(e)),i={name:typeof t.name=="string"?t.name:"Error",message:typeof t.message=="string"?t.message:String(t)};if((typeof t.code=="string"||typeof t.code=="number")&&(i.code=t.code),typeof t.resultCode=="number"&&(i.resultCode=t.resultCode),t.details!==void 0)try{JSON.stringify(t.details),i.details=t.details}catch{i.details=String(t.details)}return typeof t.stack=="string"&&(i.stack=t.stack),i}function Y(e,t){self.postMessage({id:e??null,type:"response",ok:!0,result:t})}function B(e,t){self.postMessage({id:e??null,type:"response",ok:!1,error:X(t)})}async function P(){return $||($=import("./index-DlV0y7TX.js").then(async e=>{const t=e.default??e.sqlite3InitModule;if(typeof t!="function")throw f("SQLiteLoadError","O módulo @sqlite.org/sqlite-wasm não exportou sqlite3InitModule.","SQLITE_MODULE_INVALID");return t()})),$}function v(){if(!I)throw f("DatabaseNotInitializedError","O banco SQLite ainda não foi inicializado.","DB_NOT_INITIALIZED");return I}function _(e,t,i){const n=[],s={sql:t,rowMode:"object",resultRows:n};return i!==void 0&&(s.bind=i),e.exec(s),n}function l(e){return typeof e=="bigint"?Number(e):e}function J(e){return e instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&e instanceof SharedArrayBuffer}function K(e){return J(e)?new Uint8Array(e):ArrayBuffer.isView(e)?new Uint8Array(e.buffer,e.byteOffset,e.byteLength):null}function Z(e){const t=e?.payload,i=[t,t?.buffer,t?.arrayBuffer,e?.buffer,e?.arrayBuffer];for(const n of i){const s=K(n);if(s)return s}return null}function j(){const e=I;I=void 0,E={inepMetadata:!1,enrichment:!1,resolutions:!1},e&&e.close()}async function ee(e){const t=Z(e);if(!t||t.byteLength===0)throw f("InvalidArgumentError","init exige um ArrayBuffer não vazio contendo um banco SQLite.","INVALID_DATABASE_BUFFER");h=await P(),j();const i=new h.oo1.DB;let n,s=!1;try{n=h.wasm.allocFromTypedArray(t);const a=h.capi.sqlite3_deserialize(i.pointer,"main",n,t.byteLength,t.byteLength,0);i.checkRc(a),s=!0,i.onclose={after:()=>{n&&(h.wasm.dealloc(n),n=void 0)}};const p=_(i,`SELECT name
         FROM sqlite_schema
        WHERE type = 'table'
          AND name IN ('exams', 'questions', 'alternatives', 'question_files', 'search_index')`).map(c=>c.name),u=["exams","questions","alternatives","question_files","search_index"].filter(c=>!p.includes(c));if(u.length>0)throw f("DatabaseSchemaError",`O banco não contém as tabelas obrigatórias: ${u.join(", ")}.`,"DB_SCHEMA_INVALID",{missingTables:u});const r=_(i,`SELECT name
         FROM sqlite_schema
        WHERE type = 'table'
          AND name IN ('question_inep_metadata', 'question_enrichment', 'question_resolutions')`).map(c=>c.name);E={inepMetadata:r.includes("question_inep_metadata"),enrichment:r.includes("question_enrichment"),resolutions:r.includes("question_resolutions")};const o=_(i,"SELECT (SELECT count(*) FROM questions) AS question_count, (SELECT count(*) FROM exams) AS exam_count")[0];return I=i,{ready:!0,version:h.version?.libVersion??null,questionCount:Number(l(o?.question_count)??0),examCount:Number(l(o?.exam_count)??0),features:{...E}}}catch(a){throw s||n&&h.wasm.dealloc(n),i.close(),a}}function te(){const e=v(),t=_(e,`SELECT year AS value, CAST(year AS TEXT) AS label
       FROM exams
      ORDER BY year DESC`).map(s=>({value:Number(l(s.value)),label:s.label})),i=_(e,`SELECT value, MIN(label) AS label
       FROM exam_disciplines
      GROUP BY value
      ORDER BY label COLLATE NOCASE, value`),n=_(e,`SELECT value, MIN(label) AS label
       FROM exam_languages
      GROUP BY value
      ORDER BY label COLLATE NOCASE, value`);return{years:t,disciplines:i,languages:n}}function b(e,t,{min:i=Number.MIN_SAFE_INTEGER,max:n=Number.MAX_SAFE_INTEGER}={}){if(e==null||e==="")return;const s=typeof e=="number"?e:Number(e);if(!Number.isSafeInteger(s)||s<i||s>n)throw f("InvalidArgumentError",`${t} deve ser um inteiro válido.`,"INVALID_ARGUMENT",{field:t});return s}function q(e,t){if(e==null||e==="")return;if(typeof e!="string")throw f("InvalidArgumentError",`${t} deve ser uma string.`,"INVALID_ARGUMENT",{field:t});return e.trim()||void 0}function ie(e){if(!e)return{query:void 0,noMatches:!1};if(e.length>R)throw f("InvalidArgumentError",`q não pode exceder ${R} caracteres.`,"INVALID_ARGUMENT",{field:"q",maxLength:R});const t=e.normalize("NFKC").trim();if(!t)return{query:void 0,noMatches:!1};const i=[];let n=0;const s=t.length;for(;n<s;){for(;n<s&&/\s/.test(t[n]);)n++;if(n>=s)break;const o=t[n];if(o==='"'){const d=t.indexOf('"',n+1);if(d===-1){const U=t.slice(n+1).trim();if(U){const T=U.replaceAll('"','""').replace(/\s+/g," ").trim();T&&/[\p{L}\p{N}]/u.test(T)&&i.push({type:"term",value:`"${T}"`})}break}const N=t.slice(n+1,d).replaceAll('"','""').trim().replace(/\s+/g," ");N&&/[\p{L}\p{N}]/u.test(N)&&i.push({type:"term",value:`"${N}"`}),n=d+1;continue}if(o==="("){i.push({type:"lparen",value:"("}),n++;continue}if(o===")"){i.push({type:"rparen",value:")"}),n++;continue}if(o==="-"){const d=t[n+1];if(d&&/[\p{L}\p{N}"]/u.test(d)){i.push({type:"op",value:"NOT"}),n++;continue}n++;continue}const c=t.slice(n),m=c.match(/^NEAR(\/\d+)?\b/i);if(m){i.push({type:"op",value:m[0].toUpperCase()}),n+=m[0].length;continue}const A=c.match(/^(AND|OR|NOT)\b/i);if(A){i.push({type:"op",value:A[1].toUpperCase()}),n+=A[1].length;continue}const g=c.match(/^[\p{L}\p{N}]+/u);if(g){const d=g[0],S=d.replaceAll('"','""');if(i.push({type:"term",value:`"${S}"`}),n+=d.length,n<s&&t[n]==="*"){const N=i[i.length-1];N.value=`"${S}"*`,n++}continue}n++}if(i.length===0)return{query:void 0,noMatches:!0};const a=[];for(const o of i){const c=a[a.length-1];if(c){const m=c.type==="term"||c.type==="rparen",A=o.type==="term"||o.type==="lparen",g=o.type==="op"&&o.value==="NOT";m&&(A||g)&&a.push({type:"op",value:"AND"})}a.push(o)}for(;a.length&&a[0].type==="op"&&["AND","OR"].includes(a[0].value);)a.shift();for(;a.length&&a[0].type==="op"&&a[0].value.startsWith("NEAR");)a.shift();for(;a.length&&a[a.length-1].type==="op";)a.pop();const p=a.filter((o,c,m)=>!(o.type==="lparen"&&m[c+1]?.type==="rparen"||o.type==="rparen"&&m[c-1]?.type==="lparen"));if(!p.some(o=>o.type==="term"))return{query:void 0,noMatches:!0};const r=p.map(o=>o.value).join(" ");return r?{query:r,noMatches:!1}:{query:void 0,noMatches:!0}}function ne(e){const t=C(e)?e:{};if(t.q!==void 0&&t.q!==null&&typeof t.q!="string")throw f("InvalidArgumentError","q deve ser uma string.","INVALID_ARGUMENT",{field:"q"});const i=t.q?.trim()??"",n=ie(i),s=b(t.year,"year"),a=q(t.discipline,"discipline"),p=q(t.language,"language"),u=q(t.difficulty,"difficulty");if(u!==void 0&&!G(u))throw f("InvalidArgumentError","difficulty deve ser uma faixa de dificuldade conhecida.","INVALID_ARGUMENT",{field:"difficulty"});const r=b(t.page,"page",{min:1})??1,o=b(t.pageSize,"pageSize",{min:1,max:W})??20;if(t.hasImages!==void 0&&t.hasImages!==null&&typeof t.hasImages!="boolean")throw f("InvalidArgumentError","hasImages deve ser booleano.","INVALID_ARGUMENT",{field:"hasImages"});const c=t.excludeIds??[];if(!Array.isArray(c))throw f("InvalidArgumentError","excludeIds deve ser um array.","INVALID_ARGUMENT",{field:"excludeIds"});if(c.length>O)throw f("InvalidArgumentError",`excludeIds não pode conter mais de ${O} IDs.`,"INVALID_ARGUMENT",{field:"excludeIds",maxLength:O});const m=[...new Set(c.map(g=>b(g,"excludeIds",{min:1})))];if(m.some(g=>g===void 0))throw f("InvalidArgumentError","excludeIds contém um ID inválido.","INVALID_ARGUMENT",{field:"excludeIds"});const A=(r-1)*o;if(!Number.isSafeInteger(A))throw f("InvalidArgumentError","page é grande demais.","INVALID_ARGUMENT",{field:"page"});return{q:i,ftsQuery:n.query,noMatches:n.noMatches,year:s,discipline:a,language:p,difficulty:u,hasImages:t.hasImages,excludeIds:m,limit:o,offset:A,page:r,pageSize:o}}function re(e){const t={},i=[];let n="";if(e.ftsQuery?(n=`
      JOIN (
        SELECT question_id
          FROM search_index
         WHERE search_index MATCH $fts
         GROUP BY question_id
      ) AS matched ON matched.question_id = q.id`,t.$fts=e.ftsQuery):e.noMatches&&i.push("0"),e.year!==void 0&&(i.push("q.year = $year"),t.$year=e.year),e.discipline!==void 0&&(i.push(`${M("q")} = $discipline`),t.$discipline=e.discipline),e.language!==void 0&&(i.push("q.language = $language"),t.$language=e.language),e.difficulty!==void 0)if(!E.inepMetadata)i.push("0");else{const a=`(im.tri_b IS NOT NULL
            AND im.tri_b <= 5
            AND im.tri_a IS NOT NULL
            AND im.tri_a >= ${.5})`;if(e.difficulty===H.key)i.push(`NOT ${a}`);else{const p=y.find(u=>u.key===e.difficulty);if(!p)i.push("0");else{const u=[a];p.min!==null&&(u.push("im.tri_b >= $difficultyMin"),t.$difficultyMin=p.min),p.max!==null&&(u.push("im.tri_b < $difficultyMax"),t.$difficultyMax=p.max),i.push(`(${u.join(`
            AND `)})`)}}}if(e.hasImages===!0&&i.push(`(EXISTS (SELECT 1 FROM question_files AS image_filter WHERE image_filter.question_id = q.id)
        OR EXISTS (SELECT 1 FROM alternatives AS alternative_image_filter
                   WHERE alternative_image_filter.question_id = q.id
                     AND alternative_image_filter.file_url IS NOT NULL))`),e.excludeIds.length>0){const a=e.excludeIds.map((p,u)=>{const r=`$exclude_${u}`;return t[r]=p,r});i.push(`q.id NOT IN (${a.join(", ")})`)}const s=i.length>0?`WHERE ${i.join(`
          AND `)}`:"";return{bind:t,join:n,where:s}}function se(e){return{id:Number(l(e.id)),year:Number(l(e.year)),number:Number(l(e.number)),language:e.language??null,title:e.title,sourceTitle:e.source_title??e.title,discipline:e.discipline??null,hasImages:!!Number(l(e.has_images)),difficulty:Q({a:e.inep_tri_a==null?null:Number(l(e.inep_tri_a)),b:e.inep_tri_b==null?null:Number(l(e.inep_tri_b))}),snippet:e.snippet??null}}function ae(e){const t=v(),i=ne(e),n=re(i),s=_(t,`SELECT count(*) AS total
       FROM questions AS q
       ${L("q")}
       ${n.join}
       ${n.where}`,n.bind),a=Number(l(s[0]?.total)??0),p={...n.bind,$limit:i.limit,$offset:i.offset},u=i.ftsQuery?`(SELECT snippet(search_index, 3, '', '', '…', 18)
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
       ) AS snippet,`,r=_(t,`WITH paged AS MATERIALIZED (
       SELECT q.id,
              q.year,
              q.number,
              q.language,
              ${x("q")} AS title,
              q.title AS source_title,
              ${M("q")} AS discipline,
              q.context,
              q.alternatives_introduction,
              ${V("im")}
         FROM questions AS q
         ${L("q")}
         ${n.join}
         ${n.where}
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
           paged.inep_tri_a,
           paged.inep_tri_b,
           ${u}
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
      FROM paged`,p);return{total:a,page:i.page,pageSize:i.pageSize,results:r.map(se)}}function oe(e){if(typeof e=="number"||typeof e=="string")return{id:e};if(!C(e))throw f("InvalidArgumentError","getQuestion exige um ID ou uma chave de questão.","INVALID_ARGUMENT");return e}function ue(e){const t=v(),i=oe(e),n=b(i.id??i.questionId,"id",{min:1}),s=b(i.year,"year"),a=b(i.number,"number",{min:1}),p=q(i.language,"language");if(n===void 0&&(s===void 0||a===void 0))throw f("InvalidArgumentError","getQuestion exige id/questionId ou o conjunto year + number.","INVALID_ARGUMENT");let u;if(n!==void 0)u=_(t,`SELECT q.id, q.year, q.number, q.language,
              ${x("q")} AS title,
              q.title AS source_title,
              ${M("q")} AS discipline,
              q.context, q.alternatives_introduction, q.correct_alternative, q.source_path,
              ${w()},
              ${k()}
         FROM questions AS q
         ${L("q")}
        WHERE q.id = $id`,{$id:n});else{const d={$year:s,$number:a},S=["q.year = $year","q.number = $number"];if(p!==void 0&&(S.push("q.language = $language"),d.$language=p),u=_(t,`SELECT q.id, q.year, q.number, q.language,
              ${x("q")} AS title,
              q.title AS source_title,
              ${M("q")} AS discipline,
              q.context, q.alternatives_introduction, q.correct_alternative, q.source_path,
              ${w()},
              ${k()}
         FROM questions AS q
         ${L("q")}
        WHERE ${S.join(" AND ")}
        LIMIT 2`,d),u.length>1)throw f("AmbiguousQuestionError","Mais de uma questão corresponde a year + number; informe language ou id.","AMBIGUOUS_QUESTION")}const r=u[0];if(!r)throw f("QuestionNotFoundError","Questão não encontrada.","QUESTION_NOT_FOUND");const o=Number(l(r.id)),c=E.resolutions?_(t,`SELECT body, source, source_url AS sourceUrl, source_number AS sourceNumber,
            source_book_color AS sourceBookColor, source_answer AS sourceAnswer
       FROM question_resolutions WHERE question_id = $questionId`,{$questionId:o})[0]??null:null,m=_(t,`SELECT id, letter, text, file_url, is_correct
       FROM alternatives
      WHERE question_id = $questionId
      ORDER BY letter COLLATE NOCASE, id`,{$questionId:o}).map(d=>({id:Number(l(d.id)),letter:d.letter,text:d.text??null,file:d.file_url??null,fileUrl:d.file_url??null,isCorrect:!!Number(l(d.is_correct))})),A=_(t,`SELECT url
       FROM question_files
      WHERE question_id = $questionId
      ORDER BY position, id`,{$questionId:o}).map(d=>d.url);return{id:o,year:Number(l(r.year)),number:Number(l(r.number)),language:r.language??null,title:r.title,sourceTitle:r.source_title??r.title,discipline:r.discipline??null,context:r.context??null,alternativesIntroduction:r.alternatives_introduction??null,correctAlternative:r.correct_alternative??null,sourcePath:r.source_path,resolution:c,alternatives:m,files:A,urls:A,inep:r.inep_item_code==null?null:{itemCode:Number(l(r.inep_item_code)),area:r.inep_area,skillCode:r.inep_skill_code==null?null:Number(l(r.inep_skill_code)),examCode:Number(l(r.inep_exam_code)),position:Number(l(r.inep_position)),bookColor:r.inep_book_color??null,tri:{a:r.inep_tri_a==null?null:Number(l(r.inep_tri_a)),b:r.inep_tri_b==null?null:Number(l(r.inep_tri_b)),c:r.inep_tri_c==null?null:Number(l(r.inep_tri_c))},matchScore:r.inep_match_score==null?null:Number(l(r.inep_match_score))},enrichment:r.enrichment_source==null?null:{subject:r.enrichment_subject??null,topic:r.enrichment_topic??null,source:r.enrichment_source}}}async function le(e){const t=e?.id??null;if(!C(e)||typeof e.type!="string"){B(t,f("InvalidMessageError","Mensagem de worker inválida.","INVALID_MESSAGE"));return}try{let i;switch(e.type){case"init":i=await ee(e);break;case"getFilters":i=te(e.payload);break;case"searchQuestions":i=ae(e.payload);break;case"getQuestion":i=ue(e.payload);break;case"close":j(),i={closed:!0};break;default:throw f("UnknownMessageError",`Operação desconhecida: ${e.type}.`,"UNKNOWN_MESSAGE")}Y(t,i)}catch(i){B(t,i)}}typeof self<"u"&&self.addEventListener("message",e=>{F=F.then(()=>le(e.data))});
