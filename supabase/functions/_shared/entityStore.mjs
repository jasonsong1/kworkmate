// ============================================================
// entityStore.mjs
// 목적: 기존 앱이 쓰던 Base44 방식의 데이터 호출(MongoDB 스타일 필터 등)을
//       Supabase(PostgREST) 쿼리로 바꿔서 실행해 주는 "변환기"입니다.
//
// - 외부 라이브러리가 없는 순수 JS라서 Edge Function(Deno)과 로컬 Node 테스트 양쪽에서 씁니다.
// - 권한 검사(누가 무엇을 볼 수 있는가)는 여기서 하지 않습니다. 그건 kwData 관문 함수의 몫이고,
//   이 파일은 "이미 허용된 요청"을 DB 쿼리로 옮기는 일만 합니다.
// ============================================================

// ------------------------------------------------------------
// 1. 이름 변환 / 안전 검사
// ------------------------------------------------------------

// 엔티티 이름 -> 테이블 이름 (예: EmployeeProfile -> employee_profile)
export function tableFor(entity) {
  const name = String(entity || '');
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) throw new Error('Invalid entity name');
  if (name === 'User') return 'employee_profile';
  if (name === 'TfnDeclaration') return 'tfn_declarations';
  if (name === 'TfnDocument') return 'tfn_documents';
  if (name === 'Invoice') return 'invoices';
  return name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

// 컬럼 이름 검사: 필터 문자열에 그대로 들어가므로, 영문/숫자/밑줄만 허용해서 주입 공격을 막습니다.
function assertColumn(col) {
  if (typeof col !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(col)) {
    throw new Error(`Invalid field name: ${col}`);
  }
  return col;
}

// 값 -> PostgREST 필터 문자열용 값. 문자열은 따옴표로 감싸서 쉼표/괄호가 있어도 안전하게 만듭니다.
function quote(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return `"${value.toISOString()}"`;
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// 정규식 -> ilike/like 패턴. 앱이 쓰는 "포함 검색(escapeRegex로 감싼 단어)"만 지원합니다.
function regexToLike(pattern, options) {
  let text = String(pattern);
  const anchoredStart = text.startsWith('^');
  const anchoredEnd = text.endsWith('$') && !text.endsWith('\\$');
  if (anchoredStart) text = text.slice(1);
  if (anchoredEnd) text = text.slice(0, -1);
  // escapeRegex 로 붙은 역슬래시 제거 (예: "a\.b" -> "a.b")
  text = text.replace(/\\(.)/g, '$1');
  // LIKE 특수문자(% _ \)를 문자 그대로 검색하도록 이스케이프
  text = text.replace(/[\\%_]/g, (c) => `\\${c}`);
  const body = `${anchoredStart ? '' : '*'}${text}${anchoredEnd ? '' : '*'}`;
  const insensitive = String(options || '').includes('i');
  return { op: insensitive ? 'ilike' : 'like', value: body };
}

// ------------------------------------------------------------
// 2. 필터(MongoDB 스타일) -> 조건 트리
//    leaf  : { col, op, val }
//    group : { or: [...] } 또는 { and: [...] }
// ------------------------------------------------------------
const SIMPLE_OPS = { $eq: 'eq', $gt: 'gt', $gte: 'gte', $lt: 'lt', $lte: 'lte' };

function leaf(col, op, val) {
  return { col: assertColumn(col), op, val };
}

function fieldNodes(col, spec) {
  // 연산자 객체가 아니면 "같다(eq)" 조건
  const isOperatorObject =
    spec !== null && typeof spec === 'object' && !Array.isArray(spec) && !(spec instanceof Date) &&
    Object.keys(spec).length > 0 && Object.keys(spec).every((k) => k.startsWith('$'));

  if (!isOperatorObject) {
    if (Array.isArray(spec)) throw new Error(`Array equality is not supported for ${col}`);
    if (spec !== null && typeof spec === 'object' && !(spec instanceof Date)) {
      throw new Error(`Object equality is not supported for ${col}`);
    }
    return [spec === null ? leaf(col, 'isnull') : leaf(col, 'eq', spec)];
  }

  const nodes = [];
  for (const [operator, value] of Object.entries(spec)) {
    if (operator === '$options') continue; // $regex 와 함께 처리
    if (SIMPLE_OPS[operator]) {
      nodes.push(value === null ? leaf(col, 'isnull') : leaf(col, SIMPLE_OPS[operator], value));
    } else if (operator === '$ne') {
      // MongoDB 의 $ne 는 "값이 비어 있는(null) 행"도 포함합니다. SQL 의 <> 와 다른 점을 맞춰 줍니다.
      nodes.push(
        value === null
          ? leaf(col, 'notnull')
          : { or: [leaf(col, 'neq', value), leaf(col, 'isnull')] }
      );
    } else if (operator === '$in') {
      if (!Array.isArray(value)) throw new Error('$in needs an array');
      nodes.push(leaf(col, 'in', value));
    } else if (operator === '$nin') {
      if (!Array.isArray(value)) throw new Error('$nin needs an array');
      nodes.push({ or: [leaf(col, 'notin', value), leaf(col, 'isnull')] });
    } else if (operator === '$exists') {
      nodes.push(leaf(col, value ? 'notnull' : 'isnull'));
    } else if (operator === '$regex') {
      const like = regexToLike(value, spec.$options);
      nodes.push(leaf(col, like.op, like.value));
    } else {
      throw new Error(`Unsupported operator: ${operator}`);
    }
  }
  return nodes;
}

// 쿼리 객체 하나 -> 조건 목록 (목록 안의 조건들은 서로 AND)
export function queryToNodes(query) {
  const nodes = [];
  for (const [key, value] of Object.entries(query || {})) {
    if (key === '$or') {
      if (!Array.isArray(value)) throw new Error('$or needs an array');
      nodes.push({ or: value.map((q) => andOf(queryToNodes(q))) });
    } else if (key === '$and') {
      if (!Array.isArray(value)) throw new Error('$and needs an array');
      nodes.push({ and: value.map((q) => andOf(queryToNodes(q))) });
    } else if (key.startsWith('$')) {
      throw new Error(`Unsupported operator: ${key}`);
    } else {
      nodes.push(...fieldNodes(key, value));
    }
  }
  return nodes;
}

// 조건 여러 개를 하나로 묶기
function andOf(nodes) {
  return nodes.length === 1 ? nodes[0] : { and: nodes };
}

// ------------------------------------------------------------
// 3. 조건 트리 -> PostgREST 문자열 (or(...) 안에 넣을 때 사용)
// ------------------------------------------------------------
export function nodeToString(node) {
  if (node.or) return `or(${node.or.map(nodeToString).join(',')})`;
  if (node.and) return `and(${node.and.map(nodeToString).join(',')})`;
  const { col, op, val } = node;
  switch (op) {
    case 'isnull': return `${col}.is.null`;
    case 'notnull': return `${col}.not.is.null`;
    case 'in': return `${col}.in.(${val.map(quote).join(',')})`;
    case 'notin': return `${col}.not.in.(${val.map(quote).join(',')})`;
    default: return `${col}.${op}.${quote(val)}`;
  }
}

// 최상위 조건을 supabase-js 쿼리 빌더에 적용 (최상위 조건끼리는 AND)
function applyNode(builder, node) {
  if (node.and) {
    node.and.forEach((child) => { builder = applyNode(builder, child); });
    return builder;
  }
  if (node.or) return builder.or(node.or.map(nodeToString).join(','));
  switch (node.op) {
    case 'isnull': return builder.is(node.col, null);
    case 'notnull': return builder.not(node.col, 'is', null);
    case 'in': return builder.in(node.col, node.val);
    case 'notin': return builder.not(node.col, 'in', `(${node.val.map(quote).join(',')})`);
    case 'ilike': return builder.ilike(node.col, node.val);
    case 'like': return builder.like(node.col, node.val);
    default: return builder[node.op](node.col, node.val);
  }
}

export function applyQuery(builder, query) {
  return queryToNodes(query).reduce((b, node) => applyNode(b, node), builder);
}

// ------------------------------------------------------------
// 4. 정렬 / 페이지 / 필드 선택
// ------------------------------------------------------------

// "-created_date" -> 내림차순, "date" -> 오름차순, "-a,b" 처럼 여러 개도 가능
export function parseSort(sort) {
  if (!sort) return [];
  return String(sort)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ({
      col: assertColumn(s.replace(/^[-+]/, '')),
      ascending: !s.startsWith('-')
    }));
}

function selectList(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return '*';
  return fields.map(assertColumn).join(',');
}

// 커서 = "몇 번째 행부터 읽을지"를 문자열로 만든 값
function readOffset(options) {
  const raw = options && (options.cursor ?? options.skip);
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const DEFAULT_PAGE_LIMIT = 50;     // 옵션을 줬을 때 기본 개수
const ARRAY_RESULT_LIMIT = 1000;   // 옵션 없이 배열로 돌려줄 때 최대 개수

// ------------------------------------------------------------
// 5. 쓰기용 보조 함수
// ------------------------------------------------------------

// 24자리 16진수 ID (기존 Base44 ID 모양과 동일)
export function newId() {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function throwIf(error) {
  if (error) {
    const e = new Error(error.message || 'Database error');
    e.code = error.code;
    throw e;
  }
}

// 저장 직전 기본값 채우기: id, 생성/수정 시각, 만든 사람
function forInsert(record, ctx) {
  const now = new Date().toISOString();
  const row = { ...record };
  if (!row.id) row.id = newId();
  if (!row.created_date) row.created_date = now;
  row.updated_date = now;
  if (!row.created_by_id && ctx && ctx.createdById) row.created_by_id = ctx.createdById;
  for (const [k, v] of Object.entries(row)) {
    if (v === '' && (k.endsWith('_at') || k.endsWith('_date') || k.endsWith('_expiry') || k === 'date')) {
      row[k] = null;
    }
  }
  return row;
}

// 수정 데이터: {$set: {...}}, {$unset: {...}} 형태 허용
function forUpdate(data) {
  let source = {};
  if (data && (data.$set || data.$unset)) {
    if (data.$set) Object.assign(source, data.$set);
    if (data.$unset) {
      for (const key of Object.keys(data.$unset)) {
        source[key] = null;
      }
    }
  } else {
    source = data || {};
  }
  for (const key of Object.keys(source)) {
    if (key.startsWith('$')) throw new Error(`Unsupported update operator: ${key}`);
  }
  const row = { ...source };
  delete row.id;
  delete row.branch_ids;
  row.updated_date = new Date().toISOString();
  for (const [k, v] of Object.entries(row)) {
    if (v === '' && (k.endsWith('_at') || k.endsWith('_date') || k.endsWith('_expiry') || k === 'date')) {
      row[k] = null;
    }
  }
  return row;
}

function assertNotEmptyQuery(query, op) {
  if (!query || Object.keys(query).length === 0) {
    throw new Error(`${op} needs a query (refusing to touch every row)`);
  }
}

// ------------------------------------------------------------
// 6. 실제 실행기: runEntityOp
//    supabase : service_role 로 만든 supabase-js 클라이언트 (서버에서만!)
//    entity   : 'Company' 같은 엔티티 이름
//    op       : list / filter / get / count / aggregate / create / bulkCreate / update /
//               bulkUpdate / updateMany / delete / deleteMany / upsert
//    body     : { query, options, id, data, records, key, groupBy ... }
//    ctx      : { createdById }
// ------------------------------------------------------------
export async function runEntityOp(supabase, entity, op, body = {}, ctx = {}) {
  // User 엔티티 호환: Base44 레거시 코드의 User 호출을 employee_profile로 매핑
  if (entity === 'User') {
    if (body.query && typeof body.query === 'object' && 'email' in body.query) {
      body.query = { ...body.query, user_email: body.query.email };
      delete body.query.email;
    }
    if (body.data && typeof body.data === 'object') {
      if ('email' in body.data) {
        body.data = { ...body.data, user_email: body.data.email };
        delete body.data.email;
      }
      if ('branch_ids' in body.data) {
        if (!body.data.branch_id && Array.isArray(body.data.branch_ids) && body.data.branch_ids.length > 0) {
          body.data.branch_id = body.data.branch_ids[0];
        }
        delete body.data.branch_ids;
      }
    }
  }

  // EmployeeProfile도 마찬가지로 DB 스키마에 branch_ids 컬럼이 없으므로 제거
  if (entity === 'EmployeeProfile' && body.data && typeof body.data === 'object' && 'branch_ids' in body.data) {
    if (!body.data.branch_id && Array.isArray(body.data.branch_ids) && body.data.branch_ids.length > 0) {
      body.data.branch_id = body.data.branch_ids[0];
    }
    delete body.data.branch_ids;
  }

  const table = tableFor(entity);

  switch (op) {
    case 'list':
    case 'filter': {
      const query = op === 'filter' ? body.query : {};
      const options = body.options || null;
      let q = applyQuery(supabase.from(table).select(selectList(options && options.fields)), query);
      parseSort(options && options.sort).forEach((s) => { q = q.order(s.col, { ascending: s.ascending }); });
      // 정렬 기준이 같은 행들의 순서가 흔들리지 않도록 id 로 한 번 더 정렬
      q = q.order('id', { ascending: true });

      if (!options) {
        const { data, error } = await q.limit(ARRAY_RESULT_LIMIT);
        throwIf(error);
        return (data || []).map((r) => (entity === 'User' && r && r.user_email ? { ...r, email: r.user_email } : r));
      }
      const limit = Math.min(Math.max(Number(options.limit) || DEFAULT_PAGE_LIMIT, 1), 5000);
      const offset = readOffset(options);
      // 한 개 더 읽어서 "다음 페이지가 있는지" 판단
      const { data, error } = await q.range(offset, offset + limit);
      throwIf(error);
      const rows = data || [];
      const hasMore = rows.length > limit;
      const outRows = (hasMore ? rows.slice(0, limit) : rows).map((r) =>
        entity === 'User' && r && r.user_email ? { ...r, email: r.user_email } : r
      );
      return {
        items: outRows,
        next_cursor: hasMore ? String(offset + limit) : null,
        has_more: hasMore
      };
    }

    case 'get': {
      const { data, error } = await supabase.from(table).select('*').eq('id', String(body.id || '')).maybeSingle();
      throwIf(error);
      if (!data) throw new Error('Entity not found');
      return data;
    }

    case 'count': {
      const q = applyQuery(supabase.from(table).select('id', { count: 'exact', head: true }), body.query);
      const { count, error } = await q;
      throwIf(error);
      return count || 0;
    }

    case 'aggregate': {
      // 현재 앱이 쓰는 "그룹별 개수"만 지원합니다. 결과: { rows: [{ <groupBy>: 값, count: 개수 }] }
      for (const unsupported of ['sum', 'avg', 'min', 'max', 'countDistinct', 'dateBucket', 'having']) {
        if (body[unsupported]) throw new Error(`aggregate "${unsupported}" is not supported yet`);
      }
      const groupBy = Array.isArray(body.groupBy) ? body.groupBy : body.groupBy ? [body.groupBy] : [];
      const MAX_ROWS = 20000;
      const q = applyQuery(supabase.from(table).select(selectList(groupBy)), body.query).limit(MAX_ROWS);
      const { data, error } = await q;
      throwIf(error);
      const groups = new Map();
      (data || []).forEach((row) => {
        const key = JSON.stringify(groupBy.map((g) => row[g] ?? null));
        const found = groups.get(key);
        if (found) found.count += 1;
        else groups.set(key, { ...Object.fromEntries(groupBy.map((g) => [g, row[g] ?? null])), count: 1 });
      });
      let rows = [...groups.values()];
      const sorted = parseSort(body.sort);
      if (sorted.length) {
        rows.sort((a, b) => {
          for (const s of sorted) {
            if (a[s.col] === b[s.col]) continue;
            return (a[s.col] > b[s.col] ? 1 : -1) * (s.ascending ? 1 : -1);
          }
          return 0;
        });
      }
      if (body.limit) rows = rows.slice(0, Number(body.limit));
      return { rows, truncated: (data || []).length >= MAX_ROWS };
    }

    case 'create': {
      const { data, error } = await supabase.from(table).insert(forInsert(body.data, ctx)).select().single();
      throwIf(error);
      return data;
    }

    case 'bulkCreate': {
      const rows = (body.records || []).map((r) => forInsert(r, ctx));
      if (rows.length === 0) return [];
      const { data, error } = await supabase.from(table).insert(rows).select();
      throwIf(error);
      return data || [];
    }

    case 'update': {
      const { data, error } = await supabase
        .from(table).update(forUpdate(body.data)).eq('id', String(body.id || '')).select().maybeSingle();
      throwIf(error);
      if (!data) throw new Error('Entity not found');
      return data;
    }

    case 'bulkUpdate': {
      const results = await Promise.all(
        (body.records || []).map((record) =>
          runEntityOp(supabase, entity, 'update', { id: record.id, data: record }, ctx)
        )
      );
      return results;
    }

    case 'updateMany': {
      assertNotEmptyQuery(body.query, 'updateMany');
      const q = applyQuery(supabase.from(table).update(forUpdate(body.data)), body.query).select('id');
      const { data, error } = await q;
      throwIf(error);
      return { updated: (data || []).length };
    }

    case 'delete': {
      const { error } = await supabase.from(table).delete().eq('id', String(body.id || ''));
      throwIf(error);
      return true;
    }

    case 'deleteMany': {
      assertNotEmptyQuery(body.query, 'deleteMany');
      const q = applyQuery(supabase.from(table).delete(), body.query).select('id');
      const { data, error } = await q;
      throwIf(error);
      return { deleted: (data || []).length };
    }

    case 'upsert': {
      const key = body.key || 'id';
      const rows = (body.records || []).map((r) => forInsert(r, ctx));
      if (rows.length === 0) return [];
      const { data, error } = await supabase.from(table).upsert(rows, { onConflict: key }).select();
      throwIf(error);
      return data || [];
    }

    default:
      throw new Error(`Unknown operation: ${op}`);
  }
}
