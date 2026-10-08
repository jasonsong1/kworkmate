import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { weeklyHourCap } from '../../shared/visa.ts';
import { resolveCaller } from '../../shared/kwAuth.ts';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

function toMin(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfWeekIso(iso) {
  const d = new Date(`${iso || new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// The window a person said they can work on one day, in minutes from midnight.
function availableWindow(matrix, dayKey) {
  const day = matrix && matrix[dayKey];
  if (!day) return null;
  const from = toMin(day.from);
  const to = toMin(day.to);
  if (from === null || to === null || to <= from) return null;
  return { from, to };
}

function absMinutes(dateIso, minutes) {
  return Date.parse(`${dateIso}T00:00:00Z`) / 60000 + minutes;
}

// Builds a draft week from the store's required headcount, the team's submitted availability,
// visa work limits and the minimum rest between shifts. Open positions come back as warnings.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    // Either door the employer signed in through answers here: the ID their employer issued, or a
    // platform account.
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Sign-in required' }, { status: 401 });

    const body = await req.json();
    const weekStart = startOfWeekIso(body.week_start);
    const weekEnd = addDays(weekStart, 6);

    const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id).catch(() => null);
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });
    const allowed = me.role === 'admin' || (Array.isArray(me.branch_ids) && me.branch_ids.includes(branch.id));
    if (!allowed) return Response.json({ error: 'You cannot manage this branch' }, { status: 403 });

    const [settingPage, staffPage, subPage] = await Promise.all([
      base44.asServiceRole.entities.RosterSetting.filter({ branch_id: branch.id }, { limit: 1 }),
      base44.asServiceRole.entities.EmployeeProfile.filter({ branch_id: branch.id, status: 'active' }, { limit: 500 }),
      base44.asServiceRole.entities.AvailabilitySubmission.filter({ branch_id: branch.id }, { sort: '-created_date', limit: 500 })
    ]);

    // Anyone with approved leave in this week is away, so the builder never plans them in.
    const leavePage = await base44.asServiceRole.entities.LeaveRequest.filter(
      {
        branch_id: branch.id,
        status: 'approved',
        start_date: { $lte: weekEnd },
        end_date: { $gte: weekStart }
      },
      { limit: 500 }
    );
    const leaveRanges = rowsOf(leavePage)
      .filter((row) => row && row.employee_email)
      .map((row) => ({
        email: row.employee_email,
        start: String(row.start_date || '').slice(0, 10),
        end: String(row.end_date || row.start_date || '').slice(0, 10)
      }));
    const onLeave = (email, date) =>
      leaveRanges.some((range) => range.email === email && date >= range.start && date <= range.end);

    const setting = rowsOf(settingPage)[0] || null;
    const staff = rowsOf(staffPage);
    const shifts = (setting && Array.isArray(setting.shifts) ? setting.shifts : []).filter(
      (s) => s && s.key && toMin(s.start_time) !== null && toMin(s.end_time) !== null
    );
    const requirements = (setting && Array.isArray(setting.requirements) ? setting.requirements : []).filter(
      (r) => r && Number(r.count) > 0
    );
    if (shifts.length === 0 || requirements.length === 0) {
      return Response.json({ error: 'no_settings' }, { status: 400 });
    }
    const minRest = Number(setting.min_rest_hours) >= 0 ? Number(setting.min_rest_hours) : 10;

    // Latest submitted availability per person wins.
    const availByEmail = {};
    for (const sub of rowsOf(subPage)) {
      if (!sub.employee_email || availByEmail[sub.employee_email]) continue;
      availByEmail[sub.employee_email] = sub.availability || {};
    }

    const shiftByKey = {};
    for (const shift of shifts) shiftByKey[shift.key] = shift;

    const assignedMinutes = {};
    const intervals = {};
    const draft = [];
    const unassigned = [];
    let leaveSkips = 0;

    const ordered = [...requirements].sort((a, b) => {
      if (Number(a.day) !== Number(b.day)) return Number(a.day) - Number(b.day);
      const sa = shiftByKey[a.shift_key];
      const sb = shiftByKey[b.shift_key];
      return (sa ? toMin(sa.start_time) : 0) - (sb ? toMin(sb.start_time) : 0);
    });

    for (const req of ordered) {
      const template = shiftByKey[req.shift_key];
      if (!template) continue;
      const start = toMin(template.start_time);
      const end = toMin(template.end_time);
      if (start === null || end === null || end <= start) continue;

      const dayIndex = Number(req.day);
      const date = addDays(weekStart, dayIndex);
      const dayKey = DAY_KEYS[dayIndex];
      const lengthMin = end - start;
      const need = Number(req.count) || 0;

      const candidates = [];
      for (const person of staff) {
        const email = person.user_email;
        if (!email) continue;
        const positions = [person.position, person.secondary_position].filter(Boolean);
        if (!positions.includes(req.position)) continue;

        if (onLeave(email, date)) {
          leaveSkips += 1;
          continue;
        }

        const window = availableWindow(availByEmail[email], dayKey);
        if (!window || window.from > start || window.to < end) continue;

        const cap = weeklyHourCap(person.visa_type);
        if (cap !== null && (assignedMinutes[email] || 0) + lengthMin > cap * 60) continue;

        const newStart = absMinutes(date, start);
        const newEnd = absMinutes(date, end);
        let allowed = true;
        for (const iv of intervals[email] || []) {
          const overlaps = newStart < iv.end && iv.start < newEnd;
          const gap = newStart >= iv.end ? newStart - iv.end : iv.start - newEnd;
          if (overlaps || gap < minRest * 60) {
            allowed = false;
            break;
          }
        }
        if (!allowed) continue;

        candidates.push({ email, name: person.full_name, used: assignedMinutes[email] || 0, primary: person.position === req.position });
      }

      // Fairness first: the people with the fewest hours so far, then their main position.
      candidates.sort(
        (a, b) => a.used - b.used || (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || a.email.localeCompare(b.email)
      );

      let filled = 0;
      for (const pick of candidates) {
        if (filled >= need) break;
        draft.push({
          company_id: branch.company_id,
          branch_id: branch.id,
          employee_email: pick.email,
          employee_name: pick.name,
          date,
          start_time: template.start_time,
          end_time: template.end_time,
          position: req.position,
          break_min: 0,
          status: 'draft',
          notes: ''
        });
        assignedMinutes[pick.email] = (assignedMinutes[pick.email] || 0) + lengthMin;
        intervals[pick.email] = [...(intervals[pick.email] || []), { start: absMinutes(date, start), end: absMinutes(date, end) }];
        filled += 1;
      }

      if (filled < need) {
        unassigned.push({
          date,
          shift: template.label || req.shift_key,
          position: req.position,
          missing: need - filled
        });
      }
    }

    // A fresh build replaces last time's draft; saved and published shifts are left alone.
    await base44.asServiceRole.entities.Shift.deleteMany({
      branch_id: branch.id,
      date: { $gte: weekStart, $lte: weekEnd },
      status: 'draft'
    });
    if (draft.length > 0) {
      await base44.asServiceRole.entities.Shift.bulkCreate(draft);
    }

    return Response.json({
      ok: true,
      week_start: weekStart,
      assigned: draft.length,
      unassigned,
      on_leave: leaveSkips
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}