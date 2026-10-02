import React, { useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';

export default function VideoInterviewPanel({ responses }) {
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
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Video interview answers</p>
      {list.map((item, index) => (
        <div key={index} className="rounded-lg border px-3 py-2">
          <p className="text-xs text-muted-foreground">{item.question}</p>
          {item.transcript ? <p className="mt-1 text-sm">{item.transcript}</p> : null}
          {item.file_uri ? (
            urls[index] ? (
              <video controls src={urls[index]} className="mt-2 w-full rounded-lg bg-black" />
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
                Watch
              </Button>
            )
          ) : null}
        </div>
      ))}
    </div>
  );
}