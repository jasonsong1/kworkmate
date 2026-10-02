import React, { useEffect, useState } from 'react';
import PageHeader from '@/components/PageHeader';
import PosterStudio from '@/components/PosterStudio';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

export default function PosterDesign() {
  const { t } = useI18n();
  const { company, activeBranch } = useWorkspace();
  const [jobs, setJobs] = useState(null);
  const [jobId, setJobId] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!activeBranch) {
        setJobs([]);
        return;
      }
      const page = await base44.entities.Job.filter(
        { branch_id: activeBranch.id },
        { sort: '-created_date', limit: 50 }
      );
      const items = page.items || [];
      setJobs(items);
      setJobId(items[0] ? items[0].id : '');
    };
    load();
  }, [activeBranch]);

  const job = (jobs || []).find((item) => item.id === jobId) || null;
  const patchJob = (next) => setJobs((prev) => prev.map((item) => (item.id === next.id ? { ...item, ...next } : item)));

  if (!jobs) return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;

  return (
    <div>
      <PageHeader title={t('poster.title')} subtitle={t('poster.subtitle')} />
      {jobs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">{t('poster.noJobs')}</CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="max-w-sm">
            <Label>{t('poster.pickJob')}</Label>
            <Select value={jobId} onValueChange={setJobId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {job && (
            <PosterStudio
              job={job}
              branch={activeBranch}
              company={company}
              applyUrl={`${window.location.origin}/apply/${job.id}`}
              onJobChange={patchJob}
            />
          )}
        </div>
      )}
    </div>
  );
}