// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/getOnboardingData/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';

async function handler(req) {
  try {
    const base44 = createBase44Like();
    const body = await req.json();
    const token = body.token;
    if (!token) return Response.json({ error: 'token is required' }, { status: 400 });

    const found = await base44.asServiceRole.entities.EmployeeProfile.filter({ onboarding_token: token });
    if (found.length === 0) return Response.json({ ok: false, invalid: true });
    const employee = found[0];

    // Onboarding that is already filed is a closed door: the link says so and hands over nothing.
    if (employee.onboarding_status === 'completed') {
      return Response.json({ ok: false, completed: true });
    }

    const branch = employee.branch_id
      ? await base44.asServiceRole.entities.Branch.get(employee.branch_id).catch(() => null)
      : null;
    const company = employee.company_id
      ? await base44.asServiceRole.entities.Company.get(employee.company_id).catch(() => null)
      : null;

    return Response.json({
      ok: true,
      completed: employee.onboarding_status === 'completed',
      employee: {
        full_name: employee.full_name,
        position: employee.position || '',
        employee_number: employee.employee_number || '',
        employment_type: employee.employment_type || 'casual',
        start_date: employee.start_date || '',
        status: employee.onboarding_status || 'pending'
      },
      branch: branch ? { name: branch.name, logo_url: branch.logo_url || '', brand_color: branch.brand_color || '#4338ca', address: [branch.address, branch.suburb, branch.state, branch.postcode].filter(Boolean).join(', ') } : null,
      // Only the questions the employer switched on: each one is a page of its own.
      onboarding_questions: ((company && company.onboarding_questions) || []).filter(
        (question) => question && question.visible !== false && String(question.label || '').trim()
      ),
      company: company
        ? {
            name: company.name,
            abn: company.abn || '',
            brand_color: company.brand_color || '#4338ca',
            default_super_fund_name: company.default_super_fund_name || '',
            default_super_fund_abn: company.default_super_fund_abn || '',
            default_super_fund_usi: company.default_super_fund_usi || '',
            default_super_fund_phone: company.default_super_fund_phone || ''
          }
        : null
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
