import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2, Square, Video, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { base44 } from '@/api/base44Client';

const pickMime = () => {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return options.find((type) => MediaRecorder.isTypeSupported(type)) || '';
};

export default function VideoInterview() {
  const { token } = useParams();
  const [state, setState] = useState('loading');
  const [data, setData] = useState(null);
  const [index, setIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const mimeRef = useRef('');
  const timerRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      const response = await base44.functions.invoke('getVideoInterview', { token });
      const payload = response.data || {};
      if (payload.error || !payload.questions || payload.questions.length === 0) {
        setState('missing');
        return;
      }
      setData(payload);
      setState(payload.completed ? 'done' : 'ready');
    };
    load();
  }, [token]);

  const questions = (data && data.questions) || [];
  const current = questions[index];
  const limit = (current && current.seconds) || 60;
  const questionText = (current && current.question) || '';
  const active = state === 'ready' || state === 'recording' || state === 'saving';

  // The camera stays on for the whole interview so the applicant sees themselves while answering.
  useEffect(() => {
    if (!active) return undefined;
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
  }, [active]);

  // The question is read out loud instead of written down.
  const speak = (text) => {
    if (!text || typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = /[가-힣]/.test(text) ? 'ko-KR' : 'en-AU';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  // The question is only read out when the applicant presses "Play the question", so nobody
  // walks into a question before they are ready.

  const upload = async (blob) => {
    setState('saving');
    setError('');
    try {
      const isMp4 = (mimeRef.current || '').includes('mp4');
      const extension = isMp4 ? 'mp4' : 'webm';
      const file = new File([blob], `answer-${index + 1}.${extension}`, { type: mimeRef.current || 'video/webm' });
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const response = await base44.functions.invoke('submitVideoInterviewAnswer', {
        token,
        index,
        question: questionText,
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
    }
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    setState('saving');
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
          <h1 className="text-lg font-semibold">Thank you!</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your video interview has been sent to the hiring team. They will be in touch about the next step.
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
            {state === 'recording' ? (
              <span className="font-medium text-red-600">
                Recording {elapsed}s / {limit}s
              </span>
            ) : null}
          </div>
          <Progress value={((index + (state === 'recording' ? 0.5 : 0)) / questions.length) * 100} className="h-1.5" />

          <div className="mt-5 flex flex-col items-center gap-3 text-center">
            <Button variant="outline" size="lg" onClick={() => speak(questionText)}>
              <Volume2 className="mr-2 h-4 w-4" /> Play the question
            </Button>
            <p className="text-sm text-slate-500">
              Listen to the question, then record your answer on camera for up to {limit} seconds.
            </p>
          </div>

          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="mt-5 aspect-video w-full rounded-xl bg-black object-cover"
          />

          <div className="mt-5 flex flex-col items-center gap-3">
            {state === 'saving' ? (
              <p className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Saving your answer…
              </p>
            ) : state === 'recording' ? (
              <Button size="lg" variant="destructive" className="w-full" onClick={stopRecording}>
                <Square className="mr-2 h-4 w-4" /> Stop and continue
              </Button>
            ) : (
              <Button size="lg" className="w-full" onClick={startRecording} disabled={!cameraReady}>
                <Video className="mr-2 h-4 w-4" /> {index === 0 ? 'Start recording' : 'Record answer'}
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
          Your recording is stored privately and only the hiring team can watch it.
        </p>
      </main>
    </div>
  );
}