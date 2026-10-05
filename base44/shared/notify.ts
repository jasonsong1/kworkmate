// One place that tells a person something happened: an in-app notification for the bell, and
// an email written in the language set on their own staff profile.
import { sendEmail, brandedEmail } from './email.ts';
import { employeeLanguage } from './employeeMail.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// Who has to be told about a branch: its managers and the company admins.
export async function branchManagers(base44: any, company: any, branch: any) {
  const emails = new Set<string>();
  (branch && Array.isArray(branch.manager_emails) ? branch.manager_emails : []).forEach((email: string) => {
    if (email) emails.add(email);
  });
  (company && Array.isArray(company.member_emails) ? company.member_emails : []).forEach((email: string) => {
    if (email) emails.add(email);
  });
  const profiles = rowsOf(
    await base44.asServiceRole.entities.EmployeeProfile.filter(
      { company_id: company && company.id, app_role: 'company_admin' },
      { limit: 50 }
    ).catch(() => [])
  );
  profiles.forEach((person: any) => {
    if (person && person.user_email) emails.add(person.user_email);
  });
  return Array.from(emails);
}

export async function notifyStaff(
  base44: any,
  {
    company,
    branch,
    recipients,
    type,
    title,
    body,
    link,
    mail
  }: {
    company?: any;
    branch?: any;
    recipients: any[];
    type: string;
    title: string;
    body: string;
    link?: string;
    mail?: (lang: string, recipient: any) => any;
  }
) {
  const list = (recipients || []).filter((person) => person && person.email);
  if (list.length === 0) return { notified: 0, emailed: 0 };

  const rows = list.map((person) => ({
    company_id: (company && company.id) || '',
    branch_id: (branch && branch.id) || '',
    user_email: person.email,
    type,
    title,
    body,
    link: link || '',
    read: false
  }));
  await base44.asServiceRole.entities.Notification.bulkCreate(rows).catch(() => null);

  let emailed = 0;
  for (const person of list) {
    if (!mail) continue;
    const copy = mail(employeeLanguage(person.language), person);
    if (!copy) continue;
    const ok = await sendEmail(base44, {
      to: person.email,
      subject: copy.subject,
      html: brandedEmail({
        heading: copy.heading,
        lines: copy.lines,
        brandColor: (branch && branch.brand_color) || (company && company.brand_color),
        footer: `${(company && company.name) || (branch && branch.name) || 'K-Workmate'} · K-Workmate`
      })
    });
    if (ok) emailed += 1;
  }
  return { notified: rows.length, emailed };
}

// The language each person on a branch reads their email in.
export async function languageMap(base44: any, branchId: string) {
  const staff = rowsOf(
    await base44.asServiceRole.entities.EmployeeProfile.filter({ branch_id: branchId }, { limit: 500 }).catch(() => [])
  );
  const map: any = {};
  staff.forEach((person: any) => {
    if (person && person.user_email) map[person.user_email] = person.language;
  });
  return map;
}

// Everyone scheduled on a change, in the shape notifyStaff wants.
export async function employeeRecipients(base44: any, emails: string[], languages: any) {
  const unique = Array.from(new Set((emails || []).filter(Boolean)));
  const out = [];
  for (const email of unique) {
    const person = rowsOf(
      await base44.asServiceRole.entities.EmployeeProfile.filter({ user_email: email }, { limit: 1 }).catch(() => [])
    )[0];
    out.push({
      email,
      name: (person && person.full_name) || email,
      language: (languages && languages[email]) || (person && person.language) || ''
    });
  }
  return out;
}