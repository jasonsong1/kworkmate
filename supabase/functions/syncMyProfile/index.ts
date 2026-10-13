// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/syncMyProfile/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { branchIdsFor, resolveCaller } from '../_shared/kwAuth.ts';

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

function sameIds(first, second) {
  const one = [...new Set((first || []).filter(Boolean))].sort();
  const two = [...new Set((second || []).filter(Boolean))].sort();
  return one.length === two.length && one.every((id, index) => id === two[index]);
}

// The workspace an account belongs to is put together from the records the employer opened:
// the company member list, a branch manager list, or the employee profile registered against
// this email. The answer travels back with the call so the back office can enter without
// waiting for the platform session to be refreshed.
async function readWorkspace(base44, companyId) {
  const company =
    (await base44.asServiceRole.entities.Company.filter({ id: companyId }).catch(() => []))[0] || null;
  const branches = company
    ? await base44.asServiceRole.entities.Branch.filter({ company_id: company.id }).catch(() => [])
    : [];
  return { company, branches };
}

async function handler(req) {
  try {
    const base44 = createBase44Like();
    // Either door the employer signed in through answers here: the ID they were issued, or a
    // platform account.
    const caller = await resolveCaller(base44, req);
    if (!caller) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    // Who is calling was just answered; a platform sign-in left in the same browser belongs to
    // somebody else and must not be mistaken for this caller's own account.
    const platform = caller.kw ? null : await base44.auth.me().catch(() => null);

    const email = String(caller.email || '').trim().toLowerCase();

    // Only an account the employer has not linked yet is worked out here.
    if (platform && !platform.company_id) {
      const companies = await base44.asServiceRole.entities.Company.filter({ member_emails: email });
      const managed = await base44.asServiceRole.entities.Branch.filter({ manager_emails: email });
      const profiles = await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email });

      if (companies.length > 0) {
        const company = companies[0];
        const branches = await base44.asServiceRole.entities.Branch.filter({ company_id: company.id });
        const ids = branches.map((b) => b.id);
        await base44.asServiceRole.entities.User.update(platform.id, {
          company_id: company.id,
          branch_id: ids[0] || null,
          branch_ids: ids,
          app_role: 'company_admin'
        });
      } else if (managed.length > 0) {
        const ids = managed.map((b) => b.id);
        await base44.asServiceRole.entities.User.update(platform.id, {
          company_id: managed[0].company_id,
          branch_id: ids[0],
          branch_ids: ids,
          app_role: 'branch_manager'
        });
      } else if (profiles.length > 0) {
        // The same address can be registered by more than one company, so the newest profile
        // is the one the account is linked to.
        const newest = profiles
          .slice()
          .sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || '')))[0];
        const ids = [...new Set(profiles.map((p) => p.branch_id).filter(Boolean))];
        await base44.asServiceRole.entities.User.update(platform.id, {
          company_id: newest.company_id,
          branch_id: newest.branch_id,
          branch_ids: ids,
          app_role: 'staff',
          position: newest.position || ''
        });
      }
    }

    const current = platform || caller;
    if (!current.company_id) {
      return Response.json({ ok: true, unassigned: true });
    }

    // The stores this account may open are worked out again on every visit: the employer may give
    // somebody another position, or link that position to another preset, long after the account
    // was first linked — and the stores follow the position, never the first sign-in. A company
    // admin is left as they are: every store of the company is already theirs.
    const profiles = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email }).catch(() => [])
    );
    const mine =
      current.app_role === 'company_admin' || caller.role === 'admin'
        ? null
        : profiles
            .filter((profile) => profile.company_id === current.company_id)
            .sort((first, second) =>
              String(second.created_date || '').localeCompare(String(first.created_date || ''))
            )[0] || null;
    let branchIds = Array.isArray(current.branch_ids) ? [...current.branch_ids] : [];
    if (mine) {
      const registered = profiles
        .filter((profile) => profile.company_id === mine.company_id)
        .map((profile) => profile.branch_id);
      branchIds = [...new Set([...(await branchIdsFor(base44, mine)), ...registered].filter(Boolean))];
      // The answer is written back on whichever door the account signs in by, so the screens and
      // the server's own scope checks read the same list.
      if (!sameIds(branchIds, current.branch_ids)) {
        if (platform) {
          await base44.asServiceRole.entities.User
            .update(platform.id, { branch_ids: branchIds })
            .catch(() => null);
        }
        if (caller.kw && caller.session_token) {
          await base44.asServiceRole.entities.LoginSession
            .updateMany({ token: caller.session_token }, { $set: { branch_ids: branchIds } })
            .catch(() => null);
        }
      }
    }

    const { company, branches } = await readWorkspace(base44, current.company_id);
    return Response.json({
      ok: true,
      already: Boolean(caller.company_id),
      company_id: current.company_id,
      branch_id: current.branch_id || null,
      branch_ids: branchIds,
      app_role: current.app_role || 'staff',
      company,
      branches
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
