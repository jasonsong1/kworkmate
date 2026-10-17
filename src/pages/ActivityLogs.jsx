// ============================================================
// ActivityLogs.jsx
// 목적: 각 브랜치 및 전사 사용자 활동/감사 로그(Activity Logs) 조회 및 디버깅 스크린
//
// - 슈퍼어드민은 프리셋 권한과 상관없이 언제나 전체 지점/로그를 자유롭게 열람 가능
// - 일반 직책은 플랫폼 관리에서 프리셋 권한(activity_logs)을 부여받은 경우에만 열람 가능
// - 디테일 로그(근태, 휴가, 직원, 회사설정)는 [상세 보기] 모달을 통해 변경 전/후 값 확인 가능
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  Clock,
  Eye,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  User,
  ArrowRight,
  FileText,
  Building,
  Timer,
  Users,
  Briefcase,
  UserSearch,
  CalendarDays,
  Settings,
  CalendarClock
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { usePermissions } from '@/lib/permissions';
import { todayIso } from '@/lib/bh';
import { formatTimeInZone, stateFromBranch } from '@/lib/holidays';
import { supabase } from '@/lib/supabaseClient';
import AccessDenied from '@/components/AccessDenied';

const ALL = 'all';

// 모듈별 뱃지 및 아이콘 헬퍼 (다국어 지원)
const MODULE_CONFIG = {
  attendance: { tKey: 'activity.modAttendance', icon: Timer, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  leave: { tKey: 'activity.modLeave', icon: CalendarDays, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  employees: { tKey: 'activity.modEmployees', icon: Users, color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  settings: { tKey: 'activity.modSettings', icon: Settings, color: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300' },
  branches: { tKey: 'activity.modBranches', icon: Building, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  jobs: { tKey: 'activity.modJobs', icon: Briefcase, color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300' },
  applicants: { tKey: 'activity.modApplicants', icon: UserSearch, color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300' },
  interviews: { tKey: 'activity.modInterviews', icon: CalendarClock, color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300' },
  roster: { tKey: 'activity.modRoster', icon: Calendar, color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300' },
};

// 액션 유형별 뱃지 헬퍼 (다국어 지원)
const ACTION_LABELS = {
  create: { tKey: 'activity.actCreate', variant: 'default' },
  update: { tKey: 'activity.actUpdate', variant: 'secondary' },
  delete: { tKey: 'activity.actDelete', variant: 'destructive' },
  approve: { tKey: 'activity.actApprove', variant: 'outline', className: 'border-emerald-500 text-emerald-700 dark:text-emerald-400' },
  reject: { tKey: 'activity.actReject', variant: 'outline', className: 'border-rose-500 text-rose-700 dark:text-rose-400' },
  clock_in: { tKey: 'activity.actClockIn', variant: 'secondary' },
  clock_out: { tKey: 'activity.actClockOut', variant: 'secondary' },
};

/**
 * 7일 전 날짜 문자열(YYYY-MM-DD)을 계산하는 도우미 함수
 */
function defaultStartDate() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export default function ActivityLogs() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { activeBranch, branches, isPlatformAdmin, isCompanyAdmin, hasModule, scopeOf } = useWorkspace();
  const { canEdit } = usePermissions();

  // 권한 체크: 슈퍼어드민(대표님) 또는 회사 관리자는 무조건 열람 가능
  // 일반 직책은 플랫폼 관리에서 activity_logs 권한이 부여된 경우에만 열람 가능
  const canAccess = isPlatformAdmin || isCompanyAdmin || hasModule('activity_logs');
  const branchScoped = !isPlatformAdmin && scopeOf('activity_logs') === 'branch';

  const branchState = stateFromBranch(activeBranch);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // 필터 상태
  const [selectedBranchId, setSelectedBranchId] = useState(activeBranch?.id || ALL);
  const [selectedModule, setSelectedModule] = useState(ALL);
  const [fromDate, setFromDate] = useState(defaultStartDate());
  const [toDate, setToDate] = useState(todayIso());
  const [searchUser, setSearchUser] = useState('');

  // 상세 모달 상태
  const [detailLog, setDetailLog] = useState(null);

  // 활성 브랜치가 변경될 때 필터 동기화
  useEffect(() => {
    if (activeBranch && branchScoped) {
      setSelectedBranchId(activeBranch.id);
    }
  }, [activeBranch, branchScoped]);

  // 로그 데이터 로딩 함수
  const loadLogs = useCallback(async () => {
    if (!canAccess) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (!supabase) {
        throw new Error('Supabase client is not initialized.');
      }

      let query = supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      // 1. 지점 필터
      if (branchScoped && activeBranch?.id) {
        query = query.eq('branch_id', activeBranch.id);
      } else if (selectedBranchId !== ALL) {
        query = query.eq('branch_id', selectedBranchId);
      }

      // 2. 모듈 필터
      if (selectedModule !== ALL) {
        query = query.eq('module', selectedModule);
      }

      // 3. 날짜 필터 (시작일 00:00:00 ~ 종료일 23:59:59)
      if (fromDate) {
        query = query.gte('created_at', `${fromDate}T00:00:00Z`);
      }
      if (toDate) {
        query = query.lte('created_at', `${toDate}T23:59:59Z`);
      }

      // 4. 유저 검색 필터
      if (searchUser.trim()) {
        const term = searchUser.trim();
        query = query.or(`actor_name.ilike.%${term}%,actor_email.ilike.%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setLogs(data || []);
    } catch (err) {
      console.error('[ActivityLogs] Failed to load activity logs:', err);
      toast({
        title: 'Error loading logs',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [canAccess, branchScoped, activeBranch, selectedBranchId, selectedModule, fromDate, toDate, searchUser, toast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  if (!canAccess) {
    return <AccessDenied />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('activity.title')}
        subtitle={
          isPlatformAdmin
            ? t('activity.subtitlePlatform')
            : t('activity.subtitleBranch').replace('{branch}', activeBranch?.name || 'Current Branch')
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            disabled={loading}
            className="h-9 gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('activity.refresh')}
          </Button>
        }
      />

      {/* 상단 검색 및 필터 바 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* 1. 지점 선택 (슈퍼어드민/전사 관리자 전용) */}
            {!branchScoped && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  {t('activity.filterBranch')}
                </label>
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder={t('activity.allBranches')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('activity.allBranches')}</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* 2. 모듈 선택 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t('activity.filterModule')}
              </label>
              <Select value={selectedModule} onValueChange={setSelectedModule}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder={t('activity.allModules')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('activity.allModules')}</SelectItem>
                  {Object.entries(MODULE_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {t(cfg.tKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 3. 날짜 범위 선택 */}
            <div className={!branchScoped ? '' : 'sm:col-span-2'}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t('attendance.reportRange')}
              </label>
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="h-9 text-xs flex-1"
                />
                <span className="text-muted-foreground text-xs shrink-0">→</span>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="h-9 text-xs flex-1"
                />
              </div>
            </div>

            {/* 4. 유저 검색 */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                {t('activity.searchActor')}
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder={t('activity.searchPlaceholder')}
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  className="h-9 pl-8 text-xs"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 로그 목록 테이블 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
              {t('activity.loading')}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-20 text-center">
              <FileText className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
              <p className="text-sm font-medium text-muted-foreground">{t('activity.emptyTitle')}</p>
              <p className="text-xs text-muted-foreground/80 mt-1">
                {t('activity.emptyDesc')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-36">{t('activity.thTime')}</TableHead>
                    <TableHead className="w-32">{t('common.branch')}</TableHead>
                    <TableHead className="w-44">{t('activity.thActor')}</TableHead>
                    <TableHead className="w-28">{t('activity.thModule')}</TableHead>
                    <TableHead className="w-24">{t('activity.thAction')}</TableHead>
                    <TableHead>{t('activity.thSummary')}</TableHead>
                    <TableHead className="w-20 text-right">{t('activity.thDetail')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => {
                    const modConfig = MODULE_CONFIG[log.module] || {
                      tKey: '',
                      label: log.module,
                      icon: FileText,
                      color: 'bg-muted text-muted-foreground',
                    };
                    const ModIcon = modConfig.icon;
                    const actionConfig = ACTION_LABELS[log.action] || { tKey: '', label: log.action, variant: 'secondary' };
                    const branchItem = branches.find((b) => b.id === log.branch_id);
                    const modLabel = modConfig.tKey ? t(modConfig.tKey) : (modConfig.label || log.module);
                    const actionLabel = actionConfig.tKey ? t(actionConfig.tKey) : (actionConfig.label || log.action);

                    return (
                      <TableRow key={log.id} className="hover:bg-muted/40 transition-colors">
                        {/* 일시 */}
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatTimeInZone(log.created_at, branchState)}
                        </TableCell>

                        {/* 지점 */}
                        <TableCell className="text-xs whitespace-nowrap">
                          {branchItem ? (
                            <span className="font-medium text-foreground">{branchItem.name}</span>
                          ) : log.branch_id ? (
                            <span className="text-muted-foreground">{log.branch_id.slice(0, 8)}</span>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">{t('activity.scopeCompany')}</Badge>
                          )}
                        </TableCell>

                        {/* 작업자 */}
                        <TableCell>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">
                              {log.actor_name || log.actor_email}
                            </p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {log.actor_email}
                              {log.preset_key ? ` · ${log.preset_key}` : ''}
                            </p>
                          </div>
                        </TableCell>

                        {/* 모듈 */}
                        <TableCell>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${modConfig.color}`}
                          >
                            <ModIcon className="h-3 w-3" />
                            {modLabel}
                          </span>
                        </TableCell>

                        {/* 액션 */}
                        <TableCell>
                          <Badge
                            variant={actionConfig.variant}
                            className={`text-[11px] ${actionConfig.className || ''}`}
                          >
                            {actionLabel}
                          </Badge>
                        </TableCell>

                        {/* 작업 요약 설명 */}
                        <TableCell>
                          <p className="text-xs font-medium text-foreground leading-relaxed line-clamp-2">
                            {log.summary}
                          </p>
                        </TableCell>

                        {/* 상세 보기 버튼 */}
                        <TableCell className="text-right">
                          {log.details ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={() => setDetailLog(log)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                              {t('activity.viewDetail')}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 상세 변경 내역 비교 모달 */}
      <Dialog open={Boolean(detailLog)} onOpenChange={(open) => !open && setDetailLog(null)}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              {t('activity.diffModalTitle')}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {detailLog?.created_at && formatTimeInZone(detailLog.created_at, branchState)} ·{' '}
              {detailLog?.actor_name} ({detailLog?.actor_email})
            </DialogDescription>
          </DialogHeader>

          {detailLog && (
            <div className="space-y-4 py-2">
              {/* 요약 박스 */}
              <div className="p-3 bg-muted/50 rounded-lg border text-xs space-y-1">
                <p className="font-semibold text-foreground">{detailLog.summary}</p>
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground pt-1">
                  <span>{t('activity.thModule')}: <b>{MODULE_CONFIG[detailLog.module]?.tKey ? t(MODULE_CONFIG[detailLog.module].tKey) : detailLog.module}</b></span>
                  <span>·</span>
                  <span>{t('activity.thAction')}: <b>{ACTION_LABELS[detailLog.action]?.tKey ? t(ACTION_LABELS[detailLog.action].tKey) : detailLog.action}</b></span>
                  {detailLog.target_name && (
                    <>
                      <span>·</span>
                      <span>Target: <b>{detailLog.target_name}</b></span>
                    </>
                  )}
                </div>
              </div>

              {/* 사유 (Reason) 표시 */}
              {detailLog.details?.reason && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-xs">
                  <p className="font-semibold text-amber-900 dark:text-amber-300 mb-0.5">{t('activity.reasonLabel')}</p>
                  <p className="text-amber-800 dark:text-amber-200">{detailLog.details.reason}</p>
                </div>
              )}

              {/* 변경 전 (Before) vs 변경 후 (After) 비교 뷰어 */}
              {(detailLog.details?.before || detailLog.details?.after) ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* 변경 전 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-400">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      {t('activity.diffBefore')}
                    </div>
                    <pre className="p-3 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto text-rose-950 dark:text-rose-200 min-h-[120px]">
                      {detailLog.details.before
                        ? JSON.stringify(detailLog.details.before, null, 2)
                        : t('activity.noBefore')}
                    </pre>
                  </div>

                  {/* 변경 후 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      {t('activity.diffAfter')}
                    </div>
                    <pre className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto text-emerald-950 dark:text-emerald-200 min-h-[120px]">
                      {detailLog.details.after
                        ? JSON.stringify(detailLog.details.after, null, 2)
                        : JSON.stringify(detailLog.details, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                /* 단순 JSON 뷰어 */
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">{t('activity.jsonData')}</p>
                  <pre className="p-3 rounded-lg bg-muted text-[11px] font-mono whitespace-pre-wrap overflow-x-auto text-foreground">
                    {JSON.stringify(detailLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
