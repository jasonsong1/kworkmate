import { base44 } from '@/api/base44Client';

// The company settings are written on the server: the caller's own grant is worked out there, and
// the company record is only ever read back from that one answer.
export async function saveCompanySettings(companyId, data) {
  const response = await base44.functions.invoke('saveCompanySettings', { company_id: companyId, data });
  const payload = response.data || {};
  if (payload.error) throw new Error(payload.error);
  return payload.company;
}