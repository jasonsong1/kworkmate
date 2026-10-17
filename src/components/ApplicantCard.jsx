import React from 'react';
import { AlertTriangle, CheckCircle2, Eye, FileText } from 'lucide-react';
import AvailabilityTable from '@/components/AvailabilityTable';
import MiniInterviewPanel from '@/components/MiniInterviewPanel';
import VideoInterviewPanel from '@/components/VideoInterviewPanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { APPLICANT_STATUS, coverageDays, formatDateTime, noticePeriodLabel, visaLabel } from '@/lib/bh';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { videoInterviewAllowed } from '@/lib/packages';
import { useI18n, formatAiSummary } from '@/lib/i18n';

export default function ApplicantCard({ applicant, actions, onOpen, onViewResume }) {
  const { lang } = useI18n();
  const { pkg } = useWorkspace();
  const videoAllowed = videoInterviewAllowed(pkg);
  const meta = APPLICANT_STATUS[applicant.status] || APPLICANT_STATUS.submitted;
  const unreadable = applicant.analysis_status === 'unreadable';
  const pending = applicant.analysis_status === 'pending';
  const delayed =
    applicant.invited_at && !applicant.interview_confirmed_at &&
    Date.now() - new Date(applicant.invited_at).getTime() > 48 * 60 * 60 * 1000;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{applicant.full_name}</p>
            <Badge className={meta.tone}>{meta.label}</Badge>
            {typeof applicant.rank === 'number' && <Badge variant="outline">#{applicant.rank}</Badge>}
            {delayed && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                <AlertTriangle className="mr-1 h-3 w-3" /> Response delayed
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {applicant.email} · {applicant.phone || '—'} · Visa: {visaLabel(applicant.visa_type)}
          </p>
        </div>

        <div className="text-right">
          {pending ? (
            <Badge variant="secondary">AI analysing…</Badge>
          ) : (
            <div className="flex items-center justify-end gap-1 text-lg font-semibold">
              {unreadable ? (
                <span className="text-sm font-normal text-amber-700">Manual review</span>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  {applicant.ai_score ?? '—'}
                </>
              )}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">AI fit score</p>
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {(applicant.ai_summary || applicant.ai_notes) && (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground/90">
              {formatAiSummary(applicant.ai_summary || applicant.ai_notes, lang)}
            </p>
          )}

          {(applicant.ai_skills || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {(applicant.ai_skills || []).slice(0, 8).map((skill) => (
                <Badge key={skill} variant="secondary" className="font-normal">
                  {skill}
                </Badge>
              ))}
            </div>
          )}

          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>Notice period: {noticePeriodLabel(applicant.notice_period)}</span>
            <span>Visa expiry: {applicant.visa_expiry || '—'}</span>
            <span>Applied: {formatDateTime(applicant.created_date)}</span>
          </div>

          {unreadable && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              Text could not be extracted from this resume — open the original file to review it.
            </p>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Availability · {coverageDays(applicant.availability)}/7 days
          </p>
          <AvailabilityTable matrix={applicant.availability} />
        </div>
      </div>

      {(applicant.mini_interview_responses || []).length > 0 ||
      (videoAllowed && (applicant.video_interview_responses || []).length > 0) ? (
        <div className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-3">
          <MiniInterviewPanel responses={applicant.mini_interview_responses} />
          {videoAllowed && <VideoInterviewPanel responses={applicant.video_interview_responses} />}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={onOpen}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> Details
        </Button>
        <Button size="sm" variant="outline" onClick={onViewResume}>
          <FileText className="mr-1.5 h-3.5 w-3.5" /> Resume
        </Button>
        {actions}
      </div>
    </div>
  );
}