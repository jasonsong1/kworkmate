// Australian public holidays, worked out per state so a shift can be paid at the right
// penalty rate. The state comes from the branch address (state field, or the postcode),
// and the calendar for a year is computed from the holiday rules - nothing is stored.

export const AU_STATES = {
  NSW: { en: 'New South Wales', ko: '뉴사우스웨일스' },
  VIC: { en: 'Victoria', ko: '빅토리아' },
  QLD: { en: 'Queensland', ko: '퀸즐랜드' },
  SA: { en: 'South Australia', ko: '사우스오스트레일리아' },
  WA: { en: 'Western Australia', ko: '웨스턴오스트레일리아' },
  TAS: { en: 'Tasmania', ko: '태즈메이니아' },
  NT: { en: 'Northern Territory', ko: '노던테리토리' },
  ACT: { en: 'Australian Capital Territory', ko: '호주 수도 준주' }
};

const DAY_MS = 86400000;

const POSTCODE_STATE = [
  { state: 'ACT', from: 200, to: 299 },
  { state: 'NT', from: 800, to: 999 },
  { state: 'NSW', from: 1000, to: 2599 },
  { state: 'ACT', from: 2600, to: 2618 },
  { state: 'NSW', from: 2619, to: 2899 },
  { state: 'ACT', from: 2900, to: 2920 },
  { state: 'NSW', from: 2921, to: 2999 },
  { state: 'VIC', from: 3000, to: 3999 },
  { state: 'QLD', from: 4000, to: 4999 },
  { state: 'SA', from: 5000, to: 5999 },
  { state: 'WA', from: 6000, to: 6999 },
  { state: 'TAS', from: 7000, to: 7999 },
  { state: 'VIC', from: 8000, to: 8999 },
  { state: 'QLD', from: 9000, to: 9999 }
];

const NAME = {
  new_year: { en: "New Year's Day", ko: '신년' },
  australia_day: { en: 'Australia Day', ko: '호주 데이' },
  good_friday: { en: 'Good Friday', ko: '성금요일' },
  easter_saturday: { en: 'Easter Saturday', ko: '부활절 토요일' },
  easter_sunday: { en: 'Easter Sunday', ko: '부활절 일요일' },
  easter_monday: { en: 'Easter Monday', ko: '부활절 월요일' },
  anzac: { en: 'Anzac Day', ko: '안작 데이' },
  kings_birthday: { en: "King's Birthday", ko: '국왕 생일' },
  labour_day: { en: 'Labour Day', ko: '노동절' },
  may_day: { en: 'May Day', ko: '메이데이' },
  eight_hours: { en: 'Eight Hours Day', ko: '8시간 노동의 날' },
  canberra_day: { en: 'Canberra Day', ko: '캔버라 데이' },
  reconciliation: { en: 'Reconciliation Day', ko: '화해의 날' },
  adelaide_cup: { en: 'Adelaide Cup Day', ko: '애들레이드 컵 데이' },
  wa_day: { en: 'WA Day', ko: '웨스턴오스트레일리아 데이' },
  picnic_day: { en: 'Picnic Day', ko: '피크닉 데이' },
  melbourne_cup: { en: 'Melbourne Cup Day', ko: '멜버른 컵 데이' },
  christmas: { en: 'Christmas Day', ko: '크리스마스' },
  boxing_day: { en: 'Boxing Day', ko: '복싱 데이' },
  proclamation: { en: 'Proclamation Day', ko: '선포일' }
};

// Easter Sunday is a public holiday everywhere except South Australia and Tasmania.
const EASTER_SUNDAY_STATES = ['NSW', 'VIC', 'QLD', 'WA', 'ACT', 'NT'];

function iso(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function shift(dateIso, days) {
  return new Date(new Date(`${dateIso}T00:00:00Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function weekdayOf(dateIso) {
  return new Date(`${dateIso}T00:00:00Z`).getUTCDay();
}

// A holiday that lands on a weekend is taken on the Monday instead.
function weekendToMonday(dateIso) {
  const weekday = weekdayOf(dateIso);
  if (weekday === 6) return shift(dateIso, 2);
  if (weekday === 0) return shift(dateIso, 1);
  return dateIso;
}

function nthWeekday(year, month, weekday, nth) {
  const first = weekdayOf(iso(year, month, 1));
  return iso(year, month, 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7);
}

function lastWeekday(year, month, weekday) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = weekdayOf(iso(year, month, daysInMonth));
  return iso(year, month, daysInMonth - ((last - weekday + 7) % 7));
}

function mondayOnOrAfter(dateIso) {
  return shift(dateIso, (8 - weekdayOf(dateIso)) % 7);
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(year, month, day);
}

function yearHolidays(state, year) {
  const holidays = [];
  const add = (date, key) => holidays.push({ date, key });

  add(weekendToMonday(iso(year, 1, 1)), 'new_year');
  add(weekendToMonday(iso(year, 1, 26)), 'australia_day');

  const easter = easterSunday(year);
  add(shift(easter, -2), 'good_friday');
  add(shift(easter, 1), 'easter_monday');
  if (state !== 'TAS') add(shift(easter, -1), 'easter_saturday');
  if (EASTER_SUNDAY_STATES.includes(state)) add(easter, 'easter_sunday');

  const anzac = iso(year, 4, 25);
  add(anzac, 'anzac');
  if ((state === 'WA' || state === 'NT') && (weekdayOf(anzac) === 6 || weekdayOf(anzac) === 0)) {
    add(weekendToMonday(anzac), 'anzac');
  }

  // Christmas and Boxing Day move on when they land on a weekend: the day itself
  // moves to the next week day, keeping Christmas before Boxing Day.
  const christmas = iso(year, 12, 25);
  const boxing = iso(year, 12, 26);
  const boxingKey = state === 'SA' ? 'proclamation' : 'boxing_day';
  const christmasWeekday = weekdayOf(christmas);
  if (christmasWeekday === 5) {
    add(christmas, 'christmas');
    add(shift(boxing, 2), boxingKey);
  } else if (christmasWeekday === 6) {
    add(shift(christmas, 2), 'christmas');
    add(shift(christmas, 3), boxingKey);
  } else if (christmasWeekday === 0) {
    add(boxing, boxingKey);
    add(shift(christmas, 2), 'christmas');
  } else {
    add(christmas, 'christmas');
    add(boxing, boxingKey);
  }

  // King's Birthday: the second Monday in June, except Queensland and Western
  // Australia which keep their own date.
  if (state === 'QLD') add(nthWeekday(year, 10, 1, 1), 'kings_birthday');
  else if (state === 'WA') add(lastWeekday(year, 9, 1), 'kings_birthday');
  else add(nthWeekday(year, 6, 1, 2), 'kings_birthday');

  // Labour Day, May Day and Eight Hours Day are the same idea on different dates.
  if (state === 'NSW' || state === 'ACT' || state === 'SA') add(nthWeekday(year, 10, 1, 1), 'labour_day');
  if (state === 'VIC') add(nthWeekday(year, 3, 1, 2), 'labour_day');
  if (state === 'QLD') add(nthWeekday(year, 5, 1, 1), 'labour_day');
  if (state === 'WA') add(nthWeekday(year, 3, 1, 1), 'labour_day');
  if (state === 'TAS') add(nthWeekday(year, 3, 1, 2), 'eight_hours');
  if (state === 'NT') add(nthWeekday(year, 5, 1, 1), 'may_day');

  if (state === 'ACT') {
    add(nthWeekday(year, 3, 1, 2), 'canberra_day');
    add(mondayOnOrAfter(iso(year, 5, 27)), 'reconciliation');
  }
  if (state === 'SA') add(nthWeekday(year, 3, 1, 2), 'adelaide_cup');
  if (state === 'WA') add(nthWeekday(year, 6, 1, 1), 'wa_day');
  if (state === 'NT') add(nthWeekday(year, 8, 1, 1), 'picnic_day');
  if (state === 'VIC') add(nthWeekday(year, 11, 2, 1), 'melbourne_cup');

  return holidays;
}

const cache = new Map();

export function normalizeState(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  const codes = Object.keys(AU_STATES);
  return (
    codes.find((code) => code.toLowerCase() === text) ||
    codes.find((code) => AU_STATES[code].en.toLowerCase() === text) ||
    ''
  );
}

export function stateLabel(state, lang) {
  const code = normalizeState(state);
  if (!code) return '';
  return lang === 'ko' ? AU_STATES[code].ko : AU_STATES[code].en;
}

// The branch state field first, then the postcode, then a postcode inside the address.
export function stateFromBranch(branch) {
  if (!branch) return '';
  const direct = normalizeState(branch.state);
  if (direct) return direct;

  const typed = String(branch.postcode || '').match(/\d{3,4}/);
  const inAddress = String(`${branch.address || ''} ${branch.suburb || ''}`).match(/\b\d{4}\b/);
  const postcode = Number(typed ? typed[0] : inAddress ? inAddress[0] : NaN);
  if (!postcode || Number.isNaN(postcode)) return '';

  const rule = POSTCODE_STATE.find((item) => postcode >= item.from && postcode <= item.to);
  return rule ? rule.state : '';
}

const TIME_ZONE = {
  NSW: 'Australia/Sydney',
  VIC: 'Australia/Melbourne',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  WA: 'Australia/Perth',
  TAS: 'Australia/Hobart',
  NT: 'Australia/Darwin',
  ACT: 'Australia/Canberra'
};

export function timeZoneFor(state) {
  return TIME_ZONE[normalizeState(state)] || 'Australia/Sydney';
}

// A punch belongs to the local day at the branch, not the UTC day.
export function localDate(value, state) {
  const date = new Date(value);
  if (!value) return '';
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZoneFor(state),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const pick = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

// A punch is read on the branch's own clock, so a manager in Sydney looking at a Perth store
// sees the times the Perth store recorded.
export function formatTimeInZone(value, state) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    timeZone: timeZoneFor(state),
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// How far ahead of UTC the zone is at that instant, in milliseconds.
function zoneOffset(date, zone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(date);
  const pick = (type) => Number((parts.find((part) => part.type === type) || {}).value || 0);
  const asUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour') % 24, pick('minute'), pick('second'));
  return asUtc - date.getTime();
}

// The stretch of UTC a local calendar day at the branch covers, so a day's filter picks up
// exactly the punches that store counts as that day.
export function dayRangeForState(dateIso, state) {
  const midnight = new Date(`${dateIso}T00:00:00Z`);
  const shift = zoneOffset(midnight, timeZoneFor(state));
  return {
    from: new Date(midnight.getTime() - shift).toISOString(),
    to: new Date(midnight.getTime() + 24 * 60 * 60 * 1000 - shift - 1).toISOString()
  };
}

export function holidaysForYear(state, year) {
  const code = normalizeState(state);
  if (!code) return {};
  const key = `${code}:${year}`;
  if (!cache.has(key)) {
    const map = {};
    yearHolidays(code, year).forEach((holiday) => {
      map[holiday.date] = holiday.key;
    });
    cache.set(key, map);
  }
  return cache.get(key);
}

export function holidayKeyFor(dateIso, state) {
  const day = dateIso ? String(dateIso).slice(0, 10) : '';
  if (!day) return '';
  const year = holidaysForYear(state, Number(day.slice(0, 4)));
  return year[day] || '';
}

// The holiday names in the shape the screens read them in.
function standardHoliday(dateIso, state) {
  const key = holidayKeyFor(dateIso, state);
  if (!key) return null;
  return { key, holiday: NAME[key] || { en: key, ko: key } };
}

function regionalHoliday(dateIso, state, regional) {
  const record = regional ? regional[`${normalizeState(state)}:${String(dateIso).slice(0, 10)}`] : null;
  if (!record) return null;
  return { record, holiday: { en: record.name || '', ko: record.name_ko || record.name || '' } };
}

// Holidays imported from the official state schedule, indexed by state and date. Only the
// ones the employer applied earn the holiday rate.
export function regionalMap(records) {
  const map = {};
  (records || []).forEach((record) => {
    if (!record || !record.date || (record.status && record.status !== 'applied')) return;
    const day = String(record.date).slice(0, 10);
    map[`${normalizeState(record.state)}:${day}`] = record;
  });
  return map;
}

// Which penalty rate a date earns: the weekday comes from the date, the holiday from the
// branch's state calendar and anything imported from the official schedule.
export function dayTypeFor(dateIso, state, regional) {
  const day = dateIso ? String(dateIso).slice(0, 10) : '';
  const registered = day ? regionalHoliday(day, state, regional) : null;
  if (registered) {
    return {
      key: 'public_holiday',
      holidayKey: '',
      holiday: registered.holiday,
      sourceUrl: registered.record.source_url || ''
    };
  }
  const standard = day ? standardHoliday(day, state) : null;
  if (standard) return { key: 'public_holiday', holidayKey: standard.key, holiday: standard.holiday, sourceUrl: '' };
  const weekday = day ? weekdayOf(day) : 1;
  if (weekday === 6) return { key: 'saturday', holidayKey: '', holiday: null, sourceUrl: '' };
  if (weekday === 0) return { key: 'sunday', holidayKey: '', holiday: null, sourceUrl: '' };
  return { key: 'weekday', holidayKey: '', holiday: null, sourceUrl: '' };
}

export function upcomingHolidays(state, fromIso, count = 4, regional) {
  const code = normalizeState(state);
  if (!code || !fromIso) return [];
  const year = Number(String(fromIso).slice(0, 4));
  const standard = [
    ...Object.entries(holidaysForYear(code, year)),
    ...Object.entries(holidaysForYear(code, year + 1))
  ].map(([date, key]) => ({
    date,
    holiday: NAME[key] || { en: key, ko: key },
    sourceUrl: ''
  }));
  const registered = Object.entries(regional || {})
    .filter(([key]) => key.startsWith(`${code}:`))
    .map(([key, record]) => ({
      date: key.slice(code.length + 1),
      holiday: { en: record.name || '', ko: record.name_ko || record.name || '' },
      sourceUrl: record.source_url || ''
    }));
  const merged = [...standard, ...registered].sort((a, b) => a.date.localeCompare(b.date));
  return merged.filter((holiday) => holiday.date >= fromIso).slice(0, count);
}