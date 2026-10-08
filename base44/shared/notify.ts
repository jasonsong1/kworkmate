// One place that tells a person something happened: an in-app notification for the bell, and
// an email written in the language set on their own staff profile.
import { sendEmail, brandedEmail } from './email.ts';
import { employeeLanguage } from './employeeMail.ts';
import { sendWebPush } from './webpush.ts';

function rowsOf(result: any) {
  return Array.isArray(result) ? result : (result && result.items) || [];
}

// A manager is one of the roles the platform ships with, or a position the company named itself
// on a manager preset — which is how most employers describe their own managers.
const MANAGER_PRESETS = ['manager', 'supervisor_manager'];

// Who has to be told about a branch: its managers and the company admins. A store's own manager
// list is what makes somebody a manager of that store, so a manager next door hears nothing.
export async function branchManagers(base44: any, company: any, branch: any) {
  const emails = new Set<string>();
  (branch && Array.isArray(branch.manager_emails) ? branch.manager_emails : []).forEach((email: string) => {
    if (email) emails.add(email);
  });
  (company && Array.isArray(company.member_emails) ? company.member_emails : []).forEach((email: string) => {
    if (email) emails.add(email);
  });
  const managerRoles = new Set<string>(['company_admin', 'branch_manager']);
  (company && Array.isArray(company.custom_roles) ? company.custom_roles : []).forEach((role: any) => {
    if (role && role.key && MANAGER_PRESETS.includes(role.preset_key)) managerRoles.add(role.key);
  });
  const profiles = rowsOf(
    await base44.asServiceRole.entities.EmployeeProfile.filter(
      { company_id: company && company.id },
      { limit: 200 }
    ).catch(() => [])
  );
  profiles.forEach((person: any) => {
    if (!person || !person.user_email || !managerRoles.has(person.app_role)) return;
    // A company admin runs the whole company; a store's manager hears about that store only.
    if (person.app_role === 'company_admin' || !branch || !person.branch_id || person.branch_id === branch.id) {
      emails.add(person.user_email);
    }
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
    mail,
    push
  }: {
    company?: any;
    branch?: any;
    recipients: any[];
    type: string;
    title: string;
    body: string;
    link?: string;
    mail?: (lang: string, recipient: any) => any;
    push?: boolean;
  }
) {
  const list = (recipients || []).filter((person) => person && person.email);
  if (list.length === 0) return { notified: 0, emailed: 0, pushed: 0 };

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
        footer: `${(company && company.name) || (branch && branch.name) || 'kworkmate'} · kworkmate`
      })
    });
    if (ok) emailed += 1;
  }
  // The same news on the phone, for whoever is using the installed app with notifications allowed.
  const pushed = push ? await pushStaff(base44, { recipients: list, title, body, link }) : 0;

  return { notified: rows.length, emailed, pushed };
}

// Phone alerts: a message to each person who allowed them, on the installed app where there is
// one and in the browser (web push) everywhere else. Delivery is best effort, so a failure here
// must never break the leave or roster action that triggered it.
export async function pushStaff(
  base44: any,
  {
    recipients,
    title,
    body,
    link
  }: {
    recipients: any[];
    title?: string;
    body?: string;
    link?: string;
  }
) {
  const list = (recipients || []).filter((person) => person && person.email);
  if (list.length === 0) return 0;

  let users: any[] = [];
  try {
    users = rowsOf(await base44.asServiceRole.entities.User.list());
  } catch (error: any) {
    // No app users to look up: the browser subscriptions below are still worth trying.
    console.warn('app users could not be read', error && error.message);
    users = [];
  }
  const idByEmail = new Map<string, string>();
  users.forEach((user: any) => {
    if (user && user.email) idByEmail.set(String(user.email).toLowerCase(), user.id);
  });

  let pushed = 0;
  for (const person of list) {
    const userId = idByEmail.get(String(person.email).toLowerCase());
    if (!userId) continue;
    try {
      await base44.asServiceRole.integrations.Core.SendPushNotification({
        user_id: userId,
        title: String(person.title || title || '').slice(0, 100),
        content: String(person.body || body || '').slice(0, 500),
        action_label: 'Open',
        action_url: link || '/'
      });
      pushed += 1;
    } catch (error: any) {
      // No phone to reach: the app is not installed, credentials are not set, or the person
      // has not allowed notifications. The bell and the email still carry the news.
      console.warn('push not delivered', error && error.message);
    }
  }

  // The same news reaches a phone with no app installed, for whoever opened the site in a
  // browser and allowed alerts there.
  const webPushed = await sendWebPush(base44, { recipients: list, title, body, link }).catch(() => 0);

  return pushed + webPushed;
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