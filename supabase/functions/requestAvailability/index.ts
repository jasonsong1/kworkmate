// supabase/functions/requestAvailability/index.ts
// 로스터 화면에서 특정 직원 1명에게 개별적으로 근무가능시간 제출 요청 이메일을 발송하는 함수입니다.

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { lower, resolveCaller } from '../_shared/kwAuth.ts';
import { sendEmailDetailed, brandedEmail, portalLink } from '../_shared/email.ts';
import { availabilityMail, employeeLanguage } from '../_shared/employeeMail.ts';
import { branchManagers } from '../_shared/notify.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// 특정 지점의 직원 1명에게 근무가능시간 제출 안내 이메일을 발송합니다.
async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const branch = await base44.asServiceRole.entities.Branch.get(body.branch_id).catch(() => null);
    if (!branch) return Response.json({ error: 'Branch not found' }, { status: 404 });

    const company = branch.company_id
      ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null)
      : null;

    // 슈퍼어드민(sym910403@gmail.com) 및 회사 관리자, 지점 매니저 권한 체크
    const meEmail = lower(me.email);
    const isSuper = me.role === 'admin' || me.app_role === 'super_admin' || meEmail === 'sym910403@gmail.com';
    const isAdmin = isSuper || me.app_role === 'company_admin';
    const managers = (await branchManagers(base44, company, branch)).map((email: string) => lower(email));

    if (!isAdmin && !managers.includes(meEmail)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const email = String(body.employee_email || '').trim();
    if (!email) return Response.json({ error: 'employee_email is required' }, { status: 400 });

    // 지점 소속 직원 조회 (대소문자 차이 없이 안전하게 매칭)
    const branchEmployees = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter(
        { branch_id: branch.id },
        { limit: 500 }
      )
    );
    const person = branchEmployees.find((p: any) => lower(p.user_email) === lower(email));
    if (!person) return Response.json({ error: 'Employee not found' }, { status: 404 });

    // 직원의 언어 설정에 맞는 이메일 본문 템플릿 생성
    const copy = availabilityMail(employeeLanguage(person.language), {
      name: person.full_name || 'there',
      branchName: branch.name
    });

    // 인증된 발신자(noreply@kworkmate.com)를 통해 Resend로 이메일 전송
    const sendResult = await sendEmailDetailed(base44, {
      to: email,
      subject: copy.subject,
      html: brandedEmail({
        heading: copy.heading,
        badge: branch.name,
        lines: copy.lines,
        tip: copy.tip,
        ctaText: copy.cta,
        // 직원이 휴대폰으로 링크를 열고 바로 로그인하여 내 공간(근무가능시간 제출)으로 이동하도록 설정
        ctaUrl: portalLink(body.origin, '/login?returnTo=/my-space'),
        brandColor: branch.brand_color || (company && company.brand_color),
        footer: `${company ? company.name : branch.name} · kworkmate`
      })
    });

    if (!sendResult.ok) {
      console.error('[requestAvailability] Failed to send email to:', email, sendResult.error);
      return Response.json({ error: sendResult.error || '이메일 발송에 실패했습니다.' }, { status: 500 });
    }

    return Response.json({ ok: true, name: person.full_name });
  } catch (error: any) {
    console.error('[requestAvailability] Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
