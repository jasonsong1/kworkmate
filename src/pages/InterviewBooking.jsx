import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CalendarCheck, CheckCircle2, Clock, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DAYS } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

function weekday(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const index = d.getUTCDay();
  return DAYS[(index + 6) % 7].label;
}

const wantsChange = () => new URLSearchParams(window.location.search).get('change') === '1';

export default function InterviewBooking() {
  const { token } = useParams();
  const [state, setState] = useState('loading');
  const [data, setData] = useState(null);
  const [booking, setBooking] = useState(null);
  const [message, setMessage] = useState('');

  const load = async () => {
    const response = await base44.functions.invoke('getBookingData', { token });
    const payload = response.data || {};
    if (!payload.ok) {
      setState('invalid');
      return;
    }
    setData(payload);
    // The "change my time" button in the confirmation email opens this page on the open times.
    if (payload.booked && payload.allow_reschedule && wantsChange()) setState('select');
    else setState(payload.booked ? 'booked' : 'select');
  };

  useEffect(() => {
    load();
  }, [token]);

  const book = async (slot) => {
    const changing = state === 'select' && Boolean(data && data.booked);
    setBooking(slot.id);
    setMessage('');
    const response = await base44.functions.invoke('bookInterviewSlot', {
      token,
      slot_id: slot.id,
      origin: window.location.origin
    });
    const result = response.data || {};
    setBooking(null);
    if (result.taken) {
      setMessage('Sorry — that time was just taken. Please choose another slot.');
      await load();
      return;
    }
    if (result.cancelled) {
      setMessage('That slot is no longer available. Please choose another.');
      await load();
      return;
    }
    if (result.error) {
      setMessage(result.error);
      return;
    }
    // A change link is spent once used, so the page settles on the new booking.
    if (changing) {
      window.history.replaceState({}, '', window.location.pathname);
      setMessage('Your interview time has been changed.');
    }
    await load();
  };

  const brand = (data && data.job && data.branch && data.branch.brand_color) || '#4338ca';

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
          <h1 className="text-lg font-semibold">Link not recognised</h1>
          <p className="mt-2 text-sm text-slate-500">
            This booking link is invalid or has expired. Please reply to our email and we will send a new link.
          </p>
        </div>
      </div>
    );
  }

  const grouped = (data.slots || []).reduce((acc, slot) => {
    acc[slot.date] = acc[slot.date] || [];
    acc[slot.date].push(slot);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="px-4 pb-8 pt-8 text-white" style={{ backgroundColor: brand }}>
        <div className="mx-auto max-w-xl">
          <p className="text-xs uppercase tracking-widest opacity-80">
            {data.branch ? data.branch.name : ''}
          </p>
          <h1 className="mt-2 text-2xl font-bold">
            {state === 'booked' ? 'Your interview is confirmed' : `Hi ${data.applicant.first_name}, pick your interview time`}
          </h1>
          <p className="mt-2 text-sm opacity-90">
            {data.job ? data.job.title : 'Interview'} · {data.duration_min} minutes
            {data.location ? ` · ${data.location}` : ''}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
        {message && (
          <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {message}
          </p>
        )}

        {state === 'booked' && data.booked && (
          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-500" />
            <p className="flex items-center gap-2 text-lg font-semibold">
              <CalendarCheck className="h-5 w-5" />
              {weekday(data.booked.date)}, {data.booked.date}
            </p>
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <Clock className="h-4 w-4" /> {data.booked.start_time} – {data.booked.end_time}
            </p>
            {data.location && (
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4" /> {data.location}
              </p>
            )}
            <p className="mt-4 text-sm text-slate-500">
              A calendar invitation (.ics) was emailed to you. Please arrive 5 minutes early.
            </p>
            {data.allow_reschedule && (
              <Button variant="outline" className="mt-4" onClick={() => setState('select')}>
                Change my interview time
              </Button>
            )}
          </div>
        )}

        {state === 'select' && (
          <>
            {data.booked && data.allow_reschedule && (
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sm text-sky-900">
                Your interview is currently booked for{' '}
                <b>
                  {weekday(data.booked.date)}, {data.booked.date} at {data.booked.start_time}
                </b>
                . Choose a new time below and it will replace it.
              </div>
            )}
            {(data.slots || []).length === 0 ? (
              <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
                <p className="text-sm text-slate-500">
                  No interview times are open right now. Our team will contact you shortly with new times.
                </p>
              </div>
            ) : (
              Object.keys(grouped)
                .sort()
                .map((date) => (
                  <div key={date} className="rounded-2xl border bg-white p-5 shadow-sm">
                    <p className="mb-3 text-sm font-semibold">
                      {weekday(date)}, {date}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {grouped[date]
                        .sort((a, b) => (a.start_time > b.start_time ? 1 : -1))
                        .map((slot) => (
                          <Button
                            key={slot.id}
                            variant="outline"
                            disabled={booking === slot.id}
                            onClick={() => book(slot)}
                          >
                            {booking === slot.id && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                            {slot.start_time}
                          </Button>
                        ))}
                    </div>
                  </div>
                ))
            )}
            <p className="text-center text-xs text-slate-400">
              Times are limited — the first person to book a slot confirms it.
            </p>
          </>
        )}
      </main>
    </div>
  );
}