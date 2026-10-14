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

  // Storage 비공개 서명 URL 생성 및 파일 관리 지원
  const integrations = {
    Core: {
      CreateFileSignedUrl: async ({ file_uri, expiresIn = 3600 }) => {
        const parts = String(file_uri || '').split('/');
        const bucket = parts[0] || 'private';
        const path = parts.slice(1).join('/');
        if (bucket === 'public') {
          const { data } = supabase.storage.from('public').getPublicUrl(path);
          return { signed_url: data.publicUrl };
        }
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
        if (error) throw error;
        return { signed_url: data.signedUrl };
      },
      UploadPublicFile: async ({ file }) => {
        const ext = file.name ? file.name.split('.').pop() : 'bin';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
        const { error } = await supabase.storage.from('public').upload(fileName, file);
        if (error) throw error;
        const { data } = supabase.storage.from('public').getPublicUrl(fileName);
        return { file_url: data.publicUrl, file_uri: `public/${fileName}` };
      },
      UploadPrivateFile: async ({ file }) => {
        const ext = file.name ? file.name.split('.').pop() : 'bin';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}.${ext}`;
        const { error } = await supabase.storage.from('private').upload(fileName, file);
        if (error) throw error;
        return { file_uri: `private/${fileName}` };
      }
    }
  };

  // Edge Function 간 내부 호출 지원
  const functions = {
    invoke: async (name, payload = {}) => {
      try {
        const url = (typeof Deno !== 'undefined' && Deno.env.get('SUPABASE_URL')) || '';
        const serviceKey = (typeof Deno !== 'undefined' && Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) || '';
        if (url && serviceKey) {
          const res = await fetch(`${url}/functions/v1/${name}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': serviceKey,
              'Authorization': `Bearer ${serviceKey}`
            },
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => ({}));
          return { data, status: res.status };
        }
        return { data: { ok: true }, status: 200 };
      } catch (err) {
        console.warn(`[functions.invoke] ${name} call skipped or failed:`, err.message);
        return { data: { error: err.message }, status: 500 };
      }
    }
  };

  return {
    asServiceRole: { entities, integrations, functions },
    entities,
    integrations,
    auth: { me: async () => (options.me ? options.me() : null) },
    functions
  };
}
