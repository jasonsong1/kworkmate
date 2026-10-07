import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QrCard from '@/components/attendance/QrCard';
import { Image } from '@/components/ui/image';
import { AlertCircle, CheckCircle2, Keyboard, Loader2, LogIn, LogOut, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { kioskUrl } from '@/lib/kioskLink';
import { cn } from '@/lib/utils';

// Employee numbers mix letters, digits, spaces and hyphens (ED-003, BOT-00007), and are typed by
// hand, so whatever is typed is kept as-is and only trimmed when the punch is sent.
const normaliseNumber = (value) => value.toUpperCase().slice(0, 20);
const normalisePin = (value) => value.replace(/\D/g, '').slice(0, 6);

const MESSAGES = {
  invalid_link: 'This link is not valid. Please ask your manager for a new QR code.',
  expired_link: 'This QR code is not for today. Please scan today’s code.',
  branch_unavailable: 'This store is not available right now.',
  employee_not_found: 'We could not find that employee number at this store.',
  employee_inactive: 'That employee number is no longer active.',
  pin_required: 'Please enter your PIN.',
  pin_not_set: 'No PIN is set for this employee number yet. Please ask your manager.',
  pin_wrong: 'That PIN is not correct. Please try again.',
  already_clocked_in: 'This employee is already clocked in.',
  not_clocked_in: 'This employee has not clocked in yet.'
};

export default function Kiosk() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [state, setState] = useState('loading');
  // The tablet shows the store QR for staff to scan with their own phone first, and the keypad
  // for anyone without a phone as the second option. Both live in this one screen, which needs
  // no sign in.
  const [mode, setMode] = useState('qr');
  const [number, setNumber] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [me, setMe] = useState(null);
  // Which punch the person is about to record. The buttons only choose it; the store code
  // below is what records it.
  const [intent, setIntent] = useState('');

  useEffect(() => {
    const load = async () => {
      const response = await base44.functions.invoke('kioskPunch', { token, action: 'info' }).catch(() => ({ data: {} }));
      const data = response.data || {};
      if (data.error) {
        setError(MESSAGES[data.error] || 'This kiosk link is not available.');
        setState('invalid');
        return;
      }
      setInfo(data);
      setState('ready');
      const authed = await base44.auth.isAuthenticated().catch(() => false);
      if (authed) setMe(await base44.auth.me().catch(() => null));
    };
    load();
  }, [token]);

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
      setError('Please enter your employee number.');
      return;
    }
    if (!pin) {
      setError('Please enter your PIN.');
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
    // A punch made with a number only counts once a manager has accepted it.
    setResult({ ...data, pending: true });
    setNumber('');
    setPin('');
  };

  // Clock in or clock out is chosen here, and nothing is recorded by choosing it: the store
  // code below is what records the punch.
  const chooseIntent = (action) => {
    setIntent(action);
    setMode('qr');
    setError('');
    setResult(null);
  };

  const brand = (info && info.brand_color) || '#4338ca';
  const logoUrl = (info && info.qr_design && info.qr_design.logo_url) || '';

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc]">
        <Loader2 className="h-6 w-6 animate-spin text-[#94a3b8]" />
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center text-[#0f172a] shadow-sm">
          <AlertCircle className="mx-auto mb-4 h-8 w-8 text-[#94a3b8]" />
          <h1 className="text-lg font-semibold">Kiosk unavailable</h1>
          <p className="mt-2 text-sm text-[#475569]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-16">
      <header className="relative overflow-hidden px-6 pb-12 pt-10 text-white" style={{ backgroundColor: brand }}>
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{ backgroundImage: 'radial-gradient(circle at 15% 0%, #ffffff 0%, transparent 45%)' }}
        />
        <div className="relative mx-auto max-w-xl text-center">
          {logoUrl ? (
            <div className="mx-auto mb-4 h-16 w-40 overflow-hidden rounded-xl bg-white/95 p-3">
              <Image src={logoUrl} alt={info.company_name || ''} fittingType="fit" className="h-full w-full" />
            </div>
          ) : null}
          <p className="text-xs uppercase tracking-[0.2em] opacity-80">{info.company_name || ''}</p>
          <h1 className="mt-2 text-3xl font-bold">{info.branch_name}</h1>
          <p className="mt-1 text-sm opacity-90">Attendance kiosk · {info.date}</p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
        {me ? (
          <div className="rounded-3xl border border-[#e2e8f0] bg-white p-6 text-[#0f172a] shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-base font-semibold text-[#4338ca]">
                {(me.full_name || me.email || '?').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-[#64748b]">Signed in as</p>
                <p className="truncate text-lg font-semibold leading-tight">{me.full_name || me.email}</p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-1.5 rounded-2xl bg-[#f1f5f9] p-1.5">
              <button
                type="button"
                onClick={() => chooseIntent('in')}
                className={cn(
                  'flex h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold transition-colors',
                  intent === 'in' ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#475569]'
                )}
              >
                <LogIn className="h-4 w-4" /> Clock in
              </button>
              <button
                type="button"
                onClick={() => chooseIntent('out')}
                className={cn(
                  'flex h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold transition-colors',
                  intent === 'out' ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#475569]'
                )}
              >
                <LogOut className="h-4 w-4" /> Clock out
              </button>
            </div>

            <p className="mt-3 text-xs text-[#64748b]">
              {intent
                ? `Clock ${intent === 'out' ? 'out' : 'in'} chosen — scan the store code below with your phone to record it.`
                : 'Choose clock in or clock out first, then scan the store code below with your phone.'}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[#e9eef5] p-1.5">
          {[
            { key: 'qr', label: 'Store QR', icon: QrCode },
            { key: 'number', label: 'My number', icon: Keyboard }
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setMode(item.key)}
              className={cn(
                'flex h-12 items-center justify-center gap-2 rounded-xl text-base font-semibold transition-colors',
                mode === item.key ? 'bg-white text-[#0f172a] shadow-sm' : 'text-[#475569]'
              )}
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </button>
          ))}
        </div>

        {mode === 'number' ? (
          <div className="rounded-3xl border border-[#e2e8f0] bg-white p-6 text-[#0f172a] shadow-sm">
            <p className="text-sm font-semibold">Enter your employee number and PIN</p>
            <div className="mt-4">
              <Input
                value={number}
                onChange={(event) => changeNumber(event.target.value)}
                placeholder="ED-003"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={busy}
                className="h-20 text-center font-mono text-3xl font-bold tracking-widest text-[#0f172a] placeholder:text-[#94a3b8]"
              />
            </div>
            <p className="mt-4 text-xs font-medium text-[#475569]">PIN</p>
            <Input
              value={pin}
              onChange={(event) => changePin(event.target.value)}
              placeholder="••••"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              className="mt-1 h-16 text-center font-mono text-2xl tracking-[0.5em] text-[#0f172a] placeholder:text-[#94a3b8]"
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button size="lg" className="h-14 text-base" disabled={busy} onClick={() => punch('in')}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Clock in
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 text-base text-[#0f172a]"
                disabled={busy}
                onClick={() => punch('out')}
              >
                Clock out
              </Button>
            </div>

            <p className="mt-3 text-xs text-[#64748b]">
              Entries made here are saved as pending and a manager approves them.
            </p>
          </div>
        ) : (
          <div className="rounded-3xl border border-[#e2e8f0] bg-white p-6 text-center text-[#0f172a] shadow-sm">
            <QrCard
              url={kioskUrl(info.branch_id, info.date)}
              design={info.qr_design}
              noteClassName="text-[#475569]"
              fallbackTitle={intent === 'out' ? 'Scan to clock out' : 'Scan to clock in'}
              fallbackNote={`Point a phone camera at this code to open today’s clock for ${info.branch_name}, then enter your employee number and PIN.`}
            />
          </div>
        )}

        {result ? (
          <div className="flex items-start gap-3 rounded-2xl border border-[#a7f3d0] bg-[#ecfdf5] p-5 text-[#065f46]">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">
                {result.action === 'in' ? 'Clock in request sent' : 'Clock out request sent'}
              </p>
              <p className="text-sm">
                {result.name ? `${result.name} · ` : ''}
                Inform your manager for approval.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-[#fecaca] bg-[#fef2f2] p-5 text-[#b91c1c]">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}