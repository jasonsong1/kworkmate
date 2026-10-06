import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveCaller } from '../../shared/kwAuth.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function randomString(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let index = 0; index < length; index += 1) {
    out += ALPHABET[bytes[index] % ALPHABET.length];
  }
  return out;
}

// The private address a person pastes into their phone calendar. It carries their employee
// number and eight random characters, so it is theirs alone and can be replaced at any time.
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const origin = String(
      body.origin || req.headers.get('origin') || ''
    ).replace(/\/+$/, '');
    const rotate = body.action === 'rotate';

    const profile = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: me.email }, { limit: 1 })
    )[0];
    const companyId = (profile && profile.company_id) || me.company_id || '';

    const existing = rowsOf(
      await base44.asServiceRole.entities.CalendarSubscription.filter({ user_email: me.email }, { limit: 1 })
    )[0];

    let record = existing;
    if (!record) {
      record = await base44.asServiceRole.entities.CalendarSubscription.create({
        company_id: companyId,
        user_email: me.email,
        employee_number: (profile && profile.employee_number) || '',
        token: `${(profile && profile.employee_number) || 'staff'}${randomString(8)}`,
        active: true,
        rotated_at: new Date().toISOString()
      });
    } else if (rotate) {
      record = await base44.asServiceRole.entities.CalendarSubscription.update(record.id, {
        token: `${(profile && profile.employee_number) || 'staff'}${randomString(8)}`,
        active: true,
        rotated_at: new Date().toISOString()
      });
    } else if (record.active === false) {
      record = await base44.asServiceRole.entities.CalendarSubscription.update(record.id, { active: true });
    }

    return Response.json({
      ok: true,
      token: record.token,
      url: origin ? `${origin}/functions/calendarFeed?token=${encodeURIComponent(record.token)}` : '',
      active: record.active !== false
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}