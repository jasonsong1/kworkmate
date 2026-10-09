import React, { useState } from 'react';
import { Headphones, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';

// The voice interview as the conversation it was: what the interviewer asked, what the candidate
// answered, and the recording behind each answer.
export default function MiniInterviewPanel({ responses }) {
  const { t } = useI18n();
  const [urls, setUrls] = useState({});
  const [busyIndex, setBusyIndex] = useState(null);
  const list = Array.isArray(responses) ? responses : [];

  if (list.length === 0) return null;

  const play = async (item, index) => {
    if (!item.file_uri) return;
    setBusyIndex(index);
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: item.file_uri });
      setUrls((prev) => ({ ...prev, [index]: signed_url }));
    } finally {
      setBusyIndex(null);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('applicants.voiceAnswers')}
      </p>
      {list.map((item, index) => {
        const mine = item.role !== 'interviewer';
        return (
          <div
            key={index}
            className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[92%] rounded-xl border px-3 py-2 ${mine ? 'bg-muted/40' : ''}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {mine ? t('applicants.candidate') : t('applicants.interviewer')}
              </p>
              <p className="mt-0.5 text-sm">{mine ? item.transcript || item.question : item.question}</p>
              {mine && item.transcript && item.question ? (
                <p className="mt-1 text-xs text-muted-foreground">→ {item.question}</p>
              ) : null}
              {mine && item.file_uri ? (
                urls[index] ? (
                  <audio controls src={urls[index]} className="mt-2 w-full" />
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={() => play(item, index)}
                    disabled={busyIndex === index}
                  >
                    {busyIndex === index ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Headphones className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Listen
                  </Button>
                )
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}