import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveCaller } from '../../shared/kwAuth.ts';
import { DEFAULT_LEAVE_TYPES, HOURS_PER_DAY, activeTypes, availableHours, eligibleFor, periodDays, round2 } from '../../shared/leave.ts';
import { branchManagers, employeeRecipients, languageMap, notifyStaff } from '../../shared/notify.ts';
import { leaveRequestedMail } from '../../shared/employeeMail.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

function isDay(value: any) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').slice(0, 10)) ? String(value).slice(0, 10) : '';
}

// A request reserves its hours the moment it is sent, so the same hours can never be asked for
// twice while a manager is still deciding.
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const startDate = isDay(body.start_date);
    const endDate = isDay(body.end_date) || startDate;
    if (!startDate || endDate < startDate) {
      return Response.json({ error: 'invalid_dates' }, { status: 400 });
    }

    const profile = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: me.email }, { limit: 1 })
    )[0];
    if (!profile) return Response.json({ error: 'no_profile' }, { status: 400 });

    const companyId = profile.company_id || me.company_id || '';
    const branch = profile.branch_id
      ? await base44.asServiceRole.entities.Branch.get(profile.branch_id).catch(() => null)
      : null;
    const company = companyId
      ? await base44.asServiceRole.entities.Company.get(companyId).catch(() => null)
      : null;

    const stored = rowsOf(
      await base44.asServiceRole.entities.LeaveType.filter({ company_id: companyId }, { limit: 100 })
    );
    const types = activeTypes((stored.length > 0 ? stored : DEFAULT_LEAVE_TYPES) as any[]);
    const type = types.find((row: any) => row.key === String(body.leave_type_key || ''));
    if (!type) return Response.json({ error: 'unknown_type' }, { status: 400 });
    if (!eligibleFor(type, profile.employment_type || 'casual')) {
      return Response.json({ error: 'not_eligible' }, { status: 400 });
    }

    const days = periodDays(startDate, endDate);
    const asked = Number(body.hours);
    const hours = round2(asked > 0 ? asked : days * HOURS_PER_DAY);
    if (hours <= 0) return Response.json({ error: 'invalid_hours' }, { status: 400 });

    // Leave that has to be earned is checked against what is actually left; the rest is at the
    // employer's discretion and does not need a balance.
    const earned = type.accrual_method === 'ordinary_hours' || type.grant_enabled;
    let balanceId = '';
    if (earned) {
      const balances = rowsOf(
        await base44.asServiceRole.entities.LeaveBalance.filter(
          { employee_email: me.email, leave_type_key: type.key },
          { limit: 1 }
        )
      );
      let balance = balances[0];
      if (!balance) {
        balance = await base44.asServiceRole.entities.LeaveBalance.create({
          company_id: companyId,
          branch_id: profile.branch_id || '',
          employee_email: me.email,
          employee_name: profile.full_name || me.email,
          employee_number: profile.employee_number || '',
          leave_type_key: type.key,
          leave_type_name: type.name,
          accrual_anchor_at: `${profile.start_date || startDate}T00:00:00.000Z`
        });
      }
      balanceId = balance.id;
      const left = availableHours(balance);
      if (left + 0.001 < hours) {
        return Response.json({ error: 'insufficient', available: left }, { status: 400 });
      }
    }

    const request = await base44.asServiceRole.entities.LeaveRequest.create({
      company_id: companyId,
      branch_id: profile.branch_id || '',
      employee_email: me.email,
      employee_name: profile.full_name || me.email,
      employee_number: profile.employee_number || '',
      leave_type_key: type.key,
      leave_type_name: type.name,
      paid: type.paid !== false,
      start_date: startDate,
      end_date: endDate,
      days,
      hours,
      reason: String(body.reason || '').slice(0, 500),
      status: 'pending',
      certificate_file_uri: String(body.certificate_file_uri || ''),
      certificate_filename: String(body.certificate_filename || '')
    });

    if (balanceId) {
      const current = await base44.asServiceRole.entities.LeaveBalance.get(balanceId).catch(() => null);
      if (current) {
        await base44.asServiceRole.entities.LeaveBalance.update(balanceId, {
          pending_hours: round2((Number(current.pending_hours) || 0) + hours)
        });
      }
    }

    const range = startDate === endDate ? startDate : `${startDate} – ${endDate}`;
    const managers = await branchManagers(base44, company, branch);
    if (managers.length > 0) {
      const languages = await languageMap(base44, profile.branch_id || '');
      const recipients = await employeeRecipients(base44, managers, languages);
      await notifyStaff(base44, {
        company,
        branch,
        recipients,
        type: 'leave_requested',
        title: `Leave request · ${profile.full_name || me.email}`,
        body: `${type.name} · ${range} · ${hours}h`,
        link: '/leave',
        mail: (lang: string) =>
          leaveRequestedMail(lang, {
            employeeName: profile.full_name || me.email,
            typeName: type.name,
            range,
            hours
          })
      });
    }

    return Response.json({ ok: true, request_id: request.id, hours });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}