// Building a week of shifts out of the store's own settings, in the order a store thinks about it:
//
//  1. the store's own demand — its shift patterns and the headcount each day and position needs;
//  2. the people the employer pinned to a weekday: they are nailed into the week first, and the
//     rest of that day is filled around them, never past the shifts a day each person is allowed;
//  3. the team's submitted availability for what is still open — somebody free for both the
//     morning and the afternoon of a day is the store's split-shift person and is planned ahead of
//     somebody who can only take one of them — then a full-time contract before a part-time one and
//     a part-time one before spare casual hours, visa limits respected, and the minimum rest
//     between shifts never broken;
//  4. whatever nobody can take comes back as an open shift instead of being quietly dropped, so
//     the screen can mark it and the manager decides.
//
// Re-planning a week keeps that week's saved and sent shifts exactly where they are: they count
// against the day's headcount, so pressing the AI roster button again fills the gaps without ever
// planning more people on a day than the store asked for.
import { weeklyHourCap } from './visa.ts';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// A full working week in Australia, kept beside each visa's own weekly limit in visa.ts so the
// builder and the screens that quote it can never disagree. A full-time contract is 38 hours; a
// permanent (정규직) contract the employer agreed at 50 hours is planned up to that.
const CONTRACT_WEEKLY_HOURS = {
  full_time: 38,
  fulltime: 38,
  'full-time': 38,
  permanent: 50
};

// 고용 형태를 일관된 키로 정규화합니다.
export function normalizeEmploymentType(value) {
  const s = String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (s === 'fulltime' || s === '풀타임') return 'full_time';
  if (s === 'parttime' || s === '파트타임') return 'part_time';
  if (s === 'casual' || s === '캐주얼') return 'casual';
  if (s === 'permanent' || s === '정규직') return 'permanent';
  if (s === 'owner' || s === '오너') return 'owner';
  return String(value || '').trim().toLowerCase();
}

// How many days of one week a person is planned for, unless the store raised it for them.
const DEFAULT_MAX_DAYS = 5;

// How many shifts of one day a person is planned for, unless the store set their own number: two
// by default, so one person can take both the morning and the afternoon. Somebody the store put on
// one shift is never planned for that day's second shift — it goes to another person or stays open.
const DEFAULT_MAX_SHIFTS_PER_DAY = 2;

// A contract is served before spare hours are handed out.
const EMPLOYMENT_RANK = { full_time: 0, part_time: 1, casual: 2 };

// The person who runs the store. None of the limits the store sets for its crew — the contract
// and visa hours, the days a week and the shifts a day — are applied to an owner: whatever the
// week needs is open to them.
const UNLIMITED_EMPLOYMENT = ['owner', '오너'];

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

// How much of this person's allowance is still free in the week being built. A full-time contract
// may not be planned past a 38 hour week, and a visa with a weekly limit of its own — a student
// visa's 24 hours — is never planned past that, however the week is put together.
function remainingMinutes(person, weekMinutes) {
  const normType = normalizeEmploymentType(person.employment_type);
  if (UNLIMITED_EMPLOYMENT.includes(normType)) return null;
  const contractCap = CONTRACT_WEEKLY_HOURS[normType];
  const visaCap = weeklyHourCap(person.visa_type);
  const caps = [
    typeof contractCap === 'number' ? contractCap : null,
    typeof visaCap === 'number' ? visaCap : null
  ].filter((value) => typeof value === 'number');
  if (caps.length === 0) return null;
  return Math.min(...caps) * 60 - weekMinutes;
}

// Builds one week's draft for a store and files it as draft shifts. The answer says what was
// placed and what is still open, so the screen can say so. `{ error: 'no_settings' }` comes back
// when the store has not set its shifts or headcount yet.
export async function buildDraft(base44, branch, weekStart) {
  const weekEnd = addDays(weekStart, 6);

  const [settingPage, staffPage, subPage, leavePage, weekPage] = await Promise.all([
    base44.asServiceRole.entities.RosterSetting.filter({ branch_id: branch.id }, { limit: 1 }),
    base44.asServiceRole.entities.EmployeeProfile.filter({ branch_id: branch.id, status: 'active' }, { limit: 500 }),
    base44.asServiceRole.entities.AvailabilitySubmission.filter(
      { branch_id: branch.id },
      { sort: '-created_date', limit: 500 }
    ),
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

  const setting = rowsOf(settingPage)[0] || null;
  const staff = rowsOf(staffPage);
  // An owner is free of the week's hour, day and shift limits, so their address is looked up once
  // here and every cap below steps aside for them.
  const unlimitedStaff = new Set(
    staff
      .filter((person) => person && UNLIMITED_EMPLOYMENT.includes(lower(person.employment_type)))
      .map((person) => lower(person.user_email))
  );
  const shifts = (setting && Array.isArray(setting.shifts) ? setting.shifts : []).filter(
    (s) => s && s.key && toMin(s.start_time) !== null && toMin(s.end_time) !== null
  );

  // 지점의 영업시간(trading_hours)을 분석하여 실제 비즈니스를 운영하는 요일(0: Mon ~ 6: Sun)만 추출합니다.
  // 지점 설정에 없는 요일(예: 주말 휴무)은 시프트를 요구하지도 않고, 미배정 에러도 생성하지 않습니다.
  const operatingDays = (() => {
    const raw = String(branch?.trading_hours || '').trim();
    if (!raw) return null; // 별도 영업시간이 없으면 전체 요일 허용
    const dayMap = {
      mon: 0, monday: 0,
      tue: 1, tuesday: 1,
      wed: 2, wednesday: 2,
      thu: 3, thursday: 3,
      fri: 4, friday: 4,
      sat: 5, saturday: 5,
      sun: 6, sunday: 6
    };
    const days = new Set();
    const parts = raw.split('·').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const match = part.match(/^([a-zA-Z]+)/);
      if (match) {
        const key = match[1].toLowerCase();
        if (dayMap[key] !== undefined) days.add(dayMap[key]);
      }
    }
    return days.size > 0 ? days : null;
  })();

  const requirements = (setting && Array.isArray(setting.requirements) ? setting.requirements : [])
    .filter((r) => r && Number(r.count) > 0)
    .filter((r) => !operatingDays || operatingDays.has(Number(r.day)));
  if (shifts.length === 0 || requirements.length === 0) {
    return { error: 'no_settings' };
  }
  const minRest = Number(setting.min_rest_hours) >= 0 ? Number(setting.min_rest_hours) : 10;
  // A week is five days by default. The people the store agreed more with carry their own number,
  // set beside the shift patterns, and everybody else keeps the default.
  const maxDaysDefault = Number(setting.max_days_per_week) > 0 ? Number(setting.max_days_per_week) : DEFAULT_MAX_DAYS;
  const daysOverrideByEmail = {};
  for (const row of Array.isArray(setting.day_overrides) ? setting.day_overrides : []) {
    const email = lower(row && row.email);
    const days = Number(row && row.max_days);
    if (!email || !(days > 0)) continue;
    daysOverrideByEmail[email] = days;
  }
  const dayCapFor = (email, person) => {
    const e = lower(email);
    // 1순위: 관리자가 직접 개별 직원에게 설정한 주당 근무일수 오버라이드 (오너 포함 철저 적용)
    if (typeof daysOverrideByEmail[e] === 'number' && daysOverrideByEmail[e] > 0) {
      return daysOverrideByEmail[e];
    }
    // 2순위: 풀타임(38시간) 및 정규직(50시간) 직원은 주당 계약 시간을 충족할 수 있도록 최대 6일까지 유연하게 배정
    const empType = person ? normalizeEmploymentType(person.employment_type) : '';
    if (empType === 'full_time' || empType === 'permanent') {
      return Math.max(maxDaysDefault, 6);
    }
    // 3순위: 기본 매장 설정 일수 (기본 5일, 오너라 하더라도 설정된 한도 내에서만 근무)
    return maxDaysDefault;
  };

  // Two shifts a day is the store's standing answer; the people it agreed otherwise with carry
  // their own number and everybody else keeps the default.
  const maxShiftsDefault =
    Number(setting.max_shifts_per_day) > 0 ? Number(setting.max_shifts_per_day) : DEFAULT_MAX_SHIFTS_PER_DAY;
  const shiftsOverrideByEmail = {};
  for (const row of Array.isArray(setting.shift_overrides) ? setting.shift_overrides : []) {
    const email = lower(row && row.email);
    const shifts = Number(row && row.max_shifts);
    if (!email || !(shifts > 0)) continue;
    shiftsOverrideByEmail[email] = shifts;
  }
  const shiftCapFor = (email) => {
    const e = lower(email);
    // 관리자가 특정 직원에게 하루 시프트 수를 지정한 경우 오너라도 우선 적용
    if (typeof shiftsOverrideByEmail[e] === 'number' && shiftsOverrideByEmail[e] > 0) {
      return shiftsOverrideByEmail[e];
    }
    return maxShiftsDefault;
  };

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

  // A submission carries the week it was filled in for, so the week being built is read from the
  // availability that belongs to it. Somebody who has not filled in this week yet is read from
  // their latest submission instead of being dropped from the plan.
  const availByEmail = {};
  const availThisWeek = {};
  for (const sub of rowsOf(subPage)) {
    if (!sub || !sub.employee_email) continue;
    const forWeek = startOfWeekIso(String(sub.week_start || sub.created_date || '').slice(0, 10));
    if (forWeek === weekStart) {
      if (!availThisWeek[sub.employee_email]) availThisWeek[sub.employee_email] = sub.availability || {};
      continue;
    }
    if (!availByEmail[sub.employee_email]) availByEmail[sub.employee_email] = sub.availability || {};
  }
  for (const email of Object.keys(availThisWeek)) availByEmail[email] = availThisWeek[email];

  const shiftByKey = {};
  for (const shift of shifts) shiftByKey[shift.key] = shift;

  // Every shift pattern the day's headcount calls for, so the builder can see who is free for more
  // than one of them — the split-shift people a store plans a morning and an afternoon for.
  const dayDemand = {};
  for (const row of requirements) {
    const template = shiftByKey[row.shift_key];
    if (!template) continue;
    const start = toMin(template.start_time);
    const end = toMin(template.end_time);
    if (start === null || end === null || end <= start) continue;
    const day = Number(row.day);
    const list = (dayDemand[day] = dayDemand[day] || []);
    if (list.some((item) => item.position === row.position && item.start === start && item.end === end)) continue;
    list.push({ position: row.position, start, end });
  }

  const assignedMinutes = {};
  const intervals = {};
  // The days each person is already planned for, kept as dates so two shifts on one day still
  // count as one working day.
  const daysPlaced = {};
  const noteDay = (email, date) => {
    if (!email) return;
    daysPlaced[email] = daysPlaced[email] || new Set();
    daysPlaced[email].add(date);
  };
  // The shifts each person already holds on each day. A pinned or kept shift counts as one of them,
  // and that person's own limit for the day decides whether a second one can follow.
  const shiftsOnDay = {};

  // Somebody already on a saved or sent shift in this week is counted in, and is not planned
  // again on that day.
  for (const shift of keptShifts) {
    const date = String(shift.date || '').slice(0, 10);
    const start = toMin(shift.start_time);
    const end = toMin(shift.end_time);
    assignedMinutes[shift.employee_email] = (assignedMinutes[shift.employee_email] || 0) + lengthOf(shift);
    const keptKey = `${shift.employee_email}|${date}`;
    shiftsOnDay[keptKey] = (shiftsOnDay[keptKey] || 0) + 1;
    noteDay(shift.employee_email, date);
    if (start === null || end === null || end <= start) continue;
    intervals[shift.employee_email] = [
      ...(intervals[shift.employee_email] || []),
      { start: absMinutes(date, start), end: absMinutes(date, end), date }
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
      // 직원의 기본 포지션, 보조 포지션, 그리고 추가된 모든 포지션(extra_positions)을 종합하여 매칭합니다.
      const extra = Array.isArray(person.extra_positions) ? person.extra_positions : [];
      const positions = [person.position, person.secondary_position, ...extra].filter(Boolean);
      if (!positions.includes(req.position)) continue;

      if (onLeave(email, date)) {
        leaveSkips += 1;
        continue;
      }
      // Nobody is planned past the shifts their own day holds, nor past their days in the week.
      if ((shiftsOnDay[`${email}|${date}`] || 0) >= shiftCapFor(email)) continue;
      const currentDays = daysPlaced[email] || new Set();
      if (!currentDays.has(date) && currentDays.size >= dayCapFor(email, person)) continue;

      const fixedHere = Boolean(fixedByDay[dayIndex] && fixedByDay[dayIndex].has(lower(email)));
      const submitted = availByEmail[email] || null;
      const window = availableWindow(submitted, dayKey);
      
      // 1. 전체 시프트 시간(start~end)을 100% 커버하는 완전 매칭
      const fullMatch = Boolean(window && window.from <= start && window.to >= end);

      // 2. 직원의 가능 시간과 시프트 시간의 겹치는 구간(overlap) 계산
      let overlapMin = 0;
      if (window) {
        const oStart = Math.max(window.from, start);
        const oEnd = Math.min(window.to, end);
        overlapMin = Math.max(0, oEnd - oStart);
      }

      // 3. 유연 매칭: 시작 시간 오차가 2시간 이내이면서 시프트 시간의 50% 이상(또는 3시간 이상) 겹치면 후보로 인정
      // (예: 매장 08:00~15:00 시프트에 직원 09:00~17:00 제출 시 6시간 겹치므로 후보로 허용)
      const partialMatch = Boolean(
        window &&
        overlapMin >= Math.min(180, lengthMin * 0.5) &&
        Math.abs(window.from - start) <= 120
      );

      const freeForShift = fullMatch || partialMatch;
      // How many of that day's own shifts this person's submitted hours cover: two or more makes
      // them the person the day is built on, so both the morning and the afternoon go to them.
      const coversDay = (dayDemand[dayIndex] || []).filter(
        (item) =>
          positions.includes(item.position) && window && window.from <= item.start && window.to >= item.end
      ).length;

      // [스마트 제약조건 최적화]:
      // 만약 이 직원이 오늘 뛸 수 있는 시프트가 오직 1개뿐이라면(예: Tester는 오픈만 가능, 마감 불가),
      // 다른 시프트로 갈 수 없으므로 이 시프트에 최우선 배정해야 전체 시프트가 채워집니다.
      // (오픈/마감 둘 다 가능한 직원은 다른 시프트를 위해 양보)
      const onlyOption = coversDay === 1;

      // A fixed placement is the employer's own instruction, so it stands when the person has not
      // said anything about that day. Once they have told us they cannot work those hours, the
      // shift goes to somebody who can instead of being planned on top of them.
      if (!freeForShift && (fixedHere ? submitted !== null : true)) continue;

      const room = remainingMinutes(person, assignedMinutes[email] || 0);
      if (room !== null && lengthMin > room) continue;

      const newStart = absMinutes(date, start);
      const newEnd = absMinutes(date, end);
      let allowed = true;
      for (const iv of intervals[email] || []) {
        const overlaps = newStart < iv.end && iv.start < newEnd;
        const gap = newStart >= iv.end ? newStart - iv.end : iv.start - newEnd;
        // A day is the unit the store plans in: two shifts on the same day are one split shift,
        // so the minimum rest protects the gap between one day's work and the next, not the
        // break inside a day. That is what lets a two-shift day give somebody up to ten shifts.
        if (overlaps || (iv.date !== date && gap < minRest * 60)) {
          allowed = false;
          break;
        }
      }
      if (!allowed) continue;

      candidates.push({
        email,
        name: person.full_name,
        used: assignedMinutes[email] || 0,
        rank: EMPLOYMENT_RANK[normalizeEmploymentType(person.employment_type)] ?? EMPLOYMENT_RANK.casual,
        primary: person.position === req.position,
        fixed: fixedHere,
        split: coversDay >= 2,
        fullMatch: fullMatch ? 1 : 0,
        onlyOption: onlyOption ? 1 : 0,
        overlapMin
      });
    }

    // The pinned people come first, then 100% full match, then onlyOption (제약조건 최우선), then split shifts, then contracts, then fairness
    candidates.sort(
      (a, b) =>
        (b.fixed ? 1 : 0) - (a.fixed ? 1 : 0) ||
        b.fullMatch - a.fullMatch ||
        b.onlyOption - a.onlyOption || // 이 시프트밖에 못 뛰는 사람에게 먼저 시프트를 주고 다재다능한 사람은 양보
        (b.split ? 1 : 0) - (a.split ? 1 : 0) ||
        a.rank - b.rank ||
        a.used - b.used ||
        (b.primary ? 1 : 0) - (a.primary ? 1 : 0) ||
        b.overlapMin - a.overlapMin ||
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
      noteDay(pick.email, date);
      intervals[pick.email] = [
        ...(intervals[pick.email] || []),
        { start: absMinutes(date, start), end: absMinutes(date, end), date }
      ];
      const pickKey = `${pick.email}|${date}`;
      shiftsOnDay[pickKey] = (shiftsOnDay[pickKey] || 0) + 1;
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