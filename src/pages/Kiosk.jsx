import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { AlertCircle, CheckCircle2, Keyboard, Loader2, MapPin, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { kioskUrl } from '@/lib/kioskLink';

// Employee numbers mix letters, digits and hyphens (ED-003, BOT-00007).
const normaliseNumber = (value) => value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12);
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
  // The tablet shows the store QR for staff to scan with their own phone, and the keypad
  // for anyone without a phone. Both live in this one screen, which needs no sign in.
  const [mode, setMode] = useState('number');
  const [number, setNumber] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [me, setMe] = useState(null);
  const [coords, setCoords] = useState(null);

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

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

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
    setResult(data);
    setNumber('');
    setPin('');
  };

  const personalPunch = async (action) => {
    if (!coords) {
      setError('Location is needed to record your own attendance. Please allow location access.');
      return;
    }
    setBusy(true);
    setError('');
    const response = await base44.functions.invoke('attendancePunch', {
      branch_id: info.branch_id,
      action,
      lat: coords.lat,
      lng: coords.lng
    });
    setBusy(false);
    const data = response.data || {};
    if (data.outside_radius) {
      setError(`You are ${data.distance}m from the store (allowed ${data.radius}m).`);
      return;
    }
    if (data.error) {
      setError(data.error);
      return;
    }
    setResult({ name: me ? me.full_name : '', action });
  };

  const brand = (info && info.brand_color) || '#4338ca';

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (state === 'invalid') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-4 h-8 w-8 text-slate-400" />
          <h1 className="text-lg font-semibold">Kiosk unavailable</h1>
          <p className="mt-2 text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="px-6 py-8 text-white" style={{ backgroundColor: brand }}>
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs uppercase tracking-[0.2em] opacity-80">{info.company_name || ''}</p>
          <h1 className="mt-2 text-3xl font-bold">{info.branch_name}</h1>
          <p className="mt-1 text-sm opacity-90">Attendance kiosk · {info.date}</p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
        {me ? (
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-slate-500">Signed in as</p>
            <p className="text-lg font-semibold">{me.full_name || me.email}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button size="lg" className="h-14 text-base" disabled={busy} onClick={() => personalPunch('in')}>
                Clock in
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 text-base"
                disabled={busy}
                onClick={() => personalPunch('out')}
              >
                Clock out
              </Button>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <MapPin className="h-3.5 w-3.5" />
              {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : 'Waiting for your location…'}
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-white p-1.5 shadow-sm">
          <Button
            variant={mode === 'number' ? 'default' : 'ghost'}
            className="h-12 text-base"
            onClick={() => setMode('number')}
          >
            <Keyboard className="mr-2 h-4 w-4" /> My number
          </Button>
          <Button
            variant={mode === 'qr' ? 'default' : 'ghost'}
            className="h-12 text-base"
            onClick={() => setMode('qr')}
          >
            <QrCode className="mr-2 h-4 w-4" /> Store QR
          </Button>
        </div>

        {mode === 'number' ? (
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
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
                className="h-20 text-center font-mono text-3xl font-bold tracking-widest"
              />
            </div>
            <p className="mt-4 text-xs font-medium text-slate-500">PIN</p>
            <Input
              value={pin}
              onChange={(event) => changePin(event.target.value)}
              placeholder="••••"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              className="mt-1 h-16 text-center font-mono text-2xl tracking-[0.5em]"
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Button size="lg" className="h-14 text-base" disabled={busy} onClick={() => punch('in')}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Clock in
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 text-base"
                disabled={busy}
                onClick={() => punch('out')}
              >
                Clock out
              </Button>
            </div>

            <p className="mt-3 text-xs text-slate-400">
              Entries made here are saved as pending and a manager approves them.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-semibold">Scan to clock in</p>
            <div className="mt-4 flex justify-center rounded-2xl border p-3">
              <QRCodeSVG value={kioskUrl(info.branch_id, info.date)} size={240} level="M" marginSize={4} />
            </div>
            <p className="mt-4 text-xs text-slate-500">
              Point a phone camera at this code to open today’s clock for {info.branch_name}, then enter your
              employee number and PIN.
            </p>
          </div>
        )}

        {result ? (
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">
                {result.action === 'in' ? 'Clock in recorded' : 'Clock out recorded'}
              </p>
              <p className="text-sm">
                {result.name ? `${result.name} · ` : ''}
                {me ? 'Thank you.' : 'Waiting for manager approval.'}
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}