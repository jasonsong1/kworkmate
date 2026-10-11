import React, { useState } from 'react';
import useDemoState from '@/hooks/useDemoState';
import DemoHeader from '@/components/demo/DemoHeader';
import DemoNav from '@/components/demo/DemoNav';
import DemoDashboard from '@/components/demo/DemoDashboard';
import DemoApplicants from '@/components/demo/DemoApplicants';
import DemoInterviews from '@/components/demo/DemoInterviews';
import DemoRoster from '@/components/demo/DemoRoster';
import DemoOnboarding from '@/components/demo/DemoOnboarding';

// The public sample demo. Fixed sample data and client-side state only: nothing here reads or
// writes a record, sends mail or runs an analysis.
export default function Demo() {
  const s = useDemoState();
  const [tab, setTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-background font-body">
      <DemoHeader c={s.c} />

      <div className="mx-auto w-full max-w-6xl px-5 pt-5">
        <DemoNav c={s.c} value={tab} onChange={setTab} />
      </div>

      <main className="mx-auto w-full max-w-6xl px-5 py-6">
        {tab === 'dashboard' && <DemoDashboard s={s} />}
        {tab === 'applicants' && <DemoApplicants s={s} />}
        {tab === 'interviews' && <DemoInterviews s={s} />}
        {tab === 'roster' && <DemoRoster s={s} />}
        {tab === 'onboarding' && <DemoOnboarding s={s} />}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-5 pb-10 text-xs text-muted-foreground">
        {s.c.sim.notice}
      </footer>
    </div>
  );
}