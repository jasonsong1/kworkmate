import React, { useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Trash2, Upload, FileCheck, Shield } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useI18n } from '@/lib/i18n';
import { formatDateTime } from '@/lib/bh';
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
  const [uploading, setUploading] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const fileRef = useRef(null);

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

  const upload = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      const saved = await kwCall('kwSession', { action: 'add_document', file_uri, name: file.name });
      setDocs((saved && saved.docs) || docs);
      if (saved && saved.profile) setCurrentEmployee(saved.profile);
      toast({ title: t('employees.docUploaded') });
    } catch (error) {
      toast({ title: error.message || t('employees.docUploadFailed'), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const remove = async (doc) => {
    if (!doc || !doc.file_uri) return;
    setRemovingId(doc.file_uri);
    try {
      const saved = await kwCall('kwSession', { action: 'delete_document', file_uri: doc.file_uri });
      setDocs((saved && saved.docs) || docs.filter((item) => item.file_uri !== doc.file_uri));
      if (saved && saved.profile) setCurrentEmployee(saved.profile);
      toast({ title: t('employees.docDeleted') });
    } catch (error) {
      toast({ title: error.message || t('employees.docDeleteFailed'), variant: 'destructive' });
    } finally {
      setRemovingId(null);
    }
  };

  const isAtoDoc = (doc) => {
    if (!doc) return false;
    const name = String(doc.name || '').toLowerCase();
    const type = String(doc.type || '').toLowerCase();
    const docType = String(doc.doc_type || '').toLowerCase();
    return (
      docType.startsWith('ato_') ||
      type.startsWith('ato_') ||
      name.includes('nat 3092') ||
      name.includes('nat 13080') ||
      name.includes('tfn declaration') ||
      name.includes('superannuation standard choice')
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{t('employees.vault')} — {employee ? employee.full_name : ''}</span>
          </DialogTitle>
        </DialogHeader>

        {viaOwnRecord && (
          <div className="flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3">
            <p className="text-sm text-muted-foreground">{t('employees.docUploadHint')}</p>
            <Button
              size="sm"
              onClick={() => fileRef.current && fileRef.current.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <>
                  <Upload className="mr-2 h-3.5 w-3.5" /> {t('common.upload')}
                </>
              )}
            </Button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
              onChange={upload}
            />
          </div>
        )}

        {(currentEmployee || employee) && company && (
          <OnboardingStatusList
            profile={currentEmployee || employee}
            company={company}
            onOpen={openDoc}
            loadingUri={loadingId}
          />
        )}

        {(currentEmployee || employee) && <OnboardingDetails profile={currentEmployee || employee} company={company} />}

        {docs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('employees.noDocs')}</p>
        ) : (
          <div className="w-full divide-y rounded-lg border bg-card">
            {docs.map((doc, index) => {
              const ato = isAtoDoc(doc);
              return (
                <div key={`${doc.file_uri}-${index}`} className="flex items-center gap-3 px-4 py-3">
                  {ato ? (
                    <FileCheck className="h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium flex items-center gap-2">
                      <span>{doc.name || 'Document'}</span>
                      {ato && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                          <Shield className="h-2.5 w-2.5" /> ATO Official
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(doc.created_at)}</p>
                  </div>
                  <Badge variant={ato ? 'default' : 'secondary'} className={`shrink-0 capitalize ${ato ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}>
                    {ato ? 'ATO Form' : String(doc.type || 'file').replace(/_/g, ' ')}
                  </Badge>
                  <Button
                    size="sm"
                    variant={ato ? 'default' : 'outline'}
                    className={ato ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                    onClick={() => openDoc(doc)}
                    disabled={loadingId === doc.file_uri}
                  >
                    {loadingId === doc.file_uri ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      t('common.open')
                    )}
                  </Button>
                  {viaOwnRecord && (doc.uploaded_by === 'self' || doc.type === 'staff_upload') && !ato && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove(doc)}
                      disabled={removingId === doc.file_uri}
                      title={t('common.delete')}
                    >
                      {removingId === doc.file_uri ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}