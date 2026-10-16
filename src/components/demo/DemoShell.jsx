import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  LayoutDashboard,
  UserSearch,
  CalendarDays,
  FileCheck2,
  Timer,
  Store,
  LogOut,
  Globe,
  Menu,
  ShieldCheck,
  Building2,
  Lock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * DemoShell 컴포넌트
 * 실제 KWorkMate 백오피스 관리자 화면(좌측 사이드바 + 상단 헤더)과 동일한 구조와 프리미엄 디자인을 제공합니다.
 * 사용자 요청에 따라 불필요한 가입/로그인 유도 요소(실제 매장에 도입하기, 무료가입, 로그인)는 제거하고
 * 핵심 5대 코어 기능 체험에만 집중하도록 구성했습니다.
 */
export default function DemoShell({ activeTab, onSelectTab, c, children }) {
  const { lang, toggle } = useI18n();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeBranch, setActiveBranch] = useState('surry-hills');

  // 실제 백오피스와 동일한 5대 핵심 코어 메뉴 정의
  const NAV_ITEMS = [
    {
      id: 'dashboard',
      label: c.nav.dashboard || '대시보드',
      enLabel: 'Dashboard',
      icon: LayoutDashboard,
      badge: 'Overview',
      desc: lang === 'ko' ? '매장 운영 현황 & 채용 파이프라인' : 'Store metrics & Hiring funnel'
    },
    {
      id: 'applicants',
      label: c.nav.applicants || '지원자 선별',
      enLabel: 'Applicant Screening',
      icon: UserSearch,
      badge: 'AI Match',
      desc: lang === 'ko' ? '호주 이력서 AI 적합율 자동 분석' : 'AI-powered resume evaluation'
    },
    {
      id: 'roster',
      label: c.nav.roster || '스마트 근무표',
      enLabel: 'Smart Roster',
      icon: CalendarDays,
      badge: 'Live Cost',
      desc: lang === 'ko' ? '주간 시프트 편성 및 인건비 실시간 계산' : 'Shift scheduling & live wage tracker'
    },
    {
      id: 'onboarding',
      label: c.nav.onboarding || '직원 온보딩',
      enLabel: 'ATO Onboarding',
      icon: FileCheck2,
      badge: 'ATO NAT 3092',
      desc: lang === 'ko' ? 'TFN 선언서, 슈퍼, 전자서명 자동화' : 'Tax declarations & Superannuation'
    },
    {
      id: 'attendance',
      label: c.nav.attendance || '출퇴근 키오스크',
      enLabel: 'Attendance Kiosk',
      icon: Timer,
      badge: 'QR / PIN',
      desc: lang === 'ko' ? '태블릿 QR코드 및 PIN 출퇴근 기록' : 'Fast tablet punch-in & out'
    }
  ];

  // 사이드바 내부 렌더링 함수 (데스크톱 및 모바일 서랍 공용)
  const renderSidebarContent = () => (
    <div className="flex h-full flex-col justify-between bg-card text-card-foreground">
      {/* 1. 상단 로고 및 브랜드 헤더 */}
      <div>
        <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-heading text-base font-bold tracking-tight">K-Workmate</span>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                PRO DEMO
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {lang === 'ko' ? '호주 호스피탈리티 매장 관리' : 'AU Hospitality Management'}
            </p>
          </div>
        </div>

        {/* 2. 지점 시뮬레이션 선택기 (실제 백오피스와 동일한 경험) */}
        <div className="px-4 py-3">
          <div className="rounded-lg border border-border/70 bg-muted/30 p-2.5">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground mb-1.5">
              <span className="flex items-center gap-1">
                <Store className="h-3.5 w-3.5 text-primary" />
                {lang === 'ko' ? '체험 매장 선택' : 'Sample Store'}
              </span>
              <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            </div>
            <select
              value={activeBranch}
              onChange={(e) => setActiveBranch(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="surry-hills">☕ Surry Hills 본점 (Sydney)</option>
              <option value="melbourne-cbd">🥐 Melbourne CBD 2호점</option>
            </select>
          </div>
        </div>

        {/* 3. 코어 메뉴 목록 */}
        <div className="px-3 py-2">
          <div className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {lang === 'ko' ? '핵심 코어 기능' : 'Core Features'}
          </div>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={cn(
                    'group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs font-medium transition-all duration-150',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn('h-4 w-4 shrink-0', isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground')} />
                    <div>
                      <div className="font-semibold">{item.label}</div>
                      <div className={cn('text-[10px] leading-tight line-clamp-1', isActive ? 'text-primary-foreground/80' : 'text-muted-foreground/80')}>
                        {item.desc}
                      </div>
                    </div>
                  </div>
                  {item.badge && (
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-tight',
                        isActive
                          ? 'bg-white/20 text-primary-foreground'
                          : 'bg-muted text-muted-foreground group-hover:bg-background'
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* 4. 하단 샌드박스 상태 안내 및 종료 링크 */}
      <div className="p-4 border-t border-border/60">
        <div className="rounded-xl border border-border/80 bg-muted/40 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1">
            <Lock className="h-3.5 w-3.5 text-primary" />
            <span>{c.top.virtual || (lang === 'ko' ? '가상 체험 모드' : 'Virtual Mode')}</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {lang === 'ko'
              ? '실제 데이터베이스에 저장되지 않는 안전한 가상 샌드박스 환경입니다.'
              : 'Safe sandbox environment with simulated store data.'}
          </p>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground px-1">
          <Link to="/welcome" className="flex items-center gap-1.5 hover:text-foreground hover:underline">
            <LogOut className="h-3.5 w-3.5" />
            <span>{c.top.exit || '데모 종료'}</span>
          </Link>
          <span className="text-[10px] text-muted-foreground/60">K-Workmate</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/20 font-body">
      {/* 1. 상단 글로벌 고정 헤더 */}
      <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-border/70 bg-background/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          {/* 모바일 햄버거 메뉴 토글 */}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              {renderSidebarContent()}
            </SheetContent>
          </Sheet>

          {/* 좌측 모바일/태블릿 로고 표시 */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
              KW
            </div>
            <span className="font-heading text-sm font-bold">K-Workmate</span>
          </div>

          {/* 데스크톱 상단 지점 표시 배너 */}
          <div className="hidden lg:flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              {activeBranch === 'surry-hills' ? '☕ Surry Hills 본점 (Live Demo)' : '🥐 Melbourne CBD 2호점 (Live Demo)'}
            </span>
            <span className="text-xs text-muted-foreground">
              {lang === 'ko' ? '호주 카페 & 레스토랑 통합 관리 시스템' : 'Australian Hospitality Staff & Compliance'}
            </span>
          </div>
        </div>

        {/* 상단 우측 액션 버튼들 (로그인/가입 버튼 제외하고 순수 데모 도구만 유지) */}
        <div className="flex items-center gap-2">
          {/* 언어 전환 버튼 */}
          <Button
            variant="outline"
            size="sm"
            onClick={toggle}
            className="h-8 gap-1.5 text-xs font-medium border-border/80"
          >
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{lang === 'ko' ? 'EN' : '한국어'}</span>
          </Button>

          {/* 데모 종료 버튼 */}
          <Button variant="outline" size="sm" asChild className="h-8 text-xs font-medium border-border/80 text-muted-foreground hover:text-foreground">
            <Link to="/welcome">
              <LogOut className="mr-1 h-3.5 w-3.5" />
              {c.top.exit || '데모 종료'}
            </Link>
          </Button>
        </div>
      </header>

      {/* 2. 메인 컨테이너 (좌측 고정 사이드바 + 우측 스크롤 본문) */}
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        {/* 데스크톱 고정 좌측 사이드바 (실제 백오피스와 동일한 w-64 너비) */}
        <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-border/60 lg:bg-card">
          {renderSidebarContent()}
        </aside>

        {/* 우측 메인 대시보드 뷰 */}
        <main className="flex-1 overflow-x-hidden p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl space-y-6">
            {children}
          </div>

          {/* 하단 안내 텍스트 */}
          <div className="mx-auto max-w-6xl mt-12 pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-2">
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span>{c.sim.notice}</span>
            </p>
            <p className="text-[11px]">K-Workmate Australian Hospitality Backoffice Demo</p>
          </div>
        </main>
      </div>
    </div>
  );
}
