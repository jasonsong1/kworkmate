import { base44 } from '@/api/base44Client';

// The company settings are written on the server: the caller's own grant is worked out there, and
// the company record is only ever read back from that one answer.
export async function saveCompanySettings(companyId, data) {
  const response = await base44.functions.invoke('saveCompanySettings', { company_id: companyId, data });
  const payload = response.data || {};
  if (payload.error) throw new Error(payload.error);
  return payload.company;
}

// Who may save the company settings. The rule is the server's own rule, so a Save button on screen
// is never a dead end: the company's admins, and anyone the settings area is open to at all.
export function canSaveSettings({ role, isCompanyAdmin, access, levelOf } = {}) {
  if (role === 'company_admin' || isCompanyAdmin) return true;
  // Nothing has been answered yet: the server's own answer decides, so the button is offered.
  if (!access) return true;
  return typeof levelOf === 'function' && levelOf('settings') !== 'none';
}