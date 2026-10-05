import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendWebPush, vapidKeys } from '../../shared/webpush.ts';

function itemsOf(page: any) {
  return (page && page.items) || [];
}

function safeOrigin(value: any) {
  const raw = String(value || '');
  return /^https?:\/\/[a-z0-9.-]+(:[0-9]{2,5})?$/i.test(raw) ? raw.slice(0, 120) : '';
}

function devicesOf(rows: any[]) {
  return rows.map((row: any) => ({
    id: row.id,
    device_label: row.device_label || row.platform || '',
    platform: row.platform || '',
    endpoint: row.endpoint || '',
    active: row.active !== false,
    last_success_at: row.last_success_at || '',
    last_error: row.last_error || '',
    created_date: row.created_date || ''
  }));
}

// Everything behind turning phone alerts on: the app's public push key, this phone's
// subscription, the list of phones, and a test alert the person can send to themselves.
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'key') {
      const keys = await vapidKeys(base44, safeOrigin(body.origin));
      return Response.json({ public_key: keys.public_key });
    }

    if (action === 'subscribe') {
      const endpoint = String(body.endpoint || '').slice(0, 800);
      const p256dh = String(body.p256dh || '').slice(0, 200);
      const auth = String(body.auth || '').slice(0, 80);
      if (!endpoint || !p256dh || !auth) {
        return Response.json({ error: 'missing_fields' }, { status: 400 });
      }

      // Same phone, same subscription: refresh it rather than adding a duplicate row.
      const existing = itemsOf(
        await base44.entities.PushSubscription.filter({ endpoint }, { limit: 1 })
      )[0];

      const record: any = {
        user_email: me.email,
        endpoint,
        p256dh,
        auth,
        active: true,
        failure_count: 0,
        last_error: '',
        device_label: String(body.device_label || '').slice(0, 60),
        platform: String(body.platform || '').slice(0, 60),
        user_agent: String(body.user_agent || '').slice(0, 200),
        locale: body.locale === 'ko' ? 'ko' : 'en',
        company_id: String(me.company_id || ''),
        branch_id: String((me.branch_ids || [])[0] || '')
      };

      if (existing) await base44.entities.PushSubscription.update(existing.id, record);
      else await base44.entities.PushSubscription.create(record);

      return Response.json({ ok: true });
    }

    if (action === 'unsubscribe') {
      const endpoint = String(body.endpoint || '').slice(0, 800);
      await base44.entities.PushSubscription.deleteMany(
        endpoint ? { user_email: me.email, endpoint } : { user_email: me.email }
      );
      return Response.json({ ok: true });
    }

    if (action === 'remove') {
      const id = String(body.id || '');
      if (!id) return Response.json({ error: 'missing_id' }, { status: 400 });
      await base44.entities.PushSubscription.delete(id);
      return Response.json({ ok: true });
    }

    if (action === 'status') {
      const rows = itemsOf(
        await base44.entities.PushSubscription.filter(
          { user_email: me.email },
          { sort: '-created_date', limit: 20 }
        )
      );
      return Response.json({ devices: devicesOf(rows) });
    }

    if (action === 'test') {
      const sent = await sendWebPush(base44, {
        recipients: [
          {
            email: me.email,
            title: String(body.title || 'K-Workmate').slice(0, 120),
            body: String(body.body || '').slice(0, 300)
          }
        ],
        link: '/roster',
        tag: 'kworkmate-test'
      });
      return Response.json({ ok: true, sent });
    }

    return Response.json({ error: 'unknown_action' }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}