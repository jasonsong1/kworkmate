// Emails that go to a team member follow the UI language set on their staff profile, so a
// Korean-speaking member receives Korean onboarding, roster and availability mail.
export function employeeLanguage(value): 'ko' | 'en' {
  return value === 'en' ? 'en' : 'ko';
}

export function onboardingMail(lang: string, { name, store, employeeNumber }) {
  if (lang === 'en') {
    return {
      subject: `Welcome to ${store} — complete your onboarding`,
      heading: `Welcome aboard, ${name}!`,
      lines: [
        `You have been added to <b>${store}</b>. Your employee number is <b>${employeeNumber}</b>.`,
        'Please complete your TFN declaration, superannuation choice and bank details. It takes about 3 minutes.'
      ],
      cta: 'Start onboarding'
    };
  }
  return {
    subject: `${store} 온보딩을 완료해 주세요`,
    heading: `${name}님, 온보딩을 완료해 주세요`,
    lines: [
      `<b>${store}</b>에 등록되었습니다. 사번은 <b>${employeeNumber}</b>입니다.`,
      'TFN 신고, 연금(슈퍼) 선택, 계좌 정보를 입력해 주세요. 약 3분이면 완료됩니다.'
    ],
    cta: '온보딩 시작하기'
  };
}

export function onboardingReminderMail(lang: string, { name, store, employeeNumber }) {
  if (lang === 'en') {
    return {
      subject: `Complete your onboarding — ${store}`,
      heading: `Hi ${name}, please finish your onboarding`,
      lines: [
        `Your employee number is <b>${employeeNumber}</b>.`,
        'Please complete your tax file number declaration, superannuation choice and bank details. It takes about 3 minutes.'
      ],
      cta: 'Start onboarding'
    };
  }
  return {
    subject: `${store} 온보딩을 완료해 주세요`,
    heading: `${name}님, 온보딩을 마무리해 주세요`,
    lines: [
      `사번은 <b>${employeeNumber}</b>입니다.`,
      'TFN 신고, 연금(슈퍼) 선택, 계좌 정보를 입력해 주세요. 약 3분이면 완료됩니다.'
    ],
    cta: '온보딩 시작하기'
  };
}

// Sent when a manager corrects the availability on someone's behalf, so the change never
// happens quietly.
export function availabilityEditedMail(lang: string, { name, branchName }) {
  if (lang === 'en') {
    return {
      subject: `Your availability was updated — ${branchName}`,
      heading: `${name}, your availability was updated`,
      lines: [
        `Your manager updated the availability recorded for <b>${branchName}</b>.`,
        'If anything is wrong, reply to this email or submit an update from your space.'
      ]
    };
  }
  return {
    subject: `근무가능시간이 수정되었습니다 — ${branchName}`,
    heading: `${name}님, 근무가능시간이 수정되었습니다`,
    lines: [
      `<b>${branchName}</b>에 등록된 근무가능시간을 매니저가 수정했습니다.`,
      '수정된 내용이 맞지 않으면 이 메일에 회신하거나 내 공간에서 다시 제출해 주세요.'
    ]
  };
}

export function rosterMail(lang: string, { name, branchName, range }) {
  if (lang === 'en') {
    return {
      subject: `Your roster · ${range}`,
      heading: `${branchName} roster`,
      greeting: `Hi ${name},`,
      lead: 'Here are your shifts for this week:'
    };
  }
  return {
    subject: `근무표 · ${range}`,
    heading: `${branchName} 근무표`,
    greeting: `${name}님, 안녕하세요.`,
    lead: '이번 주 근무 일정입니다:'
  };
}

export function availabilityMail(lang: string, { name, branchName }) {
  if (lang === 'en') {
    return {
      subject: `Update your availability — ${branchName}`,
      heading: `Hi ${name}, please update your availability`,
      lines: [
        `Let us know which days and hours you can work next week at <b>${branchName}</b>.`,
        'It only takes a minute — your manager uses this to build the roster.'
      ],
      cta: 'Update my availability'
    };
  }
  return {
    subject: `근무가능시간을 알려주세요 — ${branchName}`,
    heading: `${name}님, 근무가능시간을 업데이트해 주세요`,
    lines: [
      `다음 주에 근무할 수 있는 요일과 시간을 알려주세요. (<b>${branchName}</b>)`,
      '1분이면 끝나고, 매니저가 이 내용으로 근무표를 만듭니다.'
    ],
    cta: '근무가능시간 입력하기'
  };
}

// A leave request that has just been sent, read by whoever approves it.
export function leaveRequestedMail(lang: string, { employeeName, typeName, range, hours }) {
  if (lang === 'en') {
    return {
      subject: `Leave request — ${employeeName}`,
      heading: 'A leave request is waiting for you',
      lines: [
        `<b>${employeeName}</b> asked for <b>${typeName}</b> on ${range} (${hours} hours).`,
        'Approve or decline it on the Leave screen.'
      ]
    };
  }
  return {
    subject: `휴가 신청 — ${employeeName}`,
    heading: '승인 대기 중인 휴가 신청이 있습니다',
    lines: [
      `<b>${employeeName}</b>님이 ${range}에 <b>${typeName}</b> ${hours}시간을 신청했습니다.`,
      '휴가 화면에서 승인하거나 반려해 주세요.'
    ]
  };
}

// The answer to that request, read by the person who asked.
export function leaveDecidedMail(lang: string, { typeName, range, decision, reason }) {
  const rejected = decision === 'rejected';
  const cancelled = decision === 'cancelled';
  if (lang === 'en') {
    return {
      subject: rejected
        ? `Leave not approved — ${range}`
        : cancelled
          ? `Leave cancelled — ${range}`
          : `Leave approved — ${range}`,
      heading: rejected
        ? 'Your leave request was not approved'
        : cancelled
          ? 'Your leave was cancelled'
          : 'Your leave is approved',
      lines: [
        `<b>${typeName}</b> · ${range}`,
        reason
          ? `Reason: ${reason}`
          : rejected
            ? 'The hours are back in your balance. Please talk to your manager about other dates.'
            : 'The hours are booked, and this time is marked as On leave on the roster.'
      ]
    };
  }
  return {
    subject: rejected
      ? `휴가가 승인되지 않았습니다 — ${range}`
      : cancelled
        ? `휴가가 취소되었습니다 — ${range}`
        : `휴가가 승인되었습니다 — ${range}`,
    heading: rejected ? '휴가 신청이 승인되지 않았습니다' : cancelled ? '휴가가 취소되었습니다' : '휴가가 승인되었습니다',
    lines: [
      `<b>${typeName}</b> · ${range}`,
      reason
        ? `사유: ${reason}`
        : rejected
          ? '사용 시간이 잔여 휴가로 복구되었습니다. 다른 날짜는 매니저와 상의해 주세요.'
          : '사용 시간이 확정 차감되었고, 근무표에서 해당 날짜가 휴가 중으로 표시됩니다.'
    ]
  };
}

// A roster that moved: a shift was added, changed or taken away.
export function shiftChangedMail(lang: string, { name, branchName, change, lines }) {
  const copy: any = {
    created: {
      en: ['A new shift was added', 'A shift has been added to your roster.'],
      ko: ['새 근무가 등록되었습니다', '근무표에 새 시프트가 추가되었습니다.']
    },
    updated: {
      en: ['Your shift changed', 'One of your shifts has been updated.'],
      ko: ['근무가 변경되었습니다', '시프트 시간이 변경되었습니다.']
    },
    cancelled: {
      en: ['Your shift was cancelled', 'One of your shifts has been removed from your roster.'],
      ko: ['근무가 취소되었습니다', '근무표에서 시프트가 삭제되었습니다.']
    }
  };
  const picked = (copy[change] || copy.updated)[lang === 'en' ? 'en' : 'ko'];
  return {
    subject: `${picked[0]} — ${branchName}`,
    heading: `${picked[0]} · ${branchName}`,
    lines: [name, picked[1], ...(lines || [])]
  };
}