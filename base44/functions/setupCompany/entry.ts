import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const companyInput = body.company || {};
    const branchInput = body.branch || {};
    if (!companyInput.name) return Response.json({ error: 'Company name is required' }, { status: 400 });

    const existing = await base44.asServiceRole.entities.Company.filter({ member_emails: user.email });
    if (existing.length > 0) {
      return Response.json({ error: 'You already manage a company', company_id: existing[0].id }, { status: 400 });
    }

    const company = await base44.asServiceRole.entities.Company.create({
      name: companyInput.name,
      abn: companyInput.abn || '',
      contact_email: companyInput.contact_email || user.email,
      contact_phone: companyInput.contact_phone || '',
      logo_url: companyInput.logo_url || '',
      brand_color: companyInput.brand_color || '#4338ca',
      default_super_fund_name: companyInput.default_super_fund_name || '',
      default_super_fund_abn: companyInput.default_super_fund_abn || '',
      default_super_fund_usi: companyInput.default_super_fund_usi || '',
      default_super_fund_phone: companyInput.default_super_fund_phone || '',
      auto_reject_email: companyInput.auto_reject_email !== false,
      mini_interview_enabled: companyInput.mini_interview_enabled !== false,
      ai_top_n: 10,
      member_emails: [user.email]
    });

    const rawCode = String(branchInput.code || branchInput.name || 'BRANCH');
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'BRN';

    const branch = await base44.asServiceRole.entities.Branch.create({
      company_id: company.id,
      name: branchInput.name || 'Main Branch',
      code,
      address: branchInput.address || '',
      suburb: branchInput.suburb || '',
      state: branchInput.state || '',
      postcode: branchInput.postcode || '',
      phone: branchInput.phone || '',
      trading_hours: branchInput.trading_hours || '',
      manager_emails: [user.email],
      employee_prefix: `${code}-`,
      employee_number_padding: 3,
      employee_next_number: 1,
      gps_lat: Number(branchInput.gps_lat) || 0,
      gps_lng: Number(branchInput.gps_lng) || 0,
      gps_radius_m: Number(branchInput.gps_radius_m) || 100,
      logo_url: companyInput.logo_url || '',
      brand_color: companyInput.brand_color || '#4338ca'
    });

    await base44.asServiceRole.entities.User.update(user.id, {
      company_id: company.id,
      branch_id: branch.id,
      branch_ids: [branch.id],
      app_role: 'company_admin'
    });

    return Response.json({ ok: true, company, branch });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}