// entityStore.mjs 테스트 (실행: node --test base44/supabase/functions/_shared/entityStore.test.mjs)
// 진짜 DB 없이 "호출 기록을 남기는 가짜 빌더"로 변환 결과가 맞는지 확인합니다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tableFor, queryToNodes, nodeToString, parseSort, runEntityOp } from './entityStore.mjs';

// 호출된 메서드를 순서대로 기록하고, await 하면 미리 정한 결과를 돌려주는 가짜 빌더
function fakeBuilder(result = { data: [], error: null }) {
  const calls = [];
  const builder = new Proxy({}, {
    get(_, name) {
      if (name === 'then') return (resolve) => resolve(result);
      if (name === 'calls') return calls;
      return (...args) => { calls.push([name, ...args]); return builder; };
    }
  });
  return builder;
}
function fakeClient(result) {
  const b = fakeBuilder(result);
  return { client: { from: (t) => { b.calls.push(['from', t]); return b; } }, calls: b.calls };
}

test('엔티티 이름을 테이블 이름으로 바꾼다', () => {
  assert.equal(tableFor('Company'), 'company');
  assert.equal(tableFor('EmployeeProfile'), 'employee_profile');
  assert.equal(tableFor('PackageModule'), 'package_module');
  assert.throws(() => tableFor('Company; drop table x'));
});

test('날짜 범위 필터 $gte/$lte', () => {
  const nodes = queryToNodes({ branch_id: 'b1', date: { $gte: '2026-01-01', $lte: '2026-01-07' } });
  assert.deepEqual(nodes.map((n) => [n.col, n.op, n.val]), [
    ['branch_id', 'eq', 'b1'], ['date', 'gte', '2026-01-01'], ['date', 'lte', '2026-01-07']
  ]);
});

test('$ne 는 null 인 행도 포함한다 (MongoDB 동작과 동일)', () => {
  const [node] = queryToNodes({ deactivated: { $ne: true } });
  assert.equal(nodeToString(node), 'or(deactivated.neq.true,deactivated.is.null)');
});

test('$in 은 따옴표와 쉼표를 안전하게 처리한다', () => {
  const [node] = queryToNodes({ status: { $in: ['draft', 'a,b'] } });
  assert.equal(nodeToString(node), 'status.in.("draft","a,b")');
});

test('$or + $regex 검색 (직원 검색 화면)', () => {
  const [node] = queryToNodes({
    $or: [
      { full_name: { $regex: 'kim', $options: 'i' } },
      { employee_number: { $regex: 'kim', $options: 'i' } }
    ]
  });

  assert.equal(nodeToString(node), 'or(full_name.ilike."*kim*",employee_number.ilike."*kim*")');
});

test('escapeRegex 로 이스케이프된 검색어와 LIKE 특수문자', () => {
  const [node] = queryToNodes({ name: { $regex: 'a\\.b_c%', $options: 'i' } });
  assert.equal(node.val, '*a.b\\_c\\%*');
});

test('컬럼 이름에 이상한 문자가 있으면 거부한다 (주입 방지)', () => {
  assert.throws(() => queryToNodes({ 'a,b.eq.1': 'x' }));
  assert.throws(() => parseSort('created_date;drop'));
});

test('지원하지 않는 연산자는 거부한다', () => {
  assert.throws(() => queryToNodes({ a: { $where: 'x' } }));
  assert.throws(() => queryToNodes({ $nor: [] }));
});

test('정렬 파싱', () => {
  assert.deepEqual(parseSort('-created_date'), [{ col: 'created_date', ascending: false }]);
  assert.deepEqual(parseSort('date,-id'), [
    { col: 'date', ascending: true }, { col: 'id', ascending: false }
  ]);
});

test('filter + 옵션 → 페이지 객체와 다음 커서', async () => {
  const rows = [{ id: '1' }, { id: '2' }, { id: '3' }]; // limit 2 + 1개 더 읽음
  const { client, calls } = fakeClient({ data: rows, error: null });
  const result = await runEntityOp(client, 'Job', 'filter', {
    query: { branch_id: 'b1' }, options: { sort: '-created_date', limit: 2 }
  });
  assert.deepEqual(result, { items: rows.slice(0, 2), next_cursor: '2', has_more: true });
  assert.deepEqual(calls.find((c) => c[0] === 'range'), ['range', 0, 2]);
  assert.deepEqual(calls.find((c) => c[0] === 'from'), ['from', 'job']);
});

test('filter 옵션 없이 호출하면 배열을 돌려준다', async () => {
  const { client } = fakeClient({ data: [{ id: '1' }], error: null });
  const result = await runEntityOp(client, 'Branch', 'filter', { query: { company_id: 'c1' } });
  assert.deepEqual(result, [{ id: '1' }]);
});

test('aggregate groupBy → { rows: [{키, count}] }', async () => {
  const data = [{ job_id: 'a' }, { job_id: 'a' }, { job_id: 'b' }, { job_id: null }];
  const { client } = fakeClient({ data, error: null });
  const result = await runEntityOp(client, 'Applicant', 'aggregate', { query: { branch_id: 'b1' }, groupBy: 'job_id' });
  assert.deepEqual(result.rows, [
    { job_id: 'a', count: 2 }, { job_id: 'b', count: 1 }, { job_id: null, count: 1 }
  ]);
  assert.equal(result.truncated, false);
});

test('create 는 id / 생성시각 / 만든 사람을 채운다', async () => {
  const { client, calls } = fakeClient({ data: { id: 'x' }, error: null });
  await runEntityOp(client, 'Shift', 'create', { data: { date: '2026-01-01' } }, { createdById: 'u1' });
  const row = calls.find((c) => c[0] === 'insert')[1];
  assert.match(row.id, /^[0-9a-f]{24}$/);
  assert.equal(row.created_by_id, 'u1');
  assert.ok(row.created_date && row.updated_date);
});

test('update 는 $set 형태를 풀고 id 변경을 막으며, 다른 $연산자는 거부한다', async () => {
  const { client, calls } = fakeClient({ data: { id: '1' }, error: null });
  await runEntityOp(client, 'Shift', 'update', { id: '1', data: { $set: { status: 'published', id: 'hack' } } });
  const patch = calls.find((c) => c[0] === 'update')[1];
  assert.equal(patch.status, 'published');
  assert.equal(patch.id, undefined);
  await assert.rejects(() => runEntityOp(client, 'Shift', 'update', { id: '1', data: { $inc: { a: 1 } } }));
});

test('updateMany / deleteMany 는 빈 조건이면 거부한다 (전체 삭제 방지)', async () => {
  const { client } = fakeClient();
  await assert.rejects(() => runEntityOp(client, 'Shift', 'deleteMany', { query: {} }));
  await assert.rejects(() => runEntityOp(client, 'Shift', 'updateMany', { query: {}, data: { status: 'x' } }));
});

test('DB 오류는 예외로 올린다', async () => {
  const { client } = fakeClient({ data: null, error: { message: 'boom', code: '42501' } });
  await assert.rejects(() => runEntityOp(client, 'Job', 'count', { query: {} }), /boom/);
});
