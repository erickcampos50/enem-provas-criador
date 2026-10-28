const N=Object.freeze([Object.freeze({key:"muito-facil",label:"Muito fácil",min:null,max:.5,color:"#1e7a35"}),Object.freeze({key:"facil",label:"Fácil",min:.5,max:1.2,color:"#4c7a1a"}),Object.freeze({key:"medio",label:"Médio",min:1.2,max:1.9,color:"#9a5b00"}),Object.freeze({key:"dificil",label:"Difícil",min:1.9,max:2.5,color:"#c2410c"}),Object.freeze({key:"muito-dificil",label:"Muito difícil",min:2.5,max:null,color:"#b3261e"})]),H=Object.freeze({key:"sem",label:"Sem classificação",color:"#6b7280"});function D(e){if(typeof e=="number")return Number.isFinite(e)?e:null;if(typeof e=="string"&&e.trim()!==""){const t=Number(e);return Number.isFinite(t)?t:null}return null}function z({a:e,b:t}={}){const i=D(e),n=D(t);return!(n===null||n>5||i===null||i<.5)}function Q({a:e,b:t}={}){if(!z({a:e,b:t}))return null;const i=D(t);return{...N.find(a=>(a.min===null||i>=a.min)&&(a.max===null||i<a.max))??N[N.length-1],b:i}}function G(e){return e===H.key||N.some(t=>t.key===e)}const R=2048,O=1e3,W=100;let $,h,y,A={inepMetadata:!1,enrichment:!1},F=Promise.resolve();function q(e="q"){let t="";return A.inepMetadata&&(t+=`
LEFT JOIN question_inep_metadata AS im ON im.question_id = ${e}.id`),A.enrichment&&(t+=`
LEFT JOIN question_enrichment AS qe ON qe.question_id = ${e}.id`),t}function L(e="q"){return A.inepMetadata?`COALESCE(
    CASE im.area
      WHEN 'LC' THEN 'linguagens'
      WHEN 'CH' THEN 'ciencias-humanas'
      WHEN 'CN' THEN 'ciencias-natureza'
      WHEN 'MT' THEN 'matematica'
    END,
    ${e}.discipline
  )`:`${e}.discipline`}function x(e="q"){return A.enrichment?`COALESCE(qe.display_title, ${e}.title)`:`${e}.title`}function w(){return A.inepMetadata?`im.item_code AS inep_item_code,
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
            NULL AS inep_match_score`}function V(e="im"){return A.inepMetadata?`${e}.tri_a AS inep_tri_a,
              ${e}.tri_b AS inep_tri_b`:`NULL AS inep_tri_a,
              NULL AS inep_tri_b`}function k(){return A.enrichment?`qe.subject AS enrichment_subject,
          qe.topic AS enrichment_topic,
          qe.source AS enrichment_source`:`NULL AS enrichment_subject,
            NULL AS enrichment_topic,
            NULL AS enrichment_source`}function C(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function f(e,t,i,n){const a=new Error(t);return a.name=e,i&&(a.code=i),n!==void 0&&(a.details=n),a}function X(e){const t=e instanceof Error?e:new Error(String(e)),i={name:typeof t.name=="string"?t.name:"Error",message:typeof t.message=="string"?t.message:String(t)};if((typeof t.code=="string"||typeof t.code=="number")&&(i.code=t.code),typeof t.resultCode=="number"&&(i.resultCode=t.resultCode),t.details!==void 0)try{JSON.stringify(t.details),i.details=t.details}catch{i.details=String(t.details)}return typeof t.stack=="string"&&(i.stack=t.stack),i}function Y(e,t){self.postMessage({id:e??null,type:"response",ok:!0,result:t})}function B(e,t){self.postMessage({id:e??null,type:"response",ok:!1,error:X(t)})}async function P(){return $||($=import("./index-DlV0y7TX.js").then(async e=>{const t=e.default??e.sqlite3InitModule;if(typeof t!="function")throw f("SQLiteLoadError","O módulo @sqlite.org/sqlite-wasm não exportou sqlite3InitModule.","SQLITE_MODULE_INVALID");return t()})),$}function v(){if(!y)throw f("DatabaseNotInitializedError","O banco SQLite ainda não foi inicializado.","DB_NOT_INITIALIZED");return y}function E(e,t,i){const n=[],a={sql:t,rowMode:"object",resultRows:n};return i!==void 0&&(a.bind=i),e.exec(a),n}function u(e){return typeof e=="bigint"?Number(e):e}function J(e){return e instanceof ArrayBuffer||typeof SharedArrayBuffer<"u"&&e instanceof SharedArrayBuffer}function K(e){return J(e)?new Uint8Array(e):ArrayBuffer.isView(e)?new Uint8Array(e.buffer,e.byteOffset,e.byteLength):null}function Z(e){const t=e?.payload,i=[t,t?.buffer,t?.arrayBuffer,e?.buffer,e?.arrayBuffer];for(const n of i){const a=K(n);if(a)return a}return null}function j(){const e=y;y=void 0,A={inepMetadata:!1,enrichment:!1},e&&e.close()}async function ee(e){const t=Z(e);if(!t||t.byteLength===0)throw f("InvalidArgumentError","init exige um ArrayBuffer não vazio contendo um banco SQLite.","INVALID_DATABASE_BUFFER");h=await P(),j();const i=new h.oo1.DB;let n,a=!1;try{n=h.wasm.allocFromTypedArray(t);const s=h.capi.sqlite3_deserialize(i.pointer,"main",n,t.byteLength,t.byteLength,0);i.checkRc(s),a=!0,i.onclose={after:()=>{n&&(h.wasm.dealloc(n),n=void 0)}};const p=E(i,`SELECT name
         FROM sqlite_schema
        WHERE type = 'table'
          AND name IN ('exams', 'questions', 'alternatives', 'question_files', 'search_index')`).map(c=>c.name),l=["exams","questions","alternatives","question_files","search_index"].filter(c=>!p.includes(c));if(l.length>0)throw f("DatabaseSchemaError",`O banco não contém as tabelas obrigatórias: ${l.join(", ")}.`,"DB_SCHEMA_INVALID",{missingTables:l});const r=E(i,`SELECT name
         FROM sqlite_schema
        WHERE type = 'table'
          AND name IN ('question_inep_metadata', 'question_enrichment')`).map(c=>c.name);A={inepMetadata:r.includes("question_inep_metadata"),enrichment:r.includes("question_enrichment")};const o=E(i,"SELECT (SELECT count(*) FROM questions) AS question_count, (SELECT count(*) FROM exams) AS exam_count")[0];return y=i,{ready:!0,version:h.version?.libVersion??null,questionCount:Number(u(o?.question_count)??0),examCount:Number(u(o?.exam_count)??0),features:{...A}}}catch(s){throw a||n&&h.wasm.dealloc(n),i.close(),s}}function te(){const e=v(),t=E(e,`SELECT year AS value, CAST(year AS TEXT) AS label
       FROM exams
      ORDER BY year DESC`).map(a=>({value:Number(u(a.value)),label:a.label})),i=E(e,`SELECT value, MIN(label) AS label
       FROM exam_disciplines
      GROUP BY value
      ORDER BY label COLLATE NOCASE, value`),n=E(e,`SELECT value, MIN(label) AS label
       FROM exam_languages
      GROUP BY value
      ORDER BY label COLLATE NOCASE, value`);return{years:t,disciplines:i,languages:n}}function b(e,t,{min:i=Number.MIN_SAFE_INTEGER,max:n=Number.MAX_SAFE_INTEGER}={}){if(e==null||e==="")return;const a=typeof e=="number"?e:Number(e);if(!Number.isSafeInteger(a)||a<i||a>n)throw f("InvalidArgumentError",`${t} deve ser um inteiro válido.`,"INVALID_ARGUMENT",{field:t});return a}function I(e,t){if(e==null||e==="")return;if(typeof e!="string")throw f("InvalidArgumentError",`${t} deve ser uma string.`,"INVALID_ARGUMENT",{field:t});return e.trim()||void 0}function ie(e){if(!e)return{query:void 0,noMatches:!1};if(e.length>R)throw f("InvalidArgumentError",`q não pode exceder ${R} caracteres.`,"INVALID_ARGUMENT",{field:"q",maxLength:R});const t=e.normalize("NFKC").trim();if(!t)return{query:void 0,noMatches:!1};const i=[];let n=0;const a=t.length;for(;n<a;){for(;n<a&&/\s/.test(t[n]);)n++;if(n>=a)break;const o=t[n];if(o==='"'){const _=t.indexOf('"',n+1);if(_===-1){const U=t.slice(n+1).trim();if(U){const T=U.replaceAll('"','""').replace(/\s+/g," ").trim();T&&/[\p{L}\p{N}]/u.test(T)&&i.push({type:"term",value:`"${T}"`})}break}const S=t.slice(n+1,_).replaceAll('"','""').trim().replace(/\s+/g," ");S&&/[\p{L}\p{N}]/u.test(S)&&i.push({type:"term",value:`"${S}"`}),n=_+1;continue}if(o==="("){i.push({type:"lparen",value:"("}),n++;continue}if(o===")"){i.push({type:"rparen",value:")"}),n++;continue}if(o==="-"){const _=t[n+1];if(_&&/[\p{L}\p{N}"]/u.test(_)){i.push({type:"op",value:"NOT"}),n++;continue}n++;continue}const c=t.slice(n),m=c.match(/^NEAR(\/\d+)?\b/i);if(m){i.push({type:"op",value:m[0].toUpperCase()}),n+=m[0].length;continue}const g=c.match(/^(AND|OR|NOT)\b/i);if(g){i.push({type:"op",value:g[1].toUpperCase()}),n+=g[1].length;continue}const d=c.match(/^[\p{L}\p{N}]+/u);if(d){const _=d[0],M=_.replaceAll('"','""');if(i.push({type:"term",value:`"${M}"`}),n+=_.length,n<a&&t[n]==="*"){const S=i[i.length-1];S.value=`"${M}"*`,n++}continue}n++}if(i.length===0)return{query:void 0,noMatches:!0};const s=[];for(const o of i){const c=s[s.length-1];if(c){const m=c.type==="term"||c.type==="rparen",g=o.type==="term"||o.type==="lparen",d=o.type==="op"&&o.value==="NOT";m&&(g||d)&&s.push({type:"op",value:"AND"})}s.push(o)}for(;s.length&&s[0].type==="op"&&["AND","OR"].includes(s[0].value);)s.shift();for(;s.length&&s[0].type==="op"&&s[0].value.startsWith("NEAR");)s.shift();for(;s.length&&s[s.length-1].type==="op";)s.pop();const p=s.filter((o,c,m)=>!(o.type==="lparen"&&m[c+1]?.type==="rparen"||o.type==="rparen"&&m[c-1]?.type==="lparen"));if(!p.some(o=>o.type==="term"))return{query:void 0,noMatches:!0};const r=p.map(o=>o.value).join(" ");return r?{query:r,noMatches:!1}:{query:void 0,noMatches:!0}}function ne(e){const t=C(e)?e:{};if(t.q!==void 0&&t.q!==null&&typeof t.q!="string")throw f("InvalidArgumentError","q deve ser uma string.","INVALID_ARGUMENT",{field:"q"});const i=t.q?.trim()??"",n=ie(i),a=b(t.year,"year"),s=I(t.discipline,"discipline"),p=I(t.language,"language"),l=I(t.difficulty,"difficulty");if(l!==void 0&&!G(l))throw f("InvalidArgumentError","difficulty deve ser uma faixa de dificuldade conhecida.","INVALID_ARGUMENT",{field:"difficulty"});const r=b(t.page,"page",{min:1})??1,o=b(t.pageSize,"pageSize",{min:1,max:W})??20;if(t.hasImages!==void 0&&t.hasImages!==null&&typeof t.hasImages!="boolean")throw f("InvalidArgumentError","hasImages deve ser booleano.","INVALID_ARGUMENT",{field:"hasImages"});const c=t.excludeIds??[];if(!Array.isArray(c))throw f("InvalidArgumentError","excludeIds deve ser um array.","INVALID_ARGUMENT",{field:"excludeIds"});if(c.length>O)throw f("InvalidArgumentError",`excludeIds não pode conter mais de ${O} IDs.`,"INVALID_ARGUMENT",{field:"excludeIds",maxLength:O});const m=[...new Set(c.map(d=>b(d,"excludeIds",{min:1})))];if(m.some(d=>d===void 0))throw f("InvalidArgumentError","excludeIds contém um ID inválido.","INVALID_ARGUMENT",{field:"excludeIds"});const g=(r-1)*o;if(!Number.isSafeInteger(g))throw f("InvalidArgumentError","page é grande demais.","INVALID_ARGUMENT",{field:"page"});return{q:i,ftsQuery:n.query,noMatches:n.noMatches,year:a,discipline:s,language:p,difficulty:l,hasImages:t.hasImages,excludeIds:m,limit:o,offset:g,page:r,pageSize:o}}function re(e){const t={},i=[];let n="";if(e.ftsQuery?(n=`
      JOIN (
        SELECT question_id
          FROM search_index
         WHERE search_index MATCH $fts
         GROUP BY question_id
      ) AS matched ON matched.question_id = q.id`,t.$fts=e.ftsQuery):e.noMatches&&i.push("0"),e.year!==void 0&&(i.push("q.year = $year"),t.$year=e.year),e.discipline!==void 0&&(i.push(`${L("q")} = $discipline`),t.$discipline=e.discipline),e.language!==void 0&&(i.push("q.language = $language"),t.$language=e.language),e.difficulty!==void 0)if(!A.inepMetadata)i.push("0");else{const s=`(im.tri_b IS NOT NULL
            AND im.tri_b <= 5
            AND im.tri_a IS NOT NULL
            AND im.tri_a >= ${.5})`;if(e.difficulty===H.key)i.push(`NOT ${s}`);else{const p=N.find(l=>l.key===e.difficulty);if(!p)i.push("0");else{const l=[s];p.min!==null&&(l.push("im.tri_b >= $difficultyMin"),t.$difficultyMin=p.min),p.max!==null&&(l.push("im.tri_b < $difficultyMax"),t.$difficultyMax=p.max),i.push(`(${l.join(`
            AND `)})`)}}}if(e.hasImages===!0&&i.push(`(EXISTS (SELECT 1 FROM question_files AS image_filter WHERE image_filter.question_id = q.id)
        OR EXISTS (SELECT 1 FROM alternatives AS alternative_image_filter
                   WHERE alternative_image_filter.question_id = q.id
                     AND alternative_image_filter.file_url IS NOT NULL))`),e.excludeIds.length>0){const s=e.excludeIds.map((p,l)=>{const r=`$exclude_${l}`;return t[r]=p,r});i.push(`q.id NOT IN (${s.join(", ")})`)}const a=i.length>0?`WHERE ${i.join(`
          AND `)}`:"";return{bind:t,join:n,where:a}}function ae(e){return{id:Number(u(e.id)),year:Number(u(e.year)),number:Number(u(e.number)),language:e.language??null,title:e.title,sourceTitle:e.source_title??e.title,discipline:e.discipline??null,hasImages:!!Number(u(e.has_images)),difficulty:Q({a:e.inep_tri_a==null?null:Number(u(e.inep_tri_a)),b:e.inep_tri_b==null?null:Number(u(e.inep_tri_b))}),snippet:e.snippet??null}}function se(e){const t=v(),i=ne(e),n=re(i),a=E(t,`SELECT count(*) AS total
       FROM questions AS q
       ${q("q")}
       ${n.join}
       ${n.where}`,n.bind),s=Number(u(a[0]?.total)??0),p={...n.bind,$limit:i.limit,$offset:i.offset},l=i.ftsQuery?`(SELECT snippet(search_index, 3, '', '', '…', 18)
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
              ${x("q")} AS title,
              q.title AS source_title,
              ${L("q")} AS discipline,
              q.context,
              q.alternatives_introduction,
              ${V("im")}
         FROM questions AS q
         ${q("q")}
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
      FROM paged`,p);return{total:s,page:i.page,pageSize:i.pageSize,results:r.map(ae)}}function oe(e){if(typeof e=="number"||typeof e=="string")return{id:e};if(!C(e))throw f("InvalidArgumentError","getQuestion exige um ID ou uma chave de questão.","INVALID_ARGUMENT");return e}function le(e){const t=v(),i=oe(e),n=b(i.id??i.questionId,"id",{min:1}),a=b(i.year,"year"),s=b(i.number,"number",{min:1}),p=I(i.language,"language");if(n===void 0&&(a===void 0||s===void 0))throw f("InvalidArgumentError","getQuestion exige id/questionId ou o conjunto year + number.","INVALID_ARGUMENT");let l;if(n!==void 0)l=E(t,`SELECT q.id, q.year, q.number, q.language,
              ${x("q")} AS title,
              q.title AS source_title,
              ${L("q")} AS discipline,
              q.context, q.alternatives_introduction, q.correct_alternative, q.source_path,
              ${w()},
              ${k()}
         FROM questions AS q
         ${q("q")}
        WHERE q.id = $id`,{$id:n});else{const d={$year:a,$number:s},_=["q.year = $year","q.number = $number"];if(p!==void 0&&(_.push("q.language = $language"),d.$language=p),l=E(t,`SELECT q.id, q.year, q.number, q.language,
              ${x("q")} AS title,
              q.title AS source_title,
              ${L("q")} AS discipline,
              q.context, q.alternatives_introduction, q.correct_alternative, q.source_path,
              ${w()},
              ${k()}
         FROM questions AS q
         ${q("q")}
        WHERE ${_.join(" AND ")}
        LIMIT 2`,d),l.length>1)throw f("AmbiguousQuestionError","Mais de uma questão corresponde a year + number; informe language ou id.","AMBIGUOUS_QUESTION")}const r=l[0];if(!r)throw f("QuestionNotFoundError","Questão não encontrada.","QUESTION_NOT_FOUND");const o=Number(u(r.id)),c=E(t,`SELECT id, letter, text, file_url, is_correct
       FROM alternatives
      WHERE question_id = $questionId
      ORDER BY letter COLLATE NOCASE, id`,{$questionId:o}).map(d=>({id:Number(u(d.id)),letter:d.letter,text:d.text??null,file:d.file_url??null,fileUrl:d.file_url??null,isCorrect:!!Number(u(d.is_correct))})),m=E(t,`SELECT url
       FROM question_files
      WHERE question_id = $questionId
      ORDER BY position, id`,{$questionId:o}).map(d=>d.url);return{id:o,year:Number(u(r.year)),number:Number(u(r.number)),language:r.language??null,title:r.title,sourceTitle:r.source_title??r.title,discipline:r.discipline??null,context:r.context??null,alternativesIntroduction:r.alternatives_introduction??null,correctAlternative:r.correct_alternative??null,sourcePath:r.source_path,alternatives:c,files:m,urls:m,inep:r.inep_item_code==null?null:{itemCode:Number(u(r.inep_item_code)),area:r.inep_area,skillCode:r.inep_skill_code==null?null:Number(u(r.inep_skill_code)),examCode:Number(u(r.inep_exam_code)),position:Number(u(r.inep_position)),bookColor:r.inep_book_color??null,tri:{a:r.inep_tri_a==null?null:Number(u(r.inep_tri_a)),b:r.inep_tri_b==null?null:Number(u(r.inep_tri_b)),c:r.inep_tri_c==null?null:Number(u(r.inep_tri_c))},matchScore:r.inep_match_score==null?null:Number(u(r.inep_match_score))},enrichment:r.enrichment_source==null?null:{subject:r.enrichment_subject??null,topic:r.enrichment_topic??null,source:r.enrichment_source}}}async function ue(e){const t=e?.id??null;if(!C(e)||typeof e.type!="string"){B(t,f("InvalidMessageError","Mensagem de worker inválida.","INVALID_MESSAGE"));return}try{let i;switch(e.type){case"init":i=await ee(e);break;case"getFilters":i=te(e.payload);break;case"searchQuestions":i=se(e.payload);break;case"getQuestion":i=le(e.payload);break;case"close":j(),i={closed:!0};break;default:throw f("UnknownMessageError",`Operação desconhecida: ${e.type}.`,"UNKNOWN_MESSAGE")}Y(t,i)}catch(i){B(t,i)}}typeof self<"u"&&self.addEventListener("message",e=>{F=F.then(()=>ue(e.data))});
