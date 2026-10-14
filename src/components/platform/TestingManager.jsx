import React, { useEffect, useState } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

// How many applicants one press adds.
const BATCH = 15;

// Test data only: the platform owner fills a job with dummy applicants so screening, interviews
// and hiring can be walked through without entering each applicant by hand.
export default function TestingManager() {
  const { t } = useI18n();
  const { branches, activeBranch } = useWorkspace();
  const { toast } = useToast();
  const [branchId, setBranchId] = useState('');
  const [jobs, setJobs] = useState([]);
  const [counts, setCounts] = useState({});
  const [busy, setBusy] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);

  // The branch the workspace is working in is the default, and any other store can be chosen.
  useEffect(() => {
    setBranchId(activeBranch ? activeBranch.id : '');
  }, [activeBranch]);

  useEffect(() => {
    if (!branchId) {
      setJobs([]);
      return;
    }
    let cancelled = false;
    base44.entities.Job
      .filter({ branch_id: branchId }, { sort: '-created_date', limit: 100 })
      .then((page) => {
        if (!cancelled) setJobs((page.items || []).filter((job) => job.status === 'open'));
      })
      .catch(() => {
        if (!cancelled) setJobs([]);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  const loadCounts = async (list) => {
    const totals = await Promise.all(
      list.map((job) => base44.entities.Applicant.count({ job_id: job.id }).catch(() => 0))
    );
    setCounts(Object.fromEntries(list.map((job, index) => [job.id, totals[index]])));
  };

  const selectedBranch = branches.find((b) => b.id === branchId) || activeBranch;

  const seed = async (job) => {
    setBusy(true);
    try {
      const response = await base44.functions.invoke('seedTestApplicants', {
        job_id: job.id,
        branch_id: branchId
      });
      if (response.data?.error) throw new Error(response.data.error);
      toast({
        title: `[${selectedBranch ? selectedBranch.name : '선택 지점'}] ${job.title} 공고에 더미 지원자 ${response.data.created || BATCH}명이 생성되었습니다. (총 ${response.data.total || 0}명)`
      });
      await loadCounts(jobs);
      setPickOpen(false);
    } catch (error) {
      toast({ title: error.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!branchId) {
      toast({ title: t('testing.noBranch'), variant: 'destructive' });
      return;
    }
    if (jobs.length === 0) {
      toast({ title: '선택하신 지점에 활성화된 공고가 없습니다.', variant: 'destructive' });
      return;
    }
    // 공고 선택 모달 오픈
    setPickOpen(true);
    await loadCounts(jobs);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-primary" /> {t('testing.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">{t('testing.subtitle')}</p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64">
            <Label className="mb-1 block text-xs">{t('testing.branch')}</Label>
            <Select value={branchId} onValueChange={(val) => {
              setBranchId(val);
              setCounts({});
            }}>
              <SelectTrigger>
                <SelectValue placeholder={t('testing.pickBranch')} />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={start} disabled={busy || !branchId}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {busy ? t('testing.creating') : t('testing.create').replace('{count}', String(BATCH))}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">{t('testing.hint')}</p>
      </CardContent>

      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>어느 공고에 지원자를 추가할까요?</DialogTitle>
            <DialogDescription>
              선택한 지점 <strong>[{selectedBranch ? selectedBranch.name : '선택 지점'}]</strong>의 지정된 공고에만 지원자 {BATCH}명이 추가됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y rounded-lg border">
            {jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => seed(job)}
                disabled={busy}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-muted disabled:opacity-50 transition-colors"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{job.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {[job.position, `지원자 ${counts[job.id] ?? '...'}명`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                {busy ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : (
                  <span className="text-xs font-semibold text-primary">+ 15명 추가</span>
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}