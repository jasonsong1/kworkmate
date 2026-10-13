import { createClient } from '@supabase/supabase-js';

// .env.local 에 적어둔 공개용 연결 정보를 읽어옵니다.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 값이 비어 있으면 연결이 불가능하므로 설정 여부를 알려주는 플래그를 제공합니다.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Supabase 클라이언트 (설정이 없으면 null).
// 이 파일은 아직 어떤 화면에서도 사용되지 않으므로 기존 앱 동작에는 영향이 없습니다.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// 연결 테스트용 함수: DB에 가벼운 조회를 보내 연결/권한 상태를 확인합니다.
// 사용 예) 브라우저 콘솔에서 (await import('/src/lib/supabaseClient.js')).testSupabaseConnection()
export async function testSupabaseConnection(table = 'companies') {
  if (!supabase) {
    return { ok: false, message: '.env.local 에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 가 없습니다.' };
  }
  const { error, count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: `연결 성공 (${table} 행 수: ${count})` };
}
