import React, { useState } from 'react';
import { Loader2, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';

export default function VideoInterviewPanel({ responses }) {
  const { t } = useI18n();
  const [urls, setUrls] = useState({});
  const [openIndex, setOpenIndex] = useState(null);
  const [busyIndex, setBusyIndex] = useState(null);
  const list = Array.isArray(responses) ? responses : [];

  const play = async (item, index) => {
    if (!item.file_uri) return;
    setBusyIndex(index);
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: item.file_uri });
      setUrls((prev) => ({ ...prev, [index]: signed_url }));
      setOpenIndex(index);
    } finally {
      setBusyIndex(null);
    }
  };

  // Closing also drops the signed link, so playback stops and the section stays compact.
  const close = (index) => {
    setOpenIndex((prev) => (prev === index ? null : prev));
    setUrls((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  if (list.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {t('applicants.videoAnswers')}
      </p>
      {list.map((item, index) => (
        <div key={index} className="rounded-lg border px-3 py-2">
          <p className="text-xs text-muted-foreground">{item.question}</p>
          {item.transcript ? <p className="mt-1 text-sm">{item.transcript}</p> : null}
          {item.file_uri ? (
            openIndex === index && urls[index] ? (
              <div className="mt-2">
                <video controls autoPlay src={urls[index]} className="w-full rounded-lg bg-black" />
                <Button size="sm" variant="outline" className="mt-2" onClick={() => close(index)}>
                  <X className="mr-1.5 h-3.5 w-3.5" /> {t('applicants.hideVideo')}
                </Button>
              </div>
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
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t('applicants.watchVideo')}
              </Button>
            )
          ) : null}
        </div>
      ))}
    </div>
  );
}