import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { round2 } from '../../shared/leave.ts';
import { employeeRecipients, languageMap, notifyStaff } from '../../shared/notify.ts';
import { leaveDecidedMail } from '../../shared/employeeMail.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// A decision on a leave request. Approving books the hours for good and clears the draft
// roster around them; declining or cancelling puts the reservation straight back.
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const decision = ['approve', 'reject', 'cancel'].includes(body.decision) ? body.decision : '';
    if (!decision) return Response.json({ error: 'unknown_decision' }, { status: 400 });

    const request = body.request_id
      ? await base44.asServiceRole.entities.LeaveRequest.get(body.request_id).catch(() => null)
      : null;
    if (!request) return Response.json({ error: 'not_found' }, { status: 404 });

    const isOwn = request.employee_email === me.email;
    const managesBranch = me.role === 'admin' || (Array.isArray(me.branch_ids) && me.branch_ids.includes(request.branch_id));
    if (!managesBranch && !(isOwn && decision === 'cancel')) {
      return Response.json({ error: 'You cannot decide this request' }, { status: 403 });
    }
    if (decision !== 'cancel' && request.status !== 'pending') {
      return Response.json({ error: 'already_decided' }, { status: 400 });
    }
    if (decision === 'cancel' && !['pending', 'approved'].includes(request.status)) {
      return Response.json({ error: 'already_decided' }, { status: 400 });
    }

    const hours = Number(request.hours) || 0;
    const reason = String(body.reason || '').slice(0, 400);
    const status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'cancelled';

    await base44.asServiceRole.entities.LeaveRequest.update(request.id, {
      status,
      decision_reason: reason,
      decided_by_email: me.email,
      decided_by_name: me.full_name || me.email,
      decided_at: new Date().toISOString(),
      notified_at: new Date().toISOString()
    });

    // The reservation moves with the decision: approved becomes booked, anything else is
    // handed back to the balance.
    const balances = rowsOf(
      await base44.asServiceRole.entities.LeaveBalance.filter(
        { employee_email: request.employee_email, leave_type_key: request.leave_type_key },
        { limit: 1 }
      )
    );
    const balance = balances[0];
    if (balance && hours > 0) {
      const patch: any = {};
      if (request.status === 'pending') {
        patch.pending_hours = round2(Math.max(0, (Number(balance.pending_hours) || 0) - hours));
        if (status === 'approved') patch.used_hours = round2((Number(balance.used_hours) || 0) + hours);
      } else if (request.status === 'approved' && status === 'cancelled') {
        patch.used_hours = round2(Math.max(0, (Number(balance.used_hours) || 0) - hours));
      }
      if (Object.keys(patch).length > 0) {
        await base44.asServiceRole.entities.LeaveBalance.update(balance.id, patch);
      }
    }

    // Approved leave takes the days out of the draft roster, so nobody is planned in while away.
    if (status === 'approved') {
      await base44.asServiceRole.entities.Shift.deleteMany({
        branch_id: request.branch_id,
        employee_email: request.employee_email,
        date: { $gte: request.start_date, $lte: request.end_date || request.start_date },
        status: { $in: ['draft', 'saved'] }
      }).catch(() => null);
    }

    const branch = request.branch_id
      ? await base44.asServiceRole.entities.Branch.get(request.branch_id).catch(() => null)
      : null;
    const company = request.company_id
      ? await base44.asServiceRole.entities.Company.get(request.company_id).catch(() => null)
      : null;
    const languages = await languageMap(base44, request.branch_id || '');
    const recipients = await employeeRecipients(base44, [request.employee_email], languages);
    const range =
      request.start_date === request.end_date
        ? request.start_date
        : `${request.start_date} – ${request.end_date || request.start_date}`;

    if (recipients.length > 0) {
      await notifyStaff(base44, {
        company,
        branch,
        recipients,
        type: status === 'approved' ? 'leave_approved' : status === 'rejected' ? 'leave_rejected' : 'leave_cancelled',
        title:
          status === 'approved'
            ? `Leave approved · ${request.leave_type_name}`
            : status === 'rejected'
              ? `Leave not approved · ${request.leave_type_name}`
              : `Leave cancelled · ${request.leave_type_name}`,
        body: `${range} · ${hours}h${reason ? ` · ${reason}` : ''}`,
        link: '/leave',
        mail: (lang: string) =>
          leaveDecidedMail(lang, {
            typeName: request.leave_type_name,
            range,
            decision: status,
            reason
          })
      });
    }

    return Response.json({ ok: true, status });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}