// ============================================================
// base44Client.js
// 목적: 프론트엔드 전체에서 `base44` 이름으로 불러와 사용하는 통합 클라이언트
//
// 이제 @base44/sdk 를 사용하지 않고, 100% Supabase(DB, 57개 Edge Functions, Storage)로
// 연결된 자체 클라이언트를 내보냅니다.
// 화면 코드들은 `base44.entities.*`, `base44.functions.invoke(...)` 그대로 사용 가능합니다.
// ============================================================

import { createSupabaseAppClient } from '@/lib/kwAuthClient';

// 100% Supabase 단독 체제의 클라이언트를 생성하여 내보냅니다.
export const base44 = createSupabaseAppClient();