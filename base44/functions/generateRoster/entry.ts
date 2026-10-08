import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildDraft, startOfWeekIso } from '../../shared/roster.ts';
import { resolveCaller } from '../../shared/kwAuth.ts';

// Builds a draft week from the store's saved shift patterns, submitted availability and work
// rules, and files it as draft shifts for the manager to confirm and send.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // Either door the employer signed in through answers here: the ID their employer issued, or a
    // platform account.
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Sign-in required' }, { status: 401 });

    const body = await req.json();
    const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id).catch(() => null);
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });
    const allowed = me.role === 'admin' || (Array.isArray(me.branch_ids) && me.branch_ids.includes(branch.id));
    if (!allowed) return Response.json({ error: 'You cannot manage this branch' }, { status: 403 });

    const result = await buildDraft(base44, branch, startOfWeekIso(body.week_start));
    if (result.error === 'no_settings') {
      return Response.json({ error: 'no_settings' }, { status: 400 });
    }
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}