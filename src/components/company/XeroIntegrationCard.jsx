import React, { useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  Unlink,
  AlertCircle,
  Lock,
  Unlock,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';

export default function XeroIntegrationCard({ company, onUpdated }) {
  const { isPlatformAdmin } = useWorkspace();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [addonToggling, setAddonToggling] = useState(false);

  // Xero 연결 여부 및 애드온 활성화 여부
  const isConnected = Boolean(company && company.xero_connected);
  const isAddonEnabled = Boolean(company && company.xero_addon_enabled);

  const tenantName = company?.xero_tenant_name || 'My Xero Organisation';
  const connectedAt = company?.xero_connected_at
    ? new Date(company.xero_connected_at).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    : null;
  const lastSyncAt = company?.xero_last_synced_at
    ? new Date(company.xero_last_synced_at).toLocaleString('ko-KR')
    : null;

  // 슈퍼어드민(나) 전용: Xero 애드온 활성화/비활성화 토글 핸들러
  const handleToggleAddon = async () => {
    if (!company) return;
    setAddonToggling(true);
    const nextState = !isAddonEnabled;

    try {
      await base44.entities.Company.update(company.id, {
        xero_addon_enabled: nextState,
        xero_addon_enabled_at: nextState ? new Date().toISOString() : null
      });

      toast({
        title: nextState ? 'Xero 애드온 활성화 완료 (월 $20)' : 'Xero 애드온 비활성화 완료',
        description: nextState
          ? `${company.name}의 Xero 연동 권한이 승인되었으며, 다음 인보이스에 $20이 자동 추가됩니다.`
          : `${company.name}의 Xero 연동 권한이 해제되었습니다.`
      });

      onUpdated && onUpdated();
    } catch (err) {
      toast({
        title: '애드온 권한 설정 실패',
        description: (err && err.message) || '애드온 설정 중 오류가 발생했습니다.',
        variant: 'destructive'
      });
    } finally {
      setAddonToggling(false);
    }
  };

  // [Connect to Xero] 클릭 시 Xero 인증 페이지로 이동
  const handleConnect = async () => {
    if (!company) return;
    if (!isAddonEnabled && !isPlatformAdmin) {
      toast({
        title: 'Xero 애드온 권한 필요',
        description: 'Xero 연동은 유료 애드온(월 $20) 서비스입니다. 관리자에게 활성화를 요청해 주세요.',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const res = await base44.functions.invoke('xeroAuth', {
        action: 'get_auth_url',
        company_id: company.id,
        origin: window.location.origin
      });

      const data = res.data || {};
      if (data.error) {
        toast({ title: data.error, variant: 'destructive' });
        return;
      }

      if (data.auth_url) {
        // Xero 공식 로그인 및 조직 권한 승인 페이지로 리다이렉트
        window.location.href = data.auth_url;
      }
    } catch (err) {
      toast({
        title: (err && err.message) || 'Xero 연결 URL 생성에 실패했습니다.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // [연동 해제] 클릭 시
  const handleDisconnect = async () => {
    if (!company) return;
    if (!window.confirm('정말 Xero 연동을 해제하시겠습니까? 해제 시 타임시트 자동 전송이 중단됩니다.')) return;

    setLoading(true);
    try {
      const res = await base44.functions.invoke('xeroAuth', {
        action: 'disconnect',
        company_id: company.id
      });
      const data = res.data || {};
      if (data.error) {
        toast({ title: data.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'Xero 연동이 해제되었습니다.' });
      onUpdated && onUpdated();
    } catch (err) {
      toast({ title: '연동 해제 실패', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border shadow-xs">
      {/* 1. 슈퍼어드민(대표님) 전용 애드온 권한 제어 바 (고객에게는 절대 보이지 않음) */}
      {isPlatformAdmin && (
        <div className="bg-indigo-50/80 dark:bg-indigo-950/40 border-b border-indigo-100 dark:border-indigo-900/60 px-5 py-3 rounded-t-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div>
              <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                [슈퍼어드민 전용 제어] Xero 연동 유료 애드온 (월 $20 AUD)
              </span>
              <p className="text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
                이 스위치를 켜주어야만 고객이 아래 [Connect to Xero]를 눌러 연동할 수 있으며, 인보이스에 $20이 자동 추가됩니다.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={isAddonEnabled ? 'destructive' : 'default'}
            className="h-7 text-xs gap-1 shrink-0 bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
            onClick={handleToggleAddon}
            disabled={addonToggling}
          >
            {addonToggling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : isAddonEnabled ? (
              <>
                <Lock className="h-3 w-3" />
                <span>애드온 권한 회수</span>
              </>
            ) : (
              <>
                <Unlock className="h-3 w-3" />
                <span>애드온 엑세스 열어주기 (+월 $20)</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* 2. 일반 고객 및 관리자 공통 카드 헤더 */}
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#13b5ea]/10 text-[#13b5ea]">
              <span className="text-lg font-black tracking-tighter">xero</span>
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <span>Xero 회계 및 급여(Payroll) 연동</span>
                {isConnected ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-semibold gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    연결됨
                  </Badge>
                ) : isAddonEnabled ? (
                  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 text-[10px] font-semibold gap-1">
                    <Sparkles className="h-3 w-3" />
                    애드온 활성 (월 $20)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px] gap-1">
                    <Lock className="h-2.5 w-2.5" />
                    유료 애드온
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                점주님의 Xero 계정을 연동하여 출퇴근 타임시트를 Xero Payroll로 원클릭 자동 전송합니다.
              </CardDescription>
            </div>
          </div>

          <div>
            {isConnected ? (
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                onClick={handleDisconnect}
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Unlink className="mr-1.5 h-3.5 w-3.5" />}
                연동 해제
              </Button>
            ) : isAddonEnabled || isPlatformAdmin ? (
              /* 슈퍼어드민이 애드온을 열어주었을 때 버튼 활성화 */
              <Button
                size="sm"
                className="text-xs bg-[#13b5ea] hover:bg-[#0fa0cf] text-white font-semibold gap-1.5 shadow-sm"
                onClick={handleConnect}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Connect to Xero
              </Button>
            ) : (
              /* 일반 고객에게 애드온이 닫혀 있을 때 잠금 표시 */
              <Button
                size="sm"
                variant="outline"
                className="text-xs text-muted-foreground bg-muted/30 cursor-not-allowed gap-1.5 border-dashed"
                disabled={true}
                title="관리자의 승인이 필요한 애드온 서비스입니다."
              >
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                Add-on 승인 대기중
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-0 text-xs">
        {isConnected ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/50 p-4 dark:bg-emerald-950/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">연결된 Xero 조직(Tenant):</span>
              <span className="font-bold text-foreground text-sm">{tenantName}</span>
            </div>
            {connectedAt && (
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>최초 연동일:</span>
                <span>{connectedAt}</span>
              </div>
            )}
            {lastSyncAt && (
              <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-emerald-500/20 pt-2">
                <span>최근 타임시트 전송일:</span>
                <span className="font-medium text-emerald-700 dark:text-emerald-300">{lastSyncAt}</span>
              </div>
            )}
            <p className="text-[11px] text-emerald-800 dark:text-emerald-200 mt-2">
              이제 [타임시트] 화면에서 <strong>[Xero로 직접 전송]</strong> 버튼을 누르면 승인된 출퇴근 시간이 Xero 계정으로 즉시 들어갑니다.
            </p>
          </div>
        ) : isAddonEnabled || isPlatformAdmin ? (
          <div className="rounded-xl border border-dashed p-4 bg-muted/20 space-y-2 text-muted-foreground">
            <div className="font-semibold text-foreground text-xs flex items-center gap-1.5 text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Xero 연동 권한이 승인되었습니다. 지금 계정을 연결해 보세요!
            </div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed mt-1">
              <li>상단의 <strong>[Connect to Xero]</strong> 파란색 버튼을 클릭합니다.</li>
              <li>Xero 로그인 창이 열리면 본인의 Xero 계정으로 로그인합니다.</li>
              <li>연동할 본인의 사업장 조직(Organization)을 선택하고 <strong>[Allow access]</strong>를 승인합니다.</li>
              <li>승인이 끝나면 KWorkMate로 자동 복귀되어 타임시트 자동 연동이 활성화됩니다!</li>
            </ol>
          </div>
        ) : (
          /* 애드온 미승인 상태의 일반 고객 안내 박스 */
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:bg-amber-950/20 dark:border-amber-800/60 space-y-2">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-xs">
              <Lock className="h-4 w-4" />
              <span>Xero 연동은 유료 애드온(Add-on) 전용 서비스입니다.</span>
            </div>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              Xero 직접 연동 기능(타임시트 원클릭 급여 전송)은 <strong>월 $20.00 AUD (excl. GST)</strong>의 애드온 요금제로 제공됩니다.
              서비스 이용을 원하실 경우 KWorkMate 관리자(<strong>billing@kworkmate.com</strong> 또는 고객센터)에게 문의해 주시면 즉시 권한을 승인해 드립니다.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
