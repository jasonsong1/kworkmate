import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';
import { kwActive, kwCall, kwIdentity } from '@/lib/kwAuthClient';
import { useWorkspace } from '@/lib/WorkspaceContext';
import OnboardingStatusList from '@/components/employee/OnboardingStatusList';
import OnboardingDetails from '@/components/employee/OnboardingDetails';

export default function EmployeeDocumentsDialog({ open, onOpenChange, employee }) {
  const { t } = useI18n();
  const { company } = useWorkspace();
  const { toast } = useToast();
  const [loadingId, setLoadingId] = useState(null);
  const [docs, setDocs] = useState([]);

  const [currentEmployee, setCurrentEmployee] = useState(employee);

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

  const openDoc = async (doc) => {
    if (!doc || !doc.file_uri) return;
    setLoadingId(doc.file_uri);
    try {
      const signed = viaOwnRecord
        ? await kwCall('kwSession', { action: 'sign_document', file_uri: doc.file_uri })
        : await base44.integrations.Core.CreateFileSignedUrl({ file_uri: doc.file_uri });
      if (signed && signed.signed_url) window.open(signed.signed_url, '_blank', 'noopener');
    } catch (error) {
      toast({ title: error.message || t('employees.docOpenFailed'), variant: 'destructive' });
    } finally {
      setLoadingId(null);
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
            loadingUri={loadingId}
          />
        )}

        {/* 2. 온보딩 질문 상세 답변 (아코디언) */}
        {(currentEmployee || employee) && <OnboardingDetails profile={currentEmployee || employee} company={company} />}
      </DialogContent>
    </Dialog>
  );
}