import React from 'react';
import { Navigate } from 'react-router-dom';
import { kwActive } from '@/lib/kwAuthClient';
import { Loader2 } from 'lucide-react';

// 보호된 화면(대시보드 등)에 비로그인 사용자가 접근했을 때 처리:
// 세션이 남아있는 경우 즉시 로그인 복원을 대기하고, 비로그인 시 로그인 페이지(/login)로 안전하게 이동합니다.
// 로그인 밖의 마케팅 페이지(/welcome)로 튕기지 않도록 방어합니다.
export default function FirstVisit() {
  const here = window.location.pathname + window.location.search;

  // 로컬에 세션 토큰이 있으면 세션 복원 중이므로 로딩 스피너 표시
  if (kwActive()) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // 로그인 페이지로 이동하며, 로그인 후 원래 접근하려던 페이지(here)로 복귀할 수 있도록 설정
  const destination = here === '/' || here === '/welcome' ? '/login' : `/login?returnTo=${encodeURIComponent(here)}`;
  return <Navigate to={destination} replace />;
}