import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Upload, PenTool } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';
import { kwActive, kwCall, kwIdentity } from '@/lib/kwAuthClient';
import { useWorkspace } from '@/lib/WorkspaceContext';
import OnboardingStatusList from '@/components/employee/OnboardingStatusList';
import OnboardingDetails from '@/components/employee/OnboardingDetails';
import EmployerSignatureDialog from '@/components/company/EmployerSignatureDialog';
import { stampEmployerSignatureOnTfnPdf } from '@/lib/atoPdfEngine';
import { saveCompanySettings } from '@/lib/companySettings';

export default function EmployeeDocumentsDialog({ open, onOpenChange, employee }) {
  const { t } = useI18n();
  const { company, patchCompany } = useWorkspace();
  const { toast } = useToast();
  const [loadingId, setLoadingId] = useState(null);
  const [docs, setDocs] = useState([]);
  const [currentEmployee, setCurrentEmployee] = useState(employee);

  // 고용주 실시간 서명 날인 상태
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [signTargetDoc, setSignTargetDoc] = useState(null);
  const [stamping, setStamping] = useState(false);

  useEffect(() => {
    setCurrentEmployee(employee);
    setDocs((employee && employee.docs) || []);

    if (open && employee && employee.id) {
      base44.entities.EmployeeProfile.get(employee.id)
        .then((fresh) => {
          if (fresh) {
            setCurrentEmployee(fresh);
            setDocs(fresh.docs || []);
          }
        })
        .catch(() => null);
    }
  }, [open, employee]);

  const identity = kwIdentity();
  const viaOwnRecord = Boolean(kwActive() && identity && employee && identity.email === employee.user_email);

  // 온보딩 서류 열람 핸들러 (관리자 및 직원 모두 안전하고 확실하게 service_role 기반 URL 발급)
  const openDoc = async (doc) => {
    if (!doc || !doc.file_uri) return;
    setLoadingId(doc.file_uri);
    try {
      let signedUrl = '';
      // 1. Edge Function(kwSession sign_document)을 통해 service_role 권한으로 안전하게 서명 URL 발급 시도
      try {
        const res = await kwCall('kwSession', { action: 'sign_document', file_uri: doc.file_uri });
        if (res && res.signed_url) signedUrl = res.signed_url;
      } catch (err) {
        console.warn('[openDoc] kwSession fallback to client SDK:', err);
      }

      // 2. 만약 안 되면 클라이언트 SDK를 통해 직접 서명 URL 발급 시도
      if (!signedUrl) {
        const clientRes = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: doc.file_uri });
        if (clientRes && clientRes.signed_url) signedUrl = clientRes.signed_url;
      }

      if (signedUrl) {
        window.open(signedUrl, '_blank', 'noopener');
      } else {
        throw new Error(t('employees.docOpenFailed') || '문서 다운로드 링크를 생성할 수 없습니다.');
      }
    } catch (error) {
      toast({ title: error.message || t('employees.docOpenFailed'), variant: 'destructive' });
    } finally {
      setLoadingId(null);
    }
  };

  // 고용주 서명 날인 시작
  const handleSignTfn = (doc) => {
    setSignTargetDoc(doc);
    setSigDialogOpen(true);
  };

  // 실제 PDF에 고용주 서명 날인 및 업데이트 수행
  const executeStampTfn = async (signatureDataUrl) => {
    if (!signTargetDoc || !signTargetDoc.file_uri || !currentEmployee) return;
    setStamping(true);
    const targetUri = signTargetDoc.file_uri;
    setLoadingId(targetUri);
    try {
      // 1. 기존 원본 PDF 다운로드 (kwSession 1차 시도 -> client SDK 2차 시도)
      let signedUrl = '';
      try {
        const res = await kwCall('kwSession', { action: 'sign_document', file_uri: targetUri });
        if (res && res.signed_url) signedUrl = res.signed_url;
      } catch (_) {}
      if (!signedUrl) {
        const signed = await base44.integrations.Core.CreateFileSignedUrl({ file_uri: targetUri });
        if (signed && signed.signed_url) signedUrl = signed.signed_url;
      }
      if (!signedUrl) throw new Error('PDF 다운로드 URL을 가져오지 못했습니다.');
      const resp = await fetch(signedUrl);
      const pdfBytes = new Uint8Array(await resp.arrayBuffer());

      // 2. 고용주 서명 및 오늘 날짜 날인 (호주 국세청 규격 박스)
      const stampedPdfBytes = await stampEmployerSignatureOnTfnPdf(pdfBytes, signatureDataUrl);

      // 3. 서명 완료된 새 PDF를 비공개 스토리지에 업로드
      const fileName = `TFN_Declaration_NAT3092_${currentEmployee.employee_number || 'staff'}_signed.pdf`;
      const blob = new Blob([stampedPdfBytes], { type: 'application/pdf' });
      const fileObj = new File([blob], fileName, { type: 'application/pdf' });
      const uploaded = await base44.integrations.Core.UploadPrivateFile({ file: fileObj });
      if (!uploaded || !uploaded.file_uri) throw new Error('서명된 PDF 업로드에 실패했습니다.');

      // 4. 사원의 docs 배열 업데이트
      const oldDocs = currentEmployee.docs || [];
      const updatedDocs = oldDocs.map((d) => {
        if (d.file_uri === targetUri || d.type === 'ato_tfn' || d.doc_type === 'ato_tfn') {
          return {
            ...d,
            file_uri: uploaded.file_uri,
            url: uploaded.file_uri,
            signed_by_employer: true,
            employer_signed_at: new Date().toISOString()
          };
        }
        return d;
      });

      await base44.entities.EmployeeProfile.update(currentEmployee.id, { docs: updatedDocs });
      setCurrentEmployee((prev) => ({ ...prev, docs: updatedDocs }));

      // 5. 회사설정에도 이 공식 서명이 아직 없다면 자동 영구 저장
      if (company && !company.tfn_employer_signature) {
        await saveCompanySettings(company.id, { tfn_employer_signature: signatureDataUrl }).catch(() => null);
        if (patchCompany) patchCompany({ tfn_employer_signature: signatureDataUrl });
      }

      toast({ title: '호주 국세청(ATO) 세무 서식에 고용주 공식 서명이 성공적으로 날인되었습니다!' });
    } catch (err) {
      console.error('[EmployeeDocumentsDialog] stamp error:', err);
      toast({ variant: 'destructive', title: '서명 날인 실패: ' + (err.message || '') });
    } finally {
      setStamping(false);
      setLoadingId(null);
      setSignTargetDoc(null);
      setSigDialogOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto overflow-x-hidden w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{t('employees.vault')} — {employee ? employee.full_name : ''}</span>
          </DialogTitle>
        </DialogHeader>

        {/* 1. 온보딩 서류 및 추가 제출 서류를 단일 통합 목록으로 표시 (하단 중복 제거 완료) */}
        {(currentEmployee || employee) && company && (
          <OnboardingStatusList
            profile={currentEmployee || employee}
            company={company}
            onOpen={openDoc}
            onSignTfn={handleSignTfn}
            loadingUri={loadingId}
          />
        )}

        {/* 2. 온보딩 질문 상세 답변 (아코디언) */}
        {(currentEmployee || employee) && <OnboardingDetails profile={currentEmployee || employee} company={company} />}

        {/* 고용주 공식 서명 날인 다이얼로그 */}
        <EmployerSignatureDialog
          open={sigDialogOpen}
          onOpenChange={(v) => {
            if (!stamping) {
              setSigDialogOpen(v);
              if (!v) setSignTargetDoc(null);
            }
          }}
          initialSignature={(company && company.tfn_employer_signature) || ''}
          onSave={executeStampTfn}
        />
      </DialogContent>
    </Dialog>
  );
}