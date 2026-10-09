import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { resolveCaller } from '../../shared/kwAuth.ts';
import { holdsManagerPosition, managerPositionLabels } from '../../shared/access.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

const EMPLOYMENT = ['full_time', 'part_time', 'casual'];

// The leave menu a company works from: which leave it offers, how each one accrues, and how
// any custom day is handed out. Saving replaces the settings, never the balances behind them.
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    // Either sign-in answers here: an employee with the ID their employer issued, or a platform
    // account. The leave menu is the employer's own, so a manager position may change it too.
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const companyId = String(body.company_id || me.company_id || '');
    if (!companyId) return Response.json({ error: 'No company' }, { status: 400 });

    const company = await base44.asServiceRole.entities.Company.get(companyId).catch(() => null);
    if (!company) return Response.json({ error: 'Company not found' }, { status: 404 });

    const caller = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: me.email }, { limit: 1 }).catch(() => [])
    )[0];
    const isMember =
      (Array.isArray(company.member_emails) && company.member_emails.includes(me.email)) ||
      holdsManagerPosition(caller, managerPositionLabels(company.custom_roles));
    if (
      me.role !== 'admin' &&
      me.app_role !== 'company_admin' &&
      me.app_role !== 'branch_manager' &&
      !isMember
    ) {
      return Response.json({ error: 'You cannot change this company’s leave settings' }, { status: 403 });
    }

    const incoming = Array.isArray(body.types) ? body.types : [];
    if (incoming.length === 0) {
      return Response.json({ error: 'No leave types were sent' }, { status: 400 });
    }

    const existing = rowsOf(
      await base44.asServiceRole.entities.LeaveType.filter({ company_id: companyId }, { limit: 100 })
    );
    const byKey = new Map(existing.map((row: any) => [row.key, row]));

    const creates: any[] = [];
    const updates: any[] = [];

    incoming.slice(0, 40).forEach((raw: any, index: number) => {
      const key = String((raw && raw.key) || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '');
      if (!key) return;
      const pick = (value: any, allowed: string[], fallback: string) =>
        allowed.includes(String(value)) ? String(value) : fallback;
      const payload = {
        company_id: companyId,
        key,
        name: String(raw.name || key).slice(0, 60),
        name_ko: String(raw.name_ko || '').slice(0, 60),
        emoji: String(raw.emoji || '').slice(0, 4),
        paid: raw.paid !== false,
        accrual_method: raw.accrual_method === 'ordinary_hours' ? 'ordinary_hours' : 'none',
        accrual_rate: Math.max(0, Math.min(1, Number(raw.accrual_rate) || 0)),
        employment_types: (Array.isArray(raw.employment_types) ? raw.employment_types : []).filter((value: string) =>
          EMPLOYMENT.includes(value)
        ),
        grant_enabled: Boolean(raw.grant_enabled),
        grant_hours: Math.max(0, Math.min(500, Number(raw.grant_hours) || 0)),
        grant_period: pick(raw.grant_period, ['yearly', 'monthly'], 'yearly'),
        grant_anchor: pick(raw.grant_anchor, ['calendar_year', 'anniversary'], 'calendar_year'),
        grant_employment_types: (Array.isArray(raw.grant_employment_types) ? raw.grant_employment_types : []).filter(
          (value: string) => EMPLOYMENT.includes(value)
        ),
        expiry_enabled: Boolean(raw.expiry_enabled),
        expiry_months: Math.max(1, Math.min(24, Number(raw.expiry_months) || 12)),
        requires_certificate: Boolean(raw.requires_certificate),
        // From this many hours a request of this leave shows red on the review list. 0 = off.
        flag_hours: Math.max(0, Math.min(500, Number(raw.flag_hours) || 0)),
        custom: Boolean(raw.custom),
        active: raw.active !== false,
        order: index + 1
      };
      const found = byKey.get(key);
      if (found) updates.push({ id: found.id, ...payload });
      else creates.push(payload);
    });

    if (creates.length > 0) await base44.asServiceRole.entities.LeaveType.bulkCreate(creates);
    if (updates.length > 0) await base44.asServiceRole.entities.LeaveType.bulkUpdate(updates);

    return Response.json({ ok: true, created: creates.length, updated: updates.length });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}