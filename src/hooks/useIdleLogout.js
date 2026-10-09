import { useEffect, useRef } from 'react';

// Half an hour with nothing touched on the screen closes the session, so a phone left on a
// counter cannot be picked up and used by whoever comes next.
const IDLE_MS = 30 * 60 * 1000;

const ACTIVITY = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'wheel'];

export default function useIdleLogout(active, onIdle) {
  const handler = useRef(onIdle);
  handler.current = onIdle;

  useEffect(() => {
    if (!active) return undefined;
    let timer = null;

    const restart = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => handler.current(), IDLE_MS);
    };

    restart();
    ACTIVITY.forEach((name) => window.addEventListener(name, restart, { passive: true }));
    document.addEventListener('visibilitychange', restart);

    return () => {
      if (timer) clearTimeout(timer);
      ACTIVITY.forEach((name) => window.removeEventListener(name, restart));
      document.removeEventListener('visibilitychange', restart);
    };
  }, [active]);
}