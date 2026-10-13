// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/notifyShiftChange/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { employeeRecipients, languageMap, notifyStaff } from '../_shared/notify.ts';
import { shiftChangedMail } from '../_shared/employeeMail.ts';

// One shift moved. The person on it is told in the app and by email, and their subscribed
// calendar picks the change up on its next refresh because the feed is built from the roster.
async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const change = ['created', 'updated', 'cancelled'].includes(body.change) ? body.change : '';
    // Only a shift already out to staff is worth a phone alert: draft edits stay quiet.
    const published = body.published === true;
    const email = String(body.employee_email || '');
    const branchId = String(body.branch_id || '');
    if (!change || !email || !branchId) {
      return Response.json({ error: 'missing_fields' }, { status: 400 });
    }

    const branch = await base44.asServiceRole.entities.Branch.get(branchId).catch(() => null);
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });
    const manages = me.role === 'admin' || (Array.isArray(me.branch_ids) && me.branch_ids.includes(branchId));
    if (!manages) return Response.json({ error: 'You cannot manage this roster' }, { status: 403 });

    const company = branch.company_id
      ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null)
      : null;

    const when = body.date
      ? `${body.date} · ${body.start_time || ''}–${body.end_time || ''}`
      : '';
    const languages = await languageMap(base44, branchId);
    const recipients = await employeeRecipients(base44, [email], languages);
    if (recipients.length === 0) return Response.json({ ok: true, notified: 0 });

    const title =
      change === 'created'
        ? 'New shift added'
        : change === 'cancelled'
          ? 'Shift cancelled'
          : 'Shift changed';

    const result = await notifyStaff(base44, {
      company,
      branch,
      recipients,
      type: `shift_${change}`,
      title: `${title} · ${branch.name}`,
      body: `${when}${body.position ? ` · ${body.position}` : ''}`,
      link: '/roster',
      push: published,
      mail: (lang: string) =>
        shiftChangedMail(lang, {
          name: recipients[0].name,
          branchName: branch.name,
          change,
          lines: [
            `<b>${when}</b>${body.position ? ` · ${body.position}` : ''}`
          ]
        })
    });

    return Response.json({ ok: true, ...result });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
