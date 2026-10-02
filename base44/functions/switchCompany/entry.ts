import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { switchUserToCompany } from '../../shared/companies.ts';

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') {
      return Response.json({ error: 'Only the platform admin can switch companies' }, { status: 403 });
    }

    const body = await req.json();
    if (!body.company_id) return Response.json({ error: 'company_id is required' }, { status: 400 });

    const company = await base44.asServiceRole.entities.Company.get(body.company_id).catch(() => null);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    await switchUserToCompany(base44, me.id, company);
    return Response.json({ ok: true, company: { id: company.id, name: company.name } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}