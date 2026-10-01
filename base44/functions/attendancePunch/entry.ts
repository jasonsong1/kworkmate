import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { haversineMeters } from '../../shared/util.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const branchId = body.branch_id;
    const action = body.action === 'out' ? 'out' : 'in';
    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!branchId) return Response.json({ error: 'branch_id is required' }, { status: 400 });
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return Response.json({ ok: false, error: 'location_unavailable' });
    }
    if (!me.branch_ids || !me.branch_ids.includes(branchId)) {
      return Response.json({ error: 'You are not assigned to this store' }, { status: 403 });
    }

    const branch = await base44.asServiceRole.entities.Branch.get(branchId).catch(() => null);
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });

    const hasStoreGps = Number(branch.gps_lat) !== 0 || Number(branch.gps_lng) !== 0;
    const radius = Number(branch.gps_radius_m) || 100;
    const distance = hasStoreGps ? haversineMeters(Number(branch.gps_lat), Number(branch.gps_lng), lat, lng) : null;

    if (hasStoreGps && distance !== null && distance > radius) {
      return Response.json({ ok: false, outside_radius: true, distance, radius });
    }

    const active = await base44.asServiceRole.entities.TimeEntry.filter({ employee_email: me.email, status: 'active' });
    const now = new Date();
    const nowIso = now.toISOString();

    if (action === 'in') {
      if (active.length > 0) {
        return Response.json({ ok: false, already_active: true, entry: active[0], distance, radius });
      }
      const today = nowIso.slice(0, 10);
      const shifts = await base44.asServiceRole.entities.Shift.filter({
        branch_id: branchId,
        employee_email: me.email,
        date: today
      });
      const shift = shifts.length > 0 ? shifts[0] : null;

      const entry = await base44.asServiceRole.entities.TimeEntry.create({
        company_id: branch.company_id,
        branch_id: branchId,
        employee_email: me.email,
        employee_name: me.full_name || me.email,
        shift_id: shift ? shift.id : '',
        clock_in_at: nowIso,
        clock_in_lat: lat,
        clock_in_lng: lng,
        clock_in_distance_m: distance === null ? 0 : distance,
        scheduled_start: shift ? shift.start_time : '',
        scheduled_end: shift ? shift.end_time : '',
        geo_verified: Boolean(hasStoreGps && distance !== null && distance <= radius),
        status: 'active'
      });
      return Response.json({ ok: true, action: 'in', entry, distance, radius, scheduled_start: shift ? shift.start_time : null });
    }

    if (active.length === 0) {
      return Response.json({ ok: false, not_clocked_in: true, distance, radius });
    }

    const entry = active[0];
    const started = new Date(entry.clock_in_at);
    const minutes = Math.max(0, Math.round((now.getTime() - started.getTime()) / 60000));

    const updated = await base44.asServiceRole.entities.TimeEntry.update(entry.id, {
      clock_out_at: nowIso,
      clock_out_lat: lat,
      clock_out_lng: lng,
      clock_out_distance_m: distance === null ? 0 : distance,
      minutes,
      status: 'completed'
    });

    return Response.json({ ok: true, action: 'out', entry: updated, minutes, distance, radius });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}