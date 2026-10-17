import React, { useEffect, useState, useMemo } from 'react';
import {
  FileText,
  Send,
  Download,
  Building2,
  DollarSign,
  Calendar,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  ExternalLink,
  ShieldCheck,
  Edit2,
  Save,
  Clock
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useWorkspace } from '@/lib/WorkspaceContext';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import {
  KWORKMATE_ISSUER,
  PLAN_PRICING,
  generateInvoiceNumber,
  downloadTaxInvoicePdf
} from '@/lib/taxInvoicePdf';

export default function Invoices() {
  const { isPlatformAdmin, loading: authLoading } = useWorkspace();
  const { toast } = useToast();

  const [companies, setCompanies] = useState([]);
  const [packages, setPackages] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 회사별 인보이스 이메일 편집 상태 { [companyId]: string }
  const [editingEmails, setEditingEmails] = useState({});
  const [savingEmailId, setSavingEmailId] = useState('');

  // 인보이스 발송 모달 상태
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [sendForm, setSendForm] = useState({
    invoice_email: '',
    plan_key: 'starter',
    subtotal: 99,
    notes: '',
    invoice_number: ''
  });
  const [sending, setSending] = useState(false);

  // 회사 및 패키지 데이터 로드
  const loadData = async () => {
    setLoading(true);
    try {
      const [compPage, pkgPage] = await Promise.all([
        base44.entities.Company.list({ limit: 200 }).catch(() => ({ items: [] })),
        base44.entities.PackageModule.list({ limit: 50 }).catch(() => ({ items: [] }))
      ]);

      const compList = (compPage && compPage.items) || compPage || [];
      setCompanies(compList);

      // 인보이스 이메일 초기화
      const emailMap = {};
      compList.forEach((c) => {
        emailMap[c.id] = c.invoice_email || c.contact_email || '';
      });
      setEditingEmails(emailMap);
    } catch (err) {
      toast({ title: '데이터를 불러오는 중 오류가 발생했습니다.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPlatformAdmin) {
      loadData();
    }
  }, [isPlatformAdmin]);

  // 슈퍼어드민 권한 체크
  if (!authLoading && !isPlatformAdmin) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground/60 mb-3" />
        <h2 className="text-xl font-semibold">슈퍼어드민 전용 화면</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          인보이스 관리 화면은 KWorkMate 최고 관리자만 접근할 수 있습니다.
        </p>
      </div>
    );
  }

  // 검색 필터링된 회사 목록
  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const abn = (c.abn || '').toLowerCase();
      const email = (c.invoice_email || c.contact_email || '').toLowerCase();
      const q = search.toLowerCase();
      return name.includes(q) || abn.includes(q) || email.includes(q);
    });
  }, [companies, search]);

  // 상단 통계 수치 계산
  const stats = useMemo(() => {
    const totalCount = companies.length;
    let totalMonthlyExGst = 0;
    let sentThisMonthCount = 0;
    const currentYm = new Date().toISOString().slice(0, 7); // YYYY-MM

    companies.forEach((c) => {
      const plan = PLAN_PRICING[c.pricing_package || 'starter'] || PLAN_PRICING.starter;
      totalMonthlyExGst += plan.monthlyExGst;

      if (c.last_invoice_sent_at && c.last_invoice_sent_at.startsWith(currentYm)) {
        sentThisMonthCount += 1;
      }
    });

    const totalGst = Math.round(totalMonthlyExGst * 0.1 * 100) / 100;
    const totalIncGst = totalMonthlyExGst + totalGst;

    return {
      totalCount,
      totalMonthlyExGst,
      totalIncGst,
      sentThisMonthCount
    };
  }, [companies]);

  // 인보이스 전용 이메일 단일 저장 핸들러
  const handleSaveEmail = async (companyId) => {
    const email = editingEmails[companyId] || '';
    if (!email) {
      toast({ title: '이메일 주소를 입력해주세요.', variant: 'destructive' });
      return;
    }
    setSavingEmailId(companyId);
    try {
      await base44.entities.Company.update(companyId, { invoice_email: email });
      toast({ title: '인보이스 전용 이메일이 저장되었습니다.' });
      setCompanies((prev) =>
        prev.map((c) => (c.id === companyId ? { ...c, invoice_email: email } : c))
      );
    } catch (err) {
      toast({ title: '이메일 저장 실패', variant: 'destructive' });
    } finally {
      setSavingEmailId('');
    }
  };

  // PDF 다운로드 핸들러
  const handleDownloadPdf = (company) => {
    const planKey = company.pricing_package || 'starter';
    const invNum = company.last_invoice_number || generateInvoiceNumber(company.id);
    downloadTaxInvoicePdf({
      company,
      invoiceNumber: invNum,
      issueDate: new Date().toISOString().slice(0, 10),
      planKey
    });
    toast({ title: `${company.name} Tax Invoice PDF가 다운로드되었습니다.` });
  };

  // 모달 열기 핸들러
  const handleOpenSendModal = (company) => {
    setSelectedCompany(company);
    const planKey = company.pricing_package || 'starter';
    const planInfo = PLAN_PRICING[planKey] || PLAN_PRICING.starter;
    const defaultEmail = company.invoice_email || company.contact_email || '';
    const invNum = generateInvoiceNumber(company.id);

    setSendForm({
      invoice_email: defaultEmail,
      plan_key: planKey,
      subtotal: planInfo.monthlyExGst,
      notes: '',
      invoice_number: invNum
    });
    setSendModalOpen(true);
  };

  // 인보이스 즉시 발송 핸들러
  const handleSendInvoice = async () => {
    if (!selectedCompany) return;
    if (!sendForm.invoice_email) {
      toast({ title: '수신인 이메일을 입력해주세요.', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      const planInfo = PLAN_PRICING[sendForm.plan_key] || PLAN_PRICING.starter;
      const res = await base44.functions.invoke('sendTaxInvoice', {
        company_id: selectedCompany.id,
        invoice_email: sendForm.invoice_email,
        invoice_number: sendForm.invoice_number,
        plan_key: sendForm.plan_key,
        plan_name: planInfo.name,
        subtotal: Number(sendForm.subtotal) || planInfo.monthlyExGst,
        notes: sendForm.notes
      });

      const data = res.data || {};
      if (data.error) {
        toast({ title: data.error, variant: 'destructive' });
        return;
      }

      toast({
        title: 'Tax Invoice가 성공적으로 발송되었습니다!',
        description: `${selectedCompany.name} (${sendForm.invoice_email}) 수신 완료`
      });

      setSendModalOpen(false);
      await loadData();
    } catch (err) {
      toast({
        title: (err && err.message) || '인보이스 발송 중 오류가 발생했습니다.',
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="인보이스 관리 (Invoices)"
        subtitle="고객사별 요금제 Tax Invoice 생성, 전용 이메일 등록 및 원클릭 발송 시스템"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              새로고침
            </Button>
          </div>
        }
      />

      {/* 1. 상단 통계 및 KWorkMate 공급자 정보 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">총 고객사 수</CardDescription>
            <CardTitle className="text-2xl font-bold">{stats.totalCount}개 사</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            KWorkMate 플랫폼 등록 기업
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">월 정기 청구 예상액 (excl. GST)</CardDescription>
            <CardTitle className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              ${stats.totalMonthlyExGst.toLocaleString()} AUD
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            GST 포함 시 ${stats.totalIncGst.toLocaleString()} AUD
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">이번 달 발송 완료 기업</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stats.sentThisMonthCount} / {stats.totalCount}개
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            이번 달 청구서 전송 완료율 {stats.totalCount > 0 ? Math.round((stats.sentThisMonthCount / stats.totalCount) * 100) : 0}%
          </CardContent>
        </Card>

        <Card className="bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              KWorkMate 공급자 세법 규격
            </CardDescription>
            <CardTitle className="text-sm font-medium">ABN: {KWORKMATE_ISSUER.abn}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs space-y-0.5 text-muted-foreground">
            <div>입금은행: CBA (BSB: {KWORKMATE_ISSUER.bsb})</div>
            <div>계좌번호: {KWORKMATE_ISSUER.accountNumber}</div>
            <div className="font-medium text-primary">호주 GST 10% 자동 계산</div>
          </CardContent>
        </Card>
      </div>

      {/* 2. 회사별 인보이스 관리 테이블 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg">고객사별 인보이스 목록</CardTitle>
              <CardDescription className="text-xs mt-1">
                회사별 인보이스 수신 전용 이메일을 등록하고, 이번 달 Tax Invoice를 PDF로 출력하거나 즉시 발송합니다.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="회사명, ABN, 이메일 검색..."
                className="pl-8 text-xs h-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-primary" />
              고객사 정보를 불러오는 중입니다...
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              등록된 고객사가 없거나 검색 결과가 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-t border-b bg-muted/40 text-xs font-semibold text-muted-foreground text-left">
                    <th className="py-3 px-4">고객사 (Company)</th>
                    <th className="py-3 px-4">구독 플랜</th>
                    <th className="py-3 px-4">월 청구액</th>
                    <th className="py-3 px-4 min-w-[280px]">인보이스 전용 이메일</th>
                    <th className="py-3 px-4">최근 발송 이력</th>
                    <th className="py-3 px-4 text-right">인보이스 액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs">
                  {filteredCompanies.map((company) => {
                    const planKey = company.pricing_package || 'starter';
                    const planInfo = PLAN_PRICING[planKey] || PLAN_PRICING.starter;
                    const subtotal = planInfo.monthlyExGst;
                    const gst = Math.round(subtotal * 0.1 * 100) / 100;
                    const total = subtotal + gst;

                    const lastSent = company.last_invoice_sent_at
                      ? new Date(company.last_invoice_sent_at).toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit'
                        })
                      : null;

                    return (
                      <tr key={company.id} className="hover:bg-muted/30 transition-colors">
                        {/* 1. 회사명 & ABN */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                            <Building2 className="h-4 w-4 text-primary shrink-0" />
                            {company.name || '미지정 회사'}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {company.abn ? `ABN: ${company.abn}` : 'ABN 미등록'}
                          </div>
                        </td>

                        {/* 2. 플랜 */}
                        <td className="py-3 px-4">
                          <Badge variant="outline" className="font-semibold capitalize">
                            {planInfo.name}
                          </Badge>
                        </td>

                        {/* 3. 월 청구액 */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">
                            ${total.toFixed(2)} AUD
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            공급가 ${subtotal} + GST ${gst}
                          </div>
                        </td>

                        {/* 4. 인보이스 전용 이메일 입력 및 저장 */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="email"
                              value={editingEmails[company.id] || ''}
                              onChange={(e) =>
                                setEditingEmails({ ...editingEmails, [company.id]: e.target.value })
                              }
                              placeholder="인보이스 수신 이메일 입력"
                              className="h-8 text-xs"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 shrink-0"
                              onClick={() => handleSaveEmail(company.id)}
                              disabled={savingEmailId === company.id}
                              title="이메일 저장"
                            >
                              {savingEmailId === company.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Save className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                              )}
                            </Button>
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <span>대표 이메일:</span>
                            <span className="truncate max-w-[180px]">{company.contact_email || '—'}</span>
                          </div>
                        </td>

                        {/* 5. 최근 발송 이력 */}
                        <td className="py-3 px-4">
                          {lastSent ? (
                            <div>
                              <div className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                <span>{lastSent}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {company.last_invoice_number || '완료'}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">발송 이력 없음</span>
                          )}
                        </td>

                        {/* 6. 액션 버튼 */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1"
                              onClick={() => handleDownloadPdf(company)}
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>PDF</span>
                            </Button>
                            <Button
                              size="sm"
                              className="h-8 text-xs gap-1 bg-primary text-primary-foreground"
                              onClick={() => handleOpenSendModal(company)}
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span>발송</span>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Tax Invoice 발송 다이얼로그 모달 */}
      <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tax Invoice 이메일 발송</DialogTitle>
            <DialogDescription className="text-xs">
              {selectedCompany?.name}에 공식 호주 세법 규격의 인보이스 이메일을 발송합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs py-2">
            <div>
              <Label className="text-xs">수신자 인보이스 이메일</Label>
              <Input
                type="email"
                value={sendForm.invoice_email}
                onChange={(e) => setSendForm({ ...sendForm, invoice_email: e.target.value })}
                className="mt-1 text-xs"
                placeholder="accounts@company.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">구독 플랜</Label>
                <Select
                  value={sendForm.plan_key}
                  onValueChange={(val) => {
                    const info = PLAN_PRICING[val] || PLAN_PRICING.starter;
                    setSendForm({ ...sendForm, plan_key: val, subtotal: info.monthlyExGst });
                  }}
                >
                  <SelectTrigger className="mt-1 text-xs h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PLAN_PRICING).map(([key, info]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        {info.name} (${info.monthlyExGst}/mo)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">공급가액 (AUD, excl. GST)</Label>
                <Input
                  type="number"
                  value={sendForm.subtotal}
                  onChange={(e) => setSendForm({ ...sendForm, subtotal: e.target.value })}
                  className="mt-1 text-xs h-9"
                />
              </div>
            </div>

            {/* 계산 요약 박스 */}
            <div className="rounded-lg bg-muted/50 p-3 space-y-1">
              <div className="flex justify-between text-muted-foreground">
                <span>공급가액 (Subtotal):</span>
                <span>${Number(sendForm.subtotal || 0).toFixed(2)} AUD</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>호주 GST (10%):</span>
                <span>${(Number(sendForm.subtotal || 0) * 0.1).toFixed(2)} AUD</span>
              </div>
              <div className="flex justify-between font-bold text-foreground text-sm pt-1 border-t">
                <span>총 청구액 (Total Due):</span>
                <span className="text-primary">
                  ${(Number(sendForm.subtotal || 0) * 1.1).toFixed(2)} AUD
                </span>
              </div>
            </div>

            <div>
              <Label className="text-xs">인보이스 번호 (Invoice No.)</Label>
              <Input
                value={sendForm.invoice_number}
                onChange={(e) => setSendForm({ ...sendForm, invoice_number: e.target.value })}
                className="mt-1 text-xs h-8"
              />
            </div>

            <div>
              <Label className="text-xs">추가 메모 (선택사항)</Label>
              <Input
                value={sendForm.notes}
                onChange={(e) => setSendForm({ ...sendForm, notes: e.target.value })}
                placeholder="예: 조기 납부 감사 할인 반영 등"
                className="mt-1 text-xs h-8"
              />
            </div>
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (selectedCompany) {
                  downloadTaxInvoicePdf({
                    company: selectedCompany,
                    invoiceNumber: sendForm.invoice_number,
                    planKey: sendForm.plan_key,
                    customAmount: Number(sendForm.subtotal)
                  });
                }
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              PDF 미리보기
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSendModalOpen(false)}
                disabled={sending}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSendInvoice}
                disabled={sending}
                className="gap-1.5 bg-primary"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                인보이스 이메일 발송
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
