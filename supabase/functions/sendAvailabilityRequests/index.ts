import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { sendEmail, brandedEmail, portalLink, cleanOrigin } from '../_shared/email.ts';
import { availabilityMail, employeeLanguage } from '../_shared/employeeMail.ts';

const STATE_TIMEZONES = {
  NSW: 'Australia/Sydney',
  ACT: 'Australia/Sydney',
  VIC: 'Australia/Melbourne',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  WA: 'Australia/Perth',
  TAS: 'Australia/Hobart',
  NT: 'Australia/Darwin'
};

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function timezoneFor(branch) {
  return STATE_TIMEZONES[String(branch.state || '').trim().toUpperCase()] || 'Australia/Sydney';
}

// 지점의 지역 타임존 기준으로 현재 요일, 시간(hour), 분(minute), 날짜를 계산합니다.
function localClock(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());
  const get = (type) => (parts.find((part) => part.type === type) || {}).value;
  return {
    day: WEEKDAYS[get('weekday')],
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    date: `${get('year')}-${get('month')}-${get('day')}`
  };
}

function rowsOf(result) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

async function handler(req) {
  try {
    const base44 = createBase44Like();
    
    // 요청 바디 파싱 (관리자의 [지금 즉시 발송] 요청 대응)
    let body = {};
    if (req.method === 'POST') {
      try {
        body = await req.json();
      } catch (_) {
        body = {};
      }
    }

    const forceBranchId = body?.branch_id;
    const isForce = Boolean(body?.force);

    // 스케줄러 실행 시 또는 인증된 관리자/매니저 호출
    const me = await base44.auth.me().catch(() => null);
    if (!isForce && me && me.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    let branches = [];
    if (isForce && forceBranchId) {
      // 특정 지점 수동 즉시 발송
      const target = await base44.asServiceRole.entities.Branch.get(forceBranchId).catch(() => null);
      if (target) branches = [target];
    } else {
      // 자동 스케줄 발송 활성화된 모든 지점 조회
      branches = rowsOf(
        await base44.asServiceRole.entities.Branch.filter({ roster_email_enabled: true }, { limit: 500 })
      );
    }

    const results = [];
    for (const branch of branches) {
      const clock = localClock(timezoneFor(branch));
      const targetDay = Number(branch.roster_email_day ?? 0);
      const targetHour = Number(branch.roster_email_hour ?? 20);
      const targetMinute = Number(branch.roster_email_minute ?? 0);

      // 자동 스케줄러 실행 시 지점 지역 요일/시간/분 일치 여부 확인
      if (!isForce) {
        if (clock.day !== targetDay || clock.hour !== targetHour) continue;
        // 분(Minute) 매칭: 스케줄러 실행 간격(예: 10~15분 윈도우)을 고려하여 발송 시간 이후 도달 시 1회 발송
        if (clock.minute < targetMinute || clock.minute > targetMinute + 15) continue;
        // 하루에 한 번만 발송 (이미 오늘 발송되었으면 중복 발송 방지)
        if (branch.roster_email_last_sent === clock.date) continue;
      }

      const origin = cleanOrigin(branch.roster_email_origin) || 'http://localhost:5173';

      // 발송 일자 기록 갱신
      await base44.asServiceRole.entities.Branch.update(branch.id, { 
        roster_email_last_sent: clock.date 
      });

      const company = branch.company_id
        ? await base44.asServiceRole.entities.Company.get(branch.company_id).catch(() => null)
        : null;

      const staff = rowsOf(
        await base44.asServiceRole.entities.EmployeeProfile.filter(
          { branch_id: branch.id, status: 'active' },
          { limit: 500 }
        )
      );

      // 직원이 로그인하여 본인 공간(My Space)에서 근무 가능 시간을 작성할 수 있는 링크
      const link = portalLink(origin, '/login?returnTo=/my-space');

      let sent = 0;
      for (const person of staff) {
        if (!person.user_email) continue;

        const copy = availabilityMail(employeeLanguage(person.language), {
          name: person.full_name || 'there',
          branchName: branch.name
        });

        const ok = await sendEmail(base44, {
          to: person.user_email,
          subject: copy.subject,
          html: brandedEmail({
            heading: copy.heading,
            badge: branch.name,
            brandColor: branch.brand_color || (company && company.brand_color),
            lines: copy.lines,
            tip: copy.tip,
            ctaText: copy.cta,
            ctaUrl: link,
            footer: `${company ? company.name : branch.name} · kworkmate`
          })
        });
        if (ok) sent += 1;
      }

      results.push({ branch: branch.name, staff: staff.length, sent });
    }

    return Response.json({ ok: true, checked: branches.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
