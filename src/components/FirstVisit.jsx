import React from 'react';
import { Navigate } from 'react-router-dom';
import { kwActive } from '@/lib/kwAuthClient';
import { Loader2 } from 'lucide-react';

// 보호된 화면에 비로그인 사용자가 접근했을 때 처리:
// 세션이 남아있는 경우 로딩 스피너를 표시하고, 비로그인 상태의 첫 방문(루트 /)은 서비스 소개(/welcome)로,
// 그 외 내부 업무 화면에 직접 진입하려던 사용자는 로그인 페이지(/login)로 안전하게 안내합니다.
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

  // 첫 방문(루트 /)은 소개 및 데모 체험이 있는 /welcome으로 이동, 그 외 보호된 페이지는 /login으로 이동
  const destination = here === '/' ? '/welcome' : `/login?returnTo=${encodeURIComponent(here)}`;
  return <Navigate to={destination} replace />;
}