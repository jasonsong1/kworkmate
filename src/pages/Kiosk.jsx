import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Delete, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

const MESSAGES = {
  invalid_link: 'This link is not valid. Please ask your manager for a new QR code.',
  expired_link: 'This QR code is not for today. Please scan today’s code.',
  branch_unavailable: 'This store is not available right now.',
  employee_not_found: 'We could not find that employee number at this store.',
  employee_inactive: 'That employee number is no longer active.',
  already_clocked_in: 'This employee is already clocked in.',
  not_clocked_in: 'This employee has not clocked in yet.'
};

export default function Kiosk() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [state, setState] = useState('loading');
  const [number, setNumber] = useState('');
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

  const press = (key) => {
    setResult(null);
    setError('');
    if (key === 'clear') return setNumber('');
    if (key === 'back') return setNumber((prev) => prev.slice(0, -1));
    if (number.length >= 10) return;
    setNumber((prev) => prev + key);
  };

  const punch = async (action) => {
    if (!number) {
      setError('Please enter your employee number.');
      return;
    }
    setBusy(true);
    setError('');
    const response = await base44.functions.invoke('kioskPunch', {
      token,
      action,
      employee_number: number
    });
    setBusy(false);
    const data = response.data || {};
    if (data.error) {
      setError(MESSAGES[data.error] || data.error);
      return;
    }
    setResult(data);
    setNumber('');
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

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold">No phone? Enter your employee number</p>
          <div className="mt-4 rounded-xl border-2 border-dashed px-4 py-6 text-center">
            <p className="font-mono text-4xl font-bold tracking-widest tabular-nums">
              {number || '—'}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={busy}
                onClick={() => press(key)}
                className="flex h-16 items-center justify-center rounded-xl border text-xl font-semibold transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                {key === 'clear' ? 'C' : key === 'back' ? <Delete className="h-5 w-5" /> : key}
              </button>
            ))}
          </div>

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