import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import AvailabilityTable from '@/components/AvailabilityTable';
import MiniInterviewPanel from '@/components/MiniInterviewPanel';
import { APPLICANT_STATUS, noticePeriodLabel, visaLabel } from '@/lib/bh';

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

export default function ApplicantDetailDialog({ applicant, open, onOpenChange }) {
  if (!applicant) return null;
  const meta = APPLICANT_STATUS[applicant.status] || APPLICANT_STATUS.submitted;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
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
          {applicant.ai_summary && (
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Summary
              </p>
              <p className="text-sm">{applicant.ai_summary}</p>
              {applicant.ai_notes && <p className="mt-2 text-xs text-muted-foreground">{applicant.ai_notes}</p>}
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