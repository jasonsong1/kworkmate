import { useState } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { demoText } from '@/lib/demoText';
import {
  DEMO_APPLICANTS,
  DEMO_JOBS,
  DEMO_ONBOARDINGS,
  DEMO_SHIFTS,
  DEMO_SLOTS,
  demoTodayIndex,
  demoWeek,
} from '@/lib/demoData';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const emptyDocs = () =>
  ['passport', 'tfn', 'super', 'bank'].map((key) => ({ key, state: 'waiting' }));

// Everything the demo screens share. Every action only moves this client-side state and says so,
// so no record is written, no email is sent and no analysis is run.
export default function useDemoState() {
  const { lang } = useI18n();
  const c = demoText(lang);
  const { toast } = useToast();

  const [applicants, setApplicants] = useState(DEMO_APPLICANTS);
  const [shifts, setShifts] = useState([]);
  const [slots] = useState(DEMO_SLOTS);
  const [onboardings, setOnboardings] = useState(DEMO_ONBOARDINGS);
  const [jobId, setJobId] = useState(DEMO_JOBS[0].id);
  const [screening, setScreening] = useState(false);
  const [building, setBuilding] = useState(false);
  const [savedWeek, setSavedWeek] = useState(false);

  const simulated = (title) => toast({ title, description: c.sim.notice });

  const runScreening = async () => {
    if (screening) return;
    setScreening(true);
    await wait(1400);
    setApplicants((prev) => prev.map((a) => (a.analyzed ? a : { ...a, analyzed: true })));
    setScreening(false);
    simulated(c.sim.screening);
  };

  const setStage = (id, stage) => {
    setApplicants((prev) => prev.map((a) => (a.id === id ? { ...a, stage } : a)));
    simulated(c.sim.mail);
  };

  const hire = (applicant) => {
    const job = DEMO_JOBS.find((j) => j.id === applicant.job_id);
    setApplicants((prev) => prev.map((a) => (a.id === applicant.id ? { ...a, stage: 'hired' } : a)));
    setOnboardings((prev) => [
      {
        id: `ob-${applicant.id}`,
        name: applicant.name,
        position: job ? job.position : '',
        branch: job ? job.branch : '',
        status: 'pending',
        started: new Date().toISOString().slice(0, 10),
        answers: [],
        docs: emptyDocs(),
        submittedAt: '',
      },
      ...prev.filter((o) => o.name !== applicant.name),
    ]);
    simulated(c.sim.hire);
  };

  const buildRoster = async () => {
    if (building) return;
    setBuilding(true);
    await wait(1600);
    setShifts(DEMO_SHIFTS);
    setSavedWeek(false);
    setBuilding(false);
    simulated(c.sim.roster);
  };

  const saveRoster = () => {
    setSavedWeek(true);
    simulated(c.sim.save);
  };

  const submitOnboarding = (id) => {
    const now = new Date();
    const stamp = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 5)}`;
    setOnboardings((prev) =>
      prev.map((o) =>
        o.id === id
          ? {
              ...o,
              status: 'completed',
              answers: c.ob.questionsList.map((_, i) => o.answers[i] || '—'),
              docs: o.docs.map((d) => ({ ...d, state: 'submitted' })),
              submittedAt: stamp,
            }
          : o
      )
    );
    simulated(c.sim.onboarding);
  };

  return {
    c,
    week: demoWeek(),
    todayIndex: demoTodayIndex(),
    jobs: DEMO_JOBS,
    jobId,
    setJobId,
    applicants,
    slots,
    shifts,
    onboardings,
    screening,
    building,
    savedWeek,
    runScreening,
    setStage,
    hire,
    buildRoster,
    saveRoster,
    submitOnboarding,
  };
}