import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { isDay, normalizePackage, packageState, today } from '../../shared/packages.ts';

// Assigning, changing or reactivating a company's pricing package. A super admin is the
// only person allowed to write here; everyone else only ever reads the package.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (me.role !== 'admin') {
      return Response.json({ error: 'Only a super admin can change a package' }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action === 'reactivate' ? 'reactivate' : 'set';
    if (!body.company_id) return Response.json({ error: 'company_id is required' }, { status: 400 });

    const company = await base44.asServiceRole.entities.Company.get(body.company_id).catch(() => null);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    const startDate = isDay(body.start_date) || today();

    if (action === 'set') {
      const key = normalizePackage(body.package);
      if (!key) return Response.json({ error: 'Choose a package' }, { status: 400 });
      await base44.asServiceRole.entities.Company.update(company.id, {
        package: key,
        package_start_date: startDate,
        package_reactivated_at: '',
        package_job_lock: false
      });
    } else {
      if (!company.package) return Response.json({ error: 'Assign a package first' }, { status: 400 });
      // Reactivating opens another full access period and releases the locked job ads.
      await base44.asServiceRole.entities.Company.update(company.id, {
        package_start_date: startDate,
        package_reactivated_at: new Date().toISOString(),
        package_job_lock: false
      });
    }

    const updated = await base44.asServiceRole.entities.Company.get(company.id);
    const state = packageState(updated);

    return Response.json({
      ok: true,
      package: state.key,
      start_date: state.startDate,
      expires_at: state.expiresOn,
      days_left: state.daysLeft
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}