// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/kwData/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import {
  accessFor,
  GATEWAY_ENTITIES,
  inScope,
  mergeScope,
  NO_ROWS,
  pickFields,
  resolveCaller,
  scopeData,
  scopeQuery,
  seal,
  writeMode
} from '../_shared/kwAuth.ts';

const READ_OPS = ['list', 'filter', 'get', 'count', 'aggregate'];
const ALL_OPS = [
  ...READ_OPS,
  'create',
  'bulkCreate',
  'update',
  'bulkUpdate',
  'updateMany',
  'delete',
  'deleteMany',
  'upsert'
];

function forbidden() {
  return Response.json({ error: 'That record belongs to somebody else' }, { status: 403 });
}

function ok(result) {
  return Response.json({ ok: true, result });
}

// The one door an employee-signed-in browser reaches the database through. The caller's scope is
// resolved on the server from their own record and written over whatever the browser sent, so a
// screen can neither widen nor escape it.
async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Sign-in required' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const entity = String(body.entity || '');
    const op = String(body.op || 'list');
    const rule = GATEWAY_ENTITIES[entity];
    if (!rule) return Response.json({ error: 'This screen is not open to this account' }, { status: 403 });
    if (!ALL_OPS.includes(op)) return Response.json({ error: 'Unknown operation' }, { status: 400 });

    // What the employer granted this person, resolved from the package, their position preset
    // and the grants saved for it — the same answer the screens were drawn from.
    const access = await accessFor(base44, me);
    const writes = writeMode(rule, access);
    if (!READ_OPS.includes(op) && writes === 'none') {
      return Response.json({ error: 'This account cannot change those records' }, { status: 403 });
    }

    const store = base44.asServiceRole.entities[entity];
    const scope = scopeQuery(me, rule, access);
    // An area the employer did not open to this person answers empty without reaching the
    // database at all: there are no rows here for them, so there is nothing to ask for.
    if (scope === NO_ROWS) {
      if (op === 'count') return ok(0);
      if (op === 'aggregate') return ok({ rows: [], truncated: false });
      if (READ_OPS.includes(op) && op !== 'get') return ok({ items: [], next_cursor: null, has_more: false });
      return forbidden();
    }
    // `existing` is the row a write lands on: an edit keeps the store that row already sits in,
    // so a save never moves a record into the branch whoever is editing happens to work in.
    const patch = (data, existing) =>
      writes === 'fields' ? pickFields(data, rule.staff_fields) : scopeData(me, rule, data, access, existing);

    switch (op) {
      case 'list': {
        const options = body.options || null;
        const result =
          Object.keys(scope).length === 0
            ? options
              ? await store.list(options)
              : await store.list()
            : options
              ? await store.filter({ ...scope }, options)
              : await store.filter({ ...scope });
        return ok(seal(entity, result));
      }
      case 'filter': {
        const options = body.options || null;
        const query = mergeScope(body.query, scope);
        const result = options ? await store.filter(query, options) : await store.filter(query);
        return ok(seal(entity, result));
      }
      case 'get': {
        const record = await store.get(String(body.id || '')).catch(() => null);
        if (!record || !inScope(record, scope)) return forbidden();
        return ok(seal(entity, record));
      }
      case 'count':
        return ok(await store.count(mergeScope(body.query, scope)));
      case 'aggregate':
        return ok(
          await store.aggregate({
            query: mergeScope(body.query, scope),
            groupBy: body.groupBy,
            dateBucket: body.dateBucket,
            sum: body.sum,
            avg: body.avg,
            min: body.min,
            max: body.max,
            countDistinct: body.countDistinct,
            having: body.having,
            sort: body.sort,
            limit: body.limit
          })
        );
      case 'create':
        return ok(seal(entity, await store.create(patch(body.data))));
      case 'bulkCreate':
        return ok(seal(entity, await store.bulkCreate((body.records || []).map(patch))));
      case 'update': {
        const id = String(body.id || '');
        const record = await store.get(id).catch(() => null);
        if (!record || !inScope(record, scope)) return forbidden();
        return ok(seal(entity, await store.update(id, patch(body.data, record))));
      }
      case 'bulkUpdate': {
        const records = body.records || [];
        const ids = records.map((record) => String(record.id || '')).filter(Boolean);
        const fields = rule.branch_field ? ['id', rule.branch_field] : ['id'];
        const allowed = await store
          .filter({ id: { $in: ids }, ...scope }, { limit: Math.min(ids.length, 500), fields })
          .catch(() => []);
        const allowedRows = Array.isArray(allowed) ? allowed : allowed.items || [];
        const held = new Map(allowedRows.map((row) => [row.id, row]));
        if (ids.some((id) => !held.has(id))) return forbidden();
        return ok(
          seal(
            entity,
            await store.bulkUpdate(records.map((record) => ({ id: record.id, ...patch(record, held.get(record.id)) })))
          )
        );
      }
      case 'updateMany': {
        // A bulk change to rows we do not hold one by one: each keeps the store it is already
        // filed under unless the change names the branch itself.
        const changes =
          body.data && body.data.$set
            ? { $set: patch(body.data.$set, null) }
            : patch(body.data, null);
        return ok(await store.updateMany(mergeScope(body.query, scope), changes));
      }
      case 'delete': {
        const id = String(body.id || '');
        const record = await store.get(id).catch(() => null);
        if (!record || !inScope(record, scope)) return forbidden();
        await store.delete(id);
        return ok(true);
      }
      case 'deleteMany':
        return ok(await store.deleteMany(mergeScope(body.query, scope)));
      case 'upsert':
        return ok(
          seal(entity, await store.upsert((body.records || []).map(patch), body.key ? { key: body.key } : undefined))
        );
      default:
        return Response.json({ error: 'Unknown operation' }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
