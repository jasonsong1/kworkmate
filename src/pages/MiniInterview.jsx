import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Mic, Square, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';

export default function MiniInterview() {
  const { token } = useParams();
  const [state, setState] = useState('loading');
  const [data, setData] = useState(null);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      const response = await base44.functions.invoke('getMiniInterview', { token });
      const payload = response.data || {};
      if (payload.error || !payload.questions) {
        setState('missing');
        return;
      }
      setData(payload);
      setState(payload.completed ? 'done' : 'ready');
    };
    load();
  }, [token]);

  useEffect(() => () => clearInterval(timerRef.current), []);

  const questions = (data && data.questions) || [];
  const current = questions[index];
  const limit = (current && current.seconds) || 60;
  const questionText = (current && current.question) || '';

  // The question is read out loud instead of written down, so the applicant answers by voice.
  const speak = (text) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[가-힣]/.test(text) ? 'ko-KR' : 'en-AU';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (state !== 'ready') return undefined;
    speak(questionText);
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, [state, questionText]);

  const upload = async (blob) => {
    setSaving(true);
    setError('');
    try {
      const file = new File([blob], `answer-${index + 1}.webm`, { type: blob.type || 'audio/webm' });
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const response = await base44.functions.invoke('submitMiniInterviewAnswer', {
        token,
        index,
        question: current.question,
        file_uri
      });
      if (response.data?.error) throw new Error(response.data.error);
      if (response.data?.completed) {
        setState('done');
        return;
      }
      setIndex((prev) => prev + 1);
      setState('ready');
    } catch (err) {
      setError(err.message);
      setState('ready');
    } finally {
      setSaving(false);
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setState('saving');
  };

  const startRecording = async () => {
    setError('');
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        await upload(new Blob(chunksRef.current, { type: 'audio/webm' }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setElapsed(0);
      setState('recording');
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= limit) {
            clearInterval(timerRef.current);
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
              recorderRef.current.stop();
              setState('saving');
            }
            return limit;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setError('Microphone access is needed to record your answer.');
    }
  };

  const brand = (data && data.brand_color) || '#4338ca';

  if (state === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state === 'missing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto mb-4 h-8 w-8 text-slate-400" />
          <h1 className="text-lg font-semibold">Interview link not found</h1>
          <p className="mt-2 text-sm text-slate-500">This link is no longer valid. Please contact the store.</p>
        </div>
      </div>
    );
  }

  if (state === 'done') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-500" />
          <h1 className="text-lg font-semibold">Thank you!</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your voice interview has been sent to the hiring team. They will be in touch about the next step.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="px-4 py-8 text-white" style={{ backgroundColor: brand }}>
        <div className="mx-auto max-w-xl">
          <p className="text-xs uppercase tracking-widest opacity-80">{data.company_name || ''}</p>
          <h1 className="mt-2 text-2xl font-bold">Voice interview</h1>
          <p className="mt-1 text-sm opacity-90">
            {data.job_title ? data.job_title : 'Shortlisted candidate'} · {questions.length} questions
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              Question {index + 1} of {questions.length}
            </span>
            {state === 'recording' ? <span className="font-medium text-red-600">Recording {elapsed}s / {limit}s</span> : null}
          </div>
          <Progress value={((index + (state === 'recording' ? 0.5 : 0)) / questions.length) * 100} className="h-1.5" />

          <div className="mt-5 flex flex-col items-center gap-3 text-center">
            <Button variant="outline" size="lg" onClick={() => speak(questionText)}>
              <Volume2 className="mr-2 h-4 w-4" /> Play the question
            </Button>
            <p className="text-sm text-slate-500">
              Listen to the question, then answer out loud for up to {limit} seconds.
            </p>
          </div>

          <div className="mt-6 flex flex-col items-center gap-3">
            {state === 'saving' ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Saving your answer…
              </p>
            ) : state === 'recording' ? (
              <Button size="lg" variant="destructive" onClick={stopRecording}>
                <Square className="mr-2 h-4 w-4" /> Stop and continue
              </Button>
            ) : (
              <Button size="lg" onClick={startRecording} disabled={saving}>
                <Mic className="mr-2 h-4 w-4" /> {index === 0 ? 'Start recording' : 'Record answer'}
              </Button>
            )}
          </div>

          {error ? (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </p>
          ) : null}
        </div>

        <p className="text-center text-xs text-slate-400">
          Your recording is stored privately and only the hiring team can listen to it.
        </p>
      </main>
    </div>
  );
}