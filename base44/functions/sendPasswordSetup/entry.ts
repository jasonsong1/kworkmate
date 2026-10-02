import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { sendAccountAccessEmail } from '../../shared/account.ts';

// Emails an employee their password setup link. The answer is the same whether or not
// the address already has an account.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const employee = await base44.asServiceRole.entities.EmployeeProfile.get(body.employee_id).catch(() => null);
    if (!employee) return Response.json({ error: 'Employee not found' }, { status: 404 });

    const managesBranch = Array.isArray(me.branch_ids) && me.branch_ids.includes(employee.branch_id);
    const allowed =
      me.role === 'admin' ||
      (employee.company_id === me.company_id && (me.app_role === 'company_admin' || managesBranch));
    if (!allowed) {
      return Response.json({ error: 'You cannot send email for this employee' }, { status: 403 });
    }

    const account = await sendAccountAccessEmail(base44, employee.user_email);
    return Response.json({ ok: true, ...account });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}