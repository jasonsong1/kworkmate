import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Square, Video, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';
import useInterviewConversation from '@/hooks/useInterviewConversation';

const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

export default function VideoInterview() {
  const { token } = useParams();
  const { state, data, turns, current, saving, error, setError, answer } = useInterviewConversation({
    token,
    getFunction: 'getVideoInterview',
    submitFunction: 'submitVideoInterviewAnswer'
  });
  const [mode, setMode] = useState('idle'); // idle | recording | saving
  const [elapsed, setElapsed] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeRef = useRef('');
  const timerRef = useRef(null);

  const total = (data && data.total) || 0;
  const covered = turns.filter((turn) => turn.role !== 'interviewer' && turn.kind !== 'followup').length;
  const questionText = (current && current.question) || '';
  const limit = (current && current.seconds) || 60;
  const busy = saving || mode === 'saving';

  // The camera stays on for the whole conversation so the applicant sees themselves while answering.
  useEffect(() => {
    if (state !== 'ready') return undefined;
    let cancelled = false;
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: 'user', width: { ideal: 640 } }
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setCameraReady(true);
      } catch (err) {
        setError('Camera and microphone access is needed to record your answers.');
      }
    };
    start();
    return () => {
      cancelled = true;
      clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
    };
  }, [state]);

  // The question is read out loud instead of written down.
  const speak = (text) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[가-힣]/.test(text) ? 'ko-KR' : 'en-AU';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  // The first question is read out for the applicant when the interview opens, so the conversation
  // begins by itself; every later question is read when they press the button.
  useEffect(() => {
    if (state !== 'ready' || turns.length !== 0 || !questionText) return undefined;
    speak(`${data && data.greeting ? `${data.greeting} ` : ''}${questionText}`);
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    };
  }, [state, turns.length, questionText]);

  const upload = async (blob) => {
    try {
      const isMp4 = (mimeRef.current || '').includes('mp4');
      const extension = isMp4 ? 'mp4' : 'webm';
      const file = new File([blob], `answer-${turns.length + 1}.${extension}`, {
        type: mimeRef.current || 'video/webm'
      });
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      await answer(file_uri);
    } catch (err) {
      setError(err.message || 'Your answer could not be saved. Please try again.');
    } finally {
      setMode('idle');
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    setMode('saving');
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel();
    setError('');
    try {
      const mime = pickMime();
      mimeRef.current = mime;
      const recorder = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        await upload(new Blob(chunksRef.current, { type: mime || 'video/webm' }));
      };
      recorderRef.current = recorder;
      recorder.start();
      setElapsed(0);
      setMode('recording');
      timerRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev + 1 >= limit) {
            clearInterval(timerRef.current);
            setMode('saving');
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
              recorderRef.current.stop();
            }
            return limit;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setError('Recording could not start on this device.');
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
          <h1 className="text-lg font-semibold">
            Thank you{data && data.full_name ? `, ${data.full_name.split(' ')[0]}` : ''}!
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            That is the whole conversation. Your video interview has been sent to the hiring team, and they will be in
            touch about the next step.
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
          <h1 className="mt-2 text-2xl font-bold">Video interview</h1>
          <p className="mt-1 text-sm opacity-90">
            {data.job_title ? data.job_title : 'Shortlisted candidate'} · {total} topics
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="mb-2.5 flex items-center justify-between text-xs text-slate-500">
            <span>
              {current && current.kind === 'followup'
                ? `Follow-up · topic ${current.topic_index + 1} of ${total}`
                : `Topic ${Math.min(covered + 1, total)} of ${total}`}
            </span>
            {mode === 'recording' ? (
              <span className="font-medium text-red-600">
                Recording {elapsed}s / {limit}s
              </span>
            ) : null}
          </div>
          <Progress value={(covered / (total || 1)) * 100} className="h-1.5" />
        </div>

        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="aspect-video w-full rounded-xl bg-black object-cover"
          />

          <div className="mt-5 flex flex-col items-center gap-3">
            {busy ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking about your answer…
              </p>
            ) : mode === 'recording' ? (
              <Button size="lg" variant="destructive" className="w-full" onClick={stopRecording}>
                <Square className="mr-2 h-4 w-4" /> Stop and continue
              </Button>
            ) : (
              <Button size="lg" className="w-full" onClick={startRecording} disabled={!cameraReady}>
                <Video className="mr-2 h-4 w-4" /> {turns.length === 0 ? 'Start the interview' : 'Record your answer'}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => speak(questionText)}
              disabled={!questionText || mode === 'recording'}
            >
              <Volume2 className="mr-2 h-4 w-4" /> Play the question again
            </Button>
          </div>

          {error ? (
            <p className="mt-4 flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" /> {error}
            </p>
          ) : null}
        </div>

        <p className="text-center text-xs text-slate-400">
          Your recording is stored privately and only the hiring team can watch it.
        </p>
      </main>
    </div>
  );
}