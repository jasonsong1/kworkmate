// ============================================================
// submitApplication/index.ts (Supabase Edge Function)
// 목적: 공고 지원자가 온라인 링크를 통해 이력서 및 지원서 제출
// ============================================================

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
const waitUntil = (p: Promise<any>) => {
  if (typeof (globalThis as any).EdgeRuntime !== 'undefined' && (globalThis as any).EdgeRuntime?.waitUntil) {
    (globalThis as any).EdgeRuntime.waitUntil(p);
  } else {
    p.catch?.((e: any) => console.error(e));
  }
};
import { normalizePhone } from '../_shared/util.ts';
import { sendApplicantEmail } from '../_shared/email.ts';
import { renderStageEmail } from '../_shared/emailStages.ts';

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const body = await req.json();

    const jobId = body.job_id;
    const email = String(body.email || '').trim().toLowerCase();
    const phone = normalizePhone(body.phone);
    const fullName = String(body.full_name || '').trim();

    if (!jobId) return Response.json({ error: 'job_id is required' }, { status: 400 });
    if (!fullName || !email || !phone) {
      return Response.json({ error: 'Name, email and phone are required' }, { status: 400 });
    }
    const job = await base44.asServiceRole.entities.Job.get(jobId).catch(() => null);
    if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

    // 고용주가 비활성화한 질문은 필수가 아니므로 체크를 건너뜁니다.
    const askedKeys = (Array.isArray(job.required_questions) ? job.required_questions : [])
      .filter((q: any) => q && q.enabled !== false)
      .map((q: any) => q.key);
    const isAsked = (key: string) => askedKeys.length === 0 || askedKeys.includes(key);

    if (!body.resume_file_uri && isAsked('resume')) {
      return Response.json({ error: 'A resume file is required' }, { status: 400 });
    }
    if (!body.visa_expiry && isAsked('visa_expiry')) {
      return Response.json({ error: 'Visa expiry date is required' }, { status: 400 });
    }
    if (job.status !== 'open') return Response.json({ ok: false, closed: true });

    const branch = job.branch_id
      ? await base44.asServiceRole.entities.Branch.get(job.branch_id).catch(() => null)
      : null;
    const company = job.company_id
      ? await base44.asServiceRole.entities.Company.get(job.company_id).catch(() => null)
      : null;

    // 중복 지원 확인
    const byEmail = await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId, email });
    const byPhone = phone
      ? await base44.asServiceRole.entities.Applicant.filter({ job_id: jobId, phone })
      : [];
    if (byEmail.length > 0 || byPhone.length > 0) {
      return Response.json({ ok: false, duplicate: true });
    }

    // 지원자 정보 및 이력서 저장
    const applicant = await base44.asServiceRole.entities.Applicant.create({
      company_id: job.company_id,
      branch_id: job.branch_id,
      job_id: jobId,
      full_name: fullName,
      email,
      phone,
      visa_type: body.visa_type || '',
      visa_expiry: body.visa_expiry,
      availability: body.availability || {},
      available_immediately: body.available_immediately !== false,
      notice_period: body.notice_period || '',
      emergency_contact_name: body.emergency_contact_name || '',
      emergency_contact_phone: body.emergency_contact_phone || '',
      answers: body.answers || [],
      resume_file_uri: body.resume_file_uri,
      resume_filename: body.resume_filename || 'resume',
      resume_size: Number(body.resume_size) || 0,
      analysis_status: 'pending',
      status: 'submitted'
    });

    // 지원 완료 이메일 발송 시도
    let emailOk = false;
    try {
      const place = branch ? `${branch.name}${branch.suburb ? ` (${branch.suburb})` : ''}` : 'our store';
      const mail = renderStageEmail(
        company,
        'applied',
        { name: fullName, job_title: job.title, store: place },
        { brandColor: job.brand_color || (branch && branch.brand_color) }
      );
      const emailResult = await sendApplicantEmail(base44, applicant, {
        type: 'applied',
        subject: mail.subject,
        html: mail.html
      });
      emailOk = Boolean(emailResult && emailResult.ok);
    } catch (e: any) {
      console.warn('[sendApplicantEmail] warning:', e?.message);
    }

    // AI 지원자 분석 비동기 호출 (실패하더라도 지원서 접수는 정상 완료)
    try {
      waitUntil(
        base44.functions.invoke('analyzeApplicants', {
          job_id: jobId,
          applicant_id: applicant.id
        }).catch((e: any) => console.warn('[analyzeApplicants] async error:', e?.message))
      );
    } catch (_) {}

    return Response.json({ ok: true, applicant_id: applicant.id, email_sent: emailOk });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
