import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

/**
 * Supabase Realtime WebSocket을 활용한 무새로고침 초고속 실시간 데이터 동기화 훅
 * 
 * [특징 및 안전성]
 * 1. 주기적인 폴링(Polling)을 하지 않고, DB 변경 이벤트가 웹소켓을 통해 푸시될 때만 반응합니다.
 * 2. 300ms 디바운스(Debounce)를 적용하여 데이터가 여러 건 연속으로 들어와도 단 1회만 화면을 갱신하므로
 *    시스템 과부하와 불필요한 렌더링을 원천 차단합니다.
 * 3. 컴포넌트가 사라질 때(Unmount) 웹소켓 구독을 자동으로 해제하여 메모리 누수를 방지합니다.
 * 
 * @param {string|string[]} tables - 감시할 Supabase 테이블명 (예: 'leave_request' 또는 ['time_entry', 'attendance_record'])
 * @param {Function} onSync - 변경 감지 시 실행할 새로고침/로딩 함수 (예: load)
 * @param {Object} options - 옵션 설정 (delay: 디바운스 지연시간 ms)
 */
export function useRealtimeSync(tables, onSync, options = {}) {
  const debounceTimer = useRef(null);
  const callbackRef = useRef(onSync);
  callbackRef.current = onSync;

  const tablesKey = Array.isArray(tables) ? tables.slice().sort().join(',') : String(tables);

  useEffect(() => {
    if (!supabase) return;

    const list = Array.isArray(tables) ? tables : [tables];
    if (list.length === 0) return;

    // 과부하 방지 디바운스 트리거 (기본값 300ms)
    const trigger = () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        if (callbackRef.current) {
          callbackRef.current();
        }
      }, options.delay || 300);
    };

    const channelName = `rt-sync-${list.join('-')}-${Math.random().toString(36).slice(2, 8)}`;
    let ch = supabase.channel(channelName);

    list.forEach((tbl) => {
      ch = ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tbl },
        () => trigger()
      );
    });

    ch.subscribe();

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      try {
        supabase.removeChannel(ch);
      } catch (err) {
        // 채널 정리 시 에러 무시
      }
    };
  }, [tablesKey, options.delay]);
}
