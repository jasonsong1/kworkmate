import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QrCard from '@/components/attendance/QrCard';
import { Image } from '@/components/ui/image';
import { AlertCircle, CheckCircle2, Keyboard, Loader2, LogIn, LogOut, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { kioskUrl } from '@/lib/kioskLink';
import { applyTheme, readTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

// 사원 번호는 영문, 숫자, 하이픈 혼용 가능하며 대문자로 정규화
const normaliseNumber = (value) => value.toUpperCase().slice(0, 20);
const normalisePin = (value) => value.replace(/\D/g, '').slice(0, 6);

const MESSAGES = {
  invalid_link: '유효하지 않은 링크입니다. 관리자에게 새 QR 코드를 요청하세요.',
  expired_link: '오늘 날짜의 QR 코드가 아닙니다. 오늘의 코드를 스캔하세요.',
  branch_unavailable: '현재 이용할 수 없는 매장입니다.',
  employee_not_found: '해당 매장에 등록된 사원 번호를 찾을 수 없습니다.',
  employee_inactive: '더 이상 활성 상태가 아닌 사원 번호입니다.',
  pin_required: 'PIN 번호를 입력해주세요.',
  pin_not_set: '설정된 PIN이 없습니다. 관리자에게 문의하세요.',
  pin_wrong: 'PIN 번호가 올바르지 않습니다. 다시 시도해주세요.',
  already_clocked_in: '이미 출근 처리된 사원입니다.',
  not_clocked_in: '아직 출근하지 않은 사원입니다.'
};

/**
 * 출퇴근 QR 키오스크 페이지
 * 로그인된 계정의 테마(다크 모드 / 라이트 모드)를 그대로 따라가며,
 * 매장 QR 스캔 또는 사원번호/PIN 입력을 통한 출퇴근 타임을 지원합니다.
 */
export default function Kiosk() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [state, setState] = useState('loading');
  const [mode, setMode] = useState('qr');
  const [number, setNumber] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [me, setMe] = useState(null);
  const [dayRef, setDayRef] = useState(0);

  // 현재 브라우저 또는 계정의 테마 읽기 및 적용
  const [theme, setTheme] = useState(() => readTheme());

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const load = async () => {
      const response = await base44.functions.invoke('kioskPunch', { token, action: 'info' }).catch(() => ({ data: {} }));
      const data = response.data || {};
      if (data.error) {
        setError(MESSAGES[data.error] || '출퇴근 키오스크를 불러올 수 없습니다.');
        setState('invalid');
        return;
      }
      setInfo(data);
      setState('ready');

      // 로그인된 사용자 확인 및 다크모드 테마 동기화
      const authed = await base44.auth.isAuthenticated().catch(() => false);
      if (authed) {
        const currentUser = await base44.auth.me().catch(() => null);
        if (currentUser) {
          // 사용자 프로필에 저장된 ui_theme이 있으면 적용
          if (currentUser.ui_theme) {
            setTheme(currentUser.ui_theme);
            applyTheme(currentUser.ui_theme);
          }

          // [브랜치별 계정 이름 완전 격리]: 현재 키오스크 브랜치의 표시명 우선 확인
          let displayName = currentUser.full_name || currentUser.email;
          if (data.branch_id && currentUser.email) {
            const branchProfilesRaw = await base44.entities.EmployeeProfile
              .filter({ user_email: currentUser.email, branch_id: data.branch_id })
              .catch(() => []);
            const branchProfiles = Array.isArray(branchProfilesRaw) ? branchProfilesRaw : branchProfilesRaw?.items || [];
            if (branchProfiles.length > 0 && branchProfiles[0].full_name) {
              displayName = branchProfiles[0].full_name;
            }
          }
          setMe({ ...currentUser, full_name: displayName });
        }
      }
    };
    load();
  }, [token, dayRef]);

  // 매장의 현지 시간대 기준으로 자정이 넘어가면 QR 코드를 갱신
  useEffect(() => {
    if (!info || !info.timezone) return undefined;
    const check = setInterval(() => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: info.timezone });
      if (today !== info.date) setDayRef((value) => value + 1);
    }, 30000);
    return () => clearInterval(check);
  }, [info]);

  const changeNumber = (value) => {
    setResult(null);
    setError('');
    setNumber(normaliseNumber(value));
  };

  const changePin = (value) => {
    setResult(null);
    setError('');
    setPin(normalisePin(value));
  };

  const punch = async (action) => {
    if (!number) {
      setError('사원 번호를 입력해주세요.');
      return;
    }
    if (!pin) {
      setError('PIN 번호를 입력해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    const response = await base44.functions.invoke('kioskPunch', {
      token,
      action,
      employee_number: number,
      pin
    });
    setBusy(false);
    const data = response.data || {};
    if (data.error) {
      setError(MESSAGES[data.error] || data.error);
      return;
    }
    setResult({ ...data, pending: data.pending === true });
    setNumber('');
    setPin('');
  };

  const brand = (info && info.brand_color) || '#4338ca';

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] dark:bg-slate-950 transition-colors">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] dark:bg-slate-950 px-4 transition-colors">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-slate-900 dark:text-slate-100 shadow-sm">
          <AlertCircle className="mx-auto mb-4 h-8 w-8 text-slate-400" />
          <h1 className="text-lg font-semibold">키오스크 이용 불가</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 pb-16 transition-colors">
      {/* 키오스크 브랜드 배너 헤더 */}
      <header className="relative overflow-hidden px-6 pb-12 pt-10 text-white shadow-md" style={{ backgroundColor: brand }}>
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{ backgroundImage: 'radial-gradient(circle at 15% 0%, #ffffff 0%, transparent 45%)' }}
        />
        <div className="relative mx-auto max-w-xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] opacity-80">{info.company_name || ''}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{info.branch_name}</h1>
          <p className="mt-1 text-sm opacity-90">출퇴근 키오스크 · {info.date}</p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
        {/* 로그인된 사용자 정보 카드 */}
        {me ? (
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-slate-900 dark:text-slate-100 shadow-sm transition-colors">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-base font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900">
                {(me.full_name || me.email || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-slate-500 dark:text-slate-400">로그인 계정</p>
                <p className="truncate text-lg font-semibold leading-tight">{me.full_name || me.email}</p>
              </div>
            </div>

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              아래 매장 QR 코드를 개인 스마트폰으로 스캔하거나, [사원 번호] 탭으로 전환하여 직접 출퇴근을 기록하세요.
            </p>
          </div>
        ) : null}

        {/* 탭 전환 (Store QR / My number) */}
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-slate-200/70 dark:bg-slate-800/80 p-1.5 transition-colors">
          {[
            { key: 'qr', label: '매장 QR', icon: QrCode },
            { key: 'number', label: '사원 번호', icon: Keyboard }
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key)}
              className={cn(
                'flex h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold transition-all',
                mode === item.key
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              )}
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </button>
          ))}
        </div>

        {/* 사원번호 입력 모드 */}
        {mode === 'number' ? (
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-slate-900 dark:text-slate-100 shadow-sm transition-colors">
            <p className="text-sm font-semibold">사원 번호와 PIN을 입력하세요</p>
            <div className="mt-4">
              <Input
                value={number}
                onChange={(event) => changeNumber(event.target.value)}
                placeholder="ED-003"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={busy}
                className="h-20 text-center font-mono text-3xl font-bold tracking-widest text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>
            <p className="mt-4 text-xs font-medium text-slate-600 dark:text-slate-400">PIN (비밀번호)</p>
            <Input
              value={pin}
              onChange={(event) => changePin(event.target.value)}
              placeholder="••••"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              className="mt-1 h-16 text-center font-mono text-2xl tracking-[0.5em] text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button size="lg" className="h-14 text-base font-semibold" disabled={busy} onClick={() => punch('in')}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} 출근하기 (Clock in)
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 text-base font-semibold text-slate-900 dark:text-slate-100 border-slate-300 dark:border-slate-700 bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                disabled={busy}
                onClick={() => punch('out')}
              >
                퇴근하기 (Clock out)
              </Button>
            </div>

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              기록은 사원 번호에 맞춰 안전하게 저장됩니다. 매니저 계정의 기록은 즉시 승인 처리됩니다.
            </p>
          </div>
        ) : (
          /* 매장 QR 표시 모드 */
          <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center text-slate-900 dark:text-slate-100 shadow-sm transition-colors">
            <QrCard
              url={kioskUrl(info.branch_id, info.date)}
              design={info.qr_design}
              noteClassName="text-slate-600 dark:text-slate-400"
              fallbackTitle="매장 출퇴근 QR 코드"
              fallbackNote={`스마트폰 카메라로 이 코드를 스캔하여 ${info.branch_name}의 출퇴근을 진행하세요.`}
            />
          </div>
        )}

        {/* 결과 알림 */}
        {result ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-5 text-emerald-900 dark:text-emerald-200 transition-colors">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-semibold">
                {result.pending
                  ? result.action === 'in'
                    ? '출근 기록 승인 요청이 전송되었습니다'
                    : '퇴근 기록 승인 요청이 전송되었습니다'
                  : result.action === 'in'
                    ? '출근 기록 완료'
                    : '퇴근 기록 완료'}
              </p>
              <p className="text-sm">
                {result.name ? `${result.name} · ` : ''}
                {result.pending ? '매니저의 승인을 기다리고 있습니다.' : '정상 기록되었습니다.'}
              </p>
            </div>
          </div>
        ) : null}

        {/* 에러 알림 */}
        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-5 text-rose-900 dark:text-rose-200 transition-colors">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <p className="text-sm">{error}</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}