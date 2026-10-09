import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Headphones, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { conversationOf } from '@/lib/interviewConversation';
import { base44 } from '@/api/base44Client';

// The voice interview as the conversation it was: what the interviewer asked, what the candidate
// answered, and the recording behind each answer. It stays folded away until a manager opens it.
export default function MiniInterviewPanel({ responses }) {
  const { t } = useI18n();
  const [urls, setUrls] = useState({});
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
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('applicants.voiceAnswers')}
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
                    urls[item.key] ? (
                      <audio controls src={urls[item.key]} className="mt-2 w-full" />
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
                          <Headphones className="mr-1.5 h-3.5 w-3.5" />
                        )}
                        {t('applicants.listen')}
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