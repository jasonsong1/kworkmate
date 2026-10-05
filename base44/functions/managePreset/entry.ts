import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { normalizeAccess } from '../../shared/access.ts';

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// Position presets are the platform's own table: only a super admin writes one, and an edit
// is stored as an override that wins over the built-in definition.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') {
      return Response.json({ error: 'Only a super admin can change position presets' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'save');

    // How many companies and roles would an edit to this preset reach?
    if (action === 'usage') {
      const key = String(body.key || '');
      const rows = rowsOf(await base44.asServiceRole.entities.Company.list({ limit: 500 }).catch(() => []));
      let companies = 0;
      let roles = 0;
      rows.forEach((company) => {
        const linked = (company.custom_roles || []).filter((role) => role && role.preset_key === key);
        if (linked.length > 0) {
          companies += 1;
          roles += linked.length;
        }
      });
      return Response.json({ ok: true, companies, roles });
    }

    const key = String(body.key || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!key) return Response.json({ error: 'A preset needs a key' }, { status: 400 });

    // One access name per preset: it is written to the new field and mirrored onto the two old
    // name fields, so anything still reading those shows the same name.
    const label = String(body.label || body.label_en || '').trim() || key;
    const payload = {
      key,
      label,
      label_en: label,
      label_ko: label,
      order: Number(body.order) || 10,
      access: normalizeAccess(body.access || {})
    };

    const existing = rowsOf(await base44.asServiceRole.entities.PositionPreset.filter({ key }))[0];
    if (existing) {
      await base44.asServiceRole.entities.PositionPreset.update(existing.id, payload);
    } else {
      await base44.asServiceRole.entities.PositionPreset.create(payload);
    }

    return Response.json({ ok: true, preset: payload, created: !existing });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}