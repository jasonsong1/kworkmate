// ============================================================
// server.ts  (Deno / Edge Function 전용)
// 목적: Edge Function 안에서 service_role 권한의 Supabase 클라이언트를 만들고,
//       그것으로 base44 호환 객체를 만들어 줍니다.
//
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase 가 Edge Function 실행 환경에
// 자동으로 넣어 줍니다. 코드나 .env.local 에 직접 적지 않습니다. (브라우저에 절대 노출 금지)
// ============================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import { createCompatClient } from './compat.mjs';

export function createBase44Like() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Server is not configured');
  const supabase = createClient(url, key, {
    // 서버에서는 로그인 세션을 저장할 필요가 없습니다.
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return createCompatClient(supabase);
}
