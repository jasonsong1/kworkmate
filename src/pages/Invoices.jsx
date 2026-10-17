import React, { useEffect, useState, useMemo } from 'react';
import {
  Send,
  Download,
  Building2,
  Loader2,
  Search,
  ShieldCheck,
  Save,
  Clock,
  History,
  Check,
  RotateCcw,
  Receipt
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
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import {
  PLAN_PRICING,
  XERO_ADDON_PRICE,
  generateInvoiceNumber,
  downloadTaxInvoicePdf
} from '@/lib/taxInvoicePdf';

export default function Invoices() {
  const { isPlatformAdmin, loading: authLoading } = useWorkspace();
  const { t, lang } = useI18n();
  const { toast } = useToast();

  const [companies, setCompanies] = useState([]);
  const [invoices, setInvoices] = useState([]); // 전체 인보이스 이력 목록
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // 회사별 인보이스 이메일 편집 상태 { [companyId]: string }
  const [editingEmails, setEditingEmails] = useState({});
  const [savingEmailId, setSavingEmailId] = useState('');

  // 1. 이번 달 인보이스 발송 모달 상태
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

  // 2. 지난 인보이스 내역 및 수금 관리 모달 상태
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyCompany, setHistoryCompany] = useState(null);
  const [updatingInvoiceId, setUpdatingInvoiceId] = useState('');

  // 날짜 로케일 선택 (한국어 모드: ko-KR, 영어 모드: en-AU)
  const dateLocale = lang === 'ko' ? 'ko-KR' : 'en-AU';

  // 데이터 로드 (활성 회사 목록 및 인보이스 이력)
  const loadData = async () => {
    setLoading(true);
    try {
      const [compPage, invPage] = await Promise.all([
        base44.entities.Company.list({ limit: 200 }).catch(() => ({ items: [] })),
        base44.entities.Invoice.list({ limit: 500, sort: '-created_at' }).catch(() => ({ items: [] }))
      ]);

      const compList = (compPage && compPage.items) || compPage || [];
      const invList = (invPage && invPage.items) || invPage || [];

      // 현재 Active(활성)한 회사만 필터링 (비활성화 deactivated !== true 및 inactive 제외)
      const activeCompanies = compList.filter(
        (c) => c.deactivated !== true && c.is_active !== false && c.status !== 'inactive'
      );

      setCompanies(activeCompanies);
      setInvoices(invList);

      // 인보이스 이메일 기본값 초기화
      const emailMap = {};
      activeCompanies.forEach((c) => {
        emailMap[c.id] = c.invoice_email || c.contact_email || '';
      });
      setEditingEmails(emailMap);
    } catch (err) {
      toast({ title: t('common.loadingError') || 'Error loading data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isPlatformAdmin) {
      loadData();
    }
  }, [isPlatformAdmin]);

  // 검색 필터링된 활성 회사 목록
  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const name = (c.name || '').toLowerCase();
      const abn = (c.abn || '').toLowerCase();
      const email = (c.invoice_email || c.contact_email || '').toLowerCase();
      const q = search.toLowerCase();
      return name.includes(q) || abn.includes(q) || email.includes(q);
    });
  }, [companies, search]);

  // 회사별 인보이스 목록 매핑
  const invoicesByCompany = useMemo(() => {
    const map = {};
    invoices.forEach((inv) => {
      if (!map[inv.company_id]) map[inv.company_id] = [];
      map[inv.company_id].push(inv);
    });
    return map;
  }, [invoices]);

  // 상단 통계 수치 계산 (Xero 애드온 $20 자동 합산)
  const stats = useMemo(() => {
    const totalCount = companies.length;
    let totalMonthlyExGst = 0;
    let sentThisMonthCount = 0;
    let xeroAddonCount = 0;
    const currentYm = new Date().toISOString().slice(0, 7); // YYYY-MM

    companies.forEach((c) => {
      const plan = PLAN_PRICING[c.pricing_package || 'starter'] || PLAN_PRICING.starter;
      const xeroAddon = c.xero_addon_enabled ? XERO_ADDON_PRICE : 0;
      if (c.xero_addon_enabled) xeroAddonCount += 1;

      totalMonthlyExGst += plan.monthlyExGst + xeroAddon;

      if (c.last_invoice_sent_at && c.last_invoice_sent_at.startsWith(currentYm)) {
        sentThisMonthCount += 1;
      }
    });

    const totalGst = Math.round(totalMonthlyExGst * 0.1 * 100) / 100;
    const totalIncGst = totalMonthlyExGst + totalGst;

    // 인보이스 수금(Paid) 통계
    let totalPaidAmount = 0;
    let totalUnpaidAmount = 0;
    invoices.forEach((inv) => {
      const amt = Number(inv.total_amount) || 0;
      if (inv.status === 'paid') {
        totalPaidAmount += amt;
      } else {
        totalUnpaidAmount += amt;
      }
    });

    return {
      totalCount,
      totalMonthlyExGst,
      totalIncGst,
      sentThisMonthCount,
      xeroAddonCount,
      totalPaidAmount,
      totalUnpaidAmount
    };
  }, [companies, invoices]);

  // 슈퍼어드민 권한 체크 (모든 React Hook 호출 이후에 조건부 렌더링을 수행하여 Hook 규칙 준수)
  if (!authLoading && !isPlatformAdmin) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground/60 mb-3" />
        <h2 className="text-xl font-semibold">{t('invoice.superAdminOnly')}</h2>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          {t('invoice.superAdminOnlyDesc')}
        </p>
      </div>
    );
  }

  // 인보이스 전용 이메일 단일 저장 핸들러
  const handleSaveEmail = async (companyId) => {
    const email = (editingEmails[companyId] || '').trim();
    if (!email) {
      toast({ title: t('common.required'), variant: 'destructive' });
      return;
    }
    setSavingEmailId(companyId);
    try {
      await base44.entities.Company.update(companyId, { invoice_email: email });
      toast({
        title: t('invoice.emailSaved'),
        description: email
      });
      setCompanies((prev) =>
        prev.map((c) => (c.id === companyId ? { ...c, invoice_email: email } : c))
      );
    } catch (err) {
      console.error('이메일 저장 실패:', err);
      toast({
        title: (err && err.message) || 'Error saving email',
        variant: 'destructive'
      });
    } finally {
      setSavingEmailId('');
    }
  };

  // PDF 다운로드 핸들러 (Xero 애드온 $20 자동 반영)
  const handleDownloadPdf = (company, invoiceRecord = null) => {
    if (invoiceRecord) {
      downloadTaxInvoicePdf({
        company,
        invoiceNumber: invoiceRecord.invoice_number,
        issueDate: invoiceRecord.issue_date,
        planKey: invoiceRecord.plan_key || 'starter',
        customAmount: Number(invoiceRecord.subtotal)
      });
      toast({ title: `${company.name} (${invoiceRecord.invoice_number}) PDF ${t('common.download')}` });
    } else {
      const planKey = company.pricing_package || 'starter';
      const planInfo = PLAN_PRICING[planKey] || PLAN_PRICING.starter;
      const xeroAddon = company.xero_addon_enabled ? XERO_ADDON_PRICE : 0;
      const calculatedSubtotal = planInfo.monthlyExGst + xeroAddon;

      const invNum = company.last_invoice_number || generateInvoiceNumber(company.id);
      downloadTaxInvoicePdf({
        company,
        invoiceNumber: invNum,
        issueDate: new Date().toISOString().slice(0, 10),
        planKey,
        customAmount: calculatedSubtotal,
        notes: company.xero_addon_enabled ? 'Includes Xero Payroll Integration Add-on ($20.00 AUD)' : ''
      });
      toast({ title: `${company.name} Tax Invoice PDF ${t('common.download')}` });
    }
  };

  // 인보이스 발송 모달 열기 핸들러 (Xero 애드온 자동 합산)
  const handleOpenSendModal = (company) => {
    setSelectedCompany(company);
    const planKey = company.pricing_package || 'starter';
    const planInfo = PLAN_PRICING[planKey] || PLAN_PRICING.starter;
    const defaultEmail = company.invoice_email || company.contact_email || '';
    const invNum = generateInvoiceNumber(company.id);

    const xeroAddon = company.xero_addon_enabled ? XERO_ADDON_PRICE : 0;
    const initialSubtotal = planInfo.monthlyExGst + xeroAddon;
    const initialNotes = company.xero_addon_enabled
      ? `KWorkMate ${planInfo.name} Plan ($${planInfo.monthlyExGst}) + Xero Integration Add-on ($${XERO_ADDON_PRICE}.00 AUD)`
      : '';

    setSendForm({
      invoice_email: defaultEmail,
      plan_key: planKey,
      subtotal: initialSubtotal,
      notes: initialNotes,
      invoice_number: invNum
    });
    setSendModalOpen(true);
  };

  // 지난 인보이스 내역 모달 열기
  const handleOpenHistoryModal = (company) => {
    setHistoryCompany(company);
    setHistoryModalOpen(true);
  };

  // 인보이스 수금(Paid / Unpaid) 매뉴얼 상태 토글 핸들러
  // invoice 객체 직접 전달 또는 company 및 최근 인보이스 번호 기반 처리 모두 지원
  const handleTogglePaymentStatus = async (targetInvoice, company = null) => {
    // 1. invoice 레코드가 아직 DB에 없으나 회사의 last_invoice_number가 있는 경우 자동 생성 후 Paid 처리
    if (!targetInvoice && company && company.last_invoice_number) {
      setUpdatingInvoiceId(company.id);
      try {
        const planKey = company.pricing_package || 'starter';
        const planInfo = PLAN_PRICING[planKey] || PLAN_PRICING.starter;
        const xeroAddon = company.xero_addon_enabled ? XERO_ADDON_PRICE : 0;
        const subtotal = planInfo.monthlyExGst + xeroAddon;
        const gst = Math.round(subtotal * 0.1 * 100) / 100;
        const total = subtotal + gst;

        const created = await base44.entities.Invoice.create({
          company_id: company.id,
          invoice_number: company.last_invoice_number,
          issue_date: (company.last_invoice_sent_at || new Date().toISOString()).slice(0, 10),
          due_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          plan_key: planKey,
          plan_name: planInfo.name,
          subtotal,
          gst,
          total_amount: Number(company.last_invoice_amount) || total,
          recipient_email: company.invoice_email || company.contact_email || '',
          notes: company.xero_addon_enabled ? 'Xero Integration Add-on Included' : '',
          status: 'paid',
          paid_at: new Date().toISOString()
        });

        if (created) {
          setInvoices((prev) => [created, ...prev]);
        }
        toast({
          title: t('invoice.markPaid') || '입금 확인 완료 (Paid)',
          description: `${company.name} (${company.last_invoice_number})`
        });
      } catch (err) {
        toast({
          title: (err && err.message) || 'Error updating payment status',
          variant: 'destructive'
        });
      } finally {
        setUpdatingInvoiceId('');
      }
      return;
    }

    if (!targetInvoice) return;

    setUpdatingInvoiceId(targetInvoice.id);
    const isNowPaid = targetInvoice.status === 'paid';
    const nextStatus = isNowPaid ? 'unpaid' : 'paid';
    const nextPaidAt = isNowPaid ? null : new Date().toISOString();

    try {
      await base44.entities.Invoice.update(targetInvoice.id, {
        status: nextStatus,
        paid_at: nextPaidAt
      });

      // 로컬 state 즉시 반영
      setInvoices((prev) =>
        prev.map((inv) =>
          inv.id === targetInvoice.id ? { ...inv, status: nextStatus, paid_at: nextPaidAt } : inv
        )
      );

      toast({
        title: nextStatus === 'paid' ? (t('invoice.markPaid') || '입금 확인 완료') : (t('invoice.markUnpaid') || '미납 처리 완료'),
        description: `${targetInvoice.invoice_number}`
      });
    } catch (err) {
      toast({
        title: (err && err.message) || 'Error updating payment status',
        variant: 'destructive'
      });
    } finally {
      setUpdatingInvoiceId('');
    }
  };

  // 인보이스 즉시 발송 핸들러
  const handleSendInvoice = async () => {
    if (!selectedCompany) return;
    if (!sendForm.invoice_email) {
      toast({ title: t('common.required'), variant: 'destructive' });
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
        title: t('invoice.sendSuccess'),
        description: `${selectedCompany.name} (${sendForm.invoice_email})`
      });

      setSendModalOpen(false);
      await loadData();
    } catch (err) {
      toast({
        title: (err && err.message) || 'Error sending invoice',
        variant: 'destructive'
      });
    } finally {
      setSending(false);
    }
  };

  // 현재 선택된 회사의 인보이스 내역
  const currentCompanyInvoices = historyCompany ? (invoicesByCompany[historyCompany.id] || []) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('invoice.title')}
        subtitle={t('invoice.subtitle')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              {t('invoice.refresh')}
            </Button>
          </div>
        }
      />

      {/* 1. 상단 통계 카드 (3개 구성) */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-primary">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{t('invoice.activeClients')}</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {stats.totalCount}{lang === 'ko' ? '개 사' : ' companies'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t('invoice.activeClientsDesc')} (Xero Add-on: {stats.xeroAddonCount})
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{t('invoice.monthlyBilling')}</CardDescription>
            <CardTitle className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              ${stats.totalMonthlyExGst.toLocaleString()} AUD
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t('invoice.monthlyBillingGst')}: ${stats.totalIncGst.toLocaleString()} AUD
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">{t('invoice.paidAmount')}</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              ${stats.totalPaidAmount.toLocaleString()} AUD
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {t('invoice.unpaidAmount')}: ${stats.totalUnpaidAmount.toLocaleString()} AUD
          </CardContent>
        </Card>
      </div>

      {/* 2. 활성 고객사별 인보이스 관리 테이블 */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <span>{t('invoice.clientListTitle')}</span>
                <Badge variant="secondary" className="text-xs font-normal">Active Only</Badge>
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                {t('invoice.clientListDesc')}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('invoice.searchPlaceholder')}
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
              {t('invoice.loading')}
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {t('invoice.noCompanies')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-t border-b bg-muted/40 text-xs font-semibold text-muted-foreground text-left">
                    <th className="py-3 px-4">{t('invoice.thCompany')}</th>
                    <th className="py-3 px-4">{t('invoice.thPlan')}</th>
                    <th className="py-3 px-4">{t('invoice.thAmount')} (AUD)</th>
                    <th className="py-3 px-4 min-w-[260px]">{t('invoice.thEmail')}</th>
                    <th className="py-3 px-4">{t('invoice.thRecent')}</th>
                    <th className="py-3 px-4 text-right">{t('invoice.thActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-xs">
                  {filteredCompanies.map((company) => {
                    const planKey = company.pricing_package || 'starter';
                    const planInfo = PLAN_PRICING[planKey] || PLAN_PRICING.starter;
                    const hasXeroAddon = Boolean(company.xero_addon_enabled);
                    const addonAmount = hasXeroAddon ? XERO_ADDON_PRICE : 0;

                    // 공급가 = 플랜 기본가 + Xero 애드온가
                    const subtotal = planInfo.monthlyExGst + addonAmount;
                    const gst = Math.round(subtotal * 0.1 * 100) / 100;
                    const total = subtotal + gst;

                    const companyInvs = invoicesByCompany[company.id] || [];
                    const invCount = companyInvs.length;
                    const latestInv = companyInvs[0];

                    const lastSent = company.last_invoice_sent_at
                      ? new Date(company.last_invoice_sent_at).toLocaleDateString(dateLocale, {
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
                            {company.name || (lang === 'ko' ? '미지정 회사' : 'Unnamed Company')}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {company.abn ? `ABN: ${company.abn}` : t('invoice.noAbn')}
                          </div>
                        </td>

                        {/* 2. 플랜 & Xero 연동 표시 (버튼 대신 글자로만 표시) */}
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="font-semibold capitalize">
                              {planInfo.name}
                            </Badge>
                            {hasXeroAddon && (
                              <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                {lang === 'en' ? 'Xero Integration' : 'Xero 연동'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3. 월 청구액 */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-foreground">
                            ${total.toFixed(2)} AUD
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            ${subtotal} + GST ${gst}
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
                              placeholder="accounts@company.com"
                              className="h-8 text-xs"
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 shrink-0 hover:bg-primary/10"
                              onClick={() => handleSaveEmail(company.id)}
                              disabled={savingEmailId === company.id}
                              title={t('common.save')}
                            >
                              {savingEmailId === company.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                              ) : (
                                <Save className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                              )}
                            </Button>
                          </div>
                        </td>

                        {/* 5. 최근 인보이스 (우측 관리 액션 열에 입금확인 버튼이 있으므로 여기서는 인보이스 정보만 단정하게 표시) */}
                        <td className="py-3 px-4">
                          {(() => {
                            const targetInv = latestInv || (company.last_invoice_number ? {
                              id: 'legacy_' + company.id,
                              invoice_number: company.last_invoice_number,
                              status: 'unpaid',
                              issue_date: lastSent || '',
                              total_amount: company.last_invoice_amount || total
                            } : null);

                            if (!targetInv) {
                              return <span className="text-muted-foreground">{t('invoice.noHistory')}</span>;
                            }

                            return (
                              <div>
                                <div className="font-medium text-foreground">
                                  <span className="font-mono text-xs font-bold">{targetInv.invoice_number}</span>
                                </div>
                                <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
                                  <span>{targetInv.issue_date || lastSent}</span>
                                  {targetInv.total_amount ? <span>(${Number(targetInv.total_amount).toFixed(2)})</span> : null}
                                </div>
                              </div>
                            );
                          })()}
                        </td>

                        {/* 6. 액션 버튼 */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* 최근 인보이스 수금 상태 텍스트 (버튼 대신 글자로만 표시, 변경은 [내역] 모달에서 진행) */}
                            {(() => {
                              const targetInv = latestInv || (company.last_invoice_number ? {
                                id: 'legacy_' + company.id,
                                invoice_number: company.last_invoice_number,
                                status: 'unpaid'
                              } : null);

                              if (!targetInv) return null;

                              const isPaid = targetInv.status === 'paid';
                              if (isPaid) {
                                return (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                                    <span>{t('invoice.paidBadge') || '완납'}</span>
                                  </span>
                                );
                              }

                              return (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                  <Clock className="h-3.5 w-3.5 text-amber-600" />
                                  <span>{t('invoice.unpaidBadge') || '미납'}</span>
                                </span>
                              );
                            })()}

                            {/* 지난 인보이스 내역 모달 열기 버튼 */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300"
                              onClick={() => handleOpenHistoryModal(company)}
                            >
                              <History className="h-3.5 w-3.5" />
                              <span>{t('invoice.historyBtn')} ({invCount})</span>
                            </Button>

                            {/* 이번 달 PDF 즉시 다운로드 */}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs gap-1"
                              onClick={() => handleDownloadPdf(company)}
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>{t('invoice.pdfBtn')}</span>
                            </Button>

                            {/* 이번 달 인보이스 발송 */}
                            <Button
                              size="sm"
                              className="h-8 text-xs gap-1 bg-primary text-primary-foreground"
                              onClick={() => handleOpenSendModal(company)}
                            >
                              <Send className="h-3.5 w-3.5" />
                              <span>{t('invoice.sendBtn')}</span>
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

      {/* 3. 지난 인보이스 내역 & 수금 체크 모달 */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <span>{historyCompany?.name} {t('invoice.historyTitle')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {t('invoice.historyDesc')}
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {currentCompanyInvoices.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground border rounded-lg bg-muted/20">
                <Receipt className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                {t('invoice.noInvoicesYet')}
              </div>
            ) : (
              <div className="max-h-[380px] overflow-y-auto border rounded-lg">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-muted/90 backdrop-blur z-10 border-b">
                    <tr className="text-muted-foreground text-left">
                      <th className="py-2.5 px-3">{t('invoice.thIssueDate')}</th>
                      <th className="py-2.5 px-3">{t('invoice.thInvNumber')}</th>
                      <th className="py-2.5 px-3">{t('invoice.thSubtotalGst')}</th>
                      <th className="py-2.5 px-3">{t('invoice.thStatus')}</th>
                      <th className="py-2.5 px-3 text-right">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {currentCompanyInvoices.map((inv) => {
                      const isPaid = inv.status === 'paid';
                      const isUpdating = updatingInvoiceId === inv.id;
                      const paidDateStr = inv.paid_at
                        ? new Date(inv.paid_at).toLocaleDateString(dateLocale, {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                          })
                        : null;

                      return (
                        <tr key={inv.id} className="hover:bg-muted/30">
                          {/* 발행일 */}
                          <td className="py-3 px-3 font-medium text-foreground">
                            {inv.issue_date}
                          </td>

                          {/* 인보이스 번호 & 수신 이메일 */}
                          <td className="py-3 px-3">
                            <div className="font-semibold text-primary">{inv.invoice_number}</div>
                            {inv.recipient_email && (
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                {inv.recipient_email}
                              </div>
                            )}
                          </td>

                          {/* 플랜 & 금액 */}
                          <td className="py-3 px-3">
                            <div className="font-bold text-foreground">
                              ${Number(inv.total_amount).toFixed(2)} AUD
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              Subtotal ${Number(inv.subtotal).toFixed(2)} + GST ${Number(inv.gst).toFixed(2)}
                            </div>
                          </td>

                          {/* 수금 상태 (Paid vs Unpaid) */}
                          <td className="py-3 px-3">
                            {isPaid ? (
                              <div>
                                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[11px] gap-1">
                                  <Check className="h-3 w-3" /> {t('invoice.paidBadge')}
                                </Badge>
                                {paidDateStr && (
                                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                                    {paidDateStr}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 font-medium text-[11px] gap-1">
                                  <Clock className="h-3 w-3" /> {t('invoice.unpaidBadge')}
                                </Badge>
                              </div>
                            )}
                          </td>

                          {/* 액션 (입금 상태 토글 & PDF 다운로드) */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* 입금 확인 토글 버튼 */}
                              <Button
                                size="sm"
                                variant={isPaid ? 'ghost' : 'default'}
                                className={`h-7 px-2 text-xs gap-1 ${
                                  isPaid
                                    ? 'text-muted-foreground hover:text-amber-700'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                }`}
                                onClick={() => handleTogglePaymentStatus(inv)}
                                disabled={isUpdating}
                              >
                                {isUpdating ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : isPaid ? (
                                  <>
                                    <RotateCcw className="h-3 w-3" />
                                    <span>{t('invoice.markUnpaid')}</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="h-3 w-3" />
                                    <span>{t('invoice.markPaid')}</span>
                                  </>
                                )}
                              </Button>

                              {/* PDF 다운로드 버튼 */}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs gap-1"
                                onClick={() => handleDownloadPdf(historyCompany, inv)}
                                title={t('common.download')}
                              >
                                <Download className="h-3 w-3" />
                                <span>{t('invoice.pdfBtn')}</span>
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
          </div>

          <DialogFooter className="sm:justify-between">
            <div className="text-[11px] text-muted-foreground">
              {t('invoice.totalRecords').replace('{count}', String(currentCompanyInvoices.length))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setHistoryModalOpen(false)}
            >
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Tax Invoice 발송 다이얼로그 모달 */}
      <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('invoice.sendModalTitle')}</DialogTitle>
            <DialogDescription className="text-xs">
              {t('invoice.sendModalDesc').replace('{company}', selectedCompany?.name || '')}
              {selectedCompany?.xero_addon_enabled && (
                <span className="block mt-1 text-primary font-medium">
                  * Xero Integration Add-on ($20.00 AUD) included
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs py-2">
            <div>
              <Label className="text-xs">{t('invoice.sendModalRecipient')}</Label>
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
                <Label className="text-xs">{t('invoice.sendModalPlan')}</Label>
                <Select
                  value={sendForm.plan_key}
                  onValueChange={(val) => {
                    const info = PLAN_PRICING[val] || PLAN_PRICING.starter;
                    const addon = selectedCompany?.xero_addon_enabled ? XERO_ADDON_PRICE : 0;
                    setSendForm({ ...sendForm, plan_key: val, subtotal: info.monthlyExGst + addon });
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
                <Label className="text-xs">
                  {t('invoice.sendModalSubtotal')}
                  {selectedCompany?.xero_addon_enabled && <span className="text-primary font-bold ml-1">(+Xero $20)</span>}
                </Label>
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
                <span>Subtotal (excl. GST):</span>
                <span>${Number(sendForm.subtotal || 0).toFixed(2)} AUD</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>GST (10%):</span>
                <span>${(Number(sendForm.subtotal || 0) * 0.1).toFixed(2)} AUD</span>
              </div>
              <div className="flex justify-between font-bold text-foreground text-sm pt-1 border-t">
                <span>Total Due (incl. GST):</span>
                <span className="text-primary">
                  ${(Number(sendForm.subtotal || 0) * 1.1).toFixed(2)} AUD
                </span>
              </div>
            </div>

            <div>
              <Label className="text-xs">{t('invoice.thInvNumber')}</Label>
              <Input
                value={sendForm.invoice_number}
                onChange={(e) => setSendForm({ ...sendForm, invoice_number: e.target.value })}
                className="mt-1 text-xs h-8"
              />
            </div>

            <div>
              <Label className="text-xs">{t('invoice.sendModalNotes')}</Label>
              <Input
                value={sendForm.notes}
                onChange={(e) => setSendForm({ ...sendForm, notes: e.target.value })}
                placeholder="e.g. Early payment discount applied"
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
                    customAmount: Number(sendForm.subtotal),
                    notes: sendForm.notes
                  });
                }
              }}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {t('invoice.sendModalPreview')}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSendModalOpen(false)}
                disabled={sending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSendInvoice}
                disabled={sending}
                className="gap-1.5 bg-primary"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {t('invoice.sendModalSubmit')}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
