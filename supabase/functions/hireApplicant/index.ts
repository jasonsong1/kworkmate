// 지원자 채용확정 및 온보딩/직원 프로필 자동 생성 Edge Function입니다.
import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { formatEmployeeNumber, randomToken } from '../_shared/util.ts';
import { onboardingAttachments, sendApplicantEmail, portalLink } from '../_shared/email.ts';
import { renderStageEmail } from '../_shared/emailStages.ts';
import { sendAccountAccessEmail } from '../_shared/account.ts';
import { packageState, resolveLimit } from '../_shared/packages.ts';

async function handler(req) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const applicant = await base44.asServiceRole.entities.Applicant.get(body.applicant_id).catch(() => null);
    if (!applicant) return Response.json({ error: 'Applicant not found' }, { status: 404 });

    // 슈퍼어드민이거나 해당 지점의 관리자 권한을 가진 경우만 허용합니다.
    if (!me.isSuper && (!me.branch_ids || !me.branch_ids.includes(applicant.branch_id))) {
      return Response.json({ error: 'You cannot hire for this branch' }, { status: 403 });
    }
    if (applicant.status === 'hired') {
      return Response.json({ error: 'This applicant is already hired' }, { status: 400 });
    }

    const job = applicant.job_id
      ? await base44.asServiceRole.entities.Job.get(applicant.job_id).catch(() => null)
      : null;
    const branch = await base44.asServiceRole.entities.Branch.get(applicant.branch_id).catch(() => null);
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });
    const company = await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null);

    // 회사의 패키지 직원 인원 한도를 확인합니다.
    const state = packageState(company);
    const employeeLimit = resolveLimit(company && company.employee_limit_override, state.employeeLimit);
    if (employeeLimit !== null) {
      const total = await base44.asServiceRole.entities.EmployeeProfile.count({
        company_id: branch.company_id,
        status: { $ne: 'inactive' }
      });
      if (total >= employeeLimit) {
        return Response.json(
          { error: `This package covers up to ${employeeLimit} employees. Move to a higher package to add more.` },
          { status: 400 }
        );
      }
    }

    const nextNumber = Number(branch.employee_next_number) || 1;
    const employeeNumber = formatEmployeeNumber(branch.employee_prefix, branch.employee_number_padding, nextNumber);
    const token = randomToken(24);

    const docs = [];
    if (applicant.resume_file_uri) {
      docs.push({
        name: applicant.resume_filename || 'Resume',
        type: 'resume',
        file_uri: applicant.resume_file_uri,
        created_at: new Date().toISOString()
      });
    }

    // 직원 프로필(EmployeeProfile)을 생성합니다.
    const profile = await base44.asServiceRole.entities.EmployeeProfile.create({
      company_id: branch.company_id,
      branch_id: branch.id,
      user_email: applicant.email,
      full_name: applicant.full_name,
      employee_number: employeeNumber,
      position: body.position || (job ? job.position : '') || '',
      visa_type: applicant.visa_type || '',
      hourly_rate: Number(body.hourly_rate) || (job ? Number(job.hourly_rate) || 0 : 0),
      employment_type: body.employment_type || (job ? job.employment_type : 'casual') || 'casual',
      status: 'active',
      start_date: body.start_date || new Date().toISOString().slice(0, 10),
      phone: applicant.phone || '',
      emergency_contact_name: applicant.emergency_contact_name || '',
      emergency_contact_phone: applicant.emergency_contact_phone || '',
      onboarding_status: 'pending',
      onboarding_token: token,
      language: 'ko',
      applicant_id: applicant.id,
      docs
    });

    // 다음 사원 번호를 업데이트합니다.
    await base44.asServiceRole.entities.Branch.update(branch.id, { employee_next_number: nextNumber + 1 });
    
    // 지원자 상태를 'hired'로 변경합니다.
    await base44.asServiceRole.entities.Applicant.update(applicant.id, {
      status: 'hired',
      hired_at: new Date().toISOString(),
      onboarding_token: token,
      onboarding_status: 'pending'
    });

    // 공고 채용 인원이 가득 찼다면 공고를 닫습니다.
    const openings = Number(job && job.openings) || 0;
    if (job && openings > 0 && job.status !== 'closed') {
      const hired = await base44.asServiceRole.entities.Applicant.count({ job_id: job.id, status: 'hired' });
      if (hired >= openings) {
        await base44.asServiceRole.entities.Job.update(job.id, { status: 'closed' });
      }
    }

    const link = portalLink(body.origin, `/onboarding/${token}`);

    // 회사의 온보딩 문서를 함께 첨부합니다.
    const { attachments, skipped: skippedDocs } = onboardingAttachments(company);

    const mail = renderStageEmail(
      company,
      'hired',
      {
        name: applicant.full_name,
        job_title: job ? job.title : 'the role',
        store: branch.name,
        employee_number: employeeNumber
      },
      {
        brandColor: branch.brand_color || '#4338ca',
        ctaUrl: link,
        extraLines:
          skippedDocs.length > 0
            ? [`Your remaining onboarding documents (${skippedDocs.join(', ')}) are on your onboarding page.`]
            : []
      }
    );

    // 지원자에게 합격 및 온보딩 안내 이메일을 발송합니다.
    const emailSent = await sendApplicantEmail(base44, applicant, {
      type: 'hired',
      subject: mail.subject,
      html: mail.html,
      attachments
    });

    // 계정 접근 권한 이메일을 발송합니다.
    const account = await sendAccountAccessEmail(base44, applicant.email);

    return Response.json({
      ok: true,
      employee: profile,
      onboarding_token: token,
      onboarding_link: link,
      email_sent: emailSent.ok,
      invited: account.invited,
      password_email_sent: account.password_email_sent
    });
  } catch (error) {
    console.error('hireApplicant error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
