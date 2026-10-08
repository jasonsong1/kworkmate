import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveCaller } from '../../shared/kwAuth.ts';
import { sendEmail } from '../../shared/email.ts';
import { renderStageEmail } from '../../shared/emailStages.ts';

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

// A candidate the employer has already invited on keeps their place whatever the size is set to.
const PROGRESSED_STATUSES = ['mini_interview', 'final_interview', 'interview_scheduled', 'hired'];
// Everyone the screening has recommended, together with anybody it has already moved on.
const SHORTLISTED_STATUSES = [...PROGRESSED_STATUSES, 'top10'];

// The shortlist is held at the size the caller asks for: the strongest candidates fill it, anyone
// a better resume pushes out returns to the pool, and nobody already moved on to an interview is
// touched.
async function holdShortlist(base44: any, scored: any[], target: number) {
  const progressed = scored.filter((a) => PROGRESSED_STATUSES.includes(a.status)).length;
  const room = Math.max(0, target - progressed);
  const pool = scored.filter((a) => a.status === 'submitted' || a.status === 'top10');
  const keep = new Set(pool.slice(0, room).map((a) => a.id));
  const changes: any[] = [];
  pool.forEach((a) => {
    if (keep.has(a.id) && a.status !== 'top10') changes.push({ id: a.id, status: 'top10' });
    if (!keep.has(a.id) && a.status === 'top10') changes.push({ id: a.id, status: 'submitted' });
  });
  if (changes.length > 0) await base44.asServiceRole.entities.Applicant.bulkUpdate(changes);
  return changes.filter((change) => change.status === 'top10').length;
}

function buildPrompt(job, branch, applicant, company) {
  return `You are the AI screening assistant for an Australian hospitality employer.

JOB
- Title: ${job.title}
- Position: ${job.position || 'crew member'}
- Store: ${branch ? branch.name : 'the store'}
- Employment type: ${job.employment_type || 'casual'}
- Hourly rate: AUD ${job.hourly_rate || 0}
- Description: ${job.description || 'not provided'}
- Employer screening focus (weigh this most): ${job.screening_criteria || (company && company.screening_criteria) || 'not specified — use general hospitality suitability'}

APPLICANT SUPPLIED DATA
- Name: ${applicant.full_name}
- Visa type: ${applicant.visa_type || 'not supplied'}
- Visa expiry: ${applicant.visa_expiry || 'not supplied'}
- Notice period: ${applicant.notice_period || (applicant.available_immediately ? 'immediately' : 'not supplied')}
- Weekly availability (day -> hours they can work): ${JSON.stringify(applicant.availability || {})}
- Emergency contact supplied: ${applicant.emergency_contact_name ? 'yes' : 'no'}

Read the attached resume and return:
1. experience_years — total relevant hospitality / customer service experience in years.
2. skills — short list of practical skills.
3. certificates — list any certification found (RSA, RSG, food safety, first aid, barista, etc).
4. summary — exactly two short sentences written in Korean (한국어) about work experience only. Line one: their most recent or longest hospitality / customer service role and how long they held it. Line two: the rest of their relevant experience. Never mention availability, visa, location or opinions.
5. fit_score — 0 to 100 for THIS job. When an employer screening focus is given, weigh it above everything else. Then weight relevant hospitality experience heavily, then certifications, then weekly availability coverage, then visa validity of at least six months, then reliability signals.
6. strengths and concerns — short phrases written in Korean.
7. unreadable — true when the document is a scan or image with no extractable text; in that case still return fit_score 50 and a Korean summary saying the resume is a scan and needs manual review.

Score fairly and consistently. Reply with the JSON object only.`;
}

// Whoever pressed the button in the back office: a KWorkMate session or a platform sign-in, and
// only for a job their own company or branch covers.
async function managerFor(base44: any, req: Request, job: any): Promise<any> {
  const me = await resolveCaller(base44, req);
  if (!me) return { denied: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
  const sameCompany = Boolean(me.company_id && job.company_id && me.company_id === job.company_id);
  const sameBranch = (me.branch_ids || []).includes(job.branch_id);
  if (!(me.role === 'admin' || sameCompany || sameBranch)) {
    return { denied: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { me };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
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
    // The employer sets how many candidates are recommended: that number is the list a job opens
    // with, and the size of every further batch the button asks for.
    const topN = Number(company && company.ai_top_n) || 10;
    const limit = topN;

    if (body.action === 'send_rejections') {
      const guard = await managerFor(base44, req, job);
      if (guard.denied) return guard.denied;
      const all = await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId });
      // Only the people who were never shortlisted are written off, whatever their score rank:
      // a candidate the employer added in a later batch is still selected.
      const targets = all.filter((a) => a.status === 'submitted').slice(0, 40);

      let sent = 0;
      for (const a of targets) {
        const mail = renderStageEmail(
          company,
          'rejected',
          { name: a.full_name, job_title: job.title, store: branch ? branch.name : 'our store' },
          { brandColor: job.brand_color }
        );
        const ok = await sendEmail(base44, { to: a.email, subject: mail.subject, html: mail.html });
        if (ok) {
          sent += 1;
          await base44.asServiceRole.entities.Applicant.update(a.id, {
            status: 'rejected',
            rejection_sent_at: new Date().toISOString()
          });
        }
      }
      return Response.json({ ok: true, sent });
    }

    let targets = [];
    let pendingLeft = 0;
    if (body.applicant_id) {
      const one = await base44.asServiceRole.entities.Applicant.get(body.applicant_id).catch(() => null);
      if (one) targets = [one];
    } else {
      const guard = await managerFor(base44, req, job);
      if (guard.denied) return guard.denied;
      const pending = await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId, analysis_status: 'pending' });
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
        } catch (error) {
          console.error('sign url failed', error && error.message);
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
      } catch (error) {
        console.error('analysis failed', error && error.message);
        await base44.asServiceRole.entities.Applicant.update(applicant.id, {
          analysis_status: 'failed',
          ai_summary: '이력서 분석을 완료하지 못했습니다. 원본 이력서를 확인해 주세요.'
        });
      }
    }

    const all = await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId });
    const scored = all
      .filter((a) => typeof a.ai_score === 'number')
      .sort((x, y) => y.ai_score - x.ai_score);

    // Every scored candidate keeps their place in the order, but the shortlist itself only grows
    // on purpose: the button adds the next batch of the size the employer set.
    const updates = scored.map((a, index) => ({ id: a.id, rank: index + 1 }));
    if (updates.length > 0) await base44.asServiceRole.entities.Applicant.bulkUpdate(updates);

    // A resume that has just arrived leaves the list at the size the employer set. The button in
    // the back office adds one further batch of that same size on top of what is already listed,
    // so pressing it from a setting of one leaves two candidates, and then three.
    let added = 0;
    if (body.action === 'extend') {
      const listed = scored.filter((a) => SHORTLISTED_STATUSES.includes(a.status)).length;
      added = await holdShortlist(base44, scored, listed + limit);
    } else if (body.applicant_id) {
      added = await holdShortlist(base44, scored, limit);
    }

    // Nobody is emailed here: a candidate attaching a resume on the job page only fills the
    // shortlist in the back office, it does not mail the manager.

    return Response.json({ ok: true, analysed, ranked: updates.length, added, pending_left: pendingLeft });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}