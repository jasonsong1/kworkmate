// ==============================================================================
// DemoAttendance.jsx
// 목적: KWorkMate의 킬러 기능인 매장 출퇴근 키오스크(QR코드 & PIN 번호 출퇴근) 가상 체험
// ==============================================================================

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QrCode, Smartphone, LogIn, LogOut, CheckCircle2, Store } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function DemoAttendance({ s }) {
  const { toast } = useToast();
  const [empNumber, setEmpNumber] = useState('SH-001');
  const [pin, setPin] = useState('1234');
  const [lastPunch, setLastPunch] = useState(null);

  const handlePunch = (type) => {
    const actionLabel = type === 'in' ? '출근 (Clock-In)' : '퇴근 (Clock-Out)';
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setLastPunch({ type, time: now, name: 'Emma Wilson (Barista)' });

    toast({
      title: `${actionLabel} 기록 완료!`,
      description: `[가상 체험] Emma Wilson님이 ${now}에 정상 기록되었습니다.`
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-semibold tracking-tight">
          출퇴근 키오스크 (Attendance Kiosk)
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          매장 태블릿에 띄워두고 직원이 스마트폰으로 QR을 찍거나, 사원번호로 간편하게 출퇴근하는 기능입니다.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 1. 매장 QR코드 스캔 카드 */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4 text-primary" /> 매장 실시간 QR코드 (태블릿 거치용)
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-6 text-center">
            <div className="relative rounded-2xl border-2 border-dashed border-primary/40 bg-muted/30 p-6 shadow-inner">
              {/* 가상 QR코드 디자인 */}
              <div className="flex h-48 w-48 items-center justify-center rounded-xl bg-white p-4 shadow-sm">
                <div className="grid grid-cols-4 gap-2">
                  <div className="h-8 w-8 rounded bg-slate-900" />
                  <div className="h-8 w-8 rounded bg-slate-200" />
                  <div className="h-8 w-8 rounded bg-slate-900" />
                  <div className="h-8 w-8 rounded bg-slate-900" />
                  <div className="h-8 w-8 rounded bg-slate-900" />
                  <div className="h-8 w-8 rounded bg-indigo-600" />
                  <div className="h-8 w-8 rounded bg-slate-900" />
                  <div className="h-8 w-8 rounded bg-slate-200" />
                  <div className="h-8 w-8 rounded bg-slate-200" />
                  <div className="h-8 w-8 rounded bg-slate-900" />
                  <div className="h-8 w-8 rounded bg-indigo-600" />
                  <div className="h-8 w-8 rounded bg-slate-900" />
                  <div className="h-8 w-8 rounded bg-slate-900" />
                  <div className="h-8 w-8 rounded bg-slate-200" />
                  <div className="h-8 w-8 rounded bg-slate-900" />
                  <div className="h-8 w-8 rounded bg-slate-900" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Smartphone className="h-4 w-4" /> 직원이 본인 폰 카메라로 스캔하면 1초 만에 출퇴근 완료
            </div>

            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              <Store className="h-3.5 w-3.5" /> 매장 GPS 반경 50m 내에서만 인식 (부정 출퇴근 원천 차단)
            </div>
          </CardContent>
        </Card>

        {/* 2. 매장 태블릿 PIN 직접 입력 체험 */}
        <Card className="border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-primary" /> 사원번호 & PIN 입력 출퇴근 시뮬레이션
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 p-6">
            <p className="text-xs text-muted-foreground">
              스마트폰을 소지하지 않은 직원은 매장 태블릿 화면에서 직접 번호를 입력하여 기록할 수 있습니다.
            </p>

            <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">사원번호 (Employee Number)</label>
                <Input
                  value={empNumber}
                  onChange={(e) => setEmpNumber(e.target.value)}
                  placeholder="예: SH-001"
                  className="mt-1 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground">보안 PIN (4자리)</label>
                <Input
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="mt-1 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  onClick={() => handlePunch('in')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <LogIn className="mr-2 h-4 w-4" /> 출근 기록 (Clock-In)
                </Button>
                <Button
                  onClick={() => handlePunch('out')}
                  variant="outline"
                  className="border-rose-200 text-rose-700 hover:bg-rose-50"
                >
                  <LogOut className="mr-2 h-4 w-4" /> 퇴근 기록 (Clock-Out)
                </Button>
              </div>
            </div>

            {/* 최근 기록 상태 */}
            {lastPunch && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3.5 text-xs text-emerald-900">
                <span className="font-semibold">최근 기록:</span> {lastPunch.name}님이 오늘{' '}
                <span className="font-mono font-bold">{lastPunch.time}</span>에{' '}
                {lastPunch.type === 'in' ? '출근' : '퇴근'} 처리되었습니다.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
