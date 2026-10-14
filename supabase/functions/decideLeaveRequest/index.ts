// ==============================================================================
// KWorkMate 휴가 승인/반려/취소 처리 엣지 펑션 (decideLeaveRequest)
// 기능: 휴가 요청 상태 변경, 잔액(LeaveBalance) 확정 또는 환원, 로스터 동기화, 이메일 알림
// ==============================================================================

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';
import { round2 } from '../_shared/leave.ts';
import { employeeRecipients, languageMap, notifyStaff } from '../_shared/notify.ts';
import { leaveDecidedMail } from '../_shared/employeeMail.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
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

    // [보안 패치]: 해당 요청의 company_id 및 employee_number를 기준으로 정확한 지사의 LeaveBalance를 찾습니다.
    let balance = null;
    if (request.company_id && request.employee_number) {
      const byNum = rowsOf(
        await base44.asServiceRole.entities.LeaveBalance.filter(
          { company_id: request.company_id, employee_number: request.employee_number, leave_type_key: request.leave_type_key },
          { limit: 1 }
        )
      );
      balance = byNum[0] || null;
    }
    if (!balance && request.company_id) {
      const byComp = rowsOf(
        await base44.asServiceRole.entities.LeaveBalance.filter(
          { company_id: request.company_id, employee_email: request.employee_email, leave_type_key: request.leave_type_key },
          { limit: 1 }
        )
      );
      balance = byComp[0] || null;
    }
    if (!balance) {
      const fallback = rowsOf(
        await base44.asServiceRole.entities.LeaveBalance.filter(
          { employee_email: request.employee_email, leave_type_key: request.leave_type_key },
          { limit: 1 }
        )
      );
      balance = fallback[0] || null;
    }

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
        push: true,
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

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
