// compat.mjs / http.mjs 테스트 (실행: node --test base44/supabase/functions/_shared/compat.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompatClient } from './compat.mjs';
import { withCors } from './http.mjs';

// 호출 기록을 남기고, await 하면 미리 정한 결과를 돌려주는 가짜 Supabase 클라이언트
function fakeClient(result = { data: [], error: null }) {
  const calls = [];
  const builder = new Proxy({}, {
    get(_, name) {
      if (name === 'then') return (resolve) => resolve(result);
      return (...args) => { calls.push([name, ...args]); return builder; };
    }
  });
  return { client: { from: (t) => { calls.push(['from', t]); return builder; } }, calls };
}

test('base44.asServiceRole.entities.X.filter 가 해당 테이블을 조회한다', async () => {
  const { client, calls } = fakeClient({ data: [{ id: 'p1' }], error: null });
  const base44 = createCompatClient(client);
  const rows = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: 'a@b.c', status: 'active' });
  assert.deepEqual(rows, [{ id: 'p1' }]);
  assert.deepEqual(calls[0], ['from', 'employee_profile']);
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'status' && c[2] === 'active'));
});

test('옵션을 주면 { items } 페이지를 돌려준다 (kwSession 의 rowsOf 와 호환)', async () => {
  const { client } = fakeClient({ data: [{ id: 'p1' }], error: null });
  const base44 = createCompatClient(client);
  const page = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: 'x' }, { limit: 1 });
  assert.deepEqual(page.items, [{ id: 'p1' }]);
  assert.equal(page.has_more, false);
});

test('get 은 없으면 예외 → 기존 코드의 .catch(() => null) 와 호환', async () => {
  const { client } = fakeClient({ data: null, error: null });
  const base44 = createCompatClient(client);
  const result = await base44.asServiceRole.entities.Company.get('none').catch(() => null);
  assert.equal(result, null);
});

test('엔티티 이름이 이상하면 거부한다', () => {
  const { client } = fakeClient();
  const base44 = createCompatClient(client);
  assert.throws(() => base44.asServiceRole.entities['Company; drop table x']);
});

test('auth.me 는 기본 null, 옵션으로 지정하면 그 값을 돌려준다', async () => {
  const { client } = fakeClient();
  assert.equal(await createCompatClient(client).auth.me(), null);
  const base44 = createCompatClient(client, { me: async () => ({ email: 'a@b.c' }) });
  assert.deepEqual(await base44.auth.me(), { email: 'a@b.c' });
});

test('아직 이전하지 않은 integrations 는 분명한 오류를 낸다', () => {
  const { client } = fakeClient();
  const base44 = createCompatClient(client);
  assert.throws(() => base44.asServiceRole.integrations.Core.CreateFileSignedUrl({}), /not available/);
});

test('CORS: OPTIONS 요청은 바로 허용 응답', async () => {
  const handler = withCors(async () => new Response('x'));
  const res = await handler(new Request('http://x', { method: 'OPTIONS' }));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Access-Control-Allow-Headers'), /x-kw-session/);
});

test('CORS: 일반 응답에 헤더를 붙이고, 예외는 JSON 500 으로 바꾼다', async () => {
  const ok = await withCors(async () => Response.json({ a: 1 }, { status: 201 }))(new Request('http://x', { method: 'POST' }));
  assert.equal(ok.status, 201);
  assert.equal(ok.headers.get('Access-Control-Allow-Origin'), '*');
  const bad = await withCors(async () => { throw new Error('boom'); })(new Request('http://x', { method: 'POST' }));
  assert.equal(bad.status, 500);
  assert.deepEqual(await bad.json(), { error: 'boom' });
});

test('원본 shared/kwAuth.ts 가 수정 없이 불러와진다 (호환 확인)', async () => {
  const mod = await import('../../../shared/kwAuth.ts');
  for (const name of ['resolveCaller', 'accessFor', 'scopeQuery', 'GATEWAY_ENTITIES', 'openSession', 'hashPassword']) {
    assert.ok(name in mod, `${name} 가 없습니다`);
  }
});

test('원본 kwAuth 로직이 호환 객체 위에서 비밀번호 해시를 검증한다', async () => {
  const { hashPassword, verifyPassword, randomSalt } = await import('../../../shared/kwAuth.ts');
  const salt = randomSalt();
  const hash = await hashPassword('Correct-Horse-9', salt);
  assert.equal(await verifyPassword('Correct-Horse-9', salt, hash), true);
  assert.equal(await verifyPassword('wrong-password', salt, hash), false);
});
