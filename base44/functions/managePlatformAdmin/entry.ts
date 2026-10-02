import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Super admins are the app's own platform admins, so only one of them may manage the list.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') {
      return Response.json({ error: 'Only a super admin can manage super admins' }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action || 'search';

    if (action === 'search') {
      const term = String(body.query || '').trim();
      const filter = term ? { email: { $regex: escapeRegex(term), $options: 'i' } } : {};
      // App users have no paginated endpoint, so filter on the server and cap the list here.
      const matches = await base44.asServiceRole.entities.User.filter(filter);
      const users = matches.slice(0, 25).map((user) => ({
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      }));
      return Response.json({ ok: true, users });
    }

    if (!body.user_id) return Response.json({ error: 'user_id is required' }, { status: 400 });

    const target = await base44.asServiceRole.entities.User.get(body.user_id).catch(() => null);
    if (!target) return Response.json({ error: 'User not found' }, { status: 404 });

    if (action === 'grant') {
      await base44.asServiceRole.entities.User.update(target.id, { role: 'admin' });
      return Response.json({ ok: true, role: 'admin' });
    }

    if (action === 'revoke') {
      if (target.id === me.id) {
        return Response.json({ error: 'You cannot remove your own super admin access' }, { status: 400 });
      }
      const admins = await base44.asServiceRole.entities.User.filter({ role: 'admin' });
      if (admins.length <= 1) {
        return Response.json({ error: 'Keep at least one super admin' }, { status: 400 });
      }
      await base44.asServiceRole.entities.User.update(target.id, { role: 'user' });
      return Response.json({ ok: true, role: 'user' });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}