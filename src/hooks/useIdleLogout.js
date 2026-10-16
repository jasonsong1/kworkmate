import { useEffect, useRef } from 'react';

// ============================================================
// useIdleLogout.js
// 목적: 30분 동안 사용자의 입력이나 움직임이 없으면 자동으로 로그아웃시킵니다.
//
// 핵심 동작 원리:
// 1. 브라우저/세션 독립성:
//    - sessionStorage('kw_last_activity_time')를 활용하여 브라우저 창/인스턴스마다
//      각각 독립적으로 마지막 활동 시간을 기록합니다.
//    - 동일 계정이라도 1번 브라우저에서 30분간 움직이지 않으면 1번 브라우저만 로그아웃되며,
//      활동 중인 2번 브라우저는 세션이 정상 유지됩니다.
// 2. 정확한 타임스탬프 기반 검사:
//    - 단순 setTimeout 타이머에 의존하지 않고, 실제 타임스탬프(Date.now()) 차이를 계산합니다.
//    - 탭이 백그라운드에 가있거나 PC가 절전 모드에 들어갔다 오더라도,
//      화면으로 복귀할 때(visibilitychange, focus) 경과 시간을 즉시 확인하여 30분이 넘었으면 즉각 로그아웃합니다.
// 3. 성능 최적화:
//    - 마우스 이동이나 스크롤 이벤트 발생 시 매번 쓰기를 하지 않고,
//      최소 2초 간격으로 스로틀링(Throttling)하여 브라우저 성능에 부담을 주지 않습니다.
// ============================================================

// 30분 (밀리초 단위: 30분 * 60초 * 1000ms = 1,800,000ms)
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

// 마지막 활동 시각을 저장하는 브라우저 세션 스토리지 키
const ACTIVITY_STORAGE_KEY = 'kw_last_activity_time';

// 사용자 활동으로 감지할 브라우저 이벤트 목록
const USER_ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'touchstart',
  'scroll',
  'wheel',
  'click'
];

export default function useIdleLogout(active, onIdle) {
  const handlerRef = useRef(onIdle);
  handlerRef.current = onIdle;

  const lastRecordedTimeRef = useRef(0);
  const isLoggedOutRef = useRef(false);

  useEffect(() => {
    // 로그인되지 않은 상태라면 리스너를 등록하지 않음
    if (!active) {
      isLoggedOutRef.current = false;
      return undefined;
    }

    isLoggedOutRef.current = false;

    // 현재 브라우저의 마지막 활동 시간 가져오기 (없으면 현재 시간으로 초기화)
    const getStoredLastActivity = () => {
      try {
        const stored = sessionStorage.getItem(ACTIVITY_STORAGE_KEY);
        const parsed = Number(stored);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      } catch (_) {}
      return Date.now();
    };

    // 현재 브라우저의 마지막 활동 시간 갱신 함수 (2초 간격 스로틀링 적용)
    const recordActivity = (force = false) => {
      if (isLoggedOutRef.current) return;
      const now = Date.now();
      // 마지막 갱신 후 2초 이상 지났거나 강제 갱신일 때만 기록
      if (force || now - lastRecordedTimeRef.current >= 2000) {
        lastRecordedTimeRef.current = now;
        try {
          sessionStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
        } catch (_) {}
      }
    };

    // 30분 경과 여부 확인 및 자동 로그아웃 실행 함수
    const checkIdleStatus = () => {
      if (isLoggedOutRef.current) return;

      const now = Date.now();
      const lastActivity = getStoredLastActivity();
      const elapsed = now - lastActivity;

      // 마지막 활동 시각으로부터 30분 이상 지났다면 로그아웃 실행
      if (elapsed >= IDLE_TIMEOUT_MS) {
        isLoggedOutRef.current = true;
        try {
          // 자동 로그아웃되었음을 로그인 페이지에서 알 수 있도록 플래그 저장
          sessionStorage.setItem('kw_idle_logout', 'true');
        } catch (_) {}

        if (handlerRef.current) {
          handlerRef.current();
        }
      }
    };

    // 시작 시점 활동 시간 기록
    recordActivity(true);

    // 활동 이벤트 리스너 핸들러
    const onUserAction = () => {
      recordActivity(false);
    };

    // 창이 다시 활성화되거나 탭으로 돌아왔을 때 경과 시간 즉시 검사
    const onWindowFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        // 백그라운드에 머무는 동안 30분이 지났는지 즉시 점검
        checkIdleStatus();
      }
    };

    // 이벤트 리스너 등록 (수동 터치, 마우스, 키보드)
    USER_ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, onUserAction, { passive: true });
    });

    // 화면 포커스 및 가시성 변경 이벤트 리스너 등록
    document.addEventListener('visibilitychange', onWindowFocusOrVisible);
    window.addEventListener('focus', onWindowFocusOrVisible);

    // 주기적으로 5초마다 30분 유휴 여부를 정밀 체크하는 인터벌 타이머
    const intervalId = setInterval(checkIdleStatus, 5000);

    return () => {
      clearInterval(intervalId);
      USER_ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, onUserAction);
      });
      document.removeEventListener('visibilitychange', onWindowFocusOrVisible);
      window.removeEventListener('focus', onWindowFocusOrVisible);
    };
  }, [active]);
}