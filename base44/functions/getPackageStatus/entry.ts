import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { packageState, today } from '../../shared/packages.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// What the signed-in workspace may do under the package its company paid for. The server
// answers here so no screen has to trust its own clock.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const isSuperAdmin = me.role === 'admin';
    const companyId = (isSuperAdmin && body.company_id) || me.company_id || '';
    if (!companyId) {
      return Response.json({ ok: true, package: '', assigned: false, modules: [], expired: false });
    }

    const company = await base44.asServiceRole.entities.Company.get(companyId).catch(() => null);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });
    if (!isSuperAdmin && company.id !== me.company_id) {
      return Response.json({ error: 'You cannot view this company' }, { status: 403 });
    }

    const state = packageState(company);
    let jobLock = company.package_job_lock === true;

    // A "pay as you go" ad stops after 30 days: it closes itself and the company cannot open
    // another one until a super admin reactivates the account.
    if (state.postingDays > 0) {
      const cutoff = new Date(Date.now() - state.postingDays * DAY_MS).toISOString();
      const filter = { company_id: company.id, status: 'open', created_date: { $lt: cutoff } };
      const stale = rowsOf(await base44.asServiceRole.entities.Job.filter(filter, { limit: 100 }));
      if (stale.length > 0) {
        await base44.asServiceRole.entities.Job.updateMany(filter, { $set: { status: 'closed' } });
        jobLock = true;
        await base44.asServiceRole.entities.Company.update(company.id, { package_job_lock: true });
      }
    }

    const openJobs = await base44.asServiceRole.entities.Job.count({ company_id: company.id, status: 'open' });
    const atLimit = state.jobLimit !== null && openJobs >= state.jobLimit;

    return Response.json({
      ok: true,
      company_id: company.id,
      company_name: company.name || '',
      package: state.key,
      assigned: state.assigned,
      modules: state.modules,
      job_limit: state.jobLimit,
      jobs_open: openJobs,
      job_lock: jobLock,
      posting_days: state.postingDays,
      video_interview: state.videoInterview,
      start_date: state.startDate,
      expires_at: state.expiresOn,
      days_left: state.daysLeft,
      expired: state.expired,
      reactivated_at: company.package_reactivated_at || '',
      can_create_job: !state.expired && !jobLock && !atLimit,
      is_super_admin: isSuperAdmin,
      today: today()
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}