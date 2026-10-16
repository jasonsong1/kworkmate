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

// 고용 형태별 시프트 배정 우선순위:
// 1등: 정규직(permanent, 주 50시간 계약)
// 2등: 풀타임(full_time, 주 38시간 계약)
// 3등: 파트타임(part_time)
// 4등: 캐주얼(casual)
const EMPLOYMENT_RANK = {
  permanent: 0,
  full_time: 1,
  fulltime: 1,
  'full-time': 1,
  part_time: 2,
  parttime: 2,
  'part-time': 2,
  casual: 3,
  owner: 99
};

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

// 고용주가 자연어로 입력한 맞춤 AI 지침(custom_instructions)을 분석하여 규칙 객체로 변환합니다.
// 지원 패턴:
// - 최소 배정: "sumin에게 최소한의 시프트배정만해줘", "오너는 최소로", "적게", "땜빵으로만"
// - 우선 배정: "monoovatwo 더 배정해줘", "monoovatwo 우선", "시프트 몰아줘", "풀타임 먼저"
// - 요일 우선/전담: "monoovatwo는 주말배정해줘", "평일에는 sumin", "금요일 Tester 우선"
// - 요일 제외/휴무: "sumin은 주말 제외", "화요일 오프", "토요일 쉬어", "일요일 제외"
// - 시간대 선호/금지: "sumin은 오픈만", "monoovatwo는 마감 위주로", "오전 금지", "마감 빼줘"
// - 하루 1시프트 제한: "하루 1시프트만", "더블 시프트 금지", "오픈 마감 같이 넣지 마"
// - 주 N일 제한: "sumin 주 3일만", "최대 4일", "주 2일"
export function parseCustomInstructions(instructions, staff) {
  const rules = {
    employeeDayCaps: {},       // { email: number } 주당 최대 일수
    employeeHourCaps: {},      // { email: number } 주당 최대 시간 (분 단위)
    employeeMinHours: {},      // { email: number } 주당 최소 시간 (분 단위)
    dailyHourCaps: {},         // { email: number } 하루 최대 시간 (분 단위)
    employeeExclude: new Set(),
    dayPriority: {},
    dayExclude: {},            // { '0': Set<email> } 특정 요일 제외/오프
    weekendStaff: new Set(),   // 주말 우선 배정 대상자
    weekdayStaff: new Set(),   // 평일 우선 배정 대상자
    minStaff: new Set(),       // 최소 시프트 배정 대상자 (다른 직원이 없을 때만 투입되는 최후 땜빵)
    priorityStaff: new Set(),  // 전체 시프트 최우선 몰아주기 대상자
    singleShiftStaff: new Set(), // 하루 1시프트만 허용 (더블 시프트 방지)
    shiftPref: {},             // { email: { preferOpen?, preferClose?, forbidOpen?, forbidClose?, preferPeak?, forbidPeak? } }
    substitutePairs: {},       // { targetEmail: fallbackEmail } A가 못 나올 때 B로 대체
    maxConsecutiveDays: {},    // { email: number } 연속 N일 이상 근무 금지
    noConsecutiveClose: new Set(), // 연속 마감(디너) 금지
    dayRoleFilters: {}         // { dayIndex: Set<roleLower> } 특정 요일 특정 직책만 투입
  };
  if (!instructions || !String(instructions).trim()) return rules;

  const lines = String(instructions).split(/\r?\n|•|,|;/).map((s) => s.trim()).filter(Boolean);
  
  const dayDefinitions = [
    { names: ['월요일', '월', 'mon', 'monday'], indices: [0] },
    { names: ['화요일', '화', 'tue', 'tuesday'], indices: [1] },
    { names: ['수요일', '수', 'wed', 'wednesday'], indices: [2] },
    { names: ['목요일', '목', 'thu', 'thursday'], indices: [3] },
    { names: ['금요일', '금', 'fri', 'friday'], indices: [4] },
    { names: ['토요일', '토', 'sat', 'saturday'], indices: [5] },
    { names: ['일요일', '일', 'sun', 'sunday'], indices: [6] },
    { names: ['주말', 'weekend', 'weekends', '토일'], indices: [5, 6] },
    { names: ['평일', '주중', 'weekday', 'weekdays'], indices: [0, 1, 2, 3, 4] }
  ];

  const minKeywords = [
    '최소', '적게', '덜', '최소한', '가장 적게', '최소화', '조금만', '조금',
    'least', 'min', 'minimum', '땜빵', '땜빵용', '후순위', '대체용', '비상용',
    '스페어', '필요할때만', '사람 없을때만', '사람 부족할때만', '급할때만',
    '마지막에', '제일 마지막', 'backup', 'spare', 'substitute', 'as needed', 'emergency only',
    '미배정일때만', '미배정일때', '미배정시', '미배정 시', '미배정', '공석일때', '공석시',
    '비었을때만', '비었을때', '사람없을때만', '부족할때만', '안될때만', '대타', '대타용', 'fallback'
  ];

  const maxKeywords = [
    '우선', '더 배정', '몰아', '몰아줘', '많이', '최우선', '위주', '먼저', '가장 많이',
    '최대한', '보장', '풀로', '풀타임처럼', 'priority', 'preferred', 'first', '더 많이',
    '더', 'more', 'most', 'give more', 'max', 'full', '주력'
  ];

  const excludeKeywords = [
    '제외', '빼', '빼줘', '쉬게', '쉬어', '오프', 'off', '안 됨', '안됨', '불가',
    '금지', 'x', '휴무', '안돼', '일하지마', '나오지마', 'no', 'not', 'day off', 'leave out', '넣지 마', '넣지마'
  ];

  const singleShiftKeywords = [
    '하루 1시프트', '하루 한 번', '하루 한번', '더블 금지', '2시프트 금지', '두번 금지',
    '오픈 마감 같이', '분할 금지', '하루 1개', '하루에 하나만', '1회만', 'single shift',
    'no double', 'no split'
  ];

  const openKeywords = ['오픈', '오전', '아침', '모닝', '모닝조', 'open', 'morning', 'early'];
  const closeKeywords = ['마감', '오후', '저녁', '야간', '클로즈', '클로징', '밤', '디너', 'close', 'night', 'evening', 'late', 'dinner'];
  const peakKeywords = ['피크타임', '피크', '점심', '런치', 'peak'];

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const isMinReq = minKeywords.some((k) => lowerLine.includes(k));
    const isMaxReq = maxKeywords.some((k) => lowerLine.includes(k));
    const isExReq = excludeKeywords.some((k) => lowerLine.includes(k));
    const isSingleReq = singleShiftKeywords.some((k) => lowerLine.includes(k));

    // A. 대체/대타 조건 분석: "A가 빠지면 B로 대체해줘", "A가 못 나오면 B로 바꿔줘"
    for (const p1 of staff || []) {
      const n1 = String(p1.full_name || '').toLowerCase().trim();
      const e1 = String(p1.user_email || '').toLowerCase().trim();
      const n1NoSpace = n1.replace(/\s+/g, '');
      const e1User = e1.split('@')[0] || '';
      const matched1 = (n1 && lowerLine.includes(n1)) || (n1NoSpace && lowerLine.includes(n1NoSpace)) || (e1User && lowerLine.includes(e1User));
      if (!matched1) continue;

      for (const p2 of staff || []) {
        if (p1.user_email === p2.user_email) continue;
        const n2 = String(p2.full_name || '').toLowerCase().trim();
        const e2 = String(p2.user_email || '').toLowerCase().trim();
        const n2NoSpace = n2.replace(/\s+/g, '');
        const e2User = e2.split('@')[0] || '';
        const matched2 = (n2 && lowerLine.includes(n2)) || (n2NoSpace && lowerLine.includes(n2NoSpace)) || (e2User && lowerLine.includes(e2User));
        if (matched2) {
          if (lowerLine.includes('대체') || lowerLine.includes('바꿔') || lowerLine.includes('채워') || lowerLine.includes('대타') || lowerLine.includes('빠지면') || lowerLine.includes('못 나오') || lowerLine.includes('불가능하면') || lowerLine.includes('병가')) {
            rules.substitutePairs[lower(p1.user_email)] = lower(p2.user_email);
          }
        }
      }
    }

    // B. 학생 평일 위주 및 주말 제외 지침: "학생은 평일 위주로 넣어줘"
    if (lowerLine.includes('학생') || lowerLine.includes('student')) {
      for (const person of staff || []) {
        const visa = lower(person.visa_type);
        const name = lower(person.full_name);
        if (visa.includes('student') || visa.includes('500') || name.includes('student')) {
          rules.weekdayStaff.add(lower(person.user_email));
          rules.dayExclude['5'] = rules.dayExclude['5'] || new Set();
          rules.dayExclude['5'].add(lower(person.user_email));
          rules.dayExclude['6'] = rules.dayExclude['6'] || new Set();
          rules.dayExclude['6'].add(lower(person.user_email));
        }
      }
    }

    // C. 특정 요일 특정 직책만 투입: "일요일은 매니저, 슈퍼바이저만 넣어줘", "주말은 풀타임만 넣어줘"
    for (const d of dayDefinitions) {
      const hasDay = d.names.some((dn) => lowerLine.includes(dn));
      if (hasDay && (lowerLine.includes('만 넣어') || lowerLine.includes('만 배정') || lowerLine.includes('만 투입') || lowerLine.includes('만 필요'))) {
        const targetRoles = ['매니저', 'manager', '슈퍼바이저', 'supervisor', '바리스타', 'barista', '풀타임', 'fulltime', '정규직', 'permanent', '알바'].filter((r) => lowerLine.includes(r));
        if (targetRoles.length > 0) {
          for (const idx of d.indices) {
            const k = String(idx);
            rules.dayRoleFilters[k] = rules.dayRoleFilters[k] || new Set();
            targetRoles.forEach((r) => rules.dayRoleFilters[k].add(r));
          }
        }
      }
    }

    // D. 직책 전체 키워드 매칭 (오너, 매니저, 슈퍼바이저, 바리스타, 알바)
    const checkRoleMatch = (roleKeywords, callback) => {
      if (roleKeywords.some((rk) => lowerLine.includes(rk))) {
        for (const person of staff || []) {
          const pos = lower(person.position);
          const sec = lower(person.secondary_position);
          const emp = lower(person.employment_type);
          if (roleKeywords.some((rk) => pos.includes(rk) || sec.includes(rk) || emp.includes(rk))) {
            callback(person.user_email);
          }
        }
      }
    };

    if (isMinReq) {
      checkRoleMatch(['오너', 'owner', '점주', '대표'], (email) => {
        rules.minStaff.add(email);
        rules.minStaff.add(lower(email));
      });
    }

    if (isMaxReq) {
      checkRoleMatch(['매니저', 'manager', '슈퍼바이저', 'supervisor', '풀타임'], (email) => {
        rules.priorityStaff.add(email);
        rules.priorityStaff.add(lower(email));
      });
    }

    // E. 개별 직원 키워드 분석
    for (const person of staff || []) {
      const name = String(person.full_name || '').toLowerCase().trim();
      const email = String(person.user_email || '').toLowerCase().trim();
      const emailUser = email.split('@')[0] || '';
      const nameNoSpace = name.replace(/\s+/g, '');
      const nameParts = name.split(/\s+/).filter(Boolean);

      // 매칭 조건: 풀네임, 공백제거 이름, 성/이름 각각, 이메일 아이디(골뱅이 앞), 전체 이메일
      const matched =
        (name && lowerLine.includes(name)) ||
        (nameNoSpace && lowerLine.includes(nameNoSpace)) ||
        nameParts.some((part) => part.length >= 2 && lowerLine.includes(part)) ||
        (emailUser && lowerLine.includes(emailUser)) ||
        lowerLine.includes(email);

      if (!matched) continue;

      const normEmail = lower(email);

      // 1. 주 N일 제한: 예) "sumin은 주 4일만", "sumin 주 3일", "최대 4일", "3일만"
      const matchDays = lowerLine.match(/(?:주|최대)?\s*(\d+)\s*일/);
      if (matchDays) {
        const cap = parseInt(matchDays[1], 10);
        if (cap > 0 && cap <= 7) {
          rules.employeeDayCaps[normEmail] = cap;
          rules.employeeDayCaps[email] = cap;
        }
      }

      // 2. 주당 최대 N시간 제한: 예) "F가 20시간 넘기면 더 이상 배정하지 마", "C는 최대 25시간까지만 배정해줘"
      const matchMaxHours = lowerLine.match(/(?:최대|넘기면|까지만)?\s*(\d+)\s*(?:시간|hr|hours?)(?:까지만|넘기면|이하)?/);
      if (matchMaxHours && (lowerLine.includes('넘기면') || lowerLine.includes('최대') || lowerLine.includes('까지만') || lowerLine.includes('이하'))) {
        const h = parseInt(matchMaxHours[1], 10);
        if (h > 0 && h <= 80) {
          rules.employeeHourCaps[normEmail] = h * 60;
          rules.employeeHourCaps[email] = h * 60;
        }
      }

      // 3. 주당 최소 N시간 보장: 예) "B는 주당 최소 20시간 필요해", "A는 최소 3시간은 넣어줘"
      const matchMinHours = lowerLine.match(/(?:최소|적어도)\s*(\d+)\s*(?:시간|hr|hours?)/);
      if (matchMinHours) {
        const h = parseInt(matchMinHours[1], 10);
        if (h > 0 && h <= 80) {
          rules.employeeMinHours[normEmail] = h * 60;
          rules.employeeMinHours[email] = h * 60;
        }
      }

      // 4. 하루 최대 N시간 제한: 예) "D는 하루 최대 8시간 넘기지 마"
      const matchDailyHours = lowerLine.match(/하루\s*(?:최대)?\s*(\d+)\s*(?:시간|hr|hours?)/);
      if (matchDailyHours) {
        const h = parseInt(matchDailyHours[1], 10);
        if (h > 0 && h <= 24) {
          rules.dailyHourCaps[normEmail] = h * 60;
          rules.dailyHourCaps[email] = h * 60;
        }
      }

      // 5. 연속 N일 이상 근무 금지: 예) "A는 연속 3일 이상 넣지 마"
      const matchConsec = lowerLine.match(/연속\s*(\d+)\s*일/);
      if (matchConsec && (lowerLine.includes('넣지 마') || lowerLine.includes('금지') || lowerLine.includes('안 됨') || lowerLine.includes('제외') || lowerLine.includes('말아'))) {
        const days = parseInt(matchConsec[1], 10);
        if (days >= 2 && days <= 7) {
          rules.maxConsecutiveDays[normEmail] = days;
          rules.maxConsecutiveDays[email] = days;
        }
      }

      // 6. 연속 마감(디너) 금지: 예) "C는 연속 마감 금지"
      if (lowerLine.includes('연속 마감') || lowerLine.includes('연속마감')) {
        rules.noConsecutiveClose.add(normEmail);
        rules.noConsecutiveClose.add(email);
      }

      // 7. 전체 제외 / 전면 휴무: 예) "StudentA 이번 주 제외", "StudentA 쉬어" (특정 요일 언급이 없을 때)
      const hasSpecificDay = dayDefinitions.some((d) => d.names.some((dn) => lowerLine.includes(dn)));
      if (isExReq && !hasSpecificDay) {
        rules.employeeExclude.add(normEmail);
        rules.employeeExclude.add(email);
      }

      // 8. 특정 요일 제외(휴무) vs 특정 요일 우선 배정
      for (const d of dayDefinitions) {
        const mentionsDay = d.names.some((dn) => lowerLine.includes(dn));
        if (mentionsDay) {
          if (isExReq) {
            // 특정 요일 제외: 예) "sumin은 주말 제외", "화요일 쉬어", "토요일 오프", "A는 화요일 절대 넣지 마"
            for (const idx of d.indices) {
              const key = String(idx);
              rules.dayExclude[key] = rules.dayExclude[key] || new Set();
              rules.dayExclude[key].add(normEmail);
              rules.dayExclude[key].add(email);
            }
          } else {
            // 특정 요일 우선 배정: 예) "monoovatwo는 주말배정해줘", "평일에는 monoovafirst 우선", "E는 최소 한 번은 주말에 넣어줘"
            for (const idx of d.indices) {
              const key = String(idx);
              rules.dayPriority[key] = rules.dayPriority[key] || new Set();
              rules.dayPriority[key].add(normEmail);
              rules.dayPriority[key].add(email);
            }
            if (d.indices.includes(5) && d.indices.includes(6)) {
              rules.weekendStaff.add(normEmail);
              rules.weekendStaff.add(email);
            }
            if (d.indices.includes(0) && d.indices.includes(4)) {
              rules.weekdayStaff.add(normEmail);
              rules.weekdayStaff.add(email);
            }
          }
        }
      }

      // 9. 최소 배정 / 땜빵 지침: 예) "sumin에게 최소한의 시프트배정만해줘", "sumin 최소로", "sumin 적게", "A가 미배정일 때만 넣어줘"
      if (isMinReq) {
        rules.minStaff.add(normEmail);
        rules.minStaff.add(email);
      }

      // 10. 우선 배정 / 몰아주기 지침: 예) "monoovatwo 더 배정해줘", "monoovatwo 우선", "가능하면 A를 먼저 넣어줘"
      if (isMaxReq && !hasSpecificDay) {
        rules.priorityStaff.add(normEmail);
        rules.priorityStaff.add(email);
      }

      // 11. 하루 1시프트 제한: 예) "StudentA 하루 1시프트만", "더블 금지"
      if (isSingleReq) {
        rules.singleShiftStaff.add(normEmail);
        rules.singleShiftStaff.add(email);
      }

      // 12. 오픈 / 마감 / 디너 선호 및 금지
      const hasOpen = openKeywords.some((k) => lowerLine.includes(k));
      const hasClose = closeKeywords.some((k) => lowerLine.includes(k));
      if (hasOpen || hasClose) {
        rules.shiftPref[normEmail] = rules.shiftPref[normEmail] || {};
        if (hasOpen) {
          if (isExReq) rules.shiftPref[normEmail].forbidOpen = true;
          else rules.shiftPref[normEmail].preferOpen = true;
        }
        if (hasClose) {
          if (isExReq) rules.shiftPref[normEmail].forbidClose = true;
          else rules.shiftPref[normEmail].preferClose = true;
        }
      }

      // 13. 피크타임(11:00~14:00) 선호 및 제외: 예) "피크타임에는 StudentA를 우선 배치해줘", "E는 피크타임 제외"
      const hasPeak = peakKeywords.some((k) => lowerLine.includes(k));
      if (hasPeak) {
        rules.shiftPref[normEmail] = rules.shiftPref[normEmail] || {};
        if (isExReq) rules.shiftPref[normEmail].forbidPeak = true;
        else rules.shiftPref[normEmail].preferPeak = true;
      }
    }
  }

  return rules;
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

  // 고용주 맞춤 AI 자연어 지침 파싱
  const customRules = parseCustomInstructions(setting ? setting.custom_instructions : '', staff);

  const dayCapFor = (email, person) => {
    const e = lower(email);
    // 0순위: 고용주 맞춤 AI 지침에서 명시한 주 N일 제한 (최우선 반영)
    if (typeof customRules.employeeDayCaps[e] === 'number') {
      return customRules.employeeDayCaps[e];
    }
    // 1순위: 관리자가 직접 개별 직원에게 설정한 주당 근무일수 오버라이드
    if (typeof daysOverrideByEmail[e] === 'number' && daysOverrideByEmail[e] > 0) {
      return daysOverrideByEmail[e];
    }
    // 2순위: 풀타임(38시간) 및 정규직(50시간) 직원은 주당 계약 시간을 충족할 수 있도록 최대 6일까지 유연하게 배정
    const empType = person ? normalizeEmploymentType(person.employment_type) : '';
    if (empType === 'full_time' || empType === 'permanent') {
      return Math.max(maxDaysDefault, 6);
    }
    // 3순위: 오너는 미배정 공석이 생길 때 메울 수 있도록 7일 허용
    if (UNLIMITED_EMPLOYMENT.includes(empType)) {
      return 7;
    }
    // 4순위: 기본 매장 설정 일수 (기본 5일)
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
    // 1순위: 관리자가 특정 직원에게 하루 시프트 수를 지정한 경우 우선 적용
    if (typeof shiftsOverrideByEmail[e] === 'number' && shiftsOverrideByEmail[e] > 0) {
      return shiftsOverrideByEmail[e];
    }
    // 2순위: 지침에서 '하루 1시프트', '더블 금지'로 명시된 직원은 하루 1시프트로 제한
    if (customRules.singleShiftStaff && (customRules.singleShiftStaff.has(e) || customRules.singleShiftStaff.has(email))) {
      return 1;
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
    // 고용주 맞춤 지침에서 '최소 배정'으로 지정된 직원은 고정 직원(fixed) 우선권에서 제외
    if (customRules.minStaff && (customRules.minStaff.has(email) || customRules.minStaff.has(lower(email)))) {
      continue;
    }
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
  const minutesOnDay = {};
  const intervals = {};
  // The days each person is already planned for, kept as dates so two shifts on one day still
  // count as one working day.
  const daysPlaced = {};
  const noteDay = (email, date, length = 0) => {
    if (!email) return;
    daysPlaced[email] = daysPlaced[email] || new Set();
    daysPlaced[email].add(date);
    minutesOnDay[email] = minutesOnDay[email] || {};
    minutesOnDay[email][date] = (minutesOnDay[email][date] || 0) + length;
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
    const shiftLen = lengthOf(shift);
    assignedMinutes[shift.employee_email] = (assignedMinutes[shift.employee_email] || 0) + shiftLen;
    const keptKey = `${shift.employee_email}|${date}`;
    shiftsOnDay[keptKey] = (shiftsOnDay[keptKey] || 0) + 1;
    noteDay(shift.employee_email, date, shiftLen);
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

      // 평일(0~4) 배정 시, 주말 필수/우선 배정자(weekendStaff)가 평일에 주당 최대 일수(5일)를 모두 소진하여 주말에 제외되는 것을 방지합니다.
      const isWeekday = dayIndex >= 0 && dayIndex <= 4;
      const isWeekendMust =
        customRules.weekendStaff &&
        (customRules.weekendStaff.has(email) || customRules.weekendStaff.has(lower(email)));
      if (isWeekday && isWeekendMust && !currentDays.has(date)) {
        // 주말(토, 일) 2일을 뛸 수 있도록 평일에는 최대 (한도 - 2)일까지만 배정하여 슬롯을 남겨둡니다.
        const reservedWeekdayCap = Math.max(1, dayCapFor(email, person) - 2);
        if (currentDays.size >= reservedWeekdayCap) continue;
      }

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
      // 1. 특정 요일 제외(휴무/오프) 지침 검사 (예: "sumin 주말 제외", "화요일 쉬어", "A는 화요일 절대 넣지 마")
      const isDayExcluded =
        customRules.dayExclude[String(dayIndex)] &&
        (customRules.dayExclude[String(dayIndex)].has(email) ||
          customRules.dayExclude[String(dayIndex)].has(lower(email)));
      if (isDayExcluded) continue;

      // 2. 전체 제외 지침 검사 (예: "StudentA 이번 주 제외")
      const isExcluded = customRules.employeeExclude.has(email) || customRules.employeeExclude.has(lower(email));
      if (isExcluded) continue;

      // 3. 하루 1시프트 제한 지침 검사 (더블/분할 시프트 금지)
      const shiftsToday = shiftsOnDay[`${email}|${date}`] || 0;
      const isSingleShiftOnly =
        customRules.singleShiftStaff &&
        (customRules.singleShiftStaff.has(email) || customRules.singleShiftStaff.has(lower(email)));
      if (isSingleShiftOnly && shiftsToday >= 1) continue;

      const normEmail = lower(email);

      // 4. 주당 최대 N시간 제한 지침 검사 (예: "F가 20시간 넘기면 더 이상 배정하지 마", "C는 최대 25시간까지만")
      const maxWeeklyMins = customRules.employeeHourCaps[normEmail] || customRules.employeeHourCaps[email];
      if (maxWeeklyMins && (assignedMinutes[email] || 0) + lengthMin > maxWeeklyMins) continue;

      // 5. 하루 최대 N시간 제한 지침 검사 (예: "D는 하루 최대 8시간 넘기지 마")
      const maxDailyMins = customRules.dailyHourCaps[normEmail] || customRules.dailyHourCaps[email];
      const curDailyMins = (minutesOnDay[email] && minutesOnDay[email][date]) || 0;
      if (maxDailyMins && curDailyMins + lengthMin > maxDailyMins) continue;

      // 6. 연속 N일 이상 근무 금지 지침 검사 (예: "A는 연속 3일 이상 넣지 마")
      const maxConsec = customRules.maxConsecutiveDays[normEmail] || customRules.maxConsecutiveDays[email];
      if (maxConsec && maxConsec >= 2) {
        let streak = 0;
        for (let b = 1; b < maxConsec; b++) {
          const pDate = addDays(date, -b);
          if (daysPlaced[email] && daysPlaced[email].has(pDate)) streak++;
          else break;
        }
        if (streak >= maxConsec - 1) continue;
      }

      // 7. 연속 마감(디너) 금지 지침 검사 (예: "C는 연속 마감 금지")
      const isCloseShift = start >= 1020; // 17:00 이후 시작 시프트
      if (isCloseShift && (customRules.noConsecutiveClose.has(normEmail) || customRules.noConsecutiveClose.has(email))) {
        const prevDate = addDays(date, -1);
        const hadCloseYesterday = (intervals[email] || []).some(
          (iv) => iv.date === prevDate && (iv.start % 1440) >= 1020
        );
        if (hadCloseYesterday) continue;
      }

      // 8. 요일별 특정 직책만 투입 지침 검사 (예: "일요일은 매니저, 슈퍼바이저만 넣어줘", "주말은 풀타임만")
      const dayRoles = customRules.dayRoleFilters[String(dayIndex)];
      if (dayRoles && dayRoles.size > 0) {
        const pos = lower(person.position);
        const sec = lower(person.secondary_position);
        const emp = lower(person.employment_type);
        const roleMatch = Array.from(dayRoles).some(
          (r) => pos.includes(r) || sec.includes(r) || emp.includes(r)
        );
        if (!roleMatch) continue;
      }

      // 9. 시간대(오픈/마감/피크타임) 금지 지침 검사 (720분 = 12:00 정오 기준, 피크타임 = 11:00~14:00)
      const pref = customRules.shiftPref[normEmail] || customRules.shiftPref[email] || {};
      if (start < 720 && pref.forbidOpen) continue;
      if (start >= 720 && pref.forbidClose) continue;
      const isPeak = Math.max(start, 660) < Math.min(end, 840);
      if (isPeak && pref.forbidPeak) continue;

      // 10. 시간대(오픈/마감/피크타임) 선호 보너스 계산
      let prefShiftBonus = 0;
      if (start < 720 && pref.preferOpen) prefShiftBonus += 1;
      if (start >= 720 && pref.preferClose) prefShiftBonus += 1;
      if (isPeak && pref.preferPeak) prefShiftBonus += 2;

      // 11. 대체 조건 가산점 계산 (예: "A가 빠지면 B로 대체해줘" -> A가 오늘 배정되지 않았으면 B에게 우선권)
      let substituteBonus = 0;
      for (const [targetEmail, fallbackEmail] of Object.entries(customRules.substitutePairs)) {
        if (
          fallbackEmail === normEmail &&
          (!daysPlaced[targetEmail] || !daysPlaced[targetEmail].has(date))
        ) {
          substituteBonus = 2;
        }
      }

      // 12. 주당 최소 N시간 보장 가산점 계산 (예: "B는 주당 최소 20시간 필요해")
      const minHoursNeeded = customRules.employeeMinHours[normEmail] || customRules.employeeMinHours[email];
      const needHoursBonus = minHoursNeeded && (assignedMinutes[email] || 0) < minHoursNeeded ? 1 : 0;

      const isMinStaff =
        customRules.minStaff && (customRules.minStaff.has(email) || customRules.minStaff.has(lower(email)));
      const isPriorityStaff =
        customRules.priorityStaff &&
        (customRules.priorityStaff.has(email) || customRules.priorityStaff.has(lower(email)));

      candidates.push({
        email,
        name: person.full_name,
        used: assignedMinutes[email] || 0,
        rank: EMPLOYMENT_RANK[normalizeEmploymentType(person.employment_type)] ?? EMPLOYMENT_RANK.casual,
        primary: person.position === req.position, // 해당 포지션이 본직책인지 여부
        fixed: fixedHere,
        minStaff: isMinStaff ? 1 : 0,
        priorityStaff: isPriorityStaff ? 1 : 0,
        substituteBonus,
        needHoursBonus,
        prefShiftBonus,
        shiftsToday,
        split: coversDay >= 2,
        fullMatch: fullMatch ? 1 : 0,
        onlyOption: onlyOption ? 1 : 0,
        customPriority:
          customRules.dayPriority[String(dayIndex)] &&
          (customRules.dayPriority[String(dayIndex)].has(email) ||
            customRules.dayPriority[String(dayIndex)].has(lower(email)))
            ? 1
            : 0,
        overlapMin
      });
    }

    // 후보자 우선순위 정렬:
    // 1. 관리자가 직접 고정한 요일(fixed)
    // 2. 고용주 맞춤 AI 지침 요일 우선 배정(customPriority: 주말, 특정 요일 우선 지정자)
    // 3. ★ 대체/대타 조건 우선 투입(substituteBonus: A가 빠지면 B로 대체)
    // 4. ★ 고용주 맞춤 AI 지침 우선 배정 대상자(priorityStaff: 시프트 몰아주기/더 배정)
    // 5. ★ 시간대(오픈/마감/피크타임) 선호자 보너스(prefShiftBonus)
    // 6. ★ 주당 최소 근무시간 미달자 우선 보장(needHoursBonus: 최소 N시간 채우기)
    // 7. ★ 최소 배정 지침(minStaff) 적용: 최소 배정 대상자(오너/비상 땜빵용)는 맨 뒤 최후순위! (0이 앞, 1은 맨 뒤)
    // 8. ★ 본직책(primary) 우선! (2번째, 3번째 직책은 땜빵용이므로 본직책 직원이 최우선)
    // 9. ★★★ [고용 형태 최우선]: 정규직(0) > 풀타임(1) > 파트타임(2) > 캐주얼(3) (정규직 1등 순위 배정!)
    // 10. ★ 오늘 아직 시프트가 없는 사람 우선(shiftsToday: 하루 2시프트 무리한 몰림 방지)
    // 11. 근무 가능 시간 100% 완전 일치(fullMatch)
    // 12. 오늘 이 시프트밖에 못 뛰는 사람 우선(onlyOption: 제약조건 최적화)
    // 13. 하루 2시프트(오픈+마감) 모두 커버 가능한 분할 시프트 대상자(split)
    // 14. 이번 주 배정된 근무시간 적은 순(used: 같은 고용형태 내 공평성)
    candidates.sort(
      (a, b) =>
        (b.fixed ? 1 : 0) - (a.fixed ? 1 : 0) ||
        (b.customPriority ? 1 : 0) - (a.customPriority ? 1 : 0) ||
        b.substituteBonus - a.substituteBonus || // ★ 대체 조건 최우선 배정!
        b.priorityStaff - a.priorityStaff || // ★ 우선 배정 지시 대상자 최우선!
        b.prefShiftBonus - a.prefShiftBonus || // ★ 오픈/마감/피크타임 선호자 우선 배치!
        b.needHoursBonus - a.needHoursBonus || // ★ 최소 보장 시간 채우기 우선!
        a.minStaff - b.minStaff || // ★ minStaff: 일반 직원(0) 먼저 배정, 최소 배정 대상자(1)는 맨 뒤 최후순위!
        (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || // ★ 본직책 우선!
        a.rank - b.rank || // ★★★ 정규직(0) > 풀타임(1) > 파트타임(2) > 캐주얼(3) 최우선 배정!
        a.shiftsToday - b.shiftsToday ||
        b.fullMatch - a.fullMatch ||
        b.onlyOption - a.onlyOption ||
        (b.split ? 1 : 0) - (a.split ? 1 : 0) ||
        a.used - b.used ||
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
      noteDay(pick.email, date, lengthMin);
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