import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendEmail, brandedEmail } from '../../shared/email.ts';

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
- Weekly availability (day -> shifts): ${JSON.stringify(applicant.availability || {})}
- Emergency contact supplied: ${applicant.emergency_contact_name ? 'yes' : 'no'}

Read the attached resume and return:
1. experience_years — total relevant hospitality / customer service experience in years.
2. skills — short list of practical skills.
3. certificates — list any certification found (RSA, RSG, food safety, first aid, barista, etc).
4. summary — exactly two short lines in English about work experience only. Line one: their most recent or longest hospitality / customer service role and how long they held it. Line two: the rest of their relevant experience. Never mention availability, visa, location or opinions.
5. fit_score — 0 to 100 for THIS job. When an employer screening focus is given, weigh it above everything else. Then weight relevant hospitality experience heavily, then certifications, then weekly availability coverage, then visa validity of at least six months, then reliability signals.
6. strengths and concerns — short phrases.
7. unreadable — true when the document is a scan or image with no extractable text; in that case still return fit_score 50 and a summary saying the resume is a scan and needs manual review.

Score fairly and consistently. Reply with the JSON object only.`;
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
    const topN = Number(company && company.ai_top_n) || 10;

    if (body.action === 'send_rejections') {
      const me = await base44.auth.me();
      if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      if (me.company_id && job.company_id && me.company_id !== job.company_id) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      const all = await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId });
      const targets = all
        .filter((a) => ['submitted', 'top10', 'mini_interview', 'final_interview'].includes(a.status))
        .filter((a) => (a.rank || 9999) > topN)
        .slice(0, 40);

      let sent = 0;
      for (const a of targets) {
        const ok = await sendEmail(base44, {
          to: a.email,
          subject: `Update on your application — ${job.title}`,
          html: brandedEmail({
            heading: 'Thank you for your application',
            brandColor: job.brand_color,
            lines: [
              `Hi ${a.full_name},`,
              `Thank you for your interest in <b>${job.title}</b> at ${branch ? branch.name : 'our store'}.`,
              'After reviewing this round of applications we are not moving forward with your application. We keep your details on file and would be glad to consider you for future openings.'
            ],
            footer: `${company ? company.name : ''} · kworkmate`
          })
        });
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
    if (body.applicant_id) {
      const one = await base44.asServiceRole.entities.Applicant.get(body.applicant_id).catch(() => null);
      if (one) targets = [one];
    } else {
      const me = await base44.auth.me();
      if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
      const pending = await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId, analysis_status: 'pending' });
      targets = pending.slice(0, 8);
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
          ai_notes: `Experience: ${parsed.experience_years || 0} yrs`,
          analysis_status: parsed.unreadable ? 'unreadable' : 'analyzed'
        });
        analysed += 1;
      } catch (error) {
        console.error('analysis failed', error && error.message);
        await base44.asServiceRole.entities.Applicant.update(applicant.id, {
          analysis_status: 'failed',
          ai_summary: 'AI analysis could not complete. Please review the original resume.'
        });
      }
    }

    const all = await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId });
    const scored = all
      .filter((a) => typeof a.ai_score === 'number')
      .sort((x, y) => y.ai_score - x.ai_score);

    const updates = scored.map((a, index) => {
      const rank = index + 1;
      const patch = { id: a.id, rank };
      if (rank <= topN && ['submitted', 'top10'].includes(a.status)) patch.status = 'top10';
      return patch;
    });
    if (updates.length > 0) await base44.asServiceRole.entities.Applicant.bulkUpdate(updates);

    if (body.applicant_id) {
      const mine = updates.find((u) => u.id === body.applicant_id);
      if (mine && mine.rank <= topN && mine.status === 'top10') {
        const shortlist = updates.slice(0, topN).map((u, i) => `${i + 1}. ${scored[i].full_name} — ${scored[i].ai_score}`).join('\n');
        const recipients = [
          ...new Set([...(branch && branch.manager_emails) || [], job.contact_email].filter(Boolean))
        ].slice(0, 3);
        for (const to of recipients) {
          await sendEmail(base44, {
            to,
            subject: `New top candidate — ${job.title}`,
            html: brandedEmail({
              heading: 'A candidate entered your AI shortlist',
              brandColor: job.brand_color,
              lines: [
                `<b>${scored.find((s) => s.id === body.applicant_id).full_name}</b> scored ${mine.rank} out of the current applicants for ${job.title}.`,
                'Current AI top list:',
                `<pre style="font-family:monospace;font-size:13px;color:#334155;white-space:pre-wrap">${shortlist}</pre>`
              ],
              footer: `${company ? company.name : ''} · kworkmate`
            })
          });
        }
      }
    }

    return Response.json({ ok: true, analysed, ranked: updates.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}