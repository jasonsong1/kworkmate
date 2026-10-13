// ============================================================
// http.mjs
// 목적: Edge Function 공통 도구 - CORS 처리와 오류를 한 곳에서 처리합니다.
// 브라우저가 다른 주소(앱 도메인)에서 함수를 호출할 때 필요한 허용 헤더를 붙여 줍니다.
// ============================================================

// 앱 도메인만 허용하려면 Supabase 비밀값 ALLOWED_ORIGIN 에 주소를 넣으세요. (예: https://app.example.com)
// 비어 있으면 모든 주소를 허용합니다. (쿠키가 아닌 토큰 방식이라 위험이 낮습니다)
function corsHeaders(allowedOrigin) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-kw-session',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

// handler(req) 가 돌려준 Response 에 CORS 헤더를 붙이고, 예상 못한 오류도 JSON 으로 돌려줍니다.
export function withCors(handler, allowedOrigin) {
  return async (req) => {
    const cors = corsHeaders(allowedOrigin);
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      const response = await handler(req);
      const headers = new Headers(response.headers);
      Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      return new Response(JSON.stringify({ error: error && error.message ? error.message : 'Server error' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
  };
}
