import { createBase44Like } from '../_shared/server.ts';

function getSecret(name: string) {
  return (typeof Deno !== 'undefined' ? Deno.env.get(name) : '') || '';
}

/**
 * Xero OAuth 2.0 Callback 처리 엣지 펑션
 * Xero에서 승인 후 전달되는 code를 받아 토큰과 테넌트 정보를 교환하고 저장합니다.
 */
Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const stateStr = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    let origin = 'http://localhost:5173';
    let companyId = '';

    if (stateStr) {
      try {
        const decoded = JSON.parse(atob(stateStr));
        origin = decoded.origin || origin;
        companyId = decoded.company_id || '';
      } catch (e) {
        console.warn('Failed to parse state:', e);
      }
    }

    // Xero에서 사용자가 거부했거나 오류가 발생한 경우
    if (error || !code) {
      console.error('Xero OAuth Error:', error);
      return Response.redirect(`${origin}/settings?xero=error&msg=${encodeURIComponent(error || '인증이 취소되었습니다.')}`, 302);
    }

    const clientId = getSecret('XERO_CLIENT_ID');
    const clientSecret = getSecret('XERO_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return Response.redirect(`${origin}/settings?xero=error&msg=${encodeURIComponent('Xero 클라이언트 키가 설정되지 않았습니다.')}`, 302);
    }

    const redirectUri = 'https://yktviwzqjzhfbfuuaamf.supabase.co/functions/v1/xeroCallback';

    // 1. Authorization Code를 Access Token 및 Refresh Token으로 교환
    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      }).toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Xero Token Exchange Failed:', errText);
      return Response.redirect(`${origin}/settings?xero=error&msg=${encodeURIComponent('Xero 토큰 발급에 실패했습니다.')}`, 302);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = Number(tokenData.expires_in) || 1800; // 보통 30분
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // 2. 연결된 Xero 조직(Tenants) 정보 조회
    const connRes = await fetch('https://api.xero.com/connections', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!connRes.ok) {
      console.error('Xero Connections Query Failed');
      return Response.redirect(`${origin}/settings?xero=error&msg=${encodeURIComponent('Xero 조직 정보 조회에 실패했습니다.')}`, 302);
    }

    const connections = await connRes.json();
    const primaryTenant = (connections && connections[0]) || null;
    const tenantId = primaryTenant?.tenantId || '';
    const tenantName = primaryTenant?.tenantName || 'My Xero Organisation';

    // 3. 회사(Company) 엔티티에 Xero 인증 정보 저장
    if (companyId) {
      const base44 = createBase44Like();
      await base44.asServiceRole.entities.Company.update(companyId, {
        xero_connected: true,
        xero_tenant_id: tenantId,
        xero_tenant_name: tenantName,
        xero_access_token: accessToken,
        xero_refresh_token: refreshToken,
        xero_token_expires_at: expiresAt,
        xero_connected_at: new Date().toISOString()
      }).catch((e: any) => console.error('Failed to update company with xero token:', e));
    }

    // 4. 성공 후 점주님 화면으로 기분 좋게 복귀!
    return Response.redirect(`${origin}/settings?xero=success&tenant=${encodeURIComponent(tenantName)}`, 302);
  } catch (err: any) {
    console.error('xeroCallback unexpected error:', err);
    return new Response(`Xero Callback Error: ${err?.message || 'Internal Server Error'}`, { status: 500 });
  }
});
