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