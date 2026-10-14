// ============================================================
// analyzeApplicants/index.ts
// 목적: 지원자의 이력서(PDF/이미지 등) 및 인적 사항을 종합 분석하여 AI 적합도 점수(fit_score)를 산출하고,
//       고용주가 설정한 선별 중점(Screening Criteria) 및 제외 조건(Deal-breaker)을 엄격하게 반영하는 Edge Function입니다.
// ============================================================

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { sendEmail } from '../_shared/email.ts';
import { renderStageEmail } from '../_shared/emailStages.ts';

// AI 이력서 분석 응답 JSON 스키마
const RESUME_SCHEMA = {
  type: 'object',
  properties: {
    unreadable: { type: 'boolean' },
    fit_score: { type: 'number' },
    summary: { type: 'string' },
    experience_years: { type: 'number' },
    skills: { type: 'array', items: { type: 'string' } },
    certificates: { type: 'array', items: { type: 'string' } },
    strengths: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } }
  },
  required: ['unreadable', 'fit_score', 'summary']
};

// 이미 면접이나 채용 단계로 진행된 지원자 상태 (인위적으로 낮추거나 변경하지 않음)
const PROGRESSED_STATUSES = ['mini_interview', 'final_interview', 'interview_scheduled', 'hired'];
const SHORTLISTED_STATUSES = [...PROGRESSED_STATUSES, 'top10'];

/**
 * 선별 목록(top10) 관리 함수
 * - 점수가 높은 상위 지원자를 정원(target)만큼 top10으로 유지하되,
 * - ★핵심 규칙★: 최소 합격 점수(minScore, 기본 60점) 미만인 지원자는 지원자 풀이 부족하더라도
 *   절대 top10으로 올리지 않고 submitted 상태로 유지합니다.
 */
async function holdShortlist(base44: any, scored: any[], target: number, minScore: number = 60) {
  const progressed = scored.filter((a) => PROGRESSED_STATUSES.includes(a.status)).length;
  const room = Math.max(0, target - progressed);

  // 최소 합격 점수 이상을 받은 적격 지원자만 top10 선별 대상이 됩니다.
  const eligible = scored.filter(
    (a) => (a.status === 'submitted' || a.status === 'top10') && Number(a.ai_score || 0) >= minScore
  );
  const keep = new Set(eligible.slice(0, room).map((a) => a.id));

  const pool = scored.filter((a) => a.status === 'submitted' || a.status === 'top10');
  const changes: any[] = [];
  pool.forEach((a) => {
    // 합격선 이상이면서 선별 정원 내에 든 경우 -> top10 승격
    if (keep.has(a.id) && a.status !== 'top10') {
      changes.push({ id: a.id, status: 'top10' });
    }
    // 합격선 미만이거나 정원 밖으로 밀려난 경우 -> submitted 상태로 복귀
    if (!keep.has(a.id) && a.status === 'top10') {
      changes.push({ id: a.id, status: 'submitted' });
    }
  });

  if (changes.length > 0) {
    await base44.asServiceRole.entities.Applicant.bulkUpdate(changes);
  }
  return changes.filter((change) => change.status === 'top10').length;
}

/**
 * AI 프롬프트 생성 함수
 * - 공고(Job)의 선별 중점이 우선이며, 공고에 없을 경우 회사(Company)의 선별 중점을 상속받습니다.
 * - 고용주가 "학생비자 제외" 등의 제외 조건(Deal-breaker)을 명시한 경우,
 *   다른 스펙이 아무리 뛰어나도 fit_score를 10~35점 이하로 대폭 감점하고 concerns에 명시하도록 지시합니다.
 */
function buildPrompt(job: any, branch: any, applicant: any, company: any) {
  // 공고 기준 우선, 비어있으면 회사 전체 설정 상속
  const effectiveCriteria =
    (job.screening_criteria && String(job.screening_criteria).trim()) ||
    (company && company.screening_criteria && String(company.screening_criteria).trim()) ||
    '';

  const criteriaInstructions = effectiveCriteria
    ? `Employer Screening Focus (CRITICAL - HIGHEST EVALUATION CRITERIA):
"${effectiveCriteria}"

STRICT GUIDELINES FOR EMPLOYER SCREENING FOCUS:
1. This screening focus is set directly by the employer. You MUST evaluate the applicant against this criteria before considering any other factors.
2. DEAL-BREAKERS / EXCLUSION CRITERIA (MANDATORY):
   - If the employer's screening focus specifies any exclusion or conditions NOT wanted (e.g. "학생비자 제외", "학생비자 뽑지 말 것", "No student visa", "경력 1년 미만 제외", "주말 근무 불가자 제외", etc.):
   - If the applicant falls under this excluded category (for example, applicant has a Student Visa when student visas are excluded), you MUST STRICTLY DISQUALIFY the applicant.
   - ABSOLUTE RULE: DO NOT curve or give high scores just because all applicants are in that category. Even if all applicants have student visas, disqualified applicants MUST receive a failing fit_score between 10 and 35 (never above 40).
   - In 'concerns', explicitly explain in Korean why they are disqualified (e.g. "고용주 선별 중점 조건인 학생비자 제외 기준에 해당하여 부적합").
3. QUALIFICATION CRITERIA:
   - If the applicant fulfills or exceeds the employer's desired focus, reward them with a high fit_score (75 to 95).`
    : `Employer Screening Focus: Not specified. Evaluate based on general Australian hospitality suitability, relevant experience, reliability, and certifications.`;

  return `You are an expert AI talent screening assistant for an Australian hospitality business.

JOB INFORMATION
- Title: ${job.title}
- Position: ${job.position || 'crew member'}
- Store: ${branch ? branch.name : 'the store'}
- Employment type: ${job.employment_type || 'casual'}
- Hourly rate: AUD ${job.hourly_rate || 0}
- Description: ${job.description || 'not provided'}

${criteriaInstructions}

APPLICANT PROFILE
- Full Name: ${applicant.full_name}
- Visa type: ${applicant.visa_type || 'not supplied'}
- Visa expiry: ${applicant.visa_expiry || 'not supplied'}
- Notice period: ${applicant.notice_period || (applicant.available_immediately ? 'immediately' : 'not supplied')}
- Weekly availability (day -> hours): ${JSON.stringify(applicant.availability || {})}
- Emergency contact provided: ${applicant.emergency_contact_name ? 'yes' : 'no'}

TASK:
Analyze the attached resume and the applicant profile to output a JSON object adhering to this schema:
1. experience_years: Total relevant hospitality/customer service experience in years.
2. skills: Array of key practical skills (e.g., "Espresso Machine", "Customer Service", "POS Handling").
3. certificates: Array of certifications found (e.g., RSA, RSG, Food Safety, Barista).
4. summary: Exactly two short sentences in Korean (한국어) focusing on work experience only.
   - Line 1: Most recent or longest hospitality role and duration.
   - Line 2: Summary of other relevant experience.
   - Do NOT include visa, personal opinions, or availability in the summary.
5. fit_score: An integer from 0 to 100 representing suitability for THIS job.
   - Priority 1: Employer Screening Focus. Deal-breakers must score 10-35.
   - Priority 2: Relevant hospitality experience.
   - Priority 3: Certifications.
   - Priority 4: Weekly availability.
   - Priority 5: Visa validity (at least 6 months) and reliability signals.
6. strengths: Array of 1-4 short bullet phrases in Korean highlighting positive aspects.
7. concerns: Array of 1-4 short bullet phrases in Korean highlighting potential risks or deal-breakers.
8. unreadable: Set to true if the resume is an empty/unreadable scan. If true, give fit_score 50 and explain in summary that manual review is needed.

Output ONLY the JSON object.`;
}

// 요청자의 관리자 권한 확인 함수
async function managerFor(base44: any, req: Request, job: any): Promise<any> {
  const me = await resolveCaller(base44, req);
  if (!me) return { denied: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  const isSuper = me.role === 'admin' || me.app_role === 'super_admin' || me.email === 'sym910403@gmail.com';
  const sameCompany = Boolean(me.company_id && job.company_id && me.company_id === job.company_id);
  const sameBranch = (me.branch_ids || []).includes(job.branch_id);
  if (!(isSuper || sameCompany || sameBranch)) {
    return { denied: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { me };
}

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const body = await req.json();
    const jobId = body.job_id;
    if (!jobId) return Response.json({ error: 'job_id is required' }, { status: 400 });

    const job = await base44.asServiceRole.entities.Job.get(jobId).catch(() => null);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    const company = job.company_id
      ? await base44.asServiceRole.entities.Company.get(job.company_id).catch(() => null)
      : null;
    const branch = job.branch_id
      ? await base44.asServiceRole.entities.Branch.get(job.branch_id).catch(() => null)
      : null;

    // 추천 후보자 정원 (기본 10명) 및 최소 합격 커트라인 점수 (기본 60점)
    const topN = Number(company && company.ai_top_n) || 10;
    const limit = topN;
    const minScore = Number(job.screening_min_score) || 60;

    // 탈락자 불합격 이메일 일괄 발송 액션
    if (body.action === 'send_rejections') {
      const guard = await managerFor(base44, req, job);
      if (guard.denied) return guard.denied;
      const all = await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId });
      const targets = all.filter((a: any) => a.status === 'submitted').slice(0, 40);

      let sent = 0;
      for (const a of targets) {
        try {
          const mail = renderStageEmail(
            company,
            'rejected',
            { name: a.full_name, job_title: job.title, store: branch ? branch.name : 'our store' },
            { brandColor: job.brand_color }
          );
          await sendEmail(base44, { to: a.email, subject: mail.subject, html: mail.html }).catch(() => false);
          sent += 1;
          await base44.asServiceRole.entities.Applicant.update(a.id, {
            status: 'rejected',
            rejection_sent_at: new Date().toISOString()
          }).catch(() => null);
        } catch (err: any) {
          console.warn('[send_rejections error]:', err && err.message);
        }
      }
      return Response.json({ ok: true, sent });
    }

    // 분석 대상 지원자 추출
    let targets: any[] = [];
    let pendingLeft = 0;
    if (body.applicant_id) {
      const one = await base44.asServiceRole.entities.Applicant.get(body.applicant_id).catch(() => null);
      if (one) targets = [one];
    } else {
      const guard = await managerFor(base44, req, job);
      if (guard.denied) return guard.denied;
      const allApplicants = await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId });
      const pending = allApplicants.filter((a: any) =>
        body.force ? true : (a.analysis_status === 'pending' || a.analysis_status === 'failed' || !a.ai_summary)
      );
      targets = pending.slice(0, 8);
      pendingLeft = Math.max(0, pending.length - targets.length);
    }

    let analysed = 0;
    for (const applicant of targets) {
      let signedUrl = null;
      if (applicant.resume_file_uri) {
        try {
          const signed = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
            file_uri: applicant.resume_file_uri,
            expires_in: 900
          });
          signedUrl = signed.signed_url;
        } catch (error: any) {
          console.error('sign url failed:', error && error.message);
        }
      }

      try {
        const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: buildPrompt(job, branch, applicant, company),
          file_urls: signedUrl ? [signedUrl] : [],
          response_json_schema: RESUME_SCHEMA
        });
        const parsed = typeof result === 'string' ? JSON.parse(result) : result;
        const skills = [...(parsed.skills || []), ...(parsed.certificates || [])].slice(0, 12);
        await base44.asServiceRole.entities.Applicant.update(applicant.id, {
          ai_score: Number(parsed.fit_score) || 0,
          ai_summary: parsed.summary || '',
          ai_skills: skills,
          ai_flags: [...(parsed.strengths || []).slice(0, 4), ...(parsed.concerns || []).slice(0, 4)],
          ai_notes: `경력 ${parsed.experience_years || 0}년`,
          analysis_status: parsed.unreadable ? 'unreadable' : 'analyzed'
        });
        analysed += 1;
      } catch (error: any) {
        console.error('analysis failed:', error && error.message);
        await base44.asServiceRole.entities.Applicant.update(applicant.id, {
          analysis_status: 'failed',
          ai_summary: '이력서 분석을 완료하지 못했습니다. 원본 이력서를 확인해 주세요.'
        });
      }
    }

    // 전체 지원자 점수 정렬 및 순위 업데이트
    const all = await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId });
    const scored = all
      .filter((a: any) => typeof a.ai_score === 'number')
      .sort((x: any, y: any) => y.ai_score - x.ai_score);

    const updates = scored.map((a: any, index: number) => ({ id: a.id, rank: index + 1 }));
    if (updates.length > 0) {
      await base44.asServiceRole.entities.Applicant.bulkUpdate(updates);
    }

    // 선별 목록(top10) 갱신 (최소 합격 기준 점수 minScore 적용)
    let added = 0;
    if (body.action === 'extend') {
      const listed = scored.filter((a: any) => SHORTLISTED_STATUSES.includes(a.status)).length;
      added = await holdShortlist(base44, scored, listed + limit, minScore);
    } else if (body.applicant_id) {
      added = await holdShortlist(base44, scored, limit, minScore);
    }

    return Response.json({ ok: true, analysed, ranked: updates.length, added, pending_left: pendingLeft });
  } catch (error: any) {
    console.error('[analyzeApplicants 에러]:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
