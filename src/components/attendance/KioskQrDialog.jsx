import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n';
import { kioskUrl } from '@/lib/kioskLink';

export default function KioskQrDialog({ open, onOpenChange, branch, date }) {
  const { t } = useI18n();
  if (!branch) return null;

  const url = kioskUrl(branch.id, date);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('attendance.qrTitle')}</DialogTitle>
          <DialogDescription>
            {branch.name} · {date}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl border p-3">
            <QRCodeSVG value={url} size={230} level="M" marginSize={4} />
          </div>
          <p className="text-center text-sm text-muted-foreground">{t('attendance.qrHint')}</p>
          <p className="break-all text-center text-xs text-muted-foreground">{url}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}