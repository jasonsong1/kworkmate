// Building a week of shifts out of the store's own settings: the shift patterns it runs, how many
// people it needs for each position, the team's submitted availability, visa work limits, the
// people the employer pinned to a day, and the minimum rest between shifts. Open positions come
// back as warnings instead of being silently dropped.
import { weeklyHourCap } from './visa.ts';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

function toMin(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The Monday of the week a date belongs to.
export function startOfWeekIso(iso) {
  const d = new Date(`${iso || new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// The Monday the next roster is built for: the week that has not started yet.
export function comingMondayIso(today = new Date().toISOString().slice(0, 10)) {
  const start = startOfWeekIso(today);
  return start === today ? start : addDays(start, 7);
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

const lower = (value) => String(value === null || value === undefined ? '' : value).trim().toLowerCase();

// Builds one week's draft for a store and files it as draft shifts. The answer says what was
// placed and what is still open, so the screen can say so. `{ error: 'no_settings' }` comes back
// when the store has not set its shifts or headcount yet.
export async function buildDraft(base44, branch, weekStart) {
  const weekEnd = addDays(weekStart, 6);

  const [settingPage, staffPage, subPage] = await Promise.all([
    base44.asServiceRole.entities.RosterSetting.filter({ branch_id: branch.id }, { limit: 1 }),
    base44.asServiceRole.entities.EmployeeProfile.filter({ branch_id: branch.id, status: 'active' }, { limit: 500 }),
    base44.asServiceRole.entities.AvailabilitySubmission.filter(
      { branch_id: branch.id },
      { sort: '-created_date', limit: 500 }
    )
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
    return { error: 'no_settings' };
  }
  const minRest = Number(setting.min_rest_hours) >= 0 ? Number(setting.min_rest_hours) : 10;

  // The people the employer pinned to a weekday are placed first, whatever their submitted
  // availability says, and the rest of that day's headcount is filled around them.
  const fixedByDay = {};
  for (const row of setting && Array.isArray(setting.fixed_staff) ? setting.fixed_staff : []) {
    const day = Number(row && row.day);
    const email = lower(row && row.email);
    if (!Number.isInteger(day) || day < 0 || day > 6 || !email) continue;
    fixedByDay[day] = fixedByDay[day] || new Set();
    fixedByDay[day].add(email);
  }

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

      const fixedHere = Boolean(fixedByDay[dayIndex] && fixedByDay[dayIndex].has(lower(email)));
      // A fixed placement is the employer's own instruction, so it does not wait on a submitted
      // availability window; everyone else has to be free for the whole shift.
      const window = availableWindow(availByEmail[email], dayKey);
      if (!fixedHere && (!window || window.from > start || window.to < end)) continue;

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

      candidates.push({
        email,
        name: person.full_name,
        used: assignedMinutes[email] || 0,
        primary: person.position === req.position,
        fixed: fixedHere
      });
    }

    // The pinned people come first, then fairness — fewest hours so far — and then main position.
    candidates.sort(
      (a, b) =>
        (b.fixed ? 1 : 0) - (a.fixed ? 1 : 0) ||
        a.used - b.used ||
        (b.primary ? 1 : 0) - (a.primary ? 1 : 0) ||
        a.email.localeCompare(b.email)
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
      intervals[pick.email] = [
        ...(intervals[pick.email] || []),
        { start: absMinutes(date, start), end: absMinutes(date, end) }
      ];
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

  return { week_start: weekStart, assigned: draft.length, unassigned, on_leave: leaveSkips };
}