import React, { useEffect, useState } from 'react';
import { CalendarPlus, Loader2, RefreshCw } from 'lucide-react';
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

// The private address a person pastes into their phone calendar. Opening the popup is what
// asks the server for it, so the link is always created for whoever is signed in.
export default function CalendarSubscribeDialog({ open, onOpenChange }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [url, setUrl] = useState('');
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
    if (rotate) toast({ title: t('leave.linkReplaced') });
  };

  useEffect(() => {
    if (!open) return;
    setUrl('');
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

        <div className="space-y-3">
          <Input
            readOnly
            value={loading && !url ? t('common.loading') : url}
            className="font-mono text-xs"
          />
          <p className="text-[11px] text-muted-foreground">{t('leave.calendarHow')}</p>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => load(true)} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {t('leave.rotateLink')}
          </Button>
          <Button onClick={save} disabled={!url}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}