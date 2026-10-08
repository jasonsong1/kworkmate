import React, { useEffect, useState } from 'react';
import { Loader2, Mic, Save } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import InterviewQuestionEditor from '@/components/InterviewQuestionEditor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { videoInterviewAllowed } from '@/lib/packages';
import { DEFAULT_INTERVIEW_QUESTIONS } from '@/lib/bh';
import { base44 } from '@/api/base44Client';

export default function InterviewSettings() {
  const { t } = useI18n();
  const { company, reload, role, pkg } = useWorkspace();
  const videoAllowed = videoInterviewAllowed(pkg);
  const { toast } = useToast();
  const [questions, setQuestions] = useState([]);
  const [videoQuestions, setVideoQuestions] = useState([]);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!company) return;
    setQuestions(
      Array.isArray(company.interview_questions) && company.interview_questions.length > 0
        ? company.interview_questions
        : DEFAULT_INTERVIEW_QUESTIONS
    );
    setVideoQuestions(
      Array.isArray(company.video_interview_questions) && company.video_interview_questions.length > 0
        ? company.video_interview_questions
        : DEFAULT_INTERVIEW_QUESTIONS
    );
    setVideoEnabled(company.video_interview_enabled !== false);
    setReady(true);
  }, [company]);

  const save = async () => {
    if (!company) return;
    setSaving(true);
    await base44.entities.Company.update(company.id, {
      interview_questions: questions,
      video_interview_questions: videoQuestions,
      video_interview_enabled: videoEnabled
    });
    await reload();
    setSaving(false);
    toast({ title: t('interview.saved') });
  };

  if (!ready) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;

  return (
    <div>
      <PageHeader
        title={t('interview.title')}
        subtitle={t('interview.subtitle')}
        actions={
          <Button onClick={save} disabled={saving || role !== 'company_admin'}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t('common.save')}
          </Button>
        }
      />

      <div className={`grid gap-6 ${videoAllowed ? 'lg:grid-cols-2' : ''}`}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic className="h-4 w-4" /> {t('interview.mini')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">{t('interview.miniHint')}</p>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm font-semibold">{t('interview.questions')}</p>
            <InterviewQuestionEditor questions={questions} onChange={setQuestions} />
          </CardContent>
        </Card>

        {videoAllowed && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('interview.video')}</CardTitle>
              <p className="text-xs text-muted-foreground">{t('interview.videoHint')}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border px-4 py-3">
                <span className="text-sm">{t('settings.videoInterview')}</span>
                <Switch checked={videoEnabled} onCheckedChange={setVideoEnabled} />
              </div>
              <div>
                <p className="mb-3 text-sm font-semibold">{t('interview.questions')}</p>
                <InterviewQuestionEditor questions={videoQuestions} onChange={setVideoQuestions} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}