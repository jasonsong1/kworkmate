import React, { useState } from 'react';
import { Loader2, MailCheck, MailWarning, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import AvailabilityTable from '@/components/AvailabilityTable';
import MiniInterviewPanel from '@/components/MiniInterviewPanel';
import VideoInterviewPanel from '@/components/VideoInterviewPanel';
import { useI18n, formatAiSummary } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { videoInterviewAllowed } from '@/lib/packages';
import { APPLICANT_STATUS, formatDateTime, noticePeriodLabel, visaLabel } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

const ROWS = [
  ['Email', (a) => a.email],
  ['Phone', (a) => a.phone],
  ['Visa type', (a) => visaLabel(a.visa_type)],
  ['Visa expiry', (a) => a.visa_expiry],
  ['Notice period', (a) => noticePeriodLabel(a.notice_period)],
  ['Emergency contact', (a) => a.emergency_contact_name],
  ['Emergency phone', (a) => a.emergency_contact_phone],
  ['Resume file', (a) => a.resume_filename],
  ['Interview booked', (a) => a.interview_confirmed_at],
  ['Onboarding', (a) => a.onboarding_status]
];

// Which email was last sent, so it can be identified and sent again if it did not arrive.
const EMAIL_TYPE_LABELS = {
  applied: 'email.stage.applied',
  mini: 'email.stage.mini',
  video: 'email.stage.video',
  invite: 'email.stage.invite',
  booked: 'email.stage.booked',
  hired: 'email.stage.hired',
  rejection: 'email.stage.rejected'
};

export default function ApplicantDetailDialog({ applicant, open, onOpenChange, onResent }) {
  const { t, lang } = useI18n();
  const { toast } = useToast();
  const { pkg } = useWorkspace();
  const videoAllowed = videoInterviewAllowed(pkg);
  const [resending, setResending] = useState(false);
  if (!applicant) return null;
  const meta = APPLICANT_STATUS[applicant.status] || APPLICANT_STATUS.submitted;
  const emailStatus = applicant.email_status || 'none';
  const emailType = applicant.email_type || '';

  const resend = async () => {
    setResending(true);
    try {
      const response = await base44.functions.invoke('notifyApplicant', {
        applicant_id: applicant.id,
        type: emailType || 'application_received',
        origin: window.location.origin,
        resend: true
      });
      if (response.data?.error) throw new Error(response.data.error);
      if (response.data?.sent === false) {
        toast({ title: t('applicants.resendFailed'), variant: 'destructive' });
      } else {
        toast({ title: t('applicants.resendSent') });
      }
      onResent && onResent();
    } catch (error) {
      toast({ title: error.message || t('applicants.resendFailed'), variant: 'destructive' });
    } finally {
      setResending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {applicant.full_name}
            <Badge className={meta.tone}>{meta.label}</Badge>
            {typeof applicant.ai_score === 'number' && (
              <Badge variant="outline">Fit rate {applicant.ai_score}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {(applicant.ai_summary || applicant.ai_notes) && (
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {lang === 'en' ? 'Summary' : 'AI 이력서 요약'}
              </p>
              <p className="text-sm">{formatAiSummary(applicant.ai_summary || applicant.ai_notes, lang)}</p>
              {applicant.ai_summary && applicant.ai_notes && (
                <p className="mt-2 text-xs text-muted-foreground">{applicant.ai_notes}</p>
              )}
            </div>
          )}

          {(applicant.ai_flags || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(applicant.ai_flags || []).map((flag) => (
                <Badge key={flag} variant="secondary" className="font-normal">
                  {flag}
                </Badge>
              ))}
            </div>
          )}

          <div className="rounded-lg border px-3 py-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('applicants.emailStatus')}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {emailStatus === 'sent' ? (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                      <MailCheck className="mr-1 h-3 w-3" /> {t('applicants.emailSent')}
                    </Badge>
                  ) : emailStatus === 'failed' ? (
                    <Badge variant="destructive">
                      <MailWarning className="mr-1 h-3 w-3" /> {t('applicants.emailFailed')}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">{t('applicants.emailNone')}</span>
                  )}
                  {emailType ? (
                    <span className="text-sm">{t(EMAIL_TYPE_LABELS[emailType] || 'applicants.emailStatus')}</span>
                  ) : null}
                  {applicant.email_attempted_at ? (
                    <span className="text-xs text-muted-foreground">{formatDateTime(applicant.email_attempted_at)}</span>
                  ) : null}
                </div>
                {emailStatus === 'failed' && applicant.email_error ? (
                  <p className="mt-1 text-xs text-destructive">{applicant.email_error}</p>
                ) : null}
              </div>

              {emailType ? (
                <Button size="sm" variant="outline" onClick={resend} disabled={resending}>
                  {resending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t('applicants.resend')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {ROWS.map(([label, getter]) => {
              const value = getter(applicant);
              if (!value) return null;
              return (
                <div key={label}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm">{String(value)}</p>
                </div>
              );
            })}
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Weekly availability
            </p>
            <AvailabilityTable matrix={applicant.availability} />
          </div>

          <MiniInterviewPanel responses={applicant.mini_interview_responses} />

          {videoAllowed && <VideoInterviewPanel responses={applicant.video_interview_responses} />}

          {(applicant.answers || []).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Employer questions
              </p>
              {(applicant.answers || []).map((answer, index) => (
                <div key={`${answer.question}-${index}`} className="rounded-lg border px-3 py-2">
                  <p className="text-xs text-muted-foreground">{answer.question}</p>
                  <p className="text-sm">{answer.answer}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}