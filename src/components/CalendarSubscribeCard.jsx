import React, { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Copy, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';

// Subscribing once keeps a phone calendar in step with the roster: the feed is built from the
// live shifts and approved leave, so a change on the roster shows up on the next refresh.
export default function CalendarSubscribeCard() {
  const { t } = useI18n();
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const loaded = useRef(false);

  const load = async (rotate) => {
    setLoading(true);
    const response = await base44.functions
      .invoke('calendarLink', { origin: window.location.origin, action: rotate ? 'rotate' : '' })
      .catch(() => null);
    setLoading(false);
    const data = (response && response.data) || {};
    if (data.error || !data.url) {
      toast({ title: t('leave.calendarFailed'), variant: 'destructive' });
      return;
    }
    setUrl(data.url);
    if (rotate) toast({ title: t('leave.linkReplaced') });
  };

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    load(false);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('leave.copied') });
    } catch {
      toast({ title: t('leave.copyFailed'), variant: 'destructive' });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarPlus className="h-4 w-4" /> {t('leave.calendar')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('leave.calendarHint')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input readOnly value={loading && !url ? t('common.loading') : url} className="min-w-0 flex-1 font-mono text-xs" />
          <Button variant="outline" onClick={copy} disabled={!url}>
            <Copy className="mr-2 h-4 w-4" /> {t('common.copy')}
          </Button>
          <Button variant="ghost" onClick={() => load(true)} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {t('leave.rotateLink')}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">{t('leave.calendarHow')}</p>
      </CardContent>
    </Card>
  );
}