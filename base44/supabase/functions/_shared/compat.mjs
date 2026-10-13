// ============================================================
// compat.mjs
// 목적: 기존 서버 함수가 쓰던 `base44` 객체와 "똑같은 모양"의 호환 객체를 만듭니다.
//       그러면 base44/shared/*.ts 와 함수들이 수정 없이 Supabase 위에서 동작합니다.
//
//   base44.asServiceRole.entities.Company.filter({...}, {...})   ← 기존 코드가 쓰던 모양
//        ↓ (이 파일이 변환)
//   Supabase 테이블 조회 (entityStore.mjs 가 실제 쿼리를 실행)
//
// 순수 JS(외부 패키지 없음)라서 Node 테스트와 Deno(Edge Function) 양쪽에서 동작합니다.
// ============================================================
import { runEntityOp, tableFor } from './entityStore.mjs';

// 엔티티 하나(예: Company)에 대한 메서드 모음
function entityHandler(supabase, entity, ctx) {
  tableFor(entity); // 이름이 안전한지 먼저 검사
  const run = (op, body) => runEntityOp(supabase, entity, op, body, ctx);
  return {
    list: (options) => run('list', { options }),
    filter: (query, options) => run('filter', { query, options }),
    get: (id) => run('get', { id }),
    create: (data) => run('create', { data }),
    update: (id, data) => run('update', { id, data }),
    delete: (id) => run('delete', { id }),
    count: (query) => run('count', { query }),
    bulkCreate: (records) => run('bulkCreate', { records }),
    bulkUpdate: (records) => run('bulkUpdate', { records }),
    updateMany: (query, data) => run('updateMany', { query, data }),
    deleteMany: (query) => run('deleteMany', { query }),
    upsert: (records, options) => run('upsert', { records, key: options && options.key }),
    aggregate: (options) => run('aggregate', options || {}),
    // 실시간 구독은 서버 함수에서 쓰지 않으므로 아무 일도 하지 않는 함수로 둡니다.
    subscribe: () => () => {}
  };
}

// 아직 이전하지 않은 기능(메일 발송, 파일 서명 URL 등)을 쓰려 하면 분명한 오류를 냅니다.
function notReady(name) {
  const fail = () => {
    throw new Error(`${name} is not available on Supabase yet`);
  };
  return new Proxy(() => fail(), {
    get: (_, prop) => (prop === 'then' ? undefined : notReady(`${name}.${String(prop)}`)),
    apply: () => fail()
  });
}

// supabase : service_role 로 만든 supabase-js 클라이언트 (서버에서만 사용!)
// options.me : base44.auth.me() 가 돌려줄 값을 계산하는 함수 (없으면 항상 null)
export function createCompatClient(supabase, options = {}) {
  const ctx = {};
  const cache = new Map();

  // base44.asServiceRole.entities.<이름> 으로 접근하면 그때그때 핸들러를 만들어 줍니다.
  const entities = new Proxy({}, {
    get: (_, name) => {
      if (typeof name !== 'string' || name === 'then' || name.startsWith('_')) return undefined;
      if (!cache.has(name)) cache.set(name, entityHandler(supabase, name, ctx));
      return cache.get(name);
    }
  });

  const integrations = notReady('integrations');

  return {
    asServiceRole: { entities, integrations },
    // 서버 함수에서는 사용자 권한 엔티티도 같은 DB를 쓰되, 권한은 kwData 가 따로 검사합니다.
    entities,
    // 플랫폼(이메일) 로그인은 아직 이전 전이라 null 입니다. 직원 ID 로그인은 세션 토큰으로 처리됩니다.
    auth: { me: async () => (options.me ? options.me() : null) },
    functions: { invoke: () => { throw new Error('functions.invoke is not available on Supabase yet'); } }
  };
}
