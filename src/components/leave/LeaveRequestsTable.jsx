import React, { useState } from 'react';
import { Check, Flag, Paperclip, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { STATUS_KEYS, STATUS_TONES, hoursLabel, rangeLabel } from '@/lib/leave';
import { base44 } from '@/api/base44Client';

// The requests and what happened to them. A manager approves or declines here; declining asks
// for the reason the employee will read.
export default function LeaveRequestsTable({ requests, canManage, showEmployee, flagHours, onDecided }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [dialog, setDialog] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const decide = async (request, decision, text) => {
    setBusy(true);
    const response = await base44.functions.invoke('decideLeaveRequest', {
      request_id: request.id,
      decision,
      reason: text || ''
    });
    setBusy(false);
    if (response.data && response.data.error) {
      toast({ title: t('leave.decisionFailed'), variant: 'destructive' });
      return;
    }
    toast({ title: t('leave.decided') });
    setDialog(null);
    setReason('');
    onDecided && onDecided();
  };

  // A request long enough to matter for its leave type is called out in red, at the hours the
  // manager set for that type in the leave settings.
  const flagged = (request) => {
    const limit = Number((flagHours || {})[request.leave_type_key]) || 0;
    return limit > 0 && Number(request.hours) >= limit ? limit : 0;
  };

  const openCertificate = async (request) => {
    const signed = await base44.integrations.Core.CreateFileSignedUrl({
      file_uri: request.certificate_file_uri,
      expires_in: 300
    }).catch(() => null);
    if (signed && signed.signed_url) window.open(signed.signed_url, '_blank', 'noopener');
  };

  if (!requests || requests.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('leave.noRequests')}</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {showEmployee ? <TableHead>{t('common.employee')}</TableHead> : null}
              <TableHead>{t('leave.type')}</TableHead>
              <TableHead>{t('leave.dates')}</TableHead>
              <TableHead>{t('leave.hours')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">{t('common.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                {showEmployee ? (
                  <TableCell>
                    <p className="font-medium">{request.employee_name}</p>
                    <p className="text-xs text-muted-foreground">{request.employee_number || request.employee_email}</p>
                  </TableCell>
                ) : null}
                <TableCell>
                  <p className="text-sm">{request.leave_type_name}</p>
                  {request.reason ? <p className="text-xs text-muted-foreground">{request.reason}</p> : null}
                </TableCell>
                <TableCell className="text-sm">{rangeLabel(request)}</TableCell>
                <TableCell className="text-sm">
                  {flagged(request) ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 font-medium text-destructive"
                      title={t('leave.flagged').replace('{hours}', String(flagged(request)))}
                    >
                      <Flag className="h-3.5 w-3.5" />
                      {hoursLabel(request.hours)}
                    </span>
                  ) : (
                    hoursLabel(request.hours)
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={STATUS_TONES[request.status]}>{t(STATUS_KEYS[request.status] || 'leave.statusPending')}</Badge>
                  {request.status === 'rejected' && request.decision_reason ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">{request.decision_reason}</p>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {request.certificate_file_uri ? (
                      <Button variant="ghost" size="icon" title={t('leave.certificate')} onClick={() => openCertificate(request)}>
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    ) : null}
                    {canManage && request.status === 'pending' ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('leave.approve')}
                          onClick={() => decide(request, 'approve', '')}
                          disabled={busy}
                        >
                          <Check className="h-4 w-4 text-emerald-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('leave.reject')}
                          onClick={() => setDialog(request)}
                          disabled={busy}
                        >
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    ) : null}
                    {canManage && request.status === 'approved' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => decide(request, 'cancel', t('leave.cancelledByManager'))}
                        disabled={busy}
                      >
                        {t('leave.cancel')}
                      </Button>
                    ) : null}
                    {/* The person who asked can take the request back before it is decided. */}
                    {!canManage && !showEmployee && ['pending', 'approved'].includes(request.status) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => decide(request, 'cancel', t('leave.cancelledByEmployee'))}
                        disabled={busy}
                      >
                        {t('leave.cancel')}
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={Boolean(dialog)} onOpenChange={(next) => !next && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('leave.rejectTitle')}</DialogTitle>
          </DialogHeader>
          <div>
            <Label>{t('leave.decisionReason')}</Label>
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('common.optional')} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => decide(dialog, 'reject', reason)} disabled={busy}>
              {t('leave.reject')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}