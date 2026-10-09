import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { conversationOf } from '@/lib/interviewConversation';
import { base44 } from '@/api/base44Client';

// The video interview as the conversation it was: what the interviewer asked, what the candidate
// answered, and the recording behind each answer. It stays folded away until a manager opens it.
export default function VideoInterviewPanel({ responses }) {
  const { t } = useI18n();
  const [urls, setUrls] = useState({});
  const [openKey, setOpenKey] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const list = conversationOf(responses);

  if (list.length === 0) return null;

  const play = async (item) => {
    if (!item.turn.file_uri) return;
    setBusyKey(item.key);
    try {
      const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: item.turn.file_uri });
      setUrls((prev) => ({ ...prev, [item.key]: signed_url }));
      setOpenKey(item.key);
    } finally {
      setBusyKey(null);
    }
  };

  // Closing also drops the signed link, so playback stops and the section stays compact.
  const close = (key) => {
    setOpenKey((prev) => (prev === key ? null : prev));
    setUrls((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('applicants.videoAnswers')}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {expanded ? t('applicants.hideConversation') : t('applicants.showConversation')}
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
      </button>

      {expanded ? (
        <div className="max-h-72 space-y-2 overflow-y-auto border-t px-3 py-3">
          {list.map((item) => {
            const mine = item.role === 'candidate';
            return (
              <div key={item.key} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[92%] rounded-xl border px-3 py-2 ${mine ? 'bg-muted/40' : ''}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {mine ? t('applicants.candidate') : t('applicants.interviewer')}
                  </p>
                  {item.text ? <p className="mt-0.5 text-sm">{item.text}</p> : null}
                  {mine && item.turn.file_uri ? (
                    openKey === item.key && urls[item.key] ? (
                      <div className="mt-2">
                        <video controls autoPlay src={urls[item.key]} className="w-full rounded-lg bg-black" />
                        <Button size="sm" variant="outline" className="mt-2" onClick={() => close(item.key)}>
                          <X className="mr-1.5 h-3.5 w-3.5" /> {t('applicants.hideVideo')}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        onClick={() => play(item)}
                        disabled={busyKey === item.key}
                      >
                        {busyKey === item.key ? (
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {t('applicants.watchVideo')}
                      </Button>
                    )
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}