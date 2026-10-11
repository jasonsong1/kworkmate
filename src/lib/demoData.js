// Fixed sample data for the public demo. Nothing here touches the database: the demo runs on
// this data plus client-side state, so no record is created, no email is sent and no analysis runs.

export const DEMO_COMPANY = {
  name: 'Hanuri Hospitality Group',
  brand_color: '#3c83f6',
};

export const DEMO_BRANCHES = [
  { id: 'br-surry', name: 'Surry Hills', code: 'SH', state: 'NSW' },
  { id: 'br-cbd', name: 'Melbourne CBD', code: 'MC', state: 'VIC' },
];

export const DEMO_JOBS = [
  {
    id: 'job-barista',
    branch: 'Surry Hills',
    title: 'Barista (주말)',
    position: 'Barista',
    employment_type: 'casual',
    hourly_rate: 32.5,
    openings: 2,
    status: 'open',
  },
  {
    id: 'job-kitchen',
    branch: 'Surry Hills',
    title: 'Kitchen Hand',
    position: 'Kitchen',
    employment_type: 'part_time',
    hourly_rate: 30.4,
    openings: 1,
    status: 'open',
  },
  {
    id: 'job-floor',
    branch: 'Melbourne CBD',
    title: 'Floor Supervisor',
    position: 'Floor',
    employment_type: 'full_time',
    hourly_rate: 38,
    openings: 1,
    status: 'draft',
  },
];

export const DEMO_APPLICANTS = [
  {
    id: 'ap-emma',
    job_id: 'job-barista',
    name: 'Emma Wilson',
    email: 'emma.wilson@example.com',
    phone: '0402 118 220',
    analyzed: true,
    score: 92,
    stage: 'interview',
    summary: '3년 카페 경력, 주말 전일 근무 가능, 라떼아트와 POS 경험.',
    skills: ['Latte art', 'POS', '주말 전일'],
    flags: [],
  },
  {
    id: 'ap-liam',
    job_id: 'job-barista',
    name: 'Liam Chen',
    email: 'liam.chen@example.com',
    phone: '0431 902 774',
    analyzed: true,
    score: 87,
    stage: 'video',
    summary: '브런치 카페 2년, 오픈 준비와 마감 경험. 워킹홀리데이 비자.',
    skills: ['오픈 준비', '마감', '영어·중국어'],
    flags: [],
  },
  {
    id: 'ap-ava',
    job_id: 'job-barista',
    name: 'Ava Nguyen',
    email: 'ava.nguyen@example.com',
    phone: '0455 310 668',
    analyzed: true,
    score: 84,
    stage: 'mini',
    summary: '주말 근무 선호, 고객 응대 경험 3년.',
    skills: ['고객 응대', '주말 근무'],
    flags: [],
  },
  {
    id: 'ap-noah',
    job_id: 'job-barista',
    name: 'Noah Patel',
    email: 'noah.patel@example.com',
    phone: '0420 771 335',
    analyzed: true,
    score: 78,
    stage: 'submitted',
    summary: '카페 경력 1년, 현재 학생 비자로 주 20시간 근무 가능.',
    skills: ['음료 제조', '주 20시간'],
    flags: ['학기 중 근무 시간 확인 필요'],
  },
  {
    id: 'ap-mia',
    job_id: 'job-barista',
    name: 'Mia Rossi',
    email: 'mia.rossi@example.com',
    phone: '0466 208 914',
    analyzed: true,
    score: 71,
    stage: 'submitted',
    summary: '레스토랑 홀 경력 4년, 커피는 교육 중.',
    skills: ['홀 서비스', '빠른 학습'],
    flags: ['바리스타 경력 없음'],
  },
  {
    id: 'ap-jack',
    job_id: 'job-barista',
    name: "Jack O'Brien",
    email: 'jack.obrien@example.com',
    phone: '0411 550 208',
    analyzed: true,
    score: 63,
    stage: 'submitted',
    summary: '첫 호스피탈리티 근무 지원, 평일 저녁 위주 가능.',
    skills: ['평일 저녁'],
    flags: ['경력 없음', '주말 근무 불가'],
  },
  {
    id: 'ap-sophia',
    job_id: 'job-barista',
    name: 'Sophia Kim',
    email: 'sophia.kim@example.com',
    phone: '0498 332 117',
    analyzed: false,
    score: null,
    stage: 'submitted',
    summary: '',
    skills: [],
    flags: [],
  },
  {
    id: 'ap-tom',
    job_id: 'job-barista',
    name: 'Tom Baker',
    email: 'tom.baker@example.com',
    phone: '0470 118 992',
    analyzed: false,
    score: null,
    stage: 'submitted',
    summary: '',
    skills: [],
    flags: [],
  },
  {
    id: 'ap-priya',
    job_id: 'job-kitchen',
    name: 'Priya Sharma',
    email: 'priya.sharma@example.com',
    phone: '0433 664 210',
    analyzed: true,
    score: 88,
    stage: 'submitted',
    summary: '주방 보조 2년, 위생 교육 이수, 저녁 근무 가능.',
    skills: ['주방 보조', '위생 교육'],
    flags: [],
  },
  {
    id: 'ap-daniel',
    job_id: 'job-kitchen',
    name: 'Daniel Costa',
    email: 'daniel.costa@example.com',
    phone: '0445 887 401',
    analyzed: true,
    score: 74,
    stage: 'submitted',
    summary: '케이터링 경력 1년, 주말 저녁 근무 가능.',
    skills: ['케이터링', '주말 저녁'],
    flags: [],
  },
  {
    id: 'ap-hana',
    job_id: 'job-kitchen',
    name: 'Hana Suzuki',
    email: 'hana.suzuki@example.com',
    phone: '0481 220 776',
    analyzed: false,
    score: null,
    stage: 'submitted',
    summary: '',
    skills: [],
    flags: [],
  },
];

// Weekly roster draft: one entry per shift, day 0 is Monday.
export const DEMO_SHIFTS = [
  { day: 0, employee: 'Emma Wilson', position: 'Barista', start: '07:00', end: '13:00' },
  { day: 0, employee: 'Liam Chen', position: 'Kitchen', start: '12:00', end: '18:00' },
  { day: 1, employee: 'Emma Wilson', position: 'Barista', start: '07:00', end: '13:00' },
  { day: 1, employee: 'Noah Patel', position: 'Floor', start: '17:00', end: '22:00' },
  { day: 2, employee: 'Ava Nguyen', position: 'Barista', start: '07:00', end: '13:00' },
  { day: 2, employee: 'Liam Chen', position: 'Kitchen', start: '12:00', end: '18:00' },
  { day: 3, employee: 'Emma Wilson', position: 'Barista', start: '07:00', end: '13:00' },
  { day: 3, employee: 'Noah Patel', position: 'Floor', start: '17:00', end: '22:00' },
  { day: 4, employee: 'Ava Nguyen', position: 'Barista', start: '07:00', end: '13:00' },
  { day: 4, employee: 'Liam Chen', position: 'Kitchen', start: '12:00', end: '18:00' },
  { day: 4, employee: 'Noah Patel', position: 'Floor', start: '17:00', end: '22:00' },
  { day: 5, employee: 'Emma Wilson', position: 'Barista', start: '08:00', end: '16:00' },
  { day: 5, employee: 'Ava Nguyen', position: 'Barista', start: '08:00', end: '16:00' },
  { day: 6, employee: 'Mia Rossi', position: 'Floor', start: '08:00', end: '16:00' },
];

export const DEMO_SLOTS = [
  { id: 'slot-1', day: 2, start: '10:00', end: '10:20', place: 'Surry Hills 매장', applicant: 'Emma Wilson' },
  { id: 'slot-2', day: 2, start: '10:20', end: '10:40', place: 'Surry Hills 매장', applicant: '' },
  { id: 'slot-3', day: 2, start: '14:00', end: '14:20', place: 'Surry Hills 매장', applicant: '' },
  { id: 'slot-4', day: 3, start: '11:00', end: '11:20', place: 'Surry Hills 매장', applicant: '' },
];

// Onboarding answers line up with the question list in the demo copy (see demoText.js).
export const DEMO_ONBOARDINGS = [
  {
    id: 'ob-emma',
    name: 'Emma Wilson',
    position: 'Barista',
    branch: 'Surry Hills',
    status: 'in_progress',
    started: '2026-10-06',
    answers: [
      'Working holiday (417)',
      '주 20–25시간',
      'Sarah Wilson · 0403 221 118',
      '062 000 · 1234 5678',
      '',
    ],
    docs: [
      { key: 'passport', state: 'submitted' },
      { key: 'tfn', state: 'submitted' },
      { key: 'super', state: 'waiting' },
      { key: 'bank', state: 'waiting' },
    ],
    submittedAt: '',
  },
  {
    id: 'ob-liam',
    name: 'Liam Chen',
    position: 'Kitchen',
    branch: 'Surry Hills',
    status: 'completed',
    started: '2026-10-01',
    answers: [
      'Working holiday (417)',
      '주 25–30시간',
      'Amy Chen · 0431 664 208',
      '062 000 · 8891 2245',
      '회사 기본 펀드 사용',
    ],
    docs: [
      { key: 'passport', state: 'submitted' },
      { key: 'tfn', state: 'submitted' },
      { key: 'super', state: 'submitted' },
      { key: 'bank', state: 'submitted' },
    ],
    submittedAt: '2026-10-03 14:22',
  },
];

export function demoWeek() {
  const now = new Date();
  const offset = (now.getDay() + 6) % 7; // Monday is the first day of the demo week
  const monday = new Date(now);
  monday.setDate(now.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return { index: i, date: day };
  });
}

export function demoTodayIndex() {
  return (new Date().getDay() + 6) % 7;
}