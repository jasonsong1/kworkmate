import React, { useState } from 'react';
import { CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Unlink, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';

export default function XeroIntegrationCard({ company, onUpdated }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const isConnected = Boolean(company && company.xero_connected);
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

  // [Connect to Xero] 클릭 시 Xero 인증 페이지로 이동
  const handleConnect = async () => {
    if (!company) return;
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
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#13b5ea]/10 text-[#13b5ea]">
              <span className="text-lg font-black tracking-tighter">xero</span>
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Xero 회계 및 급여(Payroll) 연동
                {isConnected ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] font-semibold gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    연결됨
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">
                    미연동
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
            ) : (
              <Button
                size="sm"
                className="text-xs bg-[#13b5ea] hover:bg-[#0fa0cf] text-white font-semibold gap-1.5 shadow-sm"
                onClick={handleConnect}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                Connect to Xero
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
        ) : (
          <div className="rounded-xl border border-dashed p-4 bg-muted/20 space-y-2 text-muted-foreground">
            <div className="font-semibold text-foreground text-xs">Xero 1회 원클릭 연동 가이드</div>
            <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
              <li>상단의 <strong>[Connect to Xero]</strong> 파란색 버튼을 클릭합니다.</li>
              <li>Xero 로그인 창이 열리면 본인의 Xero 계정으로 로그인합니다.</li>
              <li>연동할 본인의 매장(Organization)을 선택하고 <strong>[Allow access]</strong>를 승인합니다.</li>
              <li>승인이 끝나면 KWorkMate로 자동 복귀되어 연동이 완료됩니다!</li>
            </ol>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
