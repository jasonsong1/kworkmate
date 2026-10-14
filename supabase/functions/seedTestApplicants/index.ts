// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/seedTestApplicants/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';

// Test data only, and super admins only: one press fills a job with dummy applicants so the
// hiring flow can be walked through. Nothing is emailed, and each press adds another batch.
const BATCH = 15;

const NAMES = [
  'James Kim',
  'Sarah Lee',
  'Daniel Park',
  'Emma Choi',
  'Liam Nguyen',
  'Olivia Chen',
  'Noah Smith',
  'Mia Johnson',
  'Ethan Brown',
  'Chloe Wilson',
  'Ryan Jeong',
  'Grace Han',
  'Jayden Taylor',
  'Ava Martin',
  'Lucas Anderson',
  'Sophie Kang',
  'Leo Thompson',
  'Isla White',
  'Max Walker',
  'Zoe Harris',
  'Ben Seo',
  'Ella Clark',
  'Tom Irwin',
  'Ruby Lewis',
  'Alex Yoon',
  'Hana Mori',
  'Jack Reynolds',
  'Lily Baker',
  'Owen Hughes',
  'Nina Patel',
  'Cody Simpson',
  'Amber Woods',
  'Sean Murphy',
  'Tara Ellis',
  'Dean Foster',
  'Ivy Lawson'
];

const VISAS = [
  { type: 'pr_citizen', expiry: '' },
  { type: 'working_holiday', expiry: '2027-02-28' },
  { type: 'student', expiry: '2028-03-15' },
  { type: 'graduate', expiry: '2029-01-31' },
  { type: 'other', expiry: '2027-08-31' }
];

const SKILLS = [
  'Barista',
  'POS',
  'Customer service',
  'Food handling',
  'RSA',
  'Kitchen hand',
  'Team leading',
  'Cash handling',
  'Bar service',
  'Cleaning'
];

const SUMMARIES = [
  '카페·레스토랑 3년 경력. 주말 포함 주 4일 근무 가능합니다.',
  '호텔 조식 운영 경험 2년. 오픈 시간 근무에 익숙합니다.',
  '바리스타 자격 보유. 바쁜 러시 시간대 대응 경험이 있습니다.',
  '주방 보조 및 서빙 경험 1년. 위생 관리에 강점이 있습니다.',
  '고객 응대 중심 경력 5년. 신입 교육 경험도 있습니다.',
  '학업과 병행하며 주 20시간 근무를 원합니다.',
  '이전 매장에서 오픈·마감을 담당했습니다.',
  '음료 제조 경력 1년, 레시피 숙지가 빠릅니다.',
  'RSA 보유. 바·서빙 경력 4년입니다.',
  '장기 근무를 원하며 주 5일 풀타임 가능합니다.'
];

const ANSWERS = [
  'Available 4 days a week including weekends.',
  'I can start immediately.',
  'I have 3 years of cafe experience.',
  'I live 15 minutes from the store.',
  'I hold a current RSA certificate.',
  'Yes, I am comfortable with late finishes.',
  'I worked in a busy takeaway store.',
  'English is my second language, but I have worked in Australia for 2 years.'
];

function pick(list, index) {
  return list[((index % list.length) + list.length) % list.length];
}

function slug(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '.')
    .replace(/^\.|\.$/g, '');
}

function pad(value) {
  return String(value).padStart(3, '0');
}

// Monday to Friday, sometimes with the weekend on top: enough for the roster to have something to
// work with when a dummy applicant is later hired.
function availability(index) {
  const weekday = index % 3 === 0 ? { from: '06:00', to: '14:00' } : { from: '09:00', to: '17:00' };
  const matrix = {
    mon: weekday,
    tue: weekday,
    wed: weekday,
    thu: weekday,
    fri: weekday,
    sat: index % 2 === 0 ? { from: '10:00', to: '18:00' } : { from: '', to: '' },
    sun: { from: '', to: '' }
  };
  return matrix;
}

async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    const isSuper = me && (
      me.role === 'admin' ||
      me.app_role === 'super_admin' ||
      (me.email && me.email.toLowerCase() === 'sym910403@gmail.com')
    );
    if (!isSuper) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const jobId = String(body.job_id || '');
    if (!jobId) return Response.json({ error: 'job_id is required' }, { status: 400 });

    const job = await base44.asServiceRole.entities.Job.get(jobId).catch(() => null);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    const existing = await base44.asServiceRole.entities.Applicant.count({ job_id: jobId }).catch(() => 0);
    // The batch carries its own token so a second press never repeats an address.
    const token = Date.now().toString(36).slice(-4);
    const questions = (Array.isArray(job.custom_questions) ? job.custom_questions : [])
      .filter((question) => question && question.label)
      .map((question) => question.label);

    const rows = [];
    for (let i = 0; i < BATCH; i += 1) {
      const index = existing + i;
      const name = pick(NAMES, index);
      const visa = pick(VISAS, index);
      // A spread wide enough for the shortlist to differ from one run to the next.
      const score = 48 + ((index * 7) % 49);
      const contact = pick(NAMES, index + 11).split(' ')[0];
      rows.push({
        company_id: job.company_id,
        branch_id: job.branch_id,
        job_id: jobId,
        full_name: name,
        email: `${slug(name)}.${token}${i}@example.com`,
        phone: `04${String(11 + (index % 80))} ${pad(100 + ((index * 3) % 899))} ${pad(100 + ((index * 7) % 899))}`,
        visa_type: visa.type,
        visa_expiry: visa.expiry,
        availability: availability(index),
        available_immediately: index % 5 !== 0,
        notice_period: index % 5 === 0 ? '1 week' : '',
        emergency_contact_name: `${contact} ${pick(NAMES, index + 5).split(' ')[1]}`,
        emergency_contact_phone: `04${String(12 + (index % 79))} ${pad(200 + ((index * 5) % 799))} ${pad(300 + ((index * 9) % 699))}`,
        answers: questions.map((label, position) => ({
          question: label,
          answer: pick(ANSWERS, index + position)
        })),
        resume_file_uri: 'private/1791946107281_fys6irv.pdf',
        resume_filename: `${slug(name)}-resume.pdf`,
        resume_size: 154200,
        ai_score: score,
        ai_summary: pick(SUMMARIES, index),
        ai_skills: [pick(SKILLS, index), pick(SKILLS, index + 3)],
        ai_flags: score < 60 ? ['경력 확인 필요'] : [],
        analysis_status: 'analyzed',
        status: 'submitted'
      });
    }

    const created = await base44.asServiceRole.entities.Applicant.bulkCreate(rows);
    return Response.json({
      ok: true,
      job_id: jobId,
      created: created.length,
      total: existing + created.length
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
