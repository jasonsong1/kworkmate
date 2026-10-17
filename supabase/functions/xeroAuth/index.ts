import { createBase44Like } from '../_shared/server.ts';
import { withCors } from '../_shared/http.mjs';
import { resolveCaller } from '../_shared/kwAuth.ts';

function getSecret(name: string) {
  return (typeof Deno !== 'undefined' ? Deno.env.get(name) : '') || '';
}

async function handler(req: Request) {
  try {
    const base44 = createBase44Like();
    const me = await resolveCaller(base44, req);
    if (!me) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action = 'get_auth_url', origin = 'http://localhost:5173', company_id } = body;

    const targetCompanyId = company_id || me.company_id;
    if (!targetCompanyId) {
      return Response.json({ error: 'company_id is required' }, { status: 400 });
    }

    const clientId = getSecret('XERO_CLIENT_ID');
    const redirectUri = 'https://yktviwzqjzhfbfuuaamf.supabase.co/functions/v1/xeroCallback';

    // 1. Xero 인증 시작 URL 생성
    if (action === 'get_auth_url') {
      if (!clientId) {
        return Response.json({ error: 'Xero Client ID가 설정되지 않았습니다.' }, { status: 500 });
      }

      const statePayload = {
        company_id: targetCompanyId,
        origin: origin,
        user_email: me.email,
        timestamp: Date.now()
      };
      const state = btoa(JSON.stringify(statePayload));

      const scopes = [
        'openid',
        'profile',
        'email',
        'offline_access',
        'payroll.timesheets',
        'payroll.employees',
        'accounting.settings',
        'accounting.contacts'
      ].join(' ');

      const authUrl = `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
        scopes
      )}&state=${encodeURIComponent(state)}`;

      return Response.json({ success: true, auth_url: authUrl });
    }

    // 2. Xero 연동 해제
    if (action === 'disconnect') {
      await base44.asServiceRole.entities.Company.update(targetCompanyId, {
        xero_connected: false,
        xero_tenant_id: null,
        xero_tenant_name: null,
        xero_access_token: null,
        xero_refresh_token: null,
        xero_token_expires_at: null,
        xero_disconnected_at: new Date().toISOString()
      });

      return Response.json({ success: true, message: 'Xero 연동이 해제되었습니다.' });
    }

    // 3. 연동 상태 조회
    if (action === 'status') {
      const company = await base44.asServiceRole.entities.Company.get(targetCompanyId).catch(() => null);
      return Response.json({
        success: true,
        connected: Boolean(company?.xero_connected),
        tenant_name: company?.xero_tenant_name || null,
        connected_at: company?.xero_connected_at || null
      });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    console.error('xeroAuth error:', err);
    return Response.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

// Supabase Edge Runtime 표준 Deno.serve 서빙
Deno.serve(withCors(handler, Deno.env.get('ALLOWED_ORIGIN') || undefined));
