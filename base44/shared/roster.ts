// Building a week of shifts out of the store's own settings, in the order a store thinks about it:
//
//  1. the store's own demand — its shift patterns and the headcount each day and position needs;
//  2. the people the employer pinned to a weekday: they are nailed into the week first, and then
//     left out of the rest of that day's sums so nobody is planned twice;
//  3. the team's submitted availability for what is still open, with a full-time contract served
//     before a part-time one and a part-time one before spare casual hours, visa limits respected,
//     and the minimum rest between shifts never broken;
//  4. whatever nobody can take comes back as an open shift instead of being quietly dropped, so
//     the screen can mark it and the manager decides.
//
// Re-planning a week keeps that week's saved and sent shifts exactly where they are: they count
// against the day's headcount, so pressing the AI roster button again fills the gaps without ever
// planning more people on a day than the store asked for.
import { visaKey } from './visa.ts';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// A full working week in Australia, and the hours a student visa allows across a fortnight.
const FULL_TIME_WEEKLY_HOURS = 38;
const STUDENT_FORTNIGHT_HOURS = 48;

// A contract is served before spare hours are handed out.
const EMPLOYMENT_RANK = { full_time: 0, part_time: 1, casual: 2 };

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

function lengthOf(shift) {
  const start = toMin(shift && shift.start_time);
  const end = toMin(shift && shift.end_time);
  if (start === null || end === null || end <= start) return 0;
  return end - start;
}

// How much of this person's allowance is still free in the week being built. A full-time
// contract may not be planned past a 38 hour week, and a student visa may not be planned past
// 48 hours across the fortnight — the week before this one is already part of that sum.
function remainingMinutes(person, weekMinutes, earlierMinutes) {
  let cap = lower(person.employment_type) === 'full_time' ? FULL_TIME_WEEKLY_HOURS * 60 : null;
  if (visaKey(person.visa_type) === 'student') {
    const fortnight = STUDENT_FORTNIGHT_HOURS * 60 - earlierMinutes;
    cap = cap === null ? fortnight : Math.min(cap, fortnight);
  }
  return cap === null ? null : cap - weekMinutes;
}

// Builds one week's draft for a store and files it as draft shifts. The answer says what was
// placed and what is still open, so the screen can say so. `{ error: 'no_settings' }` comes back
// when the store has not set its shifts or headcount yet.
export async function buildDraft(base44, branch, weekStart) {
  const weekEnd = addDays(weekStart, 6);
  const fortnightStart = addDays(weekStart, -7);

  const [settingPage, staffPage, subPage, earlierPage, leavePage, weekPage] = await Promise.all([
    base44.asServiceRole.entities.RosterSetting.filter({ branch_id: branch.id }, { limit: 1 }),
    base44.asServiceRole.entities.EmployeeProfile.filter({ branch_id: branch.id, status: 'active' }, { limit: 500 }),
    base44.asServiceRole.entities.AvailabilitySubmission.filter(
      { branch_id: branch.id },
      { sort: '-created_date', limit: 500 }
    ),
    // The week before this one: what a student visa holder was already given there is part of
    // the fortnight's allowance.
    base44.asServiceRole.entities.Shift
      .filter({ branch_id: branch.id, date: { $gte: fortnightStart, $lte: addDays(weekStart, -1) } }, { limit: 500 })
      .catch(() => []),
    // Anyone with approved leave in this week is away, so the builder never plans them in.
    base44.asServiceRole.entities.LeaveRequest.filter(
      {
        branch_id: branch.id,
        status: 'approved',
        start_date: { $lte: weekEnd },
        end_date: { $gte: weekStart }
      },
      { limit: 500 }
    ),
    // Shifts this week that were already saved or sent are the manager's own decisions: they are
    // counted against the day's demand and left where they are.
    base44.asServiceRole.entities.Shift
      .filter(
        { branch_id: branch.id, date: { $gte: weekStart, $lte: weekEnd }, status: { $in: ['saved', 'published'] } },
        { limit: 500 }
      )
      .catch(() => [])
  ]);

  const leaveRanges = rowsOf(leavePage)
    .filter((row) => row && row.employee_email)
    .map((row) => ({
      email: row.employee_email,
      start: String(row.start_date || '').slice(0, 10),
      end: String(row.end_date || row.start_date || '').slice(0, 10)
    }));
  const onLeave = (email, date) =>
    leaveRanges.some((range) => range.email === email && date >= range.start && date <= range.end);

  const earlierMinutes = {};
  rowsOf(earlierPage).forEach((shift) => {
    if (!shift || !shift.employee_email) return;
    earlierMinutes[shift.employee_email] = (earlierMinutes[shift.employee_email] || 0) + lengthOf(shift);
  });

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

  // What the week already holds, counted per day and position.
  const keptShifts = rowsOf(weekPage).filter((shift) => shift && shift.employee_email);
  const keptByDayPosition = {};
  for (const shift of keptShifts) {
    const key = `${String(shift.date || '').slice(0, 10)}|${lower(shift.position)}`;
    keptByDayPosition[key] = (keptByDayPosition[key] || 0) + 1;
  }

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
  // A person the employer pinned to a day is not planned again on that day.
  const pinnedPlaced = {};

  // Somebody already on a saved or sent shift in this week is counted in, and is not planned
  // again on that day.
  for (const shift of keptShifts) {
    const date = String(shift.date || '').slice(0, 10);
    const start = toMin(shift.start_time);
    const end = toMin(shift.end_time);
    assignedMinutes[shift.employee_email] = (assignedMinutes[shift.employee_email] || 0) + lengthOf(shift);
    pinnedPlaced[`${shift.employee_email}|${date}`] = true;
    if (start === null || end === null || end <= start) continue;
    intervals[shift.employee_email] = [
      ...(intervals[shift.employee_email] || []),
      { start: absMinutes(date, start), end: absMinutes(date, end) }
    ];
  }
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
    // Saved and sent shifts already cover part of what this day and position needs.
    const already = keptByDayPosition[`${date}|${lower(req.position)}`] || 0;
    const need = Math.max(0, (Number(req.count) || 0) - already);

    const candidates = [];
    for (const person of staff) {
      const email = person.user_email;
      if (!email) continue;
      // The person's own position, or the one they can cover as well: the second is how a hole
      // is filled when nobody in the first position is free.
      const positions = [person.position, person.secondary_position].filter(Boolean);
      if (!positions.includes(req.position)) continue;

      if (onLeave(email, date)) {
        leaveSkips += 1;
        continue;
      }
      if (pinnedPlaced[`${email}|${date}`]) continue;

      const fixedHere = Boolean(fixedByDay[dayIndex] && fixedByDay[dayIndex].has(lower(email)));
      // A fixed placement is the employer's own instruction, so it does not wait on a submitted
      // availability window; everyone else has to be free for the whole shift.
      const window = availableWindow(availByEmail[email], dayKey);
      if (!fixedHere && (!window || window.from > start || window.to < end)) continue;

      const room = remainingMinutes(person, assignedMinutes[email] || 0, earlierMinutes[email] || 0);
      if (room !== null && lengthMin > room) continue;

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
        rank: EMPLOYMENT_RANK[lower(person.employment_type)] ?? EMPLOYMENT_RANK.casual,
        primary: person.position === req.position,
        fixed: fixedHere
      });
    }

    // The pinned people come first, then a full-time contract before a part-time one and a
    // part-time one before casual hours, then fairness — fewest hours so far — then main position.
    candidates.sort(
      (a, b) =>
        (b.fixed ? 1 : 0) - (a.fixed ? 1 : 0) ||
        a.rank - b.rank ||
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
      if (pick.fixed) pinnedPlaced[`${pick.email}|${date}`] = true;
      filled += 1;
    }

    // Nobody free: the shift stays open rather than being given to somebody who cannot take it.
    if (filled < need) {
      unassigned.push({
        date,
        day: DAY_KEYS[dayIndex],
        shift: template.label || req.shift_key,
        position: req.position,
        start_time: template.start_time,
        end_time: template.end_time,
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