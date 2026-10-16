import React, { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Copy, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';

// 사원의 개인 캘린더 피드를 구독하여 스마트폰(아이폰/안드로이드) 캘린더에 실시간 시프트를 동기화합니다.
export default function CalendarSubscribeCard() {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [webcalUrl, setWebcalUrl] = useState('');
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
    setWebcalUrl(data.webcal_url || data.url.replace(/^https?:\/\//i, 'webcal://'));
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
          {url && (
            <Button variant="default" asChild className="gap-1.5">
              <a href={webcalUrl || url.replace(/^https?:\/\//i, 'webcal://')} target="_blank" rel="noopener noreferrer">
                <Smartphone className="h-4 w-4" />
                {lang === 'ko' ? '모바일 캘린더 바로 등록' : 'Subscribe on Phone'}
              </a>
            </Button>
          )}
          <Button variant="ghost" onClick={() => load(true)} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            {t('leave.rotateLink')}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {lang === 'ko'
            ? '아이폰(iOS) 또는 갤럭시(Google) 캘린더에서 [캘린더 구독/URL로 추가] 메뉴에 이 주소를 붙여넣거나, [모바일 캘린더 바로 등록]을 누르면 1초 만에 시프트가 자동 연동됩니다.'
            : t('leave.calendarHow')}
        </p>
      </CardContent>
    </Card>
  );
}