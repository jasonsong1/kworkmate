import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { buildDraft, comingMondayIso, rowsOf } from '../../shared/roster.ts';

// Runs on the schedule, not on anybody's button: every store that has its shift settings in place
// gets next week's draft built, and the people who run the store are told it is waiting for them
// to check and send.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const settings = rowsOf(await base44.asServiceRole.entities.RosterSetting.list({ limit: 500 }));
    const weekStart = comingMondayIso();
    const stores = [];

    for (const setting of settings) {
      const branch = await base44.asServiceRole.entities.Branch
        .get(setting.branch_id)
        .catch(() => null);
      if (!branch || branch.is_active === false) continue;

      const result = await buildDraft(base44, branch, weekStart);
      if (result.error) {
        stores.push({ branch: branch.name, error: result.error });
        continue;
      }

      const managers = [
        ...new Set((branch.manager_emails || []).map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))
      ];
      for (const email of managers) {
        await base44.asServiceRole.entities.Notification
          .create({
            company_id: branch.company_id,
            branch_id: branch.id,
            user_email: email,
            type: 'roster',
            title: `${weekStart} 로스터 초안이 준비되었습니다`,
            body: `${result.assigned}개 시프트가 배정되었습니다. 확인 후 팀에 발송해 주세요.`,
            link: '/roster'
          })
          .catch(() => null);
      }

      stores.push({ branch: branch.name, assigned: result.assigned, notified: managers.length });
    }

    return Response.json({ ok: true, week_start: weekStart, stores });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}