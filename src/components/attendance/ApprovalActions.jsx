import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useI18n } from '@/lib/i18n';

// Manual kiosk punches stay pending until a manager accepts them here.
export default function ApprovalActions({ row, onDecide }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const status = row.approval_status || 'approved';

  if (status === 'approved') {
    return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">{t('attendance.approved')}</Badge>;
  }
  if (status === 'rejected') {
    return <Badge variant="destructive">{t('attendance.rejected')}</Badge>;
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" onClick={() => onDecide(row, 'approved')}>
        <Check className="mr-1 h-3.5 w-3.5" /> {t('attendance.approve')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <X className="mr-1 h-3.5 w-3.5" /> {t('attendance.reject')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('attendance.reject')}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t('attendance.rejectReason')}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setOpen(false);
                onDecide(row, 'rejected', reason);
                setReason('');
              }}
            >
              {t('attendance.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}