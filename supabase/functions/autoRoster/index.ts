// 자동 생성 파일입니다. 직접 수정하지 마세요.
// 원본: base44/functions/autoRoster/entry.ts (변환 도구: supabase/tools/port_function.mjs)

import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { buildDraft, comingMondayIso, rowsOf } from '../_shared/roster.ts';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Store hours are Australian, and the employer picks the day and time on the branch's own screen,
// so the clock the schedule is compared against is Sydney's.
function sydneyClock() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const read = (type) => (parts.find((part) => part.type === type) || {}).value || '';
  return {
    day: WEEKDAYS.indexOf(read('weekday')),
    hour: Number(read('hour')),
    date: `${read('year')}-${read('month')}-${read('day')}`
  };
}

// Runs every hour. Each branch is only built at the day and time its employer chose, once for that
// week, and the people who run the store are told the draft is waiting for them to check and send.
async function handler(req) {
  try {
    const base44 = createBase44Like();
    const clock = sydneyClock();
    const weekStart = comingMondayIso(clock.date);
    const branches = rowsOf(
      await base44.asServiceRole.entities.Branch.filter({ roster_auto_enabled: true }, { limit: 200 })
    );
    const stores = [];

    for (const branch of branches) {
      if (!branch || branch.is_active === false) continue;
      const day = Number(branch.roster_auto_day ?? 4);
      const hour = Number(branch.roster_auto_hour ?? 20);
      if (clock.day !== day || clock.hour !== hour) continue;
      // One draft per branch per week, however often the check runs.
      if (branch.roster_auto_last_week === weekStart) continue;

      const result = await buildDraft(base44, branch, weekStart);
      await base44.asServiceRole.entities.Branch
        .update(branch.id, {
          roster_auto_last_at: new Date().toISOString(),
          roster_auto_last_week: weekStart
        })
        .catch(() => null);

      if (result.error) {
        stores.push({ branch: branch.name, error: result.error });
        continue;
      }

      const managers = [
        ...new Set(
          (branch.manager_emails || []).map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)
        )
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

    return Response.json({ ok: true, week_start: weekStart, checked_day: clock.day, checked_hour: clock.hour, stores });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
