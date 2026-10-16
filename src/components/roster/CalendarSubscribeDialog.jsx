import React, { useEffect, useState } from 'react';
import { CalendarPlus, Copy, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';

// 직원의 근무표를 개인 스마트폰 캘린더에 연동하는 팝업 대화상자입니다.
export default function CalendarSubscribeDialog({ open, onOpenChange }) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const [url, setUrl] = useState('');
  const [webcalUrl, setWebcalUrl] = useState('');
  const [loading, setLoading] = useState(false);

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
    if (!open) return;
    setUrl('');
    setWebcalUrl('');
    load(false);
  }, [open]);

  const save = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: t('leave.copied') });
    } catch {
      toast({ title: t('leave.copyFailed'), variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-4 w-4" /> {t('leave.calendar')}
          </DialogTitle>
          <DialogDescription>{t('leave.calendarHint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Input readOnly value={loading && !url ? t('common.loading') : url} className="font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={save} disabled={!url} className="flex-1">
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {t('common.copy')}
            </Button>
            {url && (
              <Button size="sm" asChild className="flex-1 gap-1.5">
                <a href={webcalUrl || url.replace(/^https?:\/\//i, 'webcal://')} target="_blank" rel="noopener noreferrer">
                  <Smartphone className="h-3.5 w-3.5" />
                  {lang === 'ko' ? '모바일 캘린더 바로 등록' : 'Subscribe on Phone'}
                </a>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={loading}>
              {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              {t('leave.rotateLink')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {lang === 'ko'
              ? '아이폰(Apple 캘린더) 또는 갤럭시(Google 캘린더)에서 이 주소로 구독하시면 매주 배정되는 내 근무 시프트가 캘린더에 실시간으로 자동 동기화됩니다.'
              : t('leave.calendarHow')}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}