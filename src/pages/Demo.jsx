import React, { useState } from 'react';
import useDemoState from '@/hooks/useDemoState';
import DemoShell from '@/components/demo/DemoShell';
import DemoDashboard from '@/components/demo/DemoDashboard';
import DemoApplicants from '@/components/demo/DemoApplicants';
import DemoRoster from '@/components/demo/DemoRoster';
import DemoOnboarding from '@/components/demo/DemoOnboarding';
import DemoAttendance from '@/components/demo/DemoAttendance';

/**
 * K-Workmate 코어 기능 인터랙티브 데모 페이지
 * 
 * 실제 백오피스 프로덕트(좌측 사이드바 + 상단 헤더)와 동일한 Look & Feel을 제공합니다.
 * 사용자 피드백에 따라 너무 많은 부가 기능은 배제하고,
 * 가장 핵심적인 5대 코어 기능만 직관적으로 체험할 수 있도록 구성했습니다:
 * 1. 대시보드 (매장 KPI 및 채용 파이프라인)
 * 2. 지원자 선별 (AI 적합율 스크리닝 분석)
 * 3. 스마트 근무표 (주간 시프트 편성 및 실시간 인건비 합계)
 * 4. 직원 온보딩 (호주 ATO NAT 3092 TFN 선언서, 슈퍼, 전자서명)
 * 5. 출퇴근 키오스크 (실시간 QR코드 및 PIN 출퇴근 기록)
 * 
 * 모든 동작은 순수 클라이언트 가상 상태로 동작하여 안전하며 실제 데이터에 영향을 주지 않습니다.
 */
export default function Demo() {
  const s = useDemoState();
  const [tab, setTab] = useState('dashboard');

  return (
    <DemoShell activeTab={tab} onSelectTab={setTab} c={s.c}>
      {/* 1. 대시보드 코어 탭 */}
      {tab === 'dashboard' && <DemoDashboard s={s} />}

      {/* 2. 지원자 선별 & AI 적합율 스크리닝 코어 탭 */}
      {tab === 'applicants' && <DemoApplicants s={s} />}

      {/* 3. 스마트 주간 근무표 & 실시간 인건비 계산 코어 탭 */}
      {tab === 'roster' && <DemoRoster s={s} />}

      {/* 4. 호주 ATO NAT 3092 TFN & 슈퍼 온보딩 코어 탭 */}
      {tab === 'onboarding' && <DemoOnboarding s={s} />}

      {/* 5. 매장 출퇴근 키오스크 (QR & PIN) 코어 탭 */}
      {tab === 'attendance' && <DemoAttendance s={s} />}
    </DemoShell>
  );
}